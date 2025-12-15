export interface DashboardStats {
  totalStudents: number;
  activeFaculty: number;
  courses: number;
  conflictsResolved: number;
}

export interface TimetableGenerationRequest {
  program: string;
  semester: number;
  batch: string;
  academicYear: string;
  constraints: {
    minimizeFacultyConflicts: boolean;
    optimizeRoomUtilization: boolean;
    balanceWorkloadDistribution: boolean;
    considerStudentPreferences: boolean;
  };
}

export interface CourseType {
  value: string;
  label: string;
  color: string;
}

export const courseTypes: CourseType[] = [
  { value: "Major", label: "Major Courses", color: "primary" },
  { value: "Minor", label: "Minor Courses", color: "chart-3" },
  { value: "Core", label: "Core Courses", color: "secondary" },
  { value: "Skill-Based", label: "Skill-Based Courses", color: "accent" },
  { value: "Ability Enhancement", label: "Ability Enhancement", color: "chart-4" },
  { value: "Value-Added", label: "Value-Added Courses", color: "chart-2" },
  { value: "Practical", label: "Practical/Field Work", color: "chart-1" },
];

export const programs = [
  { value: "B.Ed", label: "B.Ed. (4-Year)" },
  { value: "M.Ed", label: "M.Ed." },
  { value: "ITEP", label: "ITEP" },
  { value: "FYUP", label: "FYUP" },
];

export const roomTypes = [
  { value: "Classroom", label: "Classroom" },
  { value: "Lab", label: "Laboratory" },
  { value: "Auditorium", label: "Auditorium" },
  { value: "Seminar Hall", label: "Seminar Hall" },
];

export const timeSlots = [
  "09:00", "10:00", "11:00", "11:15", "12:15", "13:15", "14:15", "15:15", "16:15"
];

export const daysOfWeek = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
