"""
AI-Powered Base Timetable Generator
Responds to admin questions and generates intelligent slot timetables
with time mapping, working days, grace time, and break management
"""

from pydantic import BaseModel, Field
from typing import List, Dict, Optional, Any
from datetime import time, datetime, timedelta
import logging
from timetable_config import BaseTimetableConfig, TimetableGrid, TimetableConfigManager, Break, BreakType, SlotLength

logger = logging.getLogger(__name__)

class AdminQuestion(BaseModel):
    """Admin question for AI timetable generation"""
    question: str
    context: Optional[Dict[str, Any]] = Field(default_factory=dict)
    preferences: Optional[Dict[str, Any]] = Field(default_factory=dict)

class AITimetableResponse(BaseModel):
    """AI response with generated timetable and explanation"""
    generated_config: BaseTimetableConfig
    generated_grid: TimetableGrid
    explanation: str
    recommendations: List[str]
    slot_mapping: Dict[str, Dict[str, Any]]  # slot_id -> {day, start_time, end_time, duration}
    break_schedule: List[Dict[str, Any]]
    working_schedule: Dict[str, List[str]]  # day -> list of slot_ids

class AITimetableGenerator:
    """AI-powered timetable generator that understands admin requirements"""
    
    def __init__(self):
        self.config_manager = TimetableConfigManager()
        self.default_patterns = {
            "engineering": {
                "start_time": "08:30",
                "end_time": "17:30",
                "slot_length": "50",
                "grace_time": 10,
                "breaks": [
                    {"type": "morning", "start": "10:30", "end": "10:45"},
                    {"type": "lunch", "start": "13:00", "end": "14:00"}
                ]
            },
            "business": {
                "start_time": "09:00", 
                "end_time": "18:00",
                "slot_length": "60",
                "grace_time": 15,
                "breaks": [
                    {"type": "morning", "start": "11:00", "end": "11:15"},
                    {"type": "lunch", "start": "13:30", "end": "14:30"}
                ]
            },
            "medical": {
                "start_time": "08:00",
                "end_time": "18:00", 
                "slot_length": "55",
                "grace_time": 10,
                "breaks": [
                    {"type": "morning", "start": "10:15", "end": "10:30"},
                    {"type": "lunch", "start": "12:30", "end": "13:30"},
                    {"type": "evening", "start": "15:30", "end": "15:45"}
                ]
            }
        }
    
    def generate_from_question(self, admin_question: AdminQuestion) -> AITimetableResponse:
        """Generate base timetable from admin question using AI logic"""
        
        try:
            logger.info(f"Processing admin question: {admin_question.question}")
            
            # Parse question to extract requirements
            requirements = self._parse_admin_requirements(admin_question.question, admin_question.context)
            
            # Generate intelligent configuration
            config = self._generate_intelligent_config(requirements)
            
            # Generate timetable grid
            grid = self.config_manager.generate_timetable_grid(config)
            
            # Create detailed slot mapping
            slot_mapping = self._create_slot_mapping(grid)
            
            # Generate break schedule
            break_schedule = self._create_break_schedule(config)
            
            # Create working schedule
            working_schedule = self._create_working_schedule(grid)
            
            # Generate explanation and recommendations
            explanation = self._generate_explanation(requirements, config, grid)
            recommendations = self._generate_recommendations(config, grid)
            
            response = AITimetableResponse(
                generated_config=config,
                generated_grid=grid,
                explanation=explanation,
                recommendations=recommendations,
                slot_mapping=slot_mapping,
                break_schedule=break_schedule,
                working_schedule=working_schedule
            )
            
            logger.info(f"AI timetable generated successfully with {grid.total_teaching_slots_per_day} slots per day")
            return response
            
        except Exception as e:
            logger.error(f"AI timetable generation failed: {str(e)}")
            # Return fallback configuration
            return self._generate_fallback_response(admin_question)
    
    def _parse_admin_requirements(self, question: str, context: Dict[str, Any]) -> Dict[str, Any]:
        """Parse admin question to extract timetable requirements"""
        
        requirements = {
            "college_type": "engineering",  # default
            "start_time": None,
            "end_time": None,
            "slot_duration": None,
            "grace_time": None,
            "working_days": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
            "breaks": [],
            "special_requirements": []
        }
        
        question_lower = question.lower()
        
        # Detect college type
        if any(word in question_lower for word in ["engineering", "technical", "polytechnic"]):
            requirements["college_type"] = "engineering"
        elif any(word in question_lower for word in ["business", "management", "mba"]):
            requirements["college_type"] = "business"
        elif any(word in question_lower for word in ["medical", "nursing", "pharmacy"]):
            requirements["college_type"] = "medical"
        
        # Extract time preferences
        if "8:30" in question or "8.30" in question:
            requirements["start_time"] = "08:30"
        elif "9:00" in question or "9 am" in question_lower:
            requirements["start_time"] = "09:00"
        elif "8:00" in question or "8 am" in question_lower:
            requirements["start_time"] = "08:00"
        
        if "5:30" in question or "5.30" in question:
            requirements["end_time"] = "17:30"
        elif "6:00" in question or "6 pm" in question_lower:
            requirements["end_time"] = "18:00"
        
        # Extract slot duration
        if "50 min" in question_lower or "50min" in question_lower:
            requirements["slot_duration"] = "50"
        elif "55 min" in question_lower or "55min" in question_lower:
            requirements["slot_duration"] = "55"
        elif "60 min" in question_lower or "60min" in question_lower or "1 hour" in question_lower:
            requirements["slot_duration"] = "60"
        
        # Extract grace time
        if "10 min" in question_lower and "grace" in question_lower:
            requirements["grace_time"] = 10
        elif "15 min" in question_lower and "grace" in question_lower:
            requirements["grace_time"] = 15
        elif "5 min" in question_lower and "grace" in question_lower:
            requirements["grace_time"] = 5
        
        # Detect break requirements
        if "lunch" in question_lower:
            if "1 hour" in question_lower or "60 min" in question_lower:
                requirements["breaks"].append({"type": "lunch", "duration": 60})
            else:
                requirements["breaks"].append({"type": "lunch", "duration": 60})
        
        if "morning break" in question_lower or "tea break" in question_lower:
            requirements["breaks"].append({"type": "morning", "duration": 15})
        
        if "evening break" in question_lower:
            requirements["breaks"].append({"type": "evening", "duration": 15})
        
        # Extract working days
        if "6 day" in question_lower or "saturday" in question_lower:
            requirements["working_days"].append("Saturday")
        
        return requirements
    
    def _generate_intelligent_config(self, requirements: Dict[str, Any]) -> BaseTimetableConfig:
        """Generate intelligent configuration based on requirements"""
        
        # Get base pattern for college type
        base_pattern = self.default_patterns.get(requirements["college_type"], self.default_patterns["engineering"])
        
        # Override with specific requirements
        start_time = requirements.get("start_time") or base_pattern["start_time"]
        end_time = requirements.get("end_time") or base_pattern["end_time"]
        slot_length = requirements.get("slot_duration") or base_pattern["slot_length"]
        grace_time = requirements.get("grace_time") or base_pattern["grace_time"]
        
        # Generate breaks
        breaks = []
        
        # Add requested breaks or defaults
        if requirements["breaks"]:
            for break_req in requirements["breaks"]:
                if break_req["type"] == "lunch":
                    breaks.append(Break(
                        type=BreakType.LUNCH,
                        start_time=time(13, 0),
                        end_time=time(14, 0),
                        duration=break_req.get("duration", 60),
                        is_active=True
                    ))
                elif break_req["type"] == "morning":
                    breaks.append(Break(
                        type=BreakType.MORNING,
                        start_time=time(10, 30),
                        end_time=time(10, 45),
                        duration=break_req.get("duration", 15),
                        is_active=True
                    ))
                elif break_req["type"] == "evening":
                    breaks.append(Break(
                        type=BreakType.EVENING,
                        start_time=time(15, 30),
                        end_time=time(15, 45),
                        duration=break_req.get("duration", 15),
                        is_active=True
                    ))
        else:
            # Add default breaks from pattern
            for break_def in base_pattern["breaks"]:
                start_parts = break_def["start"].split(":")
                end_parts = break_def["end"].split(":")
                breaks.append(Break(
                    type=BreakType(break_def["type"]),
                    start_time=time(int(start_parts[0]), int(start_parts[1])),
                    end_time=time(int(end_parts[0]), int(end_parts[1])),
                    duration=self._calculate_duration(break_def["start"], break_def["end"]),
                    is_active=True
                ))
        
        # Parse time strings
        start_parts = start_time.split(":")
        end_parts = end_time.split(":")
        
        config = BaseTimetableConfig(
            college_start_time=time(int(start_parts[0]), int(start_parts[1])),
            college_end_time=time(int(end_parts[0]), int(end_parts[1])),
            slot_length=SlotLength(slot_length),
            grace_time=grace_time,
            breaks=breaks,
            working_days=requirements["working_days"]
        )
        
        return config
    
    def _calculate_duration(self, start_str: str, end_str: str) -> int:
        """Calculate duration in minutes between two time strings"""
        start_parts = start_str.split(":")
        end_parts = end_str.split(":")
        start_time = time(int(start_parts[0]), int(start_parts[1]))
        end_time = time(int(end_parts[0]), int(end_parts[1]))
        
        start_dt = datetime.combine(datetime.today(), start_time)
        end_dt = datetime.combine(datetime.today(), end_time)
        return int((end_dt - start_dt).total_seconds() / 60)
    
    def _create_slot_mapping(self, grid: TimetableGrid) -> Dict[str, Dict[str, Any]]:
        """Create detailed slot mapping with time information"""
        
        slot_mapping = {}
        
        for slot in grid.slots:
            slot_mapping[slot.slot_id] = {
                "day": slot.day,
                "start_time": slot.start_time.strftime("%H:%M"),
                "end_time": slot.end_time.strftime("%H:%M"),
                "duration": slot.duration,
                "is_break": slot.is_break,
                "break_type": slot.break_type.value if slot.break_type else None,
                "period": "Morning" if slot.start_time < time(13, 0) else "Afternoon"
            }
        
        return slot_mapping
    
    def _create_break_schedule(self, config: BaseTimetableConfig) -> List[Dict[str, Any]]:
        """Create detailed break schedule"""
        
        break_schedule = []
        
        for break_item in config.breaks:
            break_schedule.append({
                "type": break_item.type.value,
                "start_time": break_item.start_time.strftime("%H:%M"),
                "end_time": break_item.end_time.strftime("%H:%M"),
                "duration": break_item.duration,
                "is_active": break_item.is_active,
                "description": f"{break_item.type.value.title()} Break ({break_item.duration} minutes)"
            })
        
        return break_schedule
    
    def _create_working_schedule(self, grid: TimetableGrid) -> Dict[str, List[str]]:
        """Create working schedule mapping days to slot IDs"""
        
        working_schedule = {}
        
        for day in grid.config.working_days:
            day_slots = []
            for slot in grid.slots:
                if slot.day == day and not slot.is_break:
                    day_slots.append(slot.slot_id)
            working_schedule[day] = day_slots
        
        return working_schedule
    
    def _generate_explanation(self, requirements: Dict[str, Any], config: BaseTimetableConfig, grid: TimetableGrid) -> str:
        """Generate explanation of the generated timetable"""
        
        explanation = f"""
Based on your requirements, I've generated a {requirements['college_type']} college timetable with the following specifications:

**Time Schedule:**
- College Hours: {config.college_start_time.strftime('%H:%M')} to {config.college_end_time.strftime('%H:%M')}
- Slot Duration: {config.slot_length.value} minutes
- Grace Time: {config.grace_time} minutes between slots

**Working Days:** {', '.join(config.working_days)}

**Teaching Slots:** {grid.total_teaching_slots_per_day} slots per day

**Breaks Scheduled:**
{chr(10).join([f"- {break_item.type.value.title()}: {break_item.start_time.strftime('%H:%M')} - {break_item.end_time.strftime('%H:%M')} ({break_item.duration} min)" for break_item in config.breaks])}

**Slot Pattern:** {', '.join(list(grid.grid_matrix.keys())[:5])}... (A1, B1, C1 format)

This configuration provides optimal time utilization while ensuring adequate breaks and transition time between classes.
        """.strip()
        
        return explanation
    
    def _generate_recommendations(self, config: BaseTimetableConfig, grid: TimetableGrid) -> List[str]:
        """Generate recommendations for the timetable"""
        
        recommendations = []
        
        # Analyze slot distribution
        if grid.total_teaching_slots_per_day >= 8:
            recommendations.append("Consider shorter slot duration or longer breaks to reduce fatigue")
        
        if grid.total_teaching_slots_per_day <= 4:
            recommendations.append("You have room for additional academic activities or extended lab sessions")
        
        # Analyze break timing
        lunch_break = next((b for b in config.breaks if b.type == BreakType.LUNCH), None)
        if lunch_break and lunch_break.duration < 45:
            recommendations.append("Consider extending lunch break to at least 45 minutes for better student experience")
        
        # Working days analysis
        if len(config.working_days) == 6:
            recommendations.append("6-day schedule detected. Ensure adequate faculty rest and student engagement")
        
        # Grace time analysis
        if config.grace_time < 10:
            recommendations.append("Consider increasing grace time to 10+ minutes for smooth transitions")
        
        recommendations.append("Assign core courses to morning slots for better attendance")
        recommendations.append("Schedule labs in afternoon slots for extended practical sessions")
        
        return recommendations
    
    def _generate_fallback_response(self, admin_question: AdminQuestion) -> AITimetableResponse:
        """Generate fallback response if AI processing fails"""
        
        # Use default engineering pattern
        config = BaseTimetableConfig(
            college_start_time=time(8, 30),
            college_end_time=time(17, 30),
            slot_length=SlotLength.FIFTY_MIN,
            grace_time=10,
            breaks=[
                Break(type=BreakType.MORNING, start_time=time(10, 30), end_time=time(10, 45), duration=15, is_active=True),
                Break(type=BreakType.LUNCH, start_time=time(13, 0), end_time=time(14, 0), duration=60, is_active=True)
            ],
            working_days=["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
        )
        
        grid = self.config_manager.generate_timetable_grid(config)
        
        return AITimetableResponse(
            generated_config=config,
            generated_grid=grid,
            explanation="Generated default engineering college timetable as fallback",
            recommendations=["Review and customize based on specific requirements"],
            slot_mapping=self._create_slot_mapping(grid),
            break_schedule=self._create_break_schedule(config),
            working_schedule=self._create_working_schedule(grid)
        )
