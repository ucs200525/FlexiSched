import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Search, Edit, Trash2, BookOpen, Clock, Star } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import type { Course, InsertCourse } from "@shared/schema";
import { courseTypes, programs } from "@/lib/types";
import { cn } from "@/lib/utils";
import CourseRegistration from "@/components/course-registration";
import FacultyCourseRegistration from "@/components/faculty-course-registration";

export default function Courses() {
  const { user } = useAuth();
  
  // If user is a student, show course registration interface
  if (user?.role === "student") {
    return <CourseRegistration />;
  }

  // If user is a faculty, show faculty course registration interface
  if (user?.role === "faculty") {
    return <FacultyCourseRegistration />;
  }

  // Otherwise, show the admin/faculty course management interface
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterProgram, setFilterProgram] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [formData, setFormData] = useState<InsertCourse>({
    courseCode: "",
    courseName: "",
    courseType: "Core",
    credits: 4,
    theoryHours: 3,
    practicalHours: 1,
    program: "B.Ed",
    semester: 1,
    prerequisites: [],
    description: "",
    isActive: true,
  });

  const { data: courses, isLoading } = useQuery<Course[]>({
    queryKey: ["/api/courses"],
  });

  const createCourseMutation = useMutation({
    mutationFn: async (data: InsertCourse) => {
      const response = await apiRequest("POST", "/api/courses", data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Course created successfully!",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/courses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      setIsDialogOpen(false);
      resetForm();
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create course",
        variant: "destructive",
      });
    },
  });

  const updateCourseMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Course> }) => {
      const response = await apiRequest("PUT", `/api/courses/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Course updated successfully!",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/courses"] });
      setIsDialogOpen(false);
      resetForm();
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update course",
        variant: "destructive",
      });
    },
  });

  const deleteCourseMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/courses/${id}`);
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Course deleted successfully!",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/courses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete course",
        variant: "destructive",
      });
    },
  });

  const filteredCourses = courses?.filter(course => {
    const matchesSearch = 
      course.courseName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      course.courseCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      course.courseType.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesProgram = filterProgram === "all" || course.program === filterProgram;
    const matchesType = filterType === "all" || course.courseType === filterType;
    
    return matchesSearch && matchesProgram && matchesType;
  }) || [];

  const resetForm = () => {
    setFormData({
      courseCode: "",
      courseName: "",
      courseType: "Core",
      credits: 4,
      theoryHours: 3,
      practicalHours: 1,
      program: "B.Ed",
      semester: 1,
      prerequisites: [],
      description: "",
      isActive: true,
    });
    setEditingCourse(null);
  };

  const openEditDialog = (course: Course) => {
    setEditingCourse(course);
    setFormData({
      courseCode: course.courseCode,
      courseName: course.courseName,
      courseType: course.courseType,
      credits: course.credits,
      theoryHours: course.theoryHours || 0,
      practicalHours: course.practicalHours || 0,
      program: course.program,
      semester: course.semester,
      prerequisites: Array.isArray(course.prerequisites) ? course.prerequisites : [],
      description: course.description || "",
      isActive: course.isActive,
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (editingCourse) {
      updateCourseMutation.mutate({ id: editingCourse.id, data: formData });
    } else {
      createCourseMutation.mutate(formData);
    }
  };

  const getCourseTypeColor = (courseType: string) => {
    const type = courseTypes.find(t => t.value === courseType);
    return type?.color || "primary";
  };

  const getCourseTypeIcon = (courseType: string) => {
    switch (courseType) {
      case "Major":
        return <Star className="w-4 h-4" />;
      case "Core":
        return <BookOpen className="w-4 h-4" />;
      case "Skill-Based":
        return <Clock className="w-4 h-4" />;
      default:
        return <BookOpen className="w-4 h-4" />;
    }
  };

  return (
    <div className="flex-1 flex flex-col">
      {/* Header */}
      <header className="bg-card border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground" data-testid="page-title">Courses</h1>
            <p className="text-sm text-muted-foreground">
              Manage course catalog with NEP 2020 structure and credit system
            </p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={resetForm} data-testid="button-add-course">
                <Plus className="w-4 h-4 mr-2" />
                Add Course
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl">
              <DialogHeader>
                <DialogTitle>
                  {editingCourse ? "Edit Course" : "Add New Course"}
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="courseCode">Course Code</Label>
                    <Input
                      id="courseCode"
                      value={formData.courseCode}
                      onChange={(e) => setFormData(prev => ({ ...prev, courseCode: e.target.value }))}
                      placeholder="e.g., EDU101"
                      required
                      data-testid="input-course-code"
                    />
                  </div>
                  <div>
                    <Label htmlFor="credits">Credits</Label>
                    <Input
                      id="credits"
                      type="number"
                      value={formData.credits}
                      onChange={(e) => setFormData(prev => ({ ...prev, credits: parseInt(e.target.value) || 0 }))}
                      min="1"
                      max="8"
                      required
                      data-testid="input-credits"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="courseName">Course Name</Label>
                  <Input
                    id="courseName"
                    value={formData.courseName}
                    onChange={(e) => setFormData(prev => ({ ...prev, courseName: e.target.value }))}
                    placeholder="e.g., Educational Psychology"
                    required
                    data-testid="input-course-name"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="courseType">Course Type</Label>
                    <Select
                      value={formData.courseType}
                      onValueChange={(value) => setFormData(prev => ({ ...prev, courseType: value }))}
                    >
                      <SelectTrigger data-testid="select-course-type">
                        <SelectValue placeholder="Select course type" />
                      </SelectTrigger>
                      <SelectContent>
                        {courseTypes.map(type => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="program">Program</Label>
                    <Select
                      value={formData.program}
                      onValueChange={(value) => setFormData(prev => ({ ...prev, program: value }))}
                    >
                      <SelectTrigger data-testid="select-program">
                        <SelectValue placeholder="Select program" />
                      </SelectTrigger>
                      <SelectContent>
                        {programs.map(program => (
                          <SelectItem key={program.value} value={program.value}>
                            {program.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="semester">Semester</Label>
                    <Select
                      value={formData.semester.toString()}
                      onValueChange={(value) => setFormData(prev => ({ ...prev, semester: parseInt(value) }))}
                    >
                      <SelectTrigger data-testid="select-semester">
                        <SelectValue placeholder="Select semester" />
                      </SelectTrigger>
                      <SelectContent>
                        {[1, 2, 3, 4, 5, 6, 7, 8].map(sem => (
                          <SelectItem key={sem} value={sem.toString()}>
                            Semester {sem}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="theoryHours">Theory Hours</Label>
                    <Input
                      id="theoryHours"
                      type="number"
                      value={formData.theoryHours}
                      onChange={(e) => setFormData(prev => ({ ...prev, theoryHours: parseInt(e.target.value) || 0 }))}
                      min="0"
                      max="10"
                      data-testid="input-theory-hours"
                    />
                  </div>
                  <div>
                    <Label htmlFor="practicalHours">Practical Hours</Label>
                    <Input
                      id="practicalHours"
                      type="number"
                      value={formData.practicalHours}
                      onChange={(e) => setFormData(prev => ({ ...prev, practicalHours: parseInt(e.target.value) || 0 }))}
                      min="0"
                      max="10"
                      data-testid="input-practical-hours"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={formData.description || ""}
                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Course description and learning objectives..."
                    data-testid="input-description"
                  />
                </div>

                <div className="flex justify-end space-x-2">
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button 
                    type="submit" 
                    disabled={createCourseMutation.isPending || updateCourseMutation.isPending}
                    data-testid="button-save-course"
                  >
                    {(createCourseMutation.isPending || updateCourseMutation.isPending) ? (
                      "Saving..."
                    ) : (
                      editingCourse ? "Update Course" : "Add Course"
                    )}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 p-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="w-5 h-5" />
                Course Catalog
              </CardTitle>
              <div className="flex items-center space-x-2">
                <Select value={filterProgram} onValueChange={setFilterProgram}>
                  <SelectTrigger className="w-32" data-testid="filter-program">
                    <SelectValue placeholder="Program" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Programs</SelectItem>
                    {programs.map(program => (
                      <SelectItem key={program.value} value={program.value}>
                        {program.value}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={filterType} onValueChange={setFilterType}>
                  <SelectTrigger className="w-40" data-testid="filter-type">
                    <SelectValue placeholder="Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    {courseTypes.map(type => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.value}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                  <Input
                    placeholder="Search courses..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 w-64"
                    data-testid="input-search-courses"
                  />
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="animate-pulse flex space-x-4">
                    <div className="rounded-full bg-muted h-10 w-10"></div>
                    <div className="flex-1 space-y-2 py-1">
                      <div className="h-4 bg-muted rounded w-3/4"></div>
                      <div className="h-4 bg-muted rounded w-1/2"></div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Course Code</TableHead>
                    <TableHead>Course Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Program</TableHead>
                    <TableHead>Semester</TableHead>
                    <TableHead>Credits</TableHead>
                    <TableHead>Hours</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCourses.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                        {searchTerm || filterProgram !== "all" || filterType !== "all" ? 
                          "No courses found matching your filters." : 
                          "No courses found. Add your first course to get started."
                        }
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredCourses.map((course) => {
                      const colorClass = getCourseTypeColor(course.courseType);
                      return (
                        <TableRow key={course.id} data-testid={`course-row-${course.id}`}>
                          <TableCell className="font-medium">{course.courseCode}</TableCell>
                          <TableCell>
                            <div>
                              <div className="font-medium">{course.courseName}</div>
                              {course.description && (
                                <div className="text-sm text-muted-foreground line-clamp-1">
                                  {course.description}
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge 
                              className={cn(
                                "flex items-center gap-1",
                                colorClass === "primary" && "bg-primary/10 text-primary border-primary/20",
                                colorClass === "secondary" && "bg-secondary/10 text-secondary border-secondary/20",
                                colorClass === "accent" && "bg-accent/10 text-accent border-accent/20",
                                colorClass === "chart-1" && "bg-chart-1/10 text-chart-1 border-chart-1/20",
                                colorClass === "chart-2" && "bg-chart-2/10 text-chart-2 border-chart-2/20",
                                colorClass === "chart-3" && "bg-chart-3/10 text-chart-3 border-chart-3/20",
                                colorClass === "chart-4" && "bg-chart-4/10 text-chart-4 border-chart-4/20"
                              )}
                              variant="outline"
                            >
                              {getCourseTypeIcon(course.courseType)}
                              {course.courseType}
                            </Badge>
                          </TableCell>
                          <TableCell>{course.program}</TableCell>
                          <TableCell>Sem {course.semester}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Star className="w-4 h-4 text-yellow-500" />
                              <span className="font-medium">{course.credits}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">
                              <div>Theory: {course.theoryHours || 0}h</div>
                              <div>Practical: {course.practicalHours || 0}h</div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={course.isActive ? "default" : "secondary"}>
                              {course.isActive ? "Active" : "Inactive"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center space-x-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openEditDialog(course)}
                                data-testid={`button-edit-course-${course.id}`}
                              >
                                <Edit className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => deleteCourseMutation.mutate(course.id)}
                                disabled={deleteCourseMutation.isPending}
                                data-testid={`button-delete-course-${course.id}`}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
