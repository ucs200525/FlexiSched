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
  loginSchema
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
      
      // Demo authentication - in production, use proper password hashing
      const demoCredentials = {
        admin: { username: "admin", password: "admin123", name: "Administrator", email: "admin@timetable.ai" },
        faculty: { username: "faculty", password: "faculty123", name: "Dr. Faculty Member", email: "faculty@timetable.ai" },
        student: { username: "student", password: "student123", name: "Student User", email: "student@timetable.ai" }
      };
      
      const demo = demoCredentials[role];
      
      if (demo && username === demo.username && password === demo.password) {
        // Generate a simple token (in production, use proper JWT or session management)
        const token = `token_${Date.now()}_${Math.random().toString(36).substring(2)}`;
        
        const user = {
          id: `${role}-1`,
          username: demo.username,
          name: demo.name,
          role,
          email: demo.email
        };

        // Store session
        userSessions.set(token, {
          userId: user.id,
          role: user.role,
          username: user.username,
          name: user.name,
          email: user.email,
          timestamp: Date.now()
        });
        
        res.json({ ...user, token });
      } else {
        res.status(401).json({ error: "Invalid credentials" });
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'ZodError') {
        res.status(400).json({ error: "Invalid request format", details: error.message });
      } else {
        console.error("Error during login:", error);
        res.status(500).json({ error: "Login failed" });
      }
    }
  });

  // Students routes
  app.get("/api/students", async (req, res) => {
    try {
      const students = await storage.getStudents();
      res.json(students);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch students" });
    }
  });

  app.get("/api/students/:id", async (req, res) => {
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

  app.post("/api/students", async (req, res) => {
    try {
      const validatedData = insertStudentSchema.parse(req.body);
      const student = await storage.createStudent(validatedData);
      res.status(201).json(student);
    } catch (error) {
      res.status(400).json({ message: "Invalid student data" });
    }
  });

  app.put("/api/students/:id", async (req, res) => {
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

  app.delete("/api/students/:id", async (req, res) => {
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

  // Faculty routes
  app.get("/api/faculty", async (req, res) => {
    try {
      const faculty = await storage.getFaculty();
      res.json(faculty);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch faculty" });
    }
  });

  app.get("/api/faculty/:id", async (req, res) => {
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

  app.post("/api/faculty", async (req, res) => {
    try {
      const validatedData = insertFacultySchema.parse(req.body);
      const facultyMember = await storage.createFaculty(validatedData);
      res.status(201).json(facultyMember);
    } catch (error) {
      res.status(400).json({ message: "Invalid faculty data" });
    }
  });

  app.put("/api/faculty/:id", async (req, res) => {
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

  app.delete("/api/faculty/:id", async (req, res) => {
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

  // Courses routes
  app.get("/api/courses", async (req, res) => {
    try {
      const courses = await storage.getCourses();
      res.json(courses);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch courses" });
    }
  });

  app.get("/api/courses/:id", async (req, res) => {
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

  app.post("/api/courses", async (req, res) => {
    try {
      const validatedData = insertCourseSchema.parse(req.body);
      const course = await storage.createCourse(validatedData);
      res.status(201).json(course);
    } catch (error) {
      res.status(400).json({ message: "Invalid course data" });
    }
  });

  app.put("/api/courses/:id", async (req, res) => {
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

  app.delete("/api/courses/:id", async (req, res) => {
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
  app.get("/api/rooms", async (req, res) => {
    try {
      const rooms = await storage.getRooms();
      res.json(rooms);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch rooms" });
    }
  });

  app.get("/api/rooms/:id", async (req, res) => {
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

  app.post("/api/rooms", async (req, res) => {
    try {
      const validatedData = insertRoomSchema.parse(req.body);
      const room = await storage.createRoom(validatedData);
      res.status(201).json(room);
    } catch (error) {
      res.status(400).json({ message: "Invalid room data" });
    }
  });

  app.put("/api/rooms/:id", async (req, res) => {
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

  app.delete("/api/rooms/:id", async (req, res) => {
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
  app.get("/api/timetables", async (req, res) => {
    try {
      const timetables = await storage.getTimetables();
      res.json(timetables);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch timetables" });
    }
  });

  app.get("/api/timetables/:id", async (req, res) => {
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

  app.get("/api/timetables/:id/slots", async (req, res) => {
    try {
      const slots = await storage.getTimetableSlots(req.params.id);
      res.json(slots);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch timetable slots" });
    }
  });

  app.post("/api/timetables", async (req, res) => {
    try {
      const validatedData = insertTimetableSchema.parse(req.body);
      const timetable = await storage.createTimetable(validatedData);
      res.status(201).json(timetable);
    } catch (error) {
      res.status(400).json({ message: "Invalid timetable data" });
    }
  });

  // AI-powered timetable generation
  app.post("/api/timetables/generate", async (req, res) => {
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
  app.post("/api/ai/optimize-timetable", requireAuth, requireRole(['admin']), async (req, res) => {
    try {
      const { program, semester, batch, academicYear, algorithm = "constraint_solver", constraints = {} } = req.body;
      
      // Fetch data from database
      const courses = await storage.getCourses();
      const faculty = await storage.getFaculty();
      const rooms = await storage.getRooms();
      const students = await storage.getStudents();
      
      // Filter for the specific program and semester
      const filteredCourses = courses.filter(course => 
        course.program === program && course.semester === semester && course.isActive
      );

      // Prepare optimization request
      const optimizationRequest = {
        courses: filteredCourses.map(course => ({
          id: course.id,
          course_code: course.courseCode,
          course_name: course.courseName,
          credits: course.credits,
          course_type: course.courseType.toLowerCase(),
          expected_students: 30,
          requires_consecutive_slots: course.courseType === "laboratory"
        })),
        faculty: faculty.filter(f => f.isActive !== false).map(f => ({
          id: f.id,
          name: `${f.firstName} ${f.lastName}`,
          email: f.email || `${f.firstName.toLowerCase()}.${f.lastName.toLowerCase()}@university.edu`,
          max_hours_per_week: f.maxWorkload || 40
        })),
        rooms: rooms.filter(r => r.isAvailable !== false).map(r => ({
          id: r.id,
          room_number: r.roomNumber,
          room_name: r.roomName || r.roomNumber,
          capacity: r.capacity,
          room_type: r.roomType,
          equipment: Array.isArray(r.equipment) ? r.equipment : []
        })),
        students: students.filter(s => s.program === program && s.semester === semester && s.isActive !== false).map(s => ({
          id: s.id,
          student_id: s.studentId,
          name: `${s.firstName} ${s.lastName}`,
          program: s.program,
          semester: s.semester,
          enrolled_courses: filteredCourses.map(c => c.id)
        })),
        time_slots: [
          { day: "Monday", start_time: "09:00", end_time: "10:00", duration: 60 },
          { day: "Monday", start_time: "10:00", end_time: "11:00", duration: 60 },
          { day: "Monday", start_time: "11:15", end_time: "12:15", duration: 60 },
          { day: "Monday", start_time: "12:15", end_time: "13:15", duration: 60 },
          { day: "Monday", start_time: "13:15", end_time: "14:15", duration: 60 },
          { day: "Tuesday", start_time: "09:00", end_time: "10:00", duration: 60 },
          { day: "Tuesday", start_time: "10:00", end_time: "11:00", duration: 60 },
          { day: "Tuesday", start_time: "11:15", end_time: "12:15", duration: 60 },
          { day: "Tuesday", start_time: "12:15", end_time: "13:15", duration: 60 },
          { day: "Tuesday", start_time: "13:15", end_time: "14:15", duration: 60 },
          { day: "Wednesday", start_time: "09:00", end_time: "10:00", duration: 60 },
          { day: "Wednesday", start_time: "10:00", end_time: "11:00", duration: 60 },
          { day: "Wednesday", start_time: "11:15", end_time: "12:15", duration: 60 },
          { day: "Wednesday", start_time: "12:15", end_time: "13:15", duration: 60 },
          { day: "Wednesday", start_time: "13:15", end_time: "14:15", duration: 60 },
          { day: "Thursday", start_time: "09:00", end_time: "10:00", duration: 60 },
          { day: "Thursday", start_time: "10:00", end_time: "11:00", duration: 60 },
          { day: "Thursday", start_time: "11:15", end_time: "12:15", duration: 60 },
          { day: "Thursday", start_time: "12:15", end_time: "13:15", duration: 60 },
          { day: "Thursday", start_time: "13:15", end_time: "14:15", duration: 60 },
          { day: "Friday", start_time: "09:00", end_time: "10:00", duration: 60 },
          { day: "Friday", start_time: "10:00", end_time: "11:00", duration: 60 },
          { day: "Friday", start_time: "11:15", end_time: "12:15", duration: 60 },
          { day: "Friday", start_time: "12:15", end_time: "13:15", duration: 60 },
          { day: "Friday", start_time: "13:15", end_time: "14:15", duration: 60 }
        ],
        constraints: {
          max_hours_per_day: constraints.max_hours_per_day || 8,
          min_break_duration: constraints.min_break_duration || 15,
          lunch_break_duration: constraints.lunch_break_duration || 60,
          lunch_break_start: constraints.lunch_break_start || "12:00",
          consecutive_lab_slots: constraints.consecutive_lab_slots !== false,
          max_consecutive_hours: constraints.max_consecutive_hours || 3
        },
        program,
        semester,
        batch,
        academic_year: academicYear
      };

      // Call AI optimization engine
      const result = await aiEngineClient.optimizeTimetable(optimizationRequest, algorithm);

      if (result.success) {
        // Create timetable record
        const timetable = await storage.createTimetable({
          name: `AI Optimized: ${program} Semester ${semester} - ${batch}`,
          program,
          semester,
          batch,
          academicYear,
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
  app.post("/api/ai/analyze-conflicts", requireAuth, async (req, res) => {
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

  // Conflict detection
  app.post("/api/timetables/:id/detect-conflicts", async (req, res) => {
    try {
      const slots = await storage.getTimetableSlots(req.params.id);
      const conflicts = await detectConflicts(slots);
      
      // Update timetable with detected conflicts
      await storage.updateTimetable(req.params.id, { conflicts });
      
      res.json({ conflicts });
    } catch (error) {
      res.status(500).json({ message: "Failed to detect conflicts" });
    }
  });

  app.put("/api/timetables/:id", async (req, res) => {
    try {
      const timetable = await storage.updateTimetable(req.params.id, req.body);
      if (!timetable) {
        return res.status(404).json({ message: "Timetable not found" });
      }
      res.json(timetable);
    } catch (error) {
      res.status(500).json({ message: "Failed to update timetable" });
    }
  });

  app.delete("/api/timetables/:id", async (req, res) => {
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
  app.post("/api/populate", async (req, res) => {
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
        "Priya", "Rahul", "Rohit", "Sasha", "Shreya", "Siddharth", "Sneha", "Suresh", "Tanvi", "Varun",
        "Ananya", "Aryan", "Diya", "Ishaan", "Kiara", "Laksh", "Maya", "Nitin", "Ojas", "Pooja",
        "Reyan", "Saanvi", "Tanya", "Uday", "Vanya", "Yash", "Zara", "Abhinav", "Bhavya", "Chetan"];
      const lastNames = ["Sharma", "Verma", "Gupta", "Singh", "Kumar", "Patel", "Agarwal", "Jain", "Yadav", "Mishra",
        "Tiwari", "Chauhan", "Mehta", "Shah", "Bansal", "Malhotra", "Kapoor", "Aggarwal", "Goyal", "Arora"];
      const programs = ["Computer Science", "Information Technology", "Electronics", "Mechanical", "Civil", "Electrical", "Chemical"];
      const departments = ["CSE", "IT", "ECE", "ME", "CE", "EE", "CH"];

      for (let i = 1; i <= 100; i++) {
        const firstName = firstNames[i % firstNames.length];
        const lastName = lastNames[i % lastNames.length];
        const program = programs[i % programs.length];
        const department = departments[i % departments.length];
        
        await storage.createStudent({
          studentId: `ST${String(i).padStart(4, '0')}`,
          firstName,
          lastName,
          email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}${i}@student.university.edu`,
          phone: `+91${String(9000000000 + i)}`,
          program,
          semester: (i % 8) + 1, // 1-8 semesters
          batch: `2024-${(2024 + Math.floor((i % 8) / 2))}`,
          enrolledCourses: [],
          preferences: {},
          isActive: true
        });
      }

      // Seed 25 Faculty Members
      console.log('Creating faculty...');
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
        { firstName: "Dr. Anil", lastName: "Saxena" },
        { firstName: "Prof. Neha", lastName: "Kapoor" },
        { firstName: "Dr. Rohit", lastName: "Malhotra" },
        { firstName: "Prof. Sanjay", lastName: "Goyal" },
        { firstName: "Dr. Preeti", lastName: "Arora" },
        { firstName: "Prof. Ajay", lastName: "Chauhan" },
        { firstName: "Dr. Rekha", lastName: "Mehta" },
        { firstName: "Prof. Vikas", lastName: "Shah" },
        { firstName: "Dr. Pooja", lastName: "Bansal" },
        { firstName: "Prof. Ashok", lastName: "Tiwari" },
        { firstName: "Dr. Smita", lastName: "Joshi" }
      ];

      const designations = ["Professor", "Associate Professor", "Assistant Professor", "Lecturer"];
      const expertiseAreas = [
        ["Data Structures", "Algorithms", "Programming"],
        ["Database Systems", "Software Engineering", "Web Development"],
        ["Machine Learning", "AI", "Data Science"],
        ["Computer Networks", "Cybersecurity", "System Administration"],
        ["Mobile Development", "UI/UX", "Frontend Technologies"],
        ["Operating Systems", "System Programming", "Computer Architecture"],
        ["Digital Electronics", "VLSI Design", "Embedded Systems"],
        ["Control Systems", "Power Electronics", "Signal Processing"]
      ];

      for (let i = 0; i < facultyNames.length; i++) {
        const faculty = facultyNames[i];
        const designation = designations[i % designations.length];
        const expertise = expertiseAreas[i % expertiseAreas.length];
        const department = departments[i % departments.length];
        
        await storage.createFaculty({
          facultyId: `FAC${String(i + 1).padStart(3, '0')}`,
          firstName: faculty.firstName,
          lastName: faculty.lastName,
          email: `${faculty.firstName.toLowerCase().replace(/[^a-z]/g, '')}.${faculty.lastName.toLowerCase()}@university.edu`,
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

      // Seed 40 comprehensive courses
      console.log('Creating courses...');
      const courses = [
        // Computer Science Courses
        { code: "CS101", name: "Programming Fundamentals", type: "Core", credits: 4, theoryHours: 3, practicalHours: 2, program: "Computer Science", semester: 1 },
        { code: "CS102", name: "Data Structures", type: "Core", credits: 4, theoryHours: 3, practicalHours: 2, program: "Computer Science", semester: 2 },
        { code: "CS201", name: "Database Management Systems", type: "Core", credits: 4, theoryHours: 3, practicalHours: 2, program: "Computer Science", semester: 3 },
        { code: "CS202", name: "Web Development", type: "Core", credits: 3, theoryHours: 2, practicalHours: 2, program: "Computer Science", semester: 4 },
        { code: "CS301", name: "Machine Learning", type: "Core", credits: 4, theoryHours: 3, practicalHours: 2, program: "Computer Science", semester: 5 },
        { code: "CS302", name: "Computer Networks", type: "Core", credits: 4, theoryHours: 3, practicalHours: 1, program: "Computer Science", semester: 6 },
        { code: "CS401", name: "Software Engineering", type: "Core", credits: 3, theoryHours: 3, practicalHours: 0, program: "Computer Science", semester: 7 },
        { code: "CS402", name: "Artificial Intelligence", type: "Elective", credits: 4, theoryHours: 3, practicalHours: 2, program: "Computer Science", semester: 8 },
        
        // Information Technology Courses
        { code: "IT101", name: "Introduction to IT", type: "Core", credits: 3, theoryHours: 2, practicalHours: 2, program: "Information Technology", semester: 1 },
        { code: "IT102", name: "Object Oriented Programming", type: "Core", credits: 4, theoryHours: 3, practicalHours: 2, program: "Information Technology", semester: 2 },
        { code: "IT201", name: "System Analysis and Design", type: "Core", credits: 3, theoryHours: 3, practicalHours: 0, program: "Information Technology", semester: 3 },
        { code: "IT202", name: "Mobile App Development", type: "Core", credits: 4, theoryHours: 2, practicalHours: 4, program: "Information Technology", semester: 4 },
        { code: "IT301", name: "Cloud Computing", type: "Core", credits: 3, theoryHours: 2, practicalHours: 2, program: "Information Technology", semester: 5 },
        { code: "IT302", name: "Cybersecurity", type: "Core", credits: 4, theoryHours: 3, practicalHours: 2, program: "Information Technology", semester: 6 },
        
        // Electronics Courses
        { code: "EC101", name: "Circuit Analysis", type: "Core", credits: 4, theoryHours: 3, practicalHours: 2, program: "Electronics", semester: 1 },
        { code: "EC102", name: "Digital Electronics", type: "Core", credits: 4, theoryHours: 3, practicalHours: 2, program: "Electronics", semester: 2 },
        { code: "EC201", name: "Microprocessors", type: "Core", credits: 4, theoryHours: 3, practicalHours: 2, program: "Electronics", semester: 3 },
        { code: "EC202", name: "Communication Systems", type: "Core", credits: 4, theoryHours: 3, practicalHours: 1, program: "Electronics", semester: 4 },
        { code: "EC301", name: "VLSI Design", type: "Core", credits: 4, theoryHours: 2, practicalHours: 4, program: "Electronics", semester: 5 },
        { code: "EC302", name: "Signal Processing", type: "Elective", credits: 3, theoryHours: 3, practicalHours: 1, program: "Electronics", semester: 6 },
        
        // Mechanical Courses
        { code: "ME101", name: "Engineering Mechanics", type: "Core", credits: 4, theoryHours: 3, practicalHours: 2, program: "Mechanical", semester: 1 },
        { code: "ME102", name: "Thermodynamics", type: "Core", credits: 4, theoryHours: 3, practicalHours: 1, program: "Mechanical", semester: 2 },
        { code: "ME201", name: "Manufacturing Processes", type: "Core", credits: 4, theoryHours: 2, practicalHours: 4, program: "Mechanical", semester: 3 },
        { code: "ME202", name: "Machine Design", type: "Core", credits: 4, theoryHours: 3, practicalHours: 2, program: "Mechanical", semester: 4 },
        { code: "ME301", name: "Robotics", type: "Elective", credits: 3, theoryHours: 2, practicalHours: 2, program: "Mechanical", semester: 5 },
        
        // Civil Courses
        { code: "CE101", name: "Engineering Drawing", type: "Core", credits: 3, theoryHours: 1, practicalHours: 4, program: "Civil", semester: 1 },
        { code: "CE102", name: "Building Materials", type: "Core", credits: 3, theoryHours: 2, practicalHours: 2, program: "Civil", semester: 2 },
        { code: "CE201", name: "Structural Analysis", type: "Core", credits: 4, theoryHours: 3, practicalHours: 2, program: "Civil", semester: 3 },
        { code: "CE202", name: "Construction Management", type: "Core", credits: 3, theoryHours: 3, practicalHours: 0, program: "Civil", semester: 4 },
        
        // Electrical Courses
        { code: "EE101", name: "Basic Electrical Engineering", type: "Core", credits: 4, theoryHours: 3, practicalHours: 2, program: "Electrical", semester: 1 },
        { code: "EE102", name: "Power Systems", type: "Core", credits: 4, theoryHours: 3, practicalHours: 1, program: "Electrical", semester: 2 },
        { code: "EE201", name: "Control Systems", type: "Core", credits: 4, theoryHours: 3, practicalHours: 2, program: "Electrical", semester: 3 },
        { code: "EE202", name: "Renewable Energy", type: "Elective", credits: 3, theoryHours: 2, practicalHours: 2, program: "Electrical", semester: 4 },
        
        // Chemical Courses
        { code: "CH101", name: "Chemical Process Principles", type: "Core", credits: 4, theoryHours: 3, practicalHours: 2, program: "Chemical", semester: 1 },
        { code: "CH102", name: "Organic Chemistry", type: "Core", credits: 4, theoryHours: 3, practicalHours: 2, program: "Chemical", semester: 2 },
        { code: "CH201", name: "Chemical Reaction Engineering", type: "Core", credits: 4, theoryHours: 3, practicalHours: 2, program: "Chemical", semester: 3 },
        
        // Common/General Courses
        { code: "GE101", name: "English Communication", type: "Core", credits: 3, theoryHours: 3, practicalHours: 0, program: "General", semester: 1 },
        { code: "GE102", name: "Mathematics I", type: "Core", credits: 4, theoryHours: 4, practicalHours: 0, program: "General", semester: 1 },
        { code: "GE201", name: "Mathematics II", type: "Core", credits: 4, theoryHours: 4, practicalHours: 0, program: "General", semester: 2 },
        { code: "GE202", name: "Physics", type: "Core", credits: 4, theoryHours: 3, practicalHours: 2, program: "General", semester: 2 },
        { code: "GE301", name: "Environmental Studies", type: "Core", credits: 2, theoryHours: 2, practicalHours: 0, program: "General", semester: 3 }
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
          program: course.program,
          semester: course.semester,
          prerequisites: [],
          description: `Comprehensive course covering ${course.name} concepts and practical applications in ${course.program}`,
          isActive: true
        });
      }

      console.log('Data population completed successfully!');
      res.json({ 
        message: "Database populated successfully with fresh data",
        success: true,
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
  app.post("/api/seed", requireAuth, requireRole(['admin']), async (req, res) => {
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
        
        await storage.createStudent({
          studentId: `ST${String(i).padStart(4, '0')}`,
          firstName,
          lastName,
          email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}${i}@student.edu`,
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
        
        await storage.createFaculty({
          facultyId: `FAC${String(i + 1).padStart(3, '0')}`,
          firstName: faculty.firstName,
          lastName: faculty.lastName,
          email: `${faculty.firstName.toLowerCase().replace(/[^a-z]/g, '')}.${faculty.lastName.toLowerCase()}@college.edu`,
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
        { code: "CS101", name: "Programming Fundamentals", type: "Theory", credits: 4, theoryHours: 3, practicalHours: 2 },
        { code: "CS102", name: "Data Structures", type: "Theory", credits: 4, theoryHours: 3, practicalHours: 2 },
        { code: "CS201", name: "Database Management", type: "Theory", credits: 3, theoryHours: 3, practicalHours: 1 },
        { code: "CS202", name: "Web Development", type: "Practical", credits: 3, theoryHours: 1, practicalHours: 4 },
        { code: "CS301", name: "Machine Learning", type: "Theory", credits: 4, theoryHours: 3, practicalHours: 2 }
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
  app.get("/api/dashboard/stats", async (req, res) => {
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

  const httpServer = createServer(app);
  return httpServer;
}
