import React, { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Sparkles, Clock, Calendar, Coffee, Users, BookOpen, CheckCircle } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';

interface AITimetableResponse {
  generated_config: {
    college_start_time: string;
    college_end_time: string;
    slot_length: string;
    grace_time: number;
    breaks: Array<{
      type: string;
      start_time: string;
      end_time: string;
      duration: number;
      is_active: boolean;
    }>;
    working_days: string[];
  };
  generated_grid: {
    total_teaching_slots_per_day: number;
    grid_matrix: Record<string, any>;
  };
  explanation: string;
  recommendations: string[];
  slot_mapping: Record<string, {
    day: string;
    start_time: string;
    end_time: string;
    duration: number;
    is_break: boolean;
    break_type?: string;
    period: string;
  }>;
  break_schedule: Array<{
    type: string;
    start_time: string;
    end_time: string;
    duration: number;
    description: string;
  }>;
  working_schedule: Record<string, string[]>;
}

interface SampleQuestionsResponse {
  sample_questions: string[];
  supported_features: string[];
}

export default function AITimetableGenerator() {
  const [question, setQuestion] = useState('');
  const [generatedTimetable, setGeneratedTimetable] = useState<AITimetableResponse | null>(null);

  // Fetch sample questions
  const { data: sampleData } = useQuery({
    queryKey: ['ai-sample-questions'],
    queryFn: async () => {
      const response = await fetch('http://localhost:8000/ai/sample-questions');
      if (!response.ok) throw new Error('Failed to fetch sample questions');
      return response.json();
    },
  }) as { data: SampleQuestionsResponse | undefined };

  // AI generation mutation
  const generateMutation = useMutation({
    mutationFn: async (questionText: string) => {
      const response = await fetch('http://localhost:8000/ai/quick-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: questionText }),
      });
      if (!response.ok) throw new Error('Failed to generate timetable');
      return response.json();
    },
    onSuccess: (data: AITimetableResponse) => {
      setGeneratedTimetable(data);
    },
  });

  const handleGenerate = () => {
    if (question.trim()) {
      generateMutation.mutate(question);
    }
  };

  const handleSampleQuestion = (sampleQuestion: string) => {
    setQuestion(sampleQuestion);
    generateMutation.mutate(sampleQuestion);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-2">
        <Sparkles className="h-6 w-6 text-blue-600" />
        <h2 className="text-2xl font-bold">AI Timetable Generator</h2>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Ask AI to Generate Your Base Timetable</CardTitle>
          <CardDescription>
            Describe your requirements in natural language and let AI create an optimized timetable configuration
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Your Question</label>
            <Textarea
              placeholder="e.g., Generate a timetable for engineering college from 8:30 AM to 5:30 PM with 50-minute slots and lunch break"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              rows={3}
            />
          </div>

          <Button 
            onClick={handleGenerate} 
            disabled={!question.trim() || generateMutation.isPending}
            className="w-full"
          >
            {generateMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating AI Timetable...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Generate Timetable
              </>
            )}
          </Button>

          {generateMutation.error && (
            <Alert variant="destructive">
              <AlertDescription>
                Failed to generate timetable: {generateMutation.error.message}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Sample Questions */}
      {sampleData && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <BookOpen className="h-5 w-5" />
              <span>Sample Questions</span>
            </CardTitle>
            <CardDescription>Click any question to try it out</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2">
              {sampleData.sample_questions.map((sample, index) => (
                <Button
                  key={index}
                  variant="outline"
                  className="justify-start text-left h-auto p-3"
                  onClick={() => handleSampleQuestion(sample)}
                  disabled={generateMutation.isPending}
                >
                  {sample}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Generated Timetable Results */}
      {generatedTimetable && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <span>Generated Timetable</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="overview" className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="schedule">Schedule</TabsTrigger>
                <TabsTrigger value="slots">Slot Mapping</TabsTrigger>
                <TabsTrigger value="recommendations">AI Insights</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center space-x-2">
                        <Clock className="h-4 w-4 text-blue-600" />
                        <span className="text-sm font-medium">College Hours</span>
                      </div>
                      <p className="text-lg font-bold">
                        {generatedTimetable.generated_config.college_start_time} - {generatedTimetable.generated_config.college_end_time}
                      </p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center space-x-2">
                        <Users className="h-4 w-4 text-green-600" />
                        <span className="text-sm font-medium">Slot Duration</span>
                      </div>
                      <p className="text-lg font-bold">{generatedTimetable.generated_config.slot_length} minutes</p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center space-x-2">
                        <Calendar className="h-4 w-4 text-purple-600" />
                        <span className="text-sm font-medium">Daily Slots</span>
                      </div>
                      <p className="text-lg font-bold">{generatedTimetable.generated_grid.total_teaching_slots_per_day}</p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center space-x-2">
                        <Coffee className="h-4 w-4 text-orange-600" />
                        <span className="text-sm font-medium">Breaks</span>
                      </div>
                      <p className="text-lg font-bold">{generatedTimetable.break_schedule.length}</p>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle>Configuration Details</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <h4 className="font-medium mb-2">Working Days</h4>
                      <div className="flex flex-wrap gap-2">
                        {generatedTimetable.generated_config.working_days.map((day) => (
                          <Badge key={day} variant="secondary">{day}</Badge>
                        ))}
                      </div>
                    </div>

                    <div>
                      <h4 className="font-medium mb-2">Grace Time</h4>
                      <p className="text-sm text-gray-600">
                        {generatedTimetable.generated_config.grace_time} minutes between slots
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="schedule" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Break Schedule</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {generatedTimetable.break_schedule.map((breakItem, index) => (
                        <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <div className="flex items-center space-x-3">
                            <Coffee className="h-4 w-4 text-orange-600" />
                            <div>
                              <p className="font-medium">{breakItem.description}</p>
                              <p className="text-sm text-gray-600">
                                {breakItem.start_time} - {breakItem.end_time}
                              </p>
                            </div>
                          </div>
                          <Badge variant="outline">{breakItem.duration} min</Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Working Schedule</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {Object.entries(generatedTimetable.working_schedule).map(([day, slots]) => (
                        <div key={day} className="p-3 bg-gray-50 rounded-lg">
                          <h4 className="font-medium mb-2">{day}</h4>
                          <div className="flex flex-wrap gap-1">
                            {slots.slice(0, 10).map((slot) => (
                              <Badge key={slot} variant="secondary" className="text-xs">
                                {slot}
                              </Badge>
                            ))}
                            {slots.length > 10 && (
                              <Badge variant="outline" className="text-xs">
                                +{slots.length - 10} more
                              </Badge>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="slots" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Slot Time Mapping</CardTitle>
                    <CardDescription>
                      Detailed time mapping for each slot in the timetable
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="max-h-96 overflow-y-auto">
                      <div className="grid gap-2">
                        {Object.entries(generatedTimetable.slot_mapping).slice(0, 20).map(([slotId, slotInfo]) => (
                          <div key={slotId} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                            <div className="flex items-center space-x-3">
                              <Badge variant={slotInfo.is_break ? "destructive" : "default"}>
                                {slotId}
                              </Badge>
                              <div className="text-sm">
                                <p className="font-medium">{slotInfo.day}</p>
                                <p className="text-gray-600">
                                  {slotInfo.start_time} - {slotInfo.end_time}
                                </p>
                              </div>
                            </div>
                            <div className="text-right text-sm">
                              <p className="font-medium">{slotInfo.period}</p>
                              <p className="text-gray-600">{slotInfo.duration} min</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="recommendations" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>AI Explanation</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="prose prose-sm max-w-none">
                      <pre className="whitespace-pre-wrap text-sm bg-gray-50 p-4 rounded-lg">
                        {generatedTimetable.explanation}
                      </pre>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>AI Recommendations</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {generatedTimetable.recommendations.map((recommendation, index) => (
                        <div key={index} className="flex items-start space-x-3 p-3 bg-blue-50 rounded-lg">
                          <Sparkles className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                          <p className="text-sm">{recommendation}</p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {sampleData && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Supported Features</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {sampleData.supported_features.map((feature, index) => (
                          <div key={index} className="flex items-center space-x-2">
                            <CheckCircle className="h-4 w-4 text-green-600" />
                            <span className="text-sm">{feature}</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
