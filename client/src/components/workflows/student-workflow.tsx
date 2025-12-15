import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { 
  GraduationCap, 
  BookOpen, 
  Calendar, 
  Clock, 
  CheckCircle, 
  AlertTriangle,
  Download,
  RefreshCw,
  Target,
  Users,
  User,
  MapPin,
  Star,
  Zap
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/contexts/AuthContext";

interface Course {
  id: string;
  courseCode: string;
  courseName: string;
  credits: number;
  type: "core" | "elective" | "skill" | "project";
  category: string;
  description: string;
  prerequisites?: string[];
  maxStudents: number;
  enrolledStudents: number;
  faculty: string;
  availableSections: Array<{
    sectionId: string;
    timeSlots: Array<{
      day: string;
      startTime: string;
      endTime: string;
      room: string;
    }>;
    availableSeats: number;
  }>;
}

interface StudentSelection {
  courseId: string;
  sectionId: string;
  priority: number;
}

interface PersonalTimetable {
  studentId: string;
  totalCredits: number;
  enrolledCourses: Array<{
    courseId: string;
    courseCode: string;
    courseName: string;
    section: string;
    credits: number;
    faculty: string;
    schedule: Array<{
      day: string;
      startTime: string;
      endTime: string;
      room: string;
      slotId: string;
    }>;
  }>;
  conflicts: Array<{
    type: string;
    description: string;
    suggestions: string[];
  }>;
}

export default function StudentWorkflow() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("selection");
  const [selectedCourses, setSelectedCourses] = useState<StudentSelection[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [creditTarget, setCreditTarget] = useState(20);
  const [slotPickerCourseId, setSlotPickerCourseId] = useState<string | null>(null);

  // Use authenticated user
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const studentId = user?.id;

  // Fetch available courses from backend and map to UI shape
  const { data: courseData } = useQuery<{programCourses?: Course[], otherSemesterCourses?: Course[], allCourses?: Course[]}>({
    queryKey: [studentId ? `/api/students/${studentId}/available-courses?grouped=true` : ""],
    enabled: !!studentId && isAuthenticated && !authLoading,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/students/${studentId}/available-courses?grouped=true`);
      const raw = await res.json();
      
      const mapType = (t?: string): Course["type"] => {
        const tt = (t || "").toLowerCase();
        if (tt === "core") return "core";
        if (tt === "project") return "project";
        if (tt === "elective") return "elective";
        if (tt === "lab") return "skill"; // map lab to skill for UI badge
        return "elective";
      };
      
      const mapCourse = (c: any): Course => ({
        id: c.id,
        courseCode: c.courseCode,
        courseName: c.courseName,
        credits: c.credits,
        type: mapType(c.courseType),
        category: c.courseType || "Course",
        description: c.description || "",
        prerequisites: Array.isArray(c.prerequisites) ? c.prerequisites : [],
        maxStudents: 60,
        enrolledStudents: 0,
        faculty: "TBD",
        availableSections: [
          {
            sectionId: "A1",
            timeSlots: [],
            availableSeats: 60,
          },
        ],
      });

      // Handle grouped response
      if (raw.programCourses && raw.otherSemesterCourses) {
        return {
          programCourses: raw.programCourses.map(mapCourse),
          otherSemesterCourses: raw.otherSemesterCourses.map(mapCourse),
          allCourses: [...raw.programCourses, ...raw.otherSemesterCourses].map(mapCourse)
        };
      }
      
      // Fallback for non-grouped response
      return {
        allCourses: (raw as any[]).map(mapCourse)
      };
    },
  });

  // Fetch timetable slots to get faculty and time slot details
  const { data: timetableSlots, isLoading: loadingSlots } = useQuery({
    queryKey: ["timetable-slots"],
    enabled: !!studentId && isAuthenticated && !authLoading,
    queryFn: async () => {
      try {
        // Get all timetables first
        const timetablesRes = await apiRequest("GET", "/api/timetables");
        const timetables = await timetablesRes.json();
        
        // Get slots for all timetables and combine them
        const allSlots = [];
        for (const timetable of timetables) {
          try {
            const slotsRes = await apiRequest("GET", `/api/timetables/${timetable.id}/slots`);
            const slots = await slotsRes.json();
            allSlots.push(...slots);
          } catch (error) {
            console.warn(`Failed to fetch slots for timetable ${timetable.id}:`, error);
          }
        }
        return allSlots;
      } catch (error) {
        console.error("Failed to fetch timetable slots:", error);
        return [];
      }
    },
  });

  // Create a map of courseId to faculty and time slots
  const courseSlotMap = new Map();
  if (timetableSlots) {
    timetableSlots.forEach((slot: any) => {
      if (!courseSlotMap.has(slot.courseId)) {
        courseSlotMap.set(slot.courseId, {
          faculty: slot.facultyName || slot.facultyId || "TBD",
          timeSlots: []
        });
      }
      courseSlotMap.get(slot.courseId).timeSlots.push({
        day: slot.dayOfWeek,
        startTime: slot.startTime,
        endTime: slot.endTime,
        room: slot.roomName || slot.roomId || "TBD"
      });
    });
  }

  // Extract all available courses for display with enriched data
  const enrichCourseWithSlots = (course: Course): Course => {
    const slotInfo = courseSlotMap.get(course.id);
    return {
      ...course,
      faculty: slotInfo?.faculty || "TBD",
      availableSections: [
        {
          sectionId: "A1",
          timeSlots: slotInfo?.timeSlots || [],
          availableSeats: 60,
        },
      ],
    };
  };

  const availableCourses = (courseData?.allCourses || []).map(enrichCourseWithSlots);
  const programCourses = (courseData?.programCourses || []).map(enrichCourseWithSlots);
  const otherSemesterCourses = (courseData?.otherSemesterCourses || []).map(enrichCourseWithSlots);

  const { data: personalTimetable, refetch: refetchTimetable } = useQuery<PersonalTimetable>({
    queryKey: [studentId ? `/api/students/${studentId}/timetable` : ""],
    enabled: !!studentId && isAuthenticated && !authLoading,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/students/${studentId}/timetable`);
      return res.json();
    }
  });

  type CourseSlot = {
    id: string;
    dayOfWeek: string;
    startTime: string;
    endTime: string;
    roomId?: string;
    facultyId?: string;
    slotType?: string;
    conflictsWithCurrent?: boolean;
  };

  const { data: courseSlots, refetch: refetchCourseSlots, isFetching: loadingCourseSlots } = useQuery<CourseSlot[]>({
    queryKey: [studentId && slotPickerCourseId ? `/api/students/${studentId}/course/${slotPickerCourseId}/slots` : ""],
    enabled: !!studentId && !!slotPickerCourseId && isAuthenticated && !authLoading,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/students/${studentId}/course/${slotPickerCourseId}/slots`);
      return res.json();
    }
  });

  const handleExport = async (format: 'pdf' | 'excel') => {
    try {
      const exportData = {
        studentId,
        personalTimetable: personalTimetable || {},
        selectedCourses,
        totalCredits: getCurrentCredits(),
        format,
        timestamp: new Date().toISOString(),
      };

      const response = await apiRequest("POST", `/api/students/export/${format}`, exportData);
      
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = `student-timetable-${new Date().toISOString().split('T')[0]}.${format === 'pdf' ? 'pdf' : 'xlsx'}`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        toast({
          title: "Export Successful",
          description: `Personal timetable exported as ${format.toUpperCase()} successfully.`,
        });
      } else {
        throw new Error('Export failed');
      }
    } catch (error) {
      toast({
        title: "Export Failed",
        description: `Failed to export timetable as ${format.toUpperCase()}. Please try again.`,
        variant: "destructive",
      });
    }
  };

  const handleCalendarSync = async (type: 'google' | 'ical') => {
    try {
      const calendarData = {
        studentId,
        personalTimetable: personalTimetable || {},
        events: personalTimetable?.enrolledCourses?.flatMap(course => 
          course.schedule.map((slot: any) => ({
            title: `${course.courseCode} - ${course.courseName}`,
            description: `Section: ${course.section} | Faculty: ${course.faculty}`,
            startTime: slot.startTime,
            endTime: slot.endTime,
            day: slot.day,
            location: slot.room,
            recurrence: 'weekly'
          }))
        ) || [],
        type,
        timestamp: new Date().toISOString(),
      };

      if (type === 'google') {
        // For Google Calendar integration
        const response = await apiRequest("POST", `/api/students/calendar/google-sync`, calendarData);
        
        if (response.ok) {
          const result = await response.json();
          if (result.authUrl) {
            // Open Google OAuth flow in new window
            window.open(result.authUrl, '_blank', 'width=500,height=600');
            toast({
              title: "Google Calendar Sync",
              description: "Please authorize access in the new window to sync your timetable.",
            });
          } else {
            toast({
              title: "Sync Successful",
              description: "Your timetable has been synced to Google Calendar.",
            });
          }
        } else {
          throw new Error('Google sync failed');
        }
      } else if (type === 'ical') {
        // For iCal export
        const response = await apiRequest("POST", `/api/students/calendar/ical`, calendarData);
        
        if (response.ok) {
          const blob = await response.blob();
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.style.display = 'none';
          a.href = url;
          a.download = `student-timetable-${new Date().toISOString().split('T')[0]}.ics`;
          document.body.appendChild(a);
          a.click();
          window.URL.revokeObjectURL(url);
          document.body.removeChild(a);

          toast({
            title: "iCal Export Successful",
            description: "Calendar file downloaded. Import it into your preferred calendar app.",
          });
        } else {
          throw new Error('iCal export failed');
        }
      }
    } catch (error) {
      toast({
        title: "Calendar Sync Failed",
        description: `Failed to sync with ${type === 'google' ? 'Google Calendar' : 'iCal'}. Please try again.`,
        variant: "destructive",
      });
    }
  };

  const generatePersonalTimetableMutation = useMutation({
    mutationFn: async (selections: StudentSelection[]) => {
      setIsGenerating(true);
      setProgress(0);

      // Register each selected course sequentially
      const total = selections.length;
      let completed = 0;
      for (const sel of selections) {
        const res = await apiRequest("POST", `/api/students/${studentId}/register-course`, { courseId: sel.courseId });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err?.message || `Failed to register ${sel.courseId}`);
        }
        completed += 1;
        setProgress(Math.round((completed / total) * 100));
      }
      return { success: true };
    },
    onSuccess: async () => {
      toast({
        title: "✅ Registered",
        description: `Successfully registered ${selectedCourses.length} course(s).`
      });
      setIsGenerating(false);
      setSelectedCourses([]);
      await refetchTimetable();
    },
    onError: (error: any) => {
      toast({
        title: "Registration Failed",
        description: error?.message || "One or more courses could not be registered.",
        variant: "destructive"
      });
      setIsGenerating(false);
      setProgress(0);
    }
  });

  const selectSlotMutation = useMutation({
    mutationFn: async ({ courseId, slotId }: { courseId: string; slotId: string }) => {
      const res = await apiRequest("POST", `/api/students/${studentId}/select-slot`, { courseId, slotId });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.message || "Failed to select slot");
      }
      return res.json();
    },
    onSuccess: async () => {
      toast({ title: "Slot Selected", description: "Your timetable has been updated." });
      await refetchTimetable();
      if (slotPickerCourseId) {
        await refetchCourseSlots();
      }
    },
    onError: (error: any) => {
      toast({ title: "Selection Failed", description: error?.message || "", variant: "destructive" });
    }
  });

  const addCourseSelection = (courseId: string, sectionId: string) => {
    const course = availableCourses?.find(c => c.id === courseId);
    if (!course) return;

    const currentCredits = getCurrentCredits();
    if (currentCredits + course.credits > 24) {
      toast({
        title: "Credit Limit Exceeded",
        description: "Adding this course would exceed the maximum credit limit of 24.",
        variant: "destructive"
      });
      return;
    }

    setSelectedCourses(prev => [
      ...prev.filter(s => s.courseId !== courseId),
      { courseId, sectionId, priority: prev.length + 1 }
    ]);

    toast({
      title: "Course Added",
      description: `${course.courseCode} - ${course.courseName} added to your selection.`
    });
  };

  const removeCourseSelection = (courseId: string) => {
    setSelectedCourses(prev => prev.filter(s => s.courseId !== courseId));
  };

  const getCurrentCredits = () => {
    const selectedCredits = selectedCourses.reduce((sum, sel) => {
      const course = availableCourses?.find(c => c.id === sel.courseId);
      return sum + (course?.credits || 0);
    }, 0);
    return (personalTimetable?.totalCredits || 0) + selectedCredits;
  };

  const getAvailabilityColor = (availableSeats: number, maxStudents: number) => {
    const percentage = (availableSeats / maxStudents) * 100;
    if (percentage > 50) return "text-green-600";
    if (percentage > 20) return "text-yellow-600";
    return "text-red-600";
  };

  const getCreditStatusColor = (credits: number) => {
    if (credits < 18) return "text-yellow-600";
    if (credits > 22) return "text-red-600";
    return "text-green-600";
  };

  return (
    <div className="space-y-6">
      {/* Header with Credit Status */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <div className={`text-2xl font-bold ${getCreditStatusColor(getCurrentCredits())}`}>
              {getCurrentCredits()}/24
            </div>
            <div className="text-sm text-muted-foreground">Credits (Current/Max)</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-primary">
              {personalTimetable?.enrolledCourses.length || 0}
            </div>
            <div className="text-sm text-muted-foreground">Enrolled Courses</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-secondary">
              {selectedCourses.length}
            </div>
            <div className="text-sm text-muted-foreground">Pending Selection</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-accent">
              {creditTarget}
            </div>
            <div className="text-sm text-muted-foreground">Target Credits</div>
          </CardContent>
        </Card>
      </div>

      {/* Credit Validation Alert */}
      {getCurrentCredits() < 18 && (
        <Alert>
          <AlertTriangle className="w-4 h-4" />
          <AlertDescription>
            You need at least 18 credits to meet minimum requirements. Current: {getCurrentCredits()} credits.
          </AlertDescription>
        </Alert>
      )}

      {getCurrentCredits() > 22 && (
        <Alert>
          <AlertTriangle className="w-4 h-4" />
          <AlertDescription>
            You have exceeded the recommended credit limit of 22. Consider removing some courses.
          </AlertDescription>
        </Alert>
      )}

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <div className="flex justify-between items-center">
          <TabsList className="grid grid-cols-3">
            <TabsTrigger value="selection">
              <BookOpen className="w-4 h-4 mr-2" />
              Course Selection
            </TabsTrigger>
            <TabsTrigger value="timetable">
              <Calendar className="w-4 h-4 mr-2" />
              My Timetable
            </TabsTrigger>
            <TabsTrigger value="conflicts">
              <AlertTriangle className="w-4 h-4 mr-2" />
              Conflict Resolution
            </TabsTrigger>
          </TabsList>
          
          {/* Export and Calendar Sync Buttons */}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => handleExport('pdf')}>
              <Download className="w-4 h-4 mr-1" />
              Export PDF
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleExport('excel')}>
              <Download className="w-4 h-4 mr-1" />
              Export Excel
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleCalendarSync('google')}>
              <Calendar className="w-4 h-4 mr-1" />
              Sync to Google
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleCalendarSync('ical')}>
              <Calendar className="w-4 h-4 mr-1" />
              Export iCal
            </Button>
          </div>
        </div>

        {/* Course Selection Tab */}
        <TabsContent value="selection">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Available Courses */}
            <div className="lg:col-span-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BookOpen className="w-5 h-5" />
                    Available Courses
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Program Courses Section */}
                  {programCourses.length > 0 && (
                    <div className="space-y-4">
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-semibold text-primary">Your Program Courses</h3>
                        <Badge variant="default">{programCourses.length} courses</Badge>
                      </div>
                      {programCourses.map((course) => (
                        <Card key={course.id} className="border-l-4 border-l-primary">
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between">
                              <div className="space-y-2 flex-1">
                                <div className="flex items-center gap-2">
                                  <h4 className="font-semibold">
                                    {course.courseCode} - {course.courseName}
                                  </h4>
                                  <Badge variant="outline">{course.credits} Credits</Badge>
                                  <Badge variant="secondary">{course.type}</Badge>
                                  <Badge variant="default" className="text-xs">Your Program</Badge>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                  {course.description}
                                </p>
                                <div className="flex items-center gap-4 text-sm">
                                  <span className="flex items-center gap-1">
                                    <Users className="w-4 h-4" />
                                    {course.enrolledStudents}/{course.maxStudents}
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <User className="w-4 h-4" />
                                    Faculty: {loadingSlots ? (
                                      <span className="text-muted-foreground">Loading...</span>
                                    ) : (
                                      <span className="font-medium">{course.faculty}</span>
                                    )}
                                  </span>
                                </div>
                                {course.prerequisites && course.prerequisites.length > 0 && (
                                  <div className="text-sm text-muted-foreground">
                                    Prerequisites: {course.prerequisites.join(", ")}
                                  </div>
                                )}
                              </div>
                            </div>
                            
                            <div className="mt-4 space-y-2">
                              <Label className="text-sm font-medium">Available Sections:</Label>
                              {course.availableSections.map((section) => (
                                <div key={section.sectionId} className="p-3 bg-muted rounded-lg">
                                  <div className="flex items-center justify-between mb-2">
                                    <span className="font-medium">Section {section.sectionId}</span>
                                    <div className="flex items-center gap-2">
                                      <span className={`text-sm ${getAvailabilityColor(section.availableSeats, course.maxStudents)}`}>
                                        {section.availableSeats} seats available
                                      </span>
                                      <Button 
                                        size="sm"
                                        onClick={() => addCourseSelection(course.id, section.sectionId)}
                                        disabled={
                                          selectedCourses.some(s => s.courseId === course.id) ||
                                          section.availableSeats === 0 ||
                                          getCurrentCredits() + course.credits > 24
                                        }
                                      >
                                        {selectedCourses.some(s => s.courseId === course.id) ? "Selected" : "Select"}
                                      </Button>
                                    </div>
                                  </div>
                                  <div className="grid grid-cols-1 md:grid-cols-3 gap-1">
                                    {section.timeSlots.map((slot, index) => (
                                      <div key={index} className="text-xs p-2 bg-background rounded text-center">
                                        <div className="font-medium">{slot.day}</div>
                                        <div>{slot.startTime} - {slot.endTime}</div>
                                        <div className="text-muted-foreground">{slot.room}</div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}

                  {/* Other Semester Courses Section */}
                  {otherSemesterCourses.length > 0 && (
                    <div className="space-y-4">
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-semibold text-secondary">Other Programs (Same Semester)</h3>
                        <Badge variant="secondary">{otherSemesterCourses.length} courses</Badge>
                      </div>
                      <Alert>
                        <Star className="w-4 h-4" />
                        <AlertDescription>
                          These courses are from other programs in your semester. You can select them as electives or for skill enhancement.
                        </AlertDescription>
                      </Alert>
                      {otherSemesterCourses.map((course) => (
                        <Card key={course.id} className="border-l-4 border-l-secondary">
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between">
                              <div className="space-y-2 flex-1">
                                <div className="flex items-center gap-2">
                                  <h4 className="font-semibold">
                                    {course.courseCode} - {course.courseName}
                                  </h4>
                                  <Badge variant="outline">{course.credits} Credits</Badge>
                                  <Badge variant="secondary">{course.type}</Badge>
                                  <Badge variant="outline" className="text-xs">Cross-Program</Badge>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                  {course.description}
                                </p>
                                <div className="flex items-center gap-4 text-sm">
                                  <span className="flex items-center gap-1">
                                    <Users className="w-4 h-4" />
                                    {course.enrolledStudents}/{course.maxStudents}
                                  </span>
                                  <span>Faculty: {course.faculty}</span>
                                </div>
                                {course.prerequisites && course.prerequisites.length > 0 && (
                                  <div className="text-sm text-muted-foreground">
                                    Prerequisites: {course.prerequisites.join(", ")}
                                  </div>
                                )}
                              </div>
                            </div>
                            
                            <div className="mt-4 space-y-2">
                              <Label className="text-sm font-medium">Available Sections:</Label>
                              {course.availableSections.map((section) => (
                                <div key={section.sectionId} className="p-3 bg-muted rounded-lg">
                                  <div className="flex items-center justify-between mb-2">
                                    <span className="font-medium">Section {section.sectionId}</span>
                                    <div className="flex items-center gap-2">
                                      <span className={`text-sm ${getAvailabilityColor(section.availableSeats, course.maxStudents)}`}>
                                        {section.availableSeats} seats available
                                      </span>
                                      <Button 
                                        size="sm"
                                        onClick={() => addCourseSelection(course.id, section.sectionId)}
                                        disabled={
                                          selectedCourses.some(s => s.courseId === course.id) ||
                                          section.availableSeats === 0 ||
                                          getCurrentCredits() + course.credits > 24
                                        }
                                      >
                                        {selectedCourses.some(s => s.courseId === course.id) ? "Selected" : "Select"}
                                      </Button>
                                    </div>
                                  </div>
                                  <div className="grid grid-cols-1 md:grid-cols-3 gap-1">
                                    {section.timeSlots.map((slot, index) => (
                                      <div key={index} className="text-xs p-2 bg-background rounded text-center">
                                        <div className="font-medium">{slot.day}</div>
                                        <div>{slot.startTime} - {slot.endTime}</div>
                                        <div className="text-muted-foreground">{slot.room}</div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}

                  {/* No courses available message */}
                  {availableCourses.length === 0 && (
                    <div className="text-center py-8">
                      <BookOpen className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                      <h3 className="text-lg font-semibold mb-2">No Available Courses</h3>
                      <p className="text-muted-foreground">
                        All courses for your semester appear to be enrolled or unavailable.
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Selection Summary */}
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Target className="w-5 h-5" />
                    My Selections
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {selectedCourses.length > 0 ? (
                    <>
                      {selectedCourses.map((selection) => {
                        const course = availableCourses?.find(c => c.id === selection.courseId);
                        return (
                          <div key={selection.courseId} className="p-3 border rounded-lg">
                            <div className="flex items-center justify-between">
                              <div>
                                <div className="font-medium text-sm">{course?.courseCode}</div>
                                <div className="text-xs text-muted-foreground">
                                  Section {selection.sectionId} • {course?.credits} credits
                                </div>
                              </div>
                              <Button 
                                size="sm" 
                                variant="outline"
                                onClick={() => removeCourseSelection(selection.courseId)}
                              >
                                Remove
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                      
                      <Button 
                        className="w-full"
                        onClick={() => generatePersonalTimetableMutation.mutate(selectedCourses)}
                        disabled={isGenerating || selectedCourses.length === 0}
                      >
                        {isGenerating ? (
                          <>
                            <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                            Generating Timetable...
                          </>
                        ) : (
                          <>
                            <Zap className="w-4 h-4 mr-2" />
                            Generate My Timetable
                          </>
                        )}
                      </Button>

                      {isGenerating && (
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span>Processing...</span>
                            <span>{progress}%</span>
                          </div>
                          <Progress value={progress} className="h-2" />
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-center py-4">
                      <BookOpen className="w-12 h-12 text-muted-foreground mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">
                        No courses selected yet. Choose from available courses.
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Credit Target</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <Label htmlFor="creditTarget">Target Credits (18-22 recommended)</Label>
                    <Input
                      id="creditTarget"
                      type="number"
                      min="18"
                      max="24"
                      value={creditTarget}
                      onChange={(e) => setCreditTarget(parseInt(e.target.value) || 20)}
                    />
                    <div className="text-xs text-muted-foreground">
                      Current: {getCurrentCredits()} credits
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* Personal Timetable Tab */}
        <TabsContent value="timetable">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                My Personal Timetable
              </CardTitle>
            </CardHeader>
            <CardContent>
              {personalTimetable && personalTimetable.enrolledCourses.length > 0 ? (
                <div className="space-y-6">
                  {/* Weekly Schedule Grid (dynamic times) */}
                  <div className="overflow-x-auto">
                    {(() => {
                      const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
                      // Collect unique time ranges from the student's schedule
                      const timeSet = new Set<string>();
                      for (const c of personalTimetable.enrolledCourses) {
                        for (const s of c.schedule) {
                          timeSet.add(`${s.startTime}-${s.endTime}`);
                        }
                      }
                      const times = Array.from(timeSet);
                      // Sort by start time lexicographically (works for HH:MM format)
                      times.sort((a, b) => a.localeCompare(b));
                      if (times.length === 0) {
                        return (
                          <div className="p-4 text-sm text-muted-foreground">
                            No scheduled class times found yet. Your enrolled courses appear below; slots will appear once a timetable is published for them or after you pick a slot.
                          </div>
                        );
                      }
                      return (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Time</TableHead>
                              {days.map(d => (<TableHead key={d}>{d}</TableHead>))}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {times.map(range => {
                              const [startTime, endTime] = range.split("-");
                              return (
                                <TableRow key={range}>
                                  <TableCell className="font-medium">{range}</TableCell>
                                  {days.map(day => {
                                    // Find a course occupying this day/time range
                                    const course = personalTimetable.enrolledCourses.find(c => 
                                      c.schedule.some(s => s.day === day && s.startTime === startTime && s.endTime === endTime)
                                    );
                                    const slot = course?.schedule.find(s => s.day === day && s.startTime === startTime && s.endTime === endTime);
                                    return (
                                      <TableCell key={day}>
                                        {course && slot ? (
                                          <div className="p-2 bg-primary/10 rounded text-center">
                                            <div className="font-medium text-sm">{course.courseCode}</div>
                                            <div className="text-xs text-muted-foreground">{slot.room}</div>
                                            <div className="text-xs text-muted-foreground">{course.faculty}</div>
                                          </div>
                                        ) : (
                                          <div className="p-2 text-center text-muted-foreground text-xs">Free</div>
                                        )}
                                      </TableCell>
                                    );
                                  })}
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      );
                    })()}
                  </div>

                  {/* Course List */}
                  <div className="space-y-3">
                    <h3 className="font-medium">Enrolled Courses</h3>
                    {personalTimetable.enrolledCourses.map((course, index) => (
                      <Card key={index}>
                        <CardContent className="p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="font-medium">{course.courseCode} - {course.courseName}</div>
                              <div className="text-sm text-muted-foreground">
                                Section {course.section} • {course.credits} credits • {course.faculty}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline">{course.schedule.length} hours/week</Badge>
                              <Button size="sm" variant="outline" onClick={() => setSlotPickerCourseId(prev => prev === course.courseId ? null : course.courseId)}>
                                {slotPickerCourseId === course.courseId ? "Hide Slots" : "Pick Slot"}
                              </Button>
                            </div>
                          </div>

                          {slotPickerCourseId === course.courseId && (
                            <div className="border rounded p-3">
                              {loadingCourseSlots ? (
                                <div className="text-sm text-muted-foreground">Loading slots...</div>
                              ) : courseSlots && courseSlots.length > 0 ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                                  {courseSlots.map((s) => (
                                    <div key={s.id} className={`p-2 rounded border ${s.conflictsWithCurrent ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
                                      <div className="text-sm font-medium">{s.dayOfWeek} {s.startTime}-{s.endTime}</div>
                                      <div className="text-xs text-muted-foreground">Room: {s.roomId || 'TBA'}</div>
                                      <div className="mt-2">
                                        <Button size="sm" disabled={!!s.conflictsWithCurrent} onClick={() => selectSlotMutation.mutate({ courseId: course.courseId, slotId: s.id })}>
                                          {s.conflictsWithCurrent ? 'Clashes' : 'Select'}
                                        </Button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="text-sm text-muted-foreground">No slots available.</div>
                              )}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-center py-12">
                  <Calendar className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium mb-2">No Timetable Generated</h3>
                  <p className="text-muted-foreground mb-4">
                    Select courses and generate your personal timetable to view your schedule.
                  </p>
                  <Button onClick={() => setActiveTab("selection")}>
                    <BookOpen className="w-4 h-4 mr-2" />
                    Select Courses
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Conflict Resolution Tab */}
        <TabsContent value="conflicts">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" />
                Conflict Resolution & Alternatives
              </CardTitle>
            </CardHeader>
            <CardContent>
              {personalTimetable?.conflicts && personalTimetable.conflicts.length > 0 ? (
                <div className="space-y-4">
                  {personalTimetable.conflicts.map((conflict, index) => (
                    <Alert key={index}>
                      <AlertTriangle className="w-4 h-4" />
                      <AlertDescription>
                        <div className="space-y-2">
                          <div className="font-medium">{conflict.type}</div>
                          <div>{conflict.description}</div>
                          {conflict.suggestions.length > 0 && (
                            <div>
                              <div className="font-medium text-sm">Suggested alternatives:</div>
                              <ul className="list-disc list-inside text-sm space-y-1">
                                {conflict.suggestions.map((suggestion, suggestionIndex) => (
                                  <li key={suggestionIndex}>{suggestion}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      </AlertDescription>
                    </Alert>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
                  <h3 className="text-lg font-medium mb-2">No Conflicts Detected</h3>
                  <p className="text-muted-foreground">
                    Your current course selection has no scheduling conflicts. All courses fit perfectly in your timetable!
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm">
              <Download className="w-4 h-4 mr-1" />
              Export Timetable
            </Button>
            <Button variant="outline" size="sm">
              <Calendar className="w-4 h-4 mr-1" />
              Sync to Calendar
            </Button>
            <Button variant="outline" size="sm">
              <RefreshCw className="w-4 h-4 mr-1" />
              Refresh Availability
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
