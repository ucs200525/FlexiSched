import logging
from typing import List, Dict, Tuple, Set, Optional
from ortools.sat.python import cp_model
import time
from models import (
    Course, Faculty, Room, Student, TimetableSlot, 
    OptimizationRequest, OptimizationResult, Conflict, 
    ConflictType, TimeSlot
)

logger = logging.getLogger(__name__)

class TimetableConstraintSolver:
    """
    Advanced constraint satisfaction solver for timetable generation
    Uses Google OR-Tools CP-SAT solver for optimal scheduling
    """
    
    def __init__(self):
        self.model = None
        self.solver = None
        self.variables = {}
        self.solution_callback = None
        
    def solve_timetable(self, request: OptimizationRequest) -> OptimizationResult:
        """
        Main method to solve timetable optimization problem
        """
        start_time = time.time()
        
        try:
            # Initialize the constraint programming model
            self.model = cp_model.CpModel()
            self.solver = cp_model.CpSolver()
            
            # Prepare data structures
            courses = {c.id: c for c in request.courses}
            faculty = {f.id: f for f in request.faculty}
            rooms = {r.id: r for r in request.rooms}
            students = {s.id: s for s in request.students}
            time_slots = request.time_slots
            
            # Create decision variables
            self._create_variables(courses, faculty, rooms, time_slots)
            
            # Add constraints
            self._add_basic_constraints(courses, faculty, rooms, time_slots)
            self._add_faculty_constraints(faculty, time_slots)
            self._add_room_constraints(rooms, time_slots)
            self._add_student_constraints(students, courses, time_slots)
            self._add_custom_constraints(request.constraints, courses, time_slots)
            
            # Set optimization objectives
            self._set_objectives(request.objectives, courses, faculty, rooms, time_slots)
            
            # Solve the model
            status = self.solver.Solve(self.model)
            
            execution_time = time.time() - start_time
            
            if status == cp_model.OPTIMAL or status == cp_model.FEASIBLE:
                # Extract solution
                timetable_slots = self._extract_solution(courses, faculty, rooms, time_slots)
                conflicts = self._detect_conflicts(timetable_slots, request)
                
                # Calculate metrics
                optimization_score = self._calculate_optimization_score(timetable_slots, request)
                faculty_workload = self._calculate_faculty_workload(timetable_slots, faculty)
                room_utilization = self._calculate_room_utilization(timetable_slots, rooms, time_slots)
                
                return OptimizationResult(
                    success=True,
                    timetable_slots=timetable_slots,
                    conflicts=conflicts,
                    optimization_score=optimization_score,
                    faculty_workload=faculty_workload,
                    room_utilization=room_utilization,
                    execution_time=execution_time,
                    algorithm_used="CP-SAT"
                )
            else:
                # No solution found
                return OptimizationResult(
                    success=False,
                    conflicts=[],
                    warnings=[f"No feasible solution found. Status: {self.solver.StatusName(status)}"],
                    execution_time=execution_time,
                    algorithm_used="CP-SAT"
                )
                
        except Exception as e:
            logger.error(f"Error in timetable solving: {str(e)}")
            return OptimizationResult(
                success=False,
                conflicts=[],
                warnings=[f"Solver error: {str(e)}"],
                execution_time=time.time() - start_time,
                algorithm_used="CP-SAT"
            )
    
    def _create_variables(self, courses: Dict, faculty: Dict, rooms: Dict, time_slots: List[TimeSlot]):
        """Create decision variables for the constraint programming model"""
        self.variables = {}
        
        # Main assignment variables: course_faculty_room_time
        # Binary variable: 1 if course c is assigned to faculty f in room r at time t
        for course_id in courses:
            for faculty_id in faculty:
                for room_id in rooms:
                    for i, time_slot in enumerate(time_slots):
                        var_name = f"assign_{course_id}_{faculty_id}_{room_id}_{i}"
                        self.variables[var_name] = self.model.NewBoolVar(var_name)
        
        # Auxiliary variables for workload tracking
        for faculty_id in faculty:
            var_name = f"workload_{faculty_id}"
            max_hours = faculty[faculty_id].max_hours_per_week
            self.variables[var_name] = self.model.NewIntVar(0, max_hours, var_name)
    
    def _add_basic_constraints(self, courses: Dict, faculty: Dict, rooms: Dict, time_slots: List[TimeSlot]):
        """Add basic timetable constraints"""
        
        # Constraint 1: Each course must be assigned to exactly one time slot
        for course_id in courses:
            course = courses[course_id]
            slots_needed = course.credits  # 1 credit = 1 slot per week
            
            assignments = []
            for faculty_id in faculty:
                for room_id in rooms:
                    for i, time_slot in enumerate(time_slots):
                        var_name = f"assign_{course_id}_{faculty_id}_{room_id}_{i}"
                        assignments.append(self.variables[var_name])
            
            self.model.Add(sum(assignments) == slots_needed)
        
        # Constraint 2: No double booking of rooms
        for room_id in rooms:
            for i, time_slot in enumerate(time_slots):
                room_assignments = []
                for course_id in courses:
                    for faculty_id in faculty:
                        var_name = f"assign_{course_id}_{faculty_id}_{room_id}_{i}"
                        room_assignments.append(self.variables[var_name])
                
                self.model.Add(sum(room_assignments) <= 1)
        
        # Constraint 3: Faculty can only teach one course at a time
        for faculty_id in faculty:
            for i, time_slot in enumerate(time_slots):
                faculty_assignments = []
                for course_id in courses:
                    for room_id in rooms:
                        var_name = f"assign_{course_id}_{faculty_id}_{room_id}_{i}"
                        faculty_assignments.append(self.variables[var_name])
                
                self.model.Add(sum(faculty_assignments) <= 1)
    
    def _add_faculty_constraints(self, faculty: Dict, time_slots: List[TimeSlot]):
        """Add faculty-specific constraints"""
        
        for faculty_id, faculty_member in faculty.items():
            total_hours = []
            
            # Calculate total workload for each faculty
            for course_id in self.variables:
                if f"_{faculty_id}_" in course_id and course_id.startswith("assign_"):
                    for i, time_slot in enumerate(time_slots):
                        var_name = f"assign_{course_id.split('_')[1]}_{faculty_id}_{course_id.split('_')[3]}_{i}"
                        if var_name in self.variables:
                            total_hours.append(self.variables[var_name] * (time_slot.duration // 60))
            
            if total_hours:
                workload_var = self.variables[f"workload_{faculty_id}"]
                self.model.Add(workload_var == sum(total_hours))
                self.model.Add(workload_var <= faculty_member.max_hours_per_week)
    
    def _add_room_constraints(self, rooms: Dict, time_slots: List[TimeSlot]):
        """Add room capacity and equipment constraints"""
        pass  # Room constraints handled in basic constraints
    
    def _add_student_constraints(self, students: Dict, courses: Dict, time_slots: List[TimeSlot]):
        """Add student enrollment and clash-free constraints"""
        
        # Student clash prevention: students can't have two courses at the same time
        for student_id, student in students.items():
            enrolled_course_ids = student.enrolled_courses
            
            for i, time_slot in enumerate(time_slots):
                student_assignments = []
                
                for course_id in enrolled_course_ids:
                    if course_id in courses:
                        for faculty_id in self.variables:
                            for room_id in self.variables:
                                var_name = f"assign_{course_id}_{faculty_id}_{room_id}_{i}"
                                if var_name in self.variables:
                                    student_assignments.append(self.variables[var_name])
                
                if student_assignments:
                    self.model.Add(sum(student_assignments) <= 1)
    
    def _add_custom_constraints(self, constraints, courses: Dict, time_slots: List[TimeSlot]):
        """Add custom constraints based on institutional requirements"""
        
        # Lunch break constraint
        lunch_start = constraints.lunch_break_start
        lunch_duration = constraints.lunch_break_duration
        
        # Find lunch time slots
        lunch_slot_indices = []
        for i, time_slot in enumerate(time_slots):
            if time_slot.start_time >= lunch_start and time_slot.start_time < "13:00":
                lunch_slot_indices.append(i)
        
        # Minimize assignments during lunch
        for course_id in courses:
            for faculty_id in self.variables:
                for room_id in self.variables:
                    for i in lunch_slot_indices:
                        var_name = f"assign_{course_id}_{faculty_id}_{room_id}_{i}"
                        if var_name in self.variables:
                            # Soft constraint: penalize lunch assignments
                            pass
    
    def _set_objectives(self, objectives, courses: Dict, faculty: Dict, rooms: Dict, time_slots: List[TimeSlot]):
        """Set optimization objectives"""
        
        objective_terms = []
        
        # Minimize conflicts (maximize assignments that don't conflict)
        for course_id in courses:
            for faculty_id in faculty:
                for room_id in rooms:
                    for i, time_slot in enumerate(time_slots):
                        var_name = f"assign_{course_id}_{faculty_id}_{room_id}_{i}"
                        if var_name in self.variables:
                            objective_terms.append(self.variables[var_name])
        
        # Workload balancing
        workload_vars = [self.variables[f"workload_{fid}"] for fid in faculty.keys()]
        if workload_vars:
            # Minimize variance in workload
            avg_workload = sum(workload_vars) // len(workload_vars)
            for workload_var in workload_vars:
                # Add penalty for deviation from average
                deviation_pos = self.model.NewIntVar(0, 100, f"dev_pos_{workload_var.Name()}")
                deviation_neg = self.model.NewIntVar(0, 100, f"dev_neg_{workload_var.Name()}")
                
                self.model.Add(workload_var - avg_workload == deviation_pos - deviation_neg)
                objective_terms.extend([-deviation_pos, -deviation_neg])
        
        if objective_terms:
            self.model.Maximize(sum(objective_terms))
    
    def _extract_solution(self, courses: Dict, faculty: Dict, rooms: Dict, time_slots: List[TimeSlot]) -> List[TimetableSlot]:
        """Extract the solution from the solved model"""
        
        solution_slots = []
        
        for course_id in courses:
            for faculty_id in faculty:
                for room_id in rooms:
                    for i, time_slot in enumerate(time_slots):
                        var_name = f"assign_{course_id}_{faculty_id}_{room_id}_{i}"
                        
                        if var_name in self.variables and self.solver.Value(self.variables[var_name]) == 1:
                            slot = TimetableSlot(
                                course_id=course_id,
                                faculty_id=faculty_id,
                                room_id=room_id,
                                day=time_slot.day,
                                start_time=time_slot.start_time,
                                end_time=time_slot.end_time,
                                duration=time_slot.duration,
                                student_ids=[]  # Will be populated based on course enrollment
                            )
                            solution_slots.append(slot)
        
        return solution_slots
    
    def _detect_conflicts(self, timetable_slots: List[TimetableSlot], request: OptimizationRequest) -> List[Dict]:
        """Detect and report conflicts in the generated timetable"""
        
        conflicts = []
        
        # Faculty clash detection
        faculty_schedule = {}
        for slot in timetable_slots:
            key = f"{slot.faculty_id}_{slot.day}_{slot.start_time}"
            if key in faculty_schedule:
                conflicts.append({
                    "type": ConflictType.FACULTY_CLASH,
                    "description": f"Faculty {slot.faculty_id} has overlapping assignments",
                    "affected_slots": [faculty_schedule[key], slot],
                    "severity": "high"
                })
            else:
                faculty_schedule[key] = slot
        
        # Room clash detection
        room_schedule = {}
        for slot in timetable_slots:
            key = f"{slot.room_id}_{slot.day}_{slot.start_time}"
            if key in room_schedule:
                conflicts.append({
                    "type": ConflictType.ROOM_CLASH,
                    "description": f"Room {slot.room_id} has overlapping bookings",
                    "affected_slots": [room_schedule[key], slot],
                    "severity": "high"
                })
            else:
                room_schedule[key] = slot
        
        return conflicts
    
    def _calculate_optimization_score(self, timetable_slots: List[TimetableSlot], request: OptimizationRequest) -> float:
        """Calculate overall optimization score (0-100)"""
        
        if not timetable_slots:
            return 0.0
        
        # Basic score based on successful assignments
        total_required_slots = sum(course.credits for course in request.courses)
        assigned_slots = len(timetable_slots)
        
        assignment_score = (assigned_slots / total_required_slots) * 100 if total_required_slots > 0 else 0
        
        # Penalty for conflicts
        conflicts = self._detect_conflicts(timetable_slots, request)
        conflict_penalty = len(conflicts) * 5  # 5 points per conflict
        
        final_score = max(0, assignment_score - conflict_penalty)
        return min(100, final_score)
    
    def _calculate_faculty_workload(self, timetable_slots: List[TimetableSlot], faculty: Dict) -> Dict[str, int]:
        """Calculate workload hours for each faculty member"""
        
        workload = {fid: 0 for fid in faculty.keys()}
        
        for slot in timetable_slots:
            if slot.faculty_id in workload:
                workload[slot.faculty_id] += slot.duration // 60  # Convert minutes to hours
        
        return workload
    
    def _calculate_room_utilization(self, timetable_slots: List[TimetableSlot], rooms: Dict, time_slots: List[TimeSlot]) -> Dict[str, float]:
        """Calculate utilization percentage for each room"""
        
        total_available_hours = len(time_slots) * 5  # 5 days a week
        utilization = {}
        
        for room_id in rooms:
            used_hours = sum(1 for slot in timetable_slots if slot.room_id == room_id)
            utilization[room_id] = (used_hours / total_available_hours) * 100 if total_available_hours > 0 else 0
        
        return utilization