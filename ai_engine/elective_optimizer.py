"""
Elective Assignment Optimization Engine
Uses constraint satisfaction and optimization techniques to assign students to elective sections
"""

from typing import Dict, List, Set, Tuple, Optional
import logging
from dataclasses import dataclass
from timetable_config import ElectiveSection, StudentElectivePreference, ElectiveAssignmentResult

logger = logging.getLogger(__name__)

@dataclass
class AssignmentConstraint:
    """Represents a constraint in the assignment problem"""
    student_id: str
    section_id: str
    is_feasible: bool
    preference_rank: int  # 1 = first choice, 2 = second choice, etc.
    conflict_reason: Optional[str] = None

class ElectiveAssignmentOptimizer:
    """Optimizes student-to-elective-section assignments using constraint satisfaction"""
    
    def __init__(self):
        self.preference_weights = {1: 10, 2: 7, 3: 5, 4: 3, 5: 1}  # Preference rank weights
        
    def optimize_assignments(self, 
                           sections: List[ElectiveSection],
                           preferences: List[StudentElectivePreference],
                           core_schedule: Dict[str, List[str]]) -> ElectiveAssignmentResult:
        """
        Main optimization function using constraint satisfaction
        
        Args:
            sections: List of available elective sections
            preferences: Student preferences for electives
            core_schedule: Dict mapping student_id to list of occupied slot_ids from core courses
        """
        try:
            # Step 1: Build constraint matrix
            constraints = self._build_constraints(sections, preferences, core_schedule)
            
            # Step 2: Run optimization algorithm
            assignments = self._solve_assignment_problem(constraints, sections, preferences)
            
            # Step 3: Analyze results
            result = self._analyze_results(assignments, sections, preferences, constraints)
            
            logger.info(f"Assignment optimization completed. Success rate: {len(assignments)}/{len(preferences)}")
            return result
            
        except Exception as e:
            logger.error(f"Assignment optimization failed: {str(e)}")
            return ElectiveAssignmentResult(
                success=False,
                assignments={},
                unassigned_students=[p.student_id for p in preferences],
                section_utilization={},
                conflicts=[{"error": str(e)}],
                optimization_score=0.0
            )
    
    def _build_constraints(self, 
                          sections: List[ElectiveSection],
                          preferences: List[StudentElectivePreference],
                          core_schedule: Dict[str, List[str]]) -> List[AssignmentConstraint]:
        """Build constraint matrix for all student-section combinations"""
        constraints = []
        
        for preference in preferences:
            student_id = preference.student_id
            student_core_slots = core_schedule.get(student_id, [])
            
            # Check each preferred elective
            for rank, elective_id in enumerate(preference.preferences, 1):
                # Find all sections for this elective
                elective_sections = [s for s in sections if s.elective_id == elective_id]
                
                for section in elective_sections:
                    # Check feasibility
                    is_feasible, conflict_reason = self._check_section_feasibility(
                        student_core_slots, section.slot_pattern
                    )
                    
                    constraint = AssignmentConstraint(
                        student_id=student_id,
                        section_id=section.section_id,
                        is_feasible=is_feasible,
                        preference_rank=rank,
                        conflict_reason=conflict_reason
                    )
                    constraints.append(constraint)
        
        return constraints
    
    def _check_section_feasibility(self, 
                                 student_core_slots: List[str], 
                                 section_slots: List[str]) -> Tuple[bool, Optional[str]]:
        """Check if a student can be assigned to a section without conflicts"""
        # Check for slot conflicts
        conflicts = set(student_core_slots) & set(section_slots)
        if conflicts:
            return False, f"Slot conflicts: {', '.join(conflicts)}"
        
        return True, None
    
    def _solve_assignment_problem(self, 
                                constraints: List[AssignmentConstraint],
                                sections: List[ElectiveSection],
                                preferences: List[StudentElectivePreference]) -> Dict[str, str]:
        """Solve the assignment problem using greedy optimization with backtracking"""
        
        # Initialize section capacities
        section_capacity = {s.section_id: s.max_students for s in sections}
        section_enrolled = {s.section_id: 0 for s in sections}
        
        # Sort constraints by preference rank and feasibility
        feasible_constraints = [c for c in constraints if c.is_feasible]
        feasible_constraints.sort(key=lambda x: (x.preference_rank, x.student_id))
        
        assignments = {}
        student_assigned = set()
        
        # Greedy assignment with preference optimization
        for constraint in feasible_constraints:
            student_id = constraint.student_id
            section_id = constraint.section_id
            
            # Skip if student already assigned
            if student_id in student_assigned:
                continue
            
            # Skip if section is full
            if section_enrolled[section_id] >= section_capacity[section_id]:
                continue
            
            # Check if this student has any elective assigned for the same elective
            assigned_section = assignments.get(student_id)
            if assigned_section:
                assigned_elective = self._get_elective_id_from_section(assigned_section, sections)
                current_elective = self._get_elective_id_from_section(section_id, sections)
                if assigned_elective == current_elective:
                    continue
            
            # Assign student to section
            assignments[student_id] = section_id
            section_enrolled[section_id] += 1
            student_assigned.add(student_id)
        
        # Try to improve assignments using local search
        assignments = self._improve_assignments(assignments, constraints, section_capacity, sections)
        
        return assignments
    
    def _improve_assignments(self, 
                           initial_assignments: Dict[str, str],
                           constraints: List[AssignmentConstraint],
                           section_capacity: Dict[str, int],
                           sections: List[ElectiveSection]) -> Dict[str, str]:
        """Improve assignments using local search optimization"""
        assignments = initial_assignments.copy()
        improved = True
        iterations = 0
        max_iterations = 100
        
        while improved and iterations < max_iterations:
            improved = False
            iterations += 1
            
            # Try to swap assignments to improve overall satisfaction
            for student_id, current_section in list(assignments.items()):
                current_rank = self._get_preference_rank(student_id, current_section, constraints)
                
                # Look for better alternatives
                student_constraints = [c for c in constraints if c.student_id == student_id and c.is_feasible]
                
                for constraint in student_constraints:
                    if constraint.preference_rank < current_rank:  # Better preference
                        target_section = constraint.section_id
                        
                        # Check if target section has capacity
                        current_enrolled = sum(1 for s in assignments.values() if s == target_section)
                        if current_enrolled < section_capacity[target_section]:
                            # Make the swap
                            assignments[student_id] = target_section
                            improved = True
                            break
        
        return assignments
    
    def _get_preference_rank(self, student_id: str, section_id: str, constraints: List[AssignmentConstraint]) -> int:
        """Get preference rank for a student-section pair"""
        for constraint in constraints:
            if constraint.student_id == student_id and constraint.section_id == section_id:
                return constraint.preference_rank
        return 999  # Very low preference if not found
    
    def _get_elective_id_from_section(self, section_id: str, sections: List[ElectiveSection]) -> str:
        """Get elective ID from section ID"""
        for section in sections:
            if section.section_id == section_id:
                return section.elective_id
        return ""
    
    def _analyze_results(self, 
                        assignments: Dict[str, str],
                        sections: List[ElectiveSection],
                        preferences: List[StudentElectivePreference],
                        constraints: List[AssignmentConstraint]) -> ElectiveAssignmentResult:
        """Analyze assignment results and generate comprehensive report"""
        
        # Calculate section utilization
        section_utilization = {}
        for section in sections:
            enrolled_count = sum(1 for assigned_section in assignments.values() 
                               if assigned_section == section.section_id)
            section_utilization[section.section_id] = enrolled_count
        
        # Find unassigned students
        all_students = {p.student_id for p in preferences}
        assigned_students = set(assignments.keys())
        unassigned_students = list(all_students - assigned_students)
        
        # Calculate optimization score
        total_score = 0
        max_possible_score = 0
        
        for student_id, section_id in assignments.items():
            rank = self._get_preference_rank(student_id, section_id, constraints)
            score = self.preference_weights.get(rank, 0)
            total_score += score
        
        for preference in preferences:
            max_possible_score += self.preference_weights.get(1, 10)  # Max score if all get first choice
        
        optimization_score = (total_score / max_possible_score) if max_possible_score > 0 else 0
        
        # Identify conflicts and issues
        conflicts = []
        for student_id in unassigned_students:
            student_constraints = [c for c in constraints if c.student_id == student_id]
            feasible_constraints = [c for c in student_constraints if c.is_feasible]
            
            if not feasible_constraints:
                conflicts.append({
                    "type": "no_feasible_sections",
                    "student_id": student_id,
                    "description": "No feasible sections available for student's preferences"
                })
            else:
                conflicts.append({
                    "type": "capacity_exceeded",
                    "student_id": student_id,
                    "description": "All preferred sections are at capacity"
                })
        
        return ElectiveAssignmentResult(
            success=len(unassigned_students) == 0,
            assignments=assignments,
            unassigned_students=unassigned_students,
            section_utilization=section_utilization,
            conflicts=conflicts,
            optimization_score=optimization_score
        )

class ElectiveScheduleValidator:
    """Validates elective schedules for conflicts and constraints"""
    
    def validate_schedule(self, 
                         assignments: Dict[str, str],
                         sections: List[ElectiveSection],
                         core_schedule: Dict[str, List[str]]) -> Dict:
        """Validate the complete elective schedule"""
        
        validation_results = {
            "is_valid": True,
            "conflicts": [],
            "warnings": [],
            "statistics": {}
        }
        
        # Check for slot conflicts
        for student_id, section_id in assignments.items():
            section = next((s for s in sections if s.section_id == section_id), None)
            if section:
                student_core_slots = core_schedule.get(student_id, [])
                conflicts = set(student_core_slots) & set(section.slot_pattern)
                
                if conflicts:
                    validation_results["is_valid"] = False
                    validation_results["conflicts"].append({
                        "type": "slot_conflict",
                        "student_id": student_id,
                        "section_id": section_id,
                        "conflicting_slots": list(conflicts)
                    })
        
        # Check section capacities
        section_enrollments = {}
        for section_id in assignments.values():
            section_enrollments[section_id] = section_enrollments.get(section_id, 0) + 1
        
        for section in sections:
            enrolled = section_enrollments.get(section.section_id, 0)
            if enrolled > section.max_students:
                validation_results["is_valid"] = False
                validation_results["conflicts"].append({
                    "type": "capacity_exceeded",
                    "section_id": section.section_id,
                    "enrolled": enrolled,
                    "capacity": section.max_students
                })
        
        # Generate statistics
        validation_results["statistics"] = {
            "total_assignments": len(assignments),
            "total_sections_used": len(set(assignments.values())),
            "average_section_utilization": sum(section_enrollments.values()) / len(sections) if sections else 0
        }
        
        return validation_results
