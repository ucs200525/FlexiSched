import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { 
  Building, 
  Users, 
  MapPin, 
  Clock, 
  CheckCircle, 
  AlertTriangle,
  Loader2,
  Search,
  Filter,
  Download,
  Eye
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface Room {
  id: string;
  number: string;
  name: string;
  type: string;
  capacity: number;
  equipment: string[];
  location: string;
  isAvailable: boolean;
}

interface Schedule {
  dayOfWeek: string;
  startTime: string;
  endTime: string;
}

interface ClassStatistics {
  totalEnrolled: number;
  capacityUtilization: number;
  attendanceRate: number;
}

interface EnrolledStudent {
  studentId: string;
  name: string;
  program: string;
  semester: number;
  batch?: string;
}

interface ClassAllocation {
  classId: string;
  timetableSlotId: string;
  courseId: string;
  courseCode: string;
  courseName: string;
  facultyId: string;
  facultyName: string;
  roomId: string | null;
  room: Room | null;
  roomNumber: string;
  roomType: string;
  schedule: Schedule;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  slotType: string;
  enrolledStudents: EnrolledStudent[];
  capacity: number;
  utilization: number;
  equipment: string[];
  location: string;
  statistics?: ClassStatistics;
}

interface AllocationSummary {
  totalClasses: number;
  allocatedClasses: number;
  unallocatedClasses: number;
  roomUtilizationRate: number;
  averageCapacityUtilization: number;
}

export default function ClassroomAllocation() {
  const { toast } = useToast();
  const [selectedTimetable, setSelectedTimetable] = useState<string>("");
  const [selectedClass, setSelectedClass] = useState<ClassAllocation | null>(null);
  const [showClassDetails, setShowClassDetails] = useState(false);

  // Fetch timetables
  const { data: timetables } = useQuery<any[]>({
    queryKey: ["/api/timetables"],
    initialData: []
  });

  // Fetch allocation data
  const { data: allocationData, isLoading: allocationLoading, refetch: refetchAllocation } = useQuery<{
    classAllocations: ClassAllocation[];
    allocationSummary: AllocationSummary;
    unallocatedClasses: ClassAllocation[];
  }>({
    queryKey: [`/api/admin/classroom-allocations/${selectedTimetable}`],
    enabled: !!selectedTimetable,
  });

  // Classroom allocation mutation
  const allocateClassroomsMutation = useMutation({
    mutationFn: async (data: { timetableId: string; allocationRules?: any }) => {
      const response = await apiRequest("POST", "/api/admin/allocate-classrooms", data);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Classroom Allocation Completed",
        description: `Allocated ${data.allocationSummary.allocatedClasses} out of ${data.allocationSummary.totalClasses} classes`,
      });
      refetchAllocation();
    },
    onError: (error: any) => {
      toast({
        title: "Allocation Failed",
        description: error.message || 'Failed to allocate classrooms',
        variant: "destructive",
      });
    },
  });

  const handleAllocateClassrooms = () => {
    if (!selectedTimetable) {
      toast({
        title: "No Timetable Selected",
        description: "Please select a timetable first",
        variant: "destructive",
      });
      return;
    }

    allocateClassroomsMutation.mutate({
      timetableId: selectedTimetable,
      allocationRules: {
        prioritizeGroundFloor: true,
        maintainLabRooms: true,
        bufferCapacity: 0.1
      }
    });
  };

  const handleViewClassDetails = async (classId: string) => {
    try {
      const response = await apiRequest("GET", `/api/classes/${classId}`);
      if (response.ok) {
        const classData = await response.json();
        setSelectedClass(classData);
        setShowClassDetails(true);
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to fetch class details",
        variant: "destructive",
      });
    }
  };

  const getUtilizationColor = (utilization: number) => {
    if (utilization >= 90) return "text-red-600";
    if (utilization >= 75) return "text-yellow-600";
    return "text-green-600";
  };

  const getStatusBadge = (allocation: ClassAllocation) => {
    if (!allocation.roomId) {
      return <Badge variant="destructive">Unallocated</Badge>;
    }
    if (allocation.utilization >= 90) {
      return <Badge variant="secondary">Over-capacity</Badge>;
    }
    return <Badge variant="default">Allocated</Badge>;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building className="w-5 h-5" />
            Classroom Allocation Management
          </CardTitle>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <Select value={selectedTimetable} onValueChange={setSelectedTimetable}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a timetable to allocate classrooms" />
                </SelectTrigger>
                <SelectContent>
                  {timetables.map((timetable) => (
                    <SelectItem key={timetable.id} value={timetable.id}>
                      {timetable.name} - {timetable.program} Sem {timetable.semester}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button 
              onClick={handleAllocateClassrooms}
              disabled={!selectedTimetable || allocateClassroomsMutation.isPending}
            >
              {allocateClassroomsMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Allocating...
                </>
              ) : (
                <>
                  <MapPin className="w-4 h-4 mr-2" />
                  Auto-Allocate Classrooms
                </>
              )}
            </Button>
          </div>
        </CardHeader>
      </Card>

      {selectedTimetable && (
        <>
          {/* Allocation Summary */}
          {allocationData?.allocationSummary && (
            <Card>
              <CardHeader>
                <CardTitle>Allocation Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <div className="text-center p-4 bg-primary/10 rounded-lg">
                    <div className="text-2xl font-bold text-primary">
                      {allocationData.allocationSummary.totalClasses}
                    </div>
                    <div className="text-sm text-muted-foreground">Total Classes</div>
                  </div>
                  <div className="text-center p-4 bg-green-100 rounded-lg">
                    <div className="text-2xl font-bold text-green-600">
                      {allocationData.allocationSummary.allocatedClasses}
                    </div>
                    <div className="text-sm text-muted-foreground">Allocated</div>
                  </div>
                  <div className="text-center p-4 bg-red-100 rounded-lg">
                    <div className="text-2xl font-bold text-red-600">
                      {allocationData.allocationSummary.unallocatedClasses}
                    </div>
                    <div className="text-sm text-muted-foreground">Unallocated</div>
                  </div>
                  <div className="text-center p-4 bg-blue-100 rounded-lg">
                    <div className="text-2xl font-bold text-blue-600">
                      {allocationData.allocationSummary.roomUtilizationRate}%
                    </div>
                    <div className="text-sm text-muted-foreground">Room Utilization</div>
                  </div>
                  <div className="text-center p-4 bg-purple-100 rounded-lg">
                    <div className="text-2xl font-bold text-purple-600">
                      {allocationData.allocationSummary.averageCapacityUtilization}%
                    </div>
                    <div className="text-sm text-muted-foreground">Avg Capacity</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Class Allocations */}
          <Card>
            <CardHeader>
              <CardTitle>Class Allocations</CardTitle>
            </CardHeader>
            <CardContent>
              {allocationLoading ? (
                <div className="flex items-center justify-center p-8">
                  <Loader2 className="w-6 h-6 animate-spin mr-2" />
                  <span className="text-muted-foreground">Loading allocations...</span>
                </div>
              ) : allocationData?.classAllocations ? (
                <Tabs defaultValue="all" className="w-full">
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="all">All Classes</TabsTrigger>
                    <TabsTrigger value="allocated">Allocated</TabsTrigger>
                    <TabsTrigger value="unallocated">Unallocated</TabsTrigger>
                  </TabsList>

                  <TabsContent value="all" className="space-y-4">
                    <div className="grid gap-4">
                      {allocationData.classAllocations.map((allocation) => (
                        <Card key={allocation.classId} className="p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex-1 grid grid-cols-1 md:grid-cols-6 gap-4 items-center">
                              <div>
                                <div className="font-medium">{allocation.courseCode}</div>
                                <div className="text-sm text-muted-foreground">{allocation.courseName}</div>
                              </div>
                              <div>
                                <div className="text-sm font-medium">{allocation.facultyName}</div>
                                <div className="text-xs text-muted-foreground">Faculty</div>
                              </div>
                              <div>
                                <div className="text-sm font-medium">{allocation.dayOfWeek}</div>
                                <div className="text-xs text-muted-foreground">{allocation.startTime} - {allocation.endTime}</div>
                              </div>
                              <div>
                                <div className="text-sm font-medium">{allocation.roomNumber}</div>
                                <div className="text-xs text-muted-foreground">{allocation.roomType}</div>
                              </div>
                              <div>
                                <div className="text-sm font-medium">{allocation.enrolledStudents.length} students</div>
                                <div className={`text-xs ${getUtilizationColor(allocation.utilization)}`}>
                                  {allocation.utilization}% capacity
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                {getStatusBadge(allocation)}
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleViewClassDetails(allocation.classId)}
                                >
                                  <Eye className="w-4 h-4" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        </Card>
                      ))}
                    </div>
                  </TabsContent>

                  <TabsContent value="allocated" className="space-y-4">
                    <div className="grid gap-4">
                      {allocationData.classAllocations
                        .filter(allocation => allocation.roomId)
                        .map((allocation) => (
                          <Card key={allocation.classId} className="p-4">
                            <div className="flex items-center justify-between">
                              <div className="flex-1 grid grid-cols-1 md:grid-cols-6 gap-4 items-center">
                                <div>
                                  <div className="font-medium">{allocation.courseCode}</div>
                                  <div className="text-sm text-muted-foreground">{allocation.courseName}</div>
                                </div>
                                <div>
                                  <div className="text-sm font-medium">{allocation.facultyName}</div>
                                  <div className="text-xs text-muted-foreground">Faculty</div>
                                </div>
                                <div>
                                  <div className="text-sm font-medium">{allocation.dayOfWeek}</div>
                                  <div className="text-xs text-muted-foreground">{allocation.startTime} - {allocation.endTime}</div>
                                </div>
                                <div>
                                  <div className="text-sm font-medium">{allocation.roomNumber}</div>
                                  <div className="text-xs text-muted-foreground">{allocation.roomType}</div>
                                </div>
                                <div>
                                  <div className="text-sm font-medium">{allocation.enrolledStudents.length} students</div>
                                  <div className={`text-xs ${getUtilizationColor(allocation.utilization)}`}>
                                    {allocation.utilization}% capacity
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Badge variant="default">Allocated</Badge>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleViewClassDetails(allocation.classId)}
                                  >
                                    <Eye className="w-4 h-4" />
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </Card>
                        ))}
                    </div>
                  </TabsContent>

                  <TabsContent value="unallocated" className="space-y-4">
                    <div className="grid gap-4">
                      {allocationData.classAllocations
                        .filter(allocation => !allocation.roomId)
                        .map((allocation) => (
                          <Card key={allocation.classId} className="p-4 border-red-200">
                            <div className="flex items-center justify-between">
                              <div className="flex-1 grid grid-cols-1 md:grid-cols-5 gap-4 items-center">
                                <div>
                                  <div className="font-medium">{allocation.courseCode}</div>
                                  <div className="text-sm text-muted-foreground">{allocation.courseName}</div>
                                </div>
                                <div>
                                  <div className="text-sm font-medium">{allocation.facultyName}</div>
                                  <div className="text-xs text-muted-foreground">Faculty</div>
                                </div>
                                <div>
                                  <div className="text-sm font-medium">{allocation.dayOfWeek}</div>
                                  <div className="text-xs text-muted-foreground">{allocation.startTime} - {allocation.endTime}</div>
                                </div>
                                <div>
                                  <div className="text-sm font-medium">{allocation.enrolledStudents.length} students</div>
                                  <div className="text-xs text-muted-foreground">Need room</div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Badge variant="destructive">Unallocated</Badge>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleViewClassDetails(allocation.classId)}
                                  >
                                    <Eye className="w-4 h-4" />
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </Card>
                        ))}
                    </div>
                  </TabsContent>
                </Tabs>
              ) : (
                <div className="text-center p-8 text-muted-foreground">
                  <Building className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No allocation data available</p>
                  <p className="text-sm">Click "Auto-Allocate Classrooms" to generate allocations</p>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Class Details Dialog */}
      <Dialog open={showClassDetails} onOpenChange={setShowClassDetails}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building className="w-5 h-5" />
              Class Details - {selectedClass?.classId}
            </DialogTitle>
          </DialogHeader>

          {selectedClass && (
            <div className="space-y-6">
              {/* Basic Information */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Course Information</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Course Code:</span>
                      <span className="font-medium">{selectedClass.courseCode}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Course Name:</span>
                      <span className="font-medium">{selectedClass.courseName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Credits:</span>
                      <span className="font-medium">N/A</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Type:</span>
                      <span className="font-medium">N/A</span>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Schedule & Location</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Day:</span>
                      <span className="font-medium">{selectedClass.dayOfWeek || selectedClass.schedule?.dayOfWeek || 'Not specified'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Time:</span>
                      <span className="font-medium">
                        {selectedClass.startTime || selectedClass.schedule?.startTime || 'N/A'}
                        {' - '}
                        {selectedClass.endTime || selectedClass.schedule?.endTime || 'N/A'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Room:</span>
                      <span className="font-medium">
                        {selectedClass.room?.number || selectedClass.roomNumber || 'Not assigned'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Location:</span>
                      <span className="font-medium">
                        {selectedClass.room?.location || selectedClass.location || 'Not specified'}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Faculty Information */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Faculty Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Name:</span>
                    <span className="font-medium">{selectedClass.facultyName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Faculty ID:</span>
                    <span className="font-medium">{selectedClass.facultyId}</span>
                  </div>
                </CardContent>
              </Card>

              {/* Room Information */}
              {selectedClass.room && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Room Information</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Room Number:</span>
                      <span className="font-medium">{selectedClass.room.number}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Room Name:</span>
                      <span className="font-medium">{selectedClass.room.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Type:</span>
                      <span className="font-medium">{selectedClass.room.type}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Capacity:</span>
                      <span className="font-medium">{selectedClass.room.capacity}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Equipment:</span>
                      <span className="font-medium">
                        {selectedClass.room.equipment?.join(", ") || "None"}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Statistics */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Statistics</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center p-4 bg-primary/10 rounded-lg">
                      <div className="text-2xl font-bold text-primary">
                        {selectedClass.enrolledStudents?.length || 0}
                      </div>
                      <div className="text-sm text-muted-foreground">Enrolled Students</div>
                    </div>
                    <div className="text-center p-4 bg-secondary/10 rounded-lg">
                      <div className="text-2xl font-bold text-secondary">
                        {selectedClass.utilization || 0}%
                      </div>
                      <div className="text-sm text-muted-foreground">Capacity Utilization</div>
                    </div>
                    <div className="text-center p-4 bg-accent/10 rounded-lg">
                      <div className="text-2xl font-bold text-accent">
                        {selectedClass.statistics?.attendanceRate || 'N/A'}
                      </div>
                      <div className="text-sm text-muted-foreground">Attendance Rate</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Enrolled Students */}
              {selectedClass.enrolledStudents && selectedClass.enrolledStudents.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">
                      Enrolled Students ({selectedClass.enrolledStudents.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-2 max-h-64 overflow-y-auto">
                      {selectedClass.enrolledStudents.map((student, index) => (
                        <div key={index} className="flex items-center justify-between p-2 border rounded">
                          <div>
                            <div className="font-medium">{student.name}</div>
                            <div className="text-sm text-muted-foreground">{student.studentId}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm">{student.program}</div>
                            <div className="text-xs text-muted-foreground">
                              Semester {student.semester} • {student.batch}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
