import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Bot, Sparkles, Loader2, CheckCircle, AlertCircle, Clock, TrendingUp } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { TimetableGenerationRequest } from "@/lib/types";
import { programs } from "@/lib/types";

interface GenerationResult {
  timetable: any;
  aiResult: {
    schedule: any[];
    conflicts: Array<{
      type: string;
      description: string;
      severity: 'low' | 'medium' | 'high';
      suggestions: string[];
    }>;
    optimizationScore: number;
    metrics: {
      facultyUtilization: number;
      roomUtilization: number;
      conflictCount: number;
      workloadBalance: number;
    };
  };
}

export default function AIGenerator() {
  const { toast } = useToast();
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState("");
  const [lastResult, setLastResult] = useState<GenerationResult | null>(null);
  
  const [formData, setFormData] = useState<TimetableGenerationRequest>({
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

  const { data: courses } = useQuery({
    queryKey: ["/api/courses"],
  });

  const { data: faculty } = useQuery({
    queryKey: ["/api/faculty"],
  });

  const { data: rooms } = useQuery({
    queryKey: ["/api/rooms"],
  });

  const generateTimetableMutation = useMutation({
    mutationFn: async (request: TimetableGenerationRequest) => {
      const response = await apiRequest("POST", "/api/timetables/generate", request);
      return response.json();
    },
    onSuccess: (data: GenerationResult) => {
      toast({
        title: "AI Generation Complete!",
        description: `Generated timetable with ${data.aiResult.optimizationScore}% optimization score`,
      });
      setLastResult(data);
      queryClient.invalidateQueries({ queryKey: ["/api/timetables"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      setIsGenerating(false);
      setGenerationProgress(100);
    },
    onError: (error) => {
      toast({
        title: "Generation Failed",
        description: error instanceof Error ? error.message : "Failed to generate timetable with AI",
        variant: "destructive",
      });
      setIsGenerating(false);
      setGenerationProgress(0);
    },
  });

  const handleGenerate = async () => {
    setIsGenerating(true);
    setGenerationProgress(0);
    setCurrentStep("Initializing AI engine...");
    
    // Simulate progress updates
    const progressSteps = [
      { progress: 20, step: "Analyzing course requirements..." },
      { progress: 40, step: "Processing faculty constraints..." },
      { progress: 60, step: "Optimizing room allocation..." },
      { progress: 80, step: "Resolving scheduling conflicts..." },
      { progress: 95, step: "Finalizing timetable..." },
    ];
    
    let currentProgressIndex = 0;
    const progressInterval = setInterval(() => {
      if (currentProgressIndex < progressSteps.length) {
        const { progress, step } = progressSteps[currentProgressIndex];
        setGenerationProgress(progress);
        setCurrentStep(step);
        currentProgressIndex++;
      } else {
        clearInterval(progressInterval);
      }
    }, 1000);
    
    try {
      await generateTimetableMutation.mutateAsync(formData);
      clearInterval(progressInterval);
    } catch (error) {
      clearInterval(progressInterval);
    }
  };

  const filteredCourses = courses?.filter(course => 
    course.program === formData.program && 
    course.semester === formData.semester && 
    course.isActive
  ) || [];

  const activeFaculty = faculty?.filter(f => f.isActive) || [];
  const availableRooms = rooms?.filter(r => r.isAvailable) || [];

  const getSeverityColor = (severity: 'low' | 'medium' | 'high') => {
    switch (severity) {
      case 'high':
        return 'text-destructive';
      case 'medium':
        return 'text-yellow-600';
      case 'low':
        return 'text-green-600';
      default:
        return 'text-muted-foreground';
    }
  };

  const getSeverityIcon = (severity: 'low' | 'medium' | 'high') => {
    switch (severity) {
      case 'high':
        return <AlertCircle className="w-4 h-4" />;
      case 'medium':
        return <Clock className="w-4 h-4" />;
      case 'low':
        return <CheckCircle className="w-4 h-4" />;
      default:
        return <AlertCircle className="w-4 h-4" />;
    }
  };

  return (
    <div className="flex-1 flex flex-col">
      {/* Header */}
      <header className="bg-card border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2" data-testid="page-title">
              <Bot className="w-8 h-8 text-primary" />
              AI Timetable Generator
            </h1>
            <p className="text-sm text-muted-foreground">
              Advanced AI-powered scheduling with conflict resolution and optimization
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <Badge variant="outline" className="bg-secondary/10 text-secondary">
              <div className="w-2 h-2 bg-secondary rounded-full pulse-animation mr-2"></div>
              AI Engine Ready
            </Badge>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 p-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Generation Form */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5" />
                  AI Generation Parameters
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Basic Parameters */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Program Type
                    </label>
                    <Select 
                      value={formData.program} 
                      onValueChange={(value) => setFormData(prev => ({ ...prev, program: value }))}
                      disabled={isGenerating}
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
                      value={formData.semester.toString()} 
                      onValueChange={(value) => setFormData(prev => ({ ...prev, semester: parseInt(value) }))}
                      disabled={isGenerating}
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
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Batch
                    </label>
                    <Select 
                      value={formData.batch} 
                      onValueChange={(value) => setFormData(prev => ({ ...prev, batch: value }))}
                      disabled={isGenerating}
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
                      value={formData.academicYear} 
                      onValueChange={(value) => setFormData(prev => ({ ...prev, academicYear: value }))}
                      disabled={isGenerating}
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

                {/* AI Optimization Settings */}
                <Card className="bg-muted/50">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">AI Optimization Constraints</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {[
                      { key: "minimizeFacultyConflicts", label: "Minimize faculty conflicts", description: "Ensure no faculty member is double-booked" },
                      { key: "optimizeRoomUtilization", label: "Optimize room utilization", description: "Maximize efficient use of available spaces" },
                      { key: "balanceWorkloadDistribution", label: "Balance workload distribution", description: "Evenly distribute teaching hours across faculty" },
                      { key: "considerStudentPreferences", label: "Consider student preferences", description: "Factor in student course selection preferences" },
                    ].map(constraint => (
                      <div key={constraint.key} className="flex items-start space-x-3">
                        <Checkbox
                          checked={formData.constraints[constraint.key as keyof typeof formData.constraints]}
                          onCheckedChange={(checked) => 
                            setFormData(prev => ({
                              ...prev,
                              constraints: {
                                ...prev.constraints,
                                [constraint.key]: !!checked,
                              }
                            }))
                          }
                          disabled={isGenerating}
                          data-testid={`checkbox-${constraint.key}`}
                        />
                        <div className="flex-1">
                          <span className="text-sm font-medium text-foreground">{constraint.label}</span>
                          <p className="text-xs text-muted-foreground">{constraint.description}</p>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                {/* Resource Summary */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center p-4 bg-primary/10 rounded-lg">
                    <div className="text-2xl font-bold text-primary">{filteredCourses.length}</div>
                    <div className="text-sm text-muted-foreground">Courses</div>
                  </div>
                  <div className="text-center p-4 bg-secondary/10 rounded-lg">
                    <div className="text-2xl font-bold text-secondary">{activeFaculty.length}</div>
                    <div className="text-sm text-muted-foreground">Faculty</div>
                  </div>
                  <div className="text-center p-4 bg-accent/10 rounded-lg">
                    <div className="text-2xl font-bold text-accent">{availableRooms.length}</div>
                    <div className="text-sm text-muted-foreground">Rooms</div>
                  </div>
                </div>

                {/* Generate Button */}
                <Button 
                  className="w-full py-6 bg-gradient-to-r from-primary to-secondary text-white hover:from-primary/90 hover:to-secondary/90 transform hover:scale-105 transition-all"
                  onClick={handleGenerate}
                  disabled={isGenerating || filteredCourses.length === 0}
                  data-testid="button-generate-ai-timetable"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      Generating with AI...
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
                  <Card className="bg-primary/5 border-primary/20">
                    <CardContent className="p-4">
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-foreground">{currentStep}</span>
                          <span className="text-sm text-muted-foreground">{generationProgress}%</span>
                        </div>
                        <Progress value={generationProgress} className="h-2" />
                      </div>
                    </CardContent>
                  </Card>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Results Panel */}
          <div className="space-y-6">
            {/* Generation Results */}
            {lastResult && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="w-5 h-5" />
                    Generation Results
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="text-center">
                    <div className="text-3xl font-bold text-primary">
                      {lastResult.aiResult.optimizationScore}%
                    </div>
                    <div className="text-sm text-muted-foreground">Optimization Score</div>
                  </div>
                  
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-sm">Faculty Utilization</span>
                      <span className="text-sm font-medium">{lastResult.aiResult.metrics.facultyUtilization}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm">Room Utilization</span>
                      <span className="text-sm font-medium">{lastResult.aiResult.metrics.roomUtilization}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm">Workload Balance</span>
                      <span className="text-sm font-medium">{lastResult.aiResult.metrics.workloadBalance}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm">Conflicts Detected</span>
                      <span className="text-sm font-medium">{lastResult.aiResult.metrics.conflictCount}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Conflicts & Issues */}
            {lastResult && lastResult.aiResult.conflicts.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertCircle className="w-5 h-5" />
                    Detected Issues
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {lastResult.aiResult.conflicts.map((conflict, index) => (
                    <Alert key={index} className="p-3">
                      <div className="flex items-start gap-2">
                        <div className={getSeverityColor(conflict.severity)}>
                          {getSeverityIcon(conflict.severity)}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-medium">{conflict.type}</span>
                            <Badge variant={conflict.severity === 'high' ? 'destructive' : conflict.severity === 'medium' ? 'secondary' : 'default'} className="text-xs">
                              {conflict.severity}
                            </Badge>
                          </div>
                          <AlertDescription className="text-xs">
                            {conflict.description}
                          </AlertDescription>
                          {conflict.suggestions.length > 0 && (
                            <div className="mt-2">
                              <div className="text-xs font-medium text-muted-foreground mb-1">Suggestions:</div>
                              <ul className="text-xs text-muted-foreground space-y-1">
                                {conflict.suggestions.map((suggestion, suggestionIndex) => (
                                  <li key={suggestionIndex} className="flex items-start gap-1">
                                    <span>•</span>
                                    <span>{suggestion}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      </div>
                    </Alert>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* AI Features */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bot className="w-5 h-5" />
                  AI Features
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-secondary" />
                  <span className="text-sm">Conflict Resolution</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-secondary" />
                  <span className="text-sm">Resource Optimization</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-secondary" />
                  <span className="text-sm">Workload Balancing</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-secondary" />
                  <span className="text-sm">NEP 2020 Compliance</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
