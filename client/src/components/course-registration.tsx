import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, BookOpen, Plus, Trash2, Clock, GraduationCap, AlertCircle, Calendar, AlertTriangle } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import type { Course } from "@shared/schema";

type GroupedAvailableCourses = {
  programCourses: Course[];
  otherSemesterCourses: Course[];
};

export default function CourseRegistration() {
  const { toast } = useToast();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");

  // Fetch available courses for the student (grouped view)
  const { data: availableCourses, isLoading: loadingAvailable, error: availableCoursesError } = useQuery<GroupedAvailableCourses>({
    queryKey: [`/api/students/${user?.id}/available-courses?grouped=true`],
    enabled: !!user?.id && isAuthenticated && !authLoading,
  });

  // Fetch registered courses for the student  
  const { data: registeredCourses, isLoading: loadingRegistered, error: registeredCoursesError } = useQuery<Course[]>({
    queryKey: [`/api/students/${user?.id}/registered-courses`],
    enabled: !!user?.id && isAuthenticated && !authLoading,
  });

  // Personal timetable types and query
  interface PersonalTimetable {
    studentId: string;
    totalCredits: number;
    enrolledCourses: Array<{
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
      severity?: string;
      suggestions: string[];
    }>;
  }

  const { data: personalTimetable, isLoading: loadingTimetable, error: timetableError } = useQuery<PersonalTimetable>({
    queryKey: [`/api/students/${user?.id}/timetable`],
    enabled: !!user?.id && isAuthenticated && !authLoading,
  });

  // Course registration mutation
  const registerCourseMutation = useMutation({
    mutationFn: async (courseId: string) => {
      const response = await apiRequest("POST", `/api/students/${user?.id}/register-course`, {
        courseId
      });
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Success",
        description: "Successfully registered for course!",
      });
      // Invalidate both available and registered courses
      queryClient.invalidateQueries({ queryKey: [`/api/students/${user?.id}/available-courses?grouped=true`] });
      queryClient.invalidateQueries({ queryKey: [`/api/students/${user?.id}/registered-courses`] });
      queryClient.invalidateQueries({ queryKey: [`/api/students/${user?.id}/timetable`] });
    },
    onError: (error: any) => {
      let title = "Registration Failed";
      let description = "Failed to register for course";
      
      if (error?.status === 401 || error?.message?.includes("Unauthorized")) {
        title = "Authentication Required";
        description = "Please log in to register for courses";
      } else if (error instanceof Error) {
        description = error.message;
      }
      
      toast({
        title,
        description,
        variant: "destructive",
      });
    },
  });

  // Course unregistration mutation
  const unregisterCourseMutation = useMutation({
    mutationFn: async (courseId: string) => {
      const response = await apiRequest("DELETE", `/api/students/${user?.id}/register-course/${courseId}`);
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Success", 
        description: "Successfully unregistered from course!",
      });
      // Invalidate both available and registered courses
      queryClient.invalidateQueries({ queryKey: [`/api/students/${user?.id}/available-courses?grouped=true`] });
      queryClient.invalidateQueries({ queryKey: [`/api/students/${user?.id}/registered-courses`] });
      queryClient.invalidateQueries({ queryKey: [`/api/students/${user?.id}/timetable`] });
    },
    onError: (error: any) => {
      let title = "Unregistration Failed";
      let description = "Failed to unregister from course";
      
      if (error?.status === 401 || error?.message?.includes("Unauthorized")) {
        title = "Authentication Required";
        description = "Please log in to unregister from courses";
      } else if (error instanceof Error) {
        description = error.message;
      }
      
      toast({
        title,
        description,
        variant: "destructive",
      });
    },
  });

  // Filter courses based on search term (for both baskets)
  const programCourses = availableCourses?.programCourses || [];
  const otherSemesterCourses = availableCourses?.otherSemesterCourses || [];

  const filteredProgramCourses = programCourses.filter(course =>
    course.courseName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    course.courseCode.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredOtherSemesterCourses = otherSemesterCourses.filter(course =>
    course.courseName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    course.courseCode.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalFilteredAvailable = filteredProgramCourses.length + filteredOtherSemesterCourses.length;

  const filteredRegisteredCourses = registeredCourses?.filter(course =>
    course.courseName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    course.courseCode.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const handleRegisterCourse = (courseId: string) => {
    if (!user?.id || !isAuthenticated) {
      toast({
        title: "Authentication Required",
        description: "Please log in to register for courses",
        variant: "destructive",
      });
      return;
    }
    registerCourseMutation.mutate(courseId);
  };

  const handleUnregisterCourse = (courseId: string) => {
    if (!user?.id || !isAuthenticated) {
      toast({
        title: "Authentication Required",
        description: "Please log in to unregister from courses",
        variant: "destructive",
      });
      return;
    }
    unregisterCourseMutation.mutate(courseId);
  };

  // Show loading spinner while auth is initializing
  if (authLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        <p className="mt-2 text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  // Show login prompt if not authenticated
  if (!isAuthenticated) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center">
        <AlertCircle className="w-12 h-12 text-muted-foreground mb-4" />
        <h2 className="text-xl font-semibold mb-2">Authentication Required</h2>
        <p className="text-muted-foreground text-center mb-4">
          Please log in to access course registration
        </p>
      </div>
    );
  }

  // Show error if user data is missing
  if (!user?.id) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center">
        <AlertCircle className="w-12 h-12 text-destructive mb-4" />
        <h2 className="text-xl font-semibold mb-2">User Data Missing</h2>
        <p className="text-muted-foreground text-center mb-4">
          Unable to load user information. Please try logging in again.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col">
      {/* Header */}
      <header className="bg-card border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground" data-testid="page-title">Course Registration</h1>
            <p className="text-sm text-muted-foreground">
              Register for courses and manage your enrollments
            </p>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 p-6 overflow-auto">
        {/* Search */}
        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Search className="w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search courses..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="flex-1"
                data-testid="input-search-courses"
              />
            </div>
          </CardContent>
        </Card>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">Registered Courses</p>
                  <p className="text-2xl font-bold text-foreground" data-testid="stat-registered-courses">
                    {registeredCourses?.length || 0}
                  </p>
                  <p className="text-xs text-muted-foreground">Current semester</p>
                </div>
                <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                  <BookOpen className="text-primary text-xl" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">Available Courses</p>
                  <p className="text-2xl font-bold text-foreground" data-testid="stat-available-courses">
                    {(programCourses.length + otherSemesterCourses.length) || 0}
                  </p>
                  <p className="text-xs text-muted-foreground">Eligible to register</p>
                </div>
                <div className="w-12 h-12 bg-secondary/10 rounded-full flex items-center justify-center">
                  <Plus className="text-secondary text-xl" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">Total Credits</p>
                  <p className="text-2xl font-bold text-foreground" data-testid="stat-total-credits">
                    {registeredCourses?.reduce((sum, course) => sum + course.credits, 0) || 0}
                  </p>
                  <p className="text-xs text-muted-foreground">Currently enrolled</p>
                </div>
                <div className="w-12 h-12 bg-accent/10 rounded-full flex items-center justify-center">
                  <GraduationCap className="text-accent text-xl" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Course Tabs */}
        <Tabs defaultValue="available" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="available" data-testid="tab-available-courses">
              Available Courses ({totalFilteredAvailable})
            </TabsTrigger>
            <TabsTrigger value="registered" data-testid="tab-registered-courses">
              Registered Courses ({filteredRegisteredCourses.length})
            </TabsTrigger>
            <TabsTrigger value="timetable" data-testid="tab-personal-timetable">
              My Timetable
            </TabsTrigger>
          </TabsList>

          {/* Available Courses Tab */}
          <TabsContent value="available">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Plus className="w-5 h-5" />
                  Available Courses
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loadingAvailable ? (
                  <div className="text-center py-8">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                    <p className="mt-2 text-sm text-muted-foreground">Loading available courses...</p>
                  </div>
                ) : availableCoursesError ? (
                  <div className="text-center py-8">
                    <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
                    <p className="text-destructive font-medium mb-2">Failed to Load Available Courses</p>
                    <p className="text-sm text-muted-foreground">
                      {(availableCoursesError as any)?.status === 401 
                        ? "Please log in to view available courses" 
                        : "Please try refreshing the page"}
                    </p>
                  </div>
                ) : totalFilteredAvailable === 0 ? (
                  <div className="text-center py-8">
                    <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground">No available courses found</p>
                  </div>
                ) : (
                  <div className="space-y-8">
                    {/* Basket 1: Program Courses */}
                    <div>
                      <h3 className="text-lg font-semibold mb-3">Program Courses</h3>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Course Code</TableHead>
                            <TableHead>Course Name</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Credits</TableHead>
                            <TableHead>Hours</TableHead>
                            <TableHead>Action</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredProgramCourses.map((course) => (
                            <TableRow key={`program-${course.id}`} data-testid={`available-course-${course.id}`}>
                              <TableCell className="font-medium">{course.courseCode}</TableCell>
                              <TableCell>
                                <div>
                                  <p className="font-medium">{course.courseName}</p>
                                  {course.description && (
                                    <p className="text-sm text-muted-foreground line-clamp-2">
                                      {course.description}
                                    </p>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline">{course.courseType}</Badge>
                              </TableCell>
                              <TableCell>{course.credits}</TableCell>
                              <TableCell>
                                <div className="text-sm">
                                  <div>Theory: {course.theoryHours}h</div>
                                  <div>Practical: {course.practicalHours}h</div>
                                </div>
                              </TableCell>
                              <TableCell>
                                <Button
                                  size="sm"
                                  onClick={() => handleRegisterCourse(course.id)}
                                  disabled={registerCourseMutation.isPending}
                                  data-testid={`button-register-${course.id}`}
                                >
                                  <Plus className="w-4 h-4 mr-1" />
                                  Register
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                      {filteredProgramCourses.length === 0 && (
                        <p className="text-sm text-muted-foreground mt-2">No program courses match the search.</p>
                      )}
                    </div>

                    {/* Basket 2: Other Courses in Same Semester */}
                    <div>
                      <h3 className="text-lg font-semibold mb-3">Other Courses in Semester</h3>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Course Code</TableHead>
                            <TableHead>Course Name</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Credits</TableHead>
                            <TableHead>Hours</TableHead>
                            <TableHead>Action</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredOtherSemesterCourses.map((course) => (
                            <TableRow key={`other-${course.id}`} data-testid={`available-course-${course.id}`}>
                              <TableCell className="font-medium">{course.courseCode}</TableCell>
                              <TableCell>
                                <div>
                                  <p className="font-medium">{course.courseName}</p>
                                  {course.description && (
                                    <p className="text-sm text-muted-foreground line-clamp-2">
                                      {course.description}
                                    </p>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline">{course.courseType}</Badge>
                              </TableCell>
                              <TableCell>{course.credits}</TableCell>
                              <TableCell>
                                <div className="text-sm">
                                  <div>Theory: {course.theoryHours}h</div>
                                  <div>Practical: {course.practicalHours}h</div>
                                </div>
                              </TableCell>
                              <TableCell>
                                <Button
                                  size="sm"
                                  onClick={() => handleRegisterCourse(course.id)}
                                  disabled={registerCourseMutation.isPending}
                                  data-testid={`button-register-${course.id}`}
                                >
                                  <Plus className="w-4 h-4 mr-1" />
                                  Register
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                      {filteredOtherSemesterCourses.length === 0 && (
                        <p className="text-sm text-muted-foreground mt-2">No other-semester courses match the search.</p>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Registered Courses Tab */}
          <TabsContent value="registered">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BookOpen className="w-5 h-5" />
                  Registered Courses
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loadingRegistered ? (
                  <div className="text-center py-8">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                    <p className="mt-2 text-sm text-muted-foreground">Loading registered courses...</p>
                  </div>
                ) : registeredCoursesError ? (
                  <div className="text-center py-8">
                    <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
                    <p className="text-destructive font-medium mb-2">Failed to Load Registered Courses</p>
                    <p className="text-sm text-muted-foreground">
                      {(registeredCoursesError as any)?.status === 401 
                        ? "Please log in to view your registered courses" 
                        : "Please try refreshing the page"}
                    </p>
                  </div>
                ) : filteredRegisteredCourses.length === 0 ? (
                  <div className="text-center py-8">
                    <BookOpen className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground">No registered courses found</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Course Code</TableHead>
                        <TableHead>Course Name</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Credits</TableHead>
                        <TableHead>Hours</TableHead>
                        <TableHead>Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredRegisteredCourses.map((course) => (
                        <TableRow key={course.id} data-testid={`registered-course-${course.id}`}>
                          <TableCell className="font-medium">{course.courseCode}</TableCell>
                          <TableCell>
                            <div>
                              <p className="font-medium">{course.courseName}</p>
                              {course.description && (
                                <p className="text-sm text-muted-foreground line-clamp-2">
                                  {course.description}
                                </p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="default">{course.courseType}</Badge>
                          </TableCell>
                          <TableCell>{course.credits}</TableCell>
                          <TableCell>
                            <div className="text-sm">
                              <div>Theory: {course.theoryHours}h</div>
                              <div>Practical: {course.practicalHours}h</div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleUnregisterCourse(course.id)}
                              disabled={unregisterCourseMutation.isPending}
                              data-testid={`button-unregister-${course.id}`}
                            >
                              <Trash2 className="w-4 h-4 mr-1" />
                              Drop
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Personal Timetable Tab */}
          <TabsContent value="timetable">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="w-5 h-5" />
                  My Timetable
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loadingTimetable ? (
                  <div className="text-center py-8">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                    <p className="mt-2 text-sm text-muted-foreground">Loading timetable...</p>
                  </div>
                ) : timetableError ? (
                  <div className="text-center py-8">
                    <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
                    <p className="text-destructive font-medium mb-2">Failed to Load Timetable</p>
                    <p className="text-sm text-muted-foreground">Please try refreshing the page</p>
                  </div>
                ) : personalTimetable && personalTimetable.enrolledCourses.length > 0 ? (
                  <div className="space-y-6">
                    {Array.isArray(personalTimetable.conflicts) && personalTimetable.conflicts.length > 0 && (
                      <div className="space-y-2">
                        {personalTimetable.conflicts.map((c, idx) => (
                          <div key={idx} className="p-3 border rounded flex items-start gap-2 bg-amber-50">
                            <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5" />
                            <div>
                              <div className="text-sm font-medium">{c.type}</div>
                              <div className="text-sm text-muted-foreground">{c.description}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Day</TableHead>
                            <TableHead>Time</TableHead>
                            <TableHead>Course</TableHead>
                            <TableHead>Room</TableHead>
                            <TableHead>Faculty</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {personalTimetable.enrolledCourses
                            .flatMap((course) => (
                              course.schedule.map((slot) => ({
                                day: slot.day,
                                time: `${slot.startTime}-${slot.endTime}`,
                                courseCode: course.courseCode,
                                courseName: course.courseName,
                                room: slot.room,
                                faculty: course.faculty,
                                sortKey: `${slot.day}-${slot.startTime}-${course.courseCode}`
                              }))
                            ))
                            .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
                            .map((row, idx) => (
                              <TableRow key={idx}>
                                <TableCell className="font-medium">{row.day}</TableCell>
                                <TableCell>{row.time}</TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium">{row.courseCode}</span>
                                    <span className="text-sm text-muted-foreground">{row.courseName}</span>
                                  </div>
                                </TableCell>
                                <TableCell>{row.room || "TBA"}</TableCell>
                                <TableCell>{row.faculty || "TBA"}</TableCell>
                              </TableRow>
                            ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <Calendar className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-medium mb-2">No Timetable Yet</h3>
                    <p className="text-muted-foreground mb-4">
                      Register for courses to build your personal timetable automatically.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}