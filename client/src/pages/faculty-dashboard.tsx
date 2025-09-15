import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Bell, Moon, Calendar, User, BookOpen, Clock, Users, Settings, CheckCircle } from "lucide-react";
import { TimetableGrid } from "@/components/timetable-grid";
import type { Faculty, Course, TimetableSlot, Room } from "@shared/schema";

export default function FacultyDashboard() {
  const [selectedFaculty, setSelectedFaculty] = useState<string>("faculty123");

  // Mock faculty data - in real app this would come from auth context
  const currentFaculty = {
    id: "faculty123",
    name: "Dr. Rajesh Singh",
    designation: "Assistant Professor",
    department: "Education",
    facultyId: "FAC2024001",
    expertise: ["Educational Psychology", "Child Development"]
  };

  // Fetch faculty's data
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

  // Faculty-specific stats
  const facultyStats = [
    {
      title: "Teaching Load",
      value: "16 hrs",
      subtitle: "This week",
      icon: Clock,
      color: "primary",
      bgColor: "bg-primary/10",
      textColor: "text-primary",
      testId: "stat-teaching-load"
    },
    {
      title: "Assigned Courses",
      value: 4,
      subtitle: "Current semester",
      icon: BookOpen,
      color: "secondary", 
      bgColor: "bg-secondary/10",
      textColor: "text-secondary",
      testId: "stat-assigned-courses"
    },
    {
      title: "Student Count",
      value: 120,
      subtitle: "All sections",
      icon: Users,
      color: "accent",
      bgColor: "bg-accent/10",
      textColor: "text-accent", 
      testId: "stat-students"
    },
    {
      title: "Workload Score",
      value: "85%",
      subtitle: "Optimal range",
      icon: CheckCircle,
      color: "chart-1",
      bgColor: "bg-chart-1/10",
      textColor: "text-chart-1",
      testId: "stat-workload"
    }
  ];

  const todaysClasses = [
    { time: "09:00 AM", course: "Educational Psychology", section: "B.Ed 3A", room: "R-101", students: 30 },
    { time: "11:00 AM", course: "Child Development", section: "B.Ed 2B", room: "R-203", students: 28 },
    { time: "02:00 PM", course: "Educational Psychology", section: "B.Ed 3B", room: "R-105", students: 32 },
  ];

  const assignedCourses = [
    { code: "ED301", name: "Educational Psychology", sections: ["3A", "3B"], students: 62, hours: 6 },
    { code: "ED203", name: "Child Development", sections: ["2A", "2B"], students: 58, hours: 4 },
    { code: "ED401", name: "Research Methods", sections: ["4A"], students: 30, hours: 3 },
    { code: "EL201", name: "Special Education", sections: ["2A"], students: 25, hours: 3 },
  ];

  const academicUpdates = [
    { type: "success", message: "Student assessments submitted for ED301", time: "30 minutes ago" },
    { type: "info", message: "New timetable published for next week", time: "2 hours ago" },
    { type: "warning", message: "Faculty meeting scheduled for tomorrow", time: "1 day ago" },
    { type: "info", message: "Course material upload deadline approaching", time: "2 days ago" },
  ];

  const weeklySchedule = [
    { day: "Monday", classes: 3, hours: 4.5 },
    { day: "Tuesday", classes: 2, hours: 3 },
    { day: "Wednesday", classes: 4, hours: 6 },
    { day: "Thursday", classes: 3, hours: 4.5 },
    { day: "Friday", classes: 2, hours: 3 },
  ];

  return (
    <div className="flex-1 flex flex-col">
      {/* Header */}
      <header className="bg-card border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground" data-testid="page-title">Faculty Dashboard</h1>
            <p className="text-sm text-muted-foreground">
              Welcome back, {currentFaculty.name} • {currentFaculty.designation}, {currentFaculty.department}
            </p>
          </div>
          <div className="flex items-center space-x-4">
            <Button 
              className="bg-gradient-to-r from-primary to-secondary hover:from-primary/90 hover:to-secondary/90"
              data-testid="button-manage-schedule"
            >
              <Calendar className="w-4 h-4 mr-2" />
              Manage Schedule
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
          {facultyStats.map((stat, index) => {
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
                      Today's Teaching Schedule
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
                {todaysClasses.map((cls, index) => (
                  <div key={index} className="flex items-center space-x-4 p-4 bg-muted rounded-lg" data-testid={`class-${index}`}>
                    <div className="text-center min-w-[80px]">
                      <p className="text-sm font-medium text-foreground">{cls.time}</p>
                    </div>
                    <div className="flex-1">
                      <h4 className="font-medium text-foreground">{cls.course}</h4>
                      <p className="text-sm text-muted-foreground">{cls.section} • {cls.room}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-foreground">{cls.students}</p>
                      <p className="text-xs text-muted-foreground">students</p>
                    </div>
                  </div>
                ))}
                
                <Button className="w-full mt-4" variant="outline" data-testid="button-view-weekly-schedule">
                  <Calendar className="w-4 h-4 mr-2" />
                  View Full Schedule
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
                  { icon: BookOpen, label: "Update Availability", href: "/availability" },
                  { icon: Users, label: "View Students", href: "/students" },
                  { icon: Settings, label: "Course Materials", href: "/materials" },
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

            {/* Weekly Overview */}
            <Card>
              <CardHeader>
                <CardTitle>Weekly Overview</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {weeklySchedule.map((day, index) => (
                  <div key={index} className="flex items-center justify-between" data-testid={`weekly-${index}`}>
                    <span className="text-sm text-foreground">{day.day}</span>
                    <div className="text-right">
                      <p className="text-sm font-medium text-foreground">{day.classes} classes</p>
                      <p className="text-xs text-muted-foreground">{day.hours} hrs</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Assigned Courses */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="w-5 h-5" />
              Assigned Courses - Current Semester
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {assignedCourses.map((course, index) => (
                <Card key={index} className="p-4" data-testid={`course-${index}`}>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Badge variant="default">
                        {course.code}
                      </Badge>
                      <span className="text-sm text-muted-foreground">{course.hours} hrs/week</span>
                    </div>
                    <div>
                      <h4 className="font-medium text-foreground">{course.name}</h4>
                      <p className="text-sm text-muted-foreground">
                        Sections: {course.sections.join(", ")}
                      </p>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        {course.students} students
                      </span>
                      <Button size="sm" variant="outline">
                        Manage
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Faculty Timetable */}
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
          <span className="text-xs font-medium text-foreground">Faculty Portal</span>
        </div>
      </div>
    </div>
  );
}