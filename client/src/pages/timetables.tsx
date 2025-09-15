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
import { Plus, Search, Edit, Trash2, Calendar, Download, Eye, BarChart3, Bot } from "lucide-react";
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

  const handleExportTimetable = (timetable: Timetable) => {
    // This would typically trigger a PDF/Excel export
    toast({
      title: "Export Started",
      description: `Exporting ${timetable.name} to PDF...`,
    });
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
          <Button data-testid="button-create-timetable">
            <Plus className="w-4 h-4 mr-2" />
            Create Manual Timetable
          </Button>
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
