import React, { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Clock, Settings, Grid, Users, BookOpen, Plus, Trash2, Save, RefreshCw, Sparkles } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import AITimetableGenerator from './ai-timetable-generator';

interface BaseTimetableConfig {
  college_start_time: string;
  college_end_time: string;
  slot_length: '50' | '55' | '60';
  grace_time: number;
  breaks: Break[];
  working_days: string[];
}

interface Break {
  type: 'morning' | 'lunch' | 'evening';
  start_time: string;
  end_time: string;
  duration: number;
  is_active: boolean;
}

interface TimetableGrid {
  config: BaseTimetableConfig;
  slots: TimeSlotPattern[];
  total_slots_per_day: number;
  total_teaching_slots_per_day: number;
  grid_matrix: Record<string, string[]>;
}

interface TimeSlotPattern {
  slot_id: string;
  day: string;
  start_time: string;
  end_time: string;
  duration: number;
  is_break: boolean;
  break_type?: string;
}

interface ElectiveSection {
  section_id: string;
  elective_id: string;
  elective_name: string;
  faculty_id?: string;
  max_students: number;
  enrolled_students: string[];
  slot_pattern: string[];
  room_id?: string;
}

const AI_SERVER_URL = 'http://localhost:8000';

export default function AdminTimetableConfig() {
  const { toast } = useToast();
  const [config, setConfig] = useState<BaseTimetableConfig>({
    college_start_time: '08:30',
    college_end_time: '17:30',
    slot_length: '50',
    grace_time: 10,
    breaks: [
      {
        type: 'morning',
        start_time: '10:30',
        end_time: '10:45',
        duration: 15,
        is_active: true
      },
      {
        type: 'lunch',
        start_time: '13:00',
        end_time: '14:00',
        duration: 60,
        is_active: true
      }
    ],
    working_days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
  });

  const [timetableGrid, setTimetableGrid] = useState<TimetableGrid | null>(null);
  const [electiveSections, setElectiveSections] = useState<ElectiveSection[]>([]);

  // Fetch sample electives data
  const { data: sampleData } = useQuery({
    queryKey: ['sample-electives'],
    queryFn: async () => {
      const response = await fetch(`${AI_SERVER_URL}/sample/semester3-electives`);
      if (!response.ok) throw new Error('Failed to fetch sample data');
      return response.json();
    }
  });

  // Generate base timetable mutation
  const generateTimetableMutation = useMutation({
    mutationFn: async (config: BaseTimetableConfig) => {
      const response = await fetch(`${AI_SERVER_URL}/config/base-timetable`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      if (!response.ok) throw new Error('Failed to generate timetable');
      return response.json();
    },
    onSuccess: (data: TimetableGrid) => {
      setTimetableGrid(data);
      toast({
        title: 'Success',
        description: `Base timetable generated with ${data.total_teaching_slots_per_day} teaching slots per day`
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to generate base timetable',
        variant: 'destructive'
      });
    }
  });

  // Generate elective sections mutation
  const generateSectionsMutation = useMutation({
    mutationFn: async () => {
      if (!timetableGrid || !sampleData) throw new Error('Missing required data');
      
      // Extract core slots from sample data
      const coreSlots = sampleData.core_courses.flatMap((course: any) => course.slots);
      
      const response = await fetch(`${AI_SERVER_URL}/config/elective-sections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          electives: sampleData.electives,
          grid: timetableGrid,
          core_slots: coreSlots,
          sections_per_elective: 2
        })
      });
      if (!response.ok) throw new Error('Failed to generate elective sections');
      return response.json();
    },
    onSuccess: (data) => {
      setElectiveSections(data.sections);
      toast({
        title: 'Success',
        description: `Generated ${data.total_sections} elective sections`
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to generate elective sections',
        variant: 'destructive'
      });
    }
  });

  const handleConfigChange = (field: keyof BaseTimetableConfig, value: any) => {
    setConfig(prev => ({ ...prev, [field]: value }));
  };

  const addBreak = () => {
    setConfig(prev => ({
      ...prev,
      breaks: [...prev.breaks, {
        type: 'morning',
        start_time: '10:00',
        end_time: '10:15',
        duration: 15,
        is_active: true
      }]
    }));
  };

  const removeBreak = (index: number) => {
    setConfig(prev => ({
      ...prev,
      breaks: prev.breaks.filter((_, i) => i !== index)
    }));
  };

  const updateBreak = (index: number, field: keyof Break, value: any) => {
    setConfig(prev => ({
      ...prev,
      breaks: prev.breaks.map((brk, i) => 
        i === index ? { ...brk, [field]: value } : brk
      )
    }));
  };

  return (
    <div className="flex-1 flex flex-col">
      <header className="bg-card border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Base Timetable Configuration</h1>
            <p className="text-sm text-muted-foreground">
              One-time setup for college timetable structure and elective management
            </p>
          </div>
        </div>
      </header>

      <main className="flex-1 p-6 overflow-auto">
        <Tabs defaultValue="ai-generator" className="space-y-6">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="ai-generator">
              <Sparkles className="w-4 h-4 mr-2" />
              AI Generator
            </TabsTrigger>
            <TabsTrigger value="config">
              <Settings className="w-4 h-4 mr-2" />
              Basic Config
            </TabsTrigger>
            <TabsTrigger value="grid">
              <Grid className="w-4 h-4 mr-2" />
              Timetable Grid
            </TabsTrigger>
            <TabsTrigger value="electives">
              <BookOpen className="w-4 h-4 mr-2" />
              Elective Sections
            </TabsTrigger>
            <TabsTrigger value="preview">
              <Users className="w-4 h-4 mr-2" />
              Preview
            </TabsTrigger>
          </TabsList>

          {/* AI Generator Tab */}
          <TabsContent value="ai-generator">
            <AITimetableGenerator />
          </TabsContent>

          {/* Basic Configuration Tab */}
          <TabsContent value="config">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* College Hours */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="w-5 h-5" />
                    College Working Hours
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="start-time">Start Time</Label>
                      <Input
                        id="start-time"
                        type="time"
                        value={config.college_start_time}
                        onChange={(e) => handleConfigChange('college_start_time', e.target.value)}
                      />
                    </div>
                    <div>
                      <Label htmlFor="end-time">End Time</Label>
                      <Input
                        id="end-time"
                        type="time"
                        value={config.college_end_time}
                        onChange={(e) => handleConfigChange('college_end_time', e.target.value)}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Slot Configuration */}
              <Card>
                <CardHeader>
                  <CardTitle>Slot Configuration</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="slot-length">Slot Length (minutes)</Label>
                    <Select value={config.slot_length} onValueChange={(value: '50' | '55' | '60') => handleConfigChange('slot_length', value)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="50">50 minutes</SelectItem>
                        <SelectItem value="55">55 minutes</SelectItem>
                        <SelectItem value="60">60 minutes</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="grace-time">Grace Time (minutes)</Label>
                    <Input
                      id="grace-time"
                      type="number"
                      min="0"
                      max="30"
                      value={config.grace_time}
                      onChange={(e) => handleConfigChange('grace_time', parseInt(e.target.value))}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Breaks Configuration */}
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    Breaks Configuration
                    <Button size="sm" onClick={addBreak}>
                      <Plus className="w-4 h-4 mr-2" />
                      Add Break
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {config.breaks.map((brk, index) => (
                      <div key={index} className="flex items-center gap-4 p-4 border rounded-lg">
                        <Select value={brk.type} onValueChange={(value: 'morning' | 'lunch' | 'evening') => updateBreak(index, 'type', value)}>
                          <SelectTrigger className="w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="morning">Morning</SelectItem>
                            <SelectItem value="lunch">Lunch</SelectItem>
                            <SelectItem value="evening">Evening</SelectItem>
                          </SelectContent>
                        </Select>
                        <Input
                          type="time"
                          value={brk.start_time}
                          onChange={(e) => updateBreak(index, 'start_time', e.target.value)}
                          className="w-32"
                        />
                        <span className="text-muted-foreground">to</span>
                        <Input
                          type="time"
                          value={brk.end_time}
                          onChange={(e) => updateBreak(index, 'end_time', e.target.value)}
                          className="w-32"
                        />
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => removeBreak(index)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Generate Button */}
              <Card className="lg:col-span-2">
                <CardContent className="pt-6">
                  <Button
                    onClick={() => generateTimetableMutation.mutate(config)}
                    disabled={generateTimetableMutation.isPending}
                    className="w-full"
                    size="lg"
                  >
                    {generateTimetableMutation.isPending ? (
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4 mr-2" />
                    )}
                    Generate Base Timetable
                  </Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Timetable Grid Tab */}
          <TabsContent value="grid">
            {timetableGrid ? (
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Timetable Grid Overview</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-primary">{timetableGrid.total_teaching_slots_per_day}</div>
                        <div className="text-sm text-muted-foreground">Teaching Slots/Day</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-secondary">{timetableGrid.slots.length}</div>
                        <div className="text-sm text-muted-foreground">Total Slots</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-accent">{config.working_days.length}</div>
                        <div className="text-sm text-muted-foreground">Working Days</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-orange-500">{config.breaks.length}</div>
                        <div className="text-sm text-muted-foreground">Breaks</div>
                      </div>
                    </div>

                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Day</TableHead>
                          <TableHead>Available Slots</TableHead>
                          <TableHead>Teaching Slots</TableHead>
                          <TableHead>Break Slots</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {config.working_days.map(day => {
                          const daySlots = timetableGrid.slots.filter(slot => slot.day === day);
                          const teachingSlots = daySlots.filter(slot => !slot.is_break);
                          const breakSlots = daySlots.filter(slot => slot.is_break);
                          
                          return (
                            <TableRow key={day}>
                              <TableCell className="font-medium">{day}</TableCell>
                              <TableCell>{daySlots.length}</TableCell>
                              <TableCell>
                                <div className="flex flex-wrap gap-1">
                                  {teachingSlots.map(slot => (
                                    <Badge key={slot.slot_id} variant="default" className="text-xs">
                                      {slot.slot_id}
                                    </Badge>
                                  ))}
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="flex flex-wrap gap-1">
                                  {breakSlots.map(slot => (
                                    <Badge key={slot.slot_id} variant="secondary" className="text-xs">
                                      {slot.break_type}
                                    </Badge>
                                  ))}
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </div>
            ) : (
              <Card>
                <CardContent className="text-center py-12">
                  <Grid className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">Generate base timetable configuration first</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Elective Sections Tab */}
          <TabsContent value="electives">
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    Elective Sections Management
                    <Button
                      onClick={() => generateSectionsMutation.mutate()}
                      disabled={!timetableGrid || generateSectionsMutation.isPending}
                    >
                      {generateSectionsMutation.isPending ? (
                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Plus className="w-4 h-4 mr-2" />
                      )}
                      Generate Sections
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {electiveSections.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Section ID</TableHead>
                          <TableHead>Elective</TableHead>
                          <TableHead>Max Students</TableHead>
                          <TableHead>Slot Pattern</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {electiveSections.map(section => (
                          <TableRow key={section.section_id}>
                            <TableCell className="font-medium">{section.section_id}</TableCell>
                            <TableCell>{section.elective_name}</TableCell>
                            <TableCell>{section.max_students}</TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                {section.slot_pattern.map(slot => (
                                  <Badge key={slot} variant="outline" className="text-xs">
                                    {slot}
                                  </Badge>
                                ))}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary">Available</Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <div className="text-center py-12">
                      <BookOpen className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                      <p className="text-muted-foreground">Generate elective sections to view them here</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Preview Tab */}
          <TabsContent value="preview">
            <Card>
              <CardHeader>
                <CardTitle>System Preview</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="text-center p-4 border rounded-lg">
                      <div className="text-2xl font-bold text-primary mb-2">
                        {timetableGrid?.total_teaching_slots_per_day || 0}
                      </div>
                      <div className="text-sm text-muted-foreground">Teaching Slots Per Day</div>
                    </div>
                    <div className="text-center p-4 border rounded-lg">
                      <div className="text-2xl font-bold text-secondary mb-2">
                        {electiveSections.length}
                      </div>
                      <div className="text-sm text-muted-foreground">Elective Sections</div>
                    </div>
                    <div className="text-center p-4 border rounded-lg">
                      <div className="text-2xl font-bold text-accent mb-2">
                        {sampleData?.electives.length || 0}
                      </div>
                      <div className="text-sm text-muted-foreground">Available Electives</div>
                    </div>
                  </div>

                  <div className="p-4 bg-muted rounded-lg">
                    <h3 className="font-semibold mb-2">Next Steps:</h3>
                    <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                      <li>Configure core course schedules</li>
                      <li>Assign faculty to elective sections</li>
                      <li>Collect student preferences</li>
                      <li>Run optimization for student assignments</li>
                      <li>Generate final timetables</li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
