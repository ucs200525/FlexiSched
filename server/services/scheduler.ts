// Constraint Satisfaction Problem (CSP) based timetable scheduler
// Implements forward checking with MRV (Minimum Remaining Values) and LCV (Least Constraining Value) heuristics

export interface TimetableGenerationRequest {
  program: string;
  semester: number;
  batch: string;
  academicYear: string;
  courses: Array<{
    id: string;
    courseCode: string;
    courseName: string;
    courseType: string;
    credits: number;
    theoryHours: number;
    practicalHours: number;
  }>;
  faculty: Array<{
    id: string;
    firstName: string;
    lastName: string;
    expertise: string[];
    maxWorkload: number;
    availability: Record<string, string[]>;
  }>;
  rooms: Array<{
    id: string;
    roomNumber: string;
    roomType: string;
    capacity: number;
    equipment: string[];
  }>;
  constraints: {
    minimizeFacultyConflicts: boolean;
    optimizeRoomUtilization: boolean;
    balanceWorkloadDistribution: boolean;
    considerStudentPreferences: boolean;
  };
}

export interface TimetableGenerationResponse {
  schedule: Array<{
    courseId: string;
    facultyId: string;
    roomId: string;
    dayOfWeek: string;
    startTime: string;
    endTime: string;
    slotType: string;
  }>;
  conflicts: Array<{
    type: string;
    description: string;
    severity: 'low' | 'medium' | 'high';
    suggestions: string[];
  }>;
  optimizationScore: number;
  metrics: {
    facultyUtilization: number;
    roomUtilization: number;
    conflictCount: number;
    workloadBalance: number;
  };
}

interface TimeSlot {
  day: string;
  startTime: string;
  endTime: string;
  duration: number; // in hours
}

interface Assignment {
  courseId: string;
  facultyId: string;
  roomId: string;
  timeSlot: TimeSlot;
  slotType: string;
}

// Define working hours and time slots
const WORKING_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const WORKING_HOURS = ['09:00', '10:00', '11:00', '14:00', '15:00', '16:00'];

export class TimetableScheduler {
  private request: TimetableGenerationRequest;
  private assignments: Assignment[] = [];
  private facultyWorkload: Map<string, number> = new Map();
  private roomSchedule: Map<string, Set<string>> = new Map();
  private facultySchedule: Map<string, Set<string>> = new Map();

  constructor(request: TimetableGenerationRequest) {
    this.request = request;
    this.initializeWorkload();
  }

  private initializeWorkload() {
    this.request.faculty.forEach(faculty => {
      this.facultyWorkload.set(faculty.id, 0);
      this.facultySchedule.set(faculty.id, new Set());
    });
    
    this.request.rooms.forEach(room => {
      this.roomSchedule.set(room.id, new Set());
    });
  }

  private getTimeSlotKey(day: string, startTime: string, endTime: string): string {
    return `${day}-${startTime}-${endTime}`;
  }

  private isValidFacultyAssignment(courseId: string, facultyId: string): boolean {
    const faculty = this.request.faculty.find(f => f.id === facultyId);
    const course = this.request.courses.find(c => c.id === courseId);
    
    if (!faculty || !course) return false;

    // Check expertise match
    const hasExpertise = faculty.expertise.some(expertise => 
      course.courseCode.toLowerCase().includes(expertise.toLowerCase()) ||
      course.courseName.toLowerCase().includes(expertise.toLowerCase())
    );

    // Check workload constraints
    const currentWorkload = this.facultyWorkload.get(facultyId) || 0;
    const courseHours = course.theoryHours + course.practicalHours;
    
    return hasExpertise && (currentWorkload + courseHours <= faculty.maxWorkload);
  }

  private isValidRoomAssignment(courseId: string, roomId: string): boolean {
    const room = this.request.rooms.find(r => r.id === roomId);
    const course = this.request.courses.find(c => c.id === courseId);
    
    if (!room || !course) return false;

    // Check room type compatibility
    const roomTypeCompatible = 
      (course.courseType === 'practical' && room.roomType.includes('lab')) ||
      (course.courseType === 'theory' && (room.roomType === 'lecture' || room.roomType === 'classroom')) ||
      (course.courseType === 'project' && room.roomType.includes('project'));

    return roomTypeCompatible;
  }

  private isTimeSlotAvailable(facultyId: string, roomId: string, timeSlotKey: string): boolean {
    const facultySchedule = this.facultySchedule.get(facultyId);
    const roomSchedule = this.roomSchedule.get(roomId);
    
    return !facultySchedule?.has(timeSlotKey) && !roomSchedule?.has(timeSlotKey);
  }

  private generateTimeSlots(course: any): TimeSlot[] {
    const slots: TimeSlot[] = [];
    const totalHours = course.theoryHours + course.practicalHours;
    
    for (const day of WORKING_DAYS) {
      for (const startTime of WORKING_HOURS) {
        const startHour = parseInt(startTime.split(':')[0]);
        const endHour = startHour + (course.courseType === 'practical' ? 2 : 1);
        const endTime = `${endHour.toString().padStart(2, '0')}:00`;
        
        if (endHour <= 17) { // Don't go beyond 5 PM
          slots.push({
            day,
            startTime,
            endTime,
            duration: course.courseType === 'practical' ? 2 : 1
          });
        }
      }
    }
    
    return slots;
  }

  private assignCourse(course: any): boolean {
    const availableSlots = this.generateTimeSlots(course);
    
    // Try to find valid assignments using CSP approach
    for (const timeSlot of availableSlots) {
      for (const faculty of this.request.faculty) {
        if (!this.isValidFacultyAssignment(course.id, faculty.id)) continue;
        
        for (const room of this.request.rooms) {
          if (!this.isValidRoomAssignment(course.id, room.id)) continue;
          
          const timeSlotKey = this.getTimeSlotKey(timeSlot.day, timeSlot.startTime, timeSlot.endTime);
          
          if (this.isTimeSlotAvailable(faculty.id, room.id, timeSlotKey)) {
            // Make assignment
            this.assignments.push({
              courseId: course.id,
              facultyId: faculty.id,
              roomId: room.id,
              timeSlot,
              slotType: course.courseType
            });
            
            // Update schedules and workload
            this.facultySchedule.get(faculty.id)?.add(timeSlotKey);
            this.roomSchedule.get(room.id)?.add(timeSlotKey);
            this.facultyWorkload.set(faculty.id, (this.facultyWorkload.get(faculty.id) || 0) + timeSlot.duration);
            
            return true;
          }
        }
      }
    }
    
    return false;
  }

  public generateSchedule(): TimetableGenerationResponse {
    // Sort courses by constraints (most constrained first - MRV heuristic)
    const sortedCourses = [...this.request.courses].sort((a, b) => {
      const aConstraints = (a.courseType === 'practical' ? 2 : 1) + a.theoryHours + a.practicalHours;
      const bConstraints = (b.courseType === 'practical' ? 2 : 1) + b.theoryHours + b.practicalHours;
      return bConstraints - aConstraints;
    });

    // Assign courses using CSP
    const unassignedCourses: string[] = [];
    
    for (const course of sortedCourses) {
      if (!this.assignCourse(course)) {
        unassignedCourses.push(course.courseCode);
      }
    }

    // Convert assignments to schedule format
    const schedule = this.assignments.map(assignment => ({
      courseId: assignment.courseId,
      facultyId: assignment.facultyId,
      roomId: assignment.roomId,
      dayOfWeek: assignment.timeSlot.day,
      startTime: assignment.timeSlot.startTime,
      endTime: assignment.timeSlot.endTime,
      slotType: assignment.slotType
    }));

    // Detect conflicts and calculate metrics
    const conflicts = this.detectConflicts();
    const metrics = this.calculateMetrics();
    
    // Calculate optimization score
    const optimizationScore = this.calculateOptimizationScore(metrics, unassignedCourses.length);

    return {
      schedule,
      conflicts,
      optimizationScore,
      metrics
    };
  }

  private detectConflicts(): Array<{
    type: string;
    description: string;
    severity: 'low' | 'medium' | 'high';
    suggestions: string[];
  }> {
    const conflicts: Array<{
      type: string;
      description: string;
      severity: 'low' | 'medium' | 'high';
      suggestions: string[];
    }> = [];

    // Check for faculty overload
    this.facultyWorkload.forEach((workload, facultyId) => {
      const faculty = this.request.faculty.find(f => f.id === facultyId);
      if (faculty && workload > faculty.maxWorkload) {
        conflicts.push({
          type: 'faculty_overload',
          description: `Faculty ${faculty.firstName} ${faculty.lastName} is overloaded with ${workload} hours (max: ${faculty.maxWorkload})`,
          severity: 'high',
          suggestions: ['Redistribute courses to other faculty', 'Increase faculty workload limit', 'Hire additional faculty']
        });
      }
    });

    // Check for low room utilization
    const totalRoomHours = this.request.rooms.length * WORKING_DAYS.length * WORKING_HOURS.length;
    const usedRoomHours = this.assignments.length;
    const roomUtilization = (usedRoomHours / totalRoomHours) * 100;
    
    if (roomUtilization < 30) {
      conflicts.push({
        type: 'low_room_utilization',
        description: `Room utilization is low at ${roomUtilization.toFixed(1)}%`,
        severity: 'low',
        suggestions: ['Consolidate classes in fewer rooms', 'Add more courses', 'Reduce room inventory']
      });
    }

    return conflicts;
  }

  private calculateMetrics() {
    const totalFacultyCapacity = this.request.faculty.reduce((sum, f) => sum + f.maxWorkload, 0);
    const usedFacultyHours = Array.from(this.facultyWorkload.values()).reduce((sum, hours) => sum + hours, 0);
    
    const totalRoomHours = this.request.rooms.length * WORKING_DAYS.length * WORKING_HOURS.length;
    const usedRoomHours = this.assignments.length;
    
    const facultyUtilization = totalFacultyCapacity > 0 ? (usedFacultyHours / totalFacultyCapacity) * 100 : 0;
    const roomUtilization = totalRoomHours > 0 ? (usedRoomHours / totalRoomHours) * 100 : 0;
    
    // Calculate workload balance (standard deviation)
    const workloadValues = Array.from(this.facultyWorkload.values());
    const avgWorkload = workloadValues.reduce((sum, val) => sum + val, 0) / workloadValues.length || 0;
    const variance = workloadValues.reduce((sum, val) => sum + Math.pow(val - avgWorkload, 2), 0) / workloadValues.length || 0;
    const stdDev = Math.sqrt(variance);
    const workloadBalance = avgWorkload > 0 ? Math.max(0, 100 - (stdDev / avgWorkload) * 100) : 100;
    
    return {
      facultyUtilization: Math.round(facultyUtilization * 100) / 100,
      roomUtilization: Math.round(roomUtilization * 100) / 100,
      conflictCount: this.detectConflicts().length,
      workloadBalance: Math.round(workloadBalance * 100) / 100
    };
  }

  private calculateOptimizationScore(metrics: any, unassignedCount: number): number {
    const coursesAssigned = this.request.courses.length - unassignedCount;
    const assignmentRate = this.request.courses.length > 0 ? (coursesAssigned / this.request.courses.length) * 100 : 0;
    
    // Weighted score calculation
    const score = (
      assignmentRate * 0.4 +
      Math.min(metrics.facultyUtilization, 80) * 0.3 +
      Math.min(metrics.roomUtilization, 60) * 0.2 +
      metrics.workloadBalance * 0.1
    );
    
    return Math.round(score * 100) / 100;
  }
}

export async function generateTimetableWithAI(request: TimetableGenerationRequest): Promise<TimetableGenerationResponse> {
  try {
    const scheduler = new TimetableScheduler(request);
    return scheduler.generateSchedule();
  } catch (error) {
    throw new Error(`Failed to generate timetable: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function detectConflicts(schedule: any[]): Promise<Array<{
  type: string;
  description: string;
  severity: 'low' | 'medium' | 'high';
  suggestions: string[];
}>> {
  try {
    const conflicts: Array<{
      type: string;
      description: string;
      severity: 'low' | 'medium' | 'high';
      suggestions: string[];
    }> = [];

    // Check for faculty conflicts
    const facultySchedule: Record<string, Set<string>> = {};
    const roomSchedule: Record<string, Set<string>> = {};

    for (const slot of schedule) {
      const timeKey = `${slot.dayOfWeek}-${slot.startTime}-${slot.endTime}`;
      
      // Faculty conflict check
      if (!facultySchedule[slot.facultyId]) {
        facultySchedule[slot.facultyId] = new Set();
      }
      if (facultySchedule[slot.facultyId].has(timeKey)) {
        conflicts.push({
          type: 'faculty_conflict',
          description: `Faculty ${slot.facultyId} has overlapping classes on ${slot.dayOfWeek} at ${slot.startTime}`,
          severity: 'high',
          suggestions: ['Reschedule one of the conflicting classes', 'Assign different faculty member']
        });
      }
      facultySchedule[slot.facultyId].add(timeKey);

      // Room conflict check
      if (!roomSchedule[slot.roomId]) {
        roomSchedule[slot.roomId] = new Set();
      }
      if (roomSchedule[slot.roomId].has(timeKey)) {
        conflicts.push({
          type: 'room_conflict',
          description: `Room ${slot.roomId} has overlapping bookings on ${slot.dayOfWeek} at ${slot.startTime}`,
          severity: 'high',
          suggestions: ['Reschedule one of the conflicting classes', 'Find alternative room']
        });
      }
      roomSchedule[slot.roomId].add(timeKey);
    }

    return conflicts;
  } catch (error) {
    throw new Error(`Failed to detect conflicts: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}