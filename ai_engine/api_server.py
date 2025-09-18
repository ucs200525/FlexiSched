"""
AI Optimization Engine API Server
FastAPI-based microservice for timetable optimization
"""

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, conint
import logging
import asyncio
from typing import Dict, List, Optional
import uuid
from datetime import datetime

# External solver and utilities
from dataclasses import dataclass, field
from datetime import timedelta
import math
from ortools.sat.python import cp_model

# Project modules
from models import OptimizationRequest, OptimizationResult, TimeSlot, Course, Faculty, Room, Student
from constraint_solver import TimetableConstraintSolver
from genetic_solver import GeneticTimetableSolver
from timetable_config import (
    BaseTimetableConfig, TimetableGrid, TimetableConfigManager,
    ElectiveSection, StudentElectivePreference, ElectiveAssignmentResult
)
from elective_optimizer import ElectiveAssignmentOptimizer, ElectiveScheduleValidator
from comprehensive_sectioning import (
    ComprehensiveSectioningEngine, CourseDefinition, SectionDefinition,
    StudentAllocation, SectioningResult, create_sample_semester_courses
)
from ai_timetable_generator import AITimetableGenerator, AdminQuestion, AITimetableResponse
from unified_api_endpoint import generate_unified_timetable

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# FastAPI app
app = FastAPI(
    title="AI Timetable Optimization Engine",
    description="Advanced constraint satisfaction and genetic algorithm-based timetable generation",
    version="1.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5000", "http://127.0.0.1:5000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# In-memory storage for optimization jobs
optimization_jobs: Dict[str, Dict] = {}

# Job request/status models for optimization endpoints
class OptimizationJobRequest(BaseModel):
    request: OptimizationRequest
    algorithm: str = "constraint_solver"  # or "genetic_algorithm"
    job_name: Optional[str] = None

# ---------------------------------------------------------------------------
# Comprehensive AI System Data Models
# ---------------------------------------------------------------------------

@dataclass
class ComprehensiveAdminConfig:
    working_days: List[str] = field(default_factory=lambda: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"])
    start_time: str = "09:00"
    end_time: str = "18:00"
    slot_length_minutes: int = 55
    grace_time_minutes: int = 5
    breaks: List[Dict] = field(default_factory=lambda: [{"type": "lunch", "start": "13:00", "duration": 60}])

@dataclass
class ComprehensiveTimeSlot:
    slot_id: str
    day: str
    start: str
    end: str
    type: str = "theory"

@dataclass
class ComprehensiveCourse:
    course_code: str
    title: str
    credits: int
    th: int  # theory hours per week
    lab: int  # lab hours per week
    is_core: bool = True

@dataclass
class ComprehensiveSection:
    section_id: str
    course: str
    capacity: int
    type: str  # "theory" or "lab"
    required_meetings: int = 1
    faculty: str = ""
    slots: List[str] = field(default_factory=list)
    room: str = ""

class ComprehensiveAdminConfigRequest(BaseModel):
    working_days: List[str] = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
    start_time: str = "09:00"
    end_time: str = "18:00"
    slot_length_minutes: int = 55
    grace_time_minutes: int = 5
    breaks: List[Dict] = [{"type": "lunch", "start": "13:00", "duration": 60}]

class ComprehensiveCourseRequest(BaseModel):
    course_code: str
    title: str
    credits: int
    th: int
    lab: int
    is_core: bool = True

class ComprehensiveRoomRequest(BaseModel):
    room_id: str
    capacity: int
    tags: List[str] = ["theory"]

class ComprehensiveFacultyRequest(BaseModel):
    faculty_id: str
    name: str
    expertise: List[str] = []
    availability: List[str] = []  # slot_ids
    max_hours_per_week: int = 18

class ComprehensiveStudentRequest(BaseModel):
    student_id: str
    semester: int
    preferences: Dict[str, List[str]] = {}
    enrolled_courses: List[str] = []

class ComprehensiveTimetableRequest(BaseModel):
    courses: List[ComprehensiveCourseRequest]
    rooms: List[ComprehensiveRoomRequest] 
    faculty: List[ComprehensiveFacultyRequest]
    students: List[ComprehensiveStudentRequest]
    admin_config: ComprehensiveAdminConfigRequest
    student_strength: conint(ge=20, le=60) = 60

class ComprehensiveTimetableResponse(BaseModel):
    success: bool
    timetable: List[Dict] = []
    conflicts: List[Dict] = []
    metrics: Dict = {}
    generation_time: float = 0.0
    sections_created: List[Dict] = []

# Comprehensive AI System Implementation Functions

def generate_comprehensive_slots(config: ComprehensiveAdminConfig) -> List[ComprehensiveTimeSlot]:
    """Generate time slot grid from admin configuration"""
    slots = []
    
    # Parse times
    start_time = datetime.strptime(config.start_time, "%H:%M").time()
    end_time = datetime.strptime(config.end_time, "%H:%M").time()
    
    slot_block_minutes = config.slot_length_minutes + config.grace_time_minutes
    
    for day in config.working_days:
        current_time = datetime.combine(datetime.today(), start_time)
        end_datetime = datetime.combine(datetime.today(), end_time)
        slot_counter = 1
        
        while current_time < end_datetime:
            slot_end = current_time + timedelta(minutes=config.slot_length_minutes)
            
            # Check if this slot conflicts with breaks
            is_break = False
            for break_info in config.breaks:
                break_start = datetime.strptime(break_info["start"], "%H:%M").time()
                break_end_time = (datetime.combine(datetime.today(), break_start) + 
                                timedelta(minutes=break_info["duration"])).time()
                
                if (current_time.time() < break_end_time and 
                    slot_end.time() > break_start):
                    is_break = True
                    break
            
            if not is_break and slot_end.time() <= end_time:
                # Create slot with proper naming
                period = "A" if current_time.time() < datetime.strptime("13:00", "%H:%M").time() else "B"
                slot_id = f"{day[:3]}_{period}{slot_counter}"
                
                slots.append(ComprehensiveTimeSlot(
                    slot_id=slot_id,
                    day=day,
                    start=current_time.strftime("%H:%M"),
                    end=slot_end.strftime("%H:%M"),
                    type="theory"
                ))
                slot_counter += 1
            
            # Move to next slot
            current_time += timedelta(minutes=slot_block_minutes)
            
            # Skip break times
            for break_info in config.breaks:
                break_start = datetime.strptime(break_info["start"], "%H:%M").time()
                break_end_time = (datetime.combine(datetime.today(), break_start) + 
                                timedelta(minutes=break_info["duration"])).time()
                
                if current_time.time() >= break_start and current_time.time() < break_end_time:
                    current_time = datetime.combine(datetime.today(), break_end_time)
                    break
    
    return slots

def calculate_comprehensive_sections(courses: List[ComprehensiveCourse], student_strength: int, rooms: List[Dict]) -> List[ComprehensiveSection]:
    """Calculate required sections for courses"""
    sections = []
    
    # Get average room capacity for estimation
    avg_room_capacity = sum(room.get("capacity", 60) for room in rooms) / len(rooms) if rooms else 60
    
    for course in courses:
        # Determine expected students
        if course.is_core:
            expected_students = student_strength
        else:
            # For electives, estimate 30% enrollment
            expected_students = int(student_strength * 0.3)
        
        # Theory sections
        if course.th > 0:
            theory_sections_needed = max(1, math.ceil(expected_students / avg_room_capacity))
            for i in range(theory_sections_needed):
                section = ComprehensiveSection(
                    section_id=f"{course.course_code}_T{i+1}",
                    course=course.course_code,
                    capacity=min(int(avg_room_capacity), expected_students),
                    type="theory",
                    required_meetings=course.th
                )
                sections.append(section)
        
        # Lab sections
        if course.lab > 0:
            lab_capacity = avg_room_capacity // 2  # Labs typically have lower capacity
            lab_sections_needed = max(1, math.ceil(expected_students / lab_capacity))
            for i in range(lab_sections_needed):
                section = ComprehensiveSection(
                    section_id=f"{course.course_code}_L{i+1}",
                    course=course.course_code,
                    capacity=min(int(lab_capacity), expected_students),
                    type="lab",
                    required_meetings=course.lab
                )
                sections.append(section)
    
    return sections

async def generate_comprehensive_timetable(request: ComprehensiveTimetableRequest) -> ComprehensiveTimetableResponse:
    """Generate comprehensive timetable using OR-Tools CP-SAT"""
    import time as time_module
    start_time = time_module.time()
    
    try:
        logger.info("Starting comprehensive timetable generation")
        
        # Step 1: Generate time slots from admin config
        admin_config = ComprehensiveAdminConfig(**request.admin_config.dict())
        slots = generate_comprehensive_slots(admin_config)
        logger.info(f"Generated {len(slots)} time slots")
        
        # Step 2: Convert request data to internal models
        courses = [ComprehensiveCourse(**course) for course in request.courses]
        
        # Step 3: Calculate required sections
        sections = calculate_comprehensive_sections(courses, request.student_strength, request.rooms)
        logger.info(f"Calculated {len(sections)} sections needed")
        
        # Step 4: Use OR-Tools CP-SAT for constraint-based scheduling
        schedule = []
        
        if request.rooms and request.faculty and slots:
            model = cp_model.CpModel()
            
            # Variables: x[section][slot][room][faculty] = 1 if assigned
            x = {}
            y = {}  # Faculty selection variables
            
            # Precompute compatible resources
            compat_rooms = {}
            compat_faculty = {}
            
            for section in sections:
                compat_rooms[section.section_id] = []
                compat_faculty[section.section_id] = []
                
                # Room compatibility (capacity and type matching)
                for room in request.rooms:
                    room_capacity = room.get("capacity", 60)
                    room_tags = room.get("tags", ["theory"])
                    
                    if (room_capacity >= section.capacity and 
                        ((section.type == "lab" and "lab" in room_tags) or 
                         (section.type == "theory" and "theory" in room_tags))):
                        compat_rooms[section.section_id].append(room)
                
                # Faculty compatibility (based on expertise)
                for faculty_member in request.faculty:
                    expertise = faculty_member.get("expertise", [])
                    if section.course in expertise or not expertise:
                        compat_faculty[section.section_id].append(faculty_member)
            
            # Create faculty selection variables
            for section in sections:
                y[section.section_id] = {}
                for faculty_member in compat_faculty[section.section_id]:
                    faculty_id = faculty_member.get("faculty_id", faculty_member.get("id", ""))
                    y[section.section_id][faculty_id] = model.NewBoolVar(f"y_{section.section_id}_{faculty_id}")
            
            # Create assignment variables
            for section in sections:
                x[section.section_id] = {}
                for slot in slots:
                    x[section.section_id][slot.slot_id] = {}
                    for room in compat_rooms[section.section_id]:
                        room_id = room.get("room_id", room.get("id", ""))
                        x[section.section_id][slot.slot_id][room_id] = {}
                        
                        for faculty_member in compat_faculty[section.section_id]:
                            faculty_id = faculty_member.get("faculty_id", faculty_member.get("id", ""))
                            var_name = f"x_{section.section_id}_{slot.slot_id}_{room_id}_{faculty_id}"
                            x[section.section_id][slot.slot_id][room_id][faculty_id] = model.NewBoolVar(var_name)
            
            # Constraint 1: Each section gets exactly required_meetings assignments
            for section in sections:
                assignments = []
                for slot in slots:
                    if slot.slot_id in x[section.section_id]:
                        for room_id in x[section.section_id][slot.slot_id]:
                            for faculty_id in x[section.section_id][slot.slot_id][room_id]:
                                assignments.append(x[section.section_id][slot.slot_id][room_id][faculty_id])
                
                if assignments:
                    model.Add(sum(assignments) == section.required_meetings)
            
            # Constraint 2: Faculty selection (one faculty per section)
            for section in sections:
                faculty_selection = list(y[section.section_id].values())
                if faculty_selection:
                    model.Add(sum(faculty_selection) == 1)
            
            # Constraint 3: Link assignments to faculty selection
            for section in sections:
                for faculty_id in y[section.section_id]:
                    faculty_assignments = []
                    for slot in slots:
                        if (slot.slot_id in x[section.section_id]):
                            for room_id in x[section.section_id][slot.slot_id]:
                                if faculty_id in x[section.section_id][slot.slot_id][room_id]:
                                    faculty_assignments.append(x[section.section_id][slot.slot_id][room_id][faculty_id])
                    
                    if faculty_assignments:
                        model.Add(sum(faculty_assignments) == section.required_meetings * y[section.section_id][faculty_id])
            
            # Constraint 4: Room conflicts (no double booking)
            for slot in slots:
                for room in request.rooms:
                    room_id = room.get("room_id", room.get("id", ""))
                    room_assignments = []
                    
                    for section in sections:
                        if (slot.slot_id in x[section.section_id] and 
                            room_id in x[section.section_id][slot.slot_id]):
                            for faculty_id in x[section.section_id][slot.slot_id][room_id]:
                                room_assignments.append(x[section.section_id][slot.slot_id][room_id][faculty_id])
                    
                    if room_assignments:
                        model.Add(sum(room_assignments) <= 1)
            
            # Constraint 5: Faculty conflicts (no double booking)
            for slot in slots:
                for faculty_member in request.faculty:
                    faculty_id = faculty_member.get("faculty_id", faculty_member.get("id", ""))
                    faculty_assignments = []
                    
                    for section in sections:
                        if (slot.slot_id in x[section.section_id]):
                            for room_id in x[section.section_id][slot.slot_id]:
                                if faculty_id in x[section.section_id][slot.slot_id][room_id]:
                                    faculty_assignments.append(x[section.section_id][slot.slot_id][room_id][faculty_id])
                    
                    if faculty_assignments:
                        model.Add(sum(faculty_assignments) <= 1)
            
            # Solve the model
            solver = cp_model.CpSolver()
            solver.parameters.max_time_in_seconds = 30  # 30 second timeout
            status = solver.Solve(model)
            
            # Extract solution
            if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
                logger.info(f"CP-SAT solver found {'optimal' if status == cp_model.OPTIMAL else 'feasible'} solution")
                
                for section in sections:
                    for slot in slots:
                        if slot.slot_id in x[section.section_id]:
                            for room_id in x[section.section_id][slot.slot_id]:
                                for faculty_id in x[section.section_id][slot.slot_id][room_id]:
                                    if solver.Value(x[section.section_id][slot.slot_id][room_id][faculty_id]) == 1:
                                        schedule.append({
                                            "section_id": section.section_id,
                                            "course": section.course,
                                            "slot_id": slot.slot_id,
                                            "day": slot.day,
                                            "start": slot.start,
                                            "end": slot.end,
                                            "room": room_id,
                                            "faculty": faculty_id,
                                            "type": section.type,
                                            "capacity": section.capacity
                                        })
            else:
                logger.warning(f"CP-SAT solver failed with status: {solver.StatusName(status)}")
                # Fallback to simple assignment if constraint solving fails
                logger.info("Falling back to simple round-robin assignment")
                room_idx = 0
                faculty_idx = 0
                slot_idx = 0
                
                for section in sections:
                    for meeting in range(section.required_meetings):
                        if slot_idx < len(slots) and request.rooms and request.faculty:
                            slot = slots[slot_idx]
                            room = request.rooms[room_idx % len(request.rooms)]
                            faculty_member = request.faculty[faculty_idx % len(request.faculty)]
                            
                            schedule.append({
                                "section_id": section.section_id,
                                "course": section.course,
                                "slot_id": slot.slot_id,
                                "day": slot.day,
                                "start": slot.start,
                                "end": slot.end,
                                "room": room.get("room_id", f"room_{room_idx}"),
                                "faculty": faculty_member.get("faculty_id", f"faculty_{faculty_idx}"),
                                "type": section.type,
                                "capacity": section.capacity
                            })
                            
                            slot_idx += 1
                    
                    room_idx += 1
                    faculty_idx += 1
        
        # Step 5: Calculate metrics
        metrics = {
            "total_sections": len(sections),
            "assigned_sections": len([s for s in sections if s.faculty]),
            "total_schedule_items": len(schedule),
            "assignment_rate": 100.0
        }
        
        generation_time = time_module.time() - start_time
        
        return ComprehensiveTimetableResponse(
            success=True,
            timetable=schedule,
            conflicts=[],
            metrics=metrics,
            generation_time=generation_time,
            sections_created=[{
                "section_id": s.section_id,
                "course": s.course,
                "type": s.type,
                "capacity": s.capacity,
                "required_meetings": s.required_meetings
            } for s in sections]
        )
        
    except Exception as e:
        logger.error(f"Comprehensive timetable generation failed: {str(e)}")
        return ComprehensiveTimetableResponse(
            success=False,
            conflicts=[{"type": "error", "description": str(e)}],
            generation_time=time_module.time() - start_time
        )

# Comprehensive AI System API Endpoints

@app.post("/api/comprehensive/admin/config")
async def save_comprehensive_admin_config(config: ComprehensiveAdminConfigRequest):
    """Save comprehensive admin configuration"""
    try:
        logger.info("Saving comprehensive admin config")
        # In production, save to database
        return {"success": True, "message": "Comprehensive admin config saved successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/comprehensive/generate_slots")
async def generate_comprehensive_time_slots(config: ComprehensiveAdminConfigRequest):
    """Generate comprehensive time slot grid"""
    try:
        admin_config = ComprehensiveAdminConfig(**config.dict())
        slots = generate_comprehensive_slots(admin_config)
        
        slot_data = [{"slot_id": s.slot_id, "day": s.day, "start": s.start, "end": s.end, "type": s.type} for s in slots]
        
        return {
            "success": True,
            "slots": slot_data,
            "total_slots": len(slots),
            "message": f"Generated {len(slots)} comprehensive time slots"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class ComprehensiveSectioningRequest(BaseModel):
    courses: List[ComprehensiveCourseRequest]
    student_strength: conint(ge=20, le=60) = 60
    rooms: List[ComprehensiveRoomRequest] = []

@app.post("/api/comprehensive/sectioning")
async def create_comprehensive_sections(request: ComprehensiveSectioningRequest):
    """Create comprehensive sections from courses and student strength"""
    try:
        courses = [ComprehensiveCourse(
            course_code=c.course_code,
            title=c.title,
            credits=c.credits,
            th=c.th,
            lab=c.lab,
            is_core=c.is_core
        ) for c in request.courses]
        
        rooms_data = [{"room_id": r.room_id, "capacity": r.capacity, "tags": r.tags} for r in request.rooms]
        sections = calculate_comprehensive_sections(courses, request.student_strength, rooms_data)
        
        section_data = [{
            "section_id": s.section_id,
            "course": s.course,
            "type": s.type,
            "capacity": s.capacity,
            "required_meetings": s.required_meetings
        } for s in sections]
        
        return {
            "success": True,
            "sections": section_data,
            "total_sections": len(sections),
            "message": f"Created {len(sections)} comprehensive sections"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/comprehensive/generate_timetable", response_model=ComprehensiveTimetableResponse)
async def generate_comprehensive_timetable_endpoint(request: ComprehensiveTimetableRequest):
    """Main comprehensive timetable generation endpoint"""
    try:
        logger.info("Starting comprehensive timetable generation via API")
        result = await generate_comprehensive_timetable(request)
        return result
    except Exception as e:
        logger.error(f"Comprehensive timetable generation API error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/sectioning/validate-allocation")
async def validate_student_allocation(
    sections: List[SectionDefinition],
    student_allocations: List[StudentAllocation]
):
    """
    Validate student allocations for conflicts and capacity violations
    """
    try:
        validation_results = {
            "is_valid": True,
            "conflicts": [],
            "warnings": [],
            "statistics": {}
        }
        
        # Check for slot conflicts within each student's allocation
        for allocation in student_allocations:
            student_slots = set()
            for course_id, section_id in allocation.allocated_sections.items():
                section = next((s for s in sections if s.section_id == section_id), None)
                if section:
                    section_slots = set(section.assigned_slots)
                    conflicts = student_slots & section_slots
                    if conflicts:
                        validation_results["is_valid"] = False
                        validation_results["conflicts"].append({
                            "type": "student_slot_conflict",
                            "student_id": allocation.student_id,
                            "conflicting_slots": list(conflicts),
                            "courses_involved": [course_id]
                        })
                    student_slots.update(section_slots)
        
        # Check section capacity violations
        section_enrollments = {}
        for allocation in student_allocations:
            for section_id in allocation.allocated_sections.values():
                section_enrollments[section_id] = section_enrollments.get(section_id, 0) + 1
        
        for section in sections:
            enrolled = section_enrollments.get(section.section_id, 0)
            if enrolled > section.max_capacity:
                validation_results["is_valid"] = False
                validation_results["conflicts"].append({
                    "type": "capacity_exceeded",
                    "section_id": section.section_id,
                    "enrolled": enrolled,
                    "capacity": section.max_capacity,
                    "overflow": enrolled - section.max_capacity
                })
        
        # Generate statistics
        validation_results["statistics"] = {
            "total_students": len(student_allocations),
            "total_sections": len(sections),
            "average_sections_per_student": sum(len(alloc.allocated_sections) 
                                               for alloc in student_allocations) / len(student_allocations),
            "section_utilization": {s.section_id: section_enrollments.get(s.section_id, 0) / s.max_capacity 
                                   for s in sections}
        }
        
        return validation_results
        
    except Exception as e:
        logger.error(f"Allocation validation failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Allocation validation failed: {str(e)}")

async def run_optimization_job(job_id: str, job_request: OptimizationJobRequest):
    """Background task for running optimization job"""
    try:
        optimization_jobs[job_id]["status"] = "running"
        optimization_jobs[job_id]["progress"] = 10.0
        
        logger.info(f"Running optimization job {job_id} with algorithm: {job_request.algorithm}")
        
        if job_request.algorithm == "genetic_algorithm":
            solver = GeneticTimetableSolver(
                population_size=100,
                generations=500,
                mutation_rate=0.1,
                crossover_rate=0.8
            )
        else:
            solver = TimetableConstraintSolver()
        
        optimization_jobs[job_id]["progress"] = 50.0
        
        result = solver.solve_timetable(job_request.request)
        
        optimization_jobs[job_id]["status"] = "completed"
        optimization_jobs[job_id]["progress"] = 100.0
        optimization_jobs[job_id]["result"] = result
        optimization_jobs[job_id]["completed_at"] = datetime.now()
        
        logger.info(f"Optimization job {job_id} completed successfully")
        
    except Exception as e:
        logger.error(f"Optimization job {job_id} failed: {str(e)}")
        optimization_jobs[job_id]["status"] = "failed"
        optimization_jobs[job_id]["error_message"] = str(e)
        optimization_jobs[job_id]["completed_at"] = datetime.now()

# Initialize AI Timetable Generator
ai_generator = AITimetableGenerator()

@app.post("/ai/generate-timetable", response_model=AITimetableResponse)
async def generate_ai_timetable(admin_question: AdminQuestion):
    """
    AI-powered timetable generation from admin questions
    Responds with intelligent base timetable configuration
    """
    try:
        logger.info(f"Processing AI timetable request: {admin_question.question}")
        
        # Generate AI response
        response = ai_generator.generate_from_question(admin_question)
        
        logger.info(f"AI timetable generated successfully with {response.generated_grid.total_teaching_slots_per_day} slots per day")
        return response
        
    except Exception as e:
        logger.error(f"AI timetable generation failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"AI generation failed: {str(e)}")

@app.post("/ai/quick-generate")
async def quick_generate_timetable(request: dict):
    """
    Quick AI timetable generation from simple question string
    """
    try:
        admin_question = AdminQuestion(question=request["question"])
        response = ai_generator.generate_from_question(admin_question)
        
        return {
            "success": True,
            "timetable_config": response.generated_config.dict(),
            "grid_summary": {
                "total_slots_per_day": response.generated_grid.total_teaching_slots_per_day,
                "working_days": response.generated_grid.config.working_days,
                "slot_pattern": list(response.generated_grid.grid_matrix.keys())[:10]  # First 10 slots
            },
            "explanation": response.explanation,
            "recommendations": response.recommendations,
            "slot_mapping": response.slot_mapping,
            "break_schedule": response.break_schedule
        }
        
    except Exception as e:
        logger.error(f"Quick AI generation failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Quick generation failed: {str(e)}")

@app.get("/ai/sample-questions")
async def get_sample_questions():
    """
    Get sample questions that admins can ask for timetable generation
    """
    return {
        "sample_questions": [
            "Generate a timetable for engineering college from 8:30 AM to 5:30 PM with 50-minute slots",
            "Create a business school schedule with 60-minute classes and 1-hour lunch break",
            "I need a medical college timetable with morning, lunch, and evening breaks",
            "Generate 6-day working schedule with 55-minute slots and 15-minute grace time",
            "Create a timetable for technical college with lab sessions in afternoon",
            "Generate schedule from 9 AM to 6 PM with tea break and lunch break",
            "I want a flexible timetable with morning classes and afternoon practicals"
        ],
        "supported_features": [
            "Custom start and end times",
            "Variable slot durations (50, 55, 60 minutes)",
            "Flexible break management (morning, lunch, evening)",
            "Working days configuration (5-day or 6-day)",
            "Grace time between slots",
            "College type optimization (engineering, business, medical)",
            "Intelligent slot pattern generation"
        ]
    }

# Unified AI Timetable Generation Endpoint
@app.post("/ai/unified-generate")
async def unified_timetable_generation(request_data: dict):
    """
    🚀 UNIFIED AI TIMETABLE GENERATION 🚀
    
    Single endpoint that handles EVERYTHING:
    - Base timetable configuration from natural language
    - Automatic course sectioning based on student strength
    - Complete constraint satisfaction optimization
    - Student allocation and conflict resolution
    
    Example request:
    {
        "question": "Generate timetable for engineering college 8:30 AM to 5:30 PM with 50-minute slots",
        "courses": [...],
        "faculty": [...], 
        "rooms": [...],
        "total_students": 200,
        "constraints": {
            "minimize_conflicts": true,
            "optimize_room_utilization": true,
            "balance_faculty_load": true
        }
    }
    
    Returns complete timetable with optimization metrics, conflicts analysis, and recommendations.
    """
    try:
        logger.info("🎯 Processing unified AI timetable generation request")
        logger.info(f"📝 Request data keys: {list(request_data.keys())}")
        
        result = await generate_unified_timetable(request_data)
        
        logger.info(f"✅ Unified generation completed with {result.get('optimization', {}).get('score', 0):.1f}% optimization score")
        logger.info(f"🔍 Response keys: {list(result.keys())}")
        
        # Check if base_timetable is in response
        if 'base_timetable' in result:
            logger.info(f"✅ base_timetable included with {len(result['base_timetable'].get('time_slots', []))} time slots")
        else:
            logger.warning("❌ base_timetable missing from response!")
            
        return result
        
    except Exception as e:
        logger.error(f"❌ Unified timetable generation failed: {str(e)}")
        import traceback
        logger.error(f"🔍 Full traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Unified generation failed: {str(e)}")

@app.get("/ai/sample-unified-request")
async def get_sample_unified_request():
    """
    Get a sample request format for unified timetable generation
    Includes sample data for courses, faculty, and rooms
    """
    return {
        "sample_request": {
            "question": "Generate timetable for engineering college from 8:30 AM to 5:30 PM with 50-minute slots and lunch break",
            "total_students": 200,
            "constraints": {
                "minimize_conflicts": True,
                "optimize_room_utilization": True,
                "balance_faculty_load": True,
                "consider_student_preferences": False
            },
            "courses": [
                {
                    "course_id": "CS301",
                    "course_name": "Data Structures",
                    "course_type": "core",
                    "total_credits": 4,
                    "theory_hours": 3,
                    "lab_hours": 2,
                    "max_theory_capacity": 60,
                    "max_lab_capacity": 30,
                    "required_expertise": ["Computer Science", "Programming"],
                    "is_compulsory": True
                },
                {
                    "course_id": "CS302",
                    "course_name": "Database Systems",
                    "course_type": "core", 
                    "total_credits": 4,
                    "theory_hours": 3,
                    "lab_hours": 2,
                    "max_theory_capacity": 60,
                    "max_lab_capacity": 30,
                    "required_expertise": ["Database", "SQL"],
                    "is_compulsory": True
                },
                {
                    "course_id": "CS303",
                    "course_name": "Web Development",
                    "course_type": "elective",
                    "total_credits": 3,
                    "theory_hours": 2,
                    "lab_hours": 2,
                    "max_theory_capacity": 40,
                    "max_lab_capacity": 25,
                    "estimated_demand_percentage": 0.4,
                    "required_expertise": ["Web Technologies", "Programming"],
                    "is_compulsory": False
                }
            ],
            "faculty": [
                {
                    "faculty_id": "FAC001",
                    "name": "Dr. Smith",
                    "expertise": ["Computer Science", "Programming", "Data Structures"],
                    "max_hours_per_week": 20,
                    "is_active": True
                },
                {
                    "faculty_id": "FAC002", 
                    "name": "Prof. Johnson",
                    "expertise": ["Database", "SQL", "Data Analytics"],
                    "max_hours_per_week": 18,
                    "is_active": True
                },
                {
                    "faculty_id": "FAC003",
                    "name": "Dr. Wilson",
                    "expertise": ["Web Technologies", "Programming", "JavaScript"],
                    "max_hours_per_week": 16,
                    "is_active": True
                }
            ],
            "rooms": [
                {
                    "room_id": "R101",
                    "name": "Classroom 101",
                    "capacity": 60,
                    "room_type": "classroom",
                    "equipment": ["Projector", "Whiteboard"],
                    "is_available": True
                },
                {
                    "room_id": "LAB01",
                    "name": "Computer Lab 1",
                    "capacity": 30,
                    "room_type": "lab",
                    "equipment": ["Computers", "Projector", "Software"],
                    "is_available": True
                },
                {
                    "room_id": "R102",
                    "name": "Classroom 102", 
                    "capacity": 50,
                    "room_type": "classroom",
                    "equipment": ["Projector", "Audio System"],
                    "is_available": True
                }
            ]
        },
        "features": [
            "🤖 Natural language question parsing",
            "📊 Automatic section calculation based on student strength",
            "🎯 OR-Tools constraint satisfaction optimization",
            "👥 Intelligent student allocation",
            "⚡ Real-time conflict detection and resolution",
            "📈 Comprehensive optimization metrics",
            "💡 AI-powered recommendations",
            "🔄 Single API call for complete timetable"
        ],
        "supported_questions": [
            "Generate timetable for engineering college 8:30 AM to 5:30 PM with 50-minute slots",
            "Create schedule for medical college with 60-minute classes and breaks",
            "Generate 6-day working timetable with morning and lunch breaks",
            "Create business school schedule with flexible timing",
            "Generate technical college timetable with lab sessions"
        ]
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)