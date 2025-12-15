import requests
import sys
import json
from datetime import datetime

class FlexiSchedAPITester:
    def __init__(self, base_url="https://ai-scheduler-28.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.admin_token = None
        self.faculty_token = None
        self.student_token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.test_results = []

    def log_test(self, name, success, details=""):
        """Log test result"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
            print(f"✅ {name}")
        else:
            print(f"❌ {name} - {details}")
        
        self.test_results.append({
            'name': name,
            'success': success,
            'details': details
        })

    def run_test(self, name, method, endpoint, expected_status, data=None, token=None):
        """Run a single API test"""
        url = f"{self.api_url}/{endpoint}"
        headers = {'Content-Type': 'application/json'}
        if token:
            headers['Authorization'] = f'Bearer {token}'

        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, timeout=30)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers, timeout=30)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=headers, timeout=30)
            elif method == 'DELETE':
                response = requests.delete(url, headers=headers, timeout=30)

            success = response.status_code == expected_status
            details = f"Status: {response.status_code}"
            
            if not success:
                details += f", Expected: {expected_status}"
                try:
                    error_data = response.json()
                    details += f", Error: {error_data.get('detail', 'Unknown error')}"
                except:
                    details += f", Response: {response.text[:100]}"

            self.log_test(name, success, details)
            return success, response.json() if success and response.text else {}

        except Exception as e:
            self.log_test(name, False, f"Exception: {str(e)}")
            return False, {}

    def test_health_check(self):
        """Test health endpoint"""
        print("\n🔍 Testing Health Check...")
        success, _ = self.run_test("Health Check", "GET", "health", 200)
        return success

    def test_authentication(self):
        """Test authentication endpoints"""
        print("\n🔍 Testing Authentication...")
        
        # Test admin login
        success, response = self.run_test(
            "Admin Login",
            "POST",
            "auth/login",
            200,
            data={"email": "admin@flexisched.com", "password": "admin123"}
        )
        if success and 'token' in response:
            self.admin_token = response['token']
        
        # Test faculty login
        success, response = self.run_test(
            "Faculty Login",
            "POST",
            "auth/login",
            200,
            data={"email": "dr.smith@univ.edu", "password": "faculty123"}
        )
        if success and 'token' in response:
            self.faculty_token = response['token']
        
        # Test student login
        success, response = self.run_test(
            "Student Login",
            "POST",
            "auth/login",
            200,
            data={"email": "student1@univ.edu", "password": "student123"}
        )
        if success and 'token' in response:
            self.student_token = response['token']
        
        # Test invalid login
        self.run_test(
            "Invalid Login",
            "POST",
            "auth/login",
            401,
            data={"email": "invalid@test.com", "password": "wrong"}
        )
        
        return self.admin_token is not None

    def test_dashboard_stats(self):
        """Test dashboard statistics"""
        print("\n🔍 Testing Dashboard Stats...")
        
        if not self.admin_token:
            self.log_test("Dashboard Stats", False, "No admin token available")
            return False
        
        success, response = self.run_test(
            "Get Dashboard Stats",
            "GET",
            "dashboard/stats",
            200,
            token=self.admin_token
        )
        
        if success:
            required_fields = ['total_students', 'total_faculty', 'total_courses', 'total_rooms']
            for field in required_fields:
                if field not in response:
                    self.log_test(f"Stats Field: {field}", False, "Missing field")
                else:
                    self.log_test(f"Stats Field: {field}", True, f"Value: {response[field]}")
        
        # Test unauthorized access
        self.run_test(
            "Stats Unauthorized Access",
            "GET",
            "dashboard/stats",
            401
        )
        
        return success

    def test_course_management(self):
        """Test course CRUD operations"""
        print("\n🔍 Testing Course Management...")
        
        if not self.admin_token:
            self.log_test("Course Management", False, "No admin token available")
            return False
        
        # Get courses
        success, courses = self.run_test(
            "Get All Courses",
            "GET",
            "courses",
            200,
            token=self.admin_token
        )
        
        # Create new course
        new_course = {
            "name": "Test Course",
            "code": "TEST101",
            "credits": 3,
            "category": "Major",
            "duration_hours": 1,
            "is_lab": False
        }
        
        success, created_course = self.run_test(
            "Create Course",
            "POST",
            "courses",
            200,
            data=new_course,
            token=self.admin_token
        )
        
        course_id = None
        if success and '_id' in created_course:
            course_id = created_course['_id']
        
        # Update course
        if course_id:
            updated_course = {
                **new_course,
                "name": "Updated Test Course",
                "credits": 4
            }
            
            self.run_test(
                "Update Course",
                "PUT",
                f"courses/{course_id}",
                200,
                data=updated_course,
                token=self.admin_token
            )
        
        # Test unauthorized course creation
        self.run_test(
            "Unauthorized Course Creation",
            "POST",
            "courses",
            403,
            data=new_course,
            token=self.faculty_token
        )
        
        # Delete course
        if course_id:
            self.run_test(
                "Delete Course",
                "DELETE",
                f"courses/{course_id}",
                200,
                token=self.admin_token
            )
        
        return True

    def test_user_management(self):
        """Test user management"""
        print("\n🔍 Testing User Management...")
        
        if not self.admin_token:
            self.log_test("User Management", False, "No admin token available")
            return False
        
        # Get all users
        success, users = self.run_test(
            "Get All Users",
            "GET",
            "users",
            200,
            token=self.admin_token
        )
        
        if success and isinstance(users, list):
            self.log_test("Users List Format", True, f"Found {len(users)} users")
            
            # Check user structure
            if users:
                user = users[0]
                required_fields = ['_id', 'email', 'name', 'role']
                for field in required_fields:
                    if field in user:
                        self.log_test(f"User Field: {field}", True)
                    else:
                        self.log_test(f"User Field: {field}", False, "Missing field")
        
        # Test unauthorized access
        self.run_test(
            "Users Unauthorized Access",
            "GET",
            "users",
            403,
            token=self.faculty_token
        )
        
        return success

    def test_room_management(self):
        """Test room management"""
        print("\n🔍 Testing Room Management...")
        
        if not self.admin_token:
            self.log_test("Room Management", False, "No admin token available")
            return False
        
        # Get all rooms
        success, rooms = self.run_test(
            "Get All Rooms",
            "GET",
            "rooms",
            200,
            token=self.admin_token
        )
        
        # Create new room
        new_room = {
            "name": "Test Room 999",
            "capacity": 50,
            "type": "classroom"
        }
        
        success, created_room = self.run_test(
            "Create Room",
            "POST",
            "rooms",
            200,
            data=new_room,
            token=self.admin_token
        )
        
        # Test faculty can view rooms
        self.run_test(
            "Faculty View Rooms",
            "GET",
            "rooms",
            200,
            token=self.faculty_token
        )
        
        return success

    def test_timetable_generation(self):
        """Test AI timetable generation"""
        print("\n🔍 Testing Timetable Generation...")
        
        if not self.admin_token:
            self.log_test("Timetable Generation", False, "No admin token available")
            return False
        
        # Test get latest timetable (might not exist)
        self.run_test(
            "Get Latest Timetable",
            "GET",
            "timetable/latest",
            200,
            token=self.admin_token
        )
        
        # Test timetable generation (this might take time)
        print("⏳ Generating timetable (this may take 30-60 seconds)...")
        success, timetable = self.run_test(
            "Generate Timetable",
            "POST",
            "timetable/generate",
            200,
            data={},
            token=self.admin_token
        )
        
        if success:
            required_fields = ['schedule', 'summary', 'generated_at']
            for field in required_fields:
                if field in timetable:
                    self.log_test(f"Timetable Field: {field}", True)
                else:
                    self.log_test(f"Timetable Field: {field}", False, "Missing field")
        
        # Test unauthorized access
        self.run_test(
            "Timetable Unauthorized Generation",
            "POST",
            "timetable/generate",
            403,
            data={},
            token=self.faculty_token
        )
        
        return success

    def test_faculty_schedule(self):
        """Test faculty schedule endpoint"""
        print("\n🔍 Testing Faculty Schedule...")
        
        if not self.faculty_token:
            self.log_test("Faculty Schedule", False, "No faculty token available")
            return False
        
        success, schedule = self.run_test(
            "Get Faculty Schedule",
            "GET",
            "faculty/schedule",
            200,
            token=self.faculty_token
        )
        
        if success and 'schedule' in schedule:
            self.log_test("Faculty Schedule Format", True, f"Schedule items: {len(schedule['schedule'])}")
        
        # Test unauthorized access
        self.run_test(
            "Faculty Schedule Unauthorized",
            "GET",
            "faculty/schedule",
            403,
            token=self.student_token
        )
        
        return success

    def test_student_schedule(self):
        """Test student schedule endpoint"""
        print("\n🔍 Testing Student Schedule...")
        
        if not self.student_token:
            self.log_test("Student Schedule", False, "No student token available")
            return False
        
        success, schedule = self.run_test(
            "Get Student Schedule",
            "GET",
            "student/schedule",
            200,
            token=self.student_token
        )
        
        if success and 'schedule' in schedule:
            self.log_test("Student Schedule Format", True, f"Schedule items: {len(schedule['schedule'])}")
        
        # Test unauthorized access
        self.run_test(
            "Student Schedule Unauthorized",
            "GET",
            "student/schedule",
            403,
            token=self.faculty_token
        )
        
        return success

    def run_all_tests(self):
        """Run all tests"""
        print("🚀 Starting FlexiSched API Testing...")
        print(f"Testing against: {self.base_url}")
        
        # Test basic connectivity
        if not self.test_health_check():
            print("❌ Health check failed - stopping tests")
            return False
        
        # Test authentication
        if not self.test_authentication():
            print("❌ Authentication failed - stopping tests")
            return False
        
        # Test all endpoints
        self.test_dashboard_stats()
        self.test_course_management()
        self.test_user_management()
        self.test_room_management()
        self.test_timetable_generation()
        self.test_faculty_schedule()
        self.test_student_schedule()
        
        # Print summary
        print(f"\n📊 Test Results: {self.tests_passed}/{self.tests_run} passed")
        success_rate = (self.tests_passed / self.tests_run) * 100 if self.tests_run > 0 else 0
        print(f"Success Rate: {success_rate:.1f}%")
        
        return success_rate > 80

def main():
    tester = FlexiSchedAPITester()
    success = tester.run_all_tests()
    
    # Save detailed results
    results = {
        'timestamp': datetime.now().isoformat(),
        'total_tests': tester.tests_run,
        'passed_tests': tester.tests_passed,
        'success_rate': (tester.tests_passed / tester.tests_run) * 100 if tester.tests_run > 0 else 0,
        'test_details': tester.test_results
    }
    
    with open('/app/backend_test_results.json', 'w') as f:
        json.dump(results, f, indent=2)
    
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())