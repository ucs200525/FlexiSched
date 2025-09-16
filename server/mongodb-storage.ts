import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
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
import { IStorage } from "./storage";

// MongoDB Connection
let mongoServer: MongoMemoryServer | null = null;

export async function connectToMongoDB() {
  try {
    // Check if already connected
    if (mongoose.connection.readyState === 1) {
      console.log('Already connected to MongoDB');
      return;
    }

    // Check if connection is in progress
    if (mongoose.connection.readyState === 2) {
      console.log('MongoDB connection in progress, waiting...');
      await new Promise(resolve => {
        mongoose.connection.once('connected', resolve);
      });
      return;
    }

    let uri = process.env.MONGODB_URI;
    
    // If no URI provided, use in-memory MongoDB
    if (!uri && !mongoServer) {
      console.log('No MONGODB_URI found, starting in-memory MongoDB server...');
      mongoServer = await MongoMemoryServer.create({
        instance: {
          dbName: 'timetable_system',
        },
      });
      uri = mongoServer.getUri();
      console.log('In-memory MongoDB server started at:', uri);
    } else if (!uri && mongoServer) {
      uri = mongoServer.getUri();
    }

    if (!uri) {
      throw new Error('No MongoDB URI available');
    }

    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      maxPoolSize: 10,
      minPoolSize: 1,
      maxIdleTimeMS: 30000,
    });
    
    console.log('Connected to MongoDB successfully');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    throw error;
  }
}

export async function disconnectFromMongoDB() {
  try {
    await mongoose.disconnect();
    if (mongoServer) {
      await mongoServer.stop();
      mongoServer = null;
      console.log('In-memory MongoDB server stopped');
    }
  } catch (error) {
    console.error('Error disconnecting from MongoDB:', error);
  }
}

// Mongoose Schemas
const StudentSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  studentId: { type: String, required: true, unique: true },
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  plainPassword: { type: String, required: true }, // For reference only
  phone: { type: String, default: null },
  program: { type: String, required: true },
  semester: { type: Number, required: true },
  batch: { type: String, required: true },
  sectionId: { type: String, default: null },
  enrolledCourses: [{ type: String }],
  preferences: { type: Object, default: {} },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

const FacultySchema = new mongoose.Schema({
  _id: { type: String, required: true },
  facultyId: { type: String, required: true, unique: true },
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  plainPassword: { type: String, required: true }, // For reference only
  phone: { type: String, default: null },
  department: { type: String, required: true },
  designation: { type: String, required: true },
  expertise: [{ type: String }],
  maxWorkload: { type: Number, default: 20 },
  availability: { type: Object, default: {} },
  assignedCourses: [{ type: String }],
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

const CourseSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  courseCode: { type: String, required: true, unique: true },
  courseName: { type: String, required: true },
  program: { type: String, required: true },
  semester: { type: Number, required: true },
  credits: { type: Number, required: true },
  courseType: { type: String, enum: ['Core', 'Elective', 'Lab', 'Project'], required: true },
  theoryHours: { type: Number, default: 0 },
  practicalHours: { type: Number, default: 0 },
  prerequisites: [{ type: String }],
  description: { type: String, default: null },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

const RoomSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  roomNumber: { type: String, required: true, unique: true },
  roomName: { type: String, required: true },
  roomType: { type: String, required: true },
  capacity: { type: Number, required: true },
  equipment: [{ type: String }],
  location: { type: String, default: null },
  isAvailable: { type: Boolean, default: true },
  maintenanceSchedule: [{ type: Object }],
  createdAt: { type: Date, default: Date.now }
});

const TimetableSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  name: { type: String, required: true },
  program: { type: String, required: true },
  semester: { type: Number, required: true },
  academicYear: { type: String, required: true },
  sectionId: { type: String, default: null },
  schedule: { type: Object, default: {} },
  conflicts: [{ type: Object }],
  optimizationScore: { type: Number, default: 0 },
  status: { type: String, enum: ['draft', 'published', 'archived'], default: 'draft' },
  generatedBy: { type: String, default: null },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const TimetableSlotSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  timetableId: { type: String, required: true },
  courseId: { type: String, required: true },
  facultyId: { type: String, required: true },
  roomId: { type: String, required: true },
  dayOfWeek: { type: String, required: true },
  startTime: { type: String, required: true },
  endTime: { type: String, required: true },
  slotType: { type: String, enum: ['Theory', 'Lab', 'Tutorial'], required: true },
  sectionIds: [{ type: String }],
  isLabBlock: { type: Boolean, default: false },
  specialInstructions: { type: String, default: null },
  createdAt: { type: Date, default: Date.now }
});

const SectionSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  sectionName: { type: String, required: true },
  program: { type: String, required: true },
  semester: { type: Number, required: true },
  academicYear: { type: String, required: true },
  maxStudents: { type: Number, default: 60 },
  currentEnrollment: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

const ElectiveGroupSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  groupName: { type: String, required: true },
  program: { type: String, required: true },
  semester: { type: Number, required: true },
  academicYear: { type: String, required: true },
  maxSelections: { type: Number, default: 1 },
  minSelections: { type: Number, default: 1 },
  availableCourses: [{ type: String }],
  capacityRules: { type: Object, default: {} },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

const AcademicCalendarSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  academicYear: { type: String, required: true },
  semester: { type: Number, required: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  workingDays: [{ type: String }],
  holidays: [{ type: Object }],
  examPeriods: [{ type: Object }],
  specialEvents: [{ type: Object }],
  createdAt: { type: Date, default: Date.now }
});

const TimeSlotTemplateSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  templateName: { type: String, required: true },
  workingDays: [{ type: String }],
  startTime: { type: String, required: true },
  endTime: { type: String, required: true },
  periodDuration: { type: Number, default: 60 },
  labBlockDuration: { type: Number, default: 120 },
  dailyPeriods: [{ type: Object }],
  breaks: [{ type: Object }],
  isDefault: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

const ConstraintProfileSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  profileName: { type: String, required: true },
  constraints: { type: Object, required: true },
  weights: { type: Object, required: true },
  isDefault: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

const StudentPreferencesSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  studentId: { type: String, required: true },
  preferences: { type: Object, required: true },
  priority: { type: Number, default: 1 },
  createdAt: { type: Date, default: Date.now }
});

// Models
const StudentModel = mongoose.model('Student', StudentSchema);
const FacultyModel = mongoose.model('Faculty', FacultySchema);
const CourseModel = mongoose.model('Course', CourseSchema);
const RoomModel = mongoose.model('Room', RoomSchema);
const TimetableModel = mongoose.model('Timetable', TimetableSchema);
const TimetableSlotModel = mongoose.model('TimetableSlot', TimetableSlotSchema);
const SectionModel = mongoose.model('Section', SectionSchema);
const ElectiveGroupModel = mongoose.model('ElectiveGroup', ElectiveGroupSchema);
const AcademicCalendarModel = mongoose.model('AcademicCalendar', AcademicCalendarSchema);
const TimeSlotTemplateModel = mongoose.model('TimeSlotTemplate', TimeSlotTemplateSchema);
const ConstraintProfileModel = mongoose.model('ConstraintProfile', ConstraintProfileSchema);
const StudentPreferencesModel = mongoose.model('StudentPreferences', StudentPreferencesSchema);

export class MongoDBStorage implements IStorage {
  private timetables = new Map<string, Timetable>();
  private timetableSlots = new Map<string, TimetableSlot>();
  private timeSlotTemplates = new Map<string, TimeSlotTemplate>();

  constructor() {
    this.initializeDatabase();
  }

  private async initializeDatabase() {
    // Initialize with sample data
    await this.populateWithSampleData();
  }

  // Simple password hashing for demo purposes
  private hashPassword(password: string): string {
    // In production, use proper bcrypt hashing
    return `hashed_${password}`;
  }

  private async populateWithSampleData() {
    try {
      // Check if data already exists
      const studentCount = await StudentModel.countDocuments();
      if (studentCount > 0) {
        console.log('Sample data already exists, skipping initialization');
        return;
      }

      console.log('Populating database with sample data...');

      // Sample programs and departments
      const programs = ['Computer Science', 'Information Technology', 'Electronics Engineering', 'Mechanical Engineering', 'Civil Engineering'];
      const departments = ['Computer Science', 'Information Technology', 'Electronics', 'Mechanical', 'Civil'];

      // Create sample rooms
      const rooms: Room[] = [];
      for (let i = 1; i <= 20; i++) {
        const roomId = `room-${i}`;
        const room: Room = {
          id: roomId,
          roomNumber: `R-${i.toString().padStart(3, '0')}`,
          roomName: `Room ${i}`,
          roomType: i <= 5 ? 'Lab' : i <= 15 ? 'Classroom' : 'Seminar Hall',
          capacity: Math.floor(Math.random() * 40) + 30,
          equipment: ['Projector', 'Audio System'],
          location: `Floor ${Math.ceil(i / 5)}`,
          isAvailable: true,
          maintenanceSchedule: [],
          createdAt: new Date()
        };
        rooms.push(room);
      }

      // Create sample faculty (30 faculty members)
      const faculty: Faculty[] = [];
      const facultyNames = [
        'Dr. Rajesh Kumar', 'Prof. Sunita Sharma', 'Dr. Amit Patel', 'Prof. Priya Singh', 'Dr. Vikram Gupta',
        'Prof. Meera Joshi', 'Dr. Sandeep Mehta', 'Prof. Kavita Agarwal', 'Dr. Ravi Verma', 'Prof. Neha Chopra',
        'Dr. Manoj Tiwari', 'Prof. Pooja Mishra', 'Dr. Suresh Yadav', 'Prof. Anjali Saxena', 'Dr. Deepak Shukla',
        'Prof. Rekha Pandey', 'Dr. Anil Jain', 'Prof. Sushma Rao', 'Dr. Rahul Bansal', 'Prof. Geeta Malhotra',
        'Dr. Ashok Srivastava', 'Prof. Vandana Dubey', 'Dr. Praveen Singhal', 'Prof. Nisha Agrawal', 'Dr. Yogesh Bhardwaj',
        'Prof. Shruti Kapoor', 'Dr. Mohit Sharma', 'Prof. Divya Chauhan', 'Dr. Sunil Gupta', 'Prof. Ritu Jain'
      ];

      for (let i = 0; i < 30; i++) {
        const facultyId = `faculty-${i + 1}`;
        const nameParts = facultyNames[i].replace(/Dr\.|Prof\./, '').trim().split(' ');
        const firstName = nameParts[0];
        const lastName = nameParts.slice(1).join(' ');
        
        const plainPassword = `${firstName}@123`;
        const facultyMember: Faculty = {
          id: facultyId,
          facultyId: `FAC${(i + 1).toString().padStart(3, '0')}`,
          firstName,
          lastName,
          email: `${firstName.toLowerCase()}.${lastName.toLowerCase().replace(' ', '')}@university.edu`,
          password: this.hashPassword(plainPassword),
          plainPassword,
          phone: `+91${Math.floor(Math.random() * 9000000000) + 1000000000}`,
          department: departments[i % departments.length],
          designation: Math.random() > 0.5 ? 'Professor' : 'Assistant Professor',
          expertise: ['Programming', 'Data Structures', 'Algorithms'],
          maxWorkload: Math.floor(Math.random() * 10) + 15,
          availability: {},
          assignedCourses: [],
          isActive: true,
          createdAt: new Date()
        };
        faculty.push(facultyMember);
      }

      // Create sample courses (50 courses)
      const courseNames = [
        'Programming Fundamentals', 'Data Structures', 'Algorithms', 'Database Systems', 'Computer Networks',
        'Operating Systems', 'Software Engineering', 'Web Development', 'Mobile Computing', 'Artificial Intelligence',
        'Machine Learning', 'Data Mining', 'Computer Graphics', 'Human Computer Interaction', 'Cybersecurity',
        'Cloud Computing', 'Big Data Analytics', 'Internet of Things', 'Blockchain Technology', 'Digital Image Processing',
        'Computer Architecture', 'Microprocessors', 'Embedded Systems', 'VLSI Design', 'Signal Processing',
        'Control Systems', 'Power Electronics', 'Communication Systems', 'Antenna Theory', 'Microwave Engineering',
        'Engineering Mathematics', 'Engineering Physics', 'Engineering Chemistry', 'Engineering Mechanics', 'Thermodynamics',
        'Fluid Mechanics', 'Heat Transfer', 'Manufacturing Technology', 'Material Science', 'Quality Control',
        'Structural Analysis', 'Concrete Technology', 'Surveying', 'Transportation Engineering', 'Environmental Engineering',
        'Geotechnical Engineering', 'Water Resources Engineering', 'Construction Management', 'Urban Planning', 'Earthquake Engineering'
      ];

      const courses: Course[] = [];
      for (let i = 0; i < 50; i++) {
        const courseId = `course-${i + 1}`;
        const course: Course = {
          id: courseId,
          courseCode: `CS${(i + 1).toString().padStart(3, '0')}`,
          courseName: courseNames[i],
          program: programs[i % programs.length],
          semester: (i % 8) + 1,
          credits: Math.floor(Math.random() * 4) + 2,
          courseType: Math.random() > 0.7 ? 'Elective' : Math.random() > 0.8 ? 'Lab' : 'Core',
          theoryHours: Math.floor(Math.random() * 4) + 2,
          practicalHours: Math.floor(Math.random() * 4),
          prerequisites: [],
          description: `Course covering ${courseNames[i]} concepts and applications`,
          isActive: true,
          createdAt: new Date()
        };
        courses.push(course);
      }

      // Create sample students (200 students)
      const firstNames = [
        'Aarav', 'Vivaan', 'Aditya', 'Vihaan', 'Arjun', 'Sai', 'Reyansh', 'Ayaan', 'Krishna', 'Ishaan',
        'Shaurya', 'Atharv', 'Advik', 'Pranav', 'Rishabh', 'Gagan', 'Arnav', 'Hriday', 'Kabir', 'Shivansh',
        'Ananya', 'Diya', 'Priya', 'Kavya', 'Aanya', 'Pari', 'Ira', 'Myra', 'Sara', 'Navya',
        'Aadya', 'Kiara', 'Saanvi', 'Avni', 'Riya', 'Ishika', 'Shanaya', 'Aditi', 'Vanya', 'Tara'
      ];
      
      const lastNames = [
        'Sharma', 'Verma', 'Gupta', 'Singh', 'Kumar', 'Jain', 'Agarwal', 'Patel', 'Shah', 'Mehta',
        'Joshi', 'Mishra', 'Tiwari', 'Yadav', 'Shukla', 'Pandey', 'Saxena', 'Srivastava', 'Dubey', 'Bansal'
      ];

      const students: Student[] = [];
      for (let i = 0; i < 200; i++) {
        const studentId = `student-${i + 1}`;
        const firstName = firstNames[i % firstNames.length];
        const lastName = lastNames[i % lastNames.length];
        
        const plainPassword = `${firstName}@123`;
        const student: Student = {
          id: studentId,
          studentId: `STU${(i + 1).toString().padStart(4, '0')}`,
          firstName,
          lastName,
          email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}${i + 1}@student.university.edu`,
          password: this.hashPassword(plainPassword),
          plainPassword,
          phone: `+91${Math.floor(Math.random() * 9000000000) + 1000000000}`,
          program: programs[i % programs.length],
          semester: (i % 8) + 1,
          batch: `Batch-${2020 + (i % 5)}`,
          sectionId: null,
          enrolledCourses: [],
          preferences: {},
          isActive: true,
          createdAt: new Date()
        };
        students.push(student);
      }

      // Save all data to MongoDB
      await Promise.all([
        RoomModel.insertMany(rooms.map(r => ({ ...r, _id: r.id }))),
        FacultyModel.insertMany(faculty.map(f => ({ ...f, _id: f.id }))),
        CourseModel.insertMany(courses.map(c => ({ ...c, _id: c.id }))),
        StudentModel.insertMany(students.map(s => ({ ...s, _id: s.id })))
      ]);

      console.log('Sample data populated successfully!');
      console.log(`Created: ${students.length} students, ${faculty.length} faculty, ${courses.length} courses, ${rooms.length} rooms`);
    } catch (error) {
      console.error('Error populating sample data:', error);
    }
  }

  // Helper function to convert MongoDB document to our types
  private convertToStudent(doc: any): Student {
    return {
      id: doc._id,
      studentId: doc.studentId,
      firstName: doc.firstName,
      lastName: doc.lastName,
      email: doc.email,
      password: doc.password,
      plainPassword: doc.plainPassword,
      phone: doc.phone,
      program: doc.program,
      semester: doc.semester,
      batch: doc.batch,
      sectionId: doc.sectionId,
      enrolledCourses: doc.enrolledCourses,
      preferences: doc.preferences,
      isActive: doc.isActive,
      createdAt: doc.createdAt
    };
  }

  private convertToFaculty(doc: any): Faculty {
    return {
      id: doc._id,
      facultyId: doc.facultyId,
      firstName: doc.firstName,
      lastName: doc.lastName,
      email: doc.email,
      password: doc.password,
      plainPassword: doc.plainPassword,
      phone: doc.phone,
      department: doc.department,
      designation: doc.designation,
      expertise: doc.expertise,
      maxWorkload: doc.maxWorkload,
      availability: doc.availability,
      assignedCourses: doc.assignedCourses,
      isActive: doc.isActive,
      createdAt: doc.createdAt
    };
  }

  private convertToCourse(doc: any): Course {
    return {
      id: doc._id,
      courseCode: doc.courseCode,
      courseName: doc.courseName,
      program: doc.program,
      semester: doc.semester,
      credits: doc.credits,
      courseType: doc.courseType,
      theoryHours: doc.theoryHours,
      practicalHours: doc.practicalHours,
      prerequisites: doc.prerequisites,
      description: doc.description,
      isActive: doc.isActive,
      createdAt: doc.createdAt
    };
  }

  private convertToRoom(doc: any): Room {
    return {
      id: doc._id,
      roomNumber: doc.roomNumber,
      roomName: doc.roomName,
      roomType: doc.roomType,
      capacity: doc.capacity,
      equipment: doc.equipment,
      location: doc.location,
      isAvailable: doc.isAvailable,
      maintenanceSchedule: doc.maintenanceSchedule,
      createdAt: doc.createdAt
    };
  }

  // Students
  async getStudents(): Promise<Student[]> {
    const docs = await StudentModel.find({});
    return docs.map(doc => this.convertToStudent(doc));
  }

  async getStudent(id: string): Promise<Student | undefined> {
    const doc = await StudentModel.findById(id);
    return doc ? this.convertToStudent(doc) : undefined;
  }

  async getStudentByStudentId(studentId: string): Promise<Student | undefined> {
    const doc = await StudentModel.findOne({ studentId });
    return doc ? this.convertToStudent(doc) : undefined;
  }

  async getStudentsBySection(sectionId: string): Promise<Student[]> {
    const docs = await StudentModel.find({ sectionId });
    return docs.map(doc => this.convertToStudent(doc));
  }

  async createStudent(insertStudent: InsertStudent): Promise<Student> {
    const id = new mongoose.Types.ObjectId().toString();
    const studentData = {
      _id: id,
      ...insertStudent,
      phone: insertStudent.phone || null,
      batch: insertStudent.batch,
      sectionId: insertStudent.sectionId || null,
      enrolledCourses: insertStudent.enrolledCourses || [],
      preferences: insertStudent.preferences || {},
      isActive: insertStudent.isActive !== undefined ? insertStudent.isActive : true,
      createdAt: new Date()
    };
    
    const doc = await StudentModel.create(studentData);
    return this.convertToStudent(doc);
  }

  async updateStudent(id: string, update: Partial<Student>): Promise<Student | undefined> {
    const doc = await StudentModel.findByIdAndUpdate(id, update, { new: true });
    return doc ? this.convertToStudent(doc) : undefined;
  }

  async deleteStudent(id: string): Promise<boolean> {
    const result = await StudentModel.findByIdAndDelete(id);
    return !!result;
  }

  // Faculty
  async getFaculty(): Promise<Faculty[]> {
    const docs = await FacultyModel.find({});
    return docs.map(doc => this.convertToFaculty(doc));
  }

  async getFacultyMember(id: string): Promise<Faculty | undefined> {
    const doc = await FacultyModel.findById(id);
    return doc ? this.convertToFaculty(doc) : undefined;
  }

  async getFacultyByFacultyId(facultyId: string): Promise<Faculty | undefined> {
    const doc = await FacultyModel.findOne({ facultyId });
    return doc ? this.convertToFaculty(doc) : undefined;
  }

  async createFaculty(insertFaculty: InsertFaculty): Promise<Faculty> {
    const id = new mongoose.Types.ObjectId().toString();
    const facultyData = {
      _id: id,
      ...insertFaculty,
      phone: insertFaculty.phone || null,
      expertise: insertFaculty.expertise || [],
      maxWorkload: insertFaculty.maxWorkload || 20,
      availability: insertFaculty.availability || {},
      assignedCourses: insertFaculty.assignedCourses || [],
      isActive: insertFaculty.isActive !== undefined ? insertFaculty.isActive : true,
      createdAt: new Date()
    };
    
    const doc = await FacultyModel.create(facultyData);
    return this.convertToFaculty(doc);
  }

  async updateFaculty(id: string, update: Partial<Faculty>): Promise<Faculty | undefined> {
    const doc = await FacultyModel.findByIdAndUpdate(id, update, { new: true });
    return doc ? this.convertToFaculty(doc) : undefined;
  }

  async deleteFaculty(id: string): Promise<boolean> {
    const result = await FacultyModel.findByIdAndDelete(id);
    return !!result;
  }

  // Courses
  async getCourses(): Promise<Course[]> {
    const docs = await CourseModel.find({});
    return docs.map(doc => this.convertToCourse(doc));
  }

  async getCourse(id: string): Promise<Course | undefined> {
    const doc = await CourseModel.findById(id);
    return doc ? this.convertToCourse(doc) : undefined;
  }

  async getCourseByCode(courseCode: string): Promise<Course | undefined> {
    const doc = await CourseModel.findOne({ courseCode });
    return doc ? this.convertToCourse(doc) : undefined;
  }

  async getCoursesByProgram(program: string, semester?: number): Promise<Course[]> {
    const query: any = { program };
    if (semester !== undefined) query.semester = semester;
    
    const docs = await CourseModel.find(query);
    return docs.map(doc => this.convertToCourse(doc));
  }

  async createCourse(insertCourse: InsertCourse): Promise<Course> {
    const id = new mongoose.Types.ObjectId().toString();
    const courseData = {
      _id: id,
      ...insertCourse,
      theoryHours: insertCourse.theoryHours || 0,
      practicalHours: insertCourse.practicalHours || 0,
      prerequisites: insertCourse.prerequisites || [],
      description: insertCourse.description || null,
      isActive: insertCourse.isActive !== undefined ? insertCourse.isActive : true,
      createdAt: new Date()
    };
    
    const doc = await CourseModel.create(courseData);
    return this.convertToCourse(doc);
  }

  async updateCourse(id: string, update: Partial<Course>): Promise<Course | undefined> {
    const doc = await CourseModel.findByIdAndUpdate(id, update, { new: true });
    return doc ? this.convertToCourse(doc) : undefined;
  }

  async deleteCourse(id: string): Promise<boolean> {
    const result = await CourseModel.findByIdAndDelete(id);
    return !!result;
  }

  // Rooms
  async getRooms(): Promise<Room[]> {
    const docs = await RoomModel.find({});
    return docs.map(doc => this.convertToRoom(doc));
  }

  async getRoom(id: string): Promise<Room | undefined> {
    const doc = await RoomModel.findById(id);
    return doc ? this.convertToRoom(doc) : undefined;
  }

  async getRoomByNumber(roomNumber: string): Promise<Room | undefined> {
    const doc = await RoomModel.findOne({ roomNumber });
    return doc ? this.convertToRoom(doc) : undefined;
  }

  async createRoom(insertRoom: InsertRoom): Promise<Room> {
    const id = new mongoose.Types.ObjectId().toString();
    const roomData = {
      _id: id,
      ...insertRoom,
      equipment: insertRoom.equipment || [],
      location: insertRoom.location || null,
      isAvailable: insertRoom.isAvailable !== undefined ? insertRoom.isAvailable : true,
      maintenanceSchedule: insertRoom.maintenanceSchedule || [],
      createdAt: new Date()
    };
    
    const doc = await RoomModel.create(roomData);
    return this.convertToRoom(doc);
  }

  async updateRoom(id: string, update: Partial<Room>): Promise<Room | undefined> {
    const doc = await RoomModel.findByIdAndUpdate(id, update, { new: true });
    return doc ? this.convertToRoom(doc) : undefined;
  }

  async deleteRoom(id: string): Promise<boolean> {
    const result = await RoomModel.findByIdAndDelete(id);
    return !!result;
  }

  // Placeholder implementations for other methods (implement as needed)
  async getTimetables(): Promise<Timetable[]> { 
    return Array.from(this.timetables.values());
  }
  async getTimetable(id: string): Promise<Timetable | undefined> { return undefined; }
  async getTimetablesByProgram(program: string, semester?: number): Promise<Timetable[]> { return []; }
  async createTimetable(timetable: InsertTimetable): Promise<Timetable> { 
    const id = `timetable-${Date.now()}`;
    const newTimetable: Timetable = {
      id,
      name: timetable.name,
      program: timetable.program,
      semester: timetable.semester,
      batch: timetable.batch,
      academicYear: timetable.academicYear,
      sectionId: timetable.sectionId || null,
      status: timetable.status || "draft",
      generatedBy: timetable.generatedBy || null,
      schedule: timetable.schedule || {},
      conflicts: timetable.conflicts || [],
      optimizationScore: timetable.optimizationScore || 0,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.timetables.set(id, newTimetable);
    return newTimetable;
  }
  async updateTimetable(id: string, timetable: Partial<Timetable>): Promise<Timetable | undefined> { return undefined; }
  async deleteTimetable(id: string): Promise<boolean> { return false; }

  async getTimetableSlots(timetableId: string): Promise<TimetableSlot[]> { 
    if (!this.timetableSlots) return [];
    return Array.from(this.timetableSlots.values()).filter(slot => slot.timetableId === timetableId);
  }
  async createTimetableSlot(slot: InsertTimetableSlot): Promise<TimetableSlot> { 
    const id = `slot-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newSlot: TimetableSlot = {
      id,
      timetableId: slot.timetableId,
      courseId: slot.courseId,
      facultyId: slot.facultyId,
      roomId: slot.roomId,
      sectionIds: slot.sectionIds || [],
      dayOfWeek: slot.dayOfWeek,
      startTime: slot.startTime,
      endTime: slot.endTime,
      slotType: slot.slotType,
      isLabBlock: slot.isLabBlock || false,
      specialInstructions: slot.specialInstructions || null,
      createdAt: new Date()
    };
    
    if (!this.timetableSlots) {
      this.timetableSlots = new Map();
    }
    this.timetableSlots.set(id, newSlot);
    return newSlot;
  }
  async updateTimetableSlot(id: string, slot: Partial<TimetableSlot>): Promise<TimetableSlot | undefined> { return undefined; }
  async deleteTimetableSlot(id: string): Promise<boolean> { return false; }
  async deleteTimetableSlots(timetableId: string): Promise<boolean> { return false; }

  async getSections(): Promise<Section[]> { return []; }
  async getSection(id: string): Promise<Section | undefined> { return undefined; }
  async getSectionsByProgram(program: string, semester?: number): Promise<Section[]> { return []; }
  async createSection(section: InsertSection): Promise<Section> { throw new Error('Not implemented'); }
  async updateSection(id: string, section: Partial<Section>): Promise<Section | undefined> { return undefined; }
  async deleteSection(id: string): Promise<boolean> { return false; }

  async getElectiveGroups(): Promise<ElectiveGroup[]> { return []; }
  async getElectiveGroup(id: string): Promise<ElectiveGroup | undefined> { return undefined; }
  async getElectiveGroupsByProgram(program: string, semester?: number): Promise<ElectiveGroup[]> { return []; }
  async createElectiveGroup(group: InsertElectiveGroup): Promise<ElectiveGroup> { throw new Error('Not implemented'); }
  async updateElectiveGroup(id: string, group: Partial<ElectiveGroup>): Promise<ElectiveGroup | undefined> { return undefined; }
  async deleteElectiveGroup(id: string): Promise<boolean> { return false; }

  async getAcademicCalendars(): Promise<AcademicCalendar[]> { return []; }
  async getAcademicCalendar(id: string): Promise<AcademicCalendar | undefined> { return undefined; }
  async getAcademicCalendarByYear(academicYear: string, semester?: number): Promise<AcademicCalendar | undefined> { return undefined; }
  async createAcademicCalendar(calendar: InsertAcademicCalendar): Promise<AcademicCalendar> { throw new Error('Not implemented'); }
  async updateAcademicCalendar(id: string, calendar: Partial<AcademicCalendar>): Promise<AcademicCalendar | undefined> { return undefined; }
  async deleteAcademicCalendar(id: string): Promise<boolean> { return false; }

  async getTimeSlotTemplates(): Promise<TimeSlotTemplate[]> { return []; }
  async getTimeSlotTemplate(id: string): Promise<TimeSlotTemplate | undefined> { return undefined; }
  async getDefaultTimeSlotTemplate(): Promise<TimeSlotTemplate | undefined> { return undefined; }
  async createTimeSlotTemplate(template: InsertTimeSlotTemplate): Promise<TimeSlotTemplate> { 
    const id = `template-${Date.now()}`;
    const newTemplate: TimeSlotTemplate = {
      id,
      templateName: template.templateName,
      workingDays: template.workingDays || ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
      startTime: template.startTime,
      endTime: template.endTime,
      periodDuration: template.periodDuration || 60,
      labBlockDuration: template.labBlockDuration || 120,
      dailyPeriods: template.dailyPeriods || [],
      breaks: template.breaks || [],
      isDefault: template.isDefault || false,
      createdAt: new Date()
    };
    this.timeSlotTemplates.set(id, newTemplate);
    return newTemplate;
  }
  async updateTimeSlotTemplate(id: string, template: Partial<TimeSlotTemplate>): Promise<TimeSlotTemplate | undefined> { return undefined; }
  async deleteTimeSlotTemplate(id: string): Promise<boolean> { return false; }

  async getConstraintProfiles(): Promise<ConstraintProfile[]> { return []; }
  async getConstraintProfile(id: string): Promise<ConstraintProfile | undefined> { return undefined; }
  async getDefaultConstraintProfile(): Promise<ConstraintProfile | undefined> { return undefined; }
  async createConstraintProfile(profile: InsertConstraintProfile): Promise<ConstraintProfile> { throw new Error('Not implemented'); }
  async updateConstraintProfile(id: string, profile: Partial<ConstraintProfile>): Promise<ConstraintProfile | undefined> { return undefined; }
  async deleteConstraintProfile(id: string): Promise<boolean> { return false; }

  async getStudentPreferences(): Promise<StudentPreferences[]> { return []; }
  async getStudentPreference(id: string): Promise<StudentPreferences | undefined> { return undefined; }
  async getStudentPreferencesByStudent(studentId: string): Promise<StudentPreferences | undefined> { return undefined; }
  async createStudentPreferences(preferences: InsertStudentPreferences): Promise<StudentPreferences> { throw new Error('Not implemented'); }
  async updateStudentPreferences(id: string, preferences: Partial<StudentPreferences>): Promise<StudentPreferences | undefined> { return undefined; }
  async deleteStudentPreferences(id: string): Promise<boolean> { return false; }

  // Utility methods
  async clearAllData(): Promise<void> {
    try {
      // Clear all collections
      await StudentModel.deleteMany({});
      await FacultyModel.deleteMany({});
      await CourseModel.deleteMany({});
      await RoomModel.deleteMany({});
      await TimetableModel.deleteMany({});
      await TimetableSlotModel.deleteMany({});
      await SectionModel.deleteMany({});
      await ElectiveGroupModel.deleteMany({});
      await AcademicCalendarModel.deleteMany({});
      await TimeSlotTemplateModel.deleteMany({});
      await ConstraintProfileModel.deleteMany({});
      await StudentPreferencesModel.deleteMany({});
      
      console.log('All data cleared from MongoDB');
    } catch (error) {
      console.error('Error clearing data:', error);
      throw error;
    }
  }
}