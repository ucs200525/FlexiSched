import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Bell, Moon, Calendar, User as UserIcon, BookOpen, Clock, Users, Settings, CheckCircle, Loader2 } from "lucide-react";
import { TimetableGrid } from "@/components/timetable-grid";
import { useAuth } from "@/contexts/AuthContext";
import type { Faculty, Course, TimetableSlot, Room } from "@shared/schema";

// Extended type for faculty with additional properties
type ExtendedFaculty = Omit<Faculty, 'department'> & {
  name?: string;
  designation?: string;
  department?: string;
  id?: string; // Make id optional to match auth context user type
};

// Type for faculty stats
interface FacultyStats {
  teachingLoad?: string;
  assignedCourses?: number;
  studentCount?: number;
  workloadScore?: string;
  [key: string]: any;
}

// Type for class data
interface ClassData {
  time: string;
  course: string;
  section: string;
  room: string;
  students: number;
}

// Type for assigned course
interface AssignedCourse {
  code: string;
  name: string;
  sections: string[] | string;
  students: number;
  hours: number;
}

// Type for academic update
interface AcademicUpdate {
  type: 'success' | 'info' | 'warning' | 'error';
  message: string;
  time: string;
}

// Type for weekly schedule
interface WeeklySchedule {
  day: string;
  classes: number;
  hours: number;
}

export default function FacultyDashboard() {
  const { user } = useAuth();
  const [selectedFaculty, setSelectedFaculty] = useState<string>("");

  // Get current faculty data from auth context
  const currentFaculty = user as unknown as ExtendedFaculty;

  // Set the selected faculty ID if not set
  if (user?.id && !selectedFaculty) {
    setSelectedFaculty(user.id);
  }

  // Fetch faculty's data
  const { data: courses } = useQuery<Course[]>({
    queryKey: ["/api/courses"],
    initialData: []
  });

  const { data: faculty } = useQuery<Faculty[]>({
    queryKey: ["/api/faculty"],
    initialData: []
  });

  const { data: rooms } = useQuery<Room[]>({
    queryKey: ["/api/rooms"],
    initialData: []
  });

  const { data: timetables } = useQuery<any[]>({
    queryKey: ["/api/timetables"],
    initialData: []
  });

  const { data: timetableSlots = [] } = useQuery<TimetableSlot[]>({
    queryKey: ["/api/timetables", timetables?.[0]?.id, "slots"],
    enabled: !!(timetables?.[0]?.id),
    initialData: []
  });

  // Fetch faculty stats
  const { data: facultyStats, isLoading: statsLoading } = useQuery<FacultyStats>({
    queryKey: ["/api/faculty", currentFaculty?.id, "stats"],
    enabled: !!currentFaculty?.id,
    initialData: {}
  });

  // Fetch today's classes
  const { data: todaysClasses, isLoading: classesLoading } = useQuery<ClassData[]>({
    queryKey: ["/api/faculty", currentFaculty?.id, "classes", "today"],
    enabled: !!currentFaculty?.id,
    initialData: []
  });

  // Fetch assigned courses
  const { data: assignedCourses, isLoading: coursesLoading } = useQuery<AssignedCourse[]>({
    queryKey: ["/api/faculty", currentFaculty?.id, "courses"],
    enabled: !!currentFaculty?.id,
    initialData: []
  });

  // Fetch academic updates
  const { data: academicUpdates, isLoading: updatesLoading } = useQuery<AcademicUpdate[]>({
    queryKey: ["/api/faculty", currentFaculty?.id, "updates"],
    enabled: !!currentFaculty?.id,
    initialData: []
  });

  // Fetch weekly schedule
  const { data: weeklySchedule, isLoading: scheduleLoading } = useQuery<WeeklySchedule[]>({
    queryKey: ["/api/faculty", currentFaculty?.id, "schedule", "weekly"],
    enabled: !!currentFaculty?.id,
    initialData: []
  });

  // Default stat structure for display
  const defaultStats = [
    {
      title: "Teaching Load",
      key: "teachingLoad",
      subtitle: "This week",
      icon: Clock,
      color: "primary",
      bgColor: "bg-primary/10",
      textColor: "text-primary",
      testId: "stat-teaching-load"
    },
    {
      title: "Assigned Courses",
      key: "assignedCourses",
      subtitle: "Current semester",
      icon: BookOpen,
      color: "secondary", 
      bgColor: "bg-secondary/10",
      textColor: "text-secondary",
      testId: "stat-assigned-courses"
    },
    {
      title: "Student Count",
      key: "studentCount",
      subtitle: "All sections",
      icon: Users,
      color: "accent",
      bgColor: "bg-accent/10",
      textColor: "text-accent", 
      testId: "stat-students"
    },
    {
      title: "Workload Score",
      key: "workloadScore",
      subtitle: "Optimal range",
      icon: CheckCircle,
      color: "chart-1",
      bgColor: "bg-chart-1/10",
      textColor: "text-chart-1",
      testId: "stat-workload"
    }
  ];

  return (
    <div className="flex-1 flex flex-col">
      {/* Header */}
      <header className="bg-card border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground" data-testid="page-title">Faculty Dashboard</h1>
            <p className="text-sm text-muted-foreground">
              {currentFaculty ? (
                `Welcome back, ${currentFaculty.name}${currentFaculty.designation ? ` • ${currentFaculty.designation}` : ''}${currentFaculty.department ? `, ${currentFaculty.department}` : ''}`
              ) : (
                "Loading faculty information..."
              )}
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
              <UserIcon className="w-5 h-5 text-muted-foreground" data-testid="button-notifications" />
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
          {defaultStats.map((stat, index) => {
            const Icon = stat.icon;
            const value = (facultyStats && stat.key in facultyStats) ? facultyStats[stat.key] : (statsLoading ? "..." : "N/A");
            return (
              <Card key={index} className="card-hover">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-muted-foreground">{stat.title}</p>
                      <p className="text-2xl font-bold text-foreground" data-testid={stat.testId}>
                        {statsLoading ? (
                          <Loader2 className="w-6 h-6 animate-spin" />
                        ) : (
                          value
                        )}
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
                {classesLoading ? (
                  <div className="flex items-center justify-center p-8">
                    <Loader2 className="w-6 h-6 animate-spin mr-2" />
                    <span className="text-muted-foreground">Loading today's classes...</span>
                  </div>
                ) : todaysClasses.length > 0 ? (
                  todaysClasses.map((cls, index) => (
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
                  ))
                ) : (
                  <div className="text-center p-8 text-muted-foreground">
                    <Clock className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>No classes scheduled for today</p>
                  </div>
                )}
                
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
                {updatesLoading ? (
                  <div className="flex items-center justify-center p-4">
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    <span className="text-sm text-muted-foreground">Loading updates...</span>
                  </div>
                ) : academicUpdates.length > 0 ? (
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
                  <div className="text-center p-4 text-muted-foreground">
                    <Bell className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No recent updates</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Weekly Overview */}
            <Card>
              <CardHeader>
                <CardTitle>Weekly Overview</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {scheduleLoading ? (
                  <div className="flex items-center justify-center p-4">
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    <span className="text-sm text-muted-foreground">Loading schedule...</span>
                  </div>
                ) : weeklySchedule.length > 0 ? (
                  weeklySchedule.map((day, index) => (
                    <div key={index} className="flex items-center justify-between" data-testid={`weekly-${index}`}>
                      <span className="text-sm text-foreground">{day.day}</span>
                      <div className="text-right">
                        <p className="text-sm font-medium text-foreground">{day.classes} classes</p>
                        <p className="text-xs text-muted-foreground">{day.hours} hrs</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center p-4 text-muted-foreground">
                    <Calendar className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No schedule data available</p>
                  </div>
                )}
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
            {coursesLoading ? (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="w-6 h-6 animate-spin mr-2" />
                <span className="text-muted-foreground">Loading assigned courses...</span>
              </div>
            ) : assignedCourses.length > 0 ? (
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
                          Sections: {Array.isArray(course.sections) ? course.sections.join(", ") : course.sections}
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
            ) : (
              <div className="text-center p-8 text-muted-foreground">
                <BookOpen className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No courses assigned for this semester</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Faculty Timetable */}
        {timetableSlots?.length > 0 && courses?.length > 0 && faculty?.length > 0 && rooms?.length > 0 && (
          <TimetableGrid
            slots={timetableSlots}
            courses={courses}
            faculty={faculty}
            rooms={rooms}
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