import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Bell, Moon, Calendar, User, BookOpen, Clock, GraduationCap, Settings } from "lucide-react";
import { TimetableGrid } from "@/components/timetable-grid";
import type { Student, Course, TimetableSlot, Faculty, Room } from "@shared/schema";

export default function StudentDashboard() {
  const [selectedStudent, setSelectedStudent] = useState<string>("student123");

  // Mock student data - in real app this would come from auth context
  const currentStudent = {
    id: "student123",
    name: "Priya Sharma",
    program: "B.Ed",
    semester: 3,
    batch: "2024-25",
    section: "A",
    studentId: "BED2024001"
  };

  // Fetch student's data
  const { data: courses } = useQuery({
    queryKey: ["/api/courses"],
  });

  const { data: faculty } = useQuery({
    queryKey: ["/api/faculty"],
  });

  const { data: rooms } = useQuery({
    queryKey: ["/api/rooms"],
  });

  const { data: timetables } = useQuery({
    queryKey: ["/api/timetables"],
  });

  const { data: timetableSlots } = useQuery({
    queryKey: ["/api/timetables", Array.isArray(timetables) && timetables[0]?.id, "slots"],
    enabled: !!(Array.isArray(timetables) && timetables[0]?.id),
  });

  // Student-specific stats
  const studentStats = [
    {
      title: "Enrolled Courses",
      value: 8,
      subtitle: "Current semester",
      icon: BookOpen,
      color: "primary",
      bgColor: "bg-primary/10",
      textColor: "text-primary",
      testId: "stat-enrolled-courses"
    },
    {
      title: "Attendance Rate",
      value: "92%",
      subtitle: "Above average",
      icon: Calendar,
      color: "secondary", 
      bgColor: "bg-secondary/10",
      textColor: "text-secondary",
      testId: "stat-attendance"
    },
    {
      title: "Completed Credits",
      value: 45,
      subtitle: "Out of 120",
      icon: GraduationCap,
      color: "accent",
      bgColor: "bg-accent/10",
      textColor: "text-accent", 
      testId: "stat-credits"
    },
    {
      title: "Current CGPA",
      value: "8.4",
      subtitle: "Excellent grade",
      icon: User,
      color: "chart-1",
      bgColor: "bg-chart-1/10",
      textColor: "text-chart-1",
      testId: "stat-cgpa"
    }
  ];

  const upcomingClasses = [
    { time: "09:00 AM", course: "Educational Psychology", faculty: "Dr. Singh", room: "R-101", type: "Theory" },
    { time: "11:00 AM", course: "Teaching Methods", faculty: "Prof. Verma", room: "R-203", type: "Practical" },
    { time: "02:00 PM", course: "Child Development", faculty: "Dr. Patel", room: "R-105", type: "Theory" },
  ];

  const enrolledCourses = [
    { code: "ED301", name: "Educational Psychology", faculty: "Dr. Singh", credits: 4, type: "Core" },
    { code: "ED302", name: "Teaching Methods", faculty: "Prof. Verma", credits: 4, type: "Core" },
    { code: "ED303", name: "Child Development", faculty: "Dr. Patel", credits: 4, type: "Core" },
    { code: "ED304", name: "Assessment & Evaluation", faculty: "Dr. Kumar", credits: 3, type: "Core" },
    { code: "EL101", name: "Environmental Education", faculty: "Dr. Rao", credits: 2, type: "Elective" },
  ];

  const academicUpdates = [
    { type: "success", message: "Assignment submitted for Educational Psychology", time: "1 hour ago" },
    { type: "info", message: "New timetable published for next week", time: "2 hours ago" },
    { type: "warning", message: "Mid-term exam scheduled for Child Development", time: "1 day ago" },
    { type: "info", message: "Elective course registration opens tomorrow", time: "2 days ago" },
  ];

  return (
    <div className="flex-1 flex flex-col">
      {/* Header */}
      <header className="bg-card border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground" data-testid="page-title">Student Dashboard</h1>
            <p className="text-sm text-muted-foreground">
              Welcome back, {currentStudent.name} • {currentStudent.program} Semester {currentStudent.semester}
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
                {upcomingClasses.map((cls, index) => (
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
                ))}
                
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

            {/* Academic Updates */}
            <Card>
              <CardHeader>
                <CardTitle>Academic Updates</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {academicUpdates.map((update, index) => (
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
                ))}
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