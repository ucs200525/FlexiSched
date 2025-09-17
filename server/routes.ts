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
  courseRegistrationSchema
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
        
        res.json({ ...authenticatedUser, token });
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

  // Debug endpoint to check specific student's enrolled courses
  app.get("/api/debug/student/:studentId/enrolled-count", async (req, res) => {
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

  // Course Registration routes
  app.post("/api/students/:id/register-course", requireAuth, async (req, res) => {
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
      
      // Validate course eligibility (program and semester match)
      if (course.program !== student.program) {
        return res.status(400).json({ message: "Course is not available for your program" });
      }
      
      if (course.semester !== student.semester) {
        return res.status(400).json({ message: "Course is not available for your semester" });
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
      
      // Add course to student's enrolled courses
      const updatedStudent = await storage.updateStudent(id, {
        enrolledCourses: [...student.enrolledCourses, courseId]
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

  app.delete("/api/students/:id/register-course/:courseId", requireAuth, async (req, res) => {
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

  app.get("/api/students/:id/available-courses", requireAuth, async (req, res) => {
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
      
      console.log(`Student found: ${student.firstName} ${student.lastName}, Program: ${student.program}, Semester: ${student.semester}`);
      console.log(`Student enrolled courses: ${student.enrolledCourses}`);
      
      // Get all courses for student's program and semester
      const allCourses = await storage.getCoursesByProgram(student.program, student.semester);
      console.log(`Found ${allCourses.length} courses for program ${student.program}, semester ${student.semester}`);
      
      // Filter to show only active courses that student is not already enrolled in
      const availableCourses = allCourses.filter(course => 
        course.isActive && !student.enrolledCourses.includes(course.id)
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

  app.get("/api/students/:id/registered-courses", requireAuth, async (req, res) => {
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
  app.get("/api/faculty", async (req, res) => {
    try {
      const faculty = await storage.getFaculty();
      res.json(faculty);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch faculty" });
    }
  });

  // Bulk import faculty from CSV/Excel
  app.post("/api/faculty/import", requireAuth, requireRole(['admin']), async (req, res) => {
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

  // Faculty Course Assignment routes
  app.post("/api/faculty/:id/assign-course", requireAuth, async (req, res) => {
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

  app.delete("/api/faculty/:id/assign-course/:courseId", requireAuth, async (req, res) => {
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

  app.get("/api/faculty/:id/available-courses", requireAuth, async (req, res) => {
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

  app.get("/api/faculty/:id/assigned-courses", requireAuth, async (req, res) => {
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
  app.get("/api/courses", async (req, res) => {
    try {
      const courses = await storage.getCourses();
      res.json(courses);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch courses" });
    }
  });

  // Bulk import courses from CSV/Excel
  app.post("/api/courses/import", requireAuth, requireRole(['admin']), async (req, res) => {
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

  // Bulk import rooms from CSV/Excel
  app.post("/api/rooms/import", requireAuth, requireRole(['admin']), async (req, res) => {
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

  // Get TimeSlotTemplates endpoint
  app.get("/api/timeslot-templates", async (req, res) => {
    try {
      const templates = await storage.getTimeSlotTemplates();
      res.json(templates);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch time slot templates" });
    }
  });

  // Base timetable generation endpoint
  app.post("/api/timetables/generate-base", async (req, res) => {
    try {
      const { program, semester, batch, academicYear } = req.body;
      
      // Get existing courses for the specified program and semester
      const existingCourses = await storage.getCourses();
      const filteredCourses = existingCourses.filter(course => 
        course.program === program && course.semester === parseInt(semester) && course.isActive
      );
      
      // If no courses found for this program/semester, use available courses
      const coursesToUse = filteredCourses.length > 0 ? filteredCourses : existingCourses.slice(0, 10);
      
      // Create a repeating pattern of course codes for the schedule
      const getCourseCodeForSlot = (slotIndex: number) => {
        if (coursesToUse.length === 0) return "FREE";
        return coursesToUse[slotIndex % coursesToUse.length].courseCode;
      };
      
      // Define time slots for the schedule
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
      
      // Generate slots for all days using actual course codes
      const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      const slots: any[] = [];
      let slotCounter = 0;
      
      days.forEach((day, dayIndex) => {
        timeSlots.forEach((timeSlot, slotIndex) => {
          if (timeSlot.type !== "break") { // Skip lunch break
            const courseCode = getCourseCodeForSlot(slotCounter);
            const slotType = slotIndex >= 8 ? "lab" : "theory"; // Last few slots as lab
            
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
      
      // Create base timetable structure
      const baseTimetable = {
        name: `Base Timetable - ${program} Semester ${semester}`,
        program,
        semester: parseInt(semester),
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

      // Create TimeSlotTemplate first
      const timeSlotTemplate = {
        templateName: `${program} Semester ${semester} - Base Template`,
        workingDays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
        startTime: "08:00",
        endTime: "19:50",
        periodDuration: 50,
        labBlockDuration: 50,
        dailyPeriods: baseTimetable.schedule.timeSlots,
        breaks: [baseTimetable.schedule.lunchBreak],
        isDefault: false,
        program,
        semester: parseInt(semester),
        batch,
        academicYear,
        slotMapping: baseTimetable.slots
      };
      
      const savedTemplate = await storage.createTimeSlotTemplate(timeSlotTemplate);
      
      // Save to database  
      const savedTimetable = await storage.createTimetable({
        ...baseTimetable,
        timeSlotTemplateId: savedTemplate.id
      });
      
      // Get faculty and rooms for slot mapping
      const existingFaculty = await storage.getFaculty();
      const existingRooms = await storage.getRooms();
      
      // Create a mapping of course codes to course IDs (reuse existingCourses from above)
      const courseCodeMap = new Map(existingCourses.map(c => [c.courseCode, c.id]));
      
      // Save each slot mapping as TimetableSlot records
      const savedSlots: any[] = [];
      for (const slot of baseTimetable.slots) {
        // Try to find matching course, otherwise use first available or create placeholder
        const matchedCourseId = courseCodeMap.get(slot.courseCode) || 
                               (existingCourses.length > 0 ? existingCourses[0].id : "placeholder-course");
        
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
      
      // Print the TimeSlotTemplate data for debugging
      console.log("=== TIME SLOT TEMPLATE CREATED ===");
      console.log("Template ID:", savedTemplate.id);
      console.log("Template Name:", savedTemplate.templateName);
      console.log("Working Days:", savedTemplate.workingDays);
      console.log("Period Duration:", savedTemplate.periodDuration, "minutes");
      console.log("Lab Block Duration:", savedTemplate.labBlockDuration, "minutes");
      console.log("Daily Periods:", savedTemplate.dailyPeriods.length);
      console.log("Timetable Slots Created:", savedSlots.length);
      
      // Print slot mapping from saved slots
      console.log("\n--- SAVED TIMETABLE SLOTS ---");
      const dayOrder = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      dayOrder.forEach(day => {
        const daySlots = savedSlots.filter((slot: any) => slot.dayOfWeek === day);
        if (daySlots.length > 0) {
          console.log(`\n${day.toUpperCase()}:`);
          daySlots.forEach((slot: any) => {
            // Extract course code from specialInstructions
            const courseCode = slot.specialInstructions?.replace('Course Code: ', '') || 'Unknown';
            console.log(`  ${slot.startTime}-${slot.endTime}: ${courseCode} (${slot.slotType})`);
          });
        }
      });

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
          id: course.id || course._id?.toString() || '',
          course_code: course.courseCode,
          course_name: course.courseName,
          credits: course.credits,
          course_type: (course.courseType || 'theory').toLowerCase(),
          expected_students: course.expectedStrength || 30,
          requires_consecutive_slots: course.courseType === "laboratory"
        })),
        faculty: faculty.map(f => ({
          id: f.id || f._id?.toString() || '',
          name: `${f.firstName} ${f.lastName}`,
          email: f.email || `${f.firstName.toLowerCase()}.${f.lastName.toLowerCase()}@university.edu`,
          expertise: f.specialization || [],
          max_hours_per_week: f.maxWorkload || 40,
          preferred_days: Object.keys(f.availability || {}),
          unavailable_slots: []
        })),
        rooms: rooms.map(r => ({
          id: r.id || r._id?.toString() || '',
          room_number: r.roomNumber,
          room_name: r.roomName || r.roomNumber,
          capacity: r.capacity || 30,
          room_type: r.roomType || 'classroom',
          equipment: r.equipment || []
        })),
        students: students.map(student => ({
          id: student.id || student._id?.toString() || '',
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

  // Comprehensive AI System Endpoints
  
  // Save comprehensive admin configuration
  app.post("/api/comprehensive/admin/config", requireAuth, requireRole(['admin']), async (req, res) => {
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
  app.post("/api/comprehensive/generate-slots", requireAuth, requireRole(['admin']), async (req, res) => {
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
  app.post("/api/comprehensive/sectioning", requireAuth, requireRole(['admin']), async (req, res) => {
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
  app.post("/api/comprehensive/generate-timetable", requireAuth, requireRole(['admin']), async (req, res) => {
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
        
        const plainPassword = `${firstName}@123`;
        await storage.createStudent({
          studentId: `ST${String(i).padStart(4, '0')}`,
          firstName,
          lastName,
          email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}${i}@student.university.edu`,
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
        
        const plainPassword = `${faculty.firstName}@123`;
        await storage.createFaculty({
          facultyId: `FAC${String(i + 1).padStart(3, '0')}`,
          firstName: faculty.firstName,
          lastName: faculty.lastName,
          email: `${faculty.firstName.toLowerCase().replace(/[^a-z]/g, '')}.${faculty.lastName.toLowerCase()}@university.edu`,
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
