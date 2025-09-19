import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { Calendar, Clock, Users, BookOpen, MapPin, AlertTriangle, CheckCircle, XCircle, Plus, Wand2, TestTube2, Grid3X3, Search, Bot, BarChart3, Eye, Download, Trash2, Printer } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Timetable, TimetableSlot, Course, Faculty, Room } from "@shared/schema";
import { programs } from "@/lib/types";
import { TimetableGrid } from "@/components/timetable-grid";

export default function Timetables() {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterProgram, setFilterProgram] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [selectedTimetable, setSelectedTimetable] = useState<Timetable | null>(null);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isBaseGenerateDialogOpen, setIsBaseGenerateDialogOpen] = useState(false);
  const [isManualCreateDialogOpen, setIsManualCreateDialogOpen] = useState(false);
  const [baseGenerateForm, setBaseGenerateForm] = useState({
    program: "",
    semester: "",
    batch: "",
    academicYear: new Date().getFullYear().toString()
  });

  const autoAllocateMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("POST", `/api/timetables/${id}/auto-allocate`);
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err?.message || "Auto-allocation failed");
      }
      return response.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: "Auto Allocation Complete",
        description: `Updated ${data.updated} slot(s). Conflicts: ${Array.isArray(data.conflicts) ? data.conflicts.length : 0}`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/timetables"] });
      if (selectedTimetable?.id) {
        queryClient.invalidateQueries({ queryKey: [`/api/timetables/${selectedTimetable.id}/slots`] });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Auto Allocation Failed",
        description: error?.message || "Ensure slots are materialized before auto-allocating.",
        variant: "destructive",
      });
    },
  });
  const [manualCreateForm, setManualCreateForm] = useState({
    name: "",
    program: "",
    semester: "",
    batch: "",
    academicYear: new Date().getFullYear().toString()
  });

  const { data: timetables, isLoading } = useQuery<Timetable[]>({
    queryKey: ["/api/timetables"],
  });

  const { data: courses } = useQuery<Course[]>({
    queryKey: ["/api/courses"],
  });

  const { data: faculty } = useQuery<Faculty[]>({
    queryKey: ["/api/faculty"],
  });

  const { data: rooms } = useQuery<Room[]>({
    queryKey: ["/api/rooms"],
  });

  const { data: timetableSlots } = useQuery<TimetableSlot[]>({
    queryKey: [selectedTimetable?.id ? `/api/timetables/${selectedTimetable.id}/slots` : ""],
    enabled: !!selectedTimetable?.id,
  });

  const { data: timeSlotTemplates } = useQuery<any[]>({
    queryKey: ["/api/timeslot-templates"],
  });

  const deleteTimetableMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/timetables/${id}`);
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Timetable deleted successfully!",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/timetables"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete timetable",
        variant: "destructive",
      });
    },
  });

  const detectConflictsMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("POST", `/api/timetables/${id}/detect-conflicts`);
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Conflict Analysis Complete",
        description: `Found ${data.conflicts.length} potential conflicts`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/timetables"] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to detect conflicts",
        variant: "destructive",
      });
    },
  });

  const generateBaseTimetableMutation = useMutation({
    mutationFn: async (formData: typeof baseGenerateForm) => {
      const response = await apiRequest("POST", "/api/timetables/generate-base", formData);
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Success",
        description: "Base timetable generated successfully!",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/timetables"] });
      setIsBaseGenerateDialogOpen(false);
      setBaseGenerateForm({
        program: "",
        semester: "",
        batch: "",
        academicYear: new Date().getFullYear().toString()
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to generate base timetable",
        variant: "destructive",
      });
    },
  });

  const createManualTimetableMutation = useMutation({
    mutationFn: async (formData: typeof manualCreateForm) => {
      const timetableData = {
        name: formData.name,
        program: formData.program,
        semester: parseInt(formData.semester),
        batch: formData.batch,
        academicYear: formData.academicYear,
        status: "draft",
        generatedBy: "manual",
        slots: [],
        conflicts: [],
        optimizationScore: null,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      const response = await apiRequest("POST", "/api/timetables", timetableData);
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Success",
        description: "Manual timetable created successfully!",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/timetables"] });
      setIsManualCreateDialogOpen(false);
      setManualCreateForm({
        name: "",
        program: "",
        semester: "",
        batch: "",
        academicYear: new Date().getFullYear().toString()
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create manual timetable",
        variant: "destructive",
      });
    },
  });

  const filteredTimetables = timetables?.filter(timetable => {
    const matchesSearch = 
      timetable.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      timetable.program.toLowerCase().includes(searchTerm.toLowerCase()) ||
      timetable.batch.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesProgram = filterProgram === "all" || timetable.program === filterProgram;
    const matchesStatus = filterStatus === "all" || timetable.status === filterStatus;
    
    return matchesSearch && matchesProgram && matchesStatus;
  }) || [];

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-secondary/10 text-secondary border-secondary/20";
      case "draft":
        return "bg-yellow-100 text-yellow-800 border-yellow-200";
      case "archived":
        return "bg-muted text-muted-foreground border-muted";
      default:
        return "bg-muted text-muted-foreground border-muted";
    }
  };

  const handleViewTimetable = (timetable: Timetable) => {
    setSelectedTimetable(timetable);
    setIsViewDialogOpen(true);
  };

  const handleExportTimetable = async (timetable: Timetable) => {
    try {
      toast({
        title: "Export Started",
        description: `Exporting ${timetable.name}...`,
      });

      // Use the AI-generated timetable data directly
      const exportData = {
        timetable: {
          name: timetable.name,
          program: timetable.program,
          semester: timetable.semester,
          batch: timetable.batch,
          academicYear: timetable.academicYear,
          status: timetable.status,
          generatedBy: timetable.generatedBy,
          optimizationScore: timetable.optimizationScore,
          conflicts: timetable.conflicts || [],
          schedule: timetable.schedule // Include AI-generated schedule data
        },
        exportedAt: new Date().toISOString(),
        exportedBy: "System Administrator"
      };

      // Convert to CSV format for better usability
      const csvContent = convertTimetableToCSV(exportData);

      // Create and download the file
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${timetable.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_timetable_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: "Export Successful",
        description: `${timetable.name} has been exported successfully!`,
      });
    } catch (error) {
      toast({
        title: "Export Failed",
        description: "Failed to export timetable. Please try again.",
        variant: "destructive"
      });
    }
  };

  // Helper function to convert AI-generated timetable data to CSV format
  const convertTimetableToCSV = (data: any) => {
    const headers = ['Day', 'Time', 'Course Code', 'Course Name', 'Faculty', 'Room', 'Type', 'Slot ID'];
    const rows = [headers.join(',')];

    // Add timetable info header
    rows.push('');
    rows.push(`AI-Generated Timetable Information`);
    rows.push(`Name,${data.timetable.name}`);
    rows.push(`Program,${data.timetable.program}`);
    rows.push(`Semester,${data.timetable.semester}`);
    rows.push(`Batch,${data.timetable.batch}`);
    rows.push(`Academic Year,${data.timetable.academicYear}`);
    rows.push(`Status,${data.timetable.status}`);
    rows.push(`Generated By,${data.timetable.generatedBy || 'AI Engine'}`);
    rows.push(`Optimization Score,${data.timetable.optimizationScore || 'N/A'}%`);
    rows.push(`Conflicts,${Array.isArray(data.timetable.conflicts) ? data.timetable.conflicts.length : 0}`);
    rows.push('');
    rows.push('AI-Generated Schedule');
    rows.push(headers.join(','));

    // Use AI-generated slot mappings from the schedule
    const schedule = data.timetable.schedule;
    if (schedule && schedule.slotMappings && Array.isArray(schedule.slotMappings)) {
      schedule.slotMappings.forEach((mapping: any) => {
        const row = [
          mapping.dayOfWeek || '',
          `${mapping.startTime}-${mapping.endTime}`,
          mapping.courseCode || '',
          mapping.courseName || '',
          mapping.facultyName || 'TBA',
          mapping.roomNumber || 'TBA',
          mapping.slotType || 'theory',
          mapping.slotId || ''
        ];
        rows.push(row.map(cell => `"${cell}"`).join(','));
      });
    } else {
      rows.push('"No AI-generated slot mappings found"');
    }

    return rows.join('\n');
  };

  // Determine if a Base Timetable already exists (generatedBy === 'base-template')
  const baseTimetable: Timetable | null = (timetables || []).find(t => t.generatedBy === 'base-template') || null;
  const baseExists = !!baseTimetable;

  // Auto-select base timetable for inline details rendering
  useEffect(() => {
    if (!selectedTimetable && baseTimetable) {
      setSelectedTimetable(baseTimetable);
    }
  }, [baseTimetable, selectedTimetable]);

  return (
    <div className="flex-1 flex flex-col">
      {/* Header */}
      <header className="bg-card border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground" data-testid="page-title">Timetables</h1>
            <p className="text-sm text-muted-foreground">
              View, manage, and export generated timetables
            </p>
          </div>
          <div className="flex gap-2">
            <Button 
              onClick={() => {
                const testData = {
                  program: "CSE",
                  semester: "5",
                  batch: "2024-2028",
                  academicYear: "2024"
                };
                generateBaseTimetableMutation.mutate(testData);
              }}
              variant="default"
              data-testid="button-test-generate"
              disabled={baseExists || generateBaseTimetableMutation.isPending}
              title={baseExists ? "Base timetable already exists. Delete it to generate a new one." : undefined}
            >
              <Clock className="w-4 h-4 mr-2" />
              Test Generate
            </Button>
            <Button 
              onClick={() => setIsBaseGenerateDialogOpen(true)}
              variant="outline"
              data-testid="button-generate-base-timetable"
              disabled={baseExists}
              title={baseExists ? "Base timetable already exists. Delete it to generate a new one." : undefined}
            >
              <Clock className="w-4 h-4 mr-2" />
              Generate Base Timetable
            </Button>
            <Button 
              onClick={() => setIsManualCreateDialogOpen(true)}
              data-testid="button-create-timetable"
            >
              <Plus className="w-4 h-4 mr-2" />
              Create Manual Timetable
            </Button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 p-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                Timetable Management
              </CardTitle>
              <div className="flex items-center space-x-2">
                <Select value={filterProgram} onValueChange={setFilterProgram}>
                  <SelectTrigger className="w-32" data-testid="filter-program">
                    <SelectValue placeholder="Program" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Programs</SelectItem>
                    {programs.map(program => (
                      <SelectItem key={program.value} value={program.value}>
                        {program.value}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-32" data-testid="filter-status">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </SelectContent>
                </Select>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                  <Input
                    placeholder="Search timetables..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 w-64"
                    data-testid="input-search-timetables"
                  />
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="animate-pulse flex space-x-4">
                    <div className="rounded-full bg-muted h-10 w-10"></div>
                    <div className="flex-1 space-y-2 py-1">
                      <div className="h-4 bg-muted rounded w-3/4"></div>
                      <div className="h-4 bg-muted rounded w-1/2"></div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Program</TableHead>
                    <TableHead>Semester</TableHead>
                    <TableHead>Batch</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Generated By</TableHead>
                    <TableHead>Optimization Score</TableHead>
                    <TableHead>Conflicts</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTimetables.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                        {searchTerm || filterProgram !== "all" || filterStatus !== "all" ? 
                          "No timetables found matching your filters." : 
                          "No timetables found. Use the AI Generator to create your first timetable."
                        }
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredTimetables.map((timetable) => (
                      <TableRow key={timetable.id} data-testid={`timetable-row-${timetable.id}`}>
                        <TableCell>
                          <div>
                            <div className="font-medium">{timetable.name}</div>
                            <div className="text-sm text-muted-foreground">
                              {timetable.academicYear}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{timetable.program}</TableCell>
                        <TableCell>Sem {timetable.semester}</TableCell>
                        <TableCell>{timetable.batch}</TableCell>
                        <TableCell>
                          <Badge 
                            className={getStatusColor(timetable.status || "draft")}
                            variant="outline"
                          >
                            {timetable.status || "draft"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {timetable.generatedBy === "AI" ? (
                              <>
                                <Bot className="w-4 h-4 text-primary" />
                                <span className="text-sm">AI Generated</span>
                              </>
                            ) : (
                              <span className="text-sm">Manual</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {timetable.optimizationScore ? (
                            <div className="flex items-center gap-1">
                              <BarChart3 className="w-4 h-4 text-secondary" />
                              <span className="text-sm font-medium">{timetable.optimizationScore}%</span>
                            </div>
                          ) : (
                            <span className="text-sm text-muted-foreground">N/A</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="text-sm">
                              {Array.isArray(timetable.conflicts) ? timetable.conflicts.length : 0}
                            </span>
                            {Array.isArray(timetable.conflicts) && timetable.conflicts.length > 0 && (
                              <Badge variant="destructive" className="text-xs">
                                Issues
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center space-x-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleViewTimetable(timetable)}
                              data-testid={`button-view-timetable-${timetable.id}`}
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => detectConflictsMutation.mutate(timetable.id)}
                              disabled={detectConflictsMutation.isPending}
                              data-testid={`button-analyze-timetable-${timetable.id}`}
                            >
                              <BarChart3 className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => autoAllocateMutation.mutate(timetable.id)}
                              disabled={autoAllocateMutation.isPending}
                              title="Auto-assign rooms and faculty to existing slots"
                              data-testid={`button-auto-allocate-${timetable.id}`}
                            >
                              <Wand2 className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleExportTimetable(timetable)}
                              data-testid={`button-export-timetable-${timetable.id}`}
                            >
                              <Download className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => deleteTimetableMutation.mutate(timetable.id)}
                              disabled={deleteTimetableMutation.isPending}
                              data-testid={`button-delete-timetable-${timetable.id}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Manual Timetable Creation Dialog */}
        <Dialog open={isManualCreateDialogOpen} onOpenChange={setIsManualCreateDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Create Manual Timetable</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Timetable Name</label>
                <Input
                  value={manualCreateForm.name}
                  onChange={(e) => setManualCreateForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., CSE Semester 5 - 2024"
                />
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium">Program</label>
                <Select 
                  value={manualCreateForm.program} 
                  onValueChange={(value) => setManualCreateForm(prev => ({ ...prev, program: value }))}
                >
                  <SelectTrigger>
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
              
              <div className="space-y-2">
                <label className="text-sm font-medium">Semester</label>
                <Select 
                  value={manualCreateForm.semester} 
                  onValueChange={(value) => setManualCreateForm(prev => ({ ...prev, semester: value }))}
                >
                  <SelectTrigger>
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
              
              <div className="space-y-2">
                <label className="text-sm font-medium">Batch</label>
                <Input
                  value={manualCreateForm.batch}
                  onChange={(e) => setManualCreateForm(prev => ({ ...prev, batch: e.target.value }))}
                  placeholder="e.g., 2024-2028"
                />
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium">Academic Year</label>
                <Input
                  value={manualCreateForm.academicYear}
                  onChange={(e) => setManualCreateForm(prev => ({ ...prev, academicYear: e.target.value }))}
                  placeholder="e.g., 2024"
                />
              </div>
              
              <div className="flex justify-end space-x-2 pt-4">
                <Button 
                  variant="outline" 
                  onClick={() => setIsManualCreateDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button 
                  onClick={() => createManualTimetableMutation.mutate(manualCreateForm)}
                  disabled={createManualTimetableMutation.isPending || !manualCreateForm.name || !manualCreateForm.program || !manualCreateForm.semester || !manualCreateForm.batch}
                >
                  {createManualTimetableMutation.isPending ? "Creating..." : "Create Timetable"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Base Timetable Generation Dialog */}
        <Dialog open={isBaseGenerateDialogOpen} onOpenChange={setIsBaseGenerateDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Generate Base Timetable</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Program</label>
                <Select 
                  value={baseGenerateForm.program} 
                  onValueChange={(value) => setBaseGenerateForm(prev => ({ ...prev, program: value }))}
                >
                  <SelectTrigger>
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
                <p className="text-xs text-muted-foreground">Optional. Leave blank to generate a college-wide base mapping.</p>
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium">Semester</label>
                <Select 
                  value={baseGenerateForm.semester} 
                  onValueChange={(value) => setBaseGenerateForm(prev => ({ ...prev, semester: value }))}
                >
                  <SelectTrigger>
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
                <p className="text-xs text-muted-foreground">Optional. Leave blank for all semesters.</p>
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium">Batch</label>
                <Input
                  value={baseGenerateForm.batch}
                  onChange={(e) => setBaseGenerateForm(prev => ({ ...prev, batch: e.target.value }))}
                  placeholder="e.g., 2024-2028"
                />
                <p className="text-xs text-muted-foreground">Optional. Leave blank for all batches.</p>
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium">Academic Year</label>
                <Input
                  value={baseGenerateForm.academicYear}
                  onChange={(e) => setBaseGenerateForm(prev => ({ ...prev, academicYear: e.target.value }))}
                  placeholder="e.g., 2024"
                />
              </div>
              
              <div className="flex justify-end space-x-2 pt-4">
                <Button 
                  variant="outline" 
                  onClick={() => setIsBaseGenerateDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button 
                  onClick={() => generateBaseTimetableMutation.mutate(baseGenerateForm)}
                  disabled={generateBaseTimetableMutation.isPending || baseExists}
                >
                  {generateBaseTimetableMutation.isPending ? "Generating..." : "Generate Base Timetable"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Timetable View Dialog */}
        <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
          <DialogContent className="max-w-7xl max-h-[90vh] overflow-auto">
            <DialogHeader>
              <DialogTitle>
                {selectedTimetable?.name} - Detailed View
              </DialogTitle>
            </DialogHeader>
            {selectedTimetable && ( 
              <Tabs defaultValue="overview" className="space-y-4">
                <TabsList>
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="schedule">Schedule</TabsTrigger>
                  <TabsTrigger value="template">Classes</TabsTrigger>
                  {Array.isArray(selectedTimetable.conflicts) && selectedTimetable.conflicts.length > 0 && (
                    <TabsTrigger value="conflicts">
                      <div className="flex items-center gap-2">
                        <span>Conflicts</span>
                        <Badge variant="destructive" className="h-5 w-5 p-0 flex items-center justify-center">
                          {selectedTimetable.conflicts.length}
                        </Badge>
                      </div>
                    </TabsTrigger>
                  )}
                </TabsList>

                {/* Overview Tab */}
                <TabsContent value="overview" className="space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle>Timetable Information</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        <div className="space-y-1">
                          <p className="text-sm font-medium">Program</p>
                          <p className="text-sm text-muted-foreground">{selectedTimetable.program}</p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-sm font-medium">Semester</p>
                          <p className="text-sm text-muted-foreground">Semester {selectedTimetable.semester}</p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-sm font-medium">Batch</p>
                          <p className="text-sm text-muted-foreground">{selectedTimetable.batch}</p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-sm font-medium">Academic Year</p>
                          <p className="text-sm text-muted-foreground">{selectedTimetable.academicYear}</p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-sm font-medium">Status</p>
                          <Badge variant={selectedTimetable.status === 'DRAFT' ? 'outline' : 'default'}>
                            {selectedTimetable.status}
                          </Badge>
                        </div>
                        <div className="space-y-1">
                          <p className="text-sm font-medium">Created</p>
                          <p className="text-sm text-muted-foreground">
                            {new Date(selectedTimetable.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <BarChart3 className="w-5 h-5" />
                        AI-Generated Schedule Statistics
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {(() => {
                          const schedule = selectedTimetable.schedule as any;
                          const slotMappings = schedule?.slotMappings || [];
                          const timeSlots = schedule?.timeSlots || [];
                          
                          const uniqueCourses = new Set(slotMappings.map((m: any) => m.courseId)).size;
                          const uniqueFaculty = new Set(slotMappings.map((m: any) => m.facultyId)).size;
                          const uniqueRooms = new Set(slotMappings.map((m: any) => m.roomId)).size;
                          
                          return (
                            <>
                              <div className="p-4 bg-primary/10 rounded-lg text-center">
                                <p className="text-2xl font-bold text-primary">{slotMappings.length}</p>
                                <p className="text-sm text-muted-foreground">AI-Scheduled Slots</p>
                              </div>
                              <div className="p-4 bg-secondary/10 rounded-lg text-center">
                                <p className="text-2xl font-bold text-secondary">{uniqueCourses}</p>
                                <p className="text-sm text-muted-foreground">Unique Courses</p>
                              </div>
                              <div className="p-4 bg-accent/10 rounded-lg text-center">
                                <p className="text-2xl font-bold text-accent">{uniqueFaculty}</p>
                                <p className="text-sm text-muted-foreground">Faculty Assigned</p>
                              </div>
                              <div className="p-4 bg-green-100 rounded-lg text-center">
                                <p className="text-2xl font-bold text-green-600">{uniqueRooms}</p>
                                <p className="text-sm text-muted-foreground">Rooms Utilized</p>
                              </div>
                            </>
                          );
                        })()}
                      </div>
                      
                      {/* Additional AI Engine Stats */}
                      <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="p-4 border rounded-lg">
                          <div className="flex items-center gap-2 mb-2">
                            <Bot className="w-4 h-4 text-primary" />
                            <span className="text-sm font-medium">AI Engine</span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Generated by: {selectedTimetable.generatedBy || 'Auto-Generator'}
                          </p>
                        </div>
                        <div className="p-4 border rounded-lg">
                          <div className="flex items-center gap-2 mb-2">
                            <CheckCircle className="w-4 h-4 text-green-600" />
                            <span className="text-sm font-medium">Optimization Score</span>
                          </div>
                          <p className="text-lg font-bold text-green-600">
                            {selectedTimetable.optimizationScore || 0}%
                          </p>
                        </div>
                        <div className="p-4 border rounded-lg">
                          <div className="flex items-center gap-2 mb-2">
                            <AlertTriangle className="w-4 h-4 text-orange-600" />
                            <span className="text-sm font-medium">Conflicts</span>
                          </div>
                          <p className="text-lg font-bold text-orange-600">
                            {Array.isArray(selectedTimetable.conflicts) ? selectedTimetable.conflicts.length : 0}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* Schedule Tab */}
                <TabsContent value="schedule" className="space-y-6">
                  {/* Matrix View: Weekdays as rows, Time columns */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Clock className="w-5 h-5 text-primary" />
                        Weekly Schedule (Matrix)
                      </CardTitle>
                      <CardDescription>
                        Weekdays as rows and time ranges as columns. Lunch is highlighted; grace time is applied between slots.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {(() => {
                        // Parse schedule defensively (it may be a JSON string)
                        let schedule: any = selectedTimetable?.schedule as any;
                        if (schedule && typeof schedule === 'string') {
                          try { schedule = JSON.parse(schedule); } catch {}
                        }
                        const timeSlots = Array.isArray(schedule?.timeSlots) ? schedule.timeSlots : [];
                        const slotMappings = Array.isArray(schedule?.slotMappings) ? schedule.slotMappings : [];
                        const lunchBreak = schedule?.lunchBreak || null;

                        // Collect unique days and sorted unique time ranges (HH:MM-HH:MM)
                        const days: string[] = Array.from(new Set<string>(timeSlots.map((s: any) => String(s.dayOfWeek))));
                        const toMin = (t: string) => { const [h,m] = t.split(":").map(Number); return h*60+m; };
                        const timeRangesSet = new Map<string, { start: string; end: string; startMin: number }>();
                        timeSlots.forEach((s: any) => {
                          const key = `${s.startTime}-${s.endTime}`;
                          timeRangesSet.set(key, { start: s.startTime, end: s.endTime, startMin: toMin(s.startTime) });
                        });
                        // Determine where to insert Lunch column chronologically
                        let lunchPos: number | null = null;
                        if (lunchBreak?.startTime && lunchBreak?.endTime) {
                          const lunchStartMin = toMin(lunchBreak.startTime);
                          const entries = Array.from(timeRangesSet.values()).sort((a,b) => a.startMin - b.startMin);
                          const idx = entries.findIndex(e => e.startMin >= lunchStartMin);
                          lunchPos = idx === -1 ? entries.length : idx;
                        }
                        const timeRanges: { start: string; end: string; startMin: number }[] =
                          Array.from(timeRangesSet.values()).sort((a,b) => a.startMin - b.startMin);

                        // Helper to find mapping for a cell
                        const findMapping = (day: string, start: string, end: string) => {
                          return slotMappings.find((m: any) => m.dayOfWeek === day && m.startTime === start && m.endTime === end);
                        };

                        if (days.length === 0 || timeRanges.length === 0) {
                          return (
                            <div className="text-center py-8 text-muted-foreground">
                              No schedule found. Generate slot-time mappings first.
                            </div>
                          );
                        }

                        return (
                          <div className="overflow-x-auto">
                            <table className="w-full border-collapse border border-border text-sm">
                              <thead>
                                <tr className="bg-muted">
                                  <th className="border border-border px-3 py-2 text-left">Day</th>
                                  {(() => {
                                    const cells: JSX.Element[] = [];
                                    timeRanges.forEach((tr, idx) => {
                                      if (lunchPos !== null && idx === lunchPos) {
                                        cells.push(
                                          <th key={`lunch-col`} className="border border-border px-3 py-2 text-left">Lunch</th>
                                        );
                                      }
                                      cells.push(
                                        <th key={`${tr.start}-${tr.end}-${idx}`} className="border border-border px-3 py-2 text-left font-mono">
                                          {tr.start} - {tr.end}
                                        </th>
                                      );
                                    });
                                    if (lunchPos !== null && lunchPos === timeRanges.length) {
                                      cells.push(
                                        <th key={`lunch-col-end`} className="border border-border px-3 py-2 text-left">Lunch</th>
                                      );
                                    }
                                    return cells;
                                  })()}
                                </tr>
                              </thead>
                              <tbody>
                                {days.map((day: string) => (
                                  <tr key={day}>
                                    <td className="border border-border px-3 py-2 font-medium">{day}</td>
                                    {timeRanges.map((tr, idx) => {
                                      // Derive a simple slot label like A1, B2 based on day and column index
                                      const dayLetterMap: Record<string, string> = {
                                        Monday: 'A', Tuesday: 'B', Wednesday: 'C', Thursday: 'D', Friday: 'E', Saturday: 'F', Sunday: 'G'
                                      };
                                      const dayLetter = dayLetterMap[day] || (day?.[0]?.toUpperCase() || 'X');
                                      const label = `${dayLetter}${idx + 1}`;
                                      // Show label only if a time slot exists for this day/time
                                      const hasSlot = timeSlots.some((s: any) => s.dayOfWeek === day && s.startTime === tr.start && s.endTime === tr.end);
                                      return (
                                        <>
                                          {lunchPos !== null && idx === lunchPos && (
                                            <td key={`${day}-lunch`} className="border border-border px-3 py-2 bg-orange-50 text-orange-700 text-sm">
                                              Lunch Break
                                            </td>
                                          )}
                                          <td key={`${day}-${tr.start}-${tr.end}-${idx}`} className="border border-border px-3 py-2 align-top">
                                            {hasSlot ? (
                                              <Badge variant="outline" className="font-mono">{label}</Badge>
                                            ) : (
                                              <span className="text-muted-foreground">—</span>
                                            )}
                                          </td>
                                        </>
                                      );
                                    })}
                                    {lunchPos !== null && lunchPos === timeRanges.length && (
                                      <td key={`${day}-lunch-end`} className="border border-border px-3 py-2 bg-orange-50 text-orange-700 text-sm">
                                        Lunch Break
                                      </td>
                                    )}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        );
                      })()}
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* Classes Tab (replacing Template): list all allocated classes */}
                <TabsContent value="template">
                  <Card>
                    <CardHeader>
                      <CardTitle>Allocated Classes</CardTitle>
                      <CardDescription>
                        Course, day/time, faculty, room, and type for this timetable
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {(() => {
                        // Ensure schedule is an object (it might be a JSON string)
                        let schedule: any = selectedTimetable?.schedule as any;
                        if (schedule && typeof schedule === 'string') {
                          try {
                            schedule = JSON.parse(schedule);
                          } catch (e) {
                            console.warn('Failed to parse timetable.schedule JSON string', e);
                          }
                        }
                        const mappings: any[] = Array.isArray(schedule?.slotMappings) ? schedule.slotMappings : [];
                        const useSlots = Array.isArray(timetableSlots) && timetableSlots.length > 0;

                        if (!useSlots && mappings.length === 0) {
                          return (
                            <div className="text-center py-8 text-muted-foreground">
                              No classes found for this timetable. Please run classroom allocation.
                            </div>
                          );
                        }

                        return (
                          <div className="overflow-x-auto">
                            <table className="w-full border-collapse border border-border text-sm">
                              <thead>
                                <tr className="bg-muted">
                                  <th className="border border-border px-4 py-2 text-left">Class ID</th>
                                  <th className="border border-border px-4 py-2 text-left">Day</th>
                                  <th className="border border-border px-4 py-2 text-left">Time</th>
                                  <th className="border border-border px-4 py-2 text-left">Course</th>
                                  <th className="border border-border px-4 py-2 text-left">Faculty</th>
                                  <th className="border border-border px-4 py-2 text-left">Faculty ID</th>
                                  <th className="border border-border px-4 py-2 text-left">Room</th>
                                  <th className="border border-border px-4 py-2 text-left">Strength</th>
                                  <th className="border border-border px-4 py-2 text-left">Type</th>
                                </tr>
                              </thead>
                              <tbody>
                                {useSlots ? (
                                  timetableSlots.map((slot) => {
                                  // Prefer enriched fields from backend
                                  const enrichedCourseCode = (slot as any).courseCode as string | undefined;
                                  const enrichedCourseName = (slot as any).courseName as string | undefined;
                                  const enrichedFacultyName = (slot as any).facultyName as string | undefined;
                                  const enrichedRoomNumber = (slot as any).roomNumber as string | undefined;
                                  const classStrength = (slot as any).classStrength as number | undefined;
                                  // Primary lookup by IDs from master datasets
                                  let course = courses?.find(c => c.id === slot.courseId);
                                  let fac = faculty?.find(f => f.id === slot.facultyId);
                                  let room = rooms?.find(r => r.id === slot.roomId);

                                // Fallback: try to resolve from AI-generated schedule.slotMappings by matching courseId first, else by day/time
                                if ((!course || !fac || !room) && selectedTimetable?.schedule && typeof selectedTimetable.schedule === 'object') {
                                  const schedule: any = selectedTimetable.schedule;
                                  const mapping = Array.isArray(schedule.slotMappings)
                                    ? (schedule.slotMappings.find((m: any) => m.courseId === slot.courseId) ||
                                       schedule.slotMappings.find((m: any) =>
                                          m.dayOfWeek === slot.dayOfWeek &&
                                          m.startTime === slot.startTime &&
                                          m.endTime === slot.endTime))
                                    : null;
                                  if (mapping) {
                                    // Synthesize minimal objects for display if masters are unavailable
                                    if (!course && (mapping.courseCode || mapping.courseName)) {
                                      course = {
                                        id: slot.courseId,
                                        courseCode: mapping.courseCode ?? '—',
                                        courseName: mapping.courseName ?? 'Unknown Course',
                                      } as any;
                                    }
                                    if (!fac && mapping.facultyName) {
                                      const parts = String(mapping.facultyName).split(' ');
                                      const firstName = parts.slice(0, -1).join(' ') || mapping.facultyName;
                                      const lastName = parts.slice(-1).join(' ') || '';
                                      fac = { id: slot.facultyId, firstName, lastName } as any;
                                    }
                                    if (!room && mapping.roomNumber) {
                                      room = { id: slot.roomId, roomNumber: mapping.roomNumber } as any;
                                    }
                                  }
                                }

                                return (
                                  <tr key={slot.id} className="odd:bg-muted/30">
                                    <td className="border border-border px-4 py-2 font-mono">{slot.id}</td>
                                    <td className="border border-border px-4 py-2">{slot.dayOfWeek}</td>
                                    <td className="border border-border px-4 py-2">{slot.startTime} - {slot.endTime}</td>
                                    <td className="border border-border px-4 py-2">
                                      <div className="flex items-center gap-2">
                                        <Badge variant="outline">{enrichedCourseCode || course?.courseCode || '—'}</Badge>
                                        <span className="font-medium">{enrichedCourseName || course?.courseName || 'Unknown Course'}</span>
                                      </div>
                                    </td>
                                    <td className="border border-border px-4 py-2">{enrichedFacultyName || (fac ? `${fac.firstName} ${fac.lastName}` : 'TBA')}</td>
                                    <td className="border border-border px-4 py-2">{fac?.facultyId || '—'}</td>
                                    <td className="border border-border px-4 py-2">{enrichedRoomNumber || (room?.roomNumber || 'TBA')}</td>
                                    <td className="border border-border px-4 py-2">{typeof classStrength === 'number' ? classStrength : '—'}</td>
                                    <td className="border border-border px-4 py-2">
                                      <Badge variant={slot.slotType === 'lab' ? 'destructive' : 'secondary'}>
                                        {slot.slotType || 'theory'}
                                      </Badge>
                                    </td>
                                  </tr>
                                );
                              })
                                ) : (
                                  mappings.map((m: any, index: number) => (
                                    <tr key={`${m.dayOfWeek}-${m.startTime}-${m.courseId || m.courseCode}-${index}`} className="odd:bg-muted/30">
                                      <td className="border border-border px-4 py-2">—</td>
                                      <td className="border border-border px-4 py-2">{m.dayOfWeek}</td>
                                      <td className="border border-border px-4 py-2">{m.startTime} - {m.endTime}</td>
                                      <td className="border border-border px-4 py-2">
                                        <div className="flex items-center gap-2">
                                          <Badge variant="outline">{m.courseCode || '—'}</Badge>
                                          <span className="font-medium">{m.courseName || 'Unknown Course'}</span>
                                        </div>
                                      </td>
                                      <td className="border border-border px-4 py-2">{m.facultyName || 'TBA'}</td>
                                      <td className="border border-border px-4 py-2">—</td>
                                      <td className="border border-border px-4 py-2">{m.roomNumber || 'TBA'}</td>
                                      <td className="border border-border px-4 py-2">—</td>
                                      <td className="border border-border px-4 py-2">
                                        <Badge variant={m.slotType === 'lab' ? 'destructive' : 'secondary'}>
                                          {m.slotType || 'theory'}
                                        </Badge>
                                      </td>
                                    </tr>
                                  ))
                                )}
                              </tbody>
                            </table>
                          </div>
                        );
                      })()}
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* Conflicts Tab */}
                {Array.isArray(selectedTimetable.conflicts) && selectedTimetable.conflicts.length > 0 && (
                  <TabsContent value="conflicts">
                    <Card>
                      <CardHeader>
                        <CardTitle>Detected Conflicts</CardTitle>
                        <CardDescription>
                          The following conflicts were detected in this timetable. Please review and resolve them.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {selectedTimetable.conflicts.map((conflict: any, index: number) => (
                          <div key={index} className="p-4 border rounded-lg bg-destructive/5">
                            <div className="flex justify-between items-start">
                              <div>
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="font-medium">{conflict.type}</span>
                                  <Badge variant="destructive" className="text-xs">
                                    {conflict.severity}
                                  </Badge>
                                </div>
                                <p className="text-sm text-muted-foreground">{conflict.description}</p>
                              </div>
                              {conflict.slotIds && conflict.slotIds.length > 0 && (
                                <Button variant="outline" size="sm">
                                  View Slots
                                </Button>
                              )}
                            </div>
                            {conflict.suggestions && (
                              <div className="mt-3 pt-3 border-t">
                                <p className="text-sm font-medium mb-1">Suggestions:</p>
                                <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1">
                                  {Array.isArray(conflict.suggestions) ? (
                                    conflict.suggestions.map((suggestion: string, i: number) => (
                                      <li key={i}>{suggestion}</li>
                                    ))
                                  ) : (
                                    <li>{conflict.suggestions}</li>
                                  )}
                                </ul>
                              </div>
                            )}
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  </TabsContent>
                )}
              </Tabs>
            )}
          </DialogContent>
        </Dialog>

        {/* Inline Base Timetable Details (always visible when a base exists) */}
        {baseTimetable && (
          <Card className="mt-6" data-testid="inline-base-details">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="w-5 h-5" />
                  Base Timetable Details (Fixed until deleted)
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => window.print()}>
                    <Printer className="w-4 h-4 mr-2" /> Print
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div>
                  <p className="text-sm text-muted-foreground">Name</p>
                  <p className="font-medium">{baseTimetable.name}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Academic Year</p>
                  <p className="font-medium">{baseTimetable.academicYear}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <Badge className="mt-1" variant="outline">{baseTimetable.status}</Badge>
                </div>
              </div>

              {/* Classes table inline for base timetable */}
              {(() => {
                if (!selectedTimetable || selectedTimetable.id !== baseTimetable.id) {
                  return <div className="text-sm text-muted-foreground">Loading base timetable classes...</div>;
                }
                const useSlots = Array.isArray(timetableSlots) && timetableSlots.length > 0;
                // Ensure schedule is object for fallback mapping
                let schedule: any = selectedTimetable?.schedule as any;
                if (schedule && typeof schedule === 'string') {
                  try { schedule = JSON.parse(schedule); } catch {}
                }
                const mappings: any[] = Array.isArray(schedule?.slotMappings) ? schedule.slotMappings : [];

                if (!useSlots && mappings.length === 0) {
                  return (
                    <div className="text-center py-8 text-muted-foreground">
                      No classes found for this base timetable.
                    </div>
                  );
                }

                return (
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse border border-border text-sm">
                      <thead>
                        <tr className="bg-muted">
                          <th className="border border-border px-4 py-2 text-left">Class ID</th>
                          <th className="border border-border px-4 py-2 text-left">Day</th>
                          <th className="border border-border px-4 py-2 text-left">Time</th>
                          <th className="border border-border px-4 py-2 text-left">Course</th>
                          <th className="border border-border px-4 py-2 text-left">Faculty</th>
                          <th className="border border-border px-4 py-2 text-left">Faculty ID</th>
                          <th className="border border-border px-4 py-2 text-left">Room</th>
                          <th className="border border-border px-4 py-2 text-left">Strength</th>
                          <th className="border border-border px-4 py-2 text-left">Type</th>
                        </tr>
                      </thead>
                      <tbody>
                        {useSlots ? (
                          timetableSlots.map((slot) => {
                            const enrichedFacultyName = (slot as any).facultyName as string | undefined;
                            const enrichedRoomNumber = (slot as any).roomNumber as string | undefined;
                            const enrichedCourseCode = (slot as any).courseCode as string | undefined;
                            const enrichedCourseName = (slot as any).courseName as string | undefined;
                            const classStrength = (slot as any).classStrength as number | undefined;
                            const fac = faculty?.find(f => f.id === slot.facultyId);
                            return (
                              <tr key={slot.id} className="odd:bg-muted/30">
                                <td className="border border-border px-4 py-2 font-mono">{slot.id}</td>
                                <td className="border border-border px-4 py-2">{slot.dayOfWeek}</td>
                                <td className="border border-border px-4 py-2">{slot.startTime} - {slot.endTime}</td>
                                <td className="border border-border px-4 py-2">
                                  <div className="flex items-center gap-2">
                                    <Badge variant="outline">{enrichedCourseCode || '—'}</Badge>
                                    <span className="font-medium">{enrichedCourseName || 'Unknown Course'}</span>
                                  </div>
                                </td>
                                <td className="border border-border px-4 py-2">{enrichedFacultyName || (fac ? `${fac.firstName} ${fac.lastName}` : 'TBA')}</td>
                                <td className="border border-border px-4 py-2">{fac?.facultyId || '—'}</td>
                                <td className="border border-border px-4 py-2">{enrichedRoomNumber || 'TBA'}</td>
                                <td className="border border-border px-4 py-2">{typeof classStrength === 'number' ? classStrength : '—'}</td>
                                <td className="border border-border px-4 py-2">
                                  <Badge variant={slot.slotType === 'lab' ? 'destructive' : 'secondary'}>
                                    {slot.slotType || 'theory'}
                                  </Badge>
                                </td>
                              </tr>
                            );
                          })
                        ) : (
                          mappings.map((m: any, index: number) => (
                            <tr key={`${m.dayOfWeek}-${m.startTime}-${index}`} className="odd:bg-muted/30">
                              <td className="border border-border px-4 py-2">—</td>
                              <td className="border border-border px-4 py-2">{m.dayOfWeek}</td>
                              <td className="border border-border px-4 py-2">{m.startTime} - {m.endTime}</td>
                              <td className="border border-border px-4 py-2">
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline">{m.courseCode || '—'}</Badge>
                                  <span className="font-medium">{m.courseName || 'Unknown Course'}</span>
                                </div>
                              </td>
                              <td className="border border-border px-4 py-2">{m.facultyName || 'TBA'}</td>
                              <td className="border border-border px-4 py-2">—</td>
                              <td className="border border-border px-4 py-2">{m.roomNumber || 'TBA'}</td>
                              <td className="border border-border px-4 py-2">—</td>
                              <td className="border border-border px-4 py-2">
                                <Badge variant={m.slotType === 'lab' ? 'destructive' : 'secondary'}>
                                  {m.slotType || 'theory'}
                                </Badge>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
