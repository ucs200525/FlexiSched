# backend/server.py
from fastapi import FastAPI, HTTPException, Depends, status, Request, Response, BackgroundTasks, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from fastapi.exception_handlers import request_validation_exception_handler
from dotenv import load_dotenv
import os
from pathlib import Path
import logging
from datetime import datetime, timezone, timedelta
import jwt
from typing import Optional, List, Dict, Any
import bcrypt
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
from bson.errors import InvalidId
import asyncio
import requests
import json
from pydantic import BaseModel, Field, field_validator, model_validator, EmailStr, ConfigDict
from pydantic.types import constr
from fastapi.openapi.docs import get_swagger_ui_html
from fastapi.openapi.utils import get_openapi
from fastapi import status
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from contextlib import asynccontextmanager
import socket

# Configuration
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Environment-specific configuration
IS_DEVELOPMENT = os.getenv('ENVIRONMENT', 'development').lower() == 'development'

# Logging configuration
logging.basicConfig(
    level=logging.DEBUG if IS_DEVELOPMENT else logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("flexisched.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# MongoDB connection with connection pooling
mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
client = AsyncIOMotorClient(
    mongo_url,
    maxPoolSize=10,
    minPoolSize=5,
    maxIdleTimeMS=30000,
    serverSelectionTimeoutMS=5000
)
db = client[os.environ.get('DB_NAME', 'flexisched_db')]

# Security
security = HTTPBearer()

# JWT Configuration
JWT_SECRET = os.environ.get('JWT_SECRET', 'flexisched-jwt-secret-key-2025-change-in-production')
JWT_ALGORITHM = 'HS256'
JWT_EXPIRATION_HOURS = 24

# OpenRouter API Configuration
OPENROUTER_API_KEY = os.environ.get('OPENROUTER_API_KEY')
OPENROUTER_MODEL = os.environ.get('OPENROUTER_MODEL', 'nvidia/nemotron-nano-12b-v2-vl:free')

# Pydantic models with better validation
class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=6)
    name: str = Field(..., min_length=2)
    role: str = Field(..., pattern=r'^(admin|faculty|student)$')

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class UpdatePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=6)

class CourseRequest(BaseModel):
    name: str = Field(..., min_length=2)
    code: str = Field(..., min_length=2, max_length=10)
    credits: int = Field(..., ge=1, le=10)
    category: str = Field(..., pattern=r'^(Major|Minor|SEC|AEC|VAC)$')
    duration_hours: int = Field(..., ge=1, le=5)
    is_lab: bool = False

class CourseUpdateRequest(BaseModel):
    name: Optional[str] = Field(None, min_length=2)
    code: Optional[str] = Field(None, min_length=2, max_length=10)
    credits: Optional[int] = Field(None, ge=1, le=10)
    category: Optional[str] = Field(None, pattern=r'^(Major|Minor|SEC|AEC|VAC)$')
    faculty_id: Optional[str] = Field(None, min_length=1)
    duration_hours: Optional[int] = Field(None, ge=1, le=5)
    is_lab: Optional[bool] = None
    
    @field_validator('faculty_id')
    @classmethod
    def validate_faculty_id(cls, v):
        if v is not None:
            try:
                ObjectId(v)
                return v
            except:
                raise ValueError('Invalid faculty ID format')
        return v

class RoomRequest(BaseModel):
    name: str = Field(..., min_length=2)
    capacity: int = Field(..., ge=1, le=500)
    type: str = Field(..., pattern=r'^(classroom|lab|auditorium)$')

class RoomUpdateRequest(BaseModel):
    name: Optional[str] = Field(None, min_length=2)
    capacity: Optional[int] = Field(None, ge=1, le=500)
    type: Optional[str] = Field(None, pattern=r'^(classroom|lab|auditorium)$')

class UserUpdateRequest(BaseModel):
    name: Optional[str] = Field(None, min_length=2)
    email: Optional[EmailStr] = None
    role: Optional[str] = Field(None, pattern=r'^(admin|faculty|student)$')

# --- NEW: Pydantic model for credit limits ---
class CreditLimitsRequest(BaseModel):
    minCredits: int = Field(..., ge=1, le=30)
    maxCredits: int = Field(..., ge=1, le=30)
    
    @model_validator(mode='after')
    def validate_credits(self):
        # 'self' now contains the validated model with all field values
        if self.maxCredits <= self.minCredits:
            raise ValueError('Maximum credits must be greater than minimum credits')
        return self

# --- NEW: Pydantic model for base timetable request ---
class BaseTimetableRequest(BaseModel):
    startTime: str = '09:00'
    endTime: str = '17:00'
    classDuration: float = 1.0
    lunchBreakDuration: float = 1.0
    lunchBreakPosition: str = 'middle'  # 'middle', 'afternoon', 'morning'
    days: List[str] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
    includeShortBreaks: bool = True # New field with a default value

# --- NEW: Pydantic models for profile requests ---
class AvailableSlot(BaseModel):
    day: str
    startTime: str
    endTime: str

class FacultyProfileRequest(BaseModel):
    name: Optional[str] = Field(None, min_length=2)
    email: Optional[EmailStr] = None
    subjects: Optional[List[str]] = None
    availableSlots: Optional[List[AvailableSlot]] = None
    minTeachingHours: Optional[int] = Field(None, ge=1)

class StudentProfileRequest(BaseModel):
    name: Optional[str] = Field(None, min_length=2)
    email: Optional[EmailStr] = None
    enrollmentYear: Optional[str] = None

class AdminProfileRequest(BaseModel):
    name: Optional[str] = Field(None, min_length=2)
    email: Optional[EmailStr] = None
    department: Optional[str] = None

# Create indexes for better performance
async def create_indexes():
    try:
        # User indexes
        await db.users.create_index("email", unique=True)
        await db.users.create_index("role")
        
        # Course indexes
        await db.courses.create_index("code", unique=True)
        await db.courses.create_index("faculty_id")
        
        # Room indexes
        await db.rooms.create_index("name", unique=True)
        
        # Base timetable indexes
        await db.base_timetables.create_index("created_at")
        
        # AI timetable indexes
        await db.timetables.create_index("generated_at")
        await db.timetables.create_index("generated_by")
        
        # Settings indexes
        await db.settings.create_index("key", unique=True)
        
        # Faculty preferences indexes
        await db.faculty_preferences.create_index([("faculty_id", 1)])
        
        # Student course preferences indexes
        await db.student_course_preferences.create_index([("student_id", 1)])
        
        logger.info("Database indexes created successfully")
    except Exception as e:
        logger.error(f"Error creating indexes: {str(e)}")

# Initialize extensive demo data
async def initialize_demo_data():
    try:
        # Check if admin user exists
        admin_exists = await db.users.find_one({'email': 'admin@flexisched.com'})
        
        # Only create demo data if admin doesn't exist
        if not admin_exists:
            logger.info("Admin user not found. Creating extensive demo data.")
            # Clear existing data
            await db.users.delete_many({})
            await db.courses.delete_many({})
            await db.rooms.delete_many({})
            await db.base_timetables.delete_many({})
            await db.timetables.delete_many({})
            await db.settings.delete_many({})
            await db.faculty_preferences.delete_many({})
            await db.student_course_preferences.delete_many({})
            
            # Create admin user
            admin = {
                'email': 'admin@flexisched.com',
                'password_hash': hash_password('admin123'),
                'name': 'Admin User',
                'role': 'admin',
                'created_at': datetime.now(timezone.utc).isoformat()
            }
            await db.users.insert_one(admin)
            
            # Create 10 faculty members
            faculty_data = [
                {'email': 'dr.smith@univ.edu', 'name': 'Dr. John Smith', 'password_hash': hash_password('faculty123'), 'role': 'faculty', 'department': 'Computer Science'},
                {'email': 'dr.patel@univ.edu', 'name': 'Dr. Priya Patel', 'password_hash': hash_password('faculty123'), 'role': 'faculty', 'department': 'Computer Science'},
                {'email': 'dr.kumar@univ.edu', 'name': 'Dr. Raj Kumar', 'password_hash': hash_password('faculty123'), 'role': 'faculty', 'department': 'Mathematics'},
                {'email': 'dr.wong@univ.edu', 'name': 'Dr. Lisa Wong', 'password_hash': hash_password('faculty123'), 'role': 'faculty', 'department': 'Physics'},
                {'email': 'dr.johnson@univ.edu', 'name': 'Dr. Michael Johnson', 'password_hash': hash_password('faculty123'), 'role': 'faculty', 'department': 'Chemistry'},
                {'email': 'dr.williams@univ.edu', 'name': 'Dr. Sarah Williams', 'password_hash': hash_password('faculty123'), 'role': 'faculty', 'department': 'Biology'},
                {'email': 'dr.brown@univ.edu', 'name': 'Dr. James Brown', 'password_hash': hash_password('faculty123'), 'role': 'faculty', 'department': 'English'},
                {'email': 'dr.davis@univ.edu', 'name': 'Dr. Emily Davis', 'password_hash': hash_password('faculty123'), 'role': 'faculty', 'department': 'Economics'},
                {'email': 'dr.miller@univ.edu', 'name': 'Dr. Robert Miller', 'password_hash': hash_password('faculty123'), 'role': 'faculty', 'department': 'History'},
                {'email': 'dr.wilson@univ.edu', 'name': 'Dr. Jennifer Wilson', 'password_hash': hash_password('faculty123'), 'role': 'faculty', 'department': 'Psychology'},
            ]
            
            faculty_ids = []
            for fac in faculty_data:
                fac['created_at'] = datetime.now(timezone.utc).isoformat()
                result = await db.users.insert_one(fac)
                faculty_ids.append(str(result.inserted_id))
            
            # Create 30 students
            student_data = [
                {'email': 'alice.johnson@univ.edu', 'name': 'Alice Johnson', 'password_hash': hash_password('student123'), 'role': 'student', 'enrollment_year': '2023'},
                {'email': 'bob.williams@univ.edu', 'name': 'Bob Williams', 'password_hash': hash_password('student123'), 'role': 'student', 'enrollment_year': '2023'},
                {'email': 'carol.davis@univ.edu', 'name': 'Carol Davis', 'password_hash': hash_password('student123'), 'role': 'student', 'enrollment_year': '2023'},
                {'email': 'david.miller@univ.edu', 'name': 'David Miller', 'password_hash': hash_password('student123'), 'role': 'student', 'enrollment_year': '2022'},
                {'email': 'emma.wilson@univ.edu', 'name': 'Emma Wilson', 'password_hash': hash_password('student123'), 'role': 'student', 'enrollment_year': '2022'},
                {'email': 'frank.moore@univ.edu', 'name': 'Frank Moore', 'password_hash': hash_password('student123'), 'role': 'student', 'enrollment_year': '2024'},
                {'email': 'grace.taylor@univ.edu', 'name': 'Grace Taylor', 'password_hash': hash_password('student123'), 'role': 'student', 'enrollment_year': '2024'},
                {'email': 'henry.anderson@univ.edu', 'name': 'Henry Anderson', 'password_hash': hash_password('student123'), 'role': 'student', 'enrollment_year': '2021'},
                {'email': 'isabella.thomas@univ.edu', 'name': 'Isabella Thomas', 'password_hash': hash_password('student123'), 'role': 'student', 'enrollment_year': '2021'},
                {'email': 'jack.jackson@univ.edu', 'name': 'Jack Jackson', 'password_hash': hash_password('student123'), 'role': 'student', 'enrollment_year': '2023'},
                {'email': 'kate.white@univ.edu', 'name': 'Kate White', 'password_hash': hash_password('student123'), 'role': 'student', 'enrollment_year': '2024'},
                {'email': 'liam.harris@univ.edu', 'name': 'Liam Harris', 'password_hash': hash_password('student123'), 'role': 'student', 'enrollment_year': '2022'},
                {'email': 'mia.martin@univ.edu', 'name': 'Mia Martin', 'password_hash': hash_password('student123'), 'role': 'student', 'enrollment_year': '2022'},
                {'email': 'noah.thompson@univ.edu', 'name': 'Noah Thompson', 'password_hash': hash_password('student123'), 'role': 'student', 'enrollment_year': '2023'},
                {'email': 'olivia.garcia@univ.edu', 'name': 'Olivia Garcia', 'password_hash': hash_password('student123'), 'role': 'student', 'enrollment_year': '2024'},
                {'email': 'peter.martinez@univ.edu', 'name': 'Peter Martinez', 'password_hash': hash_password('student123'), 'role': 'student', 'enrollment_year': '2021'},
                {'email': 'quinn.robinson@univ.edu', 'name': 'Quinn Robinson', 'password_hash': hash_password('student123'), 'role': 'student', 'enrollment_year': '2021'},
                {'email': 'rachel.clark@univ.edu', 'name': 'Rachel Clark', 'password_hash': hash_password('student123'), 'role': 'student', 'enrollment_year': '2024'},
                {'email': 'samuel.rodriguez@univ.edu', 'name': 'Samuel Rodriguez', 'password_hash': hash_password('student123'), 'role': 'student', 'enrollment_year': '2023'},
                {'email': 'taylor.lewis@univ.edu', 'name': 'Taylor Lewis', 'password_hash': hash_password('student123'), 'role': 'student', 'enrollment_year': '2022'},
                {'email': 'ursula.lee@univ.edu', 'name': 'Ursula Lee', 'password_hash': hash_password('student123'), 'role': 'student', 'enrollment_year': '2024'},
                {'email': 'victor.walker@univ.edu', 'name': 'Victor Walker', 'password_hash': hash_password('student123'), 'role': 'student', 'enrollment_year': '2021'},
                {'email': 'wendy.hall@univ.edu', 'name': 'Wendy Hall', 'password_hash': hash_password('student123'), 'role': 'student', 'enrollment_year': '2023'},
                {'email': 'xavier.allen@univ.edu', 'name': 'Xavier Allen', 'password_hash': hash_password('student123'), 'role': 'student', 'enrollment_year': '2022'},
                {'email': 'yasmine.young@univ.edu', 'name': 'Yasmine Young', 'password_hash': hash_password('student123'), 'role': 'student', 'enrollment_year': '2024'},
                {'email': 'zachary.king@univ.edu', 'name': 'Zachary King', 'password_hash': hash_password('student123'), 'role': 'student', 'enrollment_year': '2021'},
                {'email': 'amy.scott@univ.edu', 'name': 'Amy Scott', 'password_hash': hash_password('student123'), 'role': 'student', 'enrollment_year': '2023'},
                {'email': 'brian.green@univ.edu', 'name': 'Brian Green', 'password_hash': hash_password('student123'), 'role': 'student', 'enrollment_year': '2024'},
                {'email': 'chloe.adams@univ.edu', 'name': 'Chloe Adams', 'password_hash': hash_password('student123'), 'role': 'student', 'enrollment_year': '2022'},
                {'email': 'daniel.baker@univ.edu', 'name': 'Daniel Baker', 'password_hash': hash_password('student123'), 'role': 'student', 'enrollment_year': '2023'},
                {'email': 'eva.nelson@univ.edu', 'name': 'Eva Nelson', 'password_hash': hash_password('student123'), 'role': 'student', 'enrollment_year': '2024'},
                {'email': 'felix.carter@univ.edu', 'name': 'Felix Carter', 'password_hash': hash_password('student123'), 'role': 'student', 'enrollment_year': '2021'},
                {'email': 'georgia.mitchell@univ.edu', 'name': 'Georgia Mitchell', 'password_hash': hash_password('student123'), 'role': 'student', 'enrollment_year': '2022'},
            ]
            
            student_ids = []
            for stu in student_data:
                stu['created_at'] = datetime.now(timezone.utc).isoformat()
                result = await db.users.insert_one(stu)
                student_ids.append(str(result.inserted_id))
            
            # Create rooms
            rooms = [
                {'name': 'Room 101', 'capacity': 60, 'type': 'classroom'},
                {'name': 'Room 102', 'capacity': 60, 'type': 'classroom'},
                {'name': 'Room 103', 'capacity': 50, 'type': 'classroom'},
                {'name': 'Room 104', 'capacity': 50, 'type': 'classroom'},
                {'name': 'Room 105', 'capacity': 40, 'type': 'classroom'},
                {'name': 'Room 201', 'capacity': 70, 'type': 'classroom'},
                {'name': 'Room 202', 'capacity': 70, 'type': 'classroom'},
                {'name': 'Room 203', 'capacity': 80, 'type': 'classroom'},
                {'name': 'Lab A', 'capacity': 40, 'type': 'lab'},
                {'name': 'Lab B', 'capacity': 40, 'type': 'lab'},
                {'name': 'Lab C', 'capacity': 30, 'type': 'lab'},
                {'name': 'Lab D', 'capacity': 30, 'type': 'lab'},
                {'name': 'Auditorium A', 'capacity': 200, 'type': 'auditorium'},
                {'name': 'Auditorium B', 'capacity': 150, 'type': 'auditorium'},
                {'name': 'Seminar Room 1', 'capacity': 25, 'type': 'classroom'},
                {'name': 'Seminar Room 2', 'capacity': 25, 'type': 'classroom'},
                {'name': 'Conference Room 1', 'capacity': 20, 'type': 'classroom'},
                {'name': 'Conference Room 2', 'capacity': 20, 'type': 'classroom'},
            ]
            
            room_ids = []
            for room in rooms:
                room['created_at'] = datetime.now(timezone.utc).isoformat()
                result = await db.rooms.insert_one(room)
                room_ids.append(str(result.inserted_id))
            
            # Create 35 courses with faculty assignments
            courses = [
                # Computer Science Courses (Dr. Smith)
                {'name': 'Data Structures', 'code': 'CS201', 'credits': 4, 'category': 'Major', 'duration_hours': 1, 'is_lab': False, 'faculty_id': faculty_ids[0]},
                {'name': 'Data Structures Lab', 'code': 'CS201L', 'credits': 2, 'category': 'Major', 'duration_hours': 2, 'is_lab': True, 'faculty_id': faculty_ids[0]},
                {'name': 'Algorithms', 'code': 'CS301', 'credits': 4, 'category': 'Major', 'duration_hours': 1, 'is_lab': False, 'faculty_id': faculty_ids[0]},
                {'name': 'Database Management Systems', 'code': 'CS302', 'credits': 4, 'category': 'Major', 'duration_hours': 1, 'is_lab': False, 'faculty_id': faculty_ids[0]},
                {'name': 'Web Development', 'code': 'CS303', 'credits': 3, 'category': 'Minor', 'duration_hours': 1, 'is_lab': False, 'faculty_id': faculty_ids[0]},
                
                # Computer Science Courses (Dr. Patel)
                {'name': 'Machine Learning', 'code': 'CS401', 'credits': 4, 'category': 'Major', 'duration_hours': 1, 'is_lab': False, 'faculty_id': faculty_ids[1]},
                {'name': 'Artificial Intelligence', 'code': 'CS402', 'credits': 4, 'category': 'Major', 'duration_hours': 1, 'is_lab': False, 'faculty_id': faculty_ids[1]},
                {'name': 'Computer Networks', 'code': 'CS351', 'credits': 3, 'category': 'Major', 'duration_hours': 1, 'is_lab': False, 'faculty_id': faculty_ids[1]},
                {'name': 'Operating Systems', 'code': 'CS352', 'credits': 4, 'category': 'Major', 'duration_hours': 1, 'is_lab': False, 'faculty_id': faculty_ids[1]},
                {'name': 'Software Engineering', 'code': 'CS403', 'credits': 3, 'category': 'Major', 'duration_hours': 1, 'is_lab': False, 'faculty_id': faculty_ids[1]},
                
                # Mathematics Courses (Dr. Kumar)
                {'name': 'Calculus I', 'code': 'MATH101', 'credits': 4, 'category': 'Major', 'duration_hours': 1, 'is_lab': False, 'faculty_id': faculty_ids[2]},
                {'name': 'Calculus II', 'code': 'MATH102', 'credits': 4, 'category': 'Major', 'duration_hours': 1, 'is_lab': False, 'faculty_id': faculty_ids[2]},
                {'name': 'Linear Algebra', 'code': 'MATH201', 'credits': 3, 'category': 'Major', 'duration_hours': 1, 'is_lab': False, 'faculty_id': faculty_ids[2]},
                {'name': 'Differential Equations', 'code': 'MATH301', 'credits': 3, 'category': 'Major', 'duration_hours': 1, 'is_lab': False, 'faculty_id': faculty_ids[2]},
                {'name': 'Statistics', 'code': 'MATH202', 'credits': 3, 'category': 'Minor', 'duration_hours': 1, 'is_lab': False, 'faculty_id': faculty_ids[2]},
                
                # Physics Courses (Dr. Wong)
                {'name': 'Physics I', 'code': 'PHY101', 'credits': 4, 'category': 'Major', 'duration_hours': 1, 'is_lab': False, 'faculty_id': faculty_ids[3]},
                {'name': 'Physics I Lab', 'code': 'PHY101L', 'credits': 2, 'category': 'Major', 'duration_hours': 2, 'is_lab': True, 'faculty_id': faculty_ids[3]},
                {'name': 'Physics II', 'code': 'PHY102', 'credits': 4, 'category': 'Major', 'duration_hours': 1, 'is_lab': False, 'faculty_id': faculty_ids[3]},
                {'name': 'Quantum Mechanics', 'code': 'PHY401', 'credits': 4, 'category': 'Major', 'duration_hours': 1, 'is_lab': False, 'faculty_id': faculty_ids[3]},
                {'name': 'Thermodynamics', 'code': 'PHY301', 'credits': 3, 'category': 'Major', 'duration_hours': 1, 'is_lab': False, 'faculty_id': faculty_ids[3]},
                
                # Chemistry Courses (Dr. Johnson)
                {'name': 'General Chemistry', 'code': 'CHEM101', 'credits': 4, 'category': 'Major', 'duration_hours': 1, 'is_lab': False, 'faculty_id': faculty_ids[4]},
                {'name': 'Chemistry Lab I', 'code': 'CHEM101L', 'credits': 2, 'category': 'Major', 'duration_hours': 2, 'is_lab': True, 'faculty_id': faculty_ids[4]},
                {'name': 'Organic Chemistry', 'code': 'CHEM201', 'credits': 4, 'category': 'Major', 'duration_hours': 1, 'is_lab': False, 'faculty_id': faculty_ids[4]},
                {'name': 'Organic Chemistry Lab', 'code': 'CHEM201L', 'credits': 2, 'category': 'Major', 'duration_hours': 2, 'is_lab': True, 'faculty_id': faculty_ids[4]},
                {'name': 'Biochemistry', 'code': 'CHEM301', 'credits': 3, 'category': 'Major', 'duration_hours': 1, 'is_lab': False, 'faculty_id': faculty_ids[4]},
                
                # Biology Courses (Dr. Williams)
                {'name': 'Biology I', 'code': 'BIO101', 'credits': 4, 'category': 'Major', 'duration_hours': 1, 'is_lab': False, 'faculty_id': faculty_ids[5]},
                {'name': 'Biology Lab I', 'code': 'BIO101L', 'credits': 2, 'category': 'Major', 'duration_hours': 2, 'is_lab': True, 'faculty_id': faculty_ids[5]},
                {'name': 'Genetics', 'code': 'BIO201', 'credits': 3, 'category': 'Major', 'duration_hours': 1, 'is_lab': False, 'faculty_id': faculty_ids[5]},
                {'name': 'Molecular Biology', 'code': 'BIO301', 'credits': 4, 'category': 'Major', 'duration_hours': 1, 'is_lab': False, 'faculty_id': faculty_ids[5]},
                {'name': 'Ecology', 'code': 'BIO202', 'credits': 3, 'category': 'Minor', 'duration_hours': 1, 'is_lab': False, 'faculty_id': faculty_ids[5]},
                
                # English Courses (Dr. Brown)
                {'name': 'English Literature', 'code': 'ENG101', 'credits': 3, 'category': 'AEC', 'duration_hours': 1, 'is_lab': False, 'faculty_id': faculty_ids[6]},
                {'name': 'Creative Writing', 'code': 'ENG201', 'credits': 3, 'category': 'AEC', 'duration_hours': 1, 'is_lab': False, 'faculty_id': faculty_ids[6]},
                {'name': 'Technical Writing', 'code': 'ENG301', 'credits': 2, 'category': 'AEC', 'duration_hours': 1, 'is_lab': False, 'faculty_id': faculty_ids[6]},
                {'name': 'Shakespeare Studies', 'code': 'ENG401', 'credits': 3, 'category': 'Minor', 'duration_hours': 1, 'is_lab': False, 'faculty_id': faculty_ids[6]},
                
                # Economics Courses (Dr. Davis)
                {'name': 'Microeconomics', 'code': 'ECON101', 'credits': 3, 'category': 'Major', 'duration_hours': 1, 'is_lab': False, 'faculty_id': faculty_ids[7]},
                {'name': 'Macroeconomics', 'code': 'ECON102', 'credits': 3, 'category': 'Major', 'duration_hours': 1, 'is_lab': False, 'faculty_id': faculty_ids[7]},
                {'name': 'International Economics', 'code': 'ECON201', 'credits': 3, 'category': 'Minor', 'duration_hours': 1, 'is_lab': False, 'faculty_id': faculty_ids[7]},
                {'name': 'Financial Economics', 'code': 'ECON301', 'credits': 4, 'category': 'Major', 'duration_hours': 1, 'is_lab': False, 'faculty_id': faculty_ids[7]},
                
                # History Courses (Dr. Miller)
                {'name': 'World History', 'code': 'HIST101', 'credits': 3, 'category': 'VAC', 'duration_hours': 1, 'is_lab': False, 'faculty_id': faculty_ids[8]},
                {'name': 'American History', 'code': 'HIST102', 'credits': 3, 'category': 'VAC', 'duration_hours': 1, 'is_lab': False, 'faculty_id': faculty_ids[8]},
                {'name': 'Modern History', 'code': 'HIST201', 'credits': 3, 'category': 'VAC', 'duration_hours': 1, 'is_lab': False, 'faculty_id': faculty_ids[8]},
                {'name': 'Ancient Civilizations', 'code': 'HIST301', 'credits': 3, 'category': 'Minor', 'duration_hours': 1, 'is_lab': False, 'faculty_id': faculty_ids[8]},
                
                # Psychology Courses (Dr. Wilson)
                {'name': 'Introduction to Psychology', 'code': 'PSY101', 'credits': 3, 'category': 'SEC', 'duration_hours': 1, 'is_lab': False, 'faculty_id': faculty_ids[9]},
                {'name': 'Cognitive Psychology', 'code': 'PSY201', 'credits': 3, 'category': 'SEC', 'duration_hours': 1, 'is_lab': False, 'faculty_id': faculty_ids[9]},
                {'name': 'Social Psychology', 'code': 'PSY202', 'credits': 3, 'category': 'SEC', 'duration_hours': 1, 'is_lab': False, 'faculty_id': faculty_ids[9]},
                {'name': 'Abnormal Psychology', 'code': 'PSY301', 'credits': 4, 'category': 'Major', 'duration_hours': 1, 'is_lab': False, 'faculty_id': faculty_ids[9]},
                
                # Additional interdisciplinary courses
                {'name': 'Environmental Science', 'code': 'ENV101', 'credits': 3, 'category': 'VAC', 'duration_hours': 1, 'is_lab': False, 'faculty_id': faculty_ids[5]}, # Dr. Williams
                {'name': 'Communication Skills', 'code': 'COMM101', 'credits': 2, 'category': 'AEC', 'duration_hours': 1, 'is_lab': False, 'faculty_id': faculty_ids[6]}, # Dr. Brown
                {'name': 'Business Ethics', 'code': 'BUS301', 'credits': 3, 'category': 'SEC', 'duration_hours': 1, 'is_lab': False, 'faculty_id': faculty_ids[7]}, # Dr. Davis
                {'name': 'Digital Marketing', 'code': 'BUS201', 'credits': 3, 'category': 'Minor', 'duration_hours': 1, 'is_lab': False, 'faculty_id': faculty_ids[1]}, # Dr. Patel
                {'name': 'Data Science', 'code': 'DS401', 'credits': 4, 'category': 'Major', 'duration_hours': 1, 'is_lab': False, 'faculty_id': faculty_ids[0]}, # Dr. Smith
            ]
            
            course_ids = []
            for course in courses:
                course['created_at'] = datetime.now(timezone.utc).isoformat()
                result = await db.courses.insert_one(course)
                course_ids.append(str(result.inserted_id))
            
            # Create base timetable structure
            base_timetable = {
                'startTime': '09:00',
                'endTime': '17:00',
                'classDuration': '1',
                'lunchBreakDuration': '1',
                'days': ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
                'created_at': datetime.now(timezone.utc).isoformat()
            }
            await db.base_timetables.insert_one(base_timetable)
            
            # Create default credit limits
            credit_limits = {
                'key': 'credit_limits',
                'value': {
                    'minCredits': 15,
                    'maxCredits': 25
                },
                'created_at': datetime.now(timezone.utc).isoformat()
            }
            await db.settings.insert_one(credit_limits)
            
            # Create faculty timetables with preferences
            faculty_timetables = [
                {
                    'faculty_id': faculty_ids[0], # Dr. Smith
                    'schedule': [
                        {'day': 'Monday', 'time': '9:00 AM - 10:00 AM', 'course_id': course_ids[0], 'course_name': 'Data Structures', 'room_id': room_ids[0], 'room_name': 'Room 101'},
                        {'day': 'Monday', 'time': '10:00 AM - 11:00 AM', 'course_id': course_ids[1], 'course_name': 'Data Structures Lab', 'room_id': room_ids[8], 'room_name': 'Lab A'},
                        {'day': 'Wednesday', 'time': '2:00 PM - 3:00 PM', 'course_id': course_ids[2], 'course_name': 'Algorithms', 'room_id': room_ids[1], 'room_name': 'Room 102'},
                        {'day': 'Friday', 'time': '11:00 AM - 12:00 PM', 'course_id': course_ids[3], 'course_name': 'Database Management Systems', 'room_id': room_ids[2], 'room_name': 'Room 103'},
                    ],
                    'generated_at': datetime.now(timezone.utc).isoformat(),
                    'generated_by': faculty_ids[0]
                },
                {
                    'faculty_id': faculty_ids[1], # Dr. Patel
                    'schedule': [
                        {'day': 'Tuesday', 'time': '9:00 AM - 10:00 AM', 'course_id': course_ids[5], 'course_name': 'Machine Learning', 'room_id': room_ids[5], 'room_name': 'Room 201'},
                        {'day': 'Tuesday', 'time': '2:00 PM - 3:00 PM', 'course_id': course_ids[6], 'course_name': 'Artificial Intelligence', 'room_id': room_ids[6], 'room_name': 'Room 202'},
                        {'day': 'Thursday', 'time': '10:00 AM - 11:00 AM', 'course_id': course_ids[7], 'course_name': 'Computer Networks', 'room_id': room_ids[7], 'room_name': 'Room 203'},
                        {'day': 'Thursday', 'time': '3:00 PM - 4:00 PM', 'course_id': course_ids[8], 'course_name': 'Software Engineering', 'room_id': room_ids[4], 'room_name': 'Room 105'},
                    ],
                    'generated_at': datetime.now(timezone.utc).isoformat(),
                    'generated_by': faculty_ids[1]
                },
                {
                    'faculty_id': faculty_ids[2], # Dr. Kumar
                    'schedule': [
                        {'day': 'Monday', 'time': '11:00 AM - 12:00 PM', 'course_id': course_ids[10], 'course_name': 'Calculus I', 'room_id': room_ids[3], 'room_name': 'Room 104'},
                        {'day': 'Wednesday', 'time': '9:00 AM - 10:00 AM', 'course_id': course_ids[11], 'course_name': 'Calculus II', 'room_id': room_ids[0], 'room_name': 'Room 101'},
                        {'day': 'Friday', 'time': '2:00 PM - 3:00 PM', 'course_id': course_ids[12], 'course_name': 'Linear Algebra', 'room_id': room_ids[1], 'room_name': 'Room 102'},
                        {'day': 'Tuesday', 'time': '3:00 PM - 4:00 PM', 'course_id': course_ids[14], 'course_name': 'Statistics', 'room_id': room_ids[2], 'room_name': 'Room 103'},
                    ],
                    'generated_at': datetime.now(timezone.utc).isoformat(),
                    'generated_by': faculty_ids[2]
                },
                {
                    'faculty_id': faculty_ids[3], # Dr. Wong
                    'schedule': [
                        {'day': 'Monday', 'time': '2:00 PM - 3:00 PM', 'course_id': course_ids[15], 'course_name': 'Physics I', 'room_id': room_ids[11], 'room_name': 'Auditorium A'},
                        {'day': 'Monday', 'time': '3:00 PM - 5:00 PM', 'course_id': course_ids[16], 'course_name': 'Physics I Lab', 'room_id': room_ids[9], 'room_name': 'Lab B'},
                        {'day': 'Wednesday', 'time': '10:00 AM - 11:00 AM', 'course_id': course_ids[17], 'course_name': 'Physics II', 'room_id': room_ids[12], 'room_name': 'Auditorium B'},
                        {'day': 'Friday', 'time': '9:00 AM - 10:00 AM', 'course_id': course_ids[18], 'course_name': 'Quantum Mechanics', 'room_id': room_ids[5], 'room_name': 'Room 201'},
                    ],
                    'generated_at': datetime.now(timezone.utc).isoformat(),
                    'generated_by': faculty_ids[3]
                },
                {
                    'faculty_id': faculty_ids[4], # Dr. Johnson
                    'schedule': [
                        {'day': 'Tuesday', 'time': '10:00 AM - 11:00 AM', 'course_id': course_ids[19], 'course_name': 'General Chemistry', 'room_id': room_ids[6], 'room_name': 'Room 202'},
                        {'day': 'Tuesday', 'time': '2:00 PM - 4:00 PM', 'course_id': course_ids[20], 'course_name': 'Chemistry Lab I', 'room_id': room_ids[10], 'room_name': 'Lab C'},
                        {'day': 'Thursday', 'time': '9:00 AM - 10:00 AM', 'course_id': course_ids[21], 'course_name': 'Organic Chemistry', 'room_id': room_ids[7], 'room_name': 'Room 203'},
                        {'day': 'Thursday', 'time': '3:00 PM - 5:00 PM', 'course_id': course_ids[22], 'course_name': 'Organic Chemistry Lab', 'room_id': room_ids[11], 'room_name': 'Lab D'},
                    ],
                    'generated_at': datetime.now(timezone.utc).isoformat(),
                    'generated_by': faculty_ids[4]
                },
                {
                    'faculty_id': faculty_ids[5], # Dr. Williams
                    'schedule': [
                        {'day': 'Monday', 'time': '9:00 AM - 10:00 AM', 'course_id': course_ids[23], 'course_name': 'Biology I', 'room_id': room_ids[13], 'room_name': 'Seminar Room 1'},
                        {'day': 'Monday', 'time': '2:00 PM - 4:00 PM', 'course_id': course_ids[24], 'course_name': 'Biology Lab I', 'room_id': room_ids[9], 'room_name': 'Lab B'},
                        {'day': 'Wednesday', 'time': '11:00 AM - 12:00 PM', 'course_id': course_ids[25], 'course_name': 'Genetics', 'room_id': room_ids[14], 'room_name': 'Seminar Room 2'},
                        {'day': 'Friday', 'time': '10:00 AM - 11:00 AM', 'course_id': course_ids[26], 'course_name': 'Molecular Biology', 'room_id': room_ids[0], 'room_name': 'Room 101'},
                    ],
                    'generated_at': datetime.now(timezone.utc).isoformat(),
                    'generated_by': faculty_ids[5]
                },
                {
                    'faculty_id': faculty_ids[6], # Dr. Brown
                    'schedule': [
                        {'day': 'Tuesday', 'time': '11:00 AM - 12:00 PM', 'course_id': course_ids[31], 'course_name': 'English Literature', 'room_id': room_ids[15], 'room_name': 'Conference Room 1'},
                        {'day': 'Wednesday', 'time': '2:00 PM - 3:00 PM', 'course_id': course_ids[32], 'course_name': 'Creative Writing', 'room_id': room_ids[16], 'room_name': 'Conference Room 2'},
                        {'day': 'Thursday', 'time': '9:00 AM - 10:00 AM', 'course_id': course_ids[33], 'course_name': 'Technical Writing', 'room_id': room_ids[13], 'room_name': 'Seminar Room 1'},
                        {'day': 'Friday', 'time': '3:00 PM - 4:00 PM', 'course_id': course_ids[34], 'course_name': 'Shakespeare Studies', 'room_id': room_ids[14], 'room_name': 'Seminar Room 2'},
                    ],
                    'generated_at': datetime.now(timezone.utc).isoformat(),
                    'generated_by': faculty_ids[6]
                },
                {
                    'faculty_id': faculty_ids[7], # Dr. Davis
                    'schedule': [
                        {'day': 'Monday', 'time': '10:00 AM - 11:00 AM', 'course_id': course_ids[35], 'course_name': 'Microeconomics', 'room_id': room_ids[1], 'room_name': 'Room 102'},
                        {'day': 'Wednesday', 'time': '9:00 AM - 10:00 AM', 'course_id': course_ids[36], 'course_name': 'Macroeconomics', 'room_id': room_ids[2], 'room_name': 'Room 103'},
                        {'day': 'Thursday', 'time': '2:00 PM - 3:00 PM', 'course_id': course_ids[37], 'course_name': 'International Economics', 'room_id': room_ids[3], 'room_name': 'Room 104'},
                        {'day': 'Friday', 'time': '11:00 AM - 12:00 PM', 'course_id': course_ids[38], 'course_name': 'Financial Economics', 'room_id': room_ids[5], 'room_name': 'Room 201'},
                    ],
                    'generated_at': datetime.now(timezone.utc).isoformat(),
                    'generated_by': faculty_ids[7]
                },
                {
                    'faculty_id': faculty_ids[8], # Dr. Miller
                    'schedule': [
                        {'day': 'Tuesday', 'time': '9:00 AM - 10:00 AM', 'course_id': course_ids[39], 'course_name': 'World History', 'room_id': room_ids[4], 'room_name': 'Room 105'},
                        {'day': 'Wednesday', 'time': '11:00 AM - 12:00 PM', 'course_id': course_ids[40], 'course_name': 'American History', 'room_id': room_ids[6], 'room_name': 'Room 202'},
                        {'day': 'Thursday', 'time': '10:00 AM - 11:00 AM', 'course_id': course_ids[41], 'course_name': 'Modern History', 'room_id': room_ids[7], 'room_name': 'Room 203'},
                        {'day': 'Friday', 'time': '2:00 PM - 3:00 PM', 'course_id': course_ids[42], 'course_name': 'Ancient Civilizations', 'room_id': room_ids[0], 'room_name': 'Room 101'},
                    ],
                    'generated_at': datetime.now(timezone.utc).isoformat(),
                    'generated_by': faculty_ids[8]
                },
                {
                    'faculty_id': faculty_ids[9], # Dr. Wilson
                    'schedule': [
                        {'day': 'Monday', 'time': '11:00 AM - 12:00 PM', 'course_id': course_ids[43], 'course_name': 'Introduction to Psychology', 'room_id': room_ids[15], 'room_name': 'Conference Room 1'},
                        {'day': 'Tuesday', 'time': '2:00 PM - 3:00 PM', 'course_id': course_ids[44], 'course_name': 'Cognitive Psychology', 'room_id': room_ids[16], 'room_name': 'Conference Room 2'},
                        {'day': 'Wednesday', 'time': '10:00 AM - 11:00 AM', 'course_id': course_ids[45], 'course_name': 'Social Psychology', 'room_id': room_ids[13], 'room_name': 'Seminar Room 1'},
                        {'day': 'Friday', 'time': '9:00 AM - 10:00 AM', 'course_id': course_ids[46], 'course_name': 'Abnormal Psychology', 'room_id': room_ids[14], 'room_name': 'Seminar Room 2'},
                    ],
                    'generated_at': datetime.now(timezone.utc).isoformat(),
                    'generated_by': faculty_ids[9]
                },
            ]
            
            for ft in faculty_timetables:
                await db.timetables.insert_one(ft)
            
            # Create student timetables and preferences
            student_timetables = []
            for i, student_id in enumerate(student_ids):
                # Assign 4-6 courses per student
                num_courses = 4 + (i % 3)  # 4-6 courses per student
                # FIXED: Correctly slice the course_ids list
                start_idx = i % len(course_ids)
                end_idx = start_idx + num_courses
                if end_idx > len(course_ids):
                    end_idx = len(course_ids)
                student_courses = course_ids[start_idx:end_idx]
                
                # Create course preferences
                preferences = []
                for j, course_id in enumerate(student_courses):
                    preferences.append({
                        'student_id': student_id,
                        'course_id': course_id,
                        'preferred_time': ['morning', 'afternoon', 'no-preference'][j % 3],
                        'preferred_professor': 'no-preference',
                        'priority': (j % 3) + 1,
                        'created_at': datetime.now(timezone.utc).isoformat()
                    })
                
                await db.student_course_preferences.insert_many(preferences)
                
                # Create a simple timetable for each student
                days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
                times = ['9:00 AM - 10:00 AM', '10:00 AM - 11:00 AM', '11:00 AM - 12:00 PM', '2:00 PM - 3:00 PM', '3:00 PM - 4:00 PM', '4:00 PM - 5:00 PM']
                
                schedule = []
                for day_idx, day in enumerate(days):
                    for time_idx, time in enumerate(times):
                        if day_idx * len(times) + time_idx < len(student_courses):
                            course_id = student_courses[day_idx * len(times) + time_idx]
                            course = await db.courses.find_one({'_id': ObjectId(course_id)})
                            if course:
                                # Find a suitable room
                                suitable_room = None
                                if course.get('is_lab'):
                                    suitable_room = await db.rooms.find_one({'type': 'lab'})
                                else:
                                    suitable_room = await db.rooms.find_one({'type': 'classroom'})
                                
                                if suitable_room:
                                    # FIXED: Properly handle faculty name assignment
                                    if course.get('faculty_id'):
                                        try:
                                            # Find faculty in faculty_data by matching ID
                                            faculty_doc = await db.users.find_one({'_id': ObjectId(course.get('faculty_id'))})
                                            if faculty_doc:
                                                faculty_name = faculty_doc['name'].split(' ')[-1]  # Get last name
                                                faculty_name = f"Dr. {faculty_name}"
                                            else:
                                                faculty_name = 'TBD'
                                        except:
                                            faculty_name = 'TBD'
                                    else:
                                        faculty_name = 'TBD'
                                    
                                    schedule.append({
                                        'day': day,
                                        'time': time,
                                        'course_id': str(course['_id']),
                                        'course_name': course['name'],
                                        'course_code': course['code'],
                                        'room_id': str(suitable_room['_id']),
                                        'room_name': suitable_room['name'],
                                        'faculty_id': str(course.get('faculty_id', '')),
                                        'faculty_name': faculty_name
                                    })
                
                student_timetable = {
                    'schedule': schedule,
                    'summary': f'Timetable for student {i+1}',
                    'generated_at': datetime.now(timezone.utc).isoformat(),
                    'generated_by': student_id,
                    'student_id': student_id
                }
                student_timetables.append(student_timetable)
            
            # Insert all student timetables
            await db.timetables.insert_many(student_timetables)
            
            logger.info("Extensive demo data created successfully")
        else:
            logger.info("Demo data already exists")
        
    except Exception as e:
        logger.error(f"Demo data creation error: {str(e)}")

# Lifespan context manager
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await create_indexes()
    await initialize_demo_data()
    
    yield
    
    # Shutdown
    logger.info("Application shutting down")

# Create FastAPI app with /api prefix
app = FastAPI(
    title="FlexiSched API",
    description="API for NEP 2020 compliant university timetable scheduling system",
    version="1.0.0",
    docs_url="/docs" if IS_DEVELOPMENT else None,
    redoc_url="/redoc" if IS_DEVELOPMENT else None,
    lifespan=lifespan
)

# Add trusted host middleware for security
app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=["*"] if IS_DEVELOPMENT else os.environ.get('ALLOWED_HOSTS', 'localhost').split(',')
)

# Add CORS middleware early
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# Add compression middleware with proper cleanup
app.add_middleware(GZipMiddleware, minimum_size=500)

# Custom exception handler for better error responses
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Global exception: {str(exc)}")
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error", "error": str(exc) if IS_DEVELOPMENT else None}
    )

# Custom validation error handler to provide more detailed information
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    logger.error(f"Validation error: {exc.errors()}")
    logger.error(f"Request body: {exc.body}")
    
    # Extract field-specific error messages
    errors = {}
    for error in exc.errors():
        field = ".".join(str(x) for x in error["loc"])
        errors[field] = error["msg"]
    
    return JSONResponse(
        status_code=422,
        content={"detail": "Validation failed", "errors": errors}
    )

# Helper functions
def hash_password(password):
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(password, hashed):
    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))

def generate_token(user_id, email, role):
    payload = {
        'user_id': user_id,
        'email': email,
        'role': role,
        'exp': datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def decode_token(token):
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None

# Authentication dependency
async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    payload = decode_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail='Token is invalid or expired')
    return payload

# Role checking
def require_role(allowed_roles: List[str]):
    async def role_checker(user: dict = Depends(get_current_user)):
        if user.get('role') not in allowed_roles:
            raise HTTPException(status_code=403, detail='Forbidden - Insufficient permissions')
        return user
    return role_checker

# Background task for notifying users
async def notify_users(message: str):
    # Implementation to notify users via email, push notifications, etc.
    logger.info(f"Notifying users: {message}")
    # In a real implementation, this would send emails, push notifications, etc.

# Background task for processing timetable updates
async def process_timetable_update(timetable_id: str):
    # Implementation to process timetable updates
    logger.info(f"Processing timetable update for {timetable_id}")
    # In a real implementation, this might update caches, send notifications, etc.

# API v1 Routes
@app.post('/api/v1/auth/register')
async def register(request: Request, data: RegisterRequest):
    try:
        # Check if user exists
        existing_user = await db.users.find_one({'email': data.email})
        if existing_user:
            raise HTTPException(status_code=400, detail='User already exists')
        
        # Create user
        user_data = {
            'email': data.email,
            'password_hash': hash_password(data.password),
            'name': data.name,
            'role': data.role,
            'created_at': datetime.now(timezone.utc).isoformat()
        }
        
        result = await db.users.insert_one(user_data)
        user_id = str(result.inserted_id)
        
        token = generate_token(user_id, data.email, data.role)
        
        return {
            'token': token,
            'user': {
                'id': user_id,
                'email': data.email,
                'name': data.name,
                'role': data.role
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Register error: {str(e)}")
        raise HTTPException(status_code=500, detail='Registration failed')

@app.post('/api/v1/auth/login')
async def login(request: Request, data: LoginRequest):
    try:
        user = await db.users.find_one({'email': data.email})
        if not user:
            logger.warning(f"Login failed for email {data.email}: User not found.")
            raise HTTPException(status_code=401, detail='Invalid credentials')
        
        if not verify_password(data.password, user['password_hash']):
            logger.warning(f"Login failed for email {data.email}: Password does not match.")
            raise HTTPException(status_code=401, detail='Invalid credentials')
        
        user_id = str(user['_id'])
        token = generate_token(user_id, data.email, user['role'])
        
        return {
            'token': token,
            'user': {
                'id': user_id,
                'email': data.email,
                'name': user['name'],
                'role': user['role']
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Login error: {str(e)}")
        raise HTTPException(status_code=500, detail='Login failed')

@app.post('/api/v1/auth/logout')
async def logout(response: Response):
    response.delete_cookie(key="access_token")
    return {"message": "Successfully logged out"}

@app.post('/api/v1/auth/update-password')
async def update_password(
    request: Request,
    data: UpdatePasswordRequest,
    user: dict = Depends(get_current_user)
):
    try:
        user_id = user.get('user_id')
        user_doc = await db.users.find_one({'_id': ObjectId(user_id)})
        
        if not user_doc:
            raise HTTPException(status_code=404, detail='User not found')
        
        if not verify_password(data.current_password, user_doc['password_hash']):
            raise HTTPException(status_code=401, detail='Current password is incorrect')
        
        await db.users.update_one(
            {'_id': ObjectId(user_id)},
            {'$set': {'password_hash': hash_password(data.new_password)}}
        )
        
        return {'message': 'Password updated successfully'}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Update password error: {str(e)}")
        raise HTTPException(status_code=500, detail='Failed to update password')

# Dashboard Stats
@app.get('/api/v1/dashboard/stats')
async def get_dashboard_stats(
    request: Request, 
    user: dict = Depends(require_role(['admin']))
):
    try:
        total_students = await db.users.count_documents({'role': 'student'})
        total_faculty = await db.users.count_documents({'role': 'faculty'})
        total_courses = await db.courses.count_documents({})
        total_rooms = await db.rooms.count_documents({})
        
        return {
            'total_students': total_students,
            'total_faculty': total_faculty,
            'total_courses': total_courses,
            'total_rooms': total_rooms
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Stats error: {str(e)}")
        raise HTTPException(status_code=500, detail='Failed to fetch stats')

# Course Routes
@app.get('/api/v1/courses')
async def get_courses(
    request: Request,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    user: dict = Depends(get_current_user)
):
    try:
        courses = await db.courses.find({}).skip(skip).limit(limit).to_list(1000)
        for course in courses:
            course['_id'] = str(course['_id'])
            # Convert faculty_id to string if it exists
            if 'faculty_id' in course and course['faculty_id']:
                course['faculty_id'] = str(course['faculty_id'])
            
        return courses
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get courses error: {str(e)}")
        raise HTTPException(status_code=500, detail='Failed to fetch courses')

@app.post('/api/v1/courses')
async def create_course(
    request: Request,
    data: CourseRequest, 
    user: dict = Depends(require_role(['admin']))
):
    try:
        # Check if course code already exists
        existing_course = await db.courses.find_one({'code': data.code})
        if existing_course:
            raise HTTPException(status_code=400, detail='Course code already exists')
        
        # Create course without a faculty_id, as frontend doesn't provide one
        course = {
            'name': data.name,
            'code': data.code,
            'credits': data.credits,
            'category': data.category,
            'duration_hours': data.duration_hours,
            'is_lab': data.is_lab,
            'created_at': datetime.now(timezone.utc).isoformat()
        }
        
        result = await db.courses.insert_one(course)
        course['_id'] = str(result.inserted_id)
        
        return course
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Create course error: {str(e)}")
        raise HTTPException(status_code=500, detail='Failed to create course')

@app.put('/api/v1/courses/{course_id}')
async def update_course(
    request: Request,
    course_id: str, 
    data: CourseUpdateRequest,
    user: dict = Depends(require_role(['admin']))
):
    try:
        try:
            obj_id = ObjectId(course_id)
        except InvalidId:
            raise HTTPException(status_code=400, detail='Invalid course ID format')

        # Check if course exists
        existing_course = await db.courses.find_one({'_id': obj_id})
        if not existing_course:
            raise HTTPException(status_code=404, detail='Course not found')
        
        # Build update data only with provided fields
        update_data = {}
        if data.name is not None:
            update_data['name'] = data.name
        if data.code is not None:
            # Check if course code is being changed and if that new code already exists
            if existing_course['code'] != data.code:
                code_exists = await db.courses.find_one({'code': data.code, '_id': {'$ne': obj_id}})
                if code_exists:
                    raise HTTPException(status_code=400, detail='Course code already exists')
            update_data['code'] = data.code
        if data.credits is not None:
            update_data['credits'] = data.credits
        if data.category is not None:
            update_data['category'] = data.category
        if data.faculty_id is not None:
            update_data['faculty_id'] = ObjectId(data.faculty_id)
        if data.duration_hours is not None:
            update_data['duration_hours'] = data.duration_hours
        if data.is_lab is not None:
            update_data['is_lab'] = data.is_lab
        
        if not update_data:
            raise HTTPException(status_code=400, detail='No valid fields to update')
        
        update_data['updated_at'] = datetime.now(timezone.utc).isoformat()
        
        await db.courses.update_one({'_id': obj_id}, {'$set': update_data})
        
        course = await db.courses.find_one({'_id': obj_id})
        course['_id'] = str(course['_id'])
        if 'faculty_id' in course and course['faculty_id']:
            course['faculty_id'] = str(course['faculty_id'])

        return course
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Update course error: {str(e)}")
        raise HTTPException(status_code=500, detail='Failed to update course')

@app.delete('/api/v1/courses/{course_id}')
async def delete_course(
    request: Request,
    course_id: str, 
    user: dict = Depends(require_role(['admin']))
):
    try:
        try:
            obj_id = ObjectId(course_id)
        except InvalidId:
            raise HTTPException(status_code=400, detail='Invalid course ID format')
            
        # Check if course exists
        existing_course = await db.courses.find_one({'_id': obj_id})
        if not existing_course:
            raise HTTPException(status_code=404, detail='Course not found')
            
        await db.courses.delete_one({'_id': obj_id})
        
        return {'message': 'Course deleted successfully'}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Delete course error: {str(e)}")
        raise HTTPException(status_code=500, detail='Failed to delete course')

# User Management Routes
@app.get('/api/v1/users')
async def get_users(
    request: Request,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    user: dict = Depends(require_role(['admin']))
):
    try:
        users = await db.users.find({}, {'password_hash': 0}).skip(skip).limit(limit).to_list(1000)
        for u in users:
            u['_id'] = str(u['_id'])
            
        return users
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get users error: {str(e)}")
        raise HTTPException(status_code=500, detail='Failed to fetch users')

@app.post('/api/v1/users')
async def create_user(
    request: Request,
    data: RegisterRequest,  # Reuse RegisterRequest model from auth
    current_user: dict = Depends(require_role(['admin']))
):
    try:
        # Check if user already exists
        existing_user = await db.users.find_one({'email': data.email})
        if existing_user:
            raise HTTPException(status_code=400, detail='User already exists')
        
        # Create user
        new_user = {
            'email': data.email,
            'password_hash': hash_password(data.password),
            'name': data.name,
            'role': data.role,
            'created_at': datetime.now(timezone.utc).isoformat()
        }
        
        result = await db.users.insert_one(new_user)
        user_id = str(result.inserted_id)
        
        # Return user data without password hash
        return {
            'id': user_id,
            'email': data.email,
            'name': data.name,
            'role': data.role,
            'created_at': new_user['created_at']
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Create user error: {str(e)}")
        raise HTTPException(status_code=500, detail='Failed to create user')

@app.get('/api/v1/users/{user_id}')
async def get_user(
    request: Request,
    user_id: str,
    current_user: dict = Depends(require_role(['admin']))
):
    try:
        try:
            obj_id = ObjectId(user_id)
        except InvalidId:
            raise HTTPException(status_code=400, detail='Invalid user ID format')

        user = await db.users.find_one({'_id': obj_id}, {'password_hash': 0})
        if not user:
            raise HTTPException(status_code=404, detail='User not found')
            
        user['_id'] = str(user['_id'])
        return user
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get user error: {str(e)}")
        raise HTTPException(status_code=500, detail='Failed to fetch user')

@app.put('/api/v1/users/{user_id}')
async def update_user(
    request: Request,
    user_id: str,
    data: UserUpdateRequest,
    current_user: dict = Depends(require_role(['admin']))
):
    try:
        try:
            obj_id = ObjectId(user_id)
        except InvalidId:
            raise HTTPException(status_code=400, detail='Invalid user ID format')

        # Check if user exists
        existing_user = await db.users.find_one({'_id': obj_id})
        if not existing_user:
            raise HTTPException(status_code=404, detail='User not found')
        
        # Don't allow role changes for self
        if user_id == current_user.get('user_id') and 'role' in data.model_dump():
            del data.role
        
        # Check if email is being changed and if that new email already exists
        if data.email and existing_user['email'] != data.email:
            email_exists = await db.users.find_one({'email': data.email, '_id': {'$ne': obj_id}})
            if email_exists:
                raise HTTPException(status_code=400, detail='Email already exists')
        
        update_data = data.model_dump(exclude_unset=True)
        if update_data:
            update_data['updated_at'] = datetime.now(timezone.utc).isoformat()
        
        await db.users.update_one({'_id': obj_id}, {'$set': update_data})
        
        user = await db.users.find_one({'_id': obj_id}, {'password_hash': 0})
        user['_id'] = str(user['_id'])
        
        return user
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Update user error: {str(e)}")
        raise HTTPException(status_code=500, detail='Failed to update user')

@app.delete('/api/v1/users/{user_id}')
async def delete_user(
    request: Request,
    user_id: str,
    current_user: dict = Depends(require_role(['admin']))
):
    try:
        try:
            obj_id = ObjectId(user_id)
        except InvalidId:
            raise HTTPException(status_code=400, detail='Invalid user ID format')

        # Don't allow self-deletion
        if user_id == current_user.get('user_id'):
            raise HTTPException(status_code=403, detail='Cannot delete your own account')
        
        # Check if user exists
        existing_user = await db.users.find_one({'_id': obj_id})
        if not existing_user:
            raise HTTPException(status_code=404, detail='User not found')
            
        await db.users.delete_one({'_id': obj_id})
        
        return {'message': 'User deleted successfully'}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Delete user error: {str(e)}")
        raise HTTPException(status_code=500, detail='Failed to delete user')

# Room Routes
@app.get('/api/v1/rooms')
async def get_rooms(
    request: Request,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    user: dict = Depends(get_current_user)
):
    try:
        rooms = await db.rooms.find({}).skip(skip).limit(limit).to_list(1000)
        for room in rooms:
            room['_id'] = str(room['_id'])
            
        return rooms
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get rooms error: {str(e)}")
        raise HTTPException(status_code=500, detail='Failed to fetch rooms')

@app.post('/api/v1/rooms')
async def create_room(
    request: Request,
    data: RoomRequest, 
    user: dict = Depends(require_role(['admin']))
):
    try:
        # Check if room name already exists
        existing_room = await db.rooms.find_one({'name': data.name})
        if existing_room:
            raise HTTPException(status_code=400, detail='Room name already exists')
            
        room = {
            'name': data.name,
            'capacity': data.capacity,
            'type': data.type,
            'created_at': datetime.now(timezone.utc).isoformat()
        }
        
        result = await db.rooms.insert_one(room)
        room['_id'] = str(result.inserted_id)
        
        return room
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Create room error: {str(e)}")
        raise HTTPException(status_code=500, detail='Failed to create room')

@app.put('/api/v1/rooms/{room_id}')
async def update_room(
    request: Request,
    room_id: str, 
    data: RoomUpdateRequest,
    user: dict = Depends(require_role(['admin']))
):
    try:
        try:
            obj_id = ObjectId(room_id)
        except InvalidId:
            raise HTTPException(status_code=400, detail='Invalid room ID format')

        # Check if room exists
        existing_room = await db.rooms.find_one({'_id': obj_id})
        if not existing_room:
            raise HTTPException(status_code=404, detail='Room not found')
            
        # Build update data only with provided fields
        update_data = {}
        if data.name is not None:
            update_data['name'] = data.name
        if data.capacity is not None:
            update_data['capacity'] = data.capacity
        if data.type is not None:
            update_data['type'] = data.type
        
        if not update_data:
            raise HTTPException(status_code=400, detail='No valid fields to update')
        
        update_data['updated_at'] = datetime.now(timezone.utc).isoformat()
        
        await db.rooms.update_one({'_id': obj_id}, {'$set': update_data})
        
        room = await db.rooms.find_one({'_id': obj_id})
        room['_id'] = str(room['_id'])
        
        return room
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Update room error: {str(e)}")
        raise HTTPException(status_code=500, detail='Failed to update room')

@app.delete('/api/v1/rooms/{room_id}')
async def delete_room(
    request: Request,
    room_id: str, 
    user: dict = Depends(require_role(['admin']))
):
    try:
        try:
            obj_id = ObjectId(room_id)
        except InvalidId:
            raise HTTPException(status_code=400, detail='Invalid room ID format')
            
        # Check if room exists
        existing_room = await db.rooms.find_one({'_id': obj_id})
        if not existing_room:
            raise HTTPException(status_code=404, detail='Room not found')
            
        await db.rooms.delete_one({'_id': obj_id})
        
        return {'message': 'Room deleted successfully'}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Delete room error: {str(e)}")
        raise HTTPException(status_code=500, detail='Failed to delete room')

# Base Timetable Routes
@app.get('/api/v1/timetable/base')
async def get_base_timetable(
    request: Request,
    user: dict = Depends(require_role(['admin', 'faculty'])) # <--- CHANGED: Now allows faculty
):
    try:
        base_timetable = await db.base_timetables.find_one(sort=[('created_at', -1)])
        if not base_timetable:
            return None
        
        base_timetable['_id'] = str(base_timetable['_id'])
        return base_timetable
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get base timetable error: {str(e)}")
        raise HTTPException(status_code=500, detail='Failed to fetch base timetable')

# --- POST endpoint remains admin-only ---
@app.post('/api/v1/timetable/base')
async def create_base_timetable(
    request: Request,
    data: BaseTimetableRequest, # Use the new Pydantic model
    user: dict = Depends(require_role(['admin'])) # <--- This is correct, only admin can create/update
):
    try:
        # ... (rest of the POST endpoint code remains the same)
        start_time = data.startTime
        end_time = data.endTime
        class_duration = data.classDuration
        lunch_break_duration = data.lunchBreakDuration
        lunch_break_position = data.lunchBreakPosition
        days = data.days
        include_short_breaks = data.includeShortBreaks # Get the new flag
        
        # Check if base timetable already exists
        existing = await db.base_timetables.find_one()
        if existing:
            # Update existing
            update_data = {
                'startTime': start_time,
                'endTime': end_time,
                'classDuration': str(class_duration),
                'lunchBreakDuration': str(lunch_break_duration),
                'lunchBreakPosition': lunch_break_position,
                'days': days,
                'includeShortBreaks': include_short_breaks, # Save the new flag
                'updated_at': datetime.now(timezone.utc).isoformat()
            }
            
            await db.base_timetables.update_one({}, {'$set': update_data})
            
            # Return updated document
            base_timetable = await db.base_timetables.find_one()
            base_timetable['_id'] = str(base_timetable['_id'])
            return base_timetable
        else:
            # Create new base timetable
            base_timetable = {
                'startTime': start_time,
                'endTime': end_time,
                'classDuration': str(class_duration),
                'lunchBreakDuration': str(lunch_break_duration),
                'lunchBreakPosition': lunch_break_position,
                'days': days,
                'includeShortBreaks': include_short_breaks, # Save the new flag
                'created_at': datetime.now(timezone.utc).isoformat(),
                'created_by': user.get('user_id')
            }
            
            result = await db.base_timetables.insert_one(base_timetable)
            base_timetable['_id'] = str(result.inserted_id)
            
            return base_timetable
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Create base timetable error: {str(e)}")
        raise HTTPException(status_code=500, detail='Failed to create base timetable')

# Credit Limits Routes (NEW)
@app.get('/api/v1/settings/credit-limits')
async def get_credit_limits(
    request: Request,
    user: dict = Depends(get_current_user)
):
    try:
        # Get credit limits from settings
        setting = await db.settings.find_one({'key': 'credit_limits'})
        
        if not setting:
            # Return default values if not found
            return {
                'minCredits': 15,
                'maxCredits': 25
            }
        
        return setting.get('value', {
            'minCredits': 15,
            'maxCredits': 25
        })
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get credit limits error: {str(e)}")
        raise HTTPException(status_code=500, detail='Failed to fetch credit limits')

@app.post('/api/v1/settings/credit-limits')
async def update_credit_limits(
    request: Request,
    data: CreditLimitsRequest,
    user: dict = Depends(require_role(['admin']))
):
    try:
        # Check if credit limits setting already exists
        existing = await db.settings.find_one({'key': 'credit_limits'})
        
        if existing:
            # Update existing
            await db.settings.update_one(
                {'key': 'credit_limits'},
                {
                    '$set': {
                        'value': {
                            'minCredits': data.minCredits,
                            'maxCredits': data.maxCredits
                        },
                        'updated_at': datetime.now(timezone.utc).isoformat()
                    }
                }
            )
        else:
            # Create new
            await db.settings.insert_one({
                'key': 'credit_limits',
                'value': {
                    'minCredits': data.minCredits,
                    'maxCredits': data.maxCredits
                },
                'created_at': datetime.now(timezone.utc).isoformat()
            })
        
        return {
            'minCredits': data.minCredits,
            'maxCredits': data.maxCredits
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Update credit limits error: {str(e)}")
        raise HTTPException(status_code=500, detail='Failed to update credit limits')

# AI Timetable Generation Routes (Only for Users)
@app.post('/api/v1/timetable/generate')
async def generate_timetable(
    request: Request,
    background_tasks: BackgroundTasks,
    user: dict = Depends(require_role(['faculty', 'student']))  # Only faculty and students can generate
):
    try:
        if not OPENROUTER_API_KEY:
            raise HTTPException(status_code=500, detail='AI generation service is not configured')
            
        # Fetch all data
        courses = await db.courses.find({}).to_list(1000)
        rooms = await db.rooms.find({}).to_list(1000)
        faculty = await db.users.find({'role': 'faculty'}, {'password_hash': 0}).to_list(1000)
        
        # Get credit limits
        credit_limits_setting = await db.settings.find_one({'key': 'credit_limits'})
        credit_limits = credit_limits_setting.get('value', {
            'minCredits': 15,
            'maxCredits': 25
        }) if credit_limits_setting else {
            'minCredits': 15,
            'maxCredits': 25
        }
        
        # Prepare data for AI
        courses_data = []
        for course in courses:
            courses_data.append({
                'id': str(course['_id']),
                'name': course['name'],
                'code': course['code'],
                'credits': course['credits'],
                'category': course['category'],
                'duration_hours': course.get('duration_hours', 1),
                'is_lab': course.get('is_lab', False),
                'faculty_id': course.get('faculty_id', '')
            })
        
        rooms_data = []
        for room in rooms:
            rooms_data.append({
                'id': str(room['_id']),
                'name': room['name'],
                'capacity': room['capacity'],
                'type': room['type']
            })
        
        faculty_data = []
        for fac in faculty:
            faculty_data.append({
                'id': str(fac['_id']),
                'name': fac['name'],
                'email': fac['email']
            })
        
        # Create AI prompt
        prompt = f"""
You are a timetable scheduling expert for a NEP 2020 compliant university.

Generate a weekly timetable following these constraints:

1. TIME SLOTS: Monday to Friday, 9:00 AM to 5:00 PM
   - Regular classes: 1 hour slots
   - Lab classes: 2-3 hour slots
   - Break: 1:00 PM - 2:00 PM (lunch)

2. NEP 2020 COMPLIANCE:
   - Respect course credits
   - Support multidisciplinary courses (Major, Minor, SEC, AEC, VAC)
   - Flexible scheduling for different course types

3. CONSTRAINTS:
   - No faculty can teach two classes at the same time
   - No room can host two classes at the same time
   - Room capacity must accommodate students
   - Labs should be in lab rooms, theory in classrooms
   - Student timetables should have between {credit_limits['minCredits']} and {credit_limits['maxCredits']} credits

4. DATA:
Courses: {json.dumps(courses_data, indent=2)}

Rooms: {json.dumps(rooms_data, indent=2)}

Faculty: {json.dumps(faculty_data, indent=2)}

Generate a JSON response with this structure:
{{
  "schedule": [
    {{
      "day": "Monday",
      "time": "9:00 AM - 10:00 AM",
      "course_id": "course_id",
      "course_name": "Course Name",
      "course_code": "CS101",
      "room_id": "room_id",
      "room_name": "Room 101",
      "faculty_id": "faculty_id",
      "faculty_name": "Dr. Smith"
    }}
  ],
  "summary": "Brief summary of the generated timetable"
}}

Return ONLY valid JSON, no markdown formatting.
"""
        
        # Call AI using OpenRouter directly
        try:
            response = requests.post(
                url="https://openrouter.ai/api/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                    "Content-Type": "application/json",
                },
                data=json.dumps({
                    "model": OPENROUTER_MODEL,
                    "messages": [
                        {
                            "role": "user",
                            "content": prompt
                        }
                    ]
                }),
                timeout=None  # REMOVED: No timeout - wait indefinitely
            )
            
            if response.status_code != 200:
                logger.error(f"OpenRouter API error: {response.status_code} - {response.text}")
                raise HTTPException(status_code=500, detail='Failed to generate timetable')
            
            # Parse AI response
            try:
                # Remove markdown code blocks if present
                response_text = response.json()['choices'][0]['message']['content']
                if response_text.startswith('```json'):
                    response_text = response_text[7:]
                if response_text.startswith('```'):
                    response_text = response_text[3:]
                if response_text.endswith('```'):
                    response_text = response_text[:-3]
                
                timetable_data = json.loads(response_text.strip())
            except (json.JSONDecodeError, KeyError) as e:
                logger.error(f"JSON decode error: {str(e)}")
                logger.error(f"AI Response: {response_text}")
                raise HTTPException(status_code=500, detail='Failed to parse AI response')
            
            # Save to database
            timetable_record = {
                'schedule': timetable_data.get('schedule', []),
                'summary': timetable_data.get('summary', ''),
                'generated_at': datetime.now(timezone.utc).isoformat(),
                'generated_by': user.get('user_id')
            }
            
            result = await db.timetables.insert_one(timetable_record)
            timetable_record['_id'] = str(result.inserted_id)
            
            # Add background task to notify users
            background_tasks.add_task(notify_users, "New timetable has been generated")
            
            return timetable_record
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Request to OpenRouter failed: {str(e)}")
            raise HTTPException(status_code=500, detail='Failed to connect to AI service')
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Generate timetable error: {str(e)}")
        raise HTTPException(status_code=500, detail=f'Failed to generate timetable: {str(e)}')

# Get latest timetable with pagination
@app.get('/api/v1/timetable/latest')
async def get_latest_timetable(
    request: Request,
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=100),
    user: dict = Depends(get_current_user)
):
    try:
        timetable = await db.timetables.find_one(sort=[('generated_at', -1)])
        
        if not timetable:
            raise HTTPException(status_code=404, detail='No timetable found')
        
        # Paginate schedule
        schedule = timetable.get('schedule', [])
        total = len(schedule)
        skip = (page - 1) * size
        paginated_schedule = schedule[skip:skip + size]
        
        return {
            '_id': str(timetable['_id']),
            'summary': timetable.get('summary', ''),
            'generated_at': timetable.get('generated_at'),
            'generated_by': timetable.get('generated_by'),
            'schedule': paginated_schedule,
            'pagination': {
                'page': page,
                'size': size,
                'total': total,
                'pages': (total + size - 1) // size
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get timetable error: {str(e)}")
        raise HTTPException(status_code=500, detail='Failed to fetch timetable')

# Get all timetables
@app.get('/api/v1/timetable/all')
async def get_all_timetables(
    request: Request,
    skip: int = Query(0, ge=0),
    limit: int = Query(10, ge=1, le=100),
    user: dict = Depends(require_role(['admin']))
):
    try:
        timetables = await db.timetables.find({}).sort('generated_at', -1).skip(skip).limit(limit).to_list(1000)
        for timetable in timetables:
            timetable['_id'] = str(timetable['_id'])
            
        return timetables
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get all timetables error: {str(e)}")
        raise HTTPException(status_code=500, detail='Failed to fetch timetables')

# Faculty Schedule
@app.get('/api/v1/faculty/schedule')
async def get_faculty_schedule(
    request: Request,
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=100),
    user: dict = Depends(require_role(['faculty']))
):
    try:
        faculty_id = user.get('user_id')
        timetable = await db.timetables.find_one({'faculty_id': faculty_id}, sort=[('generated_at', -1)])
        
        if not timetable:
            return {'schedule': [], 'pagination': {'page': page, 'size': size, 'total': 0, 'pages': 0}}
        
        # Paginate schedule
        schedule = timetable.get('schedule', [])
        total = len(schedule)
        skip = (page - 1) * size
        paginated_schedule = schedule[skip:skip + size]
        
        return {
            'schedule': paginated_schedule,
            'pagination': {
                'page': page,
                'size': size,
                'total': total,
                'pages': (total + size - 1) // size
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get faculty schedule error: {str(e)}")
        raise HTTPException(status_code=500, detail='Failed to fetch schedule')

# Student Schedule
@app.get('/api/v1/student/schedule')
async def get_student_schedule(
    request: Request,
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=100),
    user: dict = Depends(require_role(['student']))
):
    try:
        student_id = user.get('user_id')
        timetable = await db.timetables.find_one({'student_id': student_id}, sort=[('generated_at', -1)])
        
        if not timetable:
            return {'schedule': [], 'pagination': {'page': page, 'size': size, 'total': 0, 'pages': 0}}
        
        # Paginate schedule
        schedule = timetable.get('schedule', [])
        total = len(schedule)
        skip = (page - 1) * size
        paginated_schedule = schedule[skip:skip + size]
        
        return {
            'schedule': paginated_schedule,
            'pagination': {
                'page': page,
                'size': size,
                'total': total,
                'pages': (total + size - 1) // size
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get student schedule error: {str(e)}")
        raise HTTPException(status_code=500, detail='Failed to fetch schedule')

# Add these endpoints to server.py

# Get courses assigned to a specific faculty
@app.get('/api/v1/faculty/courses')
async def get_faculty_courses(
    request: Request,
    user: dict = Depends(require_role(['faculty']))
):
    try:
        faculty_id = user.get('user_id')
        
        # Get faculty document
        faculty_doc = await db.users.find_one({'_id': ObjectId(faculty_id)})
        if not faculty_doc:
            raise HTTPException(status_code=404, detail='Faculty not found')
        
        # Get assigned course IDs
        assigned_course_ids = faculty_doc.get('assigned_courses', [])
        
        # If no assigned courses, return empty list
        if not assigned_course_ids:
            return []
        
        # Convert string IDs to ObjectIds
        course_object_ids = [ObjectId(course_id) for course_id in assigned_course_ids]
        
        # Get course details
        courses = await db.courses.find({'_id': {'$in': course_object_ids}}).to_list(1000)
        
        # Convert ObjectIds to strings
        for course in courses:
            course['_id'] = str(course['_id'])
        
        return courses
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get faculty courses error: {str(e)}")
        raise HTTPException(status_code=500, detail='Failed to fetch faculty courses')

# Update courses assigned to a faculty
@app.put('/api/v1/faculty/courses')
async def update_faculty_courses(
    request: Request,
    data: dict,
    user: dict = Depends(require_role(['faculty']))
):
    try:
        faculty_id = user.get('user_id')
        course_ids = data.get('courseIds', [])
        
        # Validate that all course IDs exist
        if course_ids:
            course_object_ids = [ObjectId(course_id) for course_id in course_ids]
            existing_courses = await db.courses.find({'_id': {'$in': course_object_ids}}).to_list(len(course_ids))
            
            if len(existing_courses) != len(course_ids):
                raise HTTPException(status_code=400, detail='One or more course IDs are invalid')
        
        # Update faculty document with assigned courses
        await db.users.update_one(
            {'_id': ObjectId(faculty_id)},
            {'$set': {'assigned_courses': course_ids, 'updated_at': datetime.now(timezone.utc).isoformat()}}
        )
        
        return {'message': 'Courses updated successfully'}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Update faculty courses error: {str(e)}")
        raise HTTPException(status_code=500, detail='Failed to update faculty courses')

# Profile endpoints
@app.get('/api/v1/admin/profile')
async def get_admin_profile(
    request: Request,
    user: dict = Depends(require_role(['admin']))
):
    try:
        user_id = user.get('user_id')
        user_doc = await db.users.find_one({'_id': ObjectId(user_id)}, {'password_hash': 0})
        
        if not user_doc:
            raise HTTPException(status_code=404, detail='User not found')
        
        # Get additional profile data
        profile = {
            'id': str(user_doc['_id']),
            'name': user_doc.get('name', ''),
            'email': user_doc.get('email', ''),
            'role': user_doc.get('role', ''),
            'department': user_doc.get('department', ''),
            'created_at': user_doc.get('created_at', '')
        }
        
        return profile
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get admin profile error: {str(e)}")
        raise HTTPException(status_code=500, detail='Failed to fetch profile')
    
# Save faculty's timetable preferences
@app.put('/api/v1/faculty/timetable-preferences')
async def update_faculty_timetable_preferences(
    request: Request,
    data: dict,
    user: dict = Depends(require_role(['faculty']))
):
    try:
        faculty_id = user.get('user_id')
        preferences = data.get('preferences', [])
        
        # Validate preferences structure
        valid_days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
        
        # Create a new document or update existing one
        await db.faculty_preferences.delete_many({'faculty_id': faculty_id})
        
        if preferences:
            preference_docs = []
            for pref in preferences:
                # FIX: Check if required fields exist before accessing them
                if 'course_id' not in pref or 'day' not in pref or 'start_time' not in pref:
                    raise HTTPException(status_code=400, detail='Invalid preference format')
                
                if pref['day'] not in valid_days:
                    raise HTTPException(status_code=400, detail=f"Invalid day: {pref['day']}")
                
                # Verify course exists and is assigned to this faculty
                course = await db.courses.find_one({'_id': ObjectId(pref['course_id'])})
                if not course:
                    raise HTTPException(status_code=400, detail=f"Course not found: {pref['course_id']}")
                
                faculty_doc = await db.users.find_one({'_id': ObjectId(faculty_id)})
                assigned_courses = faculty_doc.get('assigned_courses', [])
                
                if pref['course_id'] not in assigned_courses:
                    raise HTTPException(status_code=403, detail=f"You are not assigned to course: {course['code']}")
                
                # --- FIX: Ensure course details are included in the preference ---
                preference_docs.append({
                    'faculty_id': faculty_id,
                    'course_id': pref['course_id'],
                    'course_name': course.get('name', ''), # Add course name
                    'course_code': course.get('code', ''), # Add course code
                    'day': pref['day'],
                    'start_time': pref['start_time'],
                    'end_time': pref.get('end_time', ''),
                    'created_at': datetime.now(timezone.utc).isoformat()
                })
            
            await db.faculty_preferences.insert_many(preference_docs)
        
        return {'message': 'Timetable preferences updated successfully'}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Update faculty timetable preferences error: {str(e)}")
        raise HTTPException(status_code=500, detail='Failed to update timetable preferences')

# Get faculty's timetable preferences
@app.get('/api/v1/faculty/timetable-preferences')
async def get_faculty_timetable_preferences(
    request: Request,
    user: dict = Depends(require_role(['faculty']))
):
    try:
        faculty_id = user.get('user_id')
        
        # Get preferences from database
        preferences = await db.faculty_preferences.find({'faculty_id': faculty_id}).to_list(1000)
        
        # Convert ObjectIds to strings
        for pref in preferences:
            pref['_id'] = str(pref['_id'])
            pref['course_id'] = str(pref['course_id'])
        
        return preferences
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get faculty timetable preferences error: {str(e)}")
        raise HTTPException(status_code=500, detail='Failed to fetch timetable preferences')

@app.put('/api/v1/admin/profile')
async def update_admin_profile(
    request: Request,
    data: AdminProfileRequest,
    user: dict = Depends(require_role(['admin']))
):
    try:
        user_id = user.get('user_id')
        user_doc = await db.users.find_one({'_id': ObjectId(user_id)})
        
        if not user_doc:
            raise HTTPException(status_code=404, detail='User not found')
        
        # Check if email is being changed and if that new email already exists
        if data.email and user_doc['email'] != data.email:
            email_exists = await db.users.find_one({'email': data.email, '_id': {'$ne': ObjectId(user_id)}})
            if email_exists:
                raise HTTPException(status_code=400, detail='Email already exists')
        
        # Build update data only with provided fields
        update_data = {}
        if data.name is not None:
            update_data['name'] = data.name
        if data.email is not None:
            update_data['email'] = data.email
        if data.department is not None:
            update_data['department'] = data.department
        
        if update_data:
            update_data['updated_at'] = datetime.now(timezone.utc).isoformat()
            await db.users.update_one({'_id': ObjectId(user_id)}, {'$set': update_data})
        
        # Get updated user data
        updated_user = await db.users.find_one({'_id': ObjectId(user_id)}, {'password_hash': 0})
        
        return {
            'id': str(updated_user['_id']),
            'name': updated_user.get('name', ''),
            'email': updated_user.get('email', ''),
            'role': updated_user.get('role', ''),
            'department': updated_user.get('department', ''),
            'created_at': updated_user.get('created_at', ''),
            'updated_at': updated_user.get('updated_at', '')
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Update admin profile error: {str(e)}")
        raise HTTPException(status_code=500, detail='Failed to update profile')

@app.get('/api/v1/faculty/profile')
async def get_faculty_profile(
    request: Request,
    user: dict = Depends(require_role(['faculty']))
):
    try:
        user_id = user.get('user_id')
        user_doc = await db.users.find_one({'_id': ObjectId(user_id)}, {'password_hash': 0})
        
        if not user_doc:
            raise HTTPException(status_code=404, detail='User not found')
        
        # Get additional profile data
        profile = {
            'id': str(user_doc['_id']),
            'name': user_doc.get('name', ''),
            'email': user_doc.get('email', ''),
            'role': user_doc.get('role', ''),
            'subjects': user_doc.get('subjects', []),
            'available_slots': user_doc.get('available_slots', []),
            'min_teaching_hours': user_doc.get('min_teaching_hours', 0),
            'created_at': user_doc.get('created_at', '')
        }
        
        return profile
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get faculty profile error: {str(e)}")
        raise HTTPException(status_code=500, detail='Failed to fetch profile')

@app.put('/api/v1/faculty/profile')
async def update_faculty_profile(
    request: Request,
    data: FacultyProfileRequest,
    user: dict = Depends(require_role(['faculty']))
):
    try:
        user_id = user.get('user_id')
        user_doc = await db.users.find_one({'_id': ObjectId(user_id)})
        
        if not user_doc:
            raise HTTPException(status_code=404, detail='User not found')
        
        # Check if email is being changed and if that new email already exists
        if data.email and user_doc['email'] != data.email:
            email_exists = await db.users.find_one({'email': data.email, '_id': {'$ne': ObjectId(user_id)}})
            if email_exists:
                raise HTTPException(status_code=400, detail='Email already exists')
        
        # Build update data only with provided fields
        update_data = {}
        if data.name is not None:
            update_data['name'] = data.name
        if data.email is not None:
            update_data['email'] = data.email
        if data.subjects is not None:
            update_data['subjects'] = data.subjects
        if data.availableSlots is not None:
            # Convert Pydantic models to dict
            update_data['available_slots'] = [slot.model_dump() for slot in data.availableSlots]
        if data.minTeachingHours is not None:
            update_data['min_teaching_hours'] = data.minTeachingHours
        
        if update_data:
            update_data['updated_at'] = datetime.now(timezone.utc).isoformat()
            await db.users.update_one({'_id': ObjectId(user_id)}, {'$set': update_data})
        
        # Get updated user data
        updated_user = await db.users.find_one({'_id': ObjectId(user_id)}, {'password_hash': 0})
        
        return {
            'id': str(updated_user['_id']),
            'name': updated_user.get('name', ''),
            'email': updated_user.get('email', ''),
            'role': updated_user.get('role', ''),
            'subjects': updated_user.get('subjects', []),
            'available_slots': updated_user.get('available_slots', []),
            'min_teaching_hours': updated_user.get('min_teaching_hours', 0),
            'created_at': updated_user.get('created_at', ''),
            'updated_at': updated_user.get('updated_at', '')
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Update faculty profile error: {str(e)}")
        raise HTTPException(status_code=500, detail='Failed to update profile')

@app.get('/api/v1/student/profile')
async def get_student_profile(
    request: Request,
    user: dict = Depends(require_role(['student']))
):
    try:
        user_id = user.get('user_id')
        user_doc = await db.users.find_one({'_id': ObjectId(user_id)}, {'password_hash': 0})
        
        if not user_doc:
            raise HTTPException(status_code=404, detail='User not found')
        
        # Get enrolled courses for student
        enrolled_courses = []
        course_ids = user_doc.get('enrolled_courses', [])
        if course_ids:
            # FIX: Handle the case where course_ids might be invalid
            try:
                courses = await db.courses.find({'_id': {'$in': [ObjectId(cid) for cid in course_ids]}}).to_list(100)
                enrolled_courses = [
                    {
                        'id': str(course['_id']),
                        'name': course.get('name', ''),
                        'code': course.get('code', ''),
                        'credits': course.get('credits', 0)
                    }
                    for course in courses
                ]
            except Exception as e:
                logger.error(f"Error fetching enrolled courses: {str(e)}")
                enrolled_courses = []
        
        # Get additional profile data
        profile = {
            'id': str(user_doc['_id']),
            'name': user_doc.get('name', ''),
            'email': user_doc.get('email', ''),
            'role': user_doc.get('role', ''),
            'enrollment_year': user_doc.get('enrollment_year', ''),
            'courses': enrolled_courses,
            'created_at': user_doc.get('created_at', '')
        }
        
        return profile
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get student profile error: {str(e)}")
        raise HTTPException(status_code=500, detail='Failed to fetch profile')

# Student Course Registration with Preferences
@app.post('/api/v1/student/register-courses')
async def register_courses(
    request: Request,
    user: dict = Depends(require_role(['student']))
):
    try:
        student_id = user.get('user_id')
        req_body = await request.json()
        course_registrations = req_body.get('courses', [])
        
        if not course_registrations:
            raise HTTPException(status_code=400, detail='No course registrations provided')
        
        # Validate each course registration
        for registration in course_registrations:
            if 'course_id' not in registration:
                raise HTTPException(status_code=400, detail='Each registration must include a course_id')
            
            # Validate course exists
            course = await db.courses.find_one({'_id': ObjectId(registration['course_id'])})
            if not course:
                raise HTTPException(status_code=404, detail=f"Course not found: {registration['course_id']}")
            
            # Check if course has a faculty assigned
            if not course.get('faculty_id'):
                raise HTTPException(status_code=400, detail=f"Course {course['name']} has no faculty assigned")
        
        # Store student's course preferences
        await db.student_course_preferences.delete_many({'student_id': student_id})
        
        if course_registrations:
            preference_docs = []
            for registration in course_registrations:
                # Get course details
                course = await db.courses.find_one({'_id': ObjectId(registration['course_id'])})
                
                preference_docs.append({
                    'student_id': student_id,
                    'course_id': registration['course_id'],
                    'course_name': course.get('name', ''),
                    'course_code': course.get('code', ''),
                    'preferred_time': registration.get('preferred_time', ''),
                    'preferred_professor': registration.get('preferred_professor', ''),
                    'priority': registration.get('priority', 1),  # Higher number = higher priority
                    'created_at': datetime.now(timezone.utc).isoformat()
                })
            
            await db.student_course_preferences.insert_many(preference_docs)
        
        return {'message': 'Course preferences registered successfully'}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Register courses error: {str(e)}")
        raise HTTPException(status_code=500, detail='Failed to register course preferences')

# Get student's course preferences
@app.get('/api/v1/student/course-preferences')
async def get_student_course_preferences(
    request: Request,
    user: dict = Depends(require_role(['student']))
):
    try:
        student_id = user.get('user_id')
        
        # Get preferences from database
        preferences = await db.student_course_preferences.find({'student_id': student_id}).to_list(1000)
        
        # Convert ObjectIds to strings
        for pref in preferences:
            pref['_id'] = str(pref['_id'])
            pref['course_id'] = str(pref['course_id'])
        
        return preferences
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get student course preferences error: {str(e)}")
        raise HTTPException(status_code=500, detail='Failed to fetch course preferences')

# Get available faculty for a course
@app.get('/api/v1/courses/{course_id}/faculty')
async def get_course_faculty(
    request: Request,
    course_id: str,
    user: dict = Depends(get_current_user)
):
    try:
        # Validate course ID
        try:
            obj_id = ObjectId(course_id)
        except InvalidId:
            raise HTTPException(status_code=400, detail='Invalid course ID format')
        
        # Check if course exists
        course = await db.courses.find_one({'_id': obj_id})
        if not course:
            raise HTTPException(status_code=404, detail='Course not found')
        
        # Get faculty assigned to this specific course
        # First, check if this course has a faculty_id directly assigned
        if course.get('faculty_id'):
            faculty = await db.users.find_one({'_id': ObjectId(course['faculty_id'])}, {'password_hash': 0})
            if faculty:
                faculty['_id'] = str(faculty['_id'])
                return [faculty]
        
        # If no direct faculty assignment, check faculty preferences for this course
        faculty_preferences = await db.faculty_preferences.find({'course_id': course_id}).to_list(1000)
        
        if not faculty_preferences:
            return []  # No faculty assigned to this course
        
        # Get unique faculty IDs from preferences
        faculty_ids = list(set([ObjectId(pref['faculty_id']) for pref in faculty_preferences]))
        
        # Get faculty details
        faculty = await db.users.find({'_id': {'$in': faculty_ids}}, {'password_hash': 0}).to_list(1000)
        
        # Convert ObjectIds to strings
        for fac in faculty:
            fac['_id'] = str(fac['_id'])
        
        return faculty
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get course faculty error: {str(e)}")
        raise HTTPException(status_code=500, detail='Failed to fetch course faculty')

# Update the generate_student_timetable function
@app.post('/api/v1/timetable/generate-student')
async def generate_student_timetable(
    request: Request,
    background_tasks: BackgroundTasks,
    user: dict = Depends(require_role(['student']))
):
    try:
        if not OPENROUTER_API_KEY:
            raise HTTPException(status_code=500, detail='AI generation service is not configured')

        # 1. Get student's selected course IDs from the request body
        req_body = await request.json()
        selected_course_ids = req_body.get('courseIds', [])
        
        if not selected_course_ids:
            raise HTTPException(status_code=400, detail='No course IDs provided')

        # 2. Convert string IDs to ObjectId and fetch selected courses
        selected_course_object_ids = [ObjectId(cid) for cid in selected_course_ids]
        selected_courses_cursor = db.courses.find({'_id': {'$in': selected_course_object_ids}})
        selected_courses = await selected_courses_cursor.to_list(length=None)
        
        if not selected_courses:
            raise HTTPException(status_code=404, detail='Selected courses not found')

        # 3. Fetch all necessary data for AI prompt
        all_faculty = await db.users.find({'role': 'faculty'}, {'password_hash': 0}).to_list(length=None)
        all_rooms = await db.rooms.find({}).to_list(length=None)
        base_timetable = await db.base_timetables.find_one(sort=[('created_at', -1)])
        
        # Get student's course preferences
        student_id = user.get('user_id')
        student_preferences = await db.student_course_preferences.find({'student_id': student_id}).to_list(1000)
        
        # Get existing timetables to check for already scheduled courses
        existing_timetables = await db.timetables.find({
            'student_id': {'$ne': None}
        }).to_list(1000)
        
        # Create a map of existing course schedules
        existing_course_schedules = {}
        for timetable in existing_timetables:
            for slot in timetable.get('schedule', []):
                course_id = slot.get('course_id')
                if course_id:
                    if course_id not in existing_course_schedules:
                        existing_course_schedules[course_id] = []
                    existing_course_schedules[course_id].append({
                        'day': slot.get('day'),
                        'time': slot.get('time'),
                        'room_id': slot.get('room_id'),
                        'room_name': slot.get('room_name'),
                        'room_capacity': 0  # We'll populate this later
                    })
        
        # Add room capacity info to existing schedules
        for course_id, schedules in existing_course_schedules.items():
            for schedule in schedules:
                room = await db.rooms.find_one({'_id': ObjectId(schedule['room_id'])})
                if room:
                    schedule['room_capacity'] = room.get('capacity', 0)
                    schedule['current_students'] = await db.timetables.count_documents({
                        'schedule': {
                            '$elemMatch': {
                                'course_id': course_id,
                                'room_id': schedule['room_id'],
                                'day': schedule['day'],
                                'time': schedule['time']
                            }
                        }
                    })

        # 4. Prepare data for AI prompt
        courses_data_for_ai = []
        unassigned_courses = []
        
        for course in selected_courses:
            # Check if course has a faculty assigned
            if not course.get('faculty_id'):
                # Check if there are any faculty preferences for this course
                faculty_prefs = await db.faculty_preferences.find({'course_id': str(course['_id'])}).to_list(1000)
                if not faculty_prefs:
                    unassigned_courses.append({
                        'name': course['name'],
                        'code': course['code'],
                        'reason': 'No faculty assigned to this course'
                    })
                    continue
            
            course_info = {
                'id': str(course['_id']),
                'name': course['name'],
                'code': course['code'],
                'credits': course['credits'],
                'category': course['category'],
                'duration_hours': course.get('duration_hours', 1),
                'is_lab': course.get('is_lab', False),
                'faculty_id': str(course.get('faculty_id')) if course.get('faculty_id') else None
            }
            
            # Add student preferences for this course
            student_pref = next((pref for pref in student_preferences if pref['course_id'] == str(course['_id'])), None)
            if student_pref:
                course_info['preferred_time'] = student_pref.get('preferred_time', '')
                course_info['preferred_professor'] = student_pref.get('preferred_professor', '')
                course_info['priority'] = student_pref.get('priority', 1)
            
            # Add existing schedule info if available
            if course_info['id'] in existing_course_schedules:
                course_info['existing_schedules'] = existing_course_schedules[course_info['id']]
            
            courses_data_for_ai.append(course_info)

        # If no courses have faculty assigned, return an error
        if len(courses_data_for_ai) == 0:
            return {
                'schedule': [],
                'summary': 'None of the selected courses have faculty assigned. Please select different courses or contact the administrator.',
                'unassigned_courses': unassigned_courses
            }

        faculty_data_for_ai = []
        for fac in all_faculty:
            faculty_data_for_ai.append({
                'id': str(fac['_id']),
                'name': fac['name'],
                'email': fac['email']
            })

        rooms_data_for_ai = []
        for room in all_rooms:
            rooms_data_for_ai.append({
                'id': str(room['_id']),
                'name': room['name'],
                'capacity': room['capacity'],
                'type': room['type']
            })

        # 5. Create the detailed AI prompt
        base_timetable_json = json.dumps(base_timetable, default=str, indent=2) if base_timetable else "{}"
        
        prompt = f"""
You are a university timetable scheduling expert. Generate a personalized weekly timetable for a single student following NEP 2020 guidelines.

STUDENT'S SELECTED COURSES:
{json.dumps(courses_data_for_ai, indent=2)}

ALL AVAILABLE FACULTY:
{json.dumps(faculty_data_for_ai, indent=2)}

ALL AVAILABLE ROOMS:
{json.dumps(rooms_data_for_ai, indent=2)}

BASE TIMETABLE STRUCTURE:
{base_timetable_json}

SCHEDULING CONSTRAINTS:
1. FACULTY ASSIGNMENT:
   - Only schedule courses that have a faculty assigned.
   - A professor cannot be assigned to two different courses at the same time.
   - If a student has a preferred professor for a course, try to accommodate that preference.

2. ROOM ALLOCATION:
   - For each course, find the best available room based on capacity.
   - If multiple rooms have sufficient capacity, prioritize rooms that are closest to full.
   - If a room is at full capacity, look for a larger room with available capacity.
   - If there's a larger room with available space, consider switching both classes to optimize room usage.
   - Lab courses must be scheduled in rooms with type 'lab'.
   - Theory courses must be scheduled in rooms with type 'classroom' or 'auditorium'.

3. COURSE PREFERENCES:
   - Try to accommodate student's preferred time slots for courses.
   - Higher priority courses should be scheduled first.
   - If a course is already scheduled for other students, try to place this student in the same slot if possible.

4. COURSE DURATION:
   - A course with 'duration_hours' > 1 must span multiple consecutive time slots.
   - A 1-hour course occupies 1 slot.
   - A 2-hour lab course occupies 2 consecutive slots.

TASK:
Generate a JSON weekly schedule that assigns ONLY the student's selected courses to valid time slots, respecting all constraints above.

OUTPUT FORMAT:
Return ONLY a single JSON object with two keys: "schedule" and "summary".
The "schedule" key must contain a list of objects. Each object represents one scheduled class and must have these keys:
- "day": "Monday", "Tuesday", etc.
- "time": "9:00 AM - 10:00 AM"
- "course_id": "..."
- "course_name": "..."
- "course_code": "..."
- "room_id": "..."
- "room_name": "..."
- "faculty_id": "..."
- "faculty_name": "..."

The "summary" key should contain a brief text summary of the generated timetable.
If a course has no assigned faculty, include a note in the summary.
Do not use markdown formatting. Return only the raw JSON object.
"""

        # 6. Call the AI
        try:
            response = requests.post(
                url="https://openrouter.ai/api/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                    "Content-Type": "application/json",
                },
                data=json.dumps({
                    "model": OPENROUTER_MODEL,
                    "messages": [
                        {
                            "role": "user",
                            "content": prompt
                        }
                    ]
                }),
                timeout=None
            )

            if response.status_code != 200:
                logger.error(f"OpenRouter API error: {response.status_code} - {response.text}")
                raise HTTPException(status_code=500, detail='Failed to generate timetable')

            # 7. Parse and save the AI's response
            try:
                response_text = response.json()['choices'][0]['message']['content']
                if response_text.startswith('```json'):
                    response_text = response_text[7:]
                if response_text.startswith('```'):
                    response_text = response_text[3:]
                if response_text.endswith('```'):
                    response_text = response_text[:-3]
                
                timetable_data = json.loads(response_text.strip())
            except (json.JSONDecodeError, KeyError) as e:
                logger.error(f"JSON decode error: {str(e)}")
                logger.error(f"AI Response: {response_text}")
                raise HTTPException(status_code=500, detail='Failed to parse AI response')

            # 8. Save the generated timetable to the database
            timetable_record = {
                'schedule': timetable_data.get('schedule', []),
                'summary': timetable_data.get('summary', 'AI-generated timetable'),
                'generated_at': datetime.now(timezone.utc).isoformat(),
                'generated_by': user.get('user_id'),
                'student_id': user.get('user_id'),
                'unassigned_courses': unassigned_courses
            }
            
            result = await db.timetables.insert_one(timetable_record)
            timetable_record['_id'] = str(result.inserted_id)

            return timetable_record

        except requests.exceptions.RequestException as e:
            logger.error(f"Request to OpenRouter failed: {str(e)}")
            raise HTTPException(status_code=500, detail='Failed to connect to AI service')
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Generate student timetable error: {str(e)}")
        raise HTTPException(status_code=500, detail=f'Failed to generate timetable: {str(e)}')

@app.put('/api/v1/student/profile')
async def update_student_profile(
    request: Request,
    data: StudentProfileRequest,
    user: dict = Depends(require_role(['student']))
):
    try:
        user_id = user.get('user_id')
        user_doc = await db.users.find_one({'_id': ObjectId(user_id)})
        
        if not user_doc:
            raise HTTPException(status_code=404, detail='User not found')
        
        # Check if email is being changed and if that new email already exists
        if data.email and user_doc['email'] != data.email:
            email_exists = await db.users.find_one({'email': data.email, '_id': {'$ne': ObjectId(user_id)}})
            if email_exists:
                raise HTTPException(status_code=400, detail='Email already exists')
        
        # Build update data only with provided fields
        update_data = {}
        if data.name is not None:
            update_data['name'] = data.name
        if data.email is not None:
            update_data['email'] = data.email
        if data.enrollmentYear is not None:
            update_data['enrollment_year'] = data.enrollmentYear
        
        if update_data:
            update_data['updated_at'] = datetime.now(timezone.utc).isoformat()
            await db.users.update_one({'_id': ObjectId(user_id)}, {'$set': update_data})
        
        # Get updated user data
        updated_user = await db.users.find_one({'_id': ObjectId(user_id)}, {'password_hash': 0})
        
        # Get enrolled courses for student
        enrolled_courses = []
        course_ids = updated_user.get('enrolled_courses', [])
        if course_ids:
            # FIX: Handle the case where course_ids might be invalid
            try:
                courses = await db.courses.find({'_id': {'$in': [ObjectId(cid) for cid in course_ids]}}).to_list(100)
                enrolled_courses = [
                    {
                        'id': str(course['_id']),
                        'name': course.get('name', ''),
                        'code': course.get('code', ''),
                        'credits': course.get('credits', 0)
                    }
                    for course in courses
                ]
            except Exception as e:
                logger.error(f"Error fetching enrolled courses: {str(e)}")
                enrolled_courses = []
        
        return {
            'id': str(updated_user['_id']),
            'name': updated_user.get('name', ''),
            'email': updated_user.get('email', ''),
            'role': updated_user.get('role', ''),
            'enrollment_year': updated_user.get('enrollment_year', ''),
            'courses': enrolled_courses,
            'created_at': updated_user.get('created_at', ''),
            'updated_at': updated_user.get('updated_at', '')
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Update student profile error: {str(e)}")
        raise HTTPException(status_code=500, detail='Failed to update profile')

@app.get('/api/v1/health')
async def health_check(request: Request):
    return {'status': 'healthy', 'timestamp': datetime.now(timezone.utc).isoformat()}

# Custom OpenAPI schema
def custom_openapi():
    if app.openapi_schema:
        return app.openapi_schema
    openapi_schema = get_openapi(
        title="FlexiSched API",
        version="1.0.0",
        description="API for NEP 2020 compliant university timetable scheduling system",
        routes=app.routes,
    )
    app.openapi_schema = openapi_schema
    return app.openapi_schema

if __name__ == '__main__':
    import uvicorn
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
        reload=IS_DEVELOPMENT,
        log_level="debug" if IS_DEVELOPMENT else "info"
    )