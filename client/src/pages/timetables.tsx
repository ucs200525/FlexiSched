import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { TimetableGrid } from "@/components/timetable-grid";
import { Plus, Search, Edit, Trash2, Calendar, Download, Eye, BarChart3, Bot, Clock } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Timetable, TimetableSlot, Course, Faculty, Room } from "@shared/schema";
import { programs } from "@/lib/types";

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
    queryKey: ["/api/timetables", selectedTimetable?.id, "slots"],
    enabled: !!selectedTimetable?.id,
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

      // Get timetable slots for this timetable
      const slotsResponse = await fetch(`/api/timetables/${timetable.id}/slots`);
      const slots = slotsResponse.ok ? await slotsResponse.json() : [];

      // Create comprehensive export data
      const exportData = {
        timetable: {
          name: timetable.name,
          program: timetable.program,
          semester: timetable.semester,
          batch: timetable.batch,
          academicYear: timetable.academicYear,
          status: timetable.status,
          optimizationScore: timetable.optimizationScore,
          conflicts: timetable.conflicts || []
        },
        slots: slots,
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

  // Helper function to convert timetable data to CSV format
  const convertTimetableToCSV = (data: any) => {
    const headers = ['Day', 'Time', 'Course Code', 'Course Name', 'Faculty', 'Room', 'Type'];
    const rows = [headers.join(',')];

    const timeSlots = ['09:00-10:00', '10:00-11:00', '11:15-12:15', '12:15-13:15', '13:15-14:15', '14:15-15:15', '15:15-16:15'];
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

    // Add timetable info header
    rows.push('');
    rows.push(`Timetable Information`);
    rows.push(`Name,${data.timetable.name}`);
    rows.push(`Program,${data.timetable.program}`);
    rows.push(`Semester,${data.timetable.semester}`);
    rows.push(`Batch,${data.timetable.batch}`);
    rows.push(`Academic Year,${data.timetable.academicYear}`);
    rows.push(`Status,${data.timetable.status}`);
    rows.push(`Optimization Score,${data.timetable.optimizationScore || 'N/A'}%`);
    rows.push('');
    rows.push('Schedule');
    rows.push(headers.join(','));

    // Create a grid for easier processing
    const timeMapping: { [key: string]: string } = {
      '09:00': '09:00-10:00',
      '10:00': '10:00-11:00',
      '11:15': '11:15-12:15',
      '12:15': '12:15-13:15',
      '13:15': '13:15-14:15',
      '14:15': '14:15-15:15',
      '15:15': '15:15-16:15'
    };

    if (Array.isArray(data.slots)) {
      data.slots.forEach((slot: any) => {
        const timeSlot = timeMapping[slot.startTime] || slot.startTime;
        const row = [
          slot.dayOfWeek || '',
          timeSlot,
          slot.courseCode || '',
          slot.courseName || '',
          slot.facultyName || '',
          slot.roomName || '',
          slot.courseType || ''
        ];
        rows.push(row.map(cell => `"${cell}"`).join(','));
      });
    }

    return rows.join('\n');
  };

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
            >
              <Clock className="w-4 h-4 mr-2" />
              Test Generate
            </Button>
            <Button 
              onClick={() => setIsBaseGenerateDialogOpen(true)}
              variant="outline"
              data-testid="button-generate-base-timetable"
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
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium">Batch</label>
                <Input
                  value={baseGenerateForm.batch}
                  onChange={(e) => setBaseGenerateForm(prev => ({ ...prev, batch: e.target.value }))}
                  placeholder="e.g., 2024-2028"
                />
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
                  disabled={generateBaseTimetableMutation.isPending || !baseGenerateForm.program || !baseGenerateForm.semester || !baseGenerateForm.batch}
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
            {selectedTimetable && timetableSlots && courses && faculty && rooms && (
              <div className="space-y-4">
                {/* Timetable Info */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 bg-muted/50 rounded-lg">
                  <div>
                    <div className="text-sm font-medium">Program</div>
                    <div className="text-sm text-muted-foreground">{selectedTimetable.program}</div>
                  </div>
                  <div>
                    <div className="text-sm font-medium">Semester</div>
                    <div className="text-sm text-muted-foreground">Semester {selectedTimetable.semester}</div>
                  </div>
                  <div>
                    <div className="text-sm font-medium">Batch</div>
                    <div className="text-sm text-muted-foreground">{selectedTimetable.batch}</div>
                  </div>
                  <div>
                    <div className="text-sm font-medium">Academic Year</div>
                    <div className="text-sm text-muted-foreground">{selectedTimetable.academicYear}</div>
                  </div>
                </div>

                {/* Timetable Grid */}
                <TimetableGrid
                  slots={timetableSlots}
                  courses={courses}
                  faculty={faculty}
                  rooms={rooms}
                  editable={false}
                />

                {/* Conflicts */}
                {Array.isArray(selectedTimetable.conflicts) && selectedTimetable.conflicts.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Detected Conflicts</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {selectedTimetable.conflicts.map((conflict: any, index: number) => (
                        <div key={index} className="p-3 bg-destructive/10 border border-destructive/20 rounded-md">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-medium">{conflict.type}</span>
                            <Badge variant="destructive" className="text-xs">
                              {conflict.severity}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">{conflict.description}</p>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
