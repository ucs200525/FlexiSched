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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { 
  Users, 
  BookOpen, 
  Clock, 
  Calendar, 
  Bell, 
  TrendingUp,
  CheckCircle,
  AlertTriangle,
  Edit,
  Save,
  X,
  RefreshCw,
  BarChart3,
  Download
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface FacultyAssignment {
  id: string;
  courseCode: string;
  courseName: string;
  section: string;
  credits: number;
  studentCount: number;
  roomNumber: string;
  timeSlots: Array<{
    day: string;
    startTime: string;
    endTime: string;
    slotId: string;
  }>;
}

interface AvailabilitySlot {
  day: string;
  startTime: string;
  endTime: string;
  isAvailable: boolean;
  reason?: string;
}

interface WorkloadMetrics {
  totalCredits: number;
  totalHours: number;
  weeklyHours: number;
  maxWorkload: number;
  utilizationPercentage: number;
}

export default function FacultyWorkflow() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("assignments");
  const [editingAvailability, setEditingAvailability] = useState(false);
  const [selectedWeek, setSelectedWeek] = useState("current");

  // Mock faculty ID - in real app, this would come from auth context
  const facultyId = "faculty-1";

  const { data: assignments, refetch: refetchAssignments } = useQuery<FacultyAssignment[]>({
    queryKey: [`/api/faculty/${facultyId}/assigned-courses`],
  });

  const { data: availability, refetch: refetchAvailability } = useQuery<AvailabilitySlot[]>({
    queryKey: [`/api/faculty/${facultyId}/availability`],
    queryFn: async () => {
      // Mock data for now - will be replaced with real API call
      const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      const timeSlots = [
        { start: "08:30", end: "09:20" },
        { start: "09:30", end: "10:20" },
        { start: "10:30", end: "11:20" },
        { start: "11:30", end: "12:20" },
        { start: "14:00", end: "14:50" },
        { start: "15:00", end: "15:50" },
        { start: "16:00", end: "16:50" }
      ];
      
      return days.flatMap(day => 
        timeSlots.map(slot => ({
          day,
          startTime: slot.start,
          endTime: slot.end,
          isAvailable: Math.random() > 0.3, // Random availability for demo
          reason: Math.random() > 0.7 ? "Personal commitment" : undefined
        }))
      ) as AvailabilitySlot[];
    }
  });

  const { data: workloadMetrics } = useQuery({
    queryKey: [`/api/faculty/${facultyId}/workload`],
    queryFn: async () => {
      const totalCredits = assignments?.reduce((sum, assignment) => sum + assignment.credits, 0) || 0;
      const totalHours = assignments?.reduce((sum, assignment) => sum + assignment.timeSlots.length, 0) || 0;
      
      return {
        totalCredits,
        totalHours,
        weeklyHours: totalHours,
        maxWorkload: 18, // Maximum credits allowed
        utilizationPercentage: Math.round((totalCredits / 18) * 100)
      } as WorkloadMetrics;
    }
  });

  const { data: notifications } = useQuery({
    queryKey: [`/api/faculty/${facultyId}/notifications`],
    queryFn: async () => {
      return [
        {
          id: "1",
          type: "schedule_change",
          title: "Schedule Update",
          message: "CS101 Lab session moved from Friday 2:00 PM to Thursday 3:00 PM",
          timestamp: "2024-01-15T10:30:00Z",
          isRead: false
        },
        {
          id: "2",
          type: "workload_alert",
          title: "Workload Alert",
          message: "You are approaching maximum workload limit (16/18 credits)",
          timestamp: "2024-01-14T14:20:00Z",
          isRead: false
        }
      ];
    }
  });

  const updateAvailabilityMutation = useMutation({
    mutationFn: async (availabilityData: any) => {
      const response = await apiRequest("PUT", `/api/faculty/${facultyId}/availability`, availabilityData);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Availability Updated",
        description: "Your availability has been updated successfully.",
      });
      setEditingAvailability(false);
    },
    onError: () => {
      toast({
        title: "Update Failed",
        description: "Failed to update availability. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleExport = async (format: 'pdf' | 'excel') => {
    try {
      const exportData = {
        facultyId,
        assignments: assignments || [],
        availability: availability || [],
        workloadMetrics,
        format,
        timestamp: new Date().toISOString(),
      };

      const response = await apiRequest("POST", `/api/faculty/export/${format}`, exportData);
      
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = `faculty-schedule-${new Date().toISOString().split('T')[0]}.${format === 'pdf' ? 'pdf' : 'xlsx'}`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        toast({
          title: "Export Successful",
          description: `Faculty schedule exported as ${format.toUpperCase()} successfully.`,
        });
      } else {
        throw new Error('Export failed');
      }
    } catch (error) {
      toast({
        title: "Export Failed",
        description: `Failed to export schedule as ${format.toUpperCase()}. Please try again.`,
        variant: "destructive",
      });
    }
  };

  const handleCalendarSync = async (type: 'google' | 'ical') => {
    try {
      const calendarData = {
        facultyId,
        assignments: assignments || [],
        events: assignments?.flatMap(assignment => 
          assignment.timeSlots.map((slot: any) => ({
            title: `${assignment.courseCode} - ${assignment.courseName}`,
            description: `Section: ${assignment.section} | Room: ${assignment.roomNumber}`,
            startTime: slot.startTime,
            endTime: slot.endTime,
            day: slot.day,
            location: assignment.roomNumber,
            recurrence: 'weekly'
          }))
        ) || [],
        type,
        timestamp: new Date().toISOString(),
      };

      if (type === 'google') {
        // For Google Calendar integration
        const response = await apiRequest("POST", `/api/faculty/calendar/google-sync`, calendarData);
        
        if (response.ok) {
          const result = await response.json();
          if (result.authUrl) {
            // Open Google OAuth flow in new window
            window.open(result.authUrl, '_blank', 'width=500,height=600');
            toast({
              title: "Google Calendar Sync",
              description: "Please authorize access in the new window to sync your schedule.",
            });
          } else {
            toast({
              title: "Sync Successful",
              description: "Your schedule has been synced to Google Calendar.",
            });
          }
        } else {
          throw new Error('Google sync failed');
        }
      } else if (type === 'ical') {
        // For iCal export
        const response = await apiRequest("POST", `/api/faculty/calendar/ical`, calendarData);
        
        if (response.ok) {
          const blob = await response.blob();
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.style.display = 'none';
          a.href = url;
          a.download = `faculty-schedule-${new Date().toISOString().split('T')[0]}.ics`;
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

  const triggerRescheduleMutation = useMutation({
    mutationFn: async () => {
      // In real app, this would trigger AI re-scheduling
      await new Promise(resolve => setTimeout(resolve, 2000));
      return { success: true, message: "Schedule optimized successfully" };
    },
    onSuccess: () => {
      toast({
        title: "Schedule Re-optimized",
        description: "AI has successfully re-optimized the schedule based on your availability changes."
      });
      refetchAssignments();
    }
  });

  const getWorkloadColor = (percentage: number) => {
    if (percentage >= 90) return "text-red-600";
    if (percentage >= 75) return "text-yellow-600";
    return "text-green-600";
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case "schedule_change":
        return <Calendar className="w-4 h-4" />;
      case "workload_alert":
        return <AlertTriangle className="w-4 h-4" />;
      default:
        return <Bell className="w-4 h-4" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header with Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-primary">
              {assignments?.length || 0}
            </div>
            <div className="text-sm text-muted-foreground">Assigned Courses</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className={`text-2xl font-bold ${getWorkloadColor(workloadMetrics?.utilizationPercentage || 0)}`}>
              {workloadMetrics?.totalCredits || 0}/{workloadMetrics?.maxWorkload || 18}
            </div>
            <div className="text-sm text-muted-foreground">Credits (Workload)</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-secondary">
              {workloadMetrics?.weeklyHours || 0}
            </div>
            <div className="text-sm text-muted-foreground">Weekly Hours</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-accent">
              {notifications?.filter(n => !n.isRead).length || 0}
            </div>
            <div className="text-sm text-muted-foreground">New Notifications</div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <div className="flex justify-between items-center">
          <TabsList className="grid grid-cols-4">
            <TabsTrigger value="assignments">
              <BookOpen className="w-4 h-4 mr-2" />
              My Courses
            </TabsTrigger>
            <TabsTrigger value="availability">
              <Clock className="w-4 h-4 mr-2" />
              Availability
            </TabsTrigger>
            <TabsTrigger value="workload">
              <BarChart3 className="w-4 h-4 mr-2" />
              Workload
            </TabsTrigger>
            <TabsTrigger value="notifications">
              <Bell className="w-4 h-4 mr-2" />
              Notifications
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

        {/* Assigned Courses Tab */}
        <TabsContent value="assignments">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="w-5 h-5" />
                My Assigned Courses
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {assignments?.map((assignment) => (
                  <Card key={assignment.id} className="border-l-4 border-l-primary">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-lg">
                              {assignment.courseCode} - {assignment.courseName}
                            </h3>
                            <Badge variant="outline">Section {assignment.section}</Badge>
                            <Badge variant="secondary">{assignment.credits} Credits</Badge>
                          </div>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Users className="w-4 h-4" />
                              {assignment.studentCount} students
                            </span>
                            <span className="flex items-center gap-1">
                              <Calendar className="w-4 h-4" />
                              Room {assignment.roomNumber}
                            </span>
                          </div>
                        </div>
                      </div>
                      
                      <div className="mt-4">
                        <Label className="text-sm font-medium">Schedule:</Label>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-2">
                          {assignment.timeSlots.map((slot, index) => (
                            <div key={index} className="p-2 bg-muted rounded-lg text-center">
                              <div className="font-medium text-sm">{slot.day}</div>
                              <div className="text-xs text-muted-foreground">
                                {slot.startTime} - {slot.endTime}
                              </div>
                              <div className="text-xs text-primary">Slot {slot.slotId}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                
                {(!assignments || assignments.length === 0) && (
                  <div className="text-center py-8">
                    <BookOpen className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-medium mb-2">No Courses Assigned</h3>
                    <p className="text-muted-foreground">
                      You don't have any courses assigned yet. Contact the admin for course assignments.
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Availability Management Tab */}
        <TabsContent value="availability">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Clock className="w-5 h-5" />
                  Availability Management
                </CardTitle>
                <div className="flex items-center gap-2">
                  {editingAvailability ? (
                    <>
                      <Button 
                        size="sm" 
                        onClick={() => updateAvailabilityMutation.mutate(availability || [])}
                        disabled={updateAvailabilityMutation.isPending}
                      >
                        <Save className="w-4 h-4 mr-1" />
                        Save Changes
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        onClick={() => setEditingAvailability(false)}
                      >
                        <X className="w-4 h-4 mr-1" />
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <Button 
                      size="sm" 
                      onClick={() => setEditingAvailability(true)}
                    >
                      <Edit className="w-4 h-4 mr-1" />
                      Edit Availability
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <Alert>
                  <AlertTriangle className="w-4 h-4" />
                  <AlertDescription>
                    Changes to availability will trigger AI re-scheduling if conflicts are detected.
                    You'll be notified of any schedule changes.
                  </AlertDescription>
                </Alert>

                <div className="grid gap-4">
                  {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map(day => (
                    <Card key={day}>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base">{day}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
                          {availability?.filter(slot => slot.day === day).map((slot, index) => (
                            <div 
                              key={index}
                              className={`p-2 rounded-lg border text-center cursor-pointer transition-colors ${
                                slot.isAvailable 
                                  ? "bg-green-50 border-green-200 text-green-800" 
                                  : "bg-red-50 border-red-200 text-red-800"
                              } ${editingAvailability ? "hover:opacity-75" : ""}`}
                              onClick={() => {
                                if (editingAvailability && availability) {
                                  const updated = availability.map(s => 
                                    s.day === slot.day && s.startTime === slot.startTime 
                                      ? { ...s, isAvailable: !s.isAvailable }
                                      : s
                                  );
                                  // In real app, update local state here
                                }
                              }}
                            >
                              <div className="text-xs font-medium">
                                {slot.startTime}
                              </div>
                              <div className="text-xs">
                                {slot.endTime}
                              </div>
                              {slot.reason && (
                                <div className="text-xs mt-1 opacity-75">
                                  {slot.reason}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {editingAvailability && (
                  <Card className="bg-blue-50 border-blue-200">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 text-blue-800">
                        <RefreshCw className="w-4 h-4" />
                        <span className="text-sm font-medium">
                          Click on time slots to toggle availability. Green = Available, Red = Not Available
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Workload Tracking Tab */}
        <TabsContent value="workload">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5" />
                  Workload Overview
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Total Credits</span>
                    <span className="font-medium">{workloadMetrics?.totalCredits || 0}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Weekly Hours</span>
                    <span className="font-medium">{workloadMetrics?.weeklyHours || 0}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Max Workload</span>
                    <span className="font-medium">{workloadMetrics?.maxWorkload || 18} credits</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Utilization</span>
                    <span className={`font-medium ${getWorkloadColor(workloadMetrics?.utilizationPercentage || 0)}`}>
                      {workloadMetrics?.utilizationPercentage || 0}%
                    </span>
                  </div>
                </div>

                <div className="pt-4">
                  <div className="flex justify-between text-sm mb-2">
                    <span>Workload Progress</span>
                    <span>{workloadMetrics?.utilizationPercentage || 0}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className={`h-2 rounded-full transition-all ${
                        (workloadMetrics?.utilizationPercentage || 0) >= 90 
                          ? "bg-red-500" 
                          : (workloadMetrics?.utilizationPercentage || 0) >= 75 
                            ? "bg-yellow-500" 
                            : "bg-green-500"
                      }`}
                      style={{ width: `${Math.min(workloadMetrics?.utilizationPercentage || 0, 100)}%` }}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="w-5 h-5" />
                  Course Distribution
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {assignments?.map((assignment) => (
                    <div key={assignment.id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                      <div>
                        <div className="font-medium text-sm">{assignment.courseCode}</div>
                        <div className="text-xs text-muted-foreground">Section {assignment.section}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-medium text-sm">{assignment.credits} credits</div>
                        <div className="text-xs text-muted-foreground">{assignment.timeSlots.length} hours/week</div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Notifications Tab */}
        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="w-5 h-5" />
                Notifications & Alerts
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {notifications?.map((notification) => (
                  <Alert key={notification.id} className={notification.isRead ? "opacity-60" : ""}>
                    <div className="flex items-start gap-3">
                      {getNotificationIcon(notification.type)}
                      <div className="flex-1">
                        <div className="font-medium">{notification.title}</div>
                        <div className="text-sm text-muted-foreground mt-1">
                          {notification.message}
                        </div>
                        <div className="text-xs text-muted-foreground mt-2">
                          {new Date(notification.timestamp).toLocaleString()}
                        </div>
                      </div>
                      {!notification.isRead && (
                        <Badge variant="secondary" className="text-xs">New</Badge>
                      )}
                    </div>
                  </Alert>
                ))}
                
                {(!notifications || notifications.length === 0) && (
                  <div className="text-center py-8">
                    <Bell className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-medium mb-2">No Notifications</h3>
                    <p className="text-muted-foreground">
                      You're all caught up! No new notifications at this time.
                    </p>
                  </div>
                )}
              </div>
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
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => triggerRescheduleMutation.mutate()}
              disabled={triggerRescheduleMutation.isPending}
            >
              {triggerRescheduleMutation.isPending ? (
                <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-1" />
              )}
              Re-optimize Schedule
            </Button>
            <Button variant="outline" size="sm">
              <Calendar className="w-4 h-4 mr-1" />
              Export My Schedule
            </Button>
            <Button variant="outline" size="sm">
              <Bell className="w-4 h-4 mr-1" />
              Notification Settings
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
