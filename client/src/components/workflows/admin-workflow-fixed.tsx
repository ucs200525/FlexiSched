import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Settings, 
  Clock, 
  BookOpen, 
  Users, 
  Building, 
  CheckCircle, 
  ArrowRight,
  Timer,
  MapPin,
  Download,
  Upload,
  Sparkles,
  FileText
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

// Type Definitions
export interface BaseSetupData {
  workingDays: string[];
  startTime: string;
  endTime: string;
  slotDuration: number;
  graceTime: number;
  lunchBreak: {
    startTime: string;
    endTime: string;
  };
}

export interface CourseData {
  id: string;
  courseCode: string;
  courseName: string;
  credits: number;
  type: "theory" | "lab" | "both";
  category: "core" | "elective" | "skill" | "project";
  expectedStrength: number;
}

export interface FacultyData {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  department: string;
  specialization: string[];
  maxWorkload: number;
  availability: {
    [day: string]: string[];
  };
}

export interface RoomData {
  id: string;
  roomNumber: string;
  roomName: string;
  roomType: string;
  capacity: number;
  equipment: string[];
  location?: string;
}

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  sampleFormat: string;
  sampleData: string;
  onImport: (data: any[]) => void;
  isLoading: boolean;
}

const ImportDialog = ({
  open,
  onOpenChange,
  title,
  description,
  sampleFormat,
  sampleData,
  onImport,
  isLoading
}: ImportDialogProps) => {
  const [data, setData] = useState("");
  const [error, setError] = useState("");

  const handleImport = () => {
    try {
      const parsedData = JSON.parse(data);
      onImport(Array.isArray(parsedData) ? parsedData : [parsedData]);
      onOpenChange(false);
      setData("");
    } catch (err) {
      setError("Invalid JSON format");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">{description}</p>
          
          <div>
            <Label htmlFor="import-data">Paste your data (JSON format)</Label>
            <Textarea
              id="import-data"
              value={data}
              onChange={(e) => setData(e.target.value)}
              placeholder={sampleFormat}
              className="min-h-[200px] font-mono text-sm"
            />
            {error && <p className="text-sm text-red-500 mt-1">{error}</p>}
          </div>

          <div>
            <Label>Sample Format:</Label>
            <pre className="bg-muted p-2 rounded-md text-sm overflow-x-auto">
              {sampleData}
            </pre>
          </div>
        </div>
        
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleImport} disabled={isLoading || !data.trim()}>
            {isLoading ? "Importing..." : "Import"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default function AdminWorkflow() {
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState(1);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [strengthError, setStrengthError] = useState('');
  const [newCourse, setNewCourse] = useState<Partial<CourseData>>({ 
    type: 'theory',
    category: 'core',
    expectedStrength: 0
  });

  // Base Setup State
  const [baseSetup, setBaseSetup] = useState<BaseSetupData>({
    workingDays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
    startTime: "08:30",
    endTime: "17:30",
    slotDuration: 50,
    graceTime: 10,
    lunchBreak: {
      startTime: "12:50",
      endTime: "13:50"
    }
  });

  // State for courses, faculty, and rooms
  const [courses, setCourses] = useState<CourseData[]>([]);
  const [showRoomImport, setShowRoomImport] = useState(false);
  const [showFacultyImport, setShowFacultyImport] = useState(false);
  const [showCourseImport, setShowCourseImport] = useState(false);

  // Fetch data from API with proper types
  const { data: existingCourses } = useQuery<CourseData[]>({
    queryKey: ["/api/courses"],
  });

  const { data: faculty } = useQuery<FacultyData[]>({
    queryKey: ["/api/faculty"],
  });

  const { data: rooms } = useQuery<RoomData[]>({
    queryKey: ["/api/rooms"],
  });

  // Update courses when existingCourses changes
  useEffect(() => {
    if (existingCourses) {
      setCourses(existingCourses);
    }
  }, [existingCourses]);

  // Mutation for generating timetable
  const generateTimetableMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/ai/optimize-timetable", data);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return response.json();
    },
    onSuccess: (data) => {
      setProgress(100);
      setIsGenerating(false);
      toast({
        title: "Timetable Generated Successfully",
        description: `AI has created an optimized timetable with score: ${data.optimization_result?.optimization_score || 'N/A'}`,
      });
    },
    onError: (error: Error) => {
      setProgress(0);
      setIsGenerating(false);
      toast({
        title: "Generation Failed",
        description: `Failed to generate timetable: ${error.message || 'Unknown error'}`,
        variant: "destructive",
      });
    },
  });

  // Mutation for importing courses
  const importCoursesMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/courses/import", data);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Courses imported successfully",
        description: "The courses have been imported successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Import failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Mutation for importing faculty
  const importFacultyMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/faculty/import", data);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Faculty imported successfully",
        description: "The faculty members have been imported successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Import failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Mutation for importing rooms
  const importRoomsMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/rooms/import", data);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Rooms imported successfully",
        description: "The rooms have been imported successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Import failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Handle export functionality
  const handleExport = (format: 'pdf' | 'excel') => {
    toast({
      title: `Exporting as ${format.toUpperCase()}`,
      description: `Your data will be exported in ${format.toUpperCase()} format.`,
    });
    // Add export logic here
  };

  // Add a new course
  const addCourse = () => {
    if (!newCourse.courseCode || !newCourse.courseName || !newCourse.expectedStrength) {
      setStrengthError('Please fill in all required fields');
      return;
    }
    
    const course: CourseData = {
      id: `course-${Date.now()}`,
      courseCode: newCourse.courseCode || '',
      courseName: newCourse.courseName || '',
      credits: newCourse.credits || 3,
      type: newCourse.type || 'theory',
      category: newCourse.category || 'core',
      expectedStrength: newCourse.expectedStrength || 0,
    };

    setCourses([...courses, course]);
    setNewCourse({ type: 'theory', category: 'core', expectedStrength: 0 });
    setStrengthError('');
  };

  // Generate slot mappings
  const generateSlotMappingMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/admin/generate-slot-mappings", data);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return response.json();
    },
    onSuccess: (data) => {
      setProgress(100);
      setIsGenerating(false);
      toast({
        title: "Slot Mappings Generated Successfully",
        description: `Generated ${data.mappedSlots} slot mappings out of ${data.totalSlots} time slots`,
      });
    },
    onError: (error: Error) => {
      setProgress(0);
      setIsGenerating(false);
      toast({
        title: "Generation Failed",
        description: `Failed to generate slot mappings: ${error.message || 'Unknown error'}`,
        variant: "destructive",
      });
    },
  });

  // Handle slot mapping generation
  const handleSlotMappingGeneration = async () => {
    if (!courses.length || !faculty?.length || !rooms?.length) {
      toast({
        title: "Incomplete Setup",
        description: "Please ensure you have added courses, faculty, and rooms before generating.",
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);
    setProgress(0);

    // Progress tracking
    const progressInterval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 90) return prev;
        return prev + Math.random() * 10;
      });
    }, 500);

    const requestData = {
      program: "Computer Science",
      semester: 1,
      batch: "2024",
      academicYear: "2024-25",
      baseConfig: {
        workingDays: baseSetup.workingDays,
        startTime: baseSetup.startTime,
        endTime: baseSetup.endTime,
        slotDuration: baseSetup.slotDuration,
        lunchBreak: baseSetup.lunchBreak
      }
    };

    try {
      clearInterval(progressInterval);
      setProgress(90);
      await generateSlotMappingMutation.mutateAsync(requestData);
    } catch (error) {
      clearInterval(progressInterval);
      // Error handled in mutation
    }
  };

  // Handle final timetable generation
  const handleFinalGeneration = async () => {
    if (!courses.length || !faculty?.length || !rooms?.length) {
      toast({
        title: "Incomplete Setup",
        description: "Please ensure you have added courses, faculty, and rooms before generating.",
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);
    setProgress(0);

    // Progress tracking
    const progressInterval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 90) return prev;
        return prev + Math.random() * 5;
      });
    }, 500);

    const requestData = {
      courses,
      faculty,
      rooms,
      config: baseSetup,
      constraints: {
        maxHoursPerDay: 8,
        minGapBetweenClasses: 1,
        preferMorningSlots: true,
      },
    };

    try {
      clearInterval(progressInterval);
      setProgress(90);
      await generateTimetableMutation.mutateAsync(requestData);
    } catch (error) {
      clearInterval(progressInterval);
      // Error handled in mutation
    }
  };

  const stepTitles = [
    "Base Configuration",
    "Generate Slot-Time Mappings",
    "Classroom Allocation"
  ];

  return (
    <div className="space-y-6">
      {/* Progress Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Admin Workflow - Complete Timetable Setup
          </CardTitle>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              {stepTitles.map((title, index) => (
                <div key={index} className="flex items-center">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                    index + 1 === currentStep 
                      ? "bg-primary text-primary-foreground" 
                      : index + 1 < currentStep 
                        ? "bg-green-500 text-white" 
                        : "bg-muted text-muted-foreground"
                  }`}>
                    {index + 1 < currentStep ? <CheckCircle className="w-4 h-4" /> : index + 1}
                  </div>
                  <span className="ml-2 text-sm font-medium">{title}</span>
                  {index < stepTitles.length - 1 && (
                    <ArrowRight className="w-4 h-4 mx-2 text-muted-foreground" />
                  )}
                </div>
              ))}
            </div>
          </div>
        </CardHeader>
      </Card>

      <Tabs value={currentStep.toString()} className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          {stepTitles.map((title, index) => (
            <TabsTrigger 
              key={index} 
              value={(index + 1).toString()}
              onClick={() => setCurrentStep(index + 1)}
              disabled={index + 1 > currentStep && currentStep < 3}
            >
              {title}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Step 1: Base Configuration */}
        <TabsContent value="1">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="w-5 h-5" />
                Base Configuration Setup
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Configure basic timetable settings. System has existing courses, faculty, and rooms ready for timetable generation.
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Working Days */}
              <div>
                <Label className="text-base font-medium">Working Days</Label>
                <div className="grid grid-cols-3 gap-2 mt-2">
                  {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map(day => (
                    <div key={day} className="flex items-center space-x-2">
                      <Checkbox
                        checked={baseSetup.workingDays.includes(day)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setBaseSetup(prev => ({
                              ...prev,
                              workingDays: [...prev.workingDays, day]
                            }));
                          } else {
                            setBaseSetup(prev => ({
                              ...prev,
                              workingDays: prev.workingDays.filter(d => d !== day)
                            }));
                          }
                        }}
                      />
                      <Label className="text-sm">{day}</Label>
                    </div>
                  ))}
                </div>
              </div>

              {/* College Timings */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="startTime">College Start Time</Label>
                  <Input
                    id="startTime"
                    type="time"
                    value={baseSetup.startTime}
                    onChange={(e) => setBaseSetup(prev => ({ ...prev, startTime: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="endTime">College End Time</Label>
                  <Input
                    id="endTime"
                    type="time"
                    value={baseSetup.endTime}
                    onChange={(e) => setBaseSetup(prev => ({ ...prev, endTime: e.target.value }))}
                  />
                </div>
              </div>

              {/* Slot Configuration */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="slotDuration">Slot Duration (minutes)</Label>
                  <Select 
                    value={baseSetup.slotDuration.toString()} 
                    onValueChange={(value) => setBaseSetup(prev => ({ ...prev, slotDuration: parseInt(value) }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="45">45 minutes</SelectItem>
                      <SelectItem value="50">50 minutes</SelectItem>
                      <SelectItem value="55">55 minutes</SelectItem>
                      <SelectItem value="60">60 minutes</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="graceTime">Grace Time (minutes)</Label>
                  <Input
                    id="graceTime"
                    type="number"
                    min="5"
                    max="15"
                    value={baseSetup.graceTime}
                    onChange={(e) => setBaseSetup(prev => ({ ...prev, graceTime: parseInt(e.target.value) }))}
                  />
                </div>
              </div>

              {/* Lunch Break */}
              <div>
                <Label className="text-base font-medium">Lunch Break</Label>
                <div className="grid grid-cols-2 gap-4 mt-2">
                  <div>
                    <Label htmlFor="lunchStart">Start Time</Label>
                    <Input
                      id="lunchStart"
                      type="time"
                      value={baseSetup.lunchBreak.startTime}
                      onChange={(e) => setBaseSetup(prev => ({
                        ...prev,
                        lunchBreak: { ...prev.lunchBreak, startTime: e.target.value }
                      }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="lunchEnd">End Time</Label>
                    <Input
                      id="lunchEnd"
                      type="time"
                      value={baseSetup.lunchBreak.endTime}
                      onChange={(e) => setBaseSetup(prev => ({
                        ...prev,
                        lunchBreak: { ...prev.lunchBreak, endTime: e.target.value }
                      }))}
                    />
                  </div>
                </div>
              </div>

              <Button 
                onClick={() => setCurrentStep(2)} 
                className="w-full"
              >
                Next: Generate Slot-Time Mappings
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Step 2: Generate Slot-Time Mappings */}
        <TabsContent value="2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="w-5 h-5" />
                Generate Slot-Time Mappings
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Auto-generate a slot-time timetable based on availability and constraints
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Configuration Summary */}
              <Card className="bg-muted/50">
                <CardHeader>
                  <CardTitle className="text-base">Current Configuration</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex justify-between">
                    <span>Working Days:</span>
                    <span>{baseSetup.workingDays.join(", ")}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>College Hours:</span>
                    <span>{baseSetup.startTime} - {baseSetup.endTime}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Slot Duration:</span>
                    <span>{baseSetup.slotDuration} minutes</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Lunch Break:</span>
                    <span>{baseSetup.lunchBreak.startTime} - {baseSetup.lunchBreak.endTime}</span>
                  </div>
                </CardContent>
              </Card>

              {/* Data Summary */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-4 bg-primary/10 rounded-lg">
                  <div className="text-2xl font-bold text-primary">{existingCourses?.length || 0}</div>
                  <div className="text-sm text-muted-foreground">Courses</div>
                </div>
                <div className="text-center p-4 bg-secondary/10 rounded-lg">
                  <div className="text-2xl font-bold text-secondary">{faculty?.length || 0}</div>
                  <div className="text-sm text-muted-foreground">Faculty</div>
                </div>
                <div className="text-center p-4 bg-accent/10 rounded-lg">
                  <div className="text-2xl font-bold text-accent">{rooms?.length || 0}</div>
                  <div className="text-sm text-muted-foreground">Rooms</div>
                </div>
                <div className="text-center p-4 bg-green-100 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">
                    {Math.floor(((parseInt(baseSetup.endTime.split(':')[0]) - parseInt(baseSetup.startTime.split(':')[0])) * 60) / baseSetup.slotDuration)}
                  </div>
                  <div className="text-sm text-muted-foreground">Daily Slots</div>
                </div>
              </div>

              {/* Generation Options */}
              <div className="space-y-4">
                <Label className="text-base font-medium">Generation Settings</Label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="program">Program</Label>
                    <Select defaultValue="Computer Science">
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Computer Science">Computer Science</SelectItem>
                        <SelectItem value="Information Technology">Information Technology</SelectItem>
                        <SelectItem value="Electronics">Electronics</SelectItem>
                        <SelectItem value="Mechanical">Mechanical</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="semester">Semester</Label>
                    <Select defaultValue="1">
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[1,2,3,4,5,6,7,8].map(sem => (
                          <SelectItem key={sem} value={sem.toString()}>Semester {sem}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Generate Button */}
              <Button 
                onClick={handleSlotMappingGeneration}
                disabled={isGenerating || !existingCourses?.length || !faculty?.length || !rooms?.length}
                className="w-full py-6 bg-gradient-to-r from-blue-500 to-blue-600 text-white"
              >
                {isGenerating ? (
                  <>
                    <Timer className="w-5 h-5 mr-2 animate-spin" />
                    Generating Slot Mappings...
                  </>
                ) : (
                  <>
                    <Clock className="w-5 h-5 mr-2" />
                    Generate Slot-Time Mappings
                  </>
                )}
              </Button>

              {/* Progress */}
              {isGenerating && (
                <Card className="bg-primary/5 border-primary/20">
                  <CardContent className="p-4">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Generating slot-time mappings...</span>
                        <span className="text-sm text-muted-foreground">{progress}%</span>
                      </div>
                      <Progress value={progress} className="h-2" />
                      <div className="text-xs text-muted-foreground">
                        Analyzing constraints → Generating slots → Optimizing schedule → Finalizing timetable
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setCurrentStep(1)} className="flex-1">
                  Previous
                </Button>
                <Button 
                  onClick={() => setCurrentStep(3)} 
                  className="flex-1"
                  disabled={isGenerating}
                >
                  Next: Classroom Allocation
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Step 3: Classroom Allocation */}
        <TabsContent value="3">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building className="w-5 h-5" />
                Classroom Allocation
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Allocate rooms to each class session and generate unique Class IDs
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Timetable Selection */}
              <div className="space-y-4">
                <Label className="text-base font-medium">Select Timetable for Room Allocation</Label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a generated timetable" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="timetable-1">Computer Science Sem 1 - Auto Generated</SelectItem>
                    <SelectItem value="timetable-2">Information Technology Sem 2 - AI Generated</SelectItem>
                    <SelectItem value="timetable-3">Electronics Sem 3 - Manual</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Room Inventory Summary */}
              <div className="space-y-4">
                <Label className="text-base font-medium">Available Room Inventory</Label>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <Card className="border-l-4 border-l-blue-500">
                    <CardContent className="p-4 text-center">
                      <div className="text-2xl font-bold text-blue-600">
                        {rooms?.filter((room) => 
                          room.roomType?.toLowerCase().includes('lecture') || 
                          room.roomType?.toLowerCase().includes('classroom') || 
                          room.roomType?.toLowerCase().includes('seminar')
                        ).length || 0}
                      </div>
                      <div className="text-sm text-muted-foreground">Classrooms</div>
                    </CardContent>
                  </Card>
                  <Card className="border-l-4 border-l-green-500">
                    <CardContent className="p-4 text-center">
                      <div className="text-2xl font-bold text-green-600">
                        {rooms?.filter((room) => 
                          room.roomType?.toLowerCase().includes('lab') || 
                          room.roomType?.toLowerCase().includes('laboratory')
                        ).length || 0}
                      </div>
                      <div className="text-sm text-muted-foreground">Labs</div>
                    </CardContent>
                  </Card>
                  <Card className="border-l-4 border-l-purple-500">
                    <CardContent className="p-4 text-center">
                      <div className="text-2xl font-bold text-purple-600">
                        {rooms?.filter((room => 
                          room.roomType?.toLowerCase().includes('auditorium')
                        )).length || 0}
                      </div>
                      <div className="text-sm text-muted-foreground">Auditoriums</div>
                    </CardContent>
                  </Card>
                  <Card className="border-l-4 border-l-orange-500">
                    <CardContent className="p-4 text-center">
                      <div className="text-2xl font-bold text-orange-600">
                        {rooms?.reduce((sum, room) => sum + (room.capacity || 0), 0) || 0}
                      </div>
                      <div className="text-sm text-muted-foreground">Total Capacity</div>
                    </CardContent>
                  </Card>
                </div>
              </div>

              {/* Allocation Rules */}
              <div className="space-y-4">
                <Label className="text-base font-medium">Allocation Rules & Preferences</Label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card>
                    <CardContent className="p-4">
                      <div className="space-y-3">
                        <div className="flex items-center space-x-2">
                          <Checkbox defaultChecked />
                          <Label className="text-sm">Prioritize ground floor for large classes</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox defaultChecked />
                          <Label className="text-sm">Keep lab sessions in dedicated lab rooms</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox defaultChecked />
                          <Label className="text-sm">Maintain 10% buffer capacity</Label>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardContent className="p-4">
                      <div className="space-y-3">
                        <div className="flex items-center space-x-2">
                          <Checkbox defaultChecked />
                          <Label className="text-sm">Ensure AC rooms for summer sessions</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox />
                          <Label className="text-sm">Prefer projector-equipped rooms</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox />
                          <Label className="text-sm">Allow room sharing for small classes</Label>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>

              {/* Class ID Generation Info */}
              <Card className="bg-muted/50">
                <CardHeader>
                  <CardTitle className="text-base">Unique Class ID Generation</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Each class will be assigned a unique Class ID that encapsulates:
                  </p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                    <div className="text-center p-3 bg-primary/10 rounded-lg">
                      <MapPin className="w-6 h-6 mx-auto mb-2 text-primary" />
                      <div className="text-sm font-medium">Room</div>
                    </div>
                    <div className="text-center p-3 bg-secondary/10 rounded-lg">
                      <Users className="w-6 h-6 mx-auto mb-2 text-secondary" />
                      <div className="text-sm font-medium">Faculty</div>
                    </div>
                    <div className="text-center p-3 bg-accent/10 rounded-lg">
                      <Clock className="w-6 h-6 mx-auto mb-2 text-accent" />
                      <div className="text-sm font-medium">Slot & Time</div>
                    </div>
                    <div className="text-center p-3 bg-green-100 rounded-lg">
                      <BookOpen className="w-6 h-6 mx-auto mb-2 text-green-600" />
                      <div className="text-sm font-medium">Enrolled Students</div>
                    </div>
                  </div>
                  <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                    <div className="text-sm font-medium text-blue-800">Example Class ID Format:</div>
                    <div className="text-xs text-blue-600 font-mono mt-1">
                      CLS-CS101-MON-0900-{new Date().getTime().toString(36).slice(-4)}-{Math.random().toString(36).substring(2, 5)}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Allocate Button */}
              <Button 
                className="w-full py-6 bg-gradient-to-r from-green-500 to-green-600 text-white"
                disabled={isGenerating}
                onClick={handleFinalGeneration}
              >
                {isGenerating ? (
                  <>
                    <Timer className="w-5 h-5 mr-2 animate-spin" />
                    Allocating Classrooms...
                  </>
                ) : (
                  <>
                    <Building className="w-5 h-5 mr-2" />
                    Allocate Classrooms & Generate Class IDs
                  </>
                )}
              </Button>

              {/* Progress */}
              {isGenerating && (
                <Card className="bg-green-50 border-green-200">
                  <CardContent className="p-4">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Allocating classrooms and generating Class IDs...</span>
                        <span className="text-sm text-muted-foreground">{progress}%</span>
                      </div>
                      <Progress value={progress} className="h-2" />
                      <div className="text-xs text-muted-foreground">
                        Analyzing capacity → Matching room types → Generating Class IDs → Creating allocations
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setCurrentStep(2)} className="flex-1">
                  Previous
                </Button>
                <Button onClick={() => setCurrentStep(4)} className="flex-1">
                  Next: Review & Generate
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Import Dialogs */}
      <ImportDialog
        open={showCourseImport}
        onOpenChange={setShowCourseImport}
        title="Import Courses"
        description="Import courses from a JSON file or paste the content below."
        sampleFormat="[{"courseCode": "CS101", "courseName": "Introduction to Computer Science", ...}]"
        sampleData="[{"courseCode": "CS101", "courseName": "Introduction to Computer Science", "credits": 3, "type": "theory", "category": "core", "expectedStrength": 60}]"
        onImport={(data) => importCoursesMutation.mutate(data)}
        isLoading={importCoursesMutation.isPending}
      />

      <ImportDialog
        open={showRoomImport}
        onOpenChange={setShowRoomImport}
        title="Import Rooms"
        description="Import rooms from a JSON file or paste the content below."
        sampleFormat="[{"roomNumber": "A101", "roomName": "Lecture Hall A101", ...}]"
        sampleData="[{"roomNumber": "A101", "roomName": "Lecture Hall A101", "roomType": "lecture", "capacity": 100, "equipment": ["projector", "whiteboard"], "location": "Block A"}]"
        onImport={(data) => importRoomsMutation.mutate(data)}
        isLoading={importRoomsMutation.isPending}
      />

      <ImportDialog
        open={showFacultyImport}
        onOpenChange={setShowFacultyImport}
        title="Import Faculty"
        description="Import faculty members from a JSON file or paste the content below."
        sampleFormat="[{"firstName": "John", "lastName": "Doe", ...}]"
        sampleData="[{"firstName": "John", "lastName": "Doe", "email": "john.doe@example.com", "department": "Computer Science", "specialization": ["Algorithms", "Data Structures"], "maxWorkload": 18, "availability": {"Monday": ["09:00-11:00", "14:00-16:00"]}}]"
        onImport={(data) => importFacultyMutation.mutate(data)}
        isLoading={importFacultyMutation.isPending}
      />
    </div>
  );
}
