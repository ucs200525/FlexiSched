import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Bell, Moon, Calendar, User, BookOpen, Clock, GraduationCap, Settings } from "lucide-react";
import { TimetableGrid } from "@/components/timetable-grid";
import { useAuth } from "@/contexts/AuthContext";
import type { Student, Course, TimetableSlot, Faculty, Room } from "@shared/schema";

export default function StudentDashboard() {
  const { user } = useAuth();
  const [selectedStudent, setSelectedStudent] = useState<string>(user?.id || "student-1");

  // Get current student data from auth context and API
  const { data: currentStudentData } = useQuery<Student>({
    queryKey: ["/api/students", user?.id],
    enabled: !!user?.id,
  });

  const currentStudent = {
    id: user?.id || "",
    studentId: currentStudentData?.studentId || user?.username || "",
    name: user?.name || (currentStudentData ? `${currentStudentData.firstName} ${currentStudentData.lastName}` : "Student User"),
    firstName: currentStudentData?.firstName || "",
    lastName: currentStudentData?.lastName || "",
    email: currentStudentData?.email || user?.email || "",
    phone: currentStudentData?.phone || null,
    program: currentStudentData?.program || "Computer Science",
    semester: currentStudentData?.semester || 1,
    batch: currentStudentData?.batch || "2024-25",
    sectionId: currentStudentData?.sectionId || null,
    enrolledCourses: currentStudentData?.enrolledCourses || [],
    preferences: currentStudentData?.preferences || {},
    isActive: currentStudentData?.isActive ?? true,
    createdAt: currentStudentData?.createdAt || new Date()
  };

  // Fetch student's data
  const { data: courses } = useQuery<Course[]>({
    queryKey: ["/api/courses"],
  });

  const { data: faculty } = useQuery<Faculty[]>({
    queryKey: ["/api/faculty"],
  });

  const { data: rooms } = useQuery<Room[]>({
    queryKey: ["/api/rooms"],
  });

  const { data: timetables } = useQuery<any[]>({
    queryKey: ["/api/timetables"],
  });

  const { data: timetableSlots } = useQuery<TimetableSlot[]>({
    queryKey: ["/api/timetables", Array.isArray(timetables) && timetables[0]?.id, "slots"],
    enabled: !!(Array.isArray(timetables) && timetables[0]?.id),
  });

  // Get enrolled courses for current student
  const { data: enrolledCoursesData } = useQuery<Course[]>({
    queryKey: [`/api/students/${currentStudent.id}/registered-courses`],
    enabled: !!currentStudent.id && !!user?.id, // Only fetch if we have a real user ID
  });

  // Debug logging
  console.log("🔍 Dashboard Debug Info:");
  console.log("user?.id:", user?.id);
  console.log("currentStudent.id:", currentStudent.id);
  console.log("currentStudentData:", currentStudentData);
  console.log("enrolledCoursesData:", enrolledCoursesData);
  console.log("enrolledCoursesData length:", enrolledCoursesData?.length);

  // Student-specific stats calculated from real data
  const studentStats = useMemo(() => {
    const enrolledCount = enrolledCoursesData?.length || 0;
    const totalCredits = enrolledCoursesData?.reduce((sum, course) => sum + (course.credits || 0), 0) || 0;
    
    return [
      {
        title: "Enrolled Courses",
        value: enrolledCount,
        subtitle: "Current semester",
        icon: BookOpen,
        color: "primary",
        bgColor: "bg-primary/10",
        textColor: "text-primary",
        testId: "stat-enrolled-courses"
      },
      {
        title: "Attendance Rate",
        value: "0%",
        subtitle: "No data available",
        icon: Calendar,
        color: "secondary", 
        bgColor: "bg-secondary/10",
        textColor: "text-secondary",
        testId: "stat-attendance"
      },
      {
        title: "Total Credits",
        value: totalCredits,
        subtitle: "This semester",
        icon: GraduationCap,
        color: "accent",
        bgColor: "bg-accent/10",
        textColor: "text-accent", 
        testId: "stat-credits"
      },
      {
        title: "Current CGPA",
        value: "0.0",
        subtitle: "No grades yet",
        icon: User,
        color: "chart-1",
        bgColor: "bg-chart-1/10",
        textColor: "text-chart-1",
        testId: "stat-cgpa"
      }
    ];
  }, [enrolledCoursesData]);

  // Get upcoming classes from timetable API
  const upcomingClasses: Array<{
    time: string;
    course: string;
    faculty: string;
    room: string;
    type: string;
  }> = useMemo(() => {
    if (!timetableSlots || !courses || !faculty || !rooms) return [];
    
    const today = new Date().toLocaleDateString('en-US', { weekday: 'long' });
    const todaySlots = timetableSlots.filter(slot => slot.dayOfWeek === today);
    
    return todaySlots.map(slot => {
      const course = courses.find(c => c.id === slot.courseId);
      const facultyMember = faculty.find(f => f.id === slot.facultyId);
      const room = rooms.find(r => r.id === slot.roomId);
      
      return {
        time: slot.startTime,
        course: course?.courseName || 'Unknown Course',
        faculty: facultyMember ? `${facultyMember.firstName} ${facultyMember.lastName}` : 'Unknown Faculty',
        room: room?.roomNumber || 'Unknown Room',
        type: slot.slotType
      };
    }).sort((a, b) => a.time.localeCompare(b.time));
  }, [timetableSlots, courses, faculty, rooms]);

  // Get enrolled courses with faculty details
  const enrolledCourses: Array<{
    name: string;
    code: string;
    type: string;
    credits: number;
    faculty: string;
  }> = useMemo(() => {
    if (!enrolledCoursesData || !faculty) return [];
    
    return enrolledCoursesData.map(course => {
      // Find faculty assigned to this course (simplified - in real app you'd have course-faculty assignments)
      const assignedFaculty = faculty.find(f => f.assignedCourses?.includes(course.id));
      
      return {
        name: course.courseName,
        code: course.courseCode,
        type: course.courseType,
        credits: course.credits,
        faculty: assignedFaculty ? `${assignedFaculty.firstName} ${assignedFaculty.lastName}` : 'TBA'
      };
    });
  }, [enrolledCoursesData, faculty]);

  // Academic updates - placeholder for future notifications system
  const academicUpdates: Array<{
    message: string;
    time: string;
    type: 'success' | 'warning' | 'info';
  }> = useMemo(() => {
    // Generate some dynamic updates based on current data
    const updates = [];
    
    if (enrolledCoursesData && enrolledCoursesData.length > 0) {
      updates.push({
        message: `You are enrolled in ${enrolledCoursesData.length} courses this semester`,
        time: '1 hour ago',
        type: 'info' as const
      });
    }
    
    if (timetableSlots && timetableSlots.length > 0) {
      updates.push({
        message: 'Your timetable has been updated',
        time: '2 hours ago',
        type: 'success' as const
      });
    }
    
    return updates;
  }, [enrolledCoursesData, timetableSlots]);

  return (
    <div className="flex-1 flex flex-col">
      {/* Header */}
      <header className="bg-card border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground" data-testid="page-title">Student Dashboard</h1>
            <p className="text-sm text-muted-foreground">
              Welcome back, {currentStudent.name} • {currentStudent.studentId} • {currentStudent.program} Semester {currentStudent.semester} • {currentStudent.batch}
            </p>
          </div>
          <div className="flex items-center space-x-4">
            <Button 
              className="bg-gradient-to-r from-primary to-secondary hover:from-primary/90 hover:to-secondary/90"
              data-testid="button-view-full-timetable"
            >
              <Calendar className="w-4 h-4 mr-2" />
              View Full Timetable
            </Button>
            <div className="flex items-center space-x-2">
              <Bell className="w-5 h-5 text-muted-foreground" data-testid="button-notifications" />
              <div className="w-px h-6 bg-border"></div>
              <Moon className="w-5 h-5 text-muted-foreground cursor-pointer" data-testid="button-dark-mode" />
            </div>
          </div>
        </div>
      </header>

      {/* Dashboard Content */}
      <main className="flex-1 p-6 overflow-auto">
        {/* Student Profile Card */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="w-5 h-5" />
              Student Profile
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Student ID</p>
                <p className="text-lg font-semibold">{currentStudent.studentId}</p>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Full Name</p>
                <p className="text-lg font-semibold">{currentStudent.firstName} {currentStudent.lastName}</p>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Email</p>
                <p className="text-lg font-semibold">{currentStudent.email}</p>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Phone</p>
                <p className="text-lg font-semibold">{currentStudent.phone || "Not provided"}</p>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Program</p>
                <p className="text-lg font-semibold">{currentStudent.program}</p>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Semester</p>
                <p className="text-lg font-semibold">{currentStudent.semester}</p>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Batch</p>
                <p className="text-lg font-semibold">{currentStudent.batch}</p>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Section</p>
                <p className="text-lg font-semibold">{currentStudent.sectionId || "Not assigned"}</p>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Status</p>
                <Badge variant={currentStudent.isActive ? "default" : "secondary"}>
                  {currentStudent.isActive ? "Active" : "Inactive"}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {studentStats.map((stat, index) => {
            const Icon = stat.icon;
            return (
              <Card key={index} className="card-hover">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-muted-foreground">{stat.title}</p>
                      <p className="text-2xl font-bold text-foreground" data-testid={stat.testId}>
                        {stat.value}
                      </p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <span>{stat.subtitle}</span>
                      </p>
                    </div>
                    <div className={`w-12 h-12 ${stat.bgColor} rounded-full flex items-center justify-center`}>
                      <Icon className={`${stat.textColor} text-xl`} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Main Dashboard Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Today's Schedule */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Clock className="w-5 h-5" />
                      Today's Schedule
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">
                      Your classes for today, {new Date().toLocaleDateString()}
                    </p>
                  </div>
                  <div className="w-8 h-8 bg-gradient-to-br from-primary to-secondary rounded-lg flex items-center justify-center">
                    <Clock className="text-white w-4 h-4" />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {upcomingClasses.length > 0 ? (
                  upcomingClasses.map((cls, index) => (
                    <div key={index} className="flex items-center space-x-4 p-4 bg-muted rounded-lg" data-testid={`class-${index}`}>
                      <div className="text-center min-w-[80px]">
                        <p className="text-sm font-medium text-foreground">{cls.time}</p>
                      </div>
                      <div className="flex-1">
                        <h4 className="font-medium text-foreground">{cls.course}</h4>
                        <p className="text-sm text-muted-foreground">{cls.faculty} • {cls.room}</p>
                      </div>
                      <Badge 
                        variant={cls.type === "Theory" ? "secondary" : "outline"}
                        className="text-xs"
                      >
                        {cls.type}
                      </Badge>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8">
                    <Clock className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground">No classes scheduled for today</p>
                  </div>
                )}
                
                <Button className="w-full mt-4" variant="outline" data-testid="button-view-weekly-schedule">
                  <Calendar className="w-4 h-4 mr-2" />
                  View Weekly Schedule
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Quick Actions */}
            <Card>
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  { icon: BookOpen, label: "Course Registration", href: "/courses" },
                  { icon: Settings, label: "Update Preferences", href: "/preferences" },
                  { icon: Calendar, label: "View Timetable", href: "/timetables" },
                  { icon: User, label: "Edit Profile", href: "/profile" },
                ].map((action, index) => {
                  const Icon = action.icon;
                  return (
                    <Button
                      key={index}
                      variant="ghost"
                      className="w-full justify-between h-auto p-4"
                      data-testid={`quick-action-${action.label.toLowerCase().replace(/\s+/g, '-')}`}
                    >
                      <div className="flex items-center space-x-3">
                        <Icon className="w-4 h-4 text-primary" />
                        <span className="text-sm font-medium">{action.label}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">→</span>
                    </Button>
                  );
                })}
              </CardContent>
            </Card>

            {/* Student Preferences */}
            {currentStudent.preferences && Object.keys(currentStudent.preferences).length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Your Preferences</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {Object.entries(currentStudent.preferences).map(([key, value]) => (
                      <div key={key} className="flex justify-between items-center">
                        <span className="text-sm font-medium capitalize">{key.replace(/([A-Z])/g, ' $1')}</span>
                        <span className="text-sm text-muted-foreground">{String(value)}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Academic Updates */}
            <Card>
              <CardHeader>
                <CardTitle>Academic Updates</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {academicUpdates.length > 0 ? (
                  academicUpdates.map((update, index) => (
                    <div key={index} className="flex items-start space-x-3" data-testid={`update-${index}`}>
                      <div className={`w-2 h-2 rounded-full mt-2 ${
                        update.type === "success" ? "bg-secondary" :
                        update.type === "warning" ? "bg-accent" :
                        "bg-primary"
                      }`} />
                      <div className="flex-1">
                        <p className="text-sm text-foreground">{update.message}</p>
                        <p className="text-xs text-muted-foreground">{update.time}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-4">
                    <Bell className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No recent updates</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Enrolled Courses */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="w-5 h-5" />
              Enrolled Courses - Semester {currentStudent.semester}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {enrolledCourses.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {enrolledCourses.map((course, index) => (
                  <Card key={index} className="p-4" data-testid={`course-${index}`}>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Badge variant={course.type === "Core" ? "default" : "secondary"}>
                          {course.type}
                        </Badge>
                        <span className="text-sm text-muted-foreground">{course.credits} Credits</span>
                      </div>
                      <div>
                        <h4 className="font-medium text-foreground">{course.name}</h4>
                        <p className="text-sm text-muted-foreground">{course.code}</p>
                      </div>
                      <p className="text-sm text-muted-foreground">Faculty: {course.faculty}</p>
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <BookOpen className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-2">No Enrolled Courses</h3>
                <p className="text-muted-foreground mb-4">You haven't enrolled in any courses yet.</p>
                <Button className="bg-gradient-to-r from-primary to-secondary">
                  <BookOpen className="w-4 h-4 mr-2" />
                  Browse Available Courses
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Personal Timetable */}
        {(timetableSlots || courses || faculty || rooms) && (
          <TimetableGrid
            slots={Array.isArray(timetableSlots) ? timetableSlots : []}
            courses={Array.isArray(courses) ? courses : []}
            faculty={Array.isArray(faculty) ? faculty : []}
            rooms={Array.isArray(rooms) ? rooms : []}
            editable={false}
          />
        )}
      </main>

      {/* Status Indicator */}
      <div className="fixed top-4 right-4 z-50">
        <div className="flex items-center space-x-2 bg-card border border-border rounded-full px-3 py-2 shadow-lg">
          <div className="w-2 h-2 bg-secondary rounded-full pulse-animation"></div>
          <span className="text-xs font-medium text-foreground">Student Portal</span>
        </div>
      </div>
    </div>
  );
}