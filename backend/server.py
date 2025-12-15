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
        
        logger.info("Database indexes created successfully")
    except Exception as e:
        logger.error(f"Error creating indexes: {str(e)}")

# Initialize seed data
async def initialize_seed_data():
    try:
        # Check if admin user exists
        admin_exists = await db.users.find_one({'email': 'admin@flexisched.com'})
        
        # Only clear and recreate data if admin doesn't exist
        if not admin_exists:
            logger.info("Admin user not found. Creating all seed data.")
            # Clear existing data
            await db.users.delete_many({})
            await db.courses.delete_many({})
            await db.rooms.delete_many({})
            await db.base_timetables.delete_many({})
            await db.timetables.delete_many({})
            await db.settings.delete_many({})
            await db.faculty_preferences.delete_many({})
            
            # Create admin user
            admin = {
                'email': 'admin@flexisched.com',
                'password_hash': hash_password('admin123'),
                'name': 'Admin User',
                'role': 'admin',
                'created_at': datetime.now(timezone.utc).isoformat()
            }
            await db.users.insert_one(admin)
            
            # Create faculty
            faculty_users = [
                {'email': 'dr.smith@univ.edu', 'name': 'Dr. John Smith', 'password_hash': hash_password('faculty123'), 'role': 'faculty'},
                {'email': 'dr.patel@univ.edu', 'name': 'Dr. Priya Patel', 'password_hash': hash_password('faculty123'), 'role': 'faculty'},
                {'email': 'dr.kumar@univ.edu', 'name': 'Dr. Raj Kumar', 'password_hash': hash_password('faculty123'), 'role': 'faculty'},
                {'email': 'dr.wong@univ.edu', 'name': 'Dr. Lisa Wong', 'password_hash': hash_password('faculty123'), 'role': 'faculty'},
            ]
            
            for fac in faculty_users:
                fac['created_at'] = datetime.now(timezone.utc).isoformat()
                await db.users.insert_one(fac)
            
            # Create students
            student_users = [
                {'email': 'student1@univ.edu', 'name': 'Alice Johnson', 'password_hash': hash_password('student123'), 'role': 'student'},
                {'email': 'student2@univ.edu', 'name': 'Bob Williams', 'password_hash': hash_password('student123'), 'role': 'student'},
                {'email': 'student3@univ.edu', 'name': 'Carol Davis', 'password_hash': hash_password('student123'), 'role': 'student'},
            ]
            
            for stu in student_users:
                stu['created_at'] = datetime.now(timezone.utc).isoformat()
                await db.users.insert_one(stu)
            
            # Create rooms
            rooms = [
                {'name': 'Room 101', 'capacity': 60, 'type': 'classroom'},
                {'name': 'Room 102', 'capacity': 60, 'type': 'classroom'},
                {'name': 'Room 103', 'capacity': 50, 'type': 'classroom'},
                {'name': 'Lab A', 'capacity': 40, 'type': 'lab'},
                {'name': 'Lab B', 'capacity': 40, 'type': 'lab'},
                {'name': 'Auditorium', 'capacity': 200, 'type': 'auditorium'},
            ]
            
            for room in rooms:
                room['created_at'] = datetime.now(timezone.utc).isoformat()
                await db.rooms.insert_one(room)
            
            # Create courses
            courses = [
                {'name': 'Data Structures', 'code': 'CS201', 'credits': 4, 'category': 'Major', 'duration_hours': 1, 'is_lab': False},
                {'name': 'Data Structures Lab', 'code': 'CS201L', 'credits': 2, 'category': 'Major', 'duration_hours': 2, 'is_lab': True},
                {'name': 'Database Management Systems', 'code': 'CS301', 'credits': 4, 'category': 'Major', 'duration_hours': 1, 'is_lab': False},
                {'name': 'Web Development', 'code': 'CS302', 'credits': 3, 'category': 'Minor', 'duration_hours': 1, 'is_lab': False},
                {'name': 'Machine Learning', 'code': 'CS401', 'credits': 4, 'category': 'Major', 'duration_hours': 1, 'is_lab': False},
                {'name': 'Cyber Security', 'code': 'CS303', 'credits': 3, 'category': 'SEC', 'duration_hours': 1, 'is_lab': False},
                {'name': 'Communication Skills', 'code': 'ENG101', 'credits': 2, 'category': 'AEC', 'duration_hours': 1, 'is_lab': False},
                {'name': 'Environmental Studies', 'code': 'ENV101', 'credits': 2, 'category': 'VAC', 'duration_hours': 1, 'is_lab': False},
            ]
            
            for course in courses:
                course['created_at'] = datetime.now(timezone.utc).isoformat()
                await db.courses.insert_one(course)
            
            # Create base timetable structure as default
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
            
            logger.info("All seed data created successfully")
        else:
            # Admin exists, but let's verify other critical data exists
            logger.info("Admin user exists. Verifying other seed data.")
            
            # Check if base timetable exists
            base_timetable = await db.base_timetables.find_one()
            if not base_timetable:
                # Create base timetable structure as default
                base_timetable = {
                    'startTime': '09:00',
                    'endTime': '17:00',
                    'classDuration': '1',
                    'lunchBreakDuration': '1',
                    'days': ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
                    'created_at': datetime.now(timezone.utc).isoformat()
                }
                await db.base_timetables.insert_one(base_timetable)
                logger.info("Base timetable created")
            
            # Check if credit limits exist
            credit_limits = await db.settings.find_one({'key': 'credit_limits'})
            if not credit_limits:
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
                logger.info("Credit limits created")
            
            # Check if rooms exist
            room_count = await db.rooms.count_documents({})
            if room_count == 0:
                rooms = [
                    {'name': 'Room 101', 'capacity': 60, 'type': 'classroom'},
                    {'name': 'Room 102', 'capacity': 60, 'type': 'classroom'},
                    {'name': 'Room 103', 'capacity': 50, 'type': 'classroom'},
                    {'name': 'Lab A', 'capacity': 40, 'type': 'lab'},
                    {'name': 'Lab B', 'capacity': 40, 'type': 'lab'},
                    {'name': 'Auditorium', 'capacity': 200, 'type': 'auditorium'},
                ]
                for room in rooms:
                    room['created_at'] = datetime.now(timezone.utc).isoformat()
                    await db.rooms.insert_one(room)
                logger.info("Rooms created")
            
            # Check if courses exist
            course_count = await db.courses.count_documents({})
            if course_count == 0:
                courses = [
                    {'name': 'Data Structures', 'code': 'CS201', 'credits': 4, 'category': 'Major', 'duration_hours': 1, 'is_lab': False},
                    {'name': 'Data Structures Lab', 'code': 'CS201L', 'credits': 2, 'category': 'Major', 'duration_hours': 2, 'is_lab': True},
                    {'name': 'Database Management Systems', 'code': 'CS301', 'credits': 4, 'category': 'Major', 'duration_hours': 1, 'is_lab': False},
                    {'name': 'Web Development', 'code': 'CS302', 'credits': 3, 'category': 'Minor', 'duration_hours': 1, 'is_lab': False},
                    {'name': 'Machine Learning', 'code': 'CS401', 'credits': 4, 'category': 'Major', 'duration_hours': 1, 'is_lab': False},
                    {'name': 'Cyber Security', 'code': 'CS303', 'credits': 3, 'category': 'SEC', 'duration_hours': 1, 'is_lab': False},
                    {'name': 'Communication Skills', 'code': 'ENG101', 'credits': 2, 'category': 'AEC', 'duration_hours': 1, 'is_lab': False},
                    {'name': 'Environmental Studies', 'code': 'ENV101', 'credits': 2, 'category': 'VAC', 'duration_hours': 1, 'is_lab': False},
                ]
                for course in courses:
                    course['created_at'] = datetime.now(timezone.utc).isoformat()
                    await db.courses.insert_one(course)
                logger.info("Courses created")

            logger.info("Seed data verification complete.")
        
    except Exception as e:
        logger.error(f"Seed error: {str(e)}")

# Lifespan context manager
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await create_indexes()
    await initialize_seed_data()
    
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
    data: RegisterRequest,  # Reuse the RegisterRequest model from auth
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
        timetable = await db.timetables.find_one(sort=[('generated_at', -1)])
        
        if not timetable:
            return {'schedule': [], 'pagination': {'page': page, 'size': size, 'total': 0, 'pages': 0}}
        
        # Filter schedule for this faculty
        faculty_schedule = [
            slot for slot in timetable.get('schedule', [])
            if slot.get('faculty_id') == faculty_id
        ]
        
        # Paginate schedule
        total = len(faculty_schedule)
        skip = (page - 1) * size
        paginated_schedule = faculty_schedule[skip:skip + size]
        
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
        # For now, return the full timetable
        # In production, this would filter by student's enrolled courses
        timetable = await db.timetables.find_one(sort=[('generated_at', -1)])
        
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
        
        # Get enrolled courses for the student
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

        # 2. Fetch all necessary data
        # Convert string IDs to ObjectId
        selected_course_object_ids = [ObjectId(cid) for cid in selected_course_ids]
        
        # Fetch only the selected courses
        selected_courses_cursor = db.courses.find({'_id': {'$in': selected_course_object_ids}})
        selected_courses = await selected_courses_cursor.to_list(length=None)
        
        if not selected_courses:
            raise HTTPException(status_code=404, detail='Selected courses not found')

        # Fetch all faculty and rooms for availability checks
        all_faculty = await db.users.find({'role': 'faculty'}, {'password_hash': 0}).to_list(length=None)
        all_rooms = await db.rooms.find({}).to_list(length=None)
        base_timetable = await db.base_timetables.find_one(sort=[('created_at', -1)])

        # 3. Prepare data for the AI prompt
        courses_data_for_ai = []
        for course in selected_courses:
            courses_data_for_ai.append({
                'id': str(course['_id']),  # FIXED: Convert ObjectId to string
                'name': course['name'],
                'code': course['code'],
                'credits': course['credits'],
                'category': course['category'],
                'duration_hours': course.get('duration_hours', 1),
                'is_lab': course.get('is_lab', False),
            })

        faculty_data_for_ai = []
        for fac in all_faculty:
            faculty_data_for_ai.append({
                'id': str(fac['_id']),  # FIXED: Convert ObjectId to string
                'name': fac['name'],
                'email': fac['email']
            })

        rooms_data_for_ai = []
        for room in all_rooms:
            rooms_data_for_ai.append({
                'id': str(room['_id']),  # FIXED: Convert ObjectId to string
                'name': room['name'],
                'capacity': room['capacity'],
                'type': room['type']
            })

        # 4. Create the detailed AI prompt
        # Handle case where base_timetable might be None
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
1. CLASH-FREE SCHEDULE:
   - A professor cannot be assigned to two different courses at the same time
   - A room cannot be assigned to two different courses at the same time
   - Lab courses must be scheduled in rooms with type 'lab'
   - Theory courses must be scheduled in rooms with type 'classroom' or 'auditorium'

2. COURSE DURATION:
   - A course with 'duration_hours' > 1 must span multiple consecutive time slots
   - A 1-hour course occupies 1 slot
   - A 2-hour lab course occupies 2 consecutive slots

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
Do not use markdown formatting. Return only the raw JSON object.
"""

        # 5. Call the AI
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

            # 6. Parse and save the AI's response
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

            # 7. Save the generated timetable to the database
            timetable_record = {
                'schedule': timetable_data.get('schedule', []),
                'summary': timetable_data.get('summary', 'AI-generated timetable'),
                'generated_at': datetime.now(timezone.utc).isoformat(),
                'generated_by': user.get('user_id'),
                'student_id': user.get('user_id'), # Link to the student
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
        
        # Get enrolled courses for the student
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
        reload=IS_DEVELOPMENT,
        log_level="debug" if IS_DEVELOPMENT else "info"
    )