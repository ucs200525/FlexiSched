"""
AI Optimization Engine API Server
FastAPI-based microservice for timetable optimization
"""

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import logging
import asyncio
from typing import Dict, List, Optional
import uuid
from datetime import datetime

from models import OptimizationRequest, OptimizationResult, TimeSlot, Course, Faculty, Room, Student
from constraint_solver import TimetableConstraintSolver
from genetic_solver import GeneticTimetableSolver

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="AI Timetable Optimization Engine",
    description="Advanced constraint satisfaction and genetic algorithm-based timetable generation",
    version="1.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory storage for optimization jobs
optimization_jobs: Dict[str, Dict] = {}

class OptimizationJobRequest(BaseModel):
    request: OptimizationRequest
    algorithm: str = "constraint_solver"  # "constraint_solver" or "genetic_algorithm"
    job_name: Optional[str] = None

class OptimizationJobStatus(BaseModel):
    job_id: str
    status: str  # "pending", "running", "completed", "failed"
    progress: float = 0.0
    result: Optional[OptimizationResult] = None
    error_message: Optional[str] = None
    created_at: datetime
    completed_at: Optional[datetime] = None

@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "message": "AI Timetable Optimization Engine",
        "status": "running",
        "version": "1.0.0"
    }

@app.post("/optimize/sync", response_model=OptimizationResult)
async def optimize_timetable_sync(job_request: OptimizationJobRequest):
    """
    Synchronous timetable optimization
    Returns result immediately (suitable for small problems)
    """
    try:
        logger.info(f"Starting synchronous optimization with algorithm: {job_request.algorithm}")
        
        if job_request.algorithm == "genetic_algorithm":
            solver = GeneticTimetableSolver(
                population_size=50,  # Smaller for sync processing
                generations=100,
                mutation_rate=0.1,
                crossover_rate=0.8
            )
        else:
            solver = TimetableConstraintSolver()
        
        result = solver.solve_timetable(job_request.request)
        
        logger.info(f"Optimization completed. Success: {result.success}, Score: {result.optimization_score}")
        return result
        
    except Exception as e:
        logger.error(f"Optimization error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Optimization failed: {str(e)}")

@app.post("/optimize/async", response_model=Dict[str, str])
async def optimize_timetable_async(job_request: OptimizationJobRequest, background_tasks: BackgroundTasks):
    """
    Asynchronous timetable optimization
    Returns job ID for tracking progress (suitable for large problems)
    """
    job_id = str(uuid.uuid4())
    job_name = job_request.job_name or f"Optimization_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    
    # Store job info
    optimization_jobs[job_id] = {
        "job_id": job_id,
        "job_name": job_name,
        "status": "pending",
        "progress": 0.0,
        "result": None,
        "error_message": None,
        "created_at": datetime.now(),
        "completed_at": None,
        "request": job_request.request,
        "algorithm": job_request.algorithm
    }
    
    # Start background optimization
    background_tasks.add_task(run_optimization_job, job_id, job_request)
    
    logger.info(f"Started async optimization job: {job_id} ({job_name})")
    
    return {
        "job_id": job_id,
        "message": "Optimization job started",
        "status": "pending"
    }

@app.get("/optimize/status/{job_id}", response_model=OptimizationJobStatus)
async def get_optimization_status(job_id: str):
    """Get status of an optimization job"""
    if job_id not in optimization_jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    
    job = optimization_jobs[job_id]
    return OptimizationJobStatus(**job)

@app.get("/optimize/jobs", response_model=List[OptimizationJobStatus])
async def list_optimization_jobs():
    """List all optimization jobs"""
    return [OptimizationJobStatus(**job) for job in optimization_jobs.values()]

@app.delete("/optimize/jobs/{job_id}")
async def delete_optimization_job(job_id: str):
    """Delete an optimization job"""
    if job_id not in optimization_jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    
    del optimization_jobs[job_id]
    return {"message": "Job deleted successfully"}

@app.post("/analyze/conflicts")
async def analyze_conflicts(timetable_slots: List[Dict]):
    """
    Analyze existing timetable for conflicts
    Useful for validating manually created timetables
    """
    try:
        conflicts = []
        
        # Faculty conflicts
        faculty_schedule = {}
        for slot in timetable_slots:
            key = f"{slot.get('faculty_id')}_{slot.get('day')}_{slot.get('start_time')}"
            if key in faculty_schedule:
                conflicts.append({
                    "type": "faculty_clash",
                    "description": f"Faculty {slot.get('faculty_id')} has overlapping assignments",
                    "affected_slots": [faculty_schedule[key], slot],
                    "severity": "high"
                })
            else:
                faculty_schedule[key] = slot
        
        # Room conflicts
        room_schedule = {}
        for slot in timetable_slots:
            key = f"{slot.get('room_id')}_{slot.get('day')}_{slot.get('start_time')}"
            if key in room_schedule:
                conflicts.append({
                    "type": "room_clash",
                    "description": f"Room {slot.get('room_id')} has overlapping bookings",
                    "affected_slots": [room_schedule[key], slot],
                    "severity": "high"
                })
            else:
                room_schedule[key] = slot
        
        return {
            "total_conflicts": len(conflicts),
            "conflicts": conflicts,
            "analysis_summary": {
                "total_slots": len(timetable_slots),
                "conflict_rate": len(conflicts) / len(timetable_slots) if timetable_slots else 0,
                "status": "conflict_free" if len(conflicts) == 0 else "has_conflicts"
            }
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")

@app.post("/generate/template")
async def generate_template_timetable(
    courses: List[Course],
    faculty: List[Faculty],
    rooms: List[Room],
    time_slots: List[TimeSlot]
):
    """
    Generate a basic template timetable without optimization
    Useful for quick setup and manual editing
    """
    try:
        template_slots = []
        
        # Simple round-robin assignment
        faculty_list = faculty
        room_list = rooms
        time_slot_list = time_slots
        
        faculty_idx = 0
        room_idx = 0
        time_idx = 0
        
        for course in courses:
            for _ in range(course.credits):  # Each credit needs one slot
                if faculty_list and room_list and time_slot_list:
                    selected_faculty = faculty_list[faculty_idx % len(faculty_list)]
                    selected_room = room_list[room_idx % len(room_list)]
                    selected_time = time_slot_list[time_idx % len(time_slot_list)]
                    
                    template_slots.append({
                        "course_id": course.id,
                        "faculty_id": selected_faculty.id,
                        "room_id": selected_room.id,
                        "day": selected_time.day,
                        "start_time": selected_time.start_time,
                        "end_time": selected_time.end_time,
                        "duration": selected_time.duration
                    })
                    
                    faculty_idx += 1
                    room_idx += 1
                    time_idx += 1
        
        return {
            "template_slots": template_slots,
            "total_assignments": len(template_slots),
            "message": "Template timetable generated successfully"
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Template generation failed: {str(e)}")

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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)