import { useState } from "react";
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
  Upload
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface BaseSetupData {
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

export default function AdminWorkflow() {
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState(1);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);

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

  const { data: existingCourses } = useQuery({
    queryKey: ["/api/courses"],
  });

  const { data: faculty } = useQuery({
    queryKey: ["/api/faculty"],
  });

  const { data: rooms } = useQuery({
    queryKey: ["/api/rooms"],
  });

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
    onError: (error) => {
      setProgress(0);
      setIsGenerating(false);
      toast({
        title: "Generation Failed",
        description: `Failed to generate slot mappings: ${error.message || 'Unknown error'}`,
        variant: "destructive",
      });
    },
  });

  const handleSlotMappingGeneration = async () => {
    if (!existingCourses?.length || !faculty?.length || !rooms?.length) {
      toast({
        title: "Incomplete Setup",
        description: "Please ensure you have courses, faculty, and rooms configured before generating.",
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
                Configure departments, courses, faculty, student data, and basic timetable settings
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
                        Creating time slots → Assigning courses → Matching faculty → Allocating rooms
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
                        {rooms?.filter((room: any) => 
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
                        {rooms?.filter((room: any) => 
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
                        {rooms?.filter((room: any) => 
                          room.roomType?.toLowerCase().includes('auditorium')
                        ).length || 0}
                      </div>
                      <div className="text-sm text-muted-foreground">Auditoriums</div>
                    </CardContent>
                  </Card>
                  <Card className="border-l-4 border-l-orange-500">
                    <CardContent className="p-4 text-center">
                      <div className="text-2xl font-bold text-orange-600">
                        {rooms?.reduce((sum: number, room: any) => sum + (room.capacity || 0), 0) || 0}
                      </div>
                      <div className="text-sm text-muted-foreground">Total Capacity</div>
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
                <div className="flex gap-2 flex-1">
                  <Button variant="outline" className="flex-1">
                    <Download className="w-4 h-4 mr-2" />
                    Export PDF
                  </Button>
                  <Button variant="outline" className="flex-1">
                    <Upload className="w-4 h-4 mr-2" />
                    Export Excel
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
