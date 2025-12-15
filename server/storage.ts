import { 
  type Student, 
  type InsertStudent,
  type Faculty,
  type InsertFaculty,
  type Course,
  type InsertCourse,
  type Room,
  type InsertRoom,
  type Timetable,
  type InsertTimetable,
  type TimetableSlot,
  type InsertTimetableSlot,
  type Section,
  type InsertSection,
  type ElectiveGroup,
  type InsertElectiveGroup,
  type AcademicCalendar,
  type InsertAcademicCalendar,
  type TimeSlotTemplate,
  type InsertTimeSlotTemplate,
  type ConstraintProfile,
  type InsertConstraintProfile,
  type StudentPreferences,
  type InsertStudentPreferences
} from "@shared/schema";
import { MongoDBStorage, connectToMongoDB } from "./mongodb-storage";

export interface IStorage {
  // Students
  getStudents(): Promise<Student[]>;
  getStudent(id: string): Promise<Student | undefined>;
  getStudentByStudentId(studentId: string): Promise<Student | undefined>;
  getStudentsBySection(sectionId: string): Promise<Student[]>;
  createStudent(student: InsertStudent): Promise<Student>;
  updateStudent(id: string, student: Partial<Student>): Promise<Student | undefined>;
  deleteStudent(id: string): Promise<boolean>;

  // Faculty
  getFaculty(): Promise<Faculty[]>;
  getFacultyMember(id: string): Promise<Faculty | undefined>;
  getFacultyByFacultyId(facultyId: string): Promise<Faculty | undefined>;
  createFaculty(faculty: InsertFaculty): Promise<Faculty>;
  updateFaculty(id: string, faculty: Partial<Faculty>): Promise<Faculty | undefined>;
  deleteFaculty(id: string): Promise<boolean>;

  // Courses
  getCourses(): Promise<Course[]>;
  getCourse(id: string): Promise<Course | undefined>;
  getCourseByCode(courseCode: string): Promise<Course | undefined>;
  getCoursesByProgram(program: string, semester?: number): Promise<Course[]>;
  createCourse(course: InsertCourse): Promise<Course>;
  updateCourse(id: string, course: Partial<Course>): Promise<Course | undefined>;
  deleteCourse(id: string): Promise<boolean>;

  // Rooms
  getRooms(): Promise<Room[]>;
  getRoom(id: string): Promise<Room | undefined>;
  getRoomByNumber(roomNumber: string): Promise<Room | undefined>;
  createRoom(room: InsertRoom): Promise<Room>;
  updateRoom(id: string, room: Partial<Room>): Promise<Room | undefined>;
  deleteRoom(id: string): Promise<boolean>;

  // Timetables
  getTimetables(): Promise<Timetable[]>;
  getTimetable(id: string): Promise<Timetable | undefined>;
  getTimetablesByProgram(program: string, semester?: number): Promise<Timetable[]>;
  createTimetable(timetable: InsertTimetable): Promise<Timetable>;
  updateTimetable(id: string, timetable: Partial<Timetable>): Promise<Timetable | undefined>;
  deleteTimetable(id: string): Promise<boolean>;

  // Timetable Slots
  getTimetableSlots(timetableId: string): Promise<TimetableSlot[]>;
  createTimetableSlot(slot: InsertTimetableSlot): Promise<TimetableSlot>;
  updateTimetableSlot(id: string, slot: Partial<TimetableSlot>): Promise<TimetableSlot | undefined>;
  deleteTimetableSlot(id: string): Promise<boolean>;
  deleteTimetableSlots(timetableId: string): Promise<boolean>;

  // NEP 2020 Extensions: Sections
  getSections(): Promise<Section[]>;
  getSection(id: string): Promise<Section | undefined>;
  getSectionsByProgram(program: string, semester?: number): Promise<Section[]>;
  createSection(section: InsertSection): Promise<Section>;
  updateSection(id: string, section: Partial<Section>): Promise<Section | undefined>;
  deleteSection(id: string): Promise<boolean>;

  // NEP 2020 Extensions: Elective Groups
  getElectiveGroups(): Promise<ElectiveGroup[]>;
  getElectiveGroup(id: string): Promise<ElectiveGroup | undefined>;
  getElectiveGroupsByProgram(program: string, semester?: number): Promise<ElectiveGroup[]>;
  createElectiveGroup(group: InsertElectiveGroup): Promise<ElectiveGroup>;
  updateElectiveGroup(id: string, group: Partial<ElectiveGroup>): Promise<ElectiveGroup | undefined>;
  deleteElectiveGroup(id: string): Promise<boolean>;

  // NEP 2020 Extensions: Academic Calendar
  getAcademicCalendars(): Promise<AcademicCalendar[]>;
  getAcademicCalendar(id: string): Promise<AcademicCalendar | undefined>;
  getAcademicCalendarByYear(academicYear: string, semester?: number): Promise<AcademicCalendar | undefined>;
  createAcademicCalendar(calendar: InsertAcademicCalendar): Promise<AcademicCalendar>;
  updateAcademicCalendar(id: string, calendar: Partial<AcademicCalendar>): Promise<AcademicCalendar | undefined>;
  deleteAcademicCalendar(id: string): Promise<boolean>;

  // NEP 2020 Extensions: Time Slot Templates
  getTimeSlotTemplates(): Promise<TimeSlotTemplate[]>;
  getTimeSlotTemplate(id: string): Promise<TimeSlotTemplate | undefined>;
  getDefaultTimeSlotTemplate(): Promise<TimeSlotTemplate | undefined>;
  createTimeSlotTemplate(template: InsertTimeSlotTemplate): Promise<TimeSlotTemplate>;
  updateTimeSlotTemplate(id: string, template: Partial<TimeSlotTemplate>): Promise<TimeSlotTemplate | undefined>;
  deleteTimeSlotTemplate(id: string): Promise<boolean>;

  // NEP 2020 Extensions: Constraint Profiles
  getConstraintProfiles(): Promise<ConstraintProfile[]>;
  getConstraintProfile(id: string): Promise<ConstraintProfile | undefined>;
  getDefaultConstraintProfile(): Promise<ConstraintProfile | undefined>;
  createConstraintProfile(profile: InsertConstraintProfile): Promise<ConstraintProfile>;
  updateConstraintProfile(id: string, profile: Partial<ConstraintProfile>): Promise<ConstraintProfile | undefined>;
  deleteConstraintProfile(id: string): Promise<boolean>;

  // NEP 2020 Extensions: Student Preferences
  getStudentPreferences(): Promise<StudentPreferences[]>;
  getStudentPreference(id: string): Promise<StudentPreferences | undefined>;
  getStudentPreferencesByStudent(studentId: string): Promise<StudentPreferences | undefined>;
  createStudentPreferences(preferences: InsertStudentPreferences): Promise<StudentPreferences>;
  updateStudentPreferences(id: string, preferences: Partial<StudentPreferences>): Promise<StudentPreferences | undefined>;
  deleteStudentPreferences(id: string): Promise<boolean>;

  // Utility methods
  clearAllData(): Promise<void>;
}

// Initialize MongoDB storage
let mongodbStorage: MongoDBStorage | null = null;

export async function initializeStorage(): Promise<MongoDBStorage> {
  if (!mongodbStorage) {
    await connectToMongoDB();
    mongodbStorage = new MongoDBStorage();
  }
  return mongodbStorage;
}

// Export the storage instance - uses MongoDB only
export const storage: IStorage = {
  // Initialize MongoDB storage on first access
  async getStudents() {
    const db = await initializeStorage();
    return db.getStudents();
  },
  
  async getStudent(id: string) {
    const db = await initializeStorage();
    return db.getStudent(id);
  },
  
  async getStudentByStudentId(studentId: string) {
    const db = await initializeStorage();
    return db.getStudentByStudentId(studentId);
  },
  
  async getStudentsBySection(sectionId: string) {
    const db = await initializeStorage();
    return db.getStudentsBySection(sectionId);
  },
  
  async createStudent(student: InsertStudent) {
    const db = await initializeStorage();
    return db.createStudent(student);
  },
  
  async updateStudent(id: string, student: Partial<Student>) {
    const db = await initializeStorage();
    return db.updateStudent(id, student);
  },
  
  async deleteStudent(id: string) {
    const db = await initializeStorage();
    return db.deleteStudent(id);
  },

  // Faculty methods
  async getFaculty() {
    const db = await initializeStorage();
    return db.getFaculty();
  },
  
  async getFacultyMember(id: string) {
    const db = await initializeStorage();
    return db.getFacultyMember(id);
  },
  
  async getFacultyByFacultyId(facultyId: string) {
    const db = await initializeStorage();
    return db.getFacultyByFacultyId(facultyId);
  },
  
  async createFaculty(faculty: InsertFaculty) {
    const db = await initializeStorage();
    return db.createFaculty(faculty);
  },
  
  async updateFaculty(id: string, faculty: Partial<Faculty>) {
    const db = await initializeStorage();
    return db.updateFaculty(id, faculty);
  },
  
  async deleteFaculty(id: string) {
    const db = await initializeStorage();
    return db.deleteFaculty(id);
  },

  // Course methods
  async getCourses() {
    const db = await initializeStorage();
    return db.getCourses();
  },
  
  async getCourse(id: string) {
    const db = await initializeStorage();
    return db.getCourse(id);
  },
  
  async getCourseByCode(courseCode: string) {
    const db = await initializeStorage();
    return db.getCourseByCode(courseCode);
  },
  
  async getCoursesByProgram(program: string, semester?: number) {
    const db = await initializeStorage();
    return db.getCoursesByProgram(program, semester);
  },
  
  async createCourse(course: InsertCourse) {
    const db = await initializeStorage();
    return db.createCourse(course);
  },
  
  async updateCourse(id: string, course: Partial<Course>) {
    const db = await initializeStorage();
    return db.updateCourse(id, course);
  },
  
  async deleteCourse(id: string) {
    const db = await initializeStorage();
    return db.deleteCourse(id);
  },

  // Room methods
  async getRooms() {
    const db = await initializeStorage();
    return db.getRooms();
  },
  
  async getRoom(id: string) {
    const db = await initializeStorage();
    return db.getRoom(id);
  },
  
  async getRoomByNumber(roomNumber: string) {
    const db = await initializeStorage();
    return db.getRoomByNumber(roomNumber);
  },
  
  async createRoom(room: InsertRoom) {
    const db = await initializeStorage();
    return db.createRoom(room);
  },
  
  async updateRoom(id: string, room: Partial<Room>) {
    const db = await initializeStorage();
    return db.updateRoom(id, room);
  },
  
  async deleteRoom(id: string) {
    const db = await initializeStorage();
    return db.deleteRoom(id);
  },

  // Timetable methods
  async getTimetables() {
    const db = await initializeStorage();
    return db.getTimetables();
  },
  
  async getTimetable(id: string) {
    const db = await initializeStorage();
    return db.getTimetable(id);
  },
  
  async getTimetablesByProgram(program: string, semester?: number) {
    const db = await initializeStorage();
    return db.getTimetablesByProgram(program, semester);
  },
  
  async createTimetable(timetable: InsertTimetable) {
    const db = await initializeStorage();
    return db.createTimetable(timetable);
  },
  
  async updateTimetable(id: string, timetable: Partial<Timetable>) {
    const db = await initializeStorage();
    return db.updateTimetable(id, timetable);
  },
  
  async deleteTimetable(id: string) {
    const db = await initializeStorage();
    return db.deleteTimetable(id);
  },

  // Timetable slot methods
  async getTimetableSlots(timetableId: string) {
    const db = await initializeStorage();
    return db.getTimetableSlots(timetableId);
  },
  
  async createTimetableSlot(slot: InsertTimetableSlot) {
    const db = await initializeStorage();
    return db.createTimetableSlot(slot);
  },
  
  async updateTimetableSlot(id: string, slot: Partial<TimetableSlot>) {
    const db = await initializeStorage();
    return db.updateTimetableSlot(id, slot);
  },
  
  async deleteTimetableSlot(id: string) {
    const db = await initializeStorage();
    return db.deleteTimetableSlot(id);
  },
  
  async deleteTimetableSlots(timetableId: string) {
    const db = await initializeStorage();
    return db.deleteTimetableSlots(timetableId);
  },

  // Section methods
  async getSections() {
    const db = await initializeStorage();
    return db.getSections();
  },
  
  async getSection(id: string) {
    const db = await initializeStorage();
    return db.getSection(id);
  },
  
  async getSectionsByProgram(program: string, semester?: number) {
    const db = await initializeStorage();
    return db.getSectionsByProgram(program, semester);
  },
  
  async createSection(section: InsertSection) {
    const db = await initializeStorage();
    return db.createSection(section);
  },
  
  async updateSection(id: string, section: Partial<Section>) {
    const db = await initializeStorage();
    return db.updateSection(id, section);
  },
  
  async deleteSection(id: string) {
    const db = await initializeStorage();
    return db.deleteSection(id);
  },

  // Elective group methods
  async getElectiveGroups() {
    const db = await initializeStorage();
    return db.getElectiveGroups();
  },
  
  async getElectiveGroup(id: string) {
    const db = await initializeStorage();
    return db.getElectiveGroup(id);
  },
  
  async getElectiveGroupsByProgram(program: string, semester?: number) {
    const db = await initializeStorage();
    return db.getElectiveGroupsByProgram(program, semester);
  },
  
  async createElectiveGroup(group: InsertElectiveGroup) {
    const db = await initializeStorage();
    return db.createElectiveGroup(group);
  },
  
  async updateElectiveGroup(id: string, group: Partial<ElectiveGroup>) {
    const db = await initializeStorage();
    return db.updateElectiveGroup(id, group);
  },
  
  async deleteElectiveGroup(id: string) {
    const db = await initializeStorage();
    return db.deleteElectiveGroup(id);
  },

  // Academic calendar methods
  async getAcademicCalendars() {
    const db = await initializeStorage();
    return db.getAcademicCalendars();
  },
  
  async getAcademicCalendar(id: string) {
    const db = await initializeStorage();
    return db.getAcademicCalendar(id);
  },
  
  async getAcademicCalendarByYear(academicYear: string, semester?: number) {
    const db = await initializeStorage();
    return db.getAcademicCalendarByYear(academicYear, semester);
  },
  
  async createAcademicCalendar(calendar: InsertAcademicCalendar) {
    const db = await initializeStorage();
    return db.createAcademicCalendar(calendar);
  },
  
  async updateAcademicCalendar(id: string, calendar: Partial<AcademicCalendar>) {
    const db = await initializeStorage();
    return db.updateAcademicCalendar(id, calendar);
  },
  
  async deleteAcademicCalendar(id: string) {
    const db = await initializeStorage();
    return db.deleteAcademicCalendar(id);
  },

  // Time slot template methods
  async getTimeSlotTemplates() {
    const db = await initializeStorage();
    return db.getTimeSlotTemplates();
  },
  
  async getTimeSlotTemplate(id: string) {
    const db = await initializeStorage();
    return db.getTimeSlotTemplate(id);
  },
  
  async getDefaultTimeSlotTemplate() {
    const db = await initializeStorage();
    return db.getDefaultTimeSlotTemplate();
  },
  
  async createTimeSlotTemplate(template: InsertTimeSlotTemplate) {
    const db = await initializeStorage();
    return db.createTimeSlotTemplate(template);
  },
  
  async updateTimeSlotTemplate(id: string, template: Partial<TimeSlotTemplate>) {
    const db = await initializeStorage();
    return db.updateTimeSlotTemplate(id, template);
  },
  
  async deleteTimeSlotTemplate(id: string) {
    const db = await initializeStorage();
    return db.deleteTimeSlotTemplate(id);
  },

  // Constraint profile methods
  async getConstraintProfiles() {
    const db = await initializeStorage();
    return db.getConstraintProfiles();
  },
  
  async getConstraintProfile(id: string) {
    const db = await initializeStorage();
    return db.getConstraintProfile(id);
  },
  
  async getDefaultConstraintProfile() {
    const db = await initializeStorage();
    return db.getDefaultConstraintProfile();
  },
  
  async createConstraintProfile(profile: InsertConstraintProfile) {
    const db = await initializeStorage();
    return db.createConstraintProfile(profile);
  },
  
  async updateConstraintProfile(id: string, profile: Partial<ConstraintProfile>) {
    const db = await initializeStorage();
    return db.updateConstraintProfile(id, profile);
  },
  
  async deleteConstraintProfile(id: string) {
    const db = await initializeStorage();
    return db.deleteConstraintProfile(id);
  },

  // Student preferences methods
  async getStudentPreferences() {
    const db = await initializeStorage();
    return db.getStudentPreferences();
  },
  
  async getStudentPreference(id: string) {
    const db = await initializeStorage();
    return db.getStudentPreference(id);
  },
  
  async getStudentPreferencesByStudent(studentId: string) {
    const db = await initializeStorage();
    return db.getStudentPreferencesByStudent(studentId);
  },
  
  async createStudentPreferences(preferences: InsertStudentPreferences) {
    const db = await initializeStorage();
    return db.createStudentPreferences(preferences);
  },
  
  async updateStudentPreferences(id: string, preferences: Partial<StudentPreferences>) {
    const db = await initializeStorage();
    return db.updateStudentPreferences(id, preferences);
  },
  
  async deleteStudentPreferences(id: string) {
    const db = await initializeStorage();
    return db.deleteStudentPreferences(id);
  },

  async clearAllData() {
    const db = await initializeStorage();
    return db.clearAllData();
  },
};