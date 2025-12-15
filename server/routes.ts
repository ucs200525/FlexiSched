import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { 
  insertStudentSchema, 
  insertFacultySchema, 
  insertCourseSchema, 
  insertRoomSchema,
  insertTimetableSchema,
  insertTimetableSlotSchema,
  loginSchema,
  courseRegistrationSchema,
  courseSlotSelectionSchema
} from "@shared/schema";
import { generateTimetableWithAI, detectConflicts } from "./services/scheduler";
import { aiEngineClient } from "./ai_integration";

// Simple session store for demo purposes (in production, use proper session management)
const userSessions = new Map<string, { userId: string; role: string; username: string; name: string; email: string; timestamp: number }>();

// Authentication middleware
const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  const token = authHeader.substring(7);
  const session = userSessions.get(token);
  
  if (!session) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }
  
  // Check if session is expired (24 hours)
  if (Date.now() - session.timestamp > 24 * 60 * 60 * 1000) {
    userSessions.delete(token);
    return res.status(401).json({ error: 'Session expired' });
  }
  
  // Attach user info to request
  (req as any).user = session;
  next();
};

// Role-based authorization middleware
const requireRole = (allowedRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;
    
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    if (!allowedRoles.includes(user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    
    next();
  };
};

export async function registerRoutes(app: Express): Promise<Server> {
  // Authentication endpoint
  app.post("/api/auth/login", async (req, res) => {
    try {
      // Validate request body with Zod
      const validatedData = loginSchema.parse(req.body);
      const { username, password, role } = validatedData;
      
      let authenticatedUser = null;
      
      // Try to authenticate from database first
      if (role === 'student') {
        // Check if username is studentId or email
        let student = await storage.getStudentByStudentId(username);
        
        // If not found by studentId, search by email
        if (!student) {
          const allStudents = await storage.getStudents();
          student = allStudents.find(s => s.email === username);
        }
        
        if (student && student.isActive) {
          // Simple password verification (in production, use proper bcrypt comparison)
          const isValidPassword = student.password === `hashed_${password}` || student.plainPassword === password;
          
          if (isValidPassword) {
            authenticatedUser = {
              id: student.id,
              username: student.studentId,
              name: `${student.firstName} ${student.lastName}`,
              role: 'student',
              email: student.email
            };
          }
        }
      } else if (role === 'faculty') {
        // Check if username is facultyId or email
        const faculty = await storage.getFacultyByFacultyId(username) || 
                       (await storage.getFaculty()).find(f => f.email === username);
        
        if (faculty && faculty.isActive) {
          // Simple password verification (in production, use proper bcrypt comparison)
          const isValidPassword = faculty.password === `hashed_${password}` || faculty.plainPassword === password;
          
          if (isValidPassword) {
            authenticatedUser = {
              id: faculty.id,
              username: faculty.facultyId,
              name: `${faculty.firstName} ${faculty.lastName}`,
              role: 'faculty',
              email: faculty.email
            };
          }
        }
      }
      
      // Fallback to demo credentials if database authentication failed
      if (!authenticatedUser) {
        const demoCredentials = {
          admin: { username: "admin", password: "admin123", name: "Administrator", email: "admin@timetable.ai" },
          faculty: { username: "faculty", password: "faculty123", name: "Dr. Faculty Member", email: "faculty@timetable.ai" },
          student: { username: "student", password: "student123", name: "Student User", email: "student@timetable.ai" }
        };
        
        const demo = demoCredentials[role];
        
        if (demo && username === demo.username && password === demo.password) {
          authenticatedUser = {
            id: `${role}-demo`,
            username: demo.username,
            name: demo.name,
            role,
            email: demo.email
          };
        }
      }
      
      if (authenticatedUser) {
        // Generate a simple token (in production, use proper JWT or session management)
        const token = `token_${Date.now()}_${Math.random().toString(36).substring(2)}`;
        
        // Store session
        userSessions.set(token, {
          userId: authenticatedUser.id,
          role: authenticatedUser.role,
          username: authenticatedUser.username,
          name: authenticatedUser.name,
          email: authenticatedUser.email,
          timestamp: Date.now()
        });

        return res.json({
          success: true,
          token,
          user: {
            id: authenticatedUser.id,
            username: authenticatedUser.username,
            name: authenticatedUser.name,
            role: authenticatedUser.role,
            email: authenticatedUser.email
          }
        });
      } else {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Admin - Assign faculty courses to time slots and create TimetableSlot records
  app.post("/api/timetables/:id/assign-faculty-to-slots", requireAuth, requireRole(['admin']), async (req, res) => {
    try {
      const { id } = req.params;
      
      // Get the timetable
      const timetable = await storage.getTimetable(id);
      if (!timetable) {
        return res.status(404).json({ message: "Timetable not found" });
      }

      // Get all faculty members with assigned courses
      const allFaculty = await storage.getFaculty();
      const facultyWithCourses = allFaculty.filter(f => f.assignedCourses && f.assignedCourses.length > 0);

      if (facultyWithCourses.length === 0) {
        return res.status(400).json({ 
          message: "No faculty members found with assigned courses",
          tip: "Please assign courses to faculty members first"
        });
      }

      // Get all courses and rooms for reference
      const allCourses = await storage.getCourses();
      const courseMap = new Map(allCourses.map(c => [c.id, c]));
      
      const allRooms = await storage.getRooms();
      const defaultRoom = allRooms.find(r => r.isAvailable) || null;

      // Define time slots (8 AM to 8 PM with breaks)
      const timeSlots = [
        { startTime: "08:00", endTime: "08:50" },
        { startTime: "09:00", endTime: "09:50" },
        { startTime: "10:00", endTime: "10:50" },
        { startTime: "11:00", endTime: "11:50" },
        { startTime: "12:00", endTime: "12:50" },
        // Lunch break 12:50-13:50
        { startTime: "14:00", endTime: "14:50" },
        { startTime: "15:00", endTime: "15:50" },
        { startTime: "16:00", endTime: "16:50" },
        { startTime: "17:00", endTime: "17:50" },
        { startTime: "18:00", endTime: "18:50" },
        { startTime: "19:00", endTime: "19:50" }
      ];

      const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      
      let slotsCreated = 0;
      const createdSlots = [];

      // For each faculty member with assigned courses
      for (const faculty of facultyWithCourses) {
        const assignedCourses = faculty.assignedCourses || [];
        
        for (let i = 0; i < assignedCourses.length; i++) {
          const courseId = assignedCourses[i];
          const course = courseMap.get(courseId);
          
          if (!course) continue;

          // Distribute courses across weekdays and time slots
          const dayIndex = i % weekdays.length;
          const timeIndex = i % timeSlots.length;
          const dayOfWeek = weekdays[dayIndex];
          const timeSlot = timeSlots[timeIndex];

          // Create TimetableSlot record
          const slotData = {
            timetableId: id,
            courseId: courseId,
            facultyId: faculty.id,
            roomId: defaultRoom?.id || "TBA", // Use default room or placeholder
            sectionIds: [], // Empty array for now
            dayOfWeek: dayOfWeek,
            startTime: timeSlot.startTime,
            endTime: timeSlot.endTime,
            slotType: course.courseType === 'lab' ? 'lab' : 'theory',
            isLabBlock: course.courseType === 'lab',
            specialInstructions: `Auto-assigned: ${faculty.firstName} ${faculty.lastName} - ${course.courseCode}${!defaultRoom ? ' (Room TBA)' : ''}`
          };

          const createdSlot = await storage.createTimetableSlot(slotData);
          createdSlots.push(createdSlot);
          slotsCreated++;
        }
      }

      res.json({
        success: true,
        message: `Successfully assigned ${slotsCreated} faculty-course combinations to time slots`,
        slotsCreated,
        facultyProcessed: facultyWithCourses.length,
        slots: createdSlots
      });

    } catch (error) {
      console.error("Assign faculty to slots error:", error);
      res.status(500).json({ 
        message: "Failed to assign faculty to time slots",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Admin - Auto allocate rooms and faculty for a timetable's existing slots
  app.post("/api/timetables/:id/auto-allocate", requireAuth, requireRole(['admin']), async (req, res) => {
    try {
      const { id } = req.params;
      const timetable = await storage.getTimetable(id);
      if (!timetable) {
        return res.status(404).json({ success: false, message: "Timetable not found" });
      }

      // Load all slots for this timetable (must be materialized beforehand)
      let slots = await storage.getTimetableSlots(id);
      if (!Array.isArray(slots) || slots.length === 0) {
        // Attempt to auto-materialize slots from timetable.schedule.slotMappings
        let schedule: any = timetable.schedule as any;
        if (schedule && typeof schedule === 'string') {
          try { schedule = JSON.parse(schedule); } catch {}
        }
        const mappings = Array.isArray(schedule?.slotMappings) ? schedule.slotMappings : [];

        if (mappings.length > 0) {
          let created = 0;
          for (const m of mappings) {
            let courseId = m.courseId as string | undefined;
            if (!courseId && m.courseCode) {
              const byCode = await storage.getCourseByCode(m.courseCode).catch(() => undefined);
              if (byCode) courseId = byCode.id;
            }
            if (!courseId) continue;

            await storage.createTimetableSlot({
              timetableId: timetable.id,
              courseId,
              facultyId: m.facultyId || undefined,
              roomId: m.roomId || undefined,
              dayOfWeek: m.dayOfWeek,
              startTime: m.startTime,
              endTime: m.endTime,
              slotType: m.slotType || 'theory',
              sectionIds: [],
              isLabBlock: m.slotType === 'lab',
              specialInstructions: `Course Code: ${m.courseCode || ''}`,
            });
            created += 1;
          }

          // Refetch slots after materialization
          slots = await storage.getTimetableSlots(id);
        } else {
          return res.status(400).json({ success: false, message: "No slots found. Materialize slots before auto-allocating." });
        }
      }

      const rooms = await storage.getRooms();
      const faculty = await storage.getFaculty();
      const courses = await storage.getCoursesByProgram(timetable.program, timetable.semester);
      const courseMap: Record<string, any> = {};
      for (const c of courses) courseMap[c.id] = c;

      // Build time key helper
      const timeKey = (d: string, s: string, e: string) => `${d}::${s}-${e}`;

      // Track occupancy for constraints
      const roomBusy = new Map<string, Set<string>>(); // timeKey -> roomIds
      const facultyBusy = new Map<string, Set<string>>(); // timeKey -> facultyIds
      const programSemBusy = new Map<string, string[]>(); // timeKey -> courseIds (for conflicts report)

      // Initialize from existing assignments to avoid conflicts
      for (const sl of slots) {
        const key = timeKey(sl.dayOfWeek, sl.startTime, sl.endTime);
        if (!roomBusy.has(key)) roomBusy.set(key, new Set());
        if (!facultyBusy.has(key)) facultyBusy.set(key, new Set());
        if (!programSemBusy.has(key)) programSemBusy.set(key, []);
        if (sl.roomId) roomBusy.get(key)!.add(sl.roomId);
        if (sl.facultyId) facultyBusy.get(key)!.add(sl.facultyId);
        programSemBusy.get(key)!.push(sl.courseId);
      }

      const conflicts: Array<{ type: string; description: string; slotId?: string; dayOfWeek?: string; startTime?: string; endTime?: string; details?: any }>= [];

      // Detect program/semester simultaneous course conflicts (multiple courses at same time in same timetable)
      Array.from(programSemBusy.entries()).forEach(([key, courseIds]) => {
        if (courseIds.length > 1) {
          conflicts.push({
            type: 'program_sem_overlap',
            description: `Multiple courses scheduled at the same time (${key}) for ${timetable.program} Sem ${timetable.semester}: ${courseIds.join(', ')}`,
          });
        }
      });

      // Simple heuristics for assignment
      const roomsByType = rooms; // no strict type matching yet
      const facultyList = faculty.filter(f => f.isActive !== false);

      // Helper: check faculty availability if provided
      const isFacultyAvailable = (f: any, day: string, start: string) => {
        const avail = f?.availability || {};
        const times: string[] = Array.isArray(avail?.[day]) ? avail[day] : [];
        return times.length === 0 || times.includes(start);
      };

      let updatedCount = 0;

      // Assign for each slot
      for (const sl of slots) {
        const key = timeKey(sl.dayOfWeek, sl.startTime, sl.endTime);

        // Assign Room if missing
        if (!sl.roomId) {
          const busyRooms = roomBusy.get(key) || new Set<string>();
          const candidate = roomsByType.find(r => !busyRooms.has(r.id));
          if (candidate) {
            await storage.updateTimetableSlot(sl.id, { roomId: candidate.id });
            busyRooms.add(candidate.id);
            roomBusy.set(key, busyRooms);
            updatedCount += 1;
          } else {
            conflicts.push({
              type: 'room_unavailable',
              description: `No available rooms at ${sl.dayOfWeek} ${sl.startTime}-${sl.endTime}`,
              slotId: sl.id,
              dayOfWeek: sl.dayOfWeek,
              startTime: sl.startTime,
              endTime: sl.endTime,
            });
          }
        }

        // Assign Faculty if missing
        if (!sl.facultyId) {
          const busyFaculty = facultyBusy.get(key) || new Set<string>();
          const course = courseMap[sl.courseId];
          const pick = facultyList.find(f => {
            if (busyFaculty.has(f.id)) return false;
            if (!isFacultyAvailable(f, sl.dayOfWeek, sl.startTime)) return false;
            // soft: expertise match if possible
            const exps: string[] = Array.isArray(f.expertise) ? f.expertise : [];
            if (course && exps.length > 0) {
              const target = `${course.courseName} ${course.courseCode}`.toLowerCase();
              if (!exps.some((e: string) => target.includes(e.toLowerCase()))) {
                return false;
              }
            }
            return true;
          }) || facultyList.find(f => !busyFaculty.has(f.id) && isFacultyAvailable(f, sl.dayOfWeek, sl.startTime));

          if (pick) {
            await storage.updateTimetableSlot(sl.id, { facultyId: pick.id });
            busyFaculty.add(pick.id);
            facultyBusy.set(key, busyFaculty);
            updatedCount += 1;
          } else {
            conflicts.push({
              type: 'faculty_unavailable',
              description: `No available faculty at ${sl.dayOfWeek} ${sl.startTime}-${sl.endTime}`,
              slotId: sl.id,
              dayOfWeek: sl.dayOfWeek,
              startTime: sl.startTime,
              endTime: sl.endTime,
            });
          }
        }
      }

      res.json({ success: true, updated: updatedCount, conflicts });
    } catch (error) {
      console.error("Auto allocate error:", error);
      res.status(500).json({ success: false, message: "Failed to auto-allocate rooms and faculty" });
    }
  });

  // Student personal timetable - build from published/latest timetable slots
  app.get("/api/students/:id/timetable", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const user = (req as any).user;
      
      // Authorization: student can view own timetable; admin can view any
      if (user.role === 'student') {
        if (user.userId !== id) {
          return res.status(403).json({ message: "You can only view your own timetable" });
        }
      } else if (user.role !== 'admin') {
        return res.status(403).json({ message: "Insufficient permissions to view student timetable" });
      }

      const student = await storage.getStudent(id);
      if (!student) {
        return res.status(404).json({ message: "Student not found" });
      }

      // Load enrolled course details (to support cross-program registrations)
      const enrolledCourseIds = student.enrolledCourses || [];
      const courseDocs = await Promise.all(enrolledCourseIds.map(id => storage.getCourse(id)));
      const courseMap: Record<string, any> = {};
      for (const c of courseDocs) { if (c) courseMap[c.id] = c; }
      // Student-selected slots map (per course)
      const selectedSlotsMap: Record<string, string> = ((student as any).preferences?.selectedSlots) || {};

      // Group courses by program+semester
      const groups: Record<string, { program: string; semester: number; courseIds: string[]; }> = {};
      for (const cId of enrolledCourseIds) {
        const c = courseMap[cId];
        if (!c) continue;
        const key = `${c.program}__${c.semester}`;
        if (!groups[key]) groups[key] = { program: c.program, semester: c.semester, courseIds: [] };
        groups[key].courseIds.push(cId);
      }

      // For each group, pick a relevant timetable (published preferred), collect slots for those courses
      let studentSlots: any[] = [];
      for (const key of Object.keys(groups)) {
        const { program, semester, courseIds } = groups[key];
        const tts = await storage.getTimetablesByProgram(program, semester);
        if (!tts || tts.length === 0) continue;
        let tt = tts.find(t => (t as any).status === 'published') || tts[0];
        if (tts.length > 1) {
          tt = tts.reduce((latest, current) => {
            const latestTime = (latest as any).updatedAt || (latest as any).createdAt;
            const currentTime = (current as any).updatedAt || (current as any).createdAt;
            return (new Date(currentTime).getTime() > new Date(latestTime).getTime()) ? current : latest;
          }, tt);
        }
        const slots = await storage.getTimetableSlots(tt.id);
        const setIds = new Set(courseIds);
        const filtered = slots.filter(s => setIds.has(s.courseId));
        // Partition by courseId to respect student-selected slot per course, but fallback if not found
        const byCourse: Record<string, any[]> = {};
        for (const s of filtered) {
          if (!byCourse[s.courseId]) byCourse[s.courseId] = [];
          byCourse[s.courseId].push(s);
        }
        for (const cId of courseIds) {
          const selected = selectedSlotsMap[cId];
          const list = byCourse[cId] || [];
          if (selected) {
            const chosen = list.find(x => x.id === selected);
            if (chosen) {
              studentSlots.push(chosen);
            } else {
              // Fallback: selected slot not found, include all available slots so course still appears
              studentSlots.push(...list);
            }
          } else {
            studentSlots.push(...list);
          }
        }
      }

      // Build schedule for conflicts
      const scheduleForConflicts = studentSlots.map(s => ({
        courseId: s.courseId,
        facultyId: s.facultyId || '',
        roomId: s.roomId || '',
        dayOfWeek: s.dayOfWeek,
        startTime: s.startTime,
        endTime: s.endTime,
        slotType: s.slotType || 'theory',
      }));

      const conflicts = await detectConflicts(scheduleForConflicts);
      // Student-level time conflict detection (no two classes at same time for the student)
      const timeKeyMap: Record<string, string[]> = {};
      for (const s of scheduleForConflicts) {
        const timeKey = `${s.dayOfWeek}-${s.startTime}-${s.endTime}`;
        if (!timeKeyMap[timeKey]) timeKeyMap[timeKey] = [];
        timeKeyMap[timeKey].push(s.courseId);
      }
      Object.entries(timeKeyMap).forEach(([timeKey, courseIds]) => {
        if (courseIds.length > 1) {
          conflicts.push({
            type: 'student_time_conflict',
            description: `Multiple courses scheduled at the same time (${timeKey}): ${courseIds.join(', ')}`,
            severity: 'high',
            suggestions: ['Choose alternate section/time', 'Contact admin to resolve semester-level clashes']
          } as any);
        }
      });

      // Group slots by course for enrolledCourses array
      const groupedByCourse: Record<string, any[]> = {};
      for (const s of studentSlots) {
        if (!groupedByCourse[s.courseId]) groupedByCourse[s.courseId] = [];
        groupedByCourse[s.courseId].push(s);
      }

      // Always include every enrolled course, even if no slots are available/matched
      const enrolledCourses = enrolledCourseIds.map(courseId => {
        const c = courseMap[courseId];
        const slots = groupedByCourse[courseId] || [];
        return {
          courseId,
          courseCode: c?.courseCode || courseId,
          courseName: c?.courseName || 'Course',
          section: 'A1',
          credits: c?.credits || 0,
          faculty: slots[0]?.facultyId || '',
          schedule: slots.map(s => ({
            day: s.dayOfWeek,
            startTime: s.startTime,
            endTime: s.endTime,
            room: s.roomId || '',
            slotId: s.id || s.slotType || 'slot'
          }))
        };
      });

      const totalCredits = enrolledCourses.reduce((sum, ec) => sum + (ec.credits || 0), 0);

      res.json({
        studentId: student.id,
        totalCredits,
        enrolledCourses,
        conflicts
      });
    } catch (error) {
      console.error("Student timetable error:", error);
      res.status(500).json({ message: "Failed to build personal timetable" });
    }
  });

  // List available slots for a course with conflict flags for the student
  app.get("/api/students/:id/course/:courseId/slots", requireAuth, async (req, res) => {
    try {
      const { id, courseId } = req.params;
      const user = (req as any).user;
      if (user.role === 'student' && user.userId !== id) {
        return res.status(403).json({ message: "You can only view your own data" });
      } else if (user.role !== 'admin' && user.role !== 'student') {
        return res.status(403).json({ message: "Insufficient permissions" });
      }

      const student = await storage.getStudent(id);
      if (!student) return res.status(404).json({ message: "Student not found" });
      const course = await storage.getCourse(courseId);
      if (!course) return res.status(404).json({ message: "Course not found" });

      const tts = await storage.getTimetablesByProgram(course.program, course.semester);
      if (!tts || tts.length === 0) return res.json([]);
      let tt = tts.find(t => (t as any).status === 'published') || tts[0];
      if (tts.length > 1) {
        tt = tts.reduce((latest, current) => {
          const latestTime = (latest as any).updatedAt || (latest as any).createdAt;
          const currentTime = (current as any).updatedAt || (current as any).createdAt;
          return (new Date(currentTime).getTime() > new Date(latestTime).getTime()) ? current : latest;
        }, tt);
      }
      const slotsAll = await storage.getTimetableSlots(tt.id);
      const courseSlots = slotsAll.filter(s => s.courseId === courseId);

      // Build student's current schedule excluding this course
      const otherCourseIds = (student.enrolledCourses || []).filter(id => id !== courseId);
      const groups: Record<string, { program: string; semester: number; courseIds: string[]; }> = {};
      const otherCoursesDocs = await Promise.all(otherCourseIds.map(id => storage.getCourse(id)));
      for (const c of otherCoursesDocs) {
        if (!c) continue;
        const key = `${c.program}__${c.semester}`;
        if (!groups[key]) groups[key] = { program: c.program, semester: c.semester, courseIds: [] };
        groups[key].courseIds.push(c.id);
      }
      let currentSlots: Array<{ dayOfWeek: string; startTime: string; endTime: string; }>= [];
      for (const key of Object.keys(groups)) {
        const { program, semester, courseIds } = groups[key];
        const tts2 = await storage.getTimetablesByProgram(program, semester);
        if (!tts2 || tts2.length === 0) continue;
        let tt2 = tts2.find(t => (t as any).status === 'published') || tts2[0];
        if (tts2.length > 1) {
          tt2 = tts2.reduce((latest, current) => {
            const latestTime = (latest as any).updatedAt || (latest as any).createdAt;
            const currentTime = (current as any).updatedAt || (current as any).createdAt;
            return (new Date(currentTime).getTime() > new Date(latestTime).getTime()) ? current : latest;
          }, tt2);
        }
        const slots = await storage.getTimetableSlots(tt2.id);
        const setIds = new Set(courseIds);
        currentSlots.push(...slots.filter(s => setIds.has(s.courseId)).map(s => ({
          dayOfWeek: s.dayOfWeek,
          startTime: s.startTime,
          endTime: s.endTime,
        })));
      }
      const timeKey = (d: string, s: string, e: string) => `${d}-${s}-${e}`;
      const existing = new Set(currentSlots.map(s => timeKey(s.dayOfWeek, s.startTime, s.endTime)));

      const result = courseSlots.map(s => ({
        id: s.id,
        dayOfWeek: s.dayOfWeek,
        startTime: s.startTime,
        endTime: s.endTime,
        roomId: s.roomId,
        facultyId: s.facultyId,
        slotType: s.slotType,
        conflictsWithCurrent: existing.has(timeKey(s.dayOfWeek, s.startTime, s.endTime)),
      }));

      res.json(result);
    } catch (error) {
      console.error("List course slots error:", error);
      res.status(500).json({ message: "Failed to fetch course slots" });
    }
  });

  // Select a specific slot for a student's course (with conflict check)
  app.post("/api/students/:id/select-slot", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const user = (req as any).user;
      const { courseId, slotId } = courseSlotSelectionSchema.parse(req.body);

      if (user.role === 'student' && user.userId !== id) {
        return res.status(403).json({ message: "You can only update your own selections" });
      } else if (user.role !== 'admin' && user.role !== 'student') {
        return res.status(403).json({ message: "Insufficient permissions" });
      }

      const student = await storage.getStudent(id);
      if (!student) return res.status(404).json({ message: "Student not found" });
      if (!student.enrolledCourses.includes(courseId)) {
        return res.status(400).json({ message: "You are not enrolled in this course" });
      }

      const course = await storage.getCourse(courseId);
      if (!course) return res.status(404).json({ message: "Course not found" });
      const tts = await storage.getTimetablesByProgram(course.program, course.semester);
      if (!tts || tts.length === 0) return res.status(400).json({ message: "No timetable available for this course" });
      let tt = tts.find(t => (t as any).status === 'published') || tts[0];
      if (tts.length > 1) {
        tt = tts.reduce((latest, current) => {
          const latestTime = (latest as any).updatedAt || (latest as any).createdAt;
          const currentTime = (current as any).updatedAt || (current as any).createdAt;
          return (new Date(currentTime).getTime() > new Date(latestTime).getTime()) ? current : latest;
        }, tt);
      }
      const slotsAll = await storage.getTimetableSlots(tt.id);
      const targetSlot = slotsAll.find(s => s.id === slotId && s.courseId === courseId);
      if (!targetSlot) return res.status(400).json({ message: "Invalid slot selection" });

      // Build student's current schedule excluding this course
      const otherCourseIds = (student.enrolledCourses || []).filter(id => id !== courseId);
      const groups: Record<string, { program: string; semester: number; courseIds: string[]; }> = {};
      const otherCoursesDocs = await Promise.all(otherCourseIds.map(id => storage.getCourse(id)));
      for (const c of otherCoursesDocs) {
        if (!c) continue;
        const key = `${c.program}__${c.semester}`;
        if (!groups[key]) groups[key] = { program: c.program, semester: c.semester, courseIds: [] };
        groups[key].courseIds.push(c.id);
      }
      let currentSlots: Array<{ dayOfWeek: string; startTime: string; endTime: string; }>= [];
      for (const key of Object.keys(groups)) {
        const { program, semester, courseIds } = groups[key];
        const tts2 = await storage.getTimetablesByProgram(program, semester);
        if (!tts2 || tts2.length === 0) continue;
        let tt2 = tts2.find(t => (t as any).status === 'published') || tts2[0];
        if (tts2.length > 1) {
          tt2 = tts2.reduce((latest, current) => {
            const latestTime = (latest as any).updatedAt || (latest as any).createdAt;
            const currentTime = (current as any).updatedAt || (current as any).createdAt;
            return (new Date(currentTime).getTime() > new Date(latestTime).getTime()) ? current : latest;
          }, tt2);
        }
        const slots = await storage.getTimetableSlots(tt2.id);
        const setIds = new Set(courseIds);
        currentSlots.push(...slots.filter(s => setIds.has(s.courseId)).map(s => ({
          dayOfWeek: s.dayOfWeek,
          startTime: s.startTime,
          endTime: s.endTime,
        })));
      }
      const timeKey = (d: string, s: string, e: string) => `${d}-${s}-${e}`;
      const existing = new Set(currentSlots.map(s => timeKey(s.dayOfWeek, s.startTime, s.endTime)));
      const selectedKey = timeKey(targetSlot.dayOfWeek, targetSlot.startTime, targetSlot.endTime);
      if (existing.has(selectedKey)) {
        return res.status(400).json({
          message: "Selected slot conflicts with your current schedule",
          conflict: {
            dayOfWeek: targetSlot.dayOfWeek,
            startTime: targetSlot.startTime,
            endTime: targetSlot.endTime,
            slotId: targetSlot.id,
          }
        });
      }

      const selectedSlots = ({ ...(student.preferences || {}) }.selectedSlots || {}) as Record<string, string>;
      selectedSlots[courseId] = slotId;
      const updated = await storage.updateStudent(id, {
        preferences: {
          ...(student.preferences || {}),
          selectedSlots,
        }
      });

      res.json({ success: true, student: updated });
    } catch (error) {
      console.error("Select slot error:", error);
      res.status(500).json({ message: "Failed to select slot" });
    }
  });

  // Admin - Materialize TimetableSlot records for a timetable
  // Modes:
  // - from_mappings: Read timetable.schedule.slotMappings and create DB slots
  // - from_payload: Use req.body.classes array to create DB slots
  app.post("/api/timetables/:id/materialize-slots", requireAuth, requireRole(['admin']), async (req, res) => {
    try {
      const { id } = req.params;
      const { mode, replace = false, classes = [] } = req.body || {};

      const timetable = await storage.getTimetable(id);
      if (!timetable) {
        return res.status(404).json({ success: false, message: "Timetable not found" });
      }

      // Optionally clear existing
      if (replace) {
        await storage.deleteTimetableSlots(id);
      }

      let toCreate: Array<{
        courseId: string;
        facultyId?: string | null;
        roomId?: string | null;
        dayOfWeek: string;
        startTime: string;
        endTime: string;
        slotType?: string;
        isLabBlock?: boolean;
        specialInstructions?: string;
      }> = [];

      if (mode === 'from_mappings') {
        // Read mappings from timetable.schedule
        let schedule: any = timetable.schedule as any;
        if (schedule && typeof schedule === 'string') {
          try { schedule = JSON.parse(schedule); } catch {}
        }
        const mappings = Array.isArray(schedule?.slotMappings) ? schedule.slotMappings : [];
        if (mappings.length === 0) {
          return res.status(400).json({ success: false, message: "No slotMappings found in timetable.schedule" });
        }

        // Resolve courseId by courseCode when missing
        const resolved: Array<{
          courseId: string;
          facultyId?: string | null;
          roomId?: string | null;
          dayOfWeek: string;
          startTime: string;
          endTime: string;
          slotType?: string;
          isLabBlock?: boolean;
          specialInstructions?: string;
        }> = [];

        for (const m of mappings) {
          let courseId = m.courseId as string | undefined;
          if (!courseId && m.courseCode) {
            const byCode = await storage.getCourseByCode(m.courseCode).catch(() => undefined);
            if (byCode) courseId = byCode.id;
          }
          if (!courseId) {
            // Skip entries we cannot resolve
            continue;
          }
          resolved.push({
            courseId,
            facultyId: m.facultyId ?? null,
            roomId: m.roomId ?? null,
            dayOfWeek: m.dayOfWeek,
            startTime: m.startTime,
            endTime: m.endTime,
            slotType: m.slotType || 'theory',
            isLabBlock: m.slotType === 'lab',
            specialInstructions: `Course Code: ${m.courseCode || ''}`,
          });
        }
        toCreate = resolved;
      } else if (mode === 'from_payload') {
        if (!Array.isArray(classes) || classes.length === 0) {
          return res.status(400).json({ success: false, message: "No classes provided in payload" });
        }
        toCreate = classes.map((c: any) => ({
          courseId: c.courseId,
          facultyId: c.facultyId ?? null,
          roomId: c.roomId ?? null,
          dayOfWeek: c.dayOfWeek,
          startTime: c.startTime,
          endTime: c.endTime,
          slotType: c.slotType || 'theory',
          isLabBlock: c.slotType === 'lab',
          specialInstructions: c.specialInstructions || undefined,
        }));
      } else {
        return res.status(400).json({ success: false, message: "Invalid mode. Use 'from_mappings' or 'from_payload'" });
      }

      // Create DB slots
      let created = 0;
      for (const s of toCreate) {
        if (!s.courseId || !s.dayOfWeek || !s.startTime || !s.endTime) continue;
        await storage.createTimetableSlot({
          timetableId: timetable.id,
          courseId: s.courseId,
          facultyId: s.facultyId || 'TBA',
          roomId: s.roomId || 'TBA',
          dayOfWeek: s.dayOfWeek,
          startTime: s.startTime,
          endTime: s.endTime,
          slotType: s.slotType || 'theory',
          sectionIds: [],
          isLabBlock: !!s.isLabBlock,
          specialInstructions: s.specialInstructions,
        });
        created += 1;
      }

      res.json({ success: true, message: "Timetable slots materialized", created });
    } catch (error) {
      console.error("Materialize slots error:", error);
      res.status(500).json({ success: false, message: "Failed to materialize slots" });
    }
  });

  // Debug endpoint to check specific student's enrolled courses
  app.get("/api/debug/student/:studentId/enrolled-count", async (req: Request, res: Response) => {
    try {
      const { studentId } = req.params;
      console.log(`🔍 Debug: Checking enrolled courses for studentId: ${studentId}`);
      
      // Find student by studentId
      const students = await storage.getStudents();
      const student = students.find(s => s.studentId === studentId);
      
      if (!student) {
        console.log(`❌ Student not found with studentId: ${studentId}`);
        return res.status(404).json({ message: "Student not found" });
      }
      
      console.log(`📚 Student found: ${student.firstName} ${student.lastName}`);
      console.log(`📋 enrolledCourses array:`, student.enrolledCourses);
      console.log(`📊 enrolledCourses count: ${student.enrolledCourses?.length || 0}`);
      console.log(`🆔 Student database ID: ${student.id}`);
      
      res.json({
        studentId: student.studentId,
        name: `${student.firstName} ${student.lastName}`,
        databaseId: student.id,
        enrolledCourses: student.enrolledCourses,
        enrolledCoursesCount: student.enrolledCourses?.length || 0
      });
      
    } catch (error) {
      console.error("Debug endpoint error:", error);
      res.status(500).json({ message: "Failed to fetch student data" });
    }
  });

  // Students routes
  app.get("/api/students", async (req: Request, res: Response) => {
    try {
      const students = await storage.getStudents();
      res.json(students);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch students" });
    }
  });

  app.get("/api/students/:id", async (req: Request, res: Response) => {
    try {
      const student = await storage.getStudent(req.params.id);
      if (!student) {
        return res.status(404).json({ message: "Student not found" });
      }
      res.json(student);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch student" });
    }
  });

  app.post("/api/students", async (req: Request, res: Response) => {
    try {
      const validatedData = insertStudentSchema.parse(req.body);
      const student = await storage.createStudent(validatedData);
      res.status(201).json(student);
    } catch (error) {
      res.status(400).json({ message: "Invalid student data" });
    }
  });

  app.put("/api/students/:id", async (req: Request, res: Response) => {
    try {
      const student = await storage.updateStudent(req.params.id, req.body);
      if (!student) {
        return res.status(404).json({ message: "Student not found" });
      }
      res.json(student);
    } catch (error) {
      res.status(500).json({ message: "Failed to update student" });
    }
  });

  app.delete("/api/students/:id", async (req: Request, res: Response) => {
    try {
      const success = await storage.deleteStudent(req.params.id);
      if (!success) {
        return res.status(404).json({ message: "Student not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete student" });
    }
  });

  // Course Registration routes
  app.post("/api/students/:id/register-course", requireAuth, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const user = (req as any).user;
      const { courseId } = courseRegistrationSchema.parse(req.body);
      
      // Authorization check: Only students can register for their own courses, or admins can register for any student
      if (user.role === 'student') {
        if (user.userId !== id) {
          return res.status(403).json({ message: "You can only register courses for yourself" });
        }
      } else if (user.role !== 'admin') {
        return res.status(403).json({ message: "Insufficient permissions to register courses for students" });
      }
      
      // Get student and course
      const student = await storage.getStudent(id);
      if (!student) {
        return res.status(404).json({ message: "Student not found" });
      }
      
      const course = await storage.getCourse(courseId);
      if (!course) {
        return res.status(404).json({ message: "Course not found" });
      }
      
      // Check if course is active
      if (!course.isActive) {
        return res.status(400).json({ message: "Course is not currently available for registration" });
      }
      
      // Check if student is already enrolled
      if (student.enrolledCourses.includes(courseId)) {
        return res.status(400).json({ message: "Student is already enrolled in this course" });
      }
      
      // Validate course eligibility: allow cross-program courses, but enforce same semester
      if (course.semester !== student.semester) {
        return res.status(400).json({ message: "Course is not available for your semester" });
      }
      // Note: Cross-program registration is allowed. Log a warning for audit purposes.
      if (course.program !== student.program) {
        console.warn(`Cross-program registration: student ${student.id} (${student.program}) registering for course ${course.id} (${course.program})`);
      }
      
      // Check prerequisites
      if (course.prerequisites.length > 0) {
        const studentCourses = student.enrolledCourses;
        const missingPrerequisites = course.prerequisites.filter(prereq => !studentCourses.includes(prereq));
        if (missingPrerequisites.length > 0) {
          return res.status(400).json({ 
            message: "Missing prerequisites", 
            missingPrerequisites 
          });
        }
      }
      
      // Time conflict prevention: ensure adding this course will not clash with student's current schedule.
      // If multiple slots exist for the course, allow registration if at least one slot is conflict-free.
      // We'll also auto-select a conflict-free slot (first one) in student.preferences.selectedSlots.
      try {
        // Build student's existing schedule across all enrolled courses (supporting cross-program registrations)
        const enrolledCourseIds = student.enrolledCourses || [];
        const enrolledCoursesDocs = await Promise.all(enrolledCourseIds.map(id => storage.getCourse(id)));
        const enrolledGroups: Record<string, { program: string; semester: number; courseIds: string[]; }> = {};
        for (const c of enrolledCoursesDocs) {
          if (!c) continue;
          const key = `${c.program}__${c.semester}`;
          if (!enrolledGroups[key]) enrolledGroups[key] = { program: c.program, semester: c.semester, courseIds: [] };
          enrolledGroups[key].courseIds.push(c.id);
        }
        let currentSlots: Array<{ dayOfWeek: string; startTime: string; endTime: string; }>= [];
        for (const key of Object.keys(enrolledGroups)) {
          const { program, semester, courseIds } = enrolledGroups[key];
          const tts = await storage.getTimetablesByProgram(program, semester);
          if (!tts || tts.length === 0) continue;
          let tt = tts.find(t => (t as any).status === 'published') || tts[0];
          if (tts.length > 1) {
            tt = tts.reduce((latest, current) => {
              const latestTime = (latest as any).updatedAt || (latest as any).createdAt;
              const currentTime = (current as any).updatedAt || (current as any).createdAt;
              return (new Date(currentTime).getTime() > new Date(latestTime).getTime()) ? current : latest;
            }, tt);
          }
          const slots = await storage.getTimetableSlots(tt.id);
          const setIds = new Set(courseIds);
          currentSlots.push(...slots.filter(s => setIds.has(s.courseId)).map(s => ({
            dayOfWeek: s.dayOfWeek,
            startTime: s.startTime,
            endTime: s.endTime,
          })));
        }

        // Get slots for the target course from its program+semester timetable
        const targetTimetables = await storage.getTimetablesByProgram(course.program, course.semester);
        if (targetTimetables && targetTimetables.length > 0) {
          let targetTT = targetTimetables.find(t => (t as any).status === 'published') || targetTimetables[0];
          if (targetTimetables.length > 1) {
            targetTT = targetTimetables.reduce((latest, current) => {
              const latestTime = (latest as any).updatedAt || (latest as any).createdAt;
              const currentTime = (current as any).updatedAt || (current as any).createdAt;
              return (new Date(currentTime).getTime() > new Date(latestTime).getTime()) ? current : latest;
            }, targetTT);
          }
          const targetSlotsAll = await storage.getTimetableSlots(targetTT.id);
          const targetSlots = targetSlotsAll.filter(s => s.courseId === course.id);

          // Build a quick lookup of existing time keys
          const timeKey = (d: string, s: string, e: string) => `${d}-${s}-${e}`;
          const existingTimeKeys = new Set(currentSlots.map(s => timeKey(s.dayOfWeek, s.startTime, s.endTime)));

          // Separate conflict-free options
          const nonConflictingSlots = targetSlots.filter(s => !existingTimeKeys.has(timeKey(s.dayOfWeek, s.startTime, s.endTime)));
          if (targetSlots.length > 0 && nonConflictingSlots.length === 0) {
            // All slots conflict -> reject with details
            return res.status(400).json({
              message: "Time conflict with your existing schedule for all available sections",
              conflicts: targetSlots.map(s => ({
                dayOfWeek: s.dayOfWeek,
                startTime: s.startTime,
                endTime: s.endTime,
                courseId: course.id,
                courseCode: course.courseCode,
                slotId: s.id,
              })),
              suggestions: [
                "Drop a clashing course",
                "Choose an alternative elective",
                "Ask admin to provide another section/time"
              ]
            });
          }

          // If at least one slot does not conflict, we'll auto-select the first non-conflicting slot
          // after successful registration below by updating student.preferences.selectedSlots
          (req as any)._autoSelectedSlotId = nonConflictingSlots[0]?.id || null;
        } else {
          console.warn(`No timetable found for course program/semester during registration check: ${course.program} S${course.semester}`);
        }
      } catch (conflictCheckError) {
        console.warn('Conflict check error during registration:', conflictCheckError);
        // Do not block registration if conflict check fails; proceed
      }

      // Add course to student's enrolled courses
      // Also persist auto-selected slot (if any) into preferences.selectedSlots
      const selectedSlots = ({ ...(student.preferences || {}) }.selectedSlots || {}) as Record<string, string>;
      const autoSelected = (req as any)._autoSelectedSlotId as string | null;
      if (autoSelected) {
        selectedSlots[courseId] = autoSelected;
      }
      const updatedStudent = await storage.updateStudent(id, {
        enrolledCourses: [...student.enrolledCourses, courseId],
        preferences: {
          ...(student.preferences || {}),
          selectedSlots,
        }
      });
      
      res.json({ 
        message: "Successfully registered for course",
        student: updatedStudent,
        course: course
      });
      
    } catch (error) {
      console.error("Course registration error:", error);
      res.status(400).json({ message: "Invalid registration data" });
    }
  });

  app.delete("/api/students/:id/register-course/:courseId", requireAuth, async (req: Request, res: Response) => {
    try {
      const { id, courseId } = req.params;
      const user = (req as any).user;
      
      // Authorization check: Only students can unregister their own courses, or admins can unregister for any student
      if (user.role === 'student') {
        if (user.userId !== id) {
          return res.status(403).json({ message: "You can only unregister courses for yourself" });
        }
      } else if (user.role !== 'admin') {
        return res.status(403).json({ message: "Insufficient permissions to unregister courses for students" });
      }
      
      // Get student
      const student = await storage.getStudent(id);
      if (!student) {
        return res.status(404).json({ message: "Student not found" });
      }
      
      // Check if student is enrolled in the course
      if (!student.enrolledCourses.includes(courseId)) {
        return res.status(400).json({ message: "Student is not enrolled in this course" });
      }
      
      // Remove course from student's enrolled courses
      const updatedStudent = await storage.updateStudent(id, {
        enrolledCourses: student.enrolledCourses.filter(id => id !== courseId)
      });
      
      res.json({ 
        message: "Successfully unregistered from course",
        student: updatedStudent
      });
      
    } catch (error) {
      console.error("Course unregistration error:", error);
      res.status(500).json({ message: "Failed to unregister from course" });
    }
  });

  app.get("/api/students/:id/available-courses", requireAuth, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const user = (req as any).user;
      
      console.log(`Available courses request for student ${id} by user ${user.userId} (${user.role})`);
      
      // Authorization check: Only students can view their own available courses, or admins can view for any student
      if (user.role === 'student') {
        if (user.userId !== id) {
          return res.status(403).json({ message: "You can only view your own available courses" });
        }
      } else if (user.role !== 'admin') {
        return res.status(403).json({ message: "Insufficient permissions to view student course data" });
      }
      
      // Get student
      const student = await storage.getStudent(id);
      if (!student) {
        console.error(`Student not found: ${id}`);
        return res.status(404).json({ message: "Student not found" });
      }
      
      console.log(`Student found: ${student.firstName} ${student.lastName}`);
      console.log(`Student enrolled courses: ${student.enrolledCourses}`);
      
      // Get all courses for student's program and semester
      const allCourses = await storage.getCoursesByProgram(student.program, student.semester);
      console.log(`Found ${allCourses.length} courses for program ${student.program}, semester ${student.semester}`);
      
      // Filter to show only active courses that student is not already enrolled in
      const enrolledSet = new Set(student.enrolledCourses);
      const availableCourses = allCourses.filter(course => 
        course.isActive && !enrolledSet.has(course.id)
      );

      // If grouped view requested, also include other programs in the same semester
      const grouped = String(req.query.grouped || '').toLowerCase() === 'true';
      if (grouped) {
        // Fetch all courses and filter by same semester, different program
        const everyCourse = await storage.getCourses();
        const semesterCourses = everyCourse.filter(c => c.semester === student.semester);
        const otherSemesterCourses = semesterCourses.filter(c => 
          c.program !== student.program && c.isActive && !enrolledSet.has(c.id)
        );

        console.log(`Grouped available courses -> program: ${availableCourses.length}, otherSemester: ${otherSemesterCourses.length}`);
        return res.json({ programCourses: availableCourses, otherSemesterCourses });
      }
      
      console.log(`Filtered to ${availableCourses.length} available courses`);
      
      res.json(availableCourses);
      
    } catch (error) {
      console.error("Available courses error:", error);
      console.error("Error stack:", error instanceof Error ? error.stack : 'No stack trace');
      res.status(500).json({ 
        message: "Failed to fetch available courses",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  app.get("/api/students/:id/registered-courses", requireAuth, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const user = (req as any).user;
      
      console.log(`🔍 Registered courses request for student ${id} by user ${user.userId} (${user.role})`);
      
      // Authorization check: Only students can view their own registered courses, or admins can view for any student
      if (user.role === 'student') {
        if (user.userId !== id) {
          return res.status(403).json({ message: "You can only view your own registered courses" });
        }
      } else if (user.role !== 'admin') {
        return res.status(403).json({ message: "Insufficient permissions to view student course data" });
      }
      
      // Get student
      const student = await storage.getStudent(id);
      if (!student) {
        console.error(`❌ Student not found: ${id}`);
        return res.status(404).json({ message: "Student not found" });
      }
      
      console.log(`📚 Student found: ${student.firstName} ${student.lastName}`);
      console.log(`📋 Student enrolled courses array:`, student.enrolledCourses);
      console.log(`📊 Enrolled courses count: ${student.enrolledCourses?.length || 0}`);
      
      // Get enrolled courses details using Promise.all for parallel fetching
      const coursePromises = student.enrolledCourses.map(courseId => 
        storage.getCourse(courseId)
      );
      const courses = await Promise.all(coursePromises);
      
      // Filter out any null results (courses that don't exist)
      const enrolledCourses = courses.filter(course => course !== null);
      
      console.log(`✅ Returning ${enrolledCourses.length} enrolled courses`);
      
      res.json(enrolledCourses);
      
    } catch (error) {
      console.error("Registered courses error:", error);
      res.status(500).json({ message: "Failed to fetch registered courses" });
    }
  });

  // Faculty routes
  app.get("/api/faculty", async (req: Request, res: Response) => {
    try {
      const faculty = await storage.getFaculty();
      res.json(faculty);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch faculty" });
    }
  });

  // Bulk import faculty from CSV/Excel
  app.post("/api/faculty/import", requireAuth, requireRole(['admin']), async (req: Request, res: Response) => {
    try {
      const { faculty } = req.body;
      const results = [];
      
      for (const facultyData of faculty) {
        try {
          const newFaculty = await storage.createFaculty({
            firstName: facultyData.firstName,
            lastName: facultyData.lastName,
            email: facultyData.email,
            password: 'defaultPassword123',
            plainPassword: 'defaultPassword123',
            facultyId: `FAC${Date.now()}${Math.random().toString(36).substr(2, 5)}`,
            department: facultyData.department || 'General',
            designation: facultyData.designation || 'Assistant Professor',
            expertise: facultyData.expertise ? facultyData.expertise.split(',').map((e: string) => e.trim()) : [],
            maxWorkload: parseInt(facultyData.maxWorkload) || 20,
            isActive: facultyData.isActive !== 'false',
            assignedCourses: [],
            availability: facultyData.availability ? JSON.parse(facultyData.availability) : {
              Monday: ['09:00', '10:00', '11:00', '14:00', '15:00', '16:00'],
              Tuesday: ['09:00', '10:00', '11:00', '14:00', '15:00', '16:00'],
              Wednesday: ['09:00', '10:00', '11:00', '14:00', '15:00', '16:00'],
              Thursday: ['09:00', '10:00', '11:00', '14:00', '15:00', '16:00'],
              Friday: ['09:00', '10:00', '11:00', '14:00', '15:00', '16:00']
            }
          });
          results.push({ success: true, name: `${facultyData.firstName} ${facultyData.lastName}`, id: newFaculty.id });
        } catch (error) {
          results.push({ 
            success: false, 
            name: `${facultyData.firstName} ${facultyData.lastName}`, 
            error: error instanceof Error ? error.message : 'Unknown error' 
          });
        }
      }
      
      res.json({ 
        message: `Imported ${results.filter(r => r.success).length} of ${faculty.length} faculty members`,
        results 
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to import faculty" });
    }
  });

  app.get("/api/faculty/:id", async (req: Request, res: Response) => {
    try {
      const facultyMember = await storage.getFacultyMember(req.params.id);
      if (!facultyMember) {
        return res.status(404).json({ message: "Faculty member not found" });
      }
      res.json(facultyMember);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch faculty member" });
    }
  });

  app.post("/api/faculty", async (req: Request, res: Response) => {
    try {
      const validatedData = insertFacultySchema.parse(req.body);
      const facultyMember = await storage.createFaculty(validatedData);
      res.status(201).json(facultyMember);
    } catch (error) {
      res.status(400).json({ message: "Invalid faculty data" });
    }
  });

  app.put("/api/faculty/:id", async (req: Request, res: Response) => {
    try {
      const facultyMember = await storage.updateFaculty(req.params.id, req.body);
      if (!facultyMember) {
        return res.status(404).json({ message: "Faculty member not found" });
      }
      res.json(facultyMember);
    } catch (error) {
      res.status(500).json({ message: "Failed to update faculty member" });
    }
  });

  app.delete("/api/faculty/:id", async (req: Request, res: Response) => {
    try {
      const success = await storage.deleteFaculty(req.params.id);
      if (!success) {
        return res.status(404).json({ message: "Faculty member not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete faculty member" });
    }
  });

  // Faculty Course Assignment routes
  app.post("/api/faculty/:id/assign-course", requireAuth, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const user = (req as any).user;
      const { courseId } = courseRegistrationSchema.parse(req.body);
      
      // Authorization check: Only faculty can assign courses for themselves, or admins can assign for any faculty
      if (user.role === 'faculty') {
        if (user.userId !== id) {
          return res.status(403).json({ message: "You can only assign courses for yourself" });
        }
      } else if (user.role !== 'admin') {
        return res.status(403).json({ message: "Insufficient permissions to assign courses for faculty" });
      }
      
      // Get faculty and course
      const facultyMember = await storage.getFacultyMember(id);
      if (!facultyMember) {
        return res.status(404).json({ message: "Faculty member not found" });
      }
      
      const course = await storage.getCourse(courseId);
      if (!course) {
        return res.status(404).json({ message: "Course not found" });
      }
      
      // Check if course is active
      if (!course.isActive) {
        return res.status(400).json({ message: "Course is not currently available for assignment" });
      }
      
      // Check if faculty is already assigned to this course
      const assignedCourses = facultyMember.assignedCourses || [];
      if (assignedCourses.includes(courseId)) {
        return res.status(400).json({ message: "Faculty is already assigned to this course" });
      }
      
      // Check faculty expertise match (optional validation)
      const facultyExpertise = Array.isArray(facultyMember.expertise) ? facultyMember.expertise : [];
      if (facultyExpertise.length > 0 && !facultyExpertise.some(exp => 
        course.courseName.toLowerCase().includes(exp.toLowerCase()) || 
        course.courseCode.toLowerCase().includes(exp.toLowerCase())
      )) {
        // This is a warning, not a blocker
        console.warn(`Faculty ${facultyMember.firstName} ${facultyMember.lastName} expertise may not match course ${course.courseCode}`);
      }
      
      // Add course to faculty's assigned courses
      const updatedFaculty = await storage.updateFaculty(id, {
        assignedCourses: [...assignedCourses, courseId]
      });
      
      res.json({ 
        message: "Successfully assigned to course",
        faculty: updatedFaculty,
        course: course
      });
      
    } catch (error) {
      console.error("Course assignment error:", error);
      res.status(400).json({ message: "Invalid assignment data" });
    }
  });

  app.delete("/api/faculty/:id/assign-course/:courseId", requireAuth, async (req: Request, res: Response) => {
    try {
      const { id, courseId } = req.params;
      const user = (req as any).user;
      
      // Authorization check: Only faculty can unassign their own courses, or admins can unassign for any faculty
      if (user.role === 'faculty') {
        if (user.userId !== id) {
          return res.status(403).json({ message: "You can only unassign courses for yourself" });
        }
      } else if (user.role !== 'admin') {
        return res.status(403).json({ message: "Insufficient permissions to unassign courses for faculty" });
      }
      
      // Get faculty
      const facultyMember = await storage.getFacultyMember(id);
      if (!facultyMember) {
        return res.status(404).json({ message: "Faculty member not found" });
      }
      
      // Check if faculty is assigned to the course
      const assignedCourses = facultyMember.assignedCourses || [];
      if (!assignedCourses.includes(courseId)) {
        return res.status(400).json({ message: "Faculty is not assigned to this course" });
      }
      
      // Remove course from faculty's assigned courses
      const updatedFaculty = await storage.updateFaculty(id, {
        assignedCourses: assignedCourses.filter(id => id !== courseId)
      });
      
      res.json({ 
        message: "Successfully unassigned from course",
        faculty: updatedFaculty
      });
      
    } catch (error) {
      console.error("Course unassignment error:", error);
      res.status(500).json({ message: "Failed to unassign from course" });
    }
  });

  app.get("/api/faculty/:id/available-courses", requireAuth, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const user = (req as any).user;
      
      console.log(`Available courses request for faculty ${id} by user ${user.userId} (${user.role})`);
      
      // Authorization check: Only faculty can view their own available courses, or admins can view for any faculty
      if (user.role === 'faculty') {
        if (user.userId !== id) {
          return res.status(403).json({ message: "You can only view your own available courses" });
        }
      } else if (user.role !== 'admin') {
        return res.status(403).json({ message: "Insufficient permissions to view faculty course data" });
      }
      
      // Get faculty
      const facultyMember = await storage.getFacultyMember(id);
      if (!facultyMember) {
        console.error(`Faculty member not found: ${id}`);
        return res.status(404).json({ message: "Faculty member not found" });
      }
      
      console.log(`Faculty found: ${facultyMember.firstName} ${facultyMember.lastName}`);
      console.log(`Faculty assigned courses: ${facultyMember.assignedCourses || []}`);
      
      // Get all active courses
      const allCourses = await storage.getCourses();
      console.log(`Found ${allCourses.length} total courses`);
      
      // Filter to show only active courses that faculty is not already assigned to
      const assignedCourses = facultyMember.assignedCourses || [];
      const availableCourses = allCourses.filter(course => 
        course.isActive && !assignedCourses.includes(course.id)
      );
      
      console.log(`Filtered to ${availableCourses.length} available courses`);
      
      res.json(availableCourses);
      
    } catch (error) {
      console.error("Available courses error:", error);
      console.error("Error stack:", error instanceof Error ? error.stack : 'No stack trace');
      res.status(500).json({ 
        message: "Failed to fetch available courses",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  app.get("/api/faculty/:id/assigned-courses", requireAuth, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const user = (req as any).user;
      
      // Authorization check: Only faculty can view their own assigned courses, or admins can view for any faculty
      if (user.role === 'faculty') {
        if (user.userId !== id) {
          return res.status(403).json({ message: "You can only view your own assigned courses" });
        }
      } else if (user.role !== 'admin') {
        return res.status(403).json({ message: "Insufficient permissions to view faculty course data" });
      }
      
      // Get faculty
      const facultyMember = await storage.getFacultyMember(id);
      if (!facultyMember) {
        return res.status(404).json({ message: "Faculty member not found" });
      }
      
      // Get assigned courses details using Promise.all for parallel fetching
      const assignedCourses = facultyMember.assignedCourses || [];
      const coursePromises = assignedCourses.map(courseId => 
        storage.getCourse(courseId)
      );
      const courses = await Promise.all(coursePromises);
      
      // Filter out any null results (courses that don't exist)
      const assignedCourseDetails = courses.filter(course => course !== null);
      
      res.json(assignedCourseDetails);
      
    } catch (error) {
      console.error("Assigned courses error:", error);
      res.status(500).json({ message: "Failed to fetch assigned courses" });
    }
  });

  // Courses routes
  app.get("/api/courses", async (req: Request, res: Response) => {
    try {
      const courses = await storage.getCourses();
      res.json(courses);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch courses" });
    }
  });

  // Bulk import courses from CSV/Excel
  app.post("/api/courses/import", requireAuth, requireRole(['admin']), async (req: Request, res: Response) => {
    try {
      const { courses } = req.body;
      const results = [];
      
      for (const courseData of courses) {
        try {
          const course = await storage.createCourse({
            courseCode: courseData.courseCode,
            courseName: courseData.courseName,
            credits: parseInt(courseData.credits) || 3,
            courseType: courseData.courseType || 'theory',
            program: courseData.program || 'General',
            semester: parseInt(courseData.semester) || 1,
            theoryHours: parseInt(courseData.theoryHours) || 3,
            practicalHours: parseInt(courseData.practicalHours) || 0,
            isActive: true,
            prerequisites: courseData.prerequisites ? courseData.prerequisites.split(',').map((p: string) => p.trim()) : []
          });
          results.push({ success: true, courseCode: courseData.courseCode, id: course.id });
        } catch (error) {
          results.push({ 
            success: false, 
            courseCode: courseData.courseCode, 
            error: error instanceof Error ? error.message : 'Unknown error' 
          });
        }
      }
      
      res.json({ 
        message: `Imported ${results.filter(r => r.success).length} of ${courses.length} courses`,
        results 
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to import courses" });
    }
  });

  app.get("/api/courses/:id", async (req: Request, res: Response) => {
    try {
      const course = await storage.getCourse(req.params.id);
      if (!course) {
        return res.status(404).json({ message: "Course not found" });
      }
      res.json(course);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch course" });
    }
  });

  app.post("/api/courses", async (req: Request, res: Response) => {
    try {
      const validatedData = insertCourseSchema.parse(req.body);
      const course = await storage.createCourse(validatedData);
      res.status(201).json(course);
    } catch (error) {
      res.status(400).json({ message: "Invalid course data" });
    }
  });

  app.put("/api/courses/:id", async (req: Request, res: Response) => {
    try {
      const course = await storage.updateCourse(req.params.id, req.body);
      if (!course) {
        return res.status(404).json({ message: "Course not found" });
      }
      res.json(course);
    } catch (error) {
      res.status(500).json({ message: "Failed to update course" });
    }
  });

  app.delete("/api/courses/:id", async (req: Request, res: Response) => {
    try {
      const success = await storage.deleteCourse(req.params.id);
      if (!success) {
        return res.status(404).json({ message: "Course not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete course" });
    }
  });

  // Rooms routes
  app.get("/api/rooms", async (req: Request, res: Response) => {
    try {
      const rooms = await storage.getRooms();
      res.json(rooms);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch rooms" });
    }
  });

  // Bulk import rooms from CSV/Excel
  app.post("/api/rooms/import", requireAuth, requireRole(['admin']), async (req: Request, res: Response) => {
    try {
      const { rooms } = req.body;
      const results = [];
      
      for (const roomData of rooms) {
        try {
          const room = await storage.createRoom({
            roomNumber: roomData.roomNumber,
            roomName: roomData.roomName || roomData.roomNumber,
            roomType: roomData.roomType || 'Classroom',
            capacity: parseInt(roomData.capacity) || 30,
            location: roomData.location || '',
            equipment: roomData.equipment ? roomData.equipment.split(',').map((e: string) => e.trim()) : [],
            isAvailable: roomData.isAvailable !== 'false',
            maintenanceSchedule: []
          });
          results.push({ success: true, roomNumber: roomData.roomNumber, id: room.id });
        } catch (error) {
          results.push({ 
            success: false, 
            roomNumber: roomData.roomNumber, 
            error: error instanceof Error ? error.message : 'Unknown error' 
          });
        }
      }
      
      res.json({ 
        message: `Imported ${results.filter(r => r.success).length} of ${rooms.length} rooms`,
        results 
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to import rooms" });
    }
  });

  app.get("/api/rooms/:id", async (req: Request, res: Response) => {
    try {
      const room = await storage.getRoom(req.params.id);
      if (!room) {
        return res.status(404).json({ message: "Room not found" });
      }
      res.json(room);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch room" });
    }
  });

  app.post("/api/rooms", async (req: Request, res: Response) => {
    try {
      const validatedData = insertRoomSchema.parse(req.body);
      const room = await storage.createRoom(validatedData);
      res.status(201).json(room);
    } catch (error) {
      res.status(400).json({ message: "Invalid room data" });
    }
  });

  app.put("/api/rooms/:id", async (req: Request, res: Response) => {
    try {
      const room = await storage.updateRoom(req.params.id, req.body);
      if (!room) {
        return res.status(404).json({ message: "Room not found" });
      }
      res.json(room);
    } catch (error) {
      res.status(500).json({ message: "Failed to update room" });
    }
  });

  app.delete("/api/rooms/:id", async (req: Request, res: Response) => {
    try {
      const success = await storage.deleteRoom(req.params.id);
      if (!success) {
        return res.status(404).json({ message: "Room not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete room" });
    }
  });

  // Timetables routes
  app.get("/api/timetables", async (req: Request, res: Response) => {
    try {
      const timetables = await storage.getTimetables();
      res.json(timetables);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch timetables" });
    }
  });

  app.get("/api/timetables/:id", async (req: Request, res: Response) => {
    try {
      const timetable = await storage.getTimetable(req.params.id);
      if (!timetable) {
        return res.status(404).json({ message: "Timetable not found" });
      }
      res.json(timetable);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch timetable" });
    }
  });

  app.get("/api/timetables/:id/slots", async (req: Request, res: Response) => {
    try {
      const timetableId = req.params.id;
      const slots = await storage.getTimetableSlots(timetableId);

      // Join with master data to enrich for display
      const [courses, faculty, rooms, students] = await Promise.all([
        storage.getCourses(),
        storage.getFaculty(),
        storage.getRooms(),
        storage.getStudents(),
      ]);

      const courseMap = new Map(courses.map(c => [c.id, c]));
      const facultyMap = new Map(faculty.map(f => [f.id, f]));
      const roomMap = new Map(rooms.map(r => [r.id, r]));

      // Compute enrolled count per course (class strength)
      const courseCounts = new Map<string, number>();
      for (const s of students) {
        const enrolled = Array.isArray(s.enrolledCourses) ? s.enrolledCourses : [];
        for (const cid of enrolled) {
          courseCounts.set(cid, (courseCounts.get(cid) || 0) + 1);
        }
      }

      const enriched = slots.map(slot => {
        const c = slot.courseId ? courseMap.get(slot.courseId) : undefined;
        const f = slot.facultyId ? facultyMap.get(slot.facultyId) : undefined;
        const r = slot.roomId ? roomMap.get(slot.roomId) : undefined;
        return {
          ...slot,
          courseCode: c?.courseCode || null,
          courseName: c?.courseName || null,
          courseType: c?.courseType || null,
          facultyName: f ? `${f.firstName} ${f.lastName}` : null,
          roomNumber: r?.roomNumber || null,
          roomType: r?.roomType || null,
          classStrength: courseCounts.get(slot.courseId) || 0,
        };
      });

      res.json(enriched);
    } catch (error) {
      console.error("Fetch timetable slots error:", error);
      res.status(500).json({ message: "Failed to fetch timetable slots" });
    }
  });

  app.post("/api/timetables", async (req: Request, res: Response) => {
    try {
      const validatedData = insertTimetableSchema.parse(req.body);
      const timetable = await storage.createTimetable(validatedData);
      res.status(201).json(timetable);
    } catch (error) {
      res.status(400).json({ message: "Invalid timetable data" });
    }
  });

  // Get TimeSlotTemplates endpoint
  app.get("/api/timeslot-templates", async (req: Request, res: Response) => {
    try {
      const templates = await storage.getTimeSlotTemplates();
      res.json(templates);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch time slot templates" });
    }
  });

  // Base timetable generation endpoint
  app.post("/api/timetables/generate-base", async (req: Request, res: Response) => {
    try {
      const { program: inputProgram, semester: inputSemester, batch: inputBatch, academicYear } = req.body || {};

      // Enforce only one base timetable exists at a time
      const existingTimetables = await storage.getTimetables();
      const existingBase = existingTimetables.find(t => t.generatedBy === 'base-template');
      if (existingBase) {
        return res.status(409).json({
          success: false,
          message: "A base timetable already exists. Delete it before generating a new one.",
          timetableId: existingBase.id,
        });
      }

      // Optional scoping; defaults to college-wide base
      const program = inputProgram || 'ALL';
      const semester = inputSemester ? parseInt(inputSemester) : 0; // 0 => all semesters
      const batch = inputBatch || 'ALL';

      // Get existing courses, filter if scoped
      const existingCourses = await storage.getCourses();
      const filteredCourses = existingCourses.filter(course =>
        (program === 'ALL' || course.program === program) &&
        (semester === 0 || course.semester === semester) &&
        course.isActive
      );
      const coursesToUse = filteredCourses.length > 0 ? filteredCourses : existingCourses.slice(0, 10);

      const getCourseCodeForSlot = (slotIndex: number) => {
        if (coursesToUse.length === 0) return "FREE";
        return coursesToUse[slotIndex % coursesToUse.length].courseCode;
      };

      const timeSlots = [
        { id: "slot-1", startTime: "08:00", endTime: "08:50", duration: 50, type: "theory" },
        { id: "slot-2", startTime: "09:00", endTime: "09:50", duration: 50, type: "theory" },
        { id: "slot-3", startTime: "10:00", endTime: "10:50", duration: 50, type: "theory" },
        { id: "slot-4", startTime: "11:00", endTime: "11:50", duration: 50, type: "theory" },
        { id: "slot-5", startTime: "12:00", endTime: "12:50", duration: 50, type: "theory" },
        { id: "lunch", startTime: "12:50", endTime: "13:50", duration: 60, type: "break" },
        { id: "slot-6", startTime: "14:00", endTime: "14:50", duration: 50, type: "theory" },
        { id: "slot-7", startTime: "15:00", endTime: "15:50", duration: 50, type: "theory" },
        { id: "slot-8", startTime: "16:00", endTime: "16:50", duration: 50, type: "theory" },
        { id: "slot-9", startTime: "17:00", endTime: "17:50", duration: 50, type: "theory" },
        { id: "slot-10", startTime: "18:00", endTime: "18:50", duration: 50, type: "theory" },
        { id: "slot-11", startTime: "19:00", endTime: "19:50", duration: 50, type: "theory" }
      ];

      const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      const slots: any[] = [];
      let slotCounter = 0;

      days.forEach((day) => {
        timeSlots.forEach((timeSlot, slotIndex) => {
          if (timeSlot.type !== "break") {
            const courseCode = getCourseCodeForSlot(slotCounter);
            const slotType = slotIndex >= 8 ? "lab" : "theory";
            slots.push({
              id: `${day.toLowerCase().substr(0,3)}-${slotIndex + 1}`,
              dayOfWeek: day,
              startTime: timeSlot.startTime,
              endTime: timeSlot.endTime,
              courseCode: courseCode,
              slotType: slotType
            });
            slotCounter++;
          }
        });
      });

      const baseTimetable = {
        name: `Base Timetable - ${program}${semester ? ` Semester ${semester}` : ''}`,
        program,
        semester,
        batch,
        academicYear,
        sectionId: null,
        status: "active",
        generatedBy: "base-template",
        schedule: {
          timeSlots,
          workingDays: days,
          graceTime: 10,
          lunchBreak: { startTime: "12:50", endTime: "13:50", duration: 60 }
        },
        slots,
        conflicts: [],
        optimizationScore: 85
      };

      const timeSlotTemplate = {
        templateName: `${program}${semester ? ` Semester ${semester}` : ''} - Base Template`,
        workingDays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
        startTime: "08:00",
        endTime: "19:50",
        periodDuration: 50,
        labBlockDuration: 50,
        dailyPeriods: baseTimetable.schedule.timeSlots,
        breaks: [baseTimetable.schedule.lunchBreak],
        isDefault: false,
        program,
        semester,
        batch,
        academicYear,
        slotMapping: baseTimetable.slots
      };

      const savedTemplate = await storage.createTimeSlotTemplate(timeSlotTemplate);
      const savedTimetable = await storage.createTimetable({
        ...baseTimetable,
        timeSlotTemplateId: savedTemplate.id
      });

      const existingFaculty = await storage.getFaculty();
      const existingRooms = await storage.getRooms();
      const courseCodeMap = new Map(existingCourses.map(c => [c.courseCode, c.id]));

      const savedSlots: any[] = [];
      for (const slot of baseTimetable.slots) {
        const matchedCourseId = courseCodeMap.get(slot.courseCode) || (existingCourses.length > 0 ? existingCourses[0].id : "placeholder-course");
        const timetableSlot = {
          timetableId: savedTimetable.id,
          courseId: matchedCourseId,
          facultyId: existingFaculty.length > 0 ? existingFaculty[0].id : "placeholder-faculty",
          roomId: existingRooms.length > 0 ? existingRooms[0].id : "placeholder-room",
          sectionIds: ["placeholder-section"],
          dayOfWeek: slot.dayOfWeek,
          startTime: slot.startTime,
          endTime: slot.endTime,
          slotType: slot.slotType,
          isLabBlock: slot.slotType === "lab",
          specialInstructions: `Course Code: ${slot.courseCode}`
        };
        const savedSlot = await storage.createTimetableSlot(timetableSlot);
        savedSlots.push(savedSlot);
      }

      res.json({
        success: true,
        message: "Base timetable and template created successfully",
        timetable: savedTimetable,
        template: savedTemplate,
        slots: savedSlots,
        slotsCount: savedSlots.length
      });

    } catch (error) {
      console.error("Base timetable generation error:", error);
      res.status(500).json({ 
        success: false, 
        message: "Failed to generate base timetable",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // AI-powered timetable generation
  app.post("/api/timetables/generate", async (req: Request, res: Response) => {
    try {
      const { program, semester, batch, academicYear, constraints } = req.body;
      
      // Fetch required data
      const courses = await storage.getCourses();
      const faculty = await storage.getFaculty();
      const rooms = await storage.getRooms();
      
      // Filter courses for the specific program and semester
      const filteredCourses = courses.filter(course => 
        course.program === program && course.semester === semester && course.isActive
      );

      const generationRequest = {
        program,
        semester,
        batch,
        academicYear,
        courses: filteredCourses.map(course => ({
          id: course.id,
          courseCode: course.courseCode,
          courseName: course.courseName,
          courseType: course.courseType,
          credits: course.credits,
          theoryHours: course.theoryHours || 0,
          practicalHours: course.practicalHours || 0,
        })),
        faculty: faculty.filter(f => f.isActive).map(f => ({
          id: f.id,
          firstName: f.firstName,
          lastName: f.lastName,
          expertise: Array.isArray(f.expertise) ? f.expertise : [],
          maxWorkload: f.maxWorkload || 20,
          availability: (typeof f.availability === 'object' && f.availability !== null) ? f.availability as Record<string, string[]> : {},
        })),
        rooms: rooms.filter(r => r.isAvailable).map(r => ({
          id: r.id,
          roomNumber: r.roomNumber,
          roomType: r.roomType,
          capacity: r.capacity,
          equipment: Array.isArray(r.equipment) ? r.equipment : [],
        })),
        constraints: constraints || {
          minimizeFacultyConflicts: true,
          optimizeRoomUtilization: true,
          balanceWorkloadDistribution: true,
          considerStudentPreferences: false,
        },
      };

      const aiResult = await generateTimetableWithAI(generationRequest);

      // Create timetable record
      const timetable = await storage.createTimetable({
        name: `${program} Semester ${semester} - ${batch}`,
        program,
        semester,
        batch,
        academicYear,
        schedule: aiResult.schedule,
        conflicts: aiResult.conflicts,
        optimizationScore: aiResult.optimizationScore,
        status: 'draft',
        generatedBy: 'AI',
      });

      // Create timetable slots
      for (const slot of aiResult.schedule) {
        await storage.createTimetableSlot({
          timetableId: timetable.id,
          courseId: slot.courseId,
          facultyId: slot.facultyId,
          roomId: slot.roomId,
          sectionIds: [],
          dayOfWeek: slot.dayOfWeek,
          startTime: slot.startTime,
          endTime: slot.endTime,
          slotType: slot.slotType,
          isLabBlock: false,
        });
      }

      res.json({
        timetable,
        aiResult,
      });
    } catch (error) {
      console.error('AI generation error:', error);
      res.status(500).json({ 
        message: "Failed to generate timetable with AI",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // AI Engine Optimization Endpoints
  
  // Advanced AI optimization with constraint satisfaction
  app.post("/api/ai/optimize-timetable", requireAuth, requireRole(['admin']), async (req: Request, res: Response) => {
    try {
      const { program, semester, batch, academic_year, algorithm = "constraint_solver", constraints = {} } = req.body;
      
      // Fetch data from database
      const courses = await storage.getCourses();
      const faculty = await storage.getFaculty();
      const rooms = await storage.getRooms();
      const students = await storage.getStudents();
      
      // Validate required data
      if (!courses.length) {
        return res.status(400).json({
          success: false,
          message: "No courses found. Please add courses before generating timetable.",
          error: "Missing courses data"
        });
      }

      if (!faculty.length) {
        return res.status(400).json({
          success: false,
          message: "No faculty found. Please add faculty before generating timetable.",
          error: "Missing faculty data"
        });
      }

      if (!rooms.length) {
        return res.status(400).json({
          success: false,
          message: "No rooms found. Please add rooms before generating timetable.",
          error: "Missing rooms data"
        });
      }
      
      // Generate time slots based on working hours
      const time_slots = [
        { day: "Monday", start_time: "09:00", end_time: "10:00", duration: 60 },
        { day: "Monday", start_time: "10:00", end_time: "11:00", duration: 60 },
        { day: "Monday", start_time: "11:00", end_time: "12:00", duration: 60 },
        { day: "Monday", start_time: "14:00", end_time: "15:00", duration: 60 },
        { day: "Monday", start_time: "15:00", end_time: "16:00", duration: 60 },
        { day: "Tuesday", start_time: "09:00", end_time: "10:00", duration: 60 },
        { day: "Tuesday", start_time: "10:00", end_time: "11:00", duration: 60 },
        { day: "Tuesday", start_time: "11:00", end_time: "12:00", duration: 60 },
        { day: "Tuesday", start_time: "14:00", end_time: "15:00", duration: 60 },
        { day: "Tuesday", start_time: "15:00", end_time: "16:00", duration: 60 },
        { day: "Wednesday", start_time: "09:00", end_time: "10:00", duration: 60 },
        { day: "Wednesday", start_time: "10:00", end_time: "11:00", duration: 60 },
        { day: "Wednesday", start_time: "11:00", end_time: "12:00", duration: 60 },
        { day: "Wednesday", start_time: "14:00", end_time: "15:00", duration: 60 },
        { day: "Wednesday", start_time: "15:00", end_time: "16:00", duration: 60 },
        { day: "Thursday", start_time: "09:00", end_time: "10:00", duration: 60 },
        { day: "Thursday", start_time: "10:00", end_time: "11:00", duration: 60 },
        { day: "Thursday", start_time: "11:00", end_time: "12:00", duration: 60 },
        { day: "Thursday", start_time: "14:00", end_time: "15:00", duration: 60 },
        { day: "Thursday", start_time: "15:00", end_time: "16:00", duration: 60 },
        { day: "Friday", start_time: "09:00", end_time: "10:00", duration: 60 },
        { day: "Friday", start_time: "10:00", end_time: "11:00", duration: 60 },
        { day: "Friday", start_time: "11:00", end_time: "12:00", duration: 60 },
        { day: "Friday", start_time: "14:00", end_time: "15:00", duration: 60 },
        { day: "Friday", start_time: "15:00", end_time: "16:00", duration: 60 }
      ];

      const optimizationRequest = {
        courses: courses.map(course => ({
          id: course.id,
          course_code: course.courseCode,
          course_name: course.courseName,
          credits: course.credits,
          course_type: (course.courseType || 'theory').toLowerCase(),
          expected_students: 30,
          requires_consecutive_slots: course.courseType === "laboratory"
        })),
        faculty: faculty.map(f => ({
          id: f.id,
          name: `${f.firstName} ${f.lastName}`,
          email: f.email || `${f.firstName.toLowerCase()}.${f.lastName.toLowerCase()}@university.edu`,
          expertise: f.expertise || [],
          max_hours_per_week: f.maxWorkload || 40,
          preferred_days: Object.keys(f.availability || {}),
          unavailable_slots: []
        })),
        rooms: rooms.map(r => ({
          id: r.id,
          room_number: r.roomNumber,
          room_name: r.roomName || r.roomNumber,
          capacity: r.capacity || 30,
          room_type: r.roomType || 'classroom',
          equipment: r.equipment || []
        })),
        students: students.map(student => ({
          id: student.id,
          student_id: student.studentId,
          name: `${student.firstName} ${student.lastName}`,
          program: student.program,
          semester: student.semester,
          enrolled_courses: student.enrolledCourses || []
        })),
        time_slots,
        constraints: {
          max_hours_per_day: constraints?.max_hours_per_day || 8,
          min_break_duration: constraints?.min_break_duration || 15,
          lunch_break_duration: constraints?.lunch_break_duration || 60,
          lunch_break_start: constraints?.lunch_break_start || "12:00",
          consecutive_lab_slots: constraints?.consecutive_lab_slots || true,
          max_consecutive_hours: constraints?.max_consecutive_hours || 3
        },
        program,
        semester,
        batch,
        academic_year
      };

      console.log("Sending optimization request to AI engine...");
      console.log("Request summary:", {
        courses: optimizationRequest.courses.length,
        faculty: optimizationRequest.faculty.length,
        rooms: optimizationRequest.rooms.length,
        students: optimizationRequest.students.length,
        time_slots: optimizationRequest.time_slots.length,
        algorithm
      });

      // Call AI optimization service
      const result = await aiEngineClient.optimizeTimetable(optimizationRequest, algorithm);

      if (result.success) {
        // Store the timetable in database
        const timetable = await storage.createTimetable({
          name: `AI Generated Timetable - ${program} Sem ${semester}`,
          program,
          semester,
          batch,
          academicYear: academic_year,
          schedule: result.timetable_slots.map(slot => ({
            day: slot.day,
            startTime: slot.start_time,
            endTime: slot.end_time,
            courseId: slot.course_id,
            facultyId: slot.faculty_id,
            roomId: slot.room_id
          })),
          conflicts: result.conflicts,
          optimizationScore: result.optimization_score,
          status: 'draft',
          generatedBy: 'AI Engine',
        });

        res.json({
          success: true,
          timetable,
          optimization_result: result,
          message: `Timetable optimized using ${result.algorithm_used}`
        });
      } else {
        res.status(400).json({
          success: false,
          message: "Optimization failed",
          warnings: result.warnings,
          algorithm_used: result.algorithm_used
        });
      }

    } catch (error) {
      console.error("AI optimization error:", error);
      res.status(500).json({ 
        success: false,
        message: "AI optimization failed", 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  });

  // Analyze existing timetable for conflicts using AI
  app.post("/api/ai/analyze-conflicts", requireAuth, async (req: Request, res: Response) => {
    try {
      const { timetableSlots } = req.body;
      
      if (!Array.isArray(timetableSlots)) {
        return res.status(400).json({ message: "Invalid timetable slots data" });
      }

      const analysis = await aiEngineClient.analyzeConflicts(timetableSlots);
      res.json(analysis);

    } catch (error) {
      console.error("AI conflict analysis error:", error);
      res.status(500).json({ 
        message: "Failed to analyze conflicts", 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  });

  // Comprehensive AI System Endpoints
  
  // Save comprehensive admin configuration
  app.post("/api/comprehensive/admin/config", requireAuth, requireRole(['admin']), async (req: Request, res: Response) => {
    try {
      const result = await aiEngineClient.saveComprehensiveAdminConfig(req.body);
      res.json(result);
    } catch (error) {
      console.error("Comprehensive admin config save error:", error);
      res.status(500).json({ 
        message: "Failed to save comprehensive admin config", 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  });

  // Generate comprehensive time slots
  app.post("/api/comprehensive/generate-slots", requireAuth, requireRole(['admin']), async (req: Request, res: Response) => {
    try {
      const result = await aiEngineClient.generateComprehensiveSlots(req.body);
      res.json(result);
    } catch (error) {
      console.error("Comprehensive slot generation error:", error);
      res.status(500).json({ 
        message: "Failed to generate comprehensive slots", 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  });

  // Create comprehensive sections
  app.post("/api/comprehensive/sectioning", requireAuth, requireRole(['admin']), async (req: Request, res: Response) => {
    try {
      const result = await aiEngineClient.createComprehensiveSections(req.body);
      res.json(result);
    } catch (error) {
      console.error("Comprehensive sectioning error:", error);
      res.status(500).json({ 
        message: "Failed to create comprehensive sections", 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  });

  // Generate comprehensive timetable using OR-Tools CP-SAT
  app.post("/api/comprehensive/generate-timetable", requireAuth, requireRole(['admin']), async (req: Request, res: Response) => {
    try {
      const result = await aiEngineClient.generateComprehensiveTimetable(req.body);
      res.json(result);
    } catch (error) {
      console.error("Comprehensive timetable generation error:", error);
      res.status(500).json({ 
        message: "Failed to generate comprehensive timetable", 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  });

  app.delete("/api/timetables/:id", async (req: Request, res: Response) => {
    try {
      // Delete associated slots first
      await storage.deleteTimetableSlots(req.params.id);
      
      const success = await storage.deleteTimetable(req.params.id);
      if (!success) {
        return res.status(404).json({ message: "Timetable not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete timetable" });
    }
  });

  // Clear and populate database with fresh data
  app.post("/api/populate", async (req: Request, res: Response) => {
    try {
      // Clear existing data
      console.log('Clearing existing data...');
      await storage.clearAllData();
      
      // Seed 50 Rooms
      console.log('Creating rooms...');
      const roomTypes = ["Lecture Hall", "Laboratory", "Seminar Room", "Computer Lab", "Library", "Auditorium", "Conference Room", "Tutorial Room"];
      const buildings = ["Main Block", "Science Block", "Arts Block", "Admin Block", "Engineering Block"];
      const equipment = [
        ["Projector", "WiFi", "Air Conditioning", "Whiteboard"],
        ["Computer Lab Setup", "Internet", "Printers", "Scanners"],
        ["Laboratory Equipment", "Safety Measures", "Fume Hoods"],
        ["Audio System", "Microphones", "Lighting", "Podium"],
        ["Interactive Board", "Video Conferencing", "Sound System"]
      ];

      for (let i = 1; i <= 50; i++) {
        const roomType = roomTypes[i % roomTypes.length];
        const building = buildings[i % buildings.length];
        const roomEquipment = equipment[i % equipment.length];
        
        await storage.createRoom({
          roomNumber: `R${String(i).padStart(3, '0')}`,
          roomName: `${roomType} ${i}`,
          roomType,
          capacity: Math.floor(Math.random() * 80) + 30, // 30-109 capacity
          location: `${building} - Floor ${Math.ceil(i / 10)}`,
          equipment: roomEquipment,
          isAvailable: true,
          maintenanceSchedule: []
        });
      }

      // Seed 100 Students
      console.log('Creating 100 students...');
      const firstNames = ["Aarav", "Aditi", "Arjun", "Anjali", "Akash", "Anita", "Abhay", "Asha", "Arun", "Deepika",
        "Dev", "Divya", "Harish", "Isha", "Karan", "Kavya", "Manish", "Meera", "Neeraj", "Nikita",
        "Priya", "Rahul", "Rohit", "Sasha", "Shreya", "Siddharth", "Sneha", "Suresh", "Tanvi", "Varun"];
      const lastNames = ["Sharma", "Verma", "Gupta", "Singh", "Kumar", "Patel", "Agarwal", "Jain", "Yadav", "Mishra"];
      const programs = ["Computer Science", "Information Technology", "Electronics", "Mechanical", "Civil"];
      const departments = ["CSE", "IT", "ECE", "ME", "CE"];

      for (let i = 1; i <= 100; i++) {
        const firstName = firstNames[i % firstNames.length];
        const lastName = lastNames[i % lastNames.length];
        const program = programs[i % programs.length];
        const department = departments[i % departments.length];
        
        const plainPassword = `${firstName}@123`;
        await storage.createStudent({
          studentId: `ST${String(i).padStart(4, '0')}`,
          firstName,
          lastName,
          email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}${i}@student.edu`,
          password: `hashed_${plainPassword}`,
          plainPassword,
          phone: `+91${String(9000000000 + i)}`,
          program,
          semester: (i % 8) + 1, // 1-8 semesters
          batch: `2024-${(2024 + Math.floor((i % 8) / 2))}`,
          enrolledCourses: [],
          preferences: {},
          isActive: true
        });
      }

      // Seed Faculty Data
      const facultyNames = [
        { firstName: "Dr. Rajesh", lastName: "Kumar" },
        { firstName: "Prof. Sunita", lastName: "Sharma" },
        { firstName: "Dr. Amit", lastName: "Patel" },
        { firstName: "Prof. Kavita", lastName: "Singh" },
        { firstName: "Dr. Vikram", lastName: "Gupta" },
        { firstName: "Prof. Meera", lastName: "Agarwal" },
        { firstName: "Dr. Suresh", lastName: "Verma" },
        { firstName: "Prof. Anita", lastName: "Jain" },
        { firstName: "Dr. Ravi", lastName: "Yadav" },
        { firstName: "Prof. Deepika", lastName: "Mishra" },
        { firstName: "Dr. Karan", lastName: "Tiwari" },
        { firstName: "Prof. Sonia", lastName: "Chopra" },
        { firstName: "Dr. Manoj", lastName: "Srivastava" },
        { firstName: "Prof. Priya", lastName: "Bansal" },
        { firstName: "Dr. Anil", lastName: "Saxena" }
      ];

      const designations = ["Professor", "Associate Professor", "Assistant Professor", "Lecturer"];
      const expertiseAreas = [
        ["Data Structures", "Algorithms", "Programming"],
        ["Database Systems", "Software Engineering", "Web Development"],
        ["Machine Learning", "AI", "Data Science"],
        ["Computer Networks", "Cybersecurity", "System Administration"],
        ["Mobile Development", "UI/UX", "Frontend Technologies"]
      ];

      for (let i = 0; i < facultyNames.length; i++) {
        const faculty = facultyNames[i];
        const designation = designations[i % designations.length];
        const expertise = expertiseAreas[i % expertiseAreas.length];
        const department = departments[i % departments.length];
        
        const plainPassword = `${faculty.firstName}@123`;
        await storage.createFaculty({
          facultyId: `FAC${String(i + 1).padStart(3, '0')}`,
          firstName: faculty.firstName,
          lastName: faculty.lastName,
          email: `${faculty.firstName.toLowerCase().replace(/[^a-z]/g, '')}.${faculty.lastName.toLowerCase()}@college.edu`,
          password: `hashed_${plainPassword}`,
          plainPassword,
          phone: `+91${String(9500000000 + i)}`,
          department,
          designation,
          expertise,
          maxWorkload: 20,
          availability: {
            Monday: ["09:00-12:00", "14:00-17:00"],
            Tuesday: ["09:00-12:00", "14:00-17:00"],
            Wednesday: ["09:00-12:00", "14:00-17:00"],
            Thursday: ["09:00-12:00", "14:00-17:00"],
            Friday: ["09:00-12:00", "14:00-17:00"]
          },
          assignedCourses: [],
          isActive: true
        });
      }

      // Seed some sample courses
      const courses = [
        { code: "CS101", name: "Programming Fundamentals", type: "Core", credits: 4, theoryHours: 3, practicalHours: 2 },
        { code: "CS102", name: "Data Structures", type: "Core", credits: 4, theoryHours: 3, practicalHours: 2 },
        { code: "CS201", name: "Database Management", type: "Core", credits: 3, theoryHours: 3, practicalHours: 1 },
        { code: "CS202", name: "Web Development", type: "Lab", credits: 3, theoryHours: 1, practicalHours: 4 },
        { code: "CS301", name: "Machine Learning", type: "Elective", credits: 4, theoryHours: 3, practicalHours: 2 }
      ];

      for (let i = 0; i < courses.length; i++) {
        const course = courses[i];
        await storage.createCourse({
          courseCode: course.code,
          courseName: course.name,
          courseType: course.type,
          credits: course.credits,
          theoryHours: course.theoryHours,
          practicalHours: course.practicalHours,
          program: "Computer Science",
          semester: Math.floor(i / 2) + 1,
          prerequisites: [],
          description: `Course covering ${course.name} concepts and practical applications`,
          isActive: true
        });
      }

      res.json({ 
        message: "Database populated successfully with fresh data",
        seeded: true,
        data: {
          rooms: 50,
          students: 100,
          faculty: facultyNames.length,
          courses: courses.length
        }
      });
    } catch (error) {
      console.error("Error populating database:", error);
      res.status(500).json({ message: "Failed to populate database", error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Database seeding endpoint - Admin only
  app.post("/api/seed", requireAuth, requireRole(['admin']), async (req: Request, res: Response) => {
    try {
      // Check if data already exists
      const existingRooms = await storage.getRooms();
      const existingStudents = await storage.getStudents();
      const existingFaculty = await storage.getFaculty();
      
      if (existingRooms.length > 10 || existingStudents.length > 10 || existingFaculty.length > 5) {
        return res.json({ message: "Database already contains sample data", seeded: false });
      }

      // Seed 30 Rooms
      const roomTypes = ["Lecture Hall", "Laboratory", "Seminar Room", "Computer Lab", "Library", "Auditorium"];
      const buildings = ["Main Block", "Science Block", "Arts Block", "Admin Block"];
      const equipment = [
        ["Projector", "WiFi", "Air Conditioning"],
        ["Whiteboard", "Computer", "Internet"],
        ["Laboratory Equipment", "Safety Measures"],
        ["Audio System", "Microphones", "Lighting"]
      ];

      for (let i = 1; i <= 30; i++) {
        const roomType = roomTypes[i % roomTypes.length];
        const building = buildings[i % buildings.length];
        const roomEquipment = equipment[i % equipment.length];
        
        await storage.createRoom({
          roomNumber: `R${String(i).padStart(3, '0')}`,
          roomName: `${roomType} ${i}`,
          roomType,
          capacity: Math.floor(Math.random() * 100) + 20, // 20-119 capacity
          location: `${building} - Floor ${Math.ceil(i / 10)}`,
          equipment: roomEquipment,
          isAvailable: true,
          maintenanceSchedule: []
        });
      }

      // Seed 100 Students
      const firstNames = ["Aarav", "Aditi", "Arjun", "Anjali", "Akash", "Anita", "Abhay", "Asha", "Arun", "Deepika",
        "Dev", "Divya", "Harish", "Isha", "Karan", "Kavya", "Manish", "Meera", "Neeraj", "Nikita",
        "Priya", "Rahul", "Rohit", "Sasha", "Shreya", "Siddharth", "Sneha", "Suresh", "Tanvi", "Varun"];
      const lastNames = ["Sharma", "Verma", "Gupta", "Singh", "Kumar", "Patel", "Agarwal", "Jain", "Yadav", "Mishra"];
      const programs = ["Computer Science", "Information Technology", "Electronics", "Mechanical", "Civil"];
      const departments = ["CSE", "IT", "ECE", "ME", "CE"];

      for (let i = 1; i <= 100; i++) {
        const firstName = firstNames[i % firstNames.length];
        const lastName = lastNames[i % lastNames.length];
        const program = programs[i % programs.length];
        const department = departments[i % departments.length];
        
        const plainPassword = `${firstName}@123`;
        await storage.createStudent({
          studentId: `ST${String(i).padStart(4, '0')}`,
          firstName,
          lastName,
          email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}${i}@student.edu`,
          password: `hashed_${plainPassword}`,
          plainPassword,
          phone: `+91${String(9000000000 + i)}`,
          program,
          semester: (i % 8) + 1, // 1-8 semesters
          batch: `2024-${(2024 + Math.floor((i % 8) / 2))}`,
          enrolledCourses: [],
          preferences: {},
          isActive: true
        });
      }

      // Seed Faculty Data
      const facultyNames = [
        { firstName: "Dr. Rajesh", lastName: "Kumar" },
        { firstName: "Prof. Sunita", lastName: "Sharma" },
        { firstName: "Dr. Amit", lastName: "Patel" },
        { firstName: "Prof. Kavita", lastName: "Singh" },
        { firstName: "Dr. Vikram", lastName: "Gupta" },
        { firstName: "Prof. Meera", lastName: "Agarwal" },
        { firstName: "Dr. Suresh", lastName: "Verma" },
        { firstName: "Prof. Anita", lastName: "Jain" },
        { firstName: "Dr. Ravi", lastName: "Yadav" },
        { firstName: "Prof. Deepika", lastName: "Mishra" },
        { firstName: "Dr. Karan", lastName: "Tiwari" },
        { firstName: "Prof. Sonia", lastName: "Chopra" },
        { firstName: "Dr. Manoj", lastName: "Srivastava" },
        { firstName: "Prof. Priya", lastName: "Bansal" },
        { firstName: "Dr. Anil", lastName: "Saxena" }
      ];

      const designations = ["Professor", "Associate Professor", "Assistant Professor", "Lecturer"];
      const expertiseAreas = [
        ["Data Structures", "Algorithms", "Programming"],
        ["Database Systems", "Software Engineering", "Web Development"],
        ["Machine Learning", "AI", "Data Science"],
        ["Computer Networks", "Cybersecurity", "System Administration"],
        ["Mobile Development", "UI/UX", "Frontend Technologies"]
      ];

      for (let i = 0; i < facultyNames.length; i++) {
        const faculty = facultyNames[i];
        const designation = designations[i % designations.length];
        const expertise = expertiseAreas[i % expertiseAreas.length];
        const department = departments[i % departments.length];
        
        const plainPassword = `${faculty.firstName}@123`;
        await storage.createFaculty({
          facultyId: `FAC${String(i + 1).padStart(3, '0')}`,
          firstName: faculty.firstName,
          lastName: faculty.lastName,
          email: `${faculty.firstName.toLowerCase().replace(/[^a-z]/g, '')}.${faculty.lastName.toLowerCase()}@college.edu`,
          password: `hashed_${plainPassword}`,
          plainPassword,
          phone: `+91${String(9500000000 + i)}`,
          department,
          designation,
          expertise,
          maxWorkload: 20,
          availability: {
            Monday: ["09:00-12:00", "14:00-17:00"],
            Tuesday: ["09:00-12:00", "14:00-17:00"],
            Wednesday: ["09:00-12:00", "14:00-17:00"],
            Thursday: ["09:00-12:00", "14:00-17:00"],
            Friday: ["09:00-12:00", "14:00-17:00"]
          },
          assignedCourses: [],
          isActive: true
        });
      }

      // Seed some sample courses
      const courses = [
        { code: "CS101", name: "Programming Fundamentals", type: "Core", credits: 4, theoryHours: 3, practicalHours: 2 },
        { code: "CS102", name: "Data Structures", type: "Core", credits: 4, theoryHours: 3, practicalHours: 2 },
        { code: "CS201", name: "Database Management", type: "Core", credits: 3, theoryHours: 3, practicalHours: 1 },
        { code: "CS202", name: "Web Development", type: "Lab", credits: 3, theoryHours: 1, practicalHours: 4 },
        { code: "CS301", name: "Machine Learning", type: "Elective", credits: 4, theoryHours: 3, practicalHours: 2 }
      ];

      for (let i = 0; i < courses.length; i++) {
        const course = courses[i];
        await storage.createCourse({
          courseCode: course.code,
          courseName: course.name,
          courseType: course.type,
          credits: course.credits,
          theoryHours: course.theoryHours,
          practicalHours: course.practicalHours,
          program: "Computer Science",
          semester: Math.floor(i / 2) + 1,
          prerequisites: [],
          description: `Course covering ${course.name} concepts and practical applications`,
          isActive: true
        });
      }

      res.json({ 
        message: "Database seeded successfully",
        seeded: true,
        data: {
          rooms: 30,
          students: 100,
          faculty: facultyNames.length,
          courses: courses.length
        }
      });
    } catch (error) {
      console.error("Error seeding database:", error);
      res.status(500).json({ message: "Failed to seed database", error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Dashboard stats
  app.get("/api/dashboard/stats", async (req: Request, res: Response) => {
    try {
      const students = await storage.getStudents();
      const faculty = await storage.getFaculty();
      const courses = await storage.getCourses();
      const timetables = await storage.getTimetables();

      const stats = {
        totalStudents: students.filter(s => s.isActive).length,
        activeFaculty: faculty.filter(f => f.isActive).length,
        courses: courses.filter(c => c.isActive).length,
        conflictsResolved: timetables.reduce((sum, t) => 
          sum + (Array.isArray(t.conflicts) ? t.conflicts.length : 0), 0
        ),
      };

      res.json(stats);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch dashboard stats" });
    }
  });

  // Admin Panel - Generate base time slots only (no course/faculty/room mapping)
  app.post("/api/admin/generate-slot-mappings", requireAuth, requireRole(['admin']), async (req: Request, res: Response) => {
    try {
      const { program, semester, batch, academicYear, baseConfig } = req.body;

      // Generate time slots based on base configuration with grace time and consistent lunch skipping
      const timeSlots: any[] = [];
      const workingDays = baseConfig.workingDays || ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
      const startTime = baseConfig.startTime || "09:00";
      const endTime = baseConfig.endTime || "17:00";
      const slotDuration: number = baseConfig.slotDuration || 50;
      const graceTime: number = baseConfig.graceTime ?? 0;
      const lunchBreak = baseConfig.lunchBreak || { startTime: "12:50", endTime: "13:50" };

      // Helpers for time math
      const toMin = (t: string) => {
        const [h, m] = t.split(":").map(Number);
        return h * 60 + m;
      };
      const toStr = (min: number) => {
        const h = Math.floor(min / 60).toString().padStart(2, "0");
        const m = (min % 60).toString().padStart(2, "0");
        return `${h}:${m}`;
      };

      const dayStartMin = toMin(startTime);
      const dayEndMin = toMin(endTime);
      const lunchStartMin = toMin(lunchBreak.startTime);
      const lunchEndMin = toMin(lunchBreak.endTime);

      // Generate slots for each working day
      for (const day of workingDays) {
        let slotIndex = 1;
        let cursor = dayStartMin;

        while (cursor + slotDuration <= dayEndMin) {
          const nextEnd = cursor + slotDuration;

          // If this slot overlaps lunch, jump the cursor to lunch end and continue
          const overlapsLunch = !(nextEnd <= lunchStartMin || cursor >= lunchEndMin);
          if (overlapsLunch) {
            cursor = Math.max(cursor, lunchEndMin);
            continue;
          }

          timeSlots.push({
            id: `${day.toLowerCase().substr(0,3)}-${slotIndex}`,
            dayOfWeek: day,
            startTime: toStr(cursor),
            endTime: toStr(nextEnd),
            duration: slotDuration,
            type: slotIndex > 7 ? "lab" : "theory",
          });

          slotIndex++;
          // Apply grace time between consecutive slots
          cursor = nextEnd + (graceTime || 0);
        }
      }

      // Create timetable record
      console.log(`Creating timetable with ${timeSlots.length} base time slots (no mappings)`);
      const timetable = await storage.createTimetable({
        name: `${program} Semester ${semester} - ${batch}`,
        program,
        semester,
        batch,
        academicYear,
        schedule: { timeSlots, lunchBreak },
        conflicts: [],
        optimizationScore: 75, // Basic score for auto-generated
        status: 'draft',
        generatedBy: 'Auto-Generator',
      });
      console.log(`Timetable created successfully with ID: ${timetable.id}`);

      res.json({
        success: true,
        message: "Base time slots generated successfully",
        timetable,
        totalSlots: timeSlots.length
      });

    } catch (error) {
      console.error("Slot mapping generation error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to generate slot-time mappings",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Faculty Panel - Get pre-assigned course list with constraints
  app.get("/api/faculty/:id/pre-assigned-courses", requireAuth, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const user = (req as any).user;
      
      // Authorization check
      if (user.role === 'faculty' && user.userId !== id) {
        return res.status(403).json({ message: "You can only view your own pre-assigned courses" });
      } else if (user.role !== 'admin' && user.role !== 'faculty') {
        return res.status(403).json({ message: "Insufficient permissions" });
      }
      
      // Get faculty member
      const facultyMember = await storage.getFacultyMember(id);
      if (!facultyMember) {
        return res.status(404).json({ message: "Faculty member not found" });
      }

      // Get all courses
      const allCourses = await storage.getCourses();
      
      // Filter courses based on faculty expertise and department
      const preAssignedCourses = allCourses.filter(course => {
        // Check if course matches faculty expertise
        const expertiseMatch = facultyMember.expertise.some(exp =>
          course.courseName.toLowerCase().includes(exp.toLowerCase()) ||
          course.courseCode.toLowerCase().includes(exp.toLowerCase()) ||
          course.program.toLowerCase().includes(exp.toLowerCase())
        );
        
        // Check if course is active and not already assigned
        const isAvailable = course.isActive && !facultyMember.assignedCourses.includes(course.id);
        
        return expertiseMatch && isAvailable;
      });

      // Calculate workload constraints
      const currentWorkload = facultyMember.assignedCourses.length * 3; // Assuming 3 credits average
      const maxWorkload = facultyMember.maxWorkload || 20;
      const availableWorkload = maxWorkload - currentWorkload;

      // Add constraint information to each course
      const coursesWithConstraints = preAssignedCourses.map(course => ({
        ...course,
        canAssign: course.credits <= availableWorkload,
        workloadImpact: course.credits,
        conflictReason: course.credits > availableWorkload ? 'Exceeds maximum workload' : null
      }));

      res.json({
        preAssignedCourses: coursesWithConstraints,
        workloadInfo: {
          currentWorkload,
          maxWorkload,
          availableWorkload,
          utilizationPercentage: Math.round((currentWorkload / maxWorkload) * 100)
        },
        constraints: {
          maxCoursesPerSemester: Math.floor(maxWorkload / 3),
          preferredWorkloadRange: [15, maxWorkload],
          expertiseAreas: facultyMember.expertise
        }
      });

    } catch (error) {
      console.error("Pre-assigned courses error:", error);
      res.status(500).json({
        message: "Failed to fetch pre-assigned courses",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  
  // Faculty Panel - Select courses with constraint validation
  app.post("/api/faculty/:id/select-courses", requireAuth, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { courseIds = [] } = req.body || {};
      const user = (req as any).user;
      
      // Authorization check
      if (user.role === 'faculty' && user.userId !== id) {
        return res.status(403).json({ message: "You can only select courses for yourself" });
      } else if (user.role !== 'admin' && user.role !== 'faculty') {
        return res.status(403).json({ message: "Insufficient permissions" });
      }

      // Get faculty member
      const facultyMember = await storage.getFacultyMember(id);
      if (!facultyMember) {
        return res.status(404).json({ message: "Faculty member not found" });
      }

      // Get courses to be assigned
      const courses = await Promise.all((courseIds as string[]).map((courseId: string) => storage.getCourse(courseId)));
      const validCourses = courses.filter(Boolean) as any[];

      // Validate constraints
      const totalCredits = validCourses.reduce((sum, course: any) => sum + (course.credits || 0), 0);
      const currentWorkload = (facultyMember.assignedCourses?.length || 0) * 3;
      const newWorkload = currentWorkload + totalCredits;

      if (newWorkload > (facultyMember.maxWorkload || 20)) {
        return res.status(400).json({
          success: false,
          message: "Course selection exceeds maximum workload",
          currentWorkload,
          requestedCredits: totalCredits,
          maxWorkload: facultyMember.maxWorkload || 20
        });
      }

      // Placeholder for time conflicts (basic check)
      const conflicts: string[] = [];

      // Update faculty assigned courses (dedupe)
      const updatedAssignedCourses = Array.from(new Set([...(facultyMember.assignedCourses || []), ...courseIds]));
      const updated = await storage.updateFaculty(id, { assignedCourses: updatedAssignedCourses as any });

      return res.json({ success: true, faculty: updated, conflicts });
    } catch (error) {
      console.error("Select courses error:", error);
      return res.status(500).json({ message: "Failed to select courses", error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Admin - Allocate classrooms for a timetable's slots
  app.post("/api/admin/allocate-classrooms", requireAuth, requireRole(['admin']), async (req, res) => {
    try {
      const { timetableId } = req.body || {};
      
      // Get timetable and its slots
      const timetable = await storage.getTimetable(timetableId);
      if (!timetable) {
        return res.status(404).json({ message: "Timetable not found" });
      }

      let slots = await storage.getTimetableSlots(timetableId);
      
      // Auto-materialize slots from timetable.schedule.slotMappings if no slots exist
      if (!Array.isArray(slots) || slots.length === 0) {
        let schedule: any = timetable.schedule as any;
        if (schedule && typeof schedule === 'string') {
          try { schedule = JSON.parse(schedule); } catch {}
        }
        const mappings = Array.isArray(schedule?.slotMappings) ? schedule.slotMappings : [];
        
        if (mappings.length > 0) {
          console.log(`Auto-materializing ${mappings.length} slot mappings for timetable ${timetableId}`);
          
          // Materialize slots from mappings
          let created = 0;
          for (const m of mappings) {
            let courseId = m.courseId as string | undefined;
            if (!courseId && m.courseCode) {
              const byCode = await storage.getCourseByCode(m.courseCode).catch(() => undefined);
              if (byCode) courseId = byCode.id;
            }
            if (!courseId) continue;
            
            await storage.createTimetableSlot({
              timetableId: timetable.id,
              courseId,
              facultyId: m.facultyId || undefined,
              roomId: m.roomId || undefined,
              dayOfWeek: m.dayOfWeek,
              startTime: m.startTime,
              endTime: m.endTime,
              slotType: m.slotType || 'theory',
              sectionIds: [],
              isLabBlock: m.slotType === 'lab',
              specialInstructions: `Course Code: ${m.courseCode || ''}`,
            });
            created += 1;
          }
          
          // Refetch slots after materialization
          slots = await storage.getTimetableSlots(timetableId);
          console.log(`Materialized ${created} slots, now have ${slots.length} total slots`);
        } else {
          return res.status(400).json({
            success: false,
            message: "No TimetableSlot records found for this timetable. Create class slots before running classroom allocation.",
            tips: [
              "Assign courses/faculty to time slots and save as TimetableSlot records",
              "Or materialize slots from timetable.schedule.slotMappings if available"
            ]
          });
        }
      }

      const rooms = await storage.getRooms();
      const courses = await storage.getCourses();
      const faculty = await storage.getFaculty();
      const students = await storage.getStudents();

      // Build program+semester clash map per time
      const courseMap = new Map(courses.map(c => [c.id, c]));
      const timeKey = (d: string, s: string, e: string) => `${d}::${s}-${e}`;
      const timeProgSemCounts: Record<string, Record<string, number>> = {};
      for (const sl of slots) {
        const course = courseMap.get(sl.courseId);
        const ps = course ? `${course.program}__${course.semester}` : `${timetable.program}__${timetable.semester}`;
        const key = timeKey(sl.dayOfWeek, sl.startTime, sl.endTime);
        if (!timeProgSemCounts[key]) timeProgSemCounts[key] = {};
        timeProgSemCounts[key][ps] = (timeProgSemCounts[key][ps] || 0) + 1;
      }
      const processedPerTimePs = new Map<string, number>();
      const allocationConflicts: Array<{ type: string; description: string; slotId: string; time: string; program: string; semester: number; }> = [];

      // Generate unique Class IDs and allocate rooms
      const classAllocations: any[] = [];
      const roomUtilization = new Map();

      for (const slot of slots) {
        const courseForSlot = courseMap.get(slot.courseId);
        const ps = courseForSlot ? `${courseForSlot.program}__${courseForSlot.semester}` : `${timetable.program}__${timetable.semester}`;
        const tKey = timeKey(slot.dayOfWeek, slot.startTime, slot.endTime);
        const already = processedPerTimePs.get(`${tKey}__${ps}`) || 0;
        processedPerTimePs.set(`${tKey}__${ps}`, already + 1);
        const isProgramSemClash = (timeProgSemCounts[tKey]?.[ps] || 0) > 1 && already >= 1;

        // Generate unique Class ID
        const course = courseForSlot || courses.find(c => c.id === slot.courseId);
        const facultyMember = faculty.find(f => f.id === slot.facultyId);
        const timestamp = Date.now().toString(36);
        const random = Math.random().toString(36).substring(2, 5);
        const classId = `CLS-${course?.courseCode || 'UNK'}-${slot.dayOfWeek.substring(0, 3).toUpperCase()}-${slot.startTime.replace(':', '')}-${timestamp}-${random}`;

        // Find suitable room based on allocation rules (skip allocation if program/semester clash)
        let allocatedRoom = null as any;
        const enrolledStudents = students.filter(s => s.enrolledCourses.includes(slot.courseId) && s.isActive);

        // Room selection criteria
        const requiredCapacity = enrolledStudents.length + Math.ceil(enrolledStudents.length * 0.1); // 10% buffer
        if (!isProgramSemClash) {
          const suitableRooms = rooms.filter(room => {
            const isAvailable = room.isAvailable;
            const hasCapacity = room.capacity >= requiredCapacity;
            const typeMatch = slot.slotType === 'lab' ? room.roomType.toLowerCase().includes('lab') : !room.roomType.toLowerCase().includes('lab');
            const roomKey = `${room.id}-${slot.dayOfWeek}-${slot.startTime}`;
            const isTimeSlotFree = !roomUtilization.has(roomKey);
            return isAvailable && hasCapacity && typeMatch && isTimeSlotFree;
          });

          if (suitableRooms.length > 0) {
            suitableRooms.sort((a, b) => {
              const aCapacityScore = Math.abs(a.capacity - requiredCapacity);
              const bCapacityScore = Math.abs(b.capacity - requiredCapacity);
              return aCapacityScore - bCapacityScore;
            });
            allocatedRoom = suitableRooms[0];
            const roomKey = `${allocatedRoom.id}-${slot.dayOfWeek}-${slot.startTime}`;
            roomUtilization.set(roomKey, true);
          }
        } else {
          allocationConflicts.push({
            type: 'program_sem_overlap',
            description: `Skipped room allocation due to same program+semester clash at ${slot.dayOfWeek} ${slot.startTime}-${slot.endTime}`,
            slotId: slot.id,
            time: `${slot.dayOfWeek} ${slot.startTime}-${slot.endTime}`,
            program: courseForSlot?.program || timetable.program,
            semester: courseForSlot?.semester || timetable.semester,
          });
        }

        // Create class allocation record
        const classAllocation = {
          classId,
          timetableSlotId: slot.id,
          courseId: slot.courseId,
          courseCode: course?.courseCode || 'UNK',
          courseName: course?.courseName || 'Unknown Course',
          facultyId: slot.facultyId,
          facultyName: facultyMember ? `${facultyMember.firstName} ${facultyMember.lastName}` : 'Unknown Faculty',
          roomId: allocatedRoom?.id || null,
          roomNumber: allocatedRoom?.roomNumber || 'TBA',
          roomType: allocatedRoom?.roomType || 'TBA',
          dayOfWeek: slot.dayOfWeek,
          startTime: slot.startTime,
          endTime: slot.endTime,
          slotType: slot.slotType,
          enrolledStudents: enrolledStudents.map(s => ({
            studentId: s.studentId,
            name: `${s.firstName} ${s.lastName}`,
            program: s.program,
            semester: s.semester,
            batch: s.batch
          })),
          capacity: allocatedRoom?.capacity || 0,
          utilization: allocatedRoom ? Math.round((enrolledStudents.length / allocatedRoom.capacity) * 100) : 0,
          equipment: allocatedRoom?.equipment || [],
          location: allocatedRoom?.location || 'TBA'
        };

        classAllocations.push(classAllocation);

        // Update the timetable slot with room allocation
        if (allocatedRoom) {
          await storage.updateTimetableSlot(slot.id, {
            roomId: allocatedRoom.id,
            specialInstructions: `Class ID: ${classId}`
          });
        }
      }

      // Generate allocation summary
      const allocationSummary = {
        totalClasses: classAllocations.length,
        allocatedClasses: classAllocations.filter(c => c.roomId).length,
        unallocatedClasses: classAllocations.filter(c => !c.roomId).length,
        roomUtilizationRate: Math.round((roomUtilization.size / (rooms.length * slots.length)) * 100),
        averageCapacityUtilization: classAllocations.length > 0 ? Math.round(
          classAllocations.reduce((sum, c) => sum + (c.utilization || 0), 0) / classAllocations.length
        ) : 0
      };

      res.json({
        success: true,
        message: "Classroom allocation completed",
        classAllocations,
        allocationSummary,
        unallocatedClasses: classAllocations.filter(c => !c.roomId),
        conflicts: allocationConflicts
      });
    } catch (error) {
      console.error("Classroom allocation error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to allocate classrooms",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Admin - Get classroom allocation summary for a timetable
  app.get("/api/admin/classroom-allocations/:timetableId", requireAuth, requireRole(['admin']), async (req, res) => {
    try {
      const { timetableId } = req.params as any;
      const timetable = await storage.getTimetable(timetableId);
      if (!timetable) {
        return res.status(404).json({ message: "Timetable not found" });
      }

      const [slots, rooms, courses, faculty, students] = await Promise.all([
        storage.getTimetableSlots(timetableId),
        storage.getRooms(),
        storage.getCourses(),
        storage.getFaculty(),
        storage.getStudents(),
      ]);
      const courseMap = new Map(courses.map(c => [c.id, c]));
      const facultyMap = new Map(faculty.map(f => [f.id, f]));
      const roomMap = new Map(rooms.map(r => [r.id, r]));

      const classAllocations = slots.map(slot => {
        const course: any = courseMap.get(slot.courseId);
        const facultyMember: any = facultyMap.get(slot.facultyId as any);
        const room: any = slot.roomId ? roomMap.get(slot.roomId as any) : undefined;
        const enrolledStudents = students.filter(s => s.enrolledCourses.includes(slot.courseId) && s.isActive);
        const classId = (slot.specialInstructions && slot.specialInstructions.startsWith('Class ID: '))
          ? slot.specialInstructions.replace('Class ID: ', '')
          : `CLS-${course?.courseCode || 'UNK'}-${slot.dayOfWeek.substring(0, 3).toUpperCase()}-${slot.startTime.replace(':', '')}`;
        const utilization = room ? Math.round((enrolledStudents.length / room.capacity) * 100) : 0;
        return {
          classId,
          timetableSlotId: slot.id,
          courseId: slot.courseId,
          courseCode: course?.courseCode || 'UNK',
          courseName: course?.courseName || 'Unknown Course',
          facultyId: slot.facultyId,
          facultyName: facultyMember ? `${facultyMember.firstName} ${facultyMember.lastName}` : 'Unknown Faculty',
          roomId: slot.roomId || null,
          roomNumber: room?.roomNumber || 'TBA',
          roomType: room?.roomType || 'TBA',
          dayOfWeek: slot.dayOfWeek,
          startTime: slot.startTime,
          endTime: slot.endTime,
          slotType: slot.slotType,
          enrolledStudents: enrolledStudents.map(s => ({
            studentId: s.studentId,
            name: `${s.firstName} ${s.lastName}`,
            program: s.program,
            semester: s.semester,
            batch: s.batch
          })),
          capacity: room?.capacity || 0,
          utilization,
          equipment: room?.equipment || [],
          location: room?.location || 'TBA'
        };
      });

      const allocationSummary = {
        totalClasses: classAllocations.length,
        allocatedClasses: classAllocations.filter(c => c.roomId).length,
        unallocatedClasses: classAllocations.filter(c => !c.roomId).length,
        roomUtilizationRate: rooms.length > 0 && slots.length > 0 ? Math.round((classAllocations.filter(c => c.roomId).length / classAllocations.length) * 100) : 0,
        averageCapacityUtilization: classAllocations.length > 0 ? Math.round(
          classAllocations.reduce((sum, c: any) => sum + (c.utilization || 0), 0) / classAllocations.length
        ) : 0,
      };

      return res.json({ classAllocations, allocationSummary, unallocatedClasses: classAllocations.filter(c => !c.roomId) });
    } catch (error) {
      console.error("Get classroom allocations error:", error);
      return res.status(500).json({ message: "Failed to fetch classroom allocations", error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Get class details by Class ID
  app.get("/api/classes/:classId", async (req, res) => {
    try {
      const { classId } = req.params;
      
      // This would typically query a dedicated classes table
      // For now, we'll search through timetable slots with the class ID in special instructions
      const timetables = await storage.getTimetables();
      let foundClass = null;

      for (const timetable of timetables) {
        const slots = await storage.getTimetableSlots(timetable.id);
        const slot = slots.find(s => 
          s.specialInstructions && s.specialInstructions.includes(classId)
        );
        
        if (slot) {
          const course = await storage.getCourse(slot.courseId);
          const faculty = await storage.getFacultyMember(slot.facultyId);
          const room = await storage.getRoom(slot.roomId);
          const students = await storage.getStudents();
          const enrolledStudents = students.filter(s => 
            s.enrolledCourses.includes(slot.courseId) && s.isActive
          );

          foundClass = {
            classId,
            course: course ? {
              id: course.id,
              code: course.courseCode,
              name: course.courseName,
              credits: course.credits,
              type: course.courseType
            } : null,
            faculty: faculty ? {
              id: faculty.id,
              name: `${faculty.firstName} ${faculty.lastName}`,
              email: faculty.email,
              department: faculty.department
            } : null,
            room: room ? {
              id: room.id,
              number: room.roomNumber,
              name: room.roomName,
              type: room.roomType,
              capacity: room.capacity,
              location: room.location,
              equipment: room.equipment
            } : null,
            schedule: {
              dayOfWeek: slot.dayOfWeek,
              startTime: slot.startTime,
              endTime: slot.endTime,
              slotType: slot.slotType
            },
            enrolledStudents: enrolledStudents.map(s => ({
              studentId: s.studentId,
              name: `${s.firstName} ${s.lastName}`,
              email: s.email,
              program: s.program,
              semester: s.semester,
              batch: s.batch
            })),
            statistics: {
              totalEnrolled: enrolledStudents.length,
              capacityUtilization: room ? Math.round((enrolledStudents.length / room.capacity) * 100) : 0,
              attendanceRate: 0 // Would be calculated from attendance records
            }
          };
          break;
        }
      }

      if (!foundClass) {
        return res.status(404).json({ message: "Class not found" });
      }

      res.json(foundClass);

    } catch (error) {
      console.error("Get class details error:", error);
      res.status(500).json({
        message: "Failed to fetch class details",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
