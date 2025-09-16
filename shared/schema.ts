import { z } from "zod";

// Basic TypeScript types for the data models
export interface Student {
  id: string;
  studentId: string;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  plainPassword: string;
  phone: string | null;
  program: string;
  semester: number;
  batch: string;
  sectionId: string | null;
  enrolledCourses: string[];
  preferences: Record<string, any>;
  isActive: boolean;
  createdAt: Date;
}

export interface Faculty {
  id: string;
  facultyId: string;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  plainPassword: string;
  phone: string | null;
  department: string;
  designation: string;
  expertise: string[];
  maxWorkload: number;
  availability: Record<string, any>;
  assignedCourses: string[];
  isActive: boolean;
  createdAt: Date;
}

export interface Course {
  id: string;
  courseCode: string;
  courseName: string;
  courseType: string; // Major, Minor, Skill-Based, Ability Enhancement, Value-Added, Core
  credits: number;
  theoryHours: number;
  practicalHours: number;
  program: string;
  semester: number;
  prerequisites: string[];
  description: string | null;
  isActive: boolean;
  createdAt: Date;
}

export interface Room {
  id: string;
  roomNumber: string;
  roomName: string;
  roomType: string; // Classroom, Lab, Auditorium, Seminar Hall
  capacity: number;
  equipment: string[];
  location: string | null;
  isAvailable: boolean;
  maintenanceSchedule: any[];
  createdAt: Date;
}

export interface Timetable {
  id: string;
  name: string;
  program: string;
  semester: number;
  batch: string;
  sectionId: string | null;
  academicYear: string;
  schedule: Record<string, any>;
  conflicts: any[];
  optimizationScore: number;
  status: string; // draft, active, archived
  generatedBy: string | null; // AI or manual
  timeSlotTemplateId?: string | null; // Reference to TimeSlotTemplate
  createdAt: Date;
  updatedAt: Date;
}

export interface TimetableSlot {
  id: string;
  timetableId: string;
  courseId: string;
  facultyId: string;
  roomId: string;
  sectionIds: string[];
  dayOfWeek: string; // Monday, Tuesday, etc.
  startTime: string; // HH:MM format
  endTime: string;
  slotType: string; // theory, practical, lab, fieldwork, teaching_practice
  isLabBlock: boolean;
  specialInstructions: string | null;
  createdAt: Date;
}

export interface Section {
  id: string;
  sectionName: string; // A, B, C, etc.
  program: string;
  semester: number;
  batch: string;
  academicYear: string;
  maxStudents: number;
  currentEnrollment: number;
  isActive: boolean;
  createdAt: Date;
}

export interface ElectiveGroup {
  id: string;
  groupName: string; // "Major Electives", "Minor Electives", "Skill Enhancement"
  program: string;
  semester: number;
  electiveType: string; // major, minor, skill, value_added, ability_enhancement
  maxSelections: number;
  minSelections: number;
  availableCourses: string[];
  capacityRules: Record<string, any>;
  isActive: boolean;
  createdAt: Date;
}

export interface AcademicCalendar {
  id: string;
  academicYear: string;
  semester: number;
  startDate: Date;
  endDate: Date;
  workingDays: string[];
  holidays: any[];
  examPeriods: any[];
  specialEvents: any[];
  createdAt: Date;
}

export interface TimeSlotTemplate {
  id: string;
  templateName: string; // "Standard", "Lab Block", "Extended"
  workingDays: string[];
  periodDuration: number; // Duration in minutes
  labBlockDuration: number; // Lab session duration
  dailyPeriods: any[];
  breaks: any[];
  isDefault: boolean;
  createdAt: Date;
}

export interface ConstraintProfile {
  id: string;
  profileName: string;
  description: string | null;
  hardConstraints: Record<string, any>;
  softConstraints: Record<string, any>;
  constraintWeights: Record<string, any>;
  isDefault: boolean;
  createdAt: Date;
}

export interface StudentPreferences {
  id: string;
  studentId: string;
  sectionId: string | null;
  electiveChoices: Record<string, any>;
  timePreferences: Record<string, any>;
  avoidTimeSlots: any[];
  specialRequirements: any[];
  submittedAt: Date;
  isLocked: boolean;
  createdAt: Date;
}

// Insert schemas (Zod schemas for validation)
export const insertStudentSchema = z.object({
  studentId: z.string().min(1),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(1),
  plainPassword: z.string().min(1),
  phone: z.string().nullable().optional(),
  program: z.string().min(1),
  semester: z.number().int().positive(),
  batch: z.string().min(1),
  sectionId: z.string().nullable().optional(),
  enrolledCourses: z.array(z.string()).default([]),
  preferences: z.record(z.any()).default({}),
  isActive: z.boolean().default(true),
});

export const insertFacultySchema = z.object({
  facultyId: z.string().min(1),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(1),
  plainPassword: z.string().min(1),
  phone: z.string().nullable().optional(),
  department: z.string().min(1),
  designation: z.string().min(1),
  expertise: z.array(z.string()).default([]),
  maxWorkload: z.number().int().positive().default(20),
  availability: z.record(z.any()).default({}),
  assignedCourses: z.array(z.string()).default([]),
  isActive: z.boolean().default(true),
});

export const insertCourseSchema = z.object({
  courseCode: z.string().min(1),
  courseName: z.string().min(1),
  courseType: z.string().min(1),
  credits: z.number().int().positive(),
  theoryHours: z.number().int().min(0).default(0),
  practicalHours: z.number().int().min(0).default(0),
  program: z.string().min(1),
  semester: z.number().int().positive(),
  prerequisites: z.array(z.string()).default([]),
  description: z.string().nullable().optional(),
  isActive: z.boolean().default(true),
});

export const insertRoomSchema = z.object({
  roomNumber: z.string().min(1),
  roomName: z.string().min(1),
  roomType: z.string().min(1),
  capacity: z.number().int().positive(),
  equipment: z.array(z.string()).default([]),
  location: z.string().nullable().optional(),
  isAvailable: z.boolean().default(true),
  maintenanceSchedule: z.array(z.any()).default([]),
});

export const insertTimetableSchema = z.object({
  name: z.string().min(1),
  program: z.string().min(1),
  semester: z.number().int().positive(),
  batch: z.string().min(1),
  sectionId: z.string().nullable().optional(),
  academicYear: z.string().min(1),
  schedule: z.record(z.any()).default({}),
  conflicts: z.array(z.any()).default([]),
  optimizationScore: z.number().int().default(0),
  status: z.string().default('draft'),
  generatedBy: z.string().nullable().optional(),
  timeSlotTemplateId: z.string().nullable().optional(),
});

export const insertTimetableSlotSchema = z.object({
  timetableId: z.string().min(1),
  courseId: z.string().min(1),
  facultyId: z.string().min(1),
  roomId: z.string().min(1),
  sectionIds: z.array(z.string()).default([]),
  dayOfWeek: z.string().min(1),
  startTime: z.string().min(1),
  endTime: z.string().min(1),
  slotType: z.string().min(1),
  isLabBlock: z.boolean().default(false),
  specialInstructions: z.string().nullable().optional(),
});

export const insertSectionSchema = z.object({
  sectionName: z.string().min(1),
  program: z.string().min(1),
  semester: z.number().int().positive(),
  batch: z.string().min(1),
  academicYear: z.string().min(1),
  maxStudents: z.number().int().positive().default(60),
  currentEnrollment: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
});

export const insertElectiveGroupSchema = z.object({
  groupName: z.string().min(1),
  program: z.string().min(1),
  semester: z.number().int().positive(),
  electiveType: z.string().min(1),
  maxSelections: z.number().int().positive().default(1),
  minSelections: z.number().int().positive().default(1),
  availableCourses: z.array(z.string()).default([]),
  capacityRules: z.record(z.any()).default({}),
  isActive: z.boolean().default(true),
});

export const insertAcademicCalendarSchema = z.object({
  academicYear: z.string().min(1),
  semester: z.number().int().positive(),
  startDate: z.date(),
  endDate: z.date(),
  workingDays: z.array(z.string()).default(["Monday","Tuesday","Wednesday","Thursday","Friday"]),
  holidays: z.array(z.any()).default([]),
  examPeriods: z.array(z.any()).default([]),
  specialEvents: z.array(z.any()).default([]),
});

export const insertTimeSlotTemplateSchema = z.object({
  templateName: z.string().min(1),
  workingDays: z.array(z.string()).default(["Monday","Tuesday","Wednesday","Thursday","Friday"]),
  periodDuration: z.number().int().positive().default(60),
  labBlockDuration: z.number().int().positive().default(120),
  dailyPeriods: z.array(z.any()).default([]),
  breaks: z.array(z.any()).default([]),
  isDefault: z.boolean().default(false),
});

export const insertConstraintProfileSchema = z.object({
  profileName: z.string().min(1),
  description: z.string().nullable().optional(),
  hardConstraints: z.record(z.any()).default({}),
  softConstraints: z.record(z.any()).default({}),
  constraintWeights: z.record(z.any()).default({}),
  isDefault: z.boolean().default(false),
});

export const insertStudentPreferencesSchema = z.object({
  studentId: z.string().min(1),
  sectionId: z.string().nullable().optional(),
  electiveChoices: z.record(z.any()).default({}),
  timePreferences: z.record(z.any()).default({}),
  avoidTimeSlots: z.array(z.any()).default([]),
  specialRequirements: z.array(z.any()).default([]),
  submittedAt: z.date().default(() => new Date()),
  isLocked: z.boolean().default(false),
});

// Insert types (inferred from Zod schemas)
export type InsertStudent = z.infer<typeof insertStudentSchema>;
export type InsertFaculty = z.infer<typeof insertFacultySchema>;
export type InsertCourse = z.infer<typeof insertCourseSchema>;
export type InsertRoom = z.infer<typeof insertRoomSchema>;
export type InsertTimetable = z.infer<typeof insertTimetableSchema>;
export type InsertTimetableSlot = z.infer<typeof insertTimetableSlotSchema>;
export type InsertSection = z.infer<typeof insertSectionSchema>;
export type InsertElectiveGroup = z.infer<typeof insertElectiveGroupSchema>;
export type InsertAcademicCalendar = z.infer<typeof insertAcademicCalendarSchema>;
export type InsertTimeSlotTemplate = z.infer<typeof insertTimeSlotTemplateSchema>;
export type InsertConstraintProfile = z.infer<typeof insertConstraintProfileSchema>;
export type InsertStudentPreferences = z.infer<typeof insertStudentPreferencesSchema>;

// Authentication schemas
export const loginSchema = z.object({
  username: z.string().min(1, "Username is required").trim(),
  password: z.string().min(1, "Password is required"),
  role: z.enum(["admin", "faculty", "student"], {
    required_error: "Role is required",
    invalid_type_error: "Role must be admin, faculty, or student"
  })
});

export type LoginRequest = z.infer<typeof loginSchema>;

// Course Registration schemas
export const courseRegistrationSchema = z.object({
  courseId: z.string().min(1, "Course ID is required")
});

export type CourseRegistrationRequest = z.infer<typeof courseRegistrationSchema>;