import React, { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { 
  Bot, 
  Sparkles, 
  Loader2, 
  CheckCircle, 
  AlertTriangle,
  Users,
  Clock,
  BookOpen,
  Calendar,
  TrendingUp,
  Zap,
  Target,
  Grid,
  UserCheck
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const AI_SERVER_URL = 'http://localhost:8000';

interface UnifiedRequest {
  question: string;
  total_students: number;
  courses: any[];
  faculty: any[];
  rooms: any[];
  constraints: {
    minimize_conflicts: boolean;
    optimize_room_utilization: boolean;
    balance_faculty_load: boolean;
    consider_student_preferences: boolean;
  };
}

interface UnifiedResult {
  success: boolean;
  message: string;
  base_timetable: {
    slot_grid: Record<string, string[]>;
    time_slots: Array<{
      slot_id: string;
      day: string;
      start_time: string;
      end_time: string;
      duration: number;
      slot_type: string;
    }>;
    configuration: {
      college_start_time: string;
      college_end_time: string;
      slot_duration: number;
      grace_time: number;
      working_days: string[];
      breaks: Array<{
        type: string;
        start_time: string;
        end_time: string;
      }>;
    };
  };
  timetable: {
    schedule: any[];
    sections: any[];
    student_allocations: Record<string, Record<string, string>>;
    slot_grid: Record<string, string[]>;
  };
  optimization: {
    score: number;
    metrics: {
      faculty_utilization: number;
      room_utilization: number;
      allocation_success_rate: number;
      total_sections: number;
      total_assignments: number;
    };
    conflicts: any[];
    recommendations: string[];
  };
  generation_info: {
    generation_time: number;
    total_sections: number;
    total_assignments: number;
    students_allocated: number;
  };
  ai_insights: {
    conflict_analysis: any;
    utilization_insights: string[];
    improvement_suggestions: string[];
  };
}

export default function UnifiedAIGenerator() {
  const { toast } = useToast();
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [result, setResult] = useState<UnifiedResult | null>(null);
  
  const [formData, setFormData] = useState<UnifiedRequest>({
    question: "Generate timetable for engineering college from 8:30 AM to 5:30 PM with 50-minute slots and lunch break",
    total_students: 200,
    courses: [],
    faculty: [],
    rooms: [],
    constraints: {
      minimize_conflicts: true,
      optimize_room_utilization: true,
      balance_faculty_load: true,
      consider_student_preferences: false
    }
  });

  // Fetch sample data
  const { data: sampleData, isLoading: loadingSample } = useQuery({
    queryKey: ['sample-unified-request'],
    queryFn: async () => {
      const response = await fetch(`${AI_SERVER_URL}/ai/sample-unified-request`);
      if (!response.ok) throw new Error('Failed to fetch sample data');
      return response.json();
    }
  });

  // Load sample data when available
  React.useEffect(() => {
    if (sampleData?.sample_request) {
      const sample = sampleData.sample_request;
      setFormData(prev => ({
        ...prev,
        courses: sample.courses,
        faculty: sample.faculty,
        rooms: sample.rooms
      }));
    }
  }, [sampleData]);

  // Unified generation mutation
  const generateMutation = useMutation({
    mutationFn: async (request: UnifiedRequest) => {
      const response = await fetch(`${AI_SERVER_URL}/ai/unified-generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request)
      });
      if (!response.ok) throw new Error('Failed to generate unified timetable');
      return response.json();
    },
    onSuccess: (data: UnifiedResult) => {
      console.log("Unified AI Response:", data); // Debug log
      setResult(data);
      setIsGenerating(false);
      setGenerationProgress(100);
      toast({
        title: data.success ? "🎉 Timetable Generated Successfully!" : "⚠️ Timetable Generated with Issues",
        description: `Optimization Score: ${data.optimization.score}% | Generated in ${data.generation_info.generation_time.toFixed(2)}s`
      });
    },
    onError: (error) => {
      setIsGenerating(false);
      setGenerationProgress(0);
      toast({
        title: "❌ Generation Failed",
        description: error instanceof Error ? error.message : "Failed to generate timetable",
        variant: "destructive"
      });
    }
  });

  const handleGenerate = async () => {
    setIsGenerating(true);
    setGenerationProgress(0);
    setResult(null);
    
    // Simulate progress
    const progressSteps = [
      { progress: 15, delay: 500 },
      { progress: 35, delay: 1000 },
      { progress: 55, delay: 1500 },
      { progress: 75, delay: 2000 },
      { progress: 90, delay: 2500 }
    ];
    
    progressSteps.forEach(({ progress, delay }) => {
      setTimeout(() => {
        if (isGenerating) {
          setGenerationProgress(progress);
        }
      }, delay);
    });
    
    try {
      await generateMutation.mutateAsync(formData);
    } catch (error) {
      // Error handled in mutation
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high': return 'text-red-600 bg-red-50 border-red-200';
      case 'medium': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'low': return 'text-green-600 bg-green-50 border-green-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 90) return 'text-green-600';
    if (score >= 70) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className="flex-1 flex flex-col">
      <header className="bg-card border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Zap className="w-8 h-8 text-primary" />
              Unified AI Timetable Generator
            </h1>
            <p className="text-sm text-muted-foreground">
              Complete AI-powered timetable generation in one unified process
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <Badge variant="outline" className="bg-primary/10 text-primary">
              <Bot className="w-3 h-3 mr-1" />
              OR-Tools Powered
            </Badge>
          </div>
        </div>
      </header>

      <main className="flex-1 p-6">
        <Tabs defaultValue="generator" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="generator">
              <Sparkles className="w-4 h-4 mr-2" />
              AI Generator
            </TabsTrigger>
            <TabsTrigger value="results">
              <TrendingUp className="w-4 h-4 mr-2" />
              Results & Analytics
            </TabsTrigger>
            <TabsTrigger value="schedule">
              <Calendar className="w-4 h-4 mr-2" />
              Generated Schedule
            </TabsTrigger>
          </TabsList>

          <TabsContent value="generator">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Input Form */}
              <div className="lg:col-span-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Bot className="w-5 h-5" />
                      AI Generation Parameters
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {/* Natural Language Question */}
                    <div>
                      <Label htmlFor="question">Natural Language Question</Label>
                      <Textarea
                        id="question"
                        placeholder="Describe your timetable requirements in natural language..."
                        value={formData.question}
                        onChange={(e) => setFormData(prev => ({ ...prev, question: e.target.value }))}
                        rows={3}
                        disabled={isGenerating}
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Example: "Generate timetable for engineering college from 8:30 AM to 5:30 PM with 50-minute slots"
                      </p>
                    </div>

                    {/* Student Count */}
                    <div>
                      <Label htmlFor="students">Total Students</Label>
                      <Input
                        id="students"
                        type="number"
                        min="50"
                        max="1000"
                        value={formData.total_students}
                        onChange={(e) => setFormData(prev => ({ ...prev, total_students: parseInt(e.target.value) || 200 }))}
                        disabled={isGenerating}
                      />
                    </div>

                    {/* Constraints */}
                    <Card className="bg-muted/50">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base">AI Optimization Constraints</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {[
                          { key: "minimize_conflicts", label: "Minimize Conflicts", icon: <Target className="w-4 h-4" /> },
                          { key: "optimize_room_utilization", label: "Optimize Room Utilization", icon: <BookOpen className="w-4 h-4" /> },
                          { key: "balance_faculty_load", label: "Balance Faculty Load", icon: <Users className="w-4 h-4" /> },
                          { key: "consider_student_preferences", label: "Consider Student Preferences", icon: <CheckCircle className="w-4 h-4" /> },
                        ].map(constraint => (
                          <div key={constraint.key} className="flex items-center space-x-3">
                            <input
                              type="checkbox"
                              checked={formData.constraints[constraint.key as keyof typeof formData.constraints]}
                              onChange={(e) => 
                                setFormData(prev => ({
                                  ...prev,
                                  constraints: {
                                    ...prev.constraints,
                                    [constraint.key]: e.target.checked,
                                  }
                                }))
                              }
                              disabled={isGenerating}
                              className="rounded"
                            />
                            <div className="flex items-center gap-2">
                              {constraint.icon}
                              <span className="text-sm font-medium">{constraint.label}</span>
                            </div>
                          </div>
                        ))}
                      </CardContent>
                    </Card>

                    {/* Resource Summary */}
                    <div className="grid grid-cols-3 gap-4">
                      <div className="text-center p-4 bg-blue-50 rounded-lg">
                        <div className="text-2xl font-bold text-blue-600">{formData.courses.length}</div>
                        <div className="text-sm text-muted-foreground">Courses</div>
                      </div>
                      <div className="text-center p-4 bg-green-50 rounded-lg">
                        <div className="text-2xl font-bold text-green-600">{formData.faculty.length}</div>
                        <div className="text-sm text-muted-foreground">Faculty</div>
                      </div>
                      <div className="text-center p-4 bg-purple-50 rounded-lg">
                        <div className="text-2xl font-bold text-purple-600">{formData.rooms.length}</div>
                        <div className="text-sm text-muted-foreground">Rooms</div>
                      </div>
                    </div>

                    {/* Generate Button */}
                    <Button 
                      className="w-full py-6 bg-gradient-to-r from-primary to-secondary text-white hover:from-primary/90 hover:to-secondary/90"
                      onClick={handleGenerate}
                      disabled={isGenerating || formData.courses.length === 0}
                    >
                      {isGenerating ? (
                        <>
                          <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                          Generating Complete Timetable...
                        </>
                      ) : (
                        <>
                          <Zap className="w-5 h-5 mr-2" />
                          Generate Unified AI Timetable
                        </>
                      )}
                    </Button>

                    {/* Progress */}
                    {isGenerating && (
                      <Card className="bg-primary/5 border-primary/20">
                        <CardContent className="p-4">
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium">AI Processing...</span>
                              <span className="text-sm text-muted-foreground">{generationProgress}%</span>
                            </div>
                            <Progress value={generationProgress} className="h-2" />
                            <div className="text-xs text-muted-foreground">
                              Generating base configuration, calculating sections, optimizing constraints...
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Features Panel */}
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Sparkles className="w-5 h-5" />
                      AI Features
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {sampleData?.features?.map((feature: string, index: number) => (
                      <div key={index} className="flex items-start gap-2">
                        <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                        <span className="text-sm">{feature}</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                {loadingSample && (
                  <Card>
                    <CardContent className="p-6 text-center">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">Loading sample data...</p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="results">
            {result ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Optimization Score */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <TrendingUp className="w-5 h-5" />
                      Optimization Results
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="text-center">
                      <div className={`text-4xl font-bold ${getScoreColor(result.optimization.score)}`}>
                        {result.optimization.score.toFixed(1)}%
                      </div>
                      <div className="text-sm text-muted-foreground">Optimization Score</div>
                    </div>
                    
                    <div className="space-y-3">
                      <div className="flex justify-between">
                        <span className="text-sm">Faculty Utilization</span>
                        <span className="text-sm font-medium">{result.optimization.metrics.faculty_utilization}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm">Room Utilization</span>
                        <span className="text-sm font-medium">{result.optimization.metrics.room_utilization}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm">Allocation Success</span>
                        <span className="text-sm font-medium">{result.optimization.metrics.allocation_success_rate}%</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Generation Info */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Clock className="w-5 h-5" />
                      Generation Statistics
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="text-center p-3 bg-blue-50 rounded">
                        <div className="text-xl font-bold text-blue-600">{result.generation_info.total_sections}</div>
                        <div className="text-xs text-muted-foreground">Sections Created</div>
                      </div>
                      <div className="text-center p-3 bg-green-50 rounded">
                        <div className="text-xl font-bold text-green-600">{result.generation_info.total_assignments}</div>
                        <div className="text-xs text-muted-foreground">Assignments</div>
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-primary">{result.generation_info.generation_time.toFixed(2)}s</div>
                      <div className="text-sm text-muted-foreground">Generation Time</div>
                    </div>
                  </CardContent>
                </Card>

                {/* Conflicts */}
                {result.optimization.conflicts.length > 0 && (
                  <Card className="lg:col-span-2">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5" />
                        Detected Conflicts
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {result.optimization.conflicts.map((conflict: any, index: number) => (
                          <Alert key={index} className={getSeverityColor(conflict.severity)}>
                            <AlertDescription>
                              <div className="flex items-start justify-between">
                                <div>
                                  <div className="font-medium">{conflict.type}</div>
                                  <div className="text-sm">{conflict.description}</div>
                                </div>
                                <Badge variant={conflict.severity === 'high' ? 'destructive' : 'secondary'}>
                                  {conflict.severity}
                                </Badge>
                              </div>
                            </AlertDescription>
                          </Alert>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Recommendations */}
                <Card className="lg:col-span-2">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Bot className="w-5 h-5" />
                      AI Recommendations
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {result.optimization.recommendations.map((rec: string, index: number) => (
                        <div key={index} className="flex items-start gap-2">
                          <CheckCircle className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                          <span className="text-sm">{rec}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            ) : (
              <Card>
                <CardContent className="text-center py-12">
                  <TrendingUp className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">Generate a timetable to view results and analytics</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="schedule">
            {result ? (
              <div className="space-y-6">
                {/* Base Timetable Grid */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Grid className="w-5 h-5" />
                      Base Timetable Grid (Slot → Time Mapping)
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {result.timetable?.slot_grid ? (
                      <div className="space-y-4">
                        {/* Configuration Summary */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-muted/50 rounded-lg">
                          <div className="text-center">
                            <div className="font-semibold text-primary">
                              {(result.timetable as any).configuration?.college_start_time || result.base_timetable?.configuration?.college_start_time || "08:30"}
                            </div>
                            <div className="text-xs text-muted-foreground">Start Time</div>
                          </div>
                          <div className="text-center">
                            <div className="font-semibold text-primary">
                              {(result.timetable as any).configuration?.college_end_time || result.base_timetable?.configuration?.college_end_time || "17:30"}
                            </div>
                            <div className="text-xs text-muted-foreground">End Time</div>
                          </div>
                          <div className="text-center">
                            <div className="font-semibold text-primary">
                              {(result.timetable as any).configuration?.slot_duration || result.base_timetable?.configuration?.slot_duration || 50} min
                            </div>
                            <div className="text-xs text-muted-foreground">Slot Duration</div>
                          </div>
                          <div className="text-center">
                            <div className="font-semibold text-primary">{Object.keys(result.timetable.slot_grid).length} days</div>
                            <div className="text-xs text-muted-foreground">Working Days</div>
                          </div>
                        </div>

                        {/* Time Slots Grid */}
                        <div className="space-y-4">
                          {Object.entries(result.timetable.slot_grid).map(([day, slots]: [string, any]) => (
                            <div key={day} className="space-y-2">
                              <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">{day}</h4>
                              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
                                {(slots as string[]).map((slot: string, index: number) => {
                                  const [slotId, timeRange] = slot.split(' ');
                                  const cleanTimeRange = timeRange?.replace(/[()]/g, '') || '';
                                  return (
                                    <div key={`${day}-${index}`} className="p-3 bg-background border rounded-lg text-center">
                                      <div className="font-mono text-sm font-semibold text-primary">{slotId}</div>
                                      <div className="text-xs text-muted-foreground">{cleanTimeRange}</div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Break Schedule */}
                        <div className="space-y-2">
                          <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">Break Schedule</h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {((result.timetable as any).configuration?.breaks || result.base_timetable?.configuration?.breaks || [
                              {"type": "morning", "start_time": "10:30", "end_time": "10:45"},
                              {"type": "lunch", "start_time": "13:00", "end_time": "14:00"}
                            ]).map((breakInfo: any, index: number) => (
                              <div key={index} className="p-3 bg-orange-50 border border-orange-200 rounded-lg text-center">
                                <div className="font-medium text-orange-800 capitalize">{breakInfo.type} Break</div>
                                <div className="text-sm text-orange-600">{breakInfo.start_time} - {breakInfo.end_time}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <Grid className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                        <p className="text-muted-foreground">Base timetable grid will appear here after generation</p>
                        {result && (
                          <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded">
                            <p className="text-sm text-yellow-800">
                              Debug: slot_grid exists: {result.timetable?.slot_grid ? 'Yes' : 'No'}
                              {result.timetable?.slot_grid && (
                                <span>, days: {Object.keys(result.timetable.slot_grid).length}, total slots: {Object.values(result.timetable.slot_grid).flat().length}</span>
                              )}
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Course Sections */}
                {result.timetable?.sections && result.timetable.sections.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Users className="w-5 h-5" />
                        Course Sections ({result.timetable.sections.length} sections)
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {result.timetable.sections.map((section: any, index: number) => (
                          <div key={index} className="p-4 border rounded-lg bg-background">
                            <div className="flex items-center justify-between mb-2">
                              <h4 className="font-semibold text-primary">{section.section_id}</h4>
                              <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                                {section.course_code}
                              </span>
                            </div>
                            <div className="space-y-1 text-sm text-muted-foreground">
                              <div>Capacity: {section.max_students}</div>
                              <div>Type: {section.section_type}</div>
                              {section.assigned_faculty && (
                                <div>Faculty: {section.assigned_faculty}</div>
                              )}
                              {section.assigned_room && (
                                <div>Room: {section.assigned_room}</div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Student Allocations */}
                {result.timetable?.student_allocations && Object.keys(result.timetable.student_allocations).length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <UserCheck className="w-5 h-5" />
                        Student Allocations ({Object.keys(result.timetable.student_allocations).length} students)
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-muted/50 rounded-lg">
                          <div className="text-center">
                            <div className="font-semibold text-primary">{Object.keys(result.timetable.student_allocations).length}</div>
                            <div className="text-xs text-muted-foreground">Total Students</div>
                          </div>
                          <div className="text-center">
                            <div className="font-semibold text-primary">
                              {Object.values(result.timetable.student_allocations).reduce((acc: number, student: any) => 
                                acc + Object.keys(student).length, 0
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground">Total Enrollments</div>
                          </div>
                          <div className="text-center">
                            <div className="font-semibold text-primary">
                              {new Set(Object.values(result.timetable.student_allocations).flatMap((student: any) => 
                                Object.keys(student)
                              )).size}
                            </div>
                            <div className="text-xs text-muted-foreground">Unique Courses</div>
                          </div>
                          <div className="text-center">
                            <div className="font-semibold text-primary">
                              {new Set(Object.values(result.timetable.student_allocations).flatMap((student: any) => 
                                Object.values(student)
                              )).size}
                            </div>
                            <div className="text-xs text-muted-foreground">Unique Sections</div>
                          </div>
                        </div>
                        
                        <div className="max-h-64 overflow-y-auto">
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                            {Object.entries(result.timetable.student_allocations).slice(0, 20).map(([studentId, courses]: [string, any]) => (
                              <div key={studentId} className="p-3 border rounded-lg bg-background">
                                <div className="font-medium text-sm mb-1">{studentId}</div>
                                <div className="space-y-1">
                                  {Object.entries(courses).map(([courseCode, sectionId]: [string, any]) => (
                                    <div key={courseCode} className="flex justify-between text-xs">
                                      <span className="text-muted-foreground">{courseCode}:</span>
                                      <span className="font-mono text-primary">{sectionId}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                          {Object.keys(result.timetable.student_allocations).length > 20 && (
                            <div className="text-center mt-4 text-sm text-muted-foreground">
                              Showing first 20 students of {Object.keys(result.timetable.student_allocations).length} total
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Generated Schedule */}
                {result.timetable?.schedule && result.timetable.schedule.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Calendar className="w-5 h-5" />
                        Generated Timetable Schedule
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Slot</TableHead>
                            <TableHead>Day</TableHead>
                            <TableHead>Time</TableHead>
                            <TableHead>Course</TableHead>
                            <TableHead>Faculty</TableHead>
                            <TableHead>Room</TableHead>
                            <TableHead>Type</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {result.timetable.schedule.map((item: any, index: number) => (
                            <TableRow key={index}>
                              <TableCell>
                                <Badge variant="outline" className="bg-blue-50 text-blue-700">
                                  {item.slot_id}
                                </Badge>
                              </TableCell>
                              <TableCell>{item.day}</TableCell>
                              <TableCell className="font-mono text-sm">{item.start_time} - {item.end_time}</TableCell>
                              <TableCell>
                                <div>
                                  <div className="font-medium">{item.course_name}</div>
                                  <div className="text-xs text-muted-foreground">{item.course_id}</div>
                                </div>
                              </TableCell>
                              <TableCell>{item.faculty_name}</TableCell>
                              <TableCell>{item.room_name}</TableCell>
                              <TableCell>
                                <Badge variant={item.section_type === 'lab' ? 'secondary' : 'outline'}>
                                  {item.section_type}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                )}
              </div>
            ) : (
              <Card>
                <CardContent className="text-center py-12">
                  <Calendar className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">Generate a timetable to view the base slot grid and schedule</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
