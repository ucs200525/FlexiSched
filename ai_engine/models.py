from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from enum import Enum

class CourseType(str, Enum):
    THEORY = "theory"
    LABORATORY = "laboratory"
    TUTORIAL = "tutorial"
    PROJECT = "project"
    SEMINAR = "seminar"

class OptimizationObjective(str, Enum):
    MINIMIZE_CONFLICTS = "minimize_conflicts"
    BALANCE_WORKLOAD = "balance_workload"
    MAXIMIZE_UTILIZATION = "maximize_utilization"
    MINIMIZE_GAPS = "minimize_gaps"

class TimeSlot(BaseModel):
    day: str = Field(..., description="Day of the week")
    start_time: str = Field(..., description="Start time (HH:MM format)")
    end_time: str = Field(..., description="End time (HH:MM format)")
    duration: int = Field(..., description="Duration in minutes")

class Course(BaseModel):
    id: str
    course_code: str
    course_name: str
    credits: int
    course_type: CourseType
    expected_students: int
    requires_consecutive_slots: bool = False
    preferred_time_slots: List[str] = []
    excluded_time_slots: List[str] = []

class Faculty(BaseModel):
    id: str
    name: str
    email: str
    expertise: List[str] = []
    max_hours_per_week: int = Field(default=40, description="Maximum teaching hours per week")
    preferred_days: List[str] = []
    unavailable_slots: List[str] = []
    current_workload: int = 0

class Room(BaseModel):
    id: str
    room_number: str
    room_name: str
    capacity: int
    room_type: str
    equipment: List[str] = []
    unavailable_slots: List[str] = []

class Student(BaseModel):
    id: str
    student_id: str
    name: str
    program: str
    semester: int
    enrolled_courses: List[str] = []

class TimetableConstraints(BaseModel):
    max_hours_per_day: int = Field(default=8, description="Maximum hours per day")
    min_break_duration: int = Field(default=15, description="Minimum break duration in minutes")
    lunch_break_duration: int = Field(default=60, description="Lunch break duration in minutes")
    lunch_break_start: str = Field(default="12:00", description="Lunch break start time")
    consecutive_lab_slots: bool = Field(default=True, description="Lab sessions need consecutive slots")
    max_consecutive_hours: int = Field(default=3, description="Maximum consecutive hours for a subject")

class OptimizationRequest(BaseModel):
    courses: List[Course]
    faculty: List[Faculty]
    rooms: List[Room]
    students: List[Student]
    time_slots: List[TimeSlot]
    constraints: TimetableConstraints
    objectives: List[OptimizationObjective] = [OptimizationObjective.MINIMIZE_CONFLICTS]
    program: str
    semester: int
    batch: str
    academic_year: str

class TimetableSlot(BaseModel):
    course_id: str
    faculty_id: str
    room_id: str
    day: str
    start_time: str
    end_time: str
    duration: int
    student_ids: List[str] = []

class OptimizationResult(BaseModel):
    success: bool
    timetable_slots: List[TimetableSlot] = []
    conflicts: List[Dict[str, Any]] = []
    optimization_score: float = 0.0
    faculty_workload: Dict[str, int] = {}
    room_utilization: Dict[str, float] = {}
    warnings: List[str] = []
    execution_time: float = 0.0
    algorithm_used: str = ""

class ConflictType(str, Enum):
    FACULTY_CLASH = "faculty_clash"
    ROOM_CLASH = "room_clash"
    STUDENT_CLASH = "student_clash"
    CAPACITY_OVERFLOW = "capacity_overflow"
    TIME_CONSTRAINT_VIOLATION = "time_constraint_violation"

class Conflict(BaseModel):
    type: ConflictType
    description: str
    affected_slots: List[TimetableSlot]
    severity: str = Field(default="medium", description="high, medium, low")
    suggestions: List[str] = []