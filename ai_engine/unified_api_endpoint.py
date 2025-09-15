"""
Unified AI Timetable API Endpoint
Single endpoint that handles complete timetable generation
"""

from fastapi import HTTPException
from typing import Dict, List, Any
import logging
from datetime import datetime

from unified_timetable_generator import (
    UnifiedTimetableGenerator, 
    UnifiedTimetableRequest, 
    UnifiedTimetableResult,
    create_unified_timetable_generator
)

logger = logging.getLogger(__name__)

class UnifiedTimetableAPI:
    """
    Unified API handler for complete timetable generation
    Combines base configuration, sectioning, and optimization
    """
    
    def __init__(self):
        self.generator = create_unified_timetable_generator()
    
    async def generate_complete_timetable(self, request_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Single endpoint for complete AI timetable generation
        
        Expected request format:
        {
            "question": "Generate timetable for engineering college 8:30 AM to 5:30 PM",
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
        """
        try:
            logger.info("Processing unified timetable generation request")
            logger.info(f"Request keys: {list(request_data.keys())}")
            
            # Parse natural language question if provided
            question = request_data.get("question", "")
            logger.info(f"Parsing question: '{question}'")
            config = self._parse_admin_question(question)
            logger.info(f"Parsed config: {config}")
            
            # Override with explicit parameters
            if "college_start_time" in request_data:
                config["college_start_time"] = request_data["college_start_time"]
            if "college_end_time" in request_data:
                config["college_end_time"] = request_data["college_end_time"]
            if "slot_duration" in request_data:
                config["slot_duration"] = request_data["slot_duration"]
            
            # Create unified request
            unified_request = UnifiedTimetableRequest(
                college_start_time=config.get("college_start_time", "08:30"),
                college_end_time=config.get("college_end_time", "17:30"),
                slot_duration=config.get("slot_duration", 50),
                grace_time=config.get("grace_time", 10),
                working_days=config.get("working_days", ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]),
                breaks=config.get("breaks", [
                    {"type": "morning", "start_time": "10:30", "end_time": "10:45"},
                    {"type": "lunch", "start_time": "13:00", "end_time": "14:00"}
                ]),
                courses=request_data.get("courses", []),
                faculty=request_data.get("faculty", []),
                rooms=request_data.get("rooms", []),
                total_students=request_data.get("total_students", 200),
                minimize_conflicts=request_data.get("constraints", {}).get("minimize_conflicts", True),
                optimize_room_utilization=request_data.get("constraints", {}).get("optimize_room_utilization", True),
                balance_faculty_load=request_data.get("constraints", {}).get("balance_faculty_load", True),
                consider_student_preferences=request_data.get("constraints", {}).get("consider_student_preferences", False)
            )
            
            # Generate complete timetable
            result = self.generator.generate_complete_timetable(unified_request)
            
            # Debug logging
            logger.info(f"Time slots generated: {len(self.generator.time_slots)}")
            if self.generator.time_slots:
                logger.info(f"First slot: {self.generator.time_slots[0].slot_id} - {self.generator.time_slots[0].start_time}")
            
            # Format response
            response = {
                "success": result.success,
                "message": "Complete timetable generated successfully" if result.success else "Timetable generated with conflicts",
                "base_timetable": {
                    "slot_grid": result.slot_grid,
                    "time_slots": [
                        {
                            "slot_id": slot.slot_id,
                            "day": slot.day,
                            "start_time": slot.start_time,
                            "end_time": slot.end_time,
                            "duration": slot.duration,
                            "slot_type": slot.slot_type.value
                        }
                        for slot in self.generator.time_slots
                    ],
                    "configuration": {
                        "college_start_time": unified_request.college_start_time,
                        "college_end_time": unified_request.college_end_time,
                        "slot_duration": unified_request.slot_duration,
                        "grace_time": unified_request.grace_time,
                        "working_days": unified_request.working_days,
                        "breaks": unified_request.breaks
                    }
                },
                "timetable": {
                    "schedule": result.timetable_schedule,
                    "sections": [self._section_to_dict(section) for section in result.sections_created],
                    "student_allocations": result.student_allocations,
                    "slot_grid": result.slot_grid,
                    "configuration": {
                        "college_start_time": unified_request.college_start_time,
                        "college_end_time": unified_request.college_end_time,
                        "slot_duration": unified_request.slot_duration,
                        "grace_time": unified_request.grace_time,
                        "working_days": unified_request.working_days,
                        "breaks": unified_request.breaks
                    }
                },
                "optimization": {
                    "score": result.optimization_score,
                    "metrics": result.metrics,
                    "conflicts": result.conflicts,
                    "recommendations": result.recommendations
                },
                "generation_info": {
                    "generation_time": result.generation_time,
                    "total_sections": len(result.sections_created),
                    "total_assignments": len(result.timetable_schedule),
                    "students_allocated": len(result.student_allocations)
                },
                "ai_insights": {
                    "conflict_analysis": self._analyze_conflicts(result.conflicts),
                    "utilization_insights": self._generate_utilization_insights(result.metrics),
                    "improvement_suggestions": result.recommendations
                }
            }
            
            logger.info(f"Unified timetable generation completed: {result.optimization_score:.1f}% score")
            logger.info(f"🔍 base_timetable has {len(response['base_timetable']['time_slots'])} time slots")
            return response
            
        except Exception as e:
            logger.error(f"Unified timetable generation failed: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Timetable generation failed: {str(e)}")
    
    def _parse_admin_question(self, question: str) -> Dict[str, Any]:
        """Parse natural language admin question into configuration"""
        config = {
            "college_start_time": "08:30",
            "college_end_time": "17:30",
            "slot_duration": 50,
            "grace_time": 10,
            "working_days": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
            "breaks": [
                {"type": "morning", "start_time": "10:30", "end_time": "10:45"},
                {"type": "lunch", "start_time": "13:00", "end_time": "14:00"}
            ]
        }
        
        if not question:
            return config
        
        question_lower = question.lower()
        
        # Parse start time
        if "9 am" in question_lower or "9:00" in question or "9.00" in question:
            config["college_start_time"] = "09:00"
        elif "8:30" in question or "8.30" in question:
            config["college_start_time"] = "08:30"
        elif "8:00" in question or "8 am" in question_lower:
            config["college_start_time"] = "08:00"
        elif "10 am" in question_lower or "10:00" in question:
            config["college_start_time"] = "10:00"
        
        # Parse end time
        if "6 pm" in question_lower or "6:00" in question or "6.00" in question:
            config["college_end_time"] = "18:00"
        elif "5:30" in question or "5.30" in question:
            config["college_end_time"] = "17:30"
        elif "4:30" in question or "4.30" in question:
            config["college_end_time"] = "16:30"
        elif "5 pm" in question_lower or "5:00" in question:
            config["college_end_time"] = "17:00"
        
        # Parse slot duration
        if "50 minute" in question_lower or "50-minute" in question_lower:
            config["slot_duration"] = 50
        elif "55 minute" in question_lower or "55-minute" in question_lower:
            config["slot_duration"] = 55
        elif "60 minute" in question_lower or "60-minute" in question_lower or "1 hour" in question_lower:
            config["slot_duration"] = 60
        
        # Parse working days
        if "6 day" in question_lower or "six day" in question_lower or "monday to saturday" in question_lower:
            config["working_days"] = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
        elif "5 day" in question_lower or "five day" in question_lower:
            config["working_days"] = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
        
        # Parse breaks
        if "no break" in question_lower or "without break" in question_lower:
            config["breaks"] = []
        elif "tea break" in question_lower or "morning break" in question_lower:
            config["breaks"] = [
                {"type": "morning", "start_time": "10:30", "end_time": "10:45"},
                {"type": "lunch", "start_time": "13:00", "end_time": "14:00"}
            ]
        elif "lunch only" in question_lower:
            config["breaks"] = [
                {"type": "lunch", "start_time": "13:00", "end_time": "14:00"}
            ]
        
        # College type optimizations
        if "engineering" in question_lower:
            config["slot_duration"] = 50
            config["grace_time"] = 10
        elif "medical" in question_lower:
            config["slot_duration"] = 60
            config["grace_time"] = 15
            config["breaks"].append({"type": "evening", "start_time": "15:30", "end_time": "15:45"})
        elif "business" in question_lower or "management" in question_lower:
            config["slot_duration"] = 60
            config["grace_time"] = 15
        
        return config
    
    def _section_to_dict(self, section) -> Dict[str, Any]:
        """Convert Section object to dictionary"""
        return {
            "section_id": section.section_id,
            "course_id": section.course_id,
            "section_type": section.section_type.value,
            "max_students": section.max_students,
            "assigned_faculty": section.assigned_faculty,
            "assigned_room": section.assigned_room,
            "assigned_slots": section.assigned_slots,
            "enrolled_students": len(section.enrolled_students),
            "enrollment_list": section.enrolled_students
        }
    
    def _analyze_conflicts(self, conflicts: List[Dict]) -> Dict[str, Any]:
        """Analyze conflicts and provide insights"""
        if not conflicts:
            return {
                "total_conflicts": 0,
                "severity_breakdown": {"high": 0, "medium": 0, "low": 0},
                "conflict_types": {},
                "status": "conflict_free"
            }
        
        severity_breakdown = {"high": 0, "medium": 0, "low": 0}
        conflict_types = {}
        
        for conflict in conflicts:
            severity = conflict.get("severity", "medium")
            conflict_type = conflict.get("type", "unknown")
            
            severity_breakdown[severity] = severity_breakdown.get(severity, 0) + 1
            conflict_types[conflict_type] = conflict_types.get(conflict_type, 0) + 1
        
        return {
            "total_conflicts": len(conflicts),
            "severity_breakdown": severity_breakdown,
            "conflict_types": conflict_types,
            "status": "has_conflicts",
            "resolution_priority": "high" if severity_breakdown["high"] > 0 else "medium"
        }
    
    def _generate_utilization_insights(self, metrics: Dict[str, Any]) -> List[str]:
        """Generate insights about resource utilization"""
        insights = []
        
        faculty_util = metrics.get("faculty_utilization", 0)
        room_util = metrics.get("room_utilization", 0)
        allocation_rate = metrics.get("allocation_success_rate", 0)
        
        if faculty_util > 85:
            insights.append("Faculty utilization is very high - consider hiring additional faculty")
        elif faculty_util < 40:
            insights.append("Faculty utilization is low - resources may be underutilized")
        else:
            insights.append("Faculty utilization is optimal")
        
        if room_util > 80:
            insights.append("Room utilization is excellent - spaces are well utilized")
        elif room_util < 30:
            insights.append("Room utilization is low - consider consolidating classes")
        else:
            insights.append("Room utilization is reasonable")
        
        if allocation_rate > 95:
            insights.append("Student allocation is excellent - all students properly assigned")
        elif allocation_rate < 70:
            insights.append("Student allocation needs improvement - review section capacities")
        else:
            insights.append("Student allocation is satisfactory")
        
        return insights

# Global API instance
unified_api = UnifiedTimetableAPI()

# FastAPI endpoint function
async def generate_unified_timetable(request_data: Dict[str, Any]) -> Dict[str, Any]:
    """Main API endpoint for unified timetable generation"""
    return await unified_api.generate_complete_timetable(request_data)
