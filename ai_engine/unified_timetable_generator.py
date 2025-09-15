"""
Unified AI Timetable Generation Engine
Complete solution using OR-Tools constraint satisfaction for timetable generation
Handles base configuration, sectioning, and optimization in one unified process
"""

from ortools.sat.python import cp_model
from typing import Dict, List, Optional, Tuple, Any
from dataclasses import dataclass, asdict
from datetime import datetime, time, timedelta
import json
import logging
from enum import Enum

logger = logging.getLogger(__name__)

class CourseType(Enum):
    CORE = "core"
    ELECTIVE = "elective"
    LAB = "lab"
    CLINIC = "clinic"

class SlotType(Enum):
    THEORY = "theory"
    LAB = "lab"
    BREAK = "break"

@dataclass
class TimeSlot:
    slot_id: str
    day: str
    start_time: str
    end_time: str
    duration: int
    slot_type: SlotType
    is_available: bool = True

@dataclass
class Course:
    course_id: str
    course_name: str
    course_type: CourseType
    credits: int
    theory_hours: int
    lab_hours: int
    max_theory_capacity: int
    max_lab_capacity: int
    estimated_students: int
    required_faculty_expertise: List[str]
    is_compulsory: bool = True

@dataclass
class Faculty:
    faculty_id: str
    name: str
    expertise: List[str]
    max_hours_per_week: int
    availability: Dict[str, List[str]]  # day -> available slots
    is_active: bool = True

@dataclass
class Room:
    room_id: str
    name: str
    capacity: int
    room_type: str  # "classroom", "lab", "auditorium"
    equipment: List[str]
    availability: Dict[str, List[str]]  # day -> available slots
    is_available: bool = True

@dataclass
class Section:
    section_id: str
    course_id: str
    section_type: SlotType
    max_students: int
    assigned_faculty: str
    assigned_room: str
    assigned_slots: List[str]
    enrolled_students: List[str]

@dataclass
class UnifiedTimetableRequest:
    # Basic Configuration
    college_start_time: str = "08:30"
    college_end_time: str = "17:30"
    slot_duration: int = 50  # minutes
    grace_time: int = 10  # minutes between slots
    working_days: List[str] = None
    breaks: List[Dict] = None
    
    # Course and Resource Data
    courses: List[Dict] = None
    faculty: List[Dict] = None
    rooms: List[Dict] = None
    total_students: int = 200
    student_ids: List[str] = None
    
    # Optimization Parameters
    minimize_conflicts: bool = True
    optimize_room_utilization: bool = True
    balance_faculty_load: bool = True
    consider_student_preferences: bool = False
    
    def __post_init__(self):
        if self.working_days is None:
            self.working_days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
        if self.breaks is None:
            self.breaks = [
                {"type": "morning", "start_time": "10:30", "end_time": "10:45"},
                {"type": "lunch", "start_time": "13:00", "end_time": "14:00"}
            ]
        if self.student_ids is None:
            self.student_ids = [f"STU{str(i+1).zfill(3)}" for i in range(self.total_students)]

@dataclass
class UnifiedTimetableResult:
    success: bool
    timetable_schedule: List[Dict]
    sections_created: List[Section]
    student_allocations: Dict[str, Dict[str, str]]
    optimization_score: float
    conflicts: List[Dict]
    metrics: Dict[str, Any]
    slot_grid: Dict[str, List[str]]
    recommendations: List[str]
    generation_time: float

class UnifiedTimetableGenerator:
    """
    Complete AI-powered timetable generation system
    Combines base configuration, sectioning, and optimization using OR-Tools
    """
    
    def __init__(self):
        self.model = None
        self.solver = None
        self.time_slots = []
        self.courses = []
        self.faculty = []
        self.rooms = []
        self.sections = []
        
    def generate_complete_timetable(self, request: UnifiedTimetableRequest) -> UnifiedTimetableResult:
        """
        Main method to generate complete timetable from unified request
        """
        start_time = datetime.now()
        logger.info("Starting unified timetable generation")
        
        try:
            # Step 1: Generate time slot grid
            self.time_slots = self._generate_time_slots(request)
            logger.info(f"Generated {len(self.time_slots)} time slots")
            
            # Debug: Print first few slots
            if self.time_slots:
                logger.info(f"Sample slots: {[(slot.slot_id, slot.day, slot.start_time, slot.end_time) for slot in self.time_slots[:5]]}")
            else:
                logger.warning("No time slots generated!")
            
            # Step 2: Process and validate input data
            self.courses = self._process_courses(request.courses, request.total_students)
            self.faculty = self._process_faculty(request.faculty)
            self.rooms = self._process_rooms(request.rooms)
            logger.info(f"Processed {len(self.courses)} courses, {len(self.faculty)} faculty, {len(self.rooms)} rooms")
            
            # Step 3: Calculate required sections
            self.sections = self._calculate_sections(self.courses, request.total_students)
            logger.info(f"Calculated {len(self.sections)} required sections")
            
            # Step 4: Build and solve constraint model
            schedule = self._solve_timetable_constraints(request)
            
            # Step 5: Allocate students to sections
            student_allocations = self._allocate_students(request.student_ids, self.sections)
            
            # Step 6: Calculate metrics and detect conflicts
            conflicts = self._detect_conflicts(schedule)
            metrics = self._calculate_metrics(schedule, self.sections, student_allocations)
            optimization_score = self._calculate_optimization_score(metrics, conflicts)
            
            # Step 7: Generate recommendations
            recommendations = self._generate_recommendations(conflicts, metrics)
            
            generation_time = (datetime.now() - start_time).total_seconds()
            
            result = UnifiedTimetableResult(
                success=len(conflicts) == 0,
                timetable_schedule=schedule,
                sections_created=self.sections,
                student_allocations=student_allocations,
                optimization_score=optimization_score,
                conflicts=conflicts,
                metrics=metrics,
                slot_grid=self._create_slot_grid(),
                recommendations=recommendations,
                generation_time=generation_time
            )
            
            logger.info(f"Timetable generation completed in {generation_time:.2f}s with {optimization_score:.1f}% optimization score")
            return result
            
        except Exception as e:
            logger.error(f"Timetable generation failed: {str(e)}")
            return UnifiedTimetableResult(
                success=False,
                timetable_schedule=[],
                sections_created=[],
                student_allocations={},
                optimization_score=0.0,
                conflicts=[{"type": "generation_error", "description": str(e), "severity": "high"}],
                metrics={},
                slot_grid={},
                recommendations=[],
                generation_time=(datetime.now() - start_time).total_seconds()
            )
    
    def _generate_time_slots(self, request: UnifiedTimetableRequest) -> List[TimeSlot]:
        """Generate time slot grid based on configuration"""
        slots = []
        
        # Parse times
        start_time = datetime.strptime(request.college_start_time, "%H:%M").time()
        end_time = datetime.strptime(request.college_end_time, "%H:%M").time()
        
        # Generate slot labels (A1, B1, C1, etc.)
        slot_labels = []
        for i in range(10):  # Generate enough slot labels
            slot_labels.append(chr(65 + i))  # A, B, C, D, E, F, G, H, I, J
        
        for day in request.working_days:
            current_time = datetime.combine(datetime.today(), start_time)
            end_datetime = datetime.combine(datetime.today(), end_time)
            slot_index = 0
            
            while current_time < end_datetime:
                slot_end = current_time + timedelta(minutes=request.slot_duration)
                
                # Check if this time falls within any break
                is_break = False
                for break_info in request.breaks:
                    break_start = datetime.strptime(break_info["start_time"], "%H:%M").time()
                    break_end = datetime.strptime(break_info["end_time"], "%H:%M").time()
                    
                    # Check if current slot overlaps with break time
                    if (current_time.time() < break_end and slot_end.time() > break_start):
                        is_break = True
                        break
                
                if not is_break and slot_end.time() <= end_time:
                    # Create slot with proper labeling
                    slot_label = slot_labels[slot_index % len(slot_labels)]
                    slot_number = (slot_index // len(slot_labels)) + 1
                    slot_id = f"{slot_label}{slot_number}"
                    
                    slots.append(TimeSlot(
                        slot_id=slot_id,
                        day=day,
                        start_time=current_time.strftime("%H:%M"),
                        end_time=slot_end.strftime("%H:%M"),
                        duration=request.slot_duration,
                        slot_type=SlotType.THEORY,
                        is_available=True
                    ))
                    slot_index += 1
                
                # Move to next time slot
                current_time = slot_end + timedelta(minutes=request.grace_time)
                
                # Skip break times
                for break_info in request.breaks:
                    break_start = datetime.strptime(break_info["start_time"], "%H:%M").time()
                    break_end = datetime.strptime(break_info["end_time"], "%H:%M").time()
                    
                    if current_time.time() >= break_start and current_time.time() < break_end:
                        # Skip to end of break
                        current_time = datetime.combine(datetime.today(), break_end)
                        break
        
        return slots
    
    def _process_courses(self, course_data: List[Dict], total_students: int) -> List[Course]:
        """Process course data and estimate student enrollment"""
        courses = []
        
        for course_dict in course_data:
            # Estimate students based on course type
            if course_dict.get("course_type") == "elective":
                estimated_students = int(total_students * course_dict.get("estimated_demand_percentage", 0.3))
            else:
                estimated_students = total_students
            
            course = Course(
                course_id=course_dict["course_id"],
                course_name=course_dict["course_name"],
                course_type=CourseType(course_dict.get("course_type", "core")),
                credits=course_dict.get("total_credits", 3),
                theory_hours=course_dict.get("theory_hours", 3),
                lab_hours=course_dict.get("lab_hours", 0),
                max_theory_capacity=course_dict.get("max_theory_capacity", 60),
                max_lab_capacity=course_dict.get("max_lab_capacity", 30),
                estimated_students=estimated_students,
                required_faculty_expertise=course_dict.get("required_expertise", []),
                is_compulsory=course_dict.get("is_compulsory", True)
            )
            courses.append(course)
        
        return courses
    
    def _process_faculty(self, faculty_data: List[Dict]) -> List[Faculty]:
        """Process faculty data"""
        faculty = []
        
        for faculty_dict in faculty_data:
            faculty_member = Faculty(
                faculty_id=faculty_dict["faculty_id"],
                name=faculty_dict["name"],
                expertise=faculty_dict.get("expertise", []),
                max_hours_per_week=faculty_dict.get("max_hours_per_week", 20),
                availability=faculty_dict.get("availability", {}),
                is_active=faculty_dict.get("is_active", True)
            )
            faculty.append(faculty_member)
        
        return faculty
    
    def _process_rooms(self, room_data: List[Dict]) -> List[Room]:
        """Process room data"""
        rooms = []
        
        for room_dict in room_data:
            room = Room(
                room_id=room_dict["room_id"],
                name=room_dict["name"],
                capacity=room_dict.get("capacity", 60),
                room_type=room_dict.get("room_type", "classroom"),
                equipment=room_dict.get("equipment", []),
                availability=room_dict.get("availability", {}),
                is_available=room_dict.get("is_available", True)
            )
            rooms.append(room)
        
        return rooms
    
    def _calculate_sections(self, courses: List[Course], total_students: int) -> List[Section]:
        """Calculate required sections for all courses"""
        sections = []
        section_counter = 1
        
        for course in courses:
            # Calculate theory sections
            if course.theory_hours > 0:
                theory_sections_needed = max(1, (course.estimated_students + course.max_theory_capacity - 1) // course.max_theory_capacity)
                
                for i in range(theory_sections_needed):
                    section = Section(
                        section_id=f"{course.course_id}_T{i+1}",
                        course_id=course.course_id,
                        section_type=SlotType.THEORY,
                        max_students=course.max_theory_capacity,
                        assigned_faculty="",
                        assigned_room="",
                        assigned_slots=[],
                        enrolled_students=[]
                    )
                    sections.append(section)
            
            # Calculate lab sections
            if course.lab_hours > 0:
                lab_sections_needed = max(1, (course.estimated_students + course.max_lab_capacity - 1) // course.max_lab_capacity)
                
                for i in range(lab_sections_needed):
                    section = Section(
                        section_id=f"{course.course_id}_L{i+1}",
                        course_id=course.course_id,
                        section_type=SlotType.LAB,
                        max_students=course.max_lab_capacity,
                        assigned_faculty="",
                        assigned_room="",
                        assigned_slots=[],
                        enrolled_students=[]
                    )
                    sections.append(section)
        
        return sections
    
    def _solve_timetable_constraints(self, request: UnifiedTimetableRequest) -> List[Dict]:
        """Solve timetable using OR-Tools constraint satisfaction"""
        self.model = cp_model.CpModel()
        
        # Decision variables: section s assigned to slot t in room r with faculty f
        assignments = {}
        
        for section in self.sections:
            for slot in self.time_slots:
                for room in self.rooms:
                    for faculty in self.faculty:
                        var_name = f"assign_{section.section_id}_{slot.slot_id}_{room.room_id}_{faculty.faculty_id}"
                        assignments[(section.section_id, slot.slot_id, room.room_id, faculty.faculty_id)] = \
                            self.model.NewBoolVar(var_name)
        
        # Constraint 1: Each section must be assigned exactly once
        for section in self.sections:
            self.model.Add(
                sum(assignments.get((section.section_id, slot.slot_id, room.room_id, faculty.faculty_id), 0)
                    for slot in self.time_slots
                    for room in self.rooms
                    for faculty in self.faculty) == 1
            )
        
        # Constraint 2: No room conflicts (one section per room per slot)
        for slot in self.time_slots:
            for room in self.rooms:
                self.model.Add(
                    sum(assignments.get((section.section_id, slot.slot_id, room.room_id, faculty.faculty_id), 0)
                        for section in self.sections
                        for faculty in self.faculty) <= 1
                )
        
        # Constraint 3: No faculty conflicts (one section per faculty per slot)
        for slot in self.time_slots:
            for faculty in self.faculty:
                self.model.Add(
                    sum(assignments.get((section.section_id, slot.slot_id, room.room_id, faculty.faculty_id), 0)
                        for section in self.sections
                        for room in self.rooms) <= 1
                )
        
        # Constraint 4: Room capacity must accommodate section size
        for section in self.sections:
            for slot in self.time_slots:
                for room in self.rooms:
                    for faculty in self.faculty:
                        if room.capacity < section.max_students:
                            self.model.Add(
                                assignments.get((section.section_id, slot.slot_id, room.room_id, faculty.faculty_id), 0) == 0
                            )
        
        # Constraint 5: Faculty expertise matching
        for section in self.sections:
            course = next(c for c in self.courses if c.course_id == section.course_id)
            for slot in self.time_slots:
                for room in self.rooms:
                    for faculty in self.faculty:
                        # Check if faculty has required expertise
                        if course.required_faculty_expertise:
                            has_expertise = any(exp in faculty.expertise for exp in course.required_faculty_expertise)
                            if not has_expertise:
                                self.model.Add(
                                    assignments.get((section.section_id, slot.slot_id, room.room_id, faculty.faculty_id), 0) == 0
                                )
        
        # Constraint 6: Lab sections need lab rooms
        for section in self.sections:
            if section.section_type == SlotType.LAB:
                for slot in self.time_slots:
                    for room in self.rooms:
                        for faculty in self.faculty:
                            if room.room_type != "lab":
                                self.model.Add(
                                    assignments.get((section.section_id, slot.slot_id, room.room_id, faculty.faculty_id), 0) == 0
                                )
        
        # Solve the model
        self.solver = cp_model.CpSolver()
        self.solver.parameters.max_time_in_seconds = 60.0  # 1 minute timeout
        
        status = self.solver.Solve(self.model)
        
        schedule = []
        if status == cp_model.OPTIMAL or status == cp_model.FEASIBLE:
            for section in self.sections:
                for slot in self.time_slots:
                    for room in self.rooms:
                        for faculty in self.faculty:
                            var = assignments.get((section.section_id, slot.slot_id, room.room_id, faculty.faculty_id))
                            if var and self.solver.Value(var) == 1:
                                # Update section with assignment
                                section.assigned_faculty = faculty.faculty_id
                                section.assigned_room = room.room_id
                                section.assigned_slots = [slot.slot_id]
                                
                                # Add to schedule
                                course = next(c for c in self.courses if c.course_id == section.course_id)
                                schedule.append({
                                    "section_id": section.section_id,
                                    "course_id": course.course_id,
                                    "course_name": course.course_name,
                                    "faculty_id": faculty.faculty_id,
                                    "faculty_name": faculty.name,
                                    "room_id": room.room_id,
                                    "room_name": room.name,
                                    "slot_id": slot.slot_id,
                                    "day": slot.day,
                                    "start_time": slot.start_time,
                                    "end_time": slot.end_time,
                                    "duration": slot.duration,
                                    "section_type": section.section_type.value,
                                    "max_students": section.max_students
                                })
        
        return schedule
    
    def _allocate_students(self, student_ids: List[str], sections: List[Section]) -> Dict[str, Dict[str, str]]:
        """Allocate students to sections"""
        allocations = {}
        
        # Group sections by course
        course_sections = {}
        for section in sections:
            if section.course_id not in course_sections:
                course_sections[section.course_id] = []
            course_sections[section.course_id].append(section)
        
        # Allocate students to sections
        for student_id in student_ids:
            student_allocation = {}
            
            for course_id, sections_list in course_sections.items():
                course = next(c for c in self.courses if c.course_id == course_id)
                
                # For electives, only allocate based on demand percentage
                if course.course_type == CourseType.ELECTIVE:
                    import random
                    if random.random() > course.estimated_students / len(student_ids):
                        continue
                
                # Find section with available capacity
                for section in sections_list:
                    if len(section.enrolled_students) < section.max_students:
                        section.enrolled_students.append(student_id)
                        student_allocation[course_id] = section.section_id
                        break
            
            allocations[student_id] = student_allocation
        
        return allocations
    
    def _detect_conflicts(self, schedule: List[Dict]) -> List[Dict]:
        """Detect conflicts in the generated schedule"""
        conflicts = []
        
        # Check for faculty conflicts
        faculty_schedule = {}
        for item in schedule:
            key = f"{item['faculty_id']}_{item['day']}_{item['start_time']}"
            if key in faculty_schedule:
                conflicts.append({
                    "type": "faculty_conflict",
                    "description": f"Faculty {item['faculty_name']} has overlapping assignments",
                    "severity": "high",
                    "affected_items": [faculty_schedule[key], item]
                })
            else:
                faculty_schedule[key] = item
        
        # Check for room conflicts
        room_schedule = {}
        for item in schedule:
            key = f"{item['room_id']}_{item['day']}_{item['start_time']}"
            if key in room_schedule:
                conflicts.append({
                    "type": "room_conflict",
                    "description": f"Room {item['room_name']} has overlapping bookings",
                    "severity": "high",
                    "affected_items": [room_schedule[key], item]
                })
            else:
                room_schedule[key] = item
        
        return conflicts
    
    def _calculate_metrics(self, schedule: List[Dict], sections: List[Section], student_allocations: Dict) -> Dict[str, Any]:
        """Calculate optimization metrics"""
        total_slots = len(self.time_slots) * len(self.rooms)
        used_slots = len(schedule)
        
        # Faculty utilization
        faculty_hours = {}
        for item in schedule:
            faculty_id = item['faculty_id']
            faculty_hours[faculty_id] = faculty_hours.get(faculty_id, 0) + item['duration'] / 60.0
        
        total_faculty_capacity = sum(f.max_hours_per_week for f in self.faculty)
        used_faculty_hours = sum(faculty_hours.values())
        faculty_utilization = (used_faculty_hours / total_faculty_capacity) * 100 if total_faculty_capacity > 0 else 0
        
        # Room utilization
        room_utilization = (used_slots / total_slots) * 100 if total_slots > 0 else 0
        
        # Student allocation success rate
        total_possible_allocations = len(student_allocations) * len([c for c in self.courses if c.is_compulsory])
        actual_allocations = sum(len(alloc) for alloc in student_allocations.values())
        allocation_success_rate = (actual_allocations / total_possible_allocations) * 100 if total_possible_allocations > 0 else 0
        
        return {
            "faculty_utilization": round(faculty_utilization, 1),
            "room_utilization": round(room_utilization, 1),
            "allocation_success_rate": round(allocation_success_rate, 1),
            "total_sections": len(sections),
            "total_assignments": len(schedule),
            "faculty_workload_distribution": faculty_hours
        }
    
    def _calculate_optimization_score(self, metrics: Dict, conflicts: List[Dict]) -> float:
        """Calculate overall optimization score"""
        base_score = 100.0
        
        # Deduct points for conflicts
        high_severity_conflicts = len([c for c in conflicts if c.get("severity") == "high"])
        medium_severity_conflicts = len([c for c in conflicts if c.get("severity") == "medium"])
        
        base_score -= (high_severity_conflicts * 20)  # 20 points per high severity conflict
        base_score -= (medium_severity_conflicts * 10)  # 10 points per medium severity conflict
        
        # Bonus for good utilization
        if metrics.get("faculty_utilization", 0) > 70:
            base_score += 5
        if metrics.get("room_utilization", 0) > 60:
            base_score += 5
        if metrics.get("allocation_success_rate", 0) > 90:
            base_score += 10
        
        return max(0.0, min(100.0, base_score))
    
    def _generate_recommendations(self, conflicts: List[Dict], metrics: Dict) -> List[str]:
        """Generate recommendations for improvement"""
        recommendations = []
        
        if conflicts:
            recommendations.append(f"Resolve {len(conflicts)} scheduling conflicts to improve timetable quality")
        
        if metrics.get("faculty_utilization", 0) < 50:
            recommendations.append("Consider reducing faculty count or increasing course load for better utilization")
        
        if metrics.get("room_utilization", 0) < 40:
            recommendations.append("Room utilization is low - consider consolidating classes or reducing room inventory")
        
        if metrics.get("allocation_success_rate", 0) < 80:
            recommendations.append("Student allocation success rate is low - review section capacities and course requirements")
        
        if not recommendations:
            recommendations.append("Timetable is well-optimized with no major issues detected")
        
        return recommendations
    
    def _create_slot_grid(self) -> Dict[str, List[str]]:
        """Create a visual representation of the slot grid"""
        grid = {}
        
        for day in set(slot.day for slot in self.time_slots):
            day_slots = [slot for slot in self.time_slots if slot.day == day]
            day_slots.sort(key=lambda x: x.start_time)
            grid[day] = [f"{slot.slot_id} ({slot.start_time}-{slot.end_time})" for slot in day_slots]
        
        return grid

# Factory function for easy instantiation
def create_unified_timetable_generator() -> UnifiedTimetableGenerator:
    """Create a new instance of the unified timetable generator"""
    return UnifiedTimetableGenerator()
