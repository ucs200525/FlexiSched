"""
Comprehensive Course Sectioning System
Handles automatic sectioning for all course types (core + electives + labs)
based on student strength, room capacity, and faculty availability
"""

from pydantic import BaseModel, Field
from typing import List, Dict, Optional, Tuple, Set
from enum import Enum
import math
import logging
from dataclasses import dataclass

logger = logging.getLogger(__name__)

class CourseType(str, Enum):
    CORE = "core"
    ELECTIVE = "elective" 
    LAB = "lab"
    CLINIC = "clinic"

class SessionType(str, Enum):
    THEORY = "theory"
    LAB = "lab"
    PRACTICAL = "practical"

@dataclass
class CourseDefinition:
    """Complete course definition with sectioning requirements"""
    course_id: str
    course_name: str
    course_type: CourseType
    total_credits: int
    theory_hours: int
    lab_hours: int
    is_compulsory: bool
    max_theory_capacity: int = 60  # Room capacity for theory
    max_lab_capacity: int = 40     # Lab capacity (smaller groups)
    requires_continuous_lab: bool = True  # Labs need continuous slots
    estimated_demand_percentage: float = 1.0  # For electives (0.0-1.0)

class SectionDefinition(BaseModel):
    """Individual section of a course"""
    section_id: str
    course_id: str
    course_name: str
    course_type: CourseType
    session_type: SessionType
    max_capacity: int
    enrolled_students: List[str] = Field(default_factory=list)
    assigned_slots: List[str] = Field(default_factory=list)
    faculty_id: Optional[str] = None
    room_id: Optional[str] = None
    is_continuous: bool = False  # For lab sessions

class StudentAllocation(BaseModel):
    """Student's complete course allocation"""
    student_id: str
    allocated_sections: Dict[str, str] = Field(default_factory=dict)  # course_id -> section_id
    total_credits: int = 0
    occupied_slots: Set[str] = Field(default_factory=set)

class SectioningResult(BaseModel):
    """Complete sectioning result for all courses"""
    sections: List[SectionDefinition]
    student_allocations: List[StudentAllocation]
    section_utilization: Dict[str, int]  # section_id -> enrolled_count
    conflicts: List[Dict]
    success_rate: float
    total_sections_created: int

class ComprehensiveSectioningEngine:
    """Main engine for comprehensive course sectioning"""
    
    def __init__(self, timetable_grid):
        self.timetable_grid = timetable_grid
        self.available_theory_slots = []
        self.available_lab_slots = []
        self._initialize_slot_pools()
    
    def _initialize_slot_pools(self):
        """Initialize available slot pools for theory and lab sessions"""
        for slot in self.timetable_grid.slots:
            if not slot.is_break:
                if slot.duration >= 180:  # 3+ hours for labs
                    self.available_lab_slots.append(slot.slot_id)
                elif slot.duration >= 50:  # Standard theory slots
                    self.available_theory_slots.append(slot.slot_id)
    
    def calculate_required_sections(self, 
                                  course: CourseDefinition, 
                                  total_students: int) -> Tuple[int, int]:
        """Calculate required theory and lab sections for a course"""
        
        if course.course_type == CourseType.ELECTIVE:
            # For electives, estimate demand
            estimated_students = int(total_students * course.estimated_demand_percentage)
        else:
            # Core/compulsory courses need all students
            estimated_students = total_students
        
        # Calculate theory sections
        theory_sections = 0
        if course.theory_hours > 0:
            theory_sections = math.ceil(estimated_students / course.max_theory_capacity)
        
        # Calculate lab sections
        lab_sections = 0
        if course.lab_hours > 0:
            lab_sections = math.ceil(estimated_students / course.max_lab_capacity)
        
        logger.info(f"Course {course.course_name}: {estimated_students} students -> "
                   f"{theory_sections} theory sections, {lab_sections} lab sections")
        
        return theory_sections, lab_sections
    
    def generate_all_sections(self, 
                            courses: List[CourseDefinition], 
                            total_students: int) -> List[SectionDefinition]:
        """Generate all sections for all courses"""
        
        all_sections = []
        used_slots = set()
        
        # Sort courses by priority (core first, then electives)
        sorted_courses = sorted(courses, key=lambda c: (
            0 if c.course_type == CourseType.CORE else 1,
            -c.total_credits  # Higher credit courses first
        ))
        
        for course in sorted_courses:
            theory_sections, lab_sections = self.calculate_required_sections(course, total_students)
            
            # Generate theory sections
            for i in range(theory_sections):
                section_id = f"{course.course_id}_TH_SEC{i+1}"
                
                # Find available slots for this section
                theory_slots_needed = course.theory_hours
                assigned_slots = self._allocate_slots(
                    theory_slots_needed, 
                    self.available_theory_slots, 
                    used_slots,
                    continuous=False
                )
                
                if len(assigned_slots) == theory_slots_needed:
                    section = SectionDefinition(
                        section_id=section_id,
                        course_id=course.course_id,
                        course_name=course.course_name,
                        course_type=course.course_type,
                        session_type=SessionType.THEORY,
                        max_capacity=course.max_theory_capacity,
                        assigned_slots=assigned_slots,
                        is_continuous=False
                    )
                    all_sections.append(section)
                    used_slots.update(assigned_slots)
                    logger.info(f"Created theory section {section_id} with slots: {assigned_slots}")
                else:
                    logger.warning(f"Could not allocate enough slots for theory section {section_id}")
            
            # Generate lab sections
            for i in range(lab_sections):
                section_id = f"{course.course_id}_LAB_SEC{i+1}"
                
                # Labs need continuous slots
                lab_slots_needed = math.ceil(course.lab_hours / 2)  # Assuming 2-hour lab blocks
                assigned_slots = self._allocate_slots(
                    lab_slots_needed,
                    self.available_lab_slots,
                    used_slots,
                    continuous=course.requires_continuous_lab
                )
                
                if len(assigned_slots) >= 1:  # At least one lab slot
                    section = SectionDefinition(
                        section_id=section_id,
                        course_id=course.course_id,
                        course_name=course.course_name,
                        course_type=course.course_type,
                        session_type=SessionType.LAB,
                        max_capacity=course.max_lab_capacity,
                        assigned_slots=assigned_slots,
                        is_continuous=course.requires_continuous_lab
                    )
                    all_sections.append(section)
                    used_slots.update(assigned_slots)
                    logger.info(f"Created lab section {section_id} with slots: {assigned_slots}")
                else:
                    logger.warning(f"Could not allocate lab slots for section {section_id}")
        
        return all_sections
    
    def _allocate_slots(self, 
                       slots_needed: int, 
                       available_slots: List[str], 
                       used_slots: Set[str],
                       continuous: bool = False) -> List[str]:
        """Allocate slots for a section, avoiding conflicts"""
        
        if continuous and slots_needed > 1:
            # For continuous slots (labs), try to find consecutive slots
            return self._find_continuous_slots(slots_needed, available_slots, used_slots)
        else:
            # For theory, distribute across different days/times
            return self._find_distributed_slots(slots_needed, available_slots, used_slots)
    
    def _find_continuous_slots(self, 
                             slots_needed: int, 
                             available_slots: List[str], 
                             used_slots: Set[str]) -> List[str]:
        """Find continuous slots for lab sessions"""
        # Simplified: just take first available slots
        # In practice, would check for actual time continuity
        allocated = []
        for slot in available_slots:
            if slot not in used_slots and len(allocated) < slots_needed:
                allocated.append(slot)
        return allocated
    
    def _find_distributed_slots(self, 
                              slots_needed: int, 
                              available_slots: List[str], 
                              used_slots: Set[str]) -> List[str]:
        """Find distributed slots across different days/times"""
        allocated = []
        
        # Try to distribute across different day patterns
        day_patterns = {
            'morning': [s for s in available_slots if s.endswith('1')],
            'afternoon': [s for s in available_slots if s.endswith('2')]
        }
        
        # Alternate between morning and afternoon
        pattern_keys = list(day_patterns.keys())
        pattern_idx = 0
        
        while len(allocated) < slots_needed and pattern_idx < len(pattern_keys) * 3:
            current_pattern = pattern_keys[pattern_idx % len(pattern_keys)]
            pattern_slots = day_patterns[current_pattern]
            
            for slot in pattern_slots:
                if slot not in used_slots and slot not in allocated:
                    allocated.append(slot)
                    break
            
            pattern_idx += 1
        
        # If still need more slots, take any available
        for slot in available_slots:
            if slot not in used_slots and slot not in allocated and len(allocated) < slots_needed:
                allocated.append(slot)
        
        return allocated
    
    def allocate_students_to_sections(self, 
                                    sections: List[SectionDefinition],
                                    student_ids: List[str],
                                    student_preferences: Dict[str, List[str]] = None) -> List[StudentAllocation]:
        """Allocate students to sections ensuring no conflicts"""
        
        student_allocations = []
        
        # Group sections by course
        sections_by_course = {}
        for section in sections:
            if section.course_id not in sections_by_course:
                sections_by_course[section.course_id] = []
            sections_by_course[section.course_id].append(section)
        
        for student_id in student_ids:
            allocation = StudentAllocation(student_id=student_id)
            
            # For each course, assign student to a section
            for course_id, course_sections in sections_by_course.items():
                # Find a section with capacity and no slot conflicts
                assigned = False
                
                for section in course_sections:
                    # Check capacity
                    if len(section.enrolled_students) >= section.max_capacity:
                        continue
                    
                    # Check slot conflicts
                    section_slots = set(section.assigned_slots)
                    if section_slots & allocation.occupied_slots:
                        continue  # Conflict found
                    
                    # Assign student to this section
                    section.enrolled_students.append(student_id)
                    allocation.allocated_sections[course_id] = section.section_id
                    allocation.occupied_slots.update(section_slots)
                    assigned = True
                    break
                
                if not assigned:
                    logger.warning(f"Could not assign student {student_id} to course {course_id}")
            
            student_allocations.append(allocation)
        
        return student_allocations
    
    def optimize_sectioning(self, 
                          courses: List[CourseDefinition],
                          total_students: int,
                          student_ids: List[str],
                          student_preferences: Dict[str, List[str]] = None) -> SectioningResult:
        """Complete sectioning optimization process"""
        
        try:
            logger.info(f"Starting comprehensive sectioning for {len(courses)} courses, {total_students} students")
            
            # Step 1: Generate all sections
            sections = self.generate_all_sections(courses, total_students)
            
            # Step 2: Allocate students to sections
            student_allocations = self.allocate_students_to_sections(
                sections, student_ids, student_preferences
            )
            
            # Step 3: Calculate utilization and conflicts
            section_utilization = {}
            conflicts = []
            
            for section in sections:
                section_utilization[section.section_id] = len(section.enrolled_students)
                
                # Check for over-capacity
                if len(section.enrolled_students) > section.max_capacity:
                    conflicts.append({
                        "type": "over_capacity",
                        "section_id": section.section_id,
                        "enrolled": len(section.enrolled_students),
                        "capacity": section.max_capacity
                    })
            
            # Calculate success rate
            total_possible_assignments = len(student_ids) * len(set(s.course_id for s in sections))
            actual_assignments = sum(len(alloc.allocated_sections) for alloc in student_allocations)
            success_rate = actual_assignments / total_possible_assignments if total_possible_assignments > 0 else 0
            
            result = SectioningResult(
                sections=sections,
                student_allocations=student_allocations,
                section_utilization=section_utilization,
                conflicts=conflicts,
                success_rate=success_rate,
                total_sections_created=len(sections)
            )
            
            logger.info(f"Sectioning completed: {len(sections)} sections created, "
                       f"{success_rate:.2%} success rate")
            
            return result
            
        except Exception as e:
            logger.error(f"Sectioning optimization failed: {str(e)}")
            return SectioningResult(
                sections=[],
                student_allocations=[],
                section_utilization={},
                conflicts=[{"error": str(e)}],
                success_rate=0.0,
                total_sections_created=0
            )

def create_sample_semester_courses() -> List[CourseDefinition]:
    """Create sample semester courses as described in the requirements"""
    
    return [
        CourseDefinition(
            course_id="DSA",
            course_name="Data Structures & Algorithms",
            course_type=CourseType.CORE,
            total_credits=4,
            theory_hours=3,
            lab_hours=2,
            is_compulsory=True,
            max_theory_capacity=60,
            max_lab_capacity=40
        ),
        CourseDefinition(
            course_id="DM",
            course_name="Discrete Mathematics",
            course_type=CourseType.CORE,
            total_credits=4,
            theory_hours=4,
            lab_hours=0,
            is_compulsory=True,
            max_theory_capacity=60
        ),
        CourseDefinition(
            course_id="PROG",
            course_name="Programming",
            course_type=CourseType.CORE,
            total_credits=3,
            theory_hours=2,
            lab_hours=2,
            is_compulsory=True,
            max_theory_capacity=60,
            max_lab_capacity=40
        ),
        CourseDefinition(
            course_id="ENTR",
            course_name="Entrepreneurship",
            course_type=CourseType.CORE,
            total_credits=2,
            theory_hours=2,
            lab_hours=0,
            is_compulsory=True,
            max_theory_capacity=60
        ),
        CourseDefinition(
            course_id="SKILL",
            course_name="Skill Enhancement",
            course_type=CourseType.CORE,
            total_credits=3,
            theory_hours=3,
            lab_hours=0,
            is_compulsory=True,
            max_theory_capacity=60
        ),
        CourseDefinition(
            course_id="CLINIC",
            course_name="Engineering Clinics",
            course_type=CourseType.CLINIC,
            total_credits=2,
            theory_hours=0,
            lab_hours=4,
            is_compulsory=True,
            max_lab_capacity=40,
            requires_continuous_lab=True
        )
    ]
