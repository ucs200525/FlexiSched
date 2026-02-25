## What is FlexiSched?

FlexiSched is a comprehensive university timetable management system designed to comply with NEP 2020 guidelines. It enables administrators to manage users, courses, and rooms, while allowing faculty to set their teaching preferences and students to generate personalized timetables using AI.

## Key Features

🎓 **Administrative Functions**
- Add/delete users with role-based access control
- Add/delete/edit courses with faculty assignments
- Add/delete/edit rooms with capacity and type management
- Configure base timetable structure with customizable parameters

👨‍🏫 **Faculty Features**
- Set teaching subjects and availability time slots
- Define minimum teaching hours per week
- View assigned courses and manage teaching preferences
- Generate optimized timetables respecting constraints

🎓 **Student Capabilities**
- Register for courses with preference settings
- Generate AI-powered personalized timetables
- View class schedules with room and faculty information
- Avoid conflicts and optimize course combinations

🤖 **AI-Powered Scheduling**
- Intelligent timetable generation respecting NEP 2020 guidelines
- Conflict resolution for faculty and room assignments
- Optimization based on student preferences and constraints
- Automatic accommodation of course durations and types

## Tech Stack

**Backend:**
- FastAPI (Python web framework)
- MongoDB with Motor for async operations
- JWT authentication for secure access
- OpenRouter API for AI-powered scheduling
- bcrypt for password hashing

**Frontend:**
- React.js for responsive user interface
- Axios for API communication
- Material-UI components for consistent design
- React Router for navigation
- Context API for state management

## Quick Start Guide

### Prerequisites
- Python 3.8+
- MongoDB (local or cloud)
- OpenRouter API key (for AI features)

### Installation Steps

1. **Clone the repository**

2. **Set up virtual environment**
```bash
python -m venv venv
venv\Scripts\activate  # On Linux: source venv/bin/activate
```

3. **Install backend dependencies**
```bash
cd backend
pip install -r requirements.txt
```

4. **Run the backend server**
```bash
uvicorn server:app --reload
```

5. **Open a new terminal and activate the same virtual environment**
```bash
venv\Scripts\activate  # On Linux: source venv/bin/activate
```

6. **Install frontend dependencies**
```bash
cd frontend
npm install
```

7. **Start the frontend**
```bash
npm start
```

## API Endpoints

**Authentication:**
- POST /api/v1/auth/register - Create new account
- POST /api/v1/auth/login - User login
- POST /api/v1/auth/logout - User logout
- POST /api/v1/auth/update-password - Change password

**User Management (Admin only):**
- GET /api/v1/users - View all users
- POST /api/v1/users - Create new user
- GET /api/v1/users/{id} - Get specific user
- PUT /api/v1/users/{id} - Update user
- DELETE /api/v1/users/{id} - Delete user

**Course Management (Admin only):**
- GET /api/v1/courses - View all courses
- POST /api/v1/courses - Create new course
- PUT /api/v1/courses/{id} - Update course
- DELETE /api/v1/courses/{id} - Delete course
- GET /api/v1/courses/{id}/faculty - Get faculty for a course

**Room Management (Admin only):**
- GET /api/v1/rooms - View all rooms
- POST /api/v1/rooms - Create new room
- PUT /api/v1/rooms/{id} - Update room
- DELETE /api/v1/rooms/{id} - Delete room

**Timetable Management:**
- GET /api/v1/timetable/base - Get base timetable structure
- POST /api/v1/timetable/base - Create/update base timetable (Admin only)
- POST /api/v1/timetable/generate - Generate AI timetable (Faculty/Student)
- POST /api/v1/timetable/generate-student - Generate personalized student timetable
- GET /api/v1/timetable/latest - Get latest timetable
- GET /api/v1/timetable/all - Get all timetables (Admin only)

**Faculty Features:**
- GET /api/v1/faculty/courses - Get assigned courses
- PUT /api/v1/faculty/courses - Update assigned courses
- GET /api/v1/faculty/schedule - Get faculty schedule
- GET /api/v1/faculty/timetable-preferences - Get timetable preferences
- PUT /api/v1/faculty/timetable-preferences - Update timetable preferences
- GET /api/v1/faculty/profile - Get faculty profile
- PUT /api/v1/faculty/profile - Update faculty profile

**Student Features:**
- GET /api/v1/student/schedule - Get student schedule
- POST /api/v1/student/register-courses - Register for courses with preferences
- GET /api/v1/student/course-preferences - Get course preferences
- GET /api/v1/student/profile - Get student profile
- PUT /api/v1/student/profile - Update student profile

**Settings:**
- GET /api/v1/settings/credit-limits - Get credit limits
- POST /api/v1/settings/credit-limits - Update credit limits (Admin only)

**System:**
- GET /api/v1/dashboard/stats - Get dashboard statistics (Admin only)
- GET /api/v1/health - Health check endpoint

## Configuration Details

**MongoDB Setup:**
- Local: Install MongoDB Community Server
- Cloud: Use MongoDB Atlas (free tier available)

**OpenRouter API:**
1. Sign up at openrouter.ai
2. Get API key from dashboard
3. Add to .env file
4. Free tier provides good limits for testing

## NEP 2020 Compliance

The system is designed to comply with the National Education Policy 2020 guidelines:

1. **Multidisciplinary Approach**
- Support for Major, Minor, SEC, AEC, and VAC course categories
- Flexible credit allocation across different course types
- Ability to combine courses from different disciplines

2. **Flexible Learning Paths**
- Student can select courses based on preferences
- AI optimization to avoid conflicts
- Accommodation of different course durations

3. **Comprehensive Evaluation**
- Tracking of credits across different categories
- Faculty workload management
- Room utilization optimization

## Development Workflow

1. **Backend Development**
   - Make changes to server.py
   - Restart server with `uvicorn server:app --reload`
   - Test API endpoints with Postman or curl

2. **Frontend Development**
   - Make changes to React components
   - Test with `npm start`
   - Check browser console for errors

3. **Database Changes**
   - Update schema in MongoDB
   - Clear demo data if needed: `db.users.deleteMany({})`
   - Restart backend to reinitialize demo data

## License

This project is licensed under the **MIT License** — see the [LICENSE](./LICENSE) file for details.

© 2026 Eswar Vutukuri, Upadhyayula Chandra Sekhar, Hari Kiran, Kaif Sharif, Vutla Yasaswi Venkat, Satwika Malla

## Acknowledgments

Thanks to:
- OpenRouter for AI models
- MongoDB for database technology
- FastAPI for the web framework
- React.js for the frontend framework
- The NEP 2020 framework for educational guidelines

We thank you from the bottom of our hearts for helping us complete this project.
