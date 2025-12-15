#!/usr/bin/env python3
"""
Test script for comprehensive sectioning functionality
Tests all the fixed API endpoints to ensure they work correctly
"""

import requests
import json

AI_SERVER_URL = 'http://localhost:8000'

def test_sample_courses():
    """Test sample semester courses endpoint"""
    print("Testing sample semester courses...")
    response = requests.get(f"{AI_SERVER_URL}/sample/semester-courses")
    if response.status_code == 200:
        data = response.json()
        print(f"✓ Sample courses loaded: {len(data['courses'])} courses")
        return data['courses']
    else:
        print(f"✗ Sample courses failed: {response.status_code}")
        return []

def test_ai_timetable_generation():
    """Test AI timetable generation"""
    print("\nTesting AI timetable generation...")
    payload = {
        "question": "Create a business school schedule with 60-minute classes and 1-hour lunch break"
    }
    response = requests.post(f"{AI_SERVER_URL}/ai/quick-generate", json=payload)
    if response.status_code == 200:
        data = response.json()
        print(f"✓ AI timetable generated successfully")
        print(f"  - Slots per day: {data['grid_summary']['total_slots_per_day']}")
        print(f"  - Working days: {len(data['grid_summary']['working_days'])}")
        return data
    else:
        print(f"✗ AI timetable generation failed: {response.status_code}")
        print(f"  Error: {response.text}")
        return None

def test_section_calculation(courses, timetable_data):
    """Test section calculation endpoint"""
    print("\nTesting section calculation...")
    
    # Create a simple timetable grid for testing
    timetable_grid = {
        "working_days": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
        "time_slots": ["09:00-10:00", "10:00-11:00", "11:00-12:00", "14:00-15:00", "15:00-16:00"],
        "slot_duration": 60,
        "breaks": [{"type": "lunch", "start_time": "12:00", "end_time": "14:00"}]
    }
    
    payload = {
        "courses": courses[:3],  # Test with first 3 courses
        "total_students": 200,
        "timetable_grid": timetable_grid
    }
    
    response = requests.post(f"{AI_SERVER_URL}/sectioning/calculate-sections", json=payload)
    if response.status_code == 200:
        data = response.json()
        print(f"✓ Section calculation successful")
        print(f"  - Total sections needed: {data['total_sections_needed']}")
        print(f"  - Courses processed: {len(data['section_calculations'])}")
        return data
    else:
        print(f"✗ Section calculation failed: {response.status_code}")
        print(f"  Error: {response.text}")
        return None

def test_comprehensive_sectioning(courses, timetable_data):
    """Test comprehensive sectioning endpoint"""
    print("\nTesting comprehensive sectioning...")
    
    # Create a simple timetable grid for testing
    timetable_grid = {
        "working_days": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
        "time_slots": ["09:00-10:00", "10:00-11:00", "11:00-12:00", "14:00-15:00", "15:00-16:00"],
        "slot_duration": 60,
        "breaks": [{"type": "lunch", "start_time": "12:00", "end_time": "14:00"}]
    }
    
    # Generate student IDs
    student_ids = [f"STU{str(i+1).zfill(3)}" for i in range(200)]
    
    payload = {
        "courses": courses[:3],  # Test with first 3 courses
        "total_students": 200,
        "student_ids": student_ids,
        "timetable_grid": timetable_grid
    }
    
    response = requests.post(f"{AI_SERVER_URL}/sectioning/comprehensive", json=payload)
    if response.status_code == 200:
        data = response.json()
        print(f"✓ Comprehensive sectioning successful")
        print(f"  - Total sections created: {data['total_sections_created']}")
        print(f"  - Success rate: {data['success_rate']:.2%}")
        print(f"  - Students allocated: {len(data['student_allocations'])}")
        return data
    else:
        print(f"✗ Comprehensive sectioning failed: {response.status_code}")
        print(f"  Error: {response.text}")
        return None

def main():
    """Run all tests"""
    print("=== Comprehensive Sectioning Test Suite ===\n")
    
    # Test 1: Sample courses
    courses = test_sample_courses()
    if not courses:
        print("Cannot proceed without sample courses")
        return
    
    # Test 2: AI timetable generation
    timetable_data = test_ai_timetable_generation()
    
    # Test 3: Section calculation
    section_calc_data = test_section_calculation(courses, timetable_data)
    
    # Test 4: Comprehensive sectioning
    sectioning_data = test_comprehensive_sectioning(courses, timetable_data)
    
    print("\n=== Test Summary ===")
    print(f"✓ Sample courses: {'PASS' if courses else 'FAIL'}")
    print(f"✓ AI timetable generation: {'PASS' if timetable_data else 'FAIL'}")
    print(f"✓ Section calculation: {'PASS' if section_calc_data else 'FAIL'}")
    print(f"✓ Comprehensive sectioning: {'PASS' if sectioning_data else 'FAIL'}")
    
    if all([courses, timetable_data, section_calc_data, sectioning_data]):
        print("\n🎉 All tests PASSED! The sectioning system is working correctly.")
    else:
        print("\n❌ Some tests FAILED. Please check the error messages above.")

if __name__ == "__main__":
    main()
