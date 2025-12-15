import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Bell, Moon, Plus, Loader2, Calendar, Bot } from "lucide-react";
import { StatsCards } from "@/components/stats-cards";
import { TimetableGrid } from "@/components/timetable-grid";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { TimetableGenerationRequest } from "@/lib/types";
import { programs } from "@/lib/types";

export default function Dashboard() {
  const { toast } = useToast();
  const [generationForm, setGenerationForm] = useState<TimetableGenerationRequest>({
    program: "B.Ed",
    semester: 1,
    batch: "2024-25",
    academicYear: "2024-25",
    constraints: {
      minimizeFacultyConflicts: true,
      optimizeRoomUtilization: true,
      balanceWorkloadDistribution: true,
      considerStudentPreferences: false,
    },
  });

  const [isGenerating, setIsGenerating] = useState(false);

  // Fetch data for timetable preview
  const { data: timetables } = useQuery({
    queryKey: ["/api/timetables"],
  });

  const { data: courses } = useQuery({
    queryKey: ["/api/courses"],
  });

  const { data: faculty } = useQuery({
    queryKey: ["/api/faculty"],
  });

  const { data: rooms } = useQuery({
    queryKey: ["/api/rooms"],
  });

  const { data: timetableSlots } = useQuery({
    queryKey: ["/api/timetables", Array.isArray(timetables) && timetables[0]?.id, "slots"],
    enabled: !!(Array.isArray(timetables) && timetables[0]?.id),
  });

  const generateTimetableMutation = useMutation({
    mutationFn: async (request: TimetableGenerationRequest) => {
      const response = await apiRequest("POST", "/api/timetables/generate", request);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Timetable generated successfully with AI optimization!",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/timetables"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      setIsGenerating(false);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to generate timetable",
        variant: "destructive",
      });
      setIsGenerating(false);
    },
  });

  const handleGenerateTimetable = async () => {
    setIsGenerating(true);
    generateTimetableMutation.mutate(generationForm);
  };

  const quickActions = [
    { icon: Plus, label: "Add Student", href: "/students" },
    { icon: Plus, label: "Add Faculty", href: "/faculty" },
    { icon: Plus, label: "New Course", href: "/courses" },
  ];

  const recentActivities = [
    { type: "success", message: "New timetable generated for B.Ed Semester 3", time: "2 minutes ago" },
    { type: "info", message: "Faculty workload updated for Dr. Sharma", time: "15 minutes ago" },
    { type: "warning", message: "Room R-204 marked for maintenance", time: "1 hour ago" },
    { type: "info", message: "Student enrollment completed for Minor courses", time: "3 hours ago" },
  ];

  return (
    <div className="flex-1 flex flex-col">
      {/* Header */}
      <header className="bg-card border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground" data-testid="page-title">Dashboard</h1>
            <p className="text-sm text-muted-foreground">
              AI-powered timetable generation for NEP 2020 compliance
            </p>
          </div>
          <div className="flex items-center space-x-4">
            <Button 
              className="bg-gradient-to-r from-primary to-secondary hover:from-primary/90 hover:to-secondary/90"
              data-testid="button-generate-new-timetable"
              onClick={handleGenerateTimetable}
              disabled={isGenerating}
            >
              {isGenerating ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Plus className="w-4 h-4 mr-2" />
              )}
              Generate New Timetable
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
        <StatsCards />

        {/* Main Dashboard Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* AI Timetable Generator */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Bot className="w-5 h-5" />
                      AI Timetable Generator
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">
                      Generate optimized schedules with AI assistance
                    </p>
                  </div>
                  <div className="w-8 h-8 bg-gradient-to-br from-primary to-secondary rounded-lg flex items-center justify-center float-animation">
                    <Bot className="text-white w-4 h-4" />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Program Type
                    </label>
                    <Select 
                      value={generationForm.program} 
                      onValueChange={(value) => setGenerationForm(prev => ({ ...prev, program: value }))}
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
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Semester
                    </label>
                    <Select 
                      value={generationForm.semester.toString()} 
                      onValueChange={(value) => setGenerationForm(prev => ({ ...prev, semester: parseInt(value) }))}
                    >
                      <SelectTrigger data-testid="select-semester">
                        <SelectValue placeholder="Select semester" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">Semester 1 (2024-25)</SelectItem>
                        <SelectItem value="2">Semester 2 (2024-25)</SelectItem>
                        <SelectItem value="3">Semester 3 (2024-25)</SelectItem>
                        <SelectItem value="4">Semester 4 (2024-25)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Batch
                    </label>
                    <Select 
                      value={generationForm.batch} 
                      onValueChange={(value) => setGenerationForm(prev => ({ ...prev, batch: value }))}
                    >
                      <SelectTrigger data-testid="select-batch">
                        <SelectValue placeholder="Select batch" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="2024-25">2024-25</SelectItem>
                        <SelectItem value="2023-24">2023-24</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Academic Year
                    </label>
                    <Select 
                      value={generationForm.academicYear} 
                      onValueChange={(value) => setGenerationForm(prev => ({ ...prev, academicYear: value }))}
                    >
                      <SelectTrigger data-testid="select-academic-year">
                        <SelectValue placeholder="Select academic year" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="2024-25">2024-25</SelectItem>
                        <SelectItem value="2023-24">2023-24</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* AI Settings */}
                <Card className="bg-muted">
                  <CardContent className="p-4">
                    <h3 className="text-sm font-semibold text-foreground mb-3">
                      AI Optimization Settings
                    </h3>
                    <div className="space-y-3">
                      {[
                        { key: "minimizeFacultyConflicts", label: "Minimize faculty conflicts" },
                        { key: "optimizeRoomUtilization", label: "Optimize room utilization" },
                        { key: "balanceWorkloadDistribution", label: "Balance workload distribution" },
                        { key: "considerStudentPreferences", label: "Consider student preferences" },
                      ].map(constraint => (
                        <div key={constraint.key} className="flex items-center space-x-3">
                          <Checkbox
                            checked={generationForm.constraints[constraint.key as keyof typeof generationForm.constraints]}
                            onCheckedChange={(checked) => 
                              setGenerationForm(prev => ({
                                ...prev,
                                constraints: {
                                  ...prev.constraints,
                                  [constraint.key]: !!checked,
                                }
                              }))
                            }
                            data-testid={`checkbox-${constraint.key}`}
                          />
                          <span className="text-sm text-foreground">{constraint.label}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Button 
                  type="submit" 
                  className="w-full py-6 bg-gradient-to-r from-primary to-secondary text-white hover:from-primary/90 hover:to-secondary/90 transform hover:scale-105 transition-all"
                  onClick={handleGenerateTimetable}
                  disabled={isGenerating}
                  data-testid="button-generate-ai-timetable"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      Generating AI-Powered Timetable...
                    </>
                  ) : (
                    <>
                      <Bot className="w-5 h-5 mr-2" />
                      Generate AI-Powered Timetable
                    </>
                  )}
                </Button>

                {/* Progress Indicator */}
                {isGenerating && (
                  <Card className="p-4 bg-primary/5 border-primary/20">
                    <div className="flex items-center space-x-3">
                      <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-foreground">AI is analyzing constraints...</p>
                        <p className="text-xs text-muted-foreground">Processing scheduling constraints</p>
                      </div>
                    </div>
                    <div className="mt-3 w-full bg-muted rounded-full h-2">
                      <div className="bg-gradient-to-r from-primary to-secondary h-2 rounded-full w-3/5 animate-pulse"></div>
                    </div>
                  </Card>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Quick Actions & Recent Activities */}
          <div className="space-y-6">
            {/* Quick Actions */}
            <Card>
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {quickActions.map((action, index) => {
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

            {/* Recent Activities */}
            <Card>
              <CardHeader>
                <CardTitle>Recent Activities</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {recentActivities.map((activity, index) => (
                  <div key={index} className="flex items-start space-x-3" data-testid={`activity-${index}`}>
                    <div className={`w-2 h-2 rounded-full mt-2 ${
                      activity.type === "success" ? "bg-secondary" :
                      activity.type === "warning" ? "bg-accent" :
                      "bg-primary"
                    }`} />
                    <div className="flex-1">
                      <p className="text-sm text-foreground">{activity.message}</p>
                      <p className="text-xs text-muted-foreground">{activity.time}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* System Status */}
            <Card>
              <CardHeader>
                <CardTitle>System Status</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  { name: "AI Engine", status: "Online" },
                  { name: "Database", status: "Online" },
                  { name: "Export Service", status: "Online" },
                ].map(service => (
                  <div key={service.name} className="flex items-center justify-between">
                    <span className="text-sm text-foreground">{service.name}</span>
                    <div className="status-badge bg-secondary/10 text-secondary">
                      <div className="w-2 h-2 bg-secondary rounded-full pulse-animation"></div>
                      {service.status}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Timetable Preview */}
        {(timetableSlots || courses || faculty || rooms) && (
          <TimetableGrid
            slots={Array.isArray(timetableSlots) ? timetableSlots : []}
            courses={Array.isArray(courses) ? courses : []}
            faculty={Array.isArray(faculty) ? faculty : []}
            rooms={Array.isArray(rooms) ? rooms : []}
            editable={true}
          />
        )}
      </main>

      {/* Floating Action Button */}
      <Button
        className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-gradient-to-br from-primary to-secondary shadow-lg hover:shadow-xl transform hover:scale-110 transition-all"
        onClick={handleGenerateTimetable}
        disabled={isGenerating}
        data-testid="fab-quick-generation"
      >
        {isGenerating ? (
          <Loader2 className="w-6 h-6 animate-spin" />
        ) : (
          <Bot className="w-6 h-6" />
        )}
      </Button>

      {/* Status Indicator */}
      <div className="fixed top-4 right-4 z-50">
        <div className="flex items-center space-x-2 bg-card border border-border rounded-full px-3 py-2 shadow-lg">
          <div className="w-2 h-2 bg-secondary rounded-full pulse-animation"></div>
          <span className="text-xs font-medium text-foreground">AI Ready</span>
        </div>
      </div>
    </div>
  );
}
