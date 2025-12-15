"""
Base Timetable Configuration Models and Logic
Handles the one-time admin setup for creating base timetable structure
"""

from pydantic import BaseModel, Field
from typing import List, Dict, Optional, Tuple
from datetime import time, datetime, timedelta
from enum import Enum

class SlotLength(str, Enum):
    FIFTY_MIN = "50"
    FIFTY_FIVE_MIN = "55"
    SIXTY_MIN = "60"

class BreakType(str, Enum):
    MORNING = "morning"
    LUNCH = "lunch"
    EVENING = "evening"

class Break(BaseModel):
    type: BreakType
    start_time: time
    end_time: time
    duration: int  # in minutes
    is_active: bool = True

class BaseTimetableConfig(BaseModel):
    """Admin configuration for base timetable setup"""
    college_start_time: time = Field(..., description="College start time (e.g., 8:30 AM)")
    college_end_time: time = Field(..., description="College end time (e.g., 5:30 PM)")
    slot_length: SlotLength = Field(..., description="Duration of each teaching slot")
    grace_time: int = Field(default=10, description="Buffer time between slots in minutes")
    breaks: List[Break] = Field(default_factory=list, description="List of breaks")
    working_days: List[str] = Field(default=["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"])
    
class TimeSlotPattern(BaseModel):
    """Represents a time slot in the timetable grid"""
    slot_id: str  # e.g., "A1", "B2", "C1"
    day: str  # Monday, Tuesday, etc.
    start_time: time
    end_time: time
    duration: int  # in minutes
    is_break: bool = False
    break_type: Optional[BreakType] = None

class TimetableGrid(BaseModel):
    """Complete timetable grid generated from base configuration"""
    config: BaseTimetableConfig
    slots: List[TimeSlotPattern]
    total_slots_per_day: int
    total_teaching_slots_per_day: int
    grid_matrix: Dict[str, List[str]]  # day -> list of slot_ids
    
class ElectiveSection(BaseModel):
    """Represents a section of an elective course"""
    section_id: str
    elective_id: str
    elective_name: str
    faculty_id: Optional[str] = None
    max_students: int = 40
    enrolled_students: List[str] = Field(default_factory=list)
    slot_pattern: List[str] = Field(default_factory=list)  # List of slot_ids
    room_id: Optional[str] = None

class StudentElectivePreference(BaseModel):
    """Student's ranked preferences for electives"""
    student_id: str
    preferences: List[str] = Field(..., description="Ordered list of elective_ids by preference")
    assigned_sections: List[str] = Field(default_factory=list)

class ElectiveAssignmentResult(BaseModel):
    """Result of elective assignment optimization"""
    success: bool
    assignments: Dict[str, str]  # student_id -> section_id
    unassigned_students: List[str]
    section_utilization: Dict[str, int]  # section_id -> enrolled_count
    conflicts: List[Dict]
    optimization_score: float

class TimetableConfigManager:
    """Manages base timetable configuration and grid generation"""
    
    def __init__(self):
        self.slot_labels = ["A", "B", "C", "D", "E", "F", "G", "H"]  # Up to 8 slots per day
    
    def generate_timetable_grid(self, config: BaseTimetableConfig) -> TimetableGrid:
        """Generate complete timetable grid from base configuration"""
        slots = []
        grid_matrix = {}
        
        slot_duration = int(config.slot_length.value)
        
        for day in config.working_days:
            daily_slots = []
            current_time = config.college_start_time
            slot_index = 0
            
            while current_time < config.college_end_time:
                # Check if current time falls within a break
                is_break_slot, break_type = self._is_break_time(current_time, config.breaks)
                
                if is_break_slot:
                    # Create break slot
                    break_end_time = self._get_break_end_time(current_time, config.breaks)
                    break_duration = self._time_diff_minutes(current_time, break_end_time)
                    
                    break_slot = TimeSlotPattern(
                        slot_id=f"BREAK_{break_type.upper()}_{day[:3]}",
                        day=day,
                        start_time=current_time,
                        end_time=break_end_time,
                        duration=break_duration,
                        is_break=True,
                        break_type=break_type
                    )
                    slots.append(break_slot)
                    current_time = break_end_time
                else:
                    # Create teaching slot
                    end_time = self._add_minutes_to_time(current_time, slot_duration)
                    
                    # Check if slot would exceed college end time
                    if end_time > config.college_end_time:
                        break
                    
                    slot_id = f"{self.slot_labels[slot_index]}{self._get_period_number(current_time, config)}"
                    
                    teaching_slot = TimeSlotPattern(
                        slot_id=slot_id,
                        day=day,
                        start_time=current_time,
                        end_time=end_time,
                        duration=slot_duration,
                        is_break=False
                    )
                    
                    slots.append(teaching_slot)
                    daily_slots.append(slot_id)
                    
                    # Add grace time
                    current_time = self._add_minutes_to_time(end_time, config.grace_time)
                    slot_index += 1
            
            grid_matrix[day] = daily_slots
        
        # Calculate statistics
        total_slots_per_day = max(len(daily_slots) for daily_slots in grid_matrix.values())
        total_teaching_slots_per_day = len([s for s in slots if not s.is_break and s.day == config.working_days[0]])
        
        return TimetableGrid(
            config=config,
            slots=slots,
            total_slots_per_day=total_slots_per_day,
            total_teaching_slots_per_day=total_teaching_slots_per_day,
            grid_matrix=grid_matrix
        )
    
    def generate_elective_sections(self, 
                                 electives: List[Dict], 
                                 grid: TimetableGrid,
                                 core_slots: List[str],
                                 sections_per_elective: int = 2) -> List[ElectiveSection]:
        """Generate multiple sections for each elective with different slot patterns"""
        sections = []
        
        # Get available slots (excluding core course slots)
        available_slots = []
        for day_slots in grid.grid_matrix.values():
            for slot_id in day_slots:
                if slot_id not in core_slots:
                    available_slots.append(slot_id)
        
        for elective in electives:
            elective_id = elective['id']
            elective_name = elective['name']
            credits = elective.get('credits', 3)
            
            # Generate different slot patterns for each section
            for section_num in range(sections_per_elective):
                section_id = f"{elective_id}_SEC{section_num + 1}"
                
                # Generate diverse slot pattern
                slot_pattern = self._generate_slot_pattern(
                    available_slots, 
                    credits, 
                    grid.grid_matrix,
                    section_num
                )
                
                section = ElectiveSection(
                    section_id=section_id,
                    elective_id=elective_id,
                    elective_name=elective_name,
                    slot_pattern=slot_pattern,
                    max_students=elective.get('max_students', 40)
                )
                
                sections.append(section)
        
        return sections
    
    def _generate_slot_pattern(self, 
                             available_slots: List[str], 
                             credits: int, 
                             grid_matrix: Dict[str, List[str]],
                             section_variant: int) -> List[str]:
        """Generate a slot pattern for a section, ensuring diversity across sections"""
        pattern = []
        used_days = set()
        
        # Strategy: distribute slots across different days and time periods
        day_slots = {}
        for day, slots in grid_matrix.items():
            day_slots[day] = [s for s in slots if s in available_slots]
        
        # For different section variants, use different strategies
        if section_variant == 0:
            # Section 1: Prefer morning slots, spread across days
            preference_order = ["Monday", "Wednesday", "Friday", "Tuesday", "Thursday"]
        else:
            # Section 2: Prefer afternoon slots, different day pattern
            preference_order = ["Tuesday", "Thursday", "Monday", "Wednesday", "Friday"]
        
        slots_needed = credits
        for day in preference_order:
            if slots_needed <= 0:
                break
                
            if day in day_slots and day_slots[day]:
                # For variant 0, prefer earlier slots; for variant 1, prefer later slots
                day_available = day_slots[day]
                if section_variant == 0:
                    slot = day_available[0] if day_available else None
                else:
                    slot = day_available[-1] if day_available else None
                
                if slot and slot not in pattern:
                    pattern.append(slot)
                    slots_needed -= 1
                    used_days.add(day)
        
        # If still need more slots, fill from remaining available slots
        while slots_needed > 0 and available_slots:
            for slot in available_slots:
                if slot not in pattern:
                    pattern.append(slot)
                    slots_needed -= 1
                    break
            else:
                break
        
        return pattern[:credits]  # Ensure we don't exceed required credits
    
    def _is_break_time(self, current_time: time, breaks: List[Break]) -> Tuple[bool, Optional[BreakType]]:
        """Check if current time falls within any break"""
        for break_item in breaks:
            if break_item.is_active and break_item.start_time <= current_time < break_item.end_time:
                return True, break_item.type
        return False, None
    
    def _get_break_end_time(self, current_time: time, breaks: List[Break]) -> time:
        """Get end time of break that contains current time"""
        for break_item in breaks:
            if break_item.is_active and break_item.start_time <= current_time < break_item.end_time:
                return break_item.end_time
        return current_time
    
    def _get_period_number(self, current_time: time, config: BaseTimetableConfig) -> int:
        """Determine period number (1 for morning, 2 for afternoon)"""
        # Simple logic: before 1 PM is period 1, after is period 2
        noon = time(13, 0)  # 1 PM
        return 1 if current_time < noon else 2
    
    def _add_minutes_to_time(self, time_obj: time, minutes: int) -> time:
        """Add minutes to a time object"""
        dt = datetime.combine(datetime.today(), time_obj)
        dt = dt.replace(microsecond=0)
        new_dt = dt + timedelta(minutes=minutes)
        return new_dt.time()
    
    def _time_diff_minutes(self, start_time: time, end_time: time) -> int:
        """Calculate difference between two times in minutes"""
        start_dt = datetime.combine(datetime.today(), start_time)
        end_dt = datetime.combine(datetime.today(), end_time)
        return int((end_dt - start_dt).total_seconds() / 60)
