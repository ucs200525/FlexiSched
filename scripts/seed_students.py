#!/usr/bin/env python3
"""
Student Seeding Script for FlexiSched
Generates 1000 students with default password format: [firstName]@123
"""

import asyncio
import sys
import os
import random
from datetime import datetime
from typing import List, Dict

# Add the parent directory to the Python path to import from ai_engine
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Import MongoDB connection utilities
try:
    import pymongo
    from pymongo import MongoClient
    import bcrypt
except ImportError:
    print("Required packages not installed. Please install: pip install pymongo bcrypt")
    sys.exit(1)

class StudentSeeder:
    def __init__(self, mongodb_uri: str = None):
        """Initialize the seeder with MongoDB connection"""
        self.mongodb_uri = mongodb_uri or os.getenv('MONGODB_URI', 'mongodb://localhost:27017/timetable')
        self.client = None
        self.db = None
        
    def connect(self):
        """Connect to MongoDB"""
        try:
            self.client = MongoClient(self.mongodb_uri)
            # Extract database name from URI or use default
            if 'timetable_system' in self.mongodb_uri:
                self.db = self.client['timetable_system']
            else:
                self.db = self.client['timetable_system']
            
            # Test connection
            self.client.admin.command('ping')
            print(f"✅ Connected to MongoDB: {self.mongodb_uri}")
            return True
        except Exception as e:
            print(f"❌ Failed to connect to MongoDB: {e}")
            return False
    
    def disconnect(self):
        """Disconnect from MongoDB"""
        if self.client:
            self.client.close()
            print("🔌 Disconnected from MongoDB")
    
    def hash_password(self, password: str) -> str:
        """Hash password using bcrypt"""
        salt = bcrypt.gensalt()
        hashed = bcrypt.hashpw(password.encode('utf-8'), salt)
        return hashed.decode('utf-8')
    
    def generate_student_data(self, count: int = 1000) -> List[Dict]:
        """Generate student data with realistic Indian names"""
        
        # Expanded lists of Indian names for more variety
        first_names_male = [
            'Aarav', 'Vivaan', 'Aditya', 'Vihaan', 'Arjun', 'Sai', 'Reyansh', 'Ayaan', 'Krishna', 'Ishaan',
            'Shaurya', 'Atharv', 'Advik', 'Pranav', 'Rishabh', 'Gagan', 'Arnav', 'Hriday', 'Kabir', 'Shivansh',
            'Rudra', 'Yuvraj', 'Dhruv', 'Karan', 'Aryan', 'Rohan', 'Ansh', 'Harsh', 'Dev', 'Kartik',
            'Nikhil', 'Rahul', 'Amit', 'Suresh', 'Rajesh', 'Vikram', 'Manoj', 'Sandeep', 'Deepak', 'Ashok',
            'Ravi', 'Anil', 'Sunil', 'Vinod', 'Prakash', 'Ramesh', 'Mahesh', 'Dinesh', 'Mukesh', 'Naresh'
        ]
        
        first_names_female = [
            'Ananya', 'Diya', 'Priya', 'Kavya', 'Aanya', 'Pari', 'Ira', 'Myra', 'Sara', 'Navya',
            'Aadya', 'Kiara', 'Saanvi', 'Avni', 'Riya', 'Ishika', 'Shanaya', 'Aditi', 'Vanya', 'Tara',
            'Aadhya', 'Arya', 'Siya', 'Nisha', 'Pooja', 'Sneha', 'Ritika', 'Nikita', 'Preeti', 'Swati',
            'Sunita', 'Meera', 'Kavita', 'Rekha', 'Geeta', 'Sushma', 'Vandana', 'Nisha', 'Divya', 'Shruti',
            'Ritu', 'Neha', 'Anjali', 'Sonia', 'Manisha', 'Kiran', 'Seema', 'Reena', 'Veena', 'Leela'
        ]
        
        last_names = [
            'Sharma', 'Verma', 'Gupta', 'Singh', 'Kumar', 'Jain', 'Agarwal', 'Patel', 'Shah', 'Mehta',
            'Joshi', 'Mishra', 'Tiwari', 'Yadav', 'Shukla', 'Pandey', 'Saxena', 'Srivastava', 'Dubey', 'Bansal',
            'Agrawal', 'Malhotra', 'Kapoor', 'Chopra', 'Arora', 'Sethi', 'Khanna', 'Bhatia', 'Tandon', 'Goel',
            'Mittal', 'Singhal', 'Goyal', 'Jindal', 'Bajaj', 'Saini', 'Khurana', 'Sachdeva', 'Bhalla', 'Sood',
            'Reddy', 'Rao', 'Nair', 'Iyer', 'Menon', 'Pillai', 'Das', 'Ghosh', 'Mukherjee', 'Chatterjee'
        ]
        
        programs = [
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
        ]
        
        batches = ['2021', '2022', '2023', '2024', '2025']
        
        students = []
        used_emails = set()
        used_student_ids = set()
        
        print(f"🔄 Generating {count} student records...")
        
        for i in range(count):
            # Randomly select gender and corresponding first name
            is_male = random.choice([True, False])
            first_name = random.choice(first_names_male if is_male else first_names_female)
            last_name = random.choice(last_names)
            
            # Generate unique student ID
            while True:
                student_id = f"STU{random.randint(10000, 99999)}"
                if student_id not in used_student_ids:
                    used_student_ids.add(student_id)
                    break
            
            # Generate unique email
            base_email = f"{first_name.lower()}.{last_name.lower()}"
            email = f"{base_email}@student.university.edu"
            counter = 1
            while email in used_emails:
                email = f"{base_email}{counter}@student.university.edu"
                counter += 1
            used_emails.add(email)
            
            # Generate password in format [firstName]@123
            password = f"{first_name}@123"
            hashed_password = self.hash_password(password)
            
            # Random program and semester
            program = random.choice(programs)
            semester = random.randint(1, 8)
            batch = random.choice(batches)
            
            # Generate phone number
            phone = f"+91{random.randint(7000000000, 9999999999)}"
            
            student = {
                '_id': f"student-{i + 1001}",  # Start from 1001 to avoid conflicts
                'studentId': student_id,
                'firstName': first_name,
                'lastName': last_name,
                'email': email,
                'password': hashed_password,  # Store hashed password
                'plainPassword': password,    # Store plain password for reference (remove in production)
                'phone': phone,
                'program': program,
                'semester': semester,
                'batch': f"Batch-{batch}",
                'sectionId': None,
                'enrolledCourses': [],
                'preferences': {},
                'isActive': True,
                'createdAt': datetime.now()
            }
            
            students.append(student)
            
            # Progress indicator
            if (i + 1) % 100 == 0:
                print(f"   Generated {i + 1}/{count} students...")
        
        print(f"✅ Generated {len(students)} student records")
        return students
    
    def clear_existing_students(self, confirm: bool = False):
        """Clear existing students and authentication records (use with caution)"""
        if not confirm:
            response = input("⚠️  This will delete ALL existing students. Are you sure? (yes/no): ")
            if response.lower() != 'yes':
                print("❌ Operation cancelled")
                return False
        
        try:
            # Clear students collection
            result = self.db.students.delete_many({})
            print(f"🗑️  Deleted {result.deleted_count} existing students")
            
            # Clear authentication records for students
            auth_result = self.db.auth_users.delete_many({"role": "student"})
            print(f"🗑️  Deleted {auth_result.deleted_count} existing student authentication records")
            
            return True
        except Exception as e:
            print(f"❌ Error clearing students: {e}")
            return False
    
    def insert_students(self, students: List[Dict], batch_size: int = 100):
        """Insert students in batches"""
        try:
            total = len(students)
            print(f"📥 Inserting {total} students in batches of {batch_size}...")
            
            for i in range(0, total, batch_size):
                batch = students[i:i + batch_size]
                self.db.students.insert_many(batch)
                print(f"   Inserted batch {i//batch_size + 1}/{(total-1)//batch_size + 1}")
            
            print(f"✅ Successfully inserted {total} students")
            return True
        except Exception as e:
            print(f"❌ Error inserting students: {e}")
            return False
    
    def create_authentication_collection(self, students: List[Dict]):
        """Create a separate authentication collection for login purposes"""
        try:
            auth_records = []
            for student in students:
                auth_record = {
                    '_id': f"auth-{student['studentId']}",
                    'username': student['studentId'],
                    'password': student['password'],
                    'role': 'student',
                    'userId': student['_id'],
                    'email': student['email'],
                    'name': f"{student['firstName']} {student['lastName']}",
                    'isActive': True,
                    'createdAt': datetime.now()
                }
                auth_records.append(auth_record)
            
            # Insert authentication records
            self.db.auth_users.insert_many(auth_records)
            print(f"✅ Created {len(auth_records)} authentication records")
            return True
        except Exception as e:
            print(f"❌ Error creating authentication records: {e}")
            return False
    
    def generate_password_report(self, students: List[Dict], output_file: str = "student_passwords.txt"):
        """Generate a report of all student passwords for reference"""
        try:
            with open(output_file, 'w', encoding='utf-8') as f:
                f.write("FlexiSched - Student Login Credentials\n")
                f.write("=" * 50 + "\n\n")
                f.write("Format: Student ID | Name | Email | Password\n")
                f.write("-" * 80 + "\n")
                
                for student in students:
                    f.write(f"{student['studentId']} | {student['firstName']} {student['lastName']} | {student['email']} | {student['plainPassword']}\n")
                
                f.write(f"\nTotal Students: {len(students)}\n")
                f.write(f"Generated on: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
            
            print(f"📄 Password report saved to: {output_file}")
            return True
        except Exception as e:
            print(f"❌ Error generating password report: {e}")
            return False
    
    def seed_students(self, count: int = 1000, clear_existing: bool = False):
        """Main seeding function"""
        print(f"🌱 Starting student seeding process...")
        print(f"   Target count: {count}")
        print(f"   Clear existing: {clear_existing}")
        
        # Connect to database
        if not self.connect():
            return False
        
        try:
            # Clear existing students if requested
            if clear_existing:
                if not self.clear_existing_students():
                    return False
            
            # Generate student data
            students = self.generate_student_data(count)
            
            # Insert students
            if not self.insert_students(students):
                return False
            
            # Create authentication records
            if not self.create_authentication_collection(students):
                print("⚠️  Warning: Failed to create authentication records")
            
            # Generate password report
            if not self.generate_password_report(students):
                print("⚠️  Warning: Failed to generate password report")
            
            print(f"🎉 Successfully seeded {count} students!")
            print(f"   Password format: [firstName]@123")
            print(f"   Example: Aarav@123, Priya@123, etc.")
            
            return True
            
        except Exception as e:
            print(f"❌ Seeding failed: {e}")
            return False
        finally:
            self.disconnect()

def main():
    """Main function with command line interface"""
    import argparse
    
    parser = argparse.ArgumentParser(description='Seed FlexiSched with student data')
    parser.add_argument('--count', type=int, default=1000, help='Number of students to create (default: 1000)')
    parser.add_argument('--clear', action='store_true', help='Clear existing students before seeding')
    parser.add_argument('--mongodb-uri', type=str, help='MongoDB connection URI')
    
    args = parser.parse_args()
    
    # Create seeder instance
    seeder = StudentSeeder(args.mongodb_uri)
    
    # Run seeding
    success = seeder.seed_students(
        count=args.count,
        clear_existing=args.clear
    )
    
    if success:
        print("\n✅ Seeding completed successfully!")
        print("📋 Check 'student_passwords.txt' for login credentials")
    else:
        print("\n❌ Seeding failed!")
        sys.exit(1)

if __name__ == "__main__":
    main()
