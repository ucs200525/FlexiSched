#!/usr/bin/env node
/**
 * Student Seeding Script for FlexiSched
 * Generates 1000 students with default password format: [firstName]@123
 */

import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

// Student Schema (matching the existing schema)
const StudentSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  studentId: { type: String, required: true, unique: true },
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true }, // Add password field
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

// Authentication Schema for login purposes
const AuthUserSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['admin', 'faculty', 'student'], required: true },
  userId: { type: String, required: true },
  email: { type: String, required: true },
  name: { type: String, required: true },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

const StudentModel = mongoose.model('Student', StudentSchema);
const AuthUserModel = mongoose.model('AuthUser', AuthUserSchema);

interface StudentData {
  _id: string;
  studentId: string;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  plainPassword: string;
  phone: string;
  program: string;
  semester: number;
  batch: string;
  sectionId: string | null;
  enrolledCourses: string[];
  preferences: Record<string, any>;
  isActive: boolean;
  createdAt: Date;
}

class StudentSeeder {
  private mongoServer: MongoMemoryServer | null = null;

  async connect(): Promise<boolean> {
    try {
      // Check if already connected
      if (mongoose.connection.readyState === 1) {
        console.log('✅ Already connected to MongoDB');
        return true;
      }

      let uri = process.env.MONGODB_URI;
      
      // If no URI provided, use in-memory MongoDB
      if (!uri && !this.mongoServer) {
        console.log('🔄 No MONGODB_URI found, starting in-memory MongoDB server...');
        this.mongoServer = await MongoMemoryServer.create({
          instance: {
            dbName: 'timetable_system',
          },
        });
        uri = this.mongoServer.getUri();
        console.log('✅ In-memory MongoDB server started');
      } else if (!uri && this.mongoServer) {
        uri = this.mongoServer.getUri();
      }

      if (!uri) {
        throw new Error('No MongoDB URI available');
      }

      await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 5000,
        connectTimeoutMS: 10000,
      });
      
      console.log('✅ Connected to MongoDB successfully');
      return true;
    } catch (error) {
      console.error('❌ MongoDB connection error:', error);
      return false;
    }
  }

  async disconnect(): Promise<void> {
    try {
      await mongoose.disconnect();
      if (this.mongoServer) {
        await this.mongoServer.stop();
        this.mongoServer = null;
        console.log('🔌 In-memory MongoDB server stopped');
      }
    } catch (error) {
      console.error('⚠️  Error disconnecting from MongoDB:', error);
    }
  }

  private async hashPassword(password: string): Promise<string> {
    // Simple hash for demo purposes - in production use proper bcrypt
    return `hashed_${password}`;
  }

  private generateStudentData(count: number = 1000): StudentData[] {
    // Expanded lists of Indian names for more variety
    const firstNamesMale = [
      'Aarav', 'Vivaan', 'Aditya', 'Vihaan', 'Arjun', 'Sai', 'Reyansh', 'Ayaan', 'Krishna', 'Ishaan',
      'Shaurya', 'Atharv', 'Advik', 'Pranav', 'Rishabh', 'Gagan', 'Arnav', 'Hriday', 'Kabir', 'Shivansh',
      'Rudra', 'Yuvraj', 'Dhruv', 'Karan', 'Aryan', 'Rohan', 'Ansh', 'Harsh', 'Dev', 'Kartik',
      'Nikhil', 'Rahul', 'Amit', 'Suresh', 'Rajesh', 'Vikram', 'Manoj', 'Sandeep', 'Deepak', 'Ashok',
      'Ravi', 'Anil', 'Sunil', 'Vinod', 'Prakash', 'Ramesh', 'Mahesh', 'Dinesh', 'Mukesh', 'Naresh'
    ];
    
    const firstNamesFemale = [
      'Ananya', 'Diya', 'Priya', 'Kavya', 'Aanya', 'Pari', 'Ira', 'Myra', 'Sara', 'Navya',
      'Aadya', 'Kiara', 'Saanvi', 'Avni', 'Riya', 'Ishika', 'Shanaya', 'Aditi', 'Vanya', 'Tara',
      'Aadhya', 'Arya', 'Siya', 'Nisha', 'Pooja', 'Sneha', 'Ritika', 'Nikita', 'Preeti', 'Swati',
      'Sunita', 'Meera', 'Kavita', 'Rekha', 'Geeta', 'Sushma', 'Vandana', 'Nisha', 'Divya', 'Shruti',
      'Ritu', 'Neha', 'Anjali', 'Sonia', 'Manisha', 'Kiran', 'Seema', 'Reena', 'Veena', 'Leela'
    ];
    
    const lastNames = [
      'Sharma', 'Verma', 'Gupta', 'Singh', 'Kumar', 'Jain', 'Agarwal', 'Patel', 'Shah', 'Mehta',
      'Joshi', 'Mishra', 'Tiwari', 'Yadav', 'Shukla', 'Pandey', 'Saxena', 'Srivastava', 'Dubey', 'Bansal',
      'Agrawal', 'Malhotra', 'Kapoor', 'Chopra', 'Arora', 'Sethi', 'Khanna', 'Bhatia', 'Tandon', 'Goel',
      'Mittal', 'Singhal', 'Goyal', 'Jindal', 'Bajaj', 'Saini', 'Khurana', 'Sachdeva', 'Bhalla', 'Sood',
      'Reddy', 'Rao', 'Nair', 'Iyer', 'Menon', 'Pillai', 'Das', 'Ghosh', 'Mukherjee', 'Chatterjee'
    ];
    
    const programs = [
      'Computer Science and Engineering',
      'Information Technology', 
      'Electronics and Communication Engineering',
      'Mechanical Engineering',
      'Civil Engineering',
      'Electrical Engineering',
      'Chemical Engineering',
      'Biotechnology',
      'Aerospace Engineering',
      'Automobile Engineering'
    ];
    
    const batches = ['2021', '2022', '2023', '2024', '2025'];
    
    const students: StudentData[] = [];
    const usedEmails = new Set<string>();
    const usedStudentIds = new Set<string>();
    
    console.log(`🔄 Generating ${count} student records...`);
    
    for (let i = 0; i < count; i++) {
      // Randomly select gender and corresponding first name
      const isMale = Math.random() > 0.5;
      const firstName = isMale 
        ? firstNamesMale[Math.floor(Math.random() * firstNamesMale.length)]
        : firstNamesFemale[Math.floor(Math.random() * firstNamesFemale.length)];
      const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
      
      // Generate unique student ID
      let studentId: string;
      do {
        studentId = `STU${Math.floor(Math.random() * 90000) + 10000}`;
      } while (usedStudentIds.has(studentId));
      usedStudentIds.add(studentId);
      
      // Generate unique email
      let email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}@student.university.edu`;
      let counter = 1;
      while (usedEmails.has(email)) {
        email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${counter}@student.university.edu`;
        counter++;
      }
      usedEmails.add(email);
      
      // Generate password in format [firstName]@123
      const plainPassword = `${firstName}@123`;
      
      // Random program and semester
      const program = programs[Math.floor(Math.random() * programs.length)];
      const semester = Math.floor(Math.random() * 8) + 1;
      const batch = batches[Math.floor(Math.random() * batches.length)];
      
      // Generate phone number
      const phone = `+91${Math.floor(Math.random() * 3000000000) + 7000000000}`;
      
      const student: StudentData = {
        _id: `student-${i + 1001}`, // Start from 1001 to avoid conflicts
        studentId,
        firstName,
        lastName,
        email,
        password: '', // Will be hashed later
        plainPassword,
        phone,
        program,
        semester,
        batch: `Batch-${batch}`,
        sectionId: null,
        enrolledCourses: [],
        preferences: {},
        isActive: true,
        createdAt: new Date()
      };
      
      students.push(student);
      
      // Progress indicator
      if ((i + 1) % 100 === 0) {
        console.log(`   Generated ${i + 1}/${count} students...`);
      }
    }
    
    console.log(`✅ Generated ${students.length} student records`);
    return students;
  }

  private async clearExistingStudents(confirm: boolean = false): Promise<boolean> {
    if (!confirm) {
      // In a real CLI, you'd use readline, but for simplicity we'll skip confirmation
      console.log('⚠️  Clearing existing students...');
    }
    
    try {
      const studentResult = await StudentModel.deleteMany({});
      const authResult = await AuthUserModel.deleteMany({ role: 'student' });
      console.log(`🗑️  Deleted ${studentResult.deletedCount} existing students and ${authResult.deletedCount} auth records`);
      return true;
    } catch (error) {
      console.error('❌ Error clearing students:', error);
      return false;
    }
  }

  private async insertStudents(students: StudentData[], batchSize: number = 100): Promise<boolean> {
    try {
      const total = students.length;
      console.log(`📥 Hashing passwords and inserting ${total} students in batches of ${batchSize}...`);
      
      // Hash all passwords first
      for (let i = 0; i < students.length; i++) {
        students[i].password = await this.hashPassword(students[i].plainPassword);
        if ((i + 1) % 100 === 0) {
          console.log(`   Hashed passwords for ${i + 1}/${total} students...`);
        }
      }
      
      // Insert in batches
      for (let i = 0; i < total; i += batchSize) {
        const batch = students.slice(i, i + batchSize);
        const studentsToInsert = batch.map(s => ({
          _id: s._id,
          studentId: s.studentId,
          firstName: s.firstName,
          lastName: s.lastName,
          email: s.email,
          password: s.password,
          phone: s.phone,
          program: s.program,
          semester: s.semester,
          batch: s.batch,
          sectionId: s.sectionId,
          enrolledCourses: s.enrolledCourses,
          preferences: s.preferences,
          isActive: s.isActive,
          createdAt: s.createdAt
        }));
        
        await StudentModel.insertMany(studentsToInsert);
        console.log(`   Inserted batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(total/batchSize)}`);
      }
      
      console.log(`✅ Successfully inserted ${total} students`);
      return true;
    } catch (error) {
      console.error('❌ Error inserting students:', error);
      return false;
    }
  }

  private async createAuthenticationRecords(students: StudentData[]): Promise<boolean> {
    try {
      const authRecords = students.map(student => ({
        _id: `auth-${student.studentId}`,
        username: student.studentId,
        password: student.password,
        role: 'student' as const,
        userId: student._id,
        email: student.email,
        name: `${student.firstName} ${student.lastName}`,
        isActive: true,
        createdAt: new Date()
      }));
      
      await AuthUserModel.insertMany(authRecords);
      console.log(`✅ Created ${authRecords.length} authentication records`);
      return true;
    } catch (error) {
      console.error('❌ Error creating authentication records:', error);
      return false;
    }
  }

  private async generatePasswordReport(students: StudentData[], outputFile: string = 'student_passwords.txt'): Promise<boolean> {
    try {
      const fs = await import('fs');
      let content = 'FlexiSched - Student Login Credentials\n';
      content += '='.repeat(50) + '\n\n';
      content += 'Format: Student ID | Name | Email | Password\n';
      content += '-'.repeat(80) + '\n';
      
      for (const student of students) {
        content += `${student.studentId} | ${student.firstName} ${student.lastName} | ${student.email} | ${student.plainPassword}\n`;
      }
      
      content += `\nTotal Students: ${students.length}\n`;
      content += `Generated on: ${new Date().toISOString()}\n`;
      
      fs.writeFileSync(outputFile, content, 'utf-8');
      console.log(`📄 Password report saved to: ${outputFile}`);
      return true;
    } catch (error) {
      console.error('❌ Error generating password report:', error);
      return false;
    }
  }

  async seedStudents(count: number = 1000, clearExisting: boolean = false): Promise<boolean> {
    console.log('🌱 Starting student seeding process...');
    console.log(`   Target count: ${count}`);
    console.log(`   Clear existing: ${clearExisting}`);
    
    // Connect to database
    if (!await this.connect()) {
      return false;
    }
    
    try {
      // Clear existing students if requested
      if (clearExisting) {
        if (!await this.clearExistingStudents(true)) {
          return false;
        }
      }
      
      // Generate student data
      const students = this.generateStudentData(count);
      
      // Insert students
      if (!await this.insertStudents(students)) {
        return false;
      }
      
      // Create authentication records
      if (!await this.createAuthenticationRecords(students)) {
        console.log('⚠️  Warning: Failed to create authentication records');
      }
      
      // Generate password report
      if (!await this.generatePasswordReport(students)) {
        console.log('⚠️  Warning: Failed to generate password report');
      }
      
      console.log(`🎉 Successfully seeded ${count} students!`);
      console.log(`   Password format: [firstName]@123`);
      console.log(`   Example: Aarav@123, Priya@123, etc.`);
      
      return true;
      
    } catch (error) {
      console.error('❌ Seeding failed:', error);
      return false;
    } finally {
      await this.disconnect();
    }
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const count = args.includes('--count') ? parseInt(args[args.indexOf('--count') + 1]) || 1000 : 1000;
  const clearExisting = args.includes('--clear');
  
  console.log('🚀 FlexiSched Student Seeder');
  console.log('============================');
  
  const seeder = new StudentSeeder();
  const success = await seeder.seedStudents(count, clearExisting);
  
  if (success) {
    console.log('\n✅ Seeding completed successfully!');
    console.log('📋 Check \'student_passwords.txt\' for login credentials');
    process.exit(0);
  } else {
    console.log('\n❌ Seeding failed!');
    process.exit(1);
  }
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { StudentSeeder };
