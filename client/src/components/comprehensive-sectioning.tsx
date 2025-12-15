import React, { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { 
  Calculator, 
  Users, 
  BookOpen, 
  FlaskConical, 
  Grid, 
  CheckCircle, 
  AlertTriangle,
  RefreshCw,
  Play
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const AI_SERVER_URL = 'http://localhost:8000';

interface Course {
  course_id: string;
  course_name: string;
  course_type: string;
  credits: number;
  max_theory_capacity: number;
  max_lab_capacity: number;
  estimated_demand_percentage: number;
}

interface SectionCalculation {
  course_id: string;
  course_name: string;
  course_type: string;
  estimated_students: number;
  theory_sections: number;
  lab_sections: number;
  total_sections: number;
  theory_capacity_per_section: number;
  lab_capacity_per_section: number;
}

interface StudentAllocation {
  student_id: string;
  allocated_sections: Record<string, string>;
  total_credits: number;
  conflicts: any[];
}

interface SectioningResult {
  total_sections_created: number;
  success_rate: number;
  student_allocations: StudentAllocation[];
  conflicts: any[];
  sections: any[];
}

interface TimetableGrid {
  working_days: string[];
  time_slots: string[];
  slot_duration: number;
  breaks: any[];
}

export default function ComprehensiveSectioning() {
  const { toast } = useToast();
  const [totalStudents, setTotalStudents] = useState(200);
  const [courses, setCourses] = useState<Course[]>([]);
  const [sectionCalculations, setSectionCalculations] = useState<SectionCalculation[]>([]);
  const [sectioningResult, setSectioningResult] = useState<SectioningResult | null>(null);
  const [timetableGrid, setTimetableGrid] = useState<TimetableGrid | null>(null);

  // Fetch sample courses
  const { data: sampleCoursesData, isLoading: loadingSample } = useQuery({
    queryKey: ['sample-semester-courses'],
    queryFn: async () => {
      const response = await fetch(`${AI_SERVER_URL}/sample/semester-courses`);
      if (!response.ok) throw new Error('Failed to fetch sample courses');
      return response.json();
    }
  });

  // Update courses when sample data is loaded
  React.useEffect(() => {
    if (sampleCoursesData?.courses) {
      setCourses(sampleCoursesData.courses);
    }
  }, [sampleCoursesData]);

  // Generate base timetable
  const generateTimetableMutation = useMutation({
    mutationFn: async () => {
      const config = {
        college_start_time: "08:30",
        college_end_time: "17:30",
        slot_length: "50",
        grace_time: 10,
        breaks: [
          { type: "morning", start_time: "10:30", end_time: "10:45", duration: 15, is_active: true },
          { type: "lunch", start_time: "13:00", end_time: "14:00", duration: 60, is_active: true }
        ],
        working_days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
      };

      const response = await fetch(`${AI_SERVER_URL}/config/base-timetable`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      if (!response.ok) throw new Error('Failed to generate base timetable');
      return response.json();
    },
    onSuccess: (data) => {
      setTimetableGrid(data);
      toast({ title: 'Success', description: 'Base timetable generated successfully' });
    }
  });

  // Calculate sections
  const calculateSectionsMutation = useMutation({
    mutationFn: async () => {
      if (!timetableGrid) throw new Error('Generate base timetable first');
      
      const response = await fetch(`${AI_SERVER_URL}/sectioning/calculate-sections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courses, total_students: totalStudents, timetable_grid: timetableGrid })
      });
      if (!response.ok) throw new Error('Failed to calculate sections');
      return response.json();
    },
    onSuccess: (data) => {
      setSectionCalculations(data.section_calculations);
      toast({ title: 'Success', description: `Calculated ${data.total_sections_needed} total sections needed` });
    }
  });

  // Comprehensive sectioning
  const comprehensiveSectioningMutation = useMutation({
    mutationFn: async () => {
      if (!timetableGrid) throw new Error('Generate base timetable first');
      
      const studentIds = Array.from({ length: totalStudents }, (_, i) => `STU${String(i + 1).padStart(3, '0')}`);
      
      const response = await fetch(`${AI_SERVER_URL}/sectioning/comprehensive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courses, total_students: totalStudents, student_ids: studentIds, timetable_grid: timetableGrid })
      });
      if (!response.ok) throw new Error('Failed to perform comprehensive sectioning');
      return response.json();
    },
    onSuccess: (data) => {
      setSectioningResult(data);
      toast({ title: 'Success', description: `Comprehensive sectioning completed with ${(data.success_rate * 100).toFixed(1)}% success rate` });
    }
  });

  const getCourseTypeColor = (type: string) => {
    switch (type) {
      case 'core': return 'bg-blue-100 text-blue-800';
      case 'elective': return 'bg-green-100 text-green-800';
      case 'lab': return 'bg-purple-100 text-purple-800';
      case 'clinic': return 'bg-orange-100 text-orange-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="flex-1 flex flex-col">
      <header className="bg-card border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Comprehensive Course Sectioning</h1>
            <p className="text-sm text-muted-foreground">
              Automatic sectioning for all course types based on student strength and capacity
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-muted-foreground" />
            <span className="text-sm font-medium">{totalStudents} Students</span>
          </div>
        </div>
      </header>

      <main className="flex-1 p-6 overflow-auto">
        <Tabs defaultValue="setup" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="setup"><Calculator className="w-4 h-4 mr-2" />Setup</TabsTrigger>
            <TabsTrigger value="calculations"><Grid className="w-4 h-4 mr-2" />Calculations</TabsTrigger>
            <TabsTrigger value="sections"><BookOpen className="w-4 h-4 mr-2" />Sections</TabsTrigger>
            <TabsTrigger value="results"><CheckCircle className="w-4 h-4 mr-2" />Results</TabsTrigger>
          </TabsList>

          <TabsContent value="setup">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="w-5 h-5" />Student Configuration
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="total-students">Total Students in Semester</Label>
                    <Input
                      id="total-students"
                      type="number"
                      min="50"
                      max="1000"
                      value={totalStudents}
                      onChange={(e) => setTotalStudents(parseInt(e.target.value) || 200)}
                    />
                  </div>
                  <Button
                    onClick={() => generateTimetableMutation.mutate()}
                    disabled={generateTimetableMutation.isPending}
                    className="w-full"
                  >
                    {generateTimetableMutation.isPending ? (
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Grid className="w-4 h-4 mr-2" />
                    )}
                    Generate Base Timetable
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>Course Overview</CardTitle></CardHeader>
                <CardContent>
                  {loadingSample ? (
                    <div className="text-center py-4">
                      <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">Loading courses...</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="text-center p-3 border rounded-lg">
                        <div className="text-2xl font-bold text-blue-600">{sampleCoursesData?.core_courses || 0}</div>
                        <div className="text-xs text-muted-foreground">Core Courses</div>
                      </div>
                      <div className="text-center p-3 border rounded-lg">
                        <div className="text-2xl font-bold text-green-600">{sampleCoursesData?.elective_courses || 0}</div>
                        <div className="text-xs text-muted-foreground">Electives</div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="calculations">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  Section Calculations
                  <Button
                    onClick={() => calculateSectionsMutation.mutate()}
                    disabled={!timetableGrid || calculateSectionsMutation.isPending}
                  >
                    {calculateSectionsMutation.isPending ? (
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Calculator className="w-4 h-4 mr-2" />
                    )}
                    Calculate Sections
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {sectionCalculations.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Course</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Est. Students</TableHead>
                        <TableHead>Theory Sections</TableHead>
                        <TableHead>Lab Sections</TableHead>
                        <TableHead>Total Sections</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sectionCalculations.map(calc => (
                        <TableRow key={calc.course_id}>
                          <TableCell>
                            <div>
                              <div className="font-medium">{calc.course_name}</div>
                              <div className="text-xs text-muted-foreground">{calc.course_id}</div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge className={getCourseTypeColor(calc.course_type)}>
                              {calc.course_type}
                            </Badge>
                          </TableCell>
                          <TableCell>{calc.estimated_students}</TableCell>
                          <TableCell>
                            {calc.theory_sections > 0 ? (
                              <div className="flex items-center gap-1">
                                <BookOpen className="w-3 h-3" />
                                {calc.theory_sections}
                              </div>
                            ) : '-'}
                          </TableCell>
                          <TableCell>
                            {calc.lab_sections > 0 ? (
                              <div className="flex items-center gap-1">
                                <FlaskConical className="w-3 h-3" />
                                {calc.lab_sections}
                              </div>
                            ) : '-'}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{calc.total_sections}</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-8">
                    <Calculator className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground">Calculate sections to view breakdown</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="sections">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  Generated Sections
                  <Button
                    onClick={() => comprehensiveSectioningMutation.mutate()}
                    disabled={!timetableGrid || comprehensiveSectioningMutation.isPending}
                  >
                    {comprehensiveSectioningMutation.isPending ? (
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Play className="w-4 h-4 mr-2" />
                    )}
                    Generate All Sections
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {sectioningResult ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      <div className="text-center p-4 border rounded-lg">
                        <div className="text-2xl font-bold text-primary">{sectioningResult.total_sections_created}</div>
                        <div className="text-sm text-muted-foreground">Total Sections</div>
                      </div>
                      <div className="text-center p-4 border rounded-lg">
                        <div className="text-2xl font-bold text-green-600">
                          {(sectioningResult.success_rate * 100).toFixed(1)}%
                        </div>
                        <div className="text-sm text-muted-foreground">Success Rate</div>
                      </div>
                      <div className="text-center p-4 border rounded-lg">
                        <div className="text-2xl font-bold text-purple-600">
                          {sectioningResult.student_allocations.length}
                        </div>
                        <div className="text-sm text-muted-foreground">Students Allocated</div>
                      </div>
                      <div className="text-center p-4 border rounded-lg">
                        <div className="text-2xl font-bold text-red-600">{sectioningResult.conflicts.length}</div>
                        <div className="text-sm text-muted-foreground">Conflicts</div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Grid className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground">Generate comprehensive sectioning to view sections</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="results">
            {sectioningResult ? (
              <Card>
                <CardHeader><CardTitle>Sectioning Results</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="w-5 h-5 text-green-600" />
                        <span className="font-medium text-green-800">
                          Sectioning completed with {(sectioningResult.success_rate * 100).toFixed(1)}% success rate
                        </span>
                      </div>
                    </div>
                    
                    {sectioningResult.conflicts.length > 0 && (
                      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                        <div className="flex items-center gap-2 mb-2">
                          <AlertTriangle className="w-5 h-5 text-red-600" />
                          <span className="font-medium text-red-800">Conflicts Found</span>
                        </div>
                        <div className="text-sm text-red-600">
                          {sectioningResult.conflicts.length} conflicts need resolution
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="text-center py-12">
                  <CheckCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">Complete sectioning process to view results</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
