import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Search, Edit, Trash2, Presentation, Clock } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Faculty, InsertFaculty } from "@shared/schema";

export default function Faculty() {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingFaculty, setEditingFaculty] = useState<Faculty | null>(null);
  const [formData, setFormData] = useState<InsertFaculty>({
    facultyId: "",
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    plainPassword: "",
    phone: "",
    department: "",
    designation: "",
    expertise: [],
    maxWorkload: 20,
    availability: {},
    assignedCourses: [],
    isActive: true,
  });

  const { data: faculty, isLoading } = useQuery<Faculty[]>({
    queryKey: ["/api/faculty"],
  });

  const createFacultyMutation = useMutation({
    mutationFn: async (data: InsertFaculty) => {
      const response = await apiRequest("POST", "/api/faculty", data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Faculty member created successfully!",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/faculty"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      setIsDialogOpen(false);
      resetForm();
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create faculty member",
        variant: "destructive",
      });
    },
  });

  const updateFacultyMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Faculty> }) => {
      const response = await apiRequest("PUT", `/api/faculty/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Faculty member updated successfully!",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/faculty"] });
      setIsDialogOpen(false);
      resetForm();
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update faculty member",
        variant: "destructive",
      });
    },
  });

  const deleteFacultyMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/faculty/${id}`);
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Faculty member deleted successfully!",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/faculty"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete faculty member",
        variant: "destructive",
      });
    },
  });

  const filteredFaculty = faculty?.filter(facultyMember =>
    facultyMember.firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    facultyMember.lastName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    facultyMember.facultyId.toLowerCase().includes(searchTerm.toLowerCase()) ||
    facultyMember.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    facultyMember.department.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const resetForm = () => {
    setFormData({
      facultyId: "",
      firstName: "",
      lastName: "",
      email: "",
      password: "",
      plainPassword: "",
      phone: "",
      department: "",
      designation: "",
      expertise: [],
      maxWorkload: 20,
      availability: {},
      assignedCourses: [],
      isActive: true,
    });
    setEditingFaculty(null);
  };

  const openEditDialog = (facultyMember: Faculty) => {
    setEditingFaculty(facultyMember);
    setFormData({
      facultyId: facultyMember.facultyId,
      firstName: facultyMember.firstName,
      lastName: facultyMember.lastName,
      email: facultyMember.email,
      password: facultyMember.password,
      plainPassword: facultyMember.plainPassword,
      phone: facultyMember.phone || "",
      department: facultyMember.department,
      designation: facultyMember.designation,
      expertise: Array.isArray(facultyMember.expertise) ? facultyMember.expertise : [],
      maxWorkload: facultyMember.maxWorkload || 20,
      availability: typeof facultyMember.availability === 'object' ? facultyMember.availability : {},
      assignedCourses: Array.isArray(facultyMember.assignedCourses) ? facultyMember.assignedCourses : [],
      isActive: facultyMember.isActive,
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (editingFaculty) {
      updateFacultyMutation.mutate({ id: editingFaculty.id, data: formData });
    } else {
      createFacultyMutation.mutate(formData);
    }
  };

  const departments = [
    "Education",
    "Psychology", 
    "Language and Literature",
    "Mathematics",
    "Science",
    "Social Studies",
    "Arts and Crafts",
    "Physical Education",
    "Computer Science",
    "Special Education"
  ];

  const designations = [
    "Professor",
    "Associate Professor", 
    "Assistant Professor",
    "Lecturer",
    "Senior Lecturer",
    "Guest Faculty",
    "Visiting Faculty"
  ];

  return (
    <div className="flex-1 flex flex-col">
      {/* Header */}
      <header className="bg-card border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground" data-testid="page-title">Faculty</h1>
            <p className="text-sm text-muted-foreground">
              Manage faculty members, expertise, and workload distribution
            </p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={resetForm} data-testid="button-add-faculty">
                <Plus className="w-4 h-4 mr-2" />
                Add Faculty
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl">
              <DialogHeader>
                <DialogTitle>
                  {editingFaculty ? "Edit Faculty Member" : "Add New Faculty Member"}
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="facultyId">Faculty ID</Label>
                    <Input
                      id="facultyId"
                      value={formData.facultyId}
                      onChange={(e) => setFormData(prev => ({ ...prev, facultyId: e.target.value }))}
                      placeholder="e.g., FAC2024001"
                      required
                      data-testid="input-faculty-id"
                    />
                  </div>
                  <div>
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                      placeholder="faculty@example.com"
                      required
                      data-testid="input-email"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="firstName">First Name</Label>
                    <Input
                      id="firstName"
                      value={formData.firstName}
                      onChange={(e) => setFormData(prev => ({ ...prev, firstName: e.target.value }))}
                      required
                      data-testid="input-first-name"
                    />
                  </div>
                  <div>
                    <Label htmlFor="lastName">Last Name</Label>
                    <Input
                      id="lastName"
                      value={formData.lastName}
                      onChange={(e) => setFormData(prev => ({ ...prev, lastName: e.target.value }))}
                      required
                      data-testid="input-last-name"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="phone">Phone</Label>
                    <Input
                      id="phone"
                      value={formData.phone || ""}
                      onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                      placeholder="+91 9876543210"
                      data-testid="input-phone"
                    />
                  </div>
                  <div>
                    <Label htmlFor="maxWorkload">Max Workload (hours/week)</Label>
                    <Input
                      id="maxWorkload"
                      type="number"
                      value={formData.maxWorkload}
                      onChange={(e) => setFormData(prev => ({ ...prev, maxWorkload: parseInt(e.target.value) || 20 }))}
                      min="1"
                      max="40"
                      required
                      data-testid="input-max-workload"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="plainPassword">Password</Label>
                    <Input
                      id="plainPassword"
                      type="password"
                      value={formData.plainPassword}
                      onChange={(e) => {
                        const plainPassword = e.target.value;
                        setFormData(prev => ({ 
                          ...prev, 
                          plainPassword,
                          password: `hashed_${plainPassword}`
                        }));
                      }}
                      placeholder="Enter password"
                      required
                      data-testid="input-password"
                    />
                  </div>
                  <div>
                    <Label htmlFor="confirmPassword">Confirm Password</Label>
                    <Input
                      id="confirmPassword"
                      type="password"
                      placeholder="Confirm password"
                      data-testid="input-confirm-password"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="department">Department</Label>
                    <Select
                      value={formData.department}
                      onValueChange={(value) => setFormData(prev => ({ ...prev, department: value }))}
                    >
                      <SelectTrigger data-testid="select-department">
                        <SelectValue placeholder="Select department" />
                      </SelectTrigger>
                      <SelectContent>
                        {departments.map(dept => (
                          <SelectItem key={dept} value={dept}>
                            {dept}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="designation">Designation</Label>
                    <Select
                      value={formData.designation}
                      onValueChange={(value) => setFormData(prev => ({ ...prev, designation: value }))}
                    >
                      <SelectTrigger data-testid="select-designation">
                        <SelectValue placeholder="Select designation" />
                      </SelectTrigger>
                      <SelectContent>
                        {designations.map(designation => (
                          <SelectItem key={designation} value={designation}>
                            {designation}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label htmlFor="expertise">Expertise/Subject Areas</Label>
                  <Textarea
                    id="expertise"
                    value={Array.isArray(formData.expertise) ? formData.expertise.join(", ") : ""}
                    onChange={(e) => setFormData(prev => ({ 
                      ...prev, 
                      expertise: e.target.value.split(",").map(s => s.trim()).filter(s => s.length > 0)
                    }))}
                    placeholder="e.g., Educational Psychology, Child Development, Teaching Methods"
                    data-testid="input-expertise"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Enter subject areas separated by commas
                  </p>
                </div>

                <div className="flex justify-end space-x-2">
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button 
                    type="submit" 
                    disabled={createFacultyMutation.isPending || updateFacultyMutation.isPending}
                    data-testid="button-save-faculty"
                  >
                    {(createFacultyMutation.isPending || updateFacultyMutation.isPending) ? (
                      "Saving..."
                    ) : (
                      editingFaculty ? "Update Faculty" : "Add Faculty"
                    )}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 p-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Presentation className="w-5 h-5" />
                Faculty Members
              </CardTitle>
              <div className="flex items-center space-x-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                  <Input
                    placeholder="Search faculty..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 w-64"
                    data-testid="input-search-faculty"
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
                    <TableHead>Faculty ID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Designation</TableHead>
                    <TableHead>Expertise</TableHead>
                    <TableHead>Workload</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredFaculty.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                        {searchTerm ? "No faculty members found matching your search." : "No faculty members found. Add your first faculty member to get started."}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredFaculty.map((facultyMember) => (
                      <TableRow key={facultyMember.id} data-testid={`faculty-row-${facultyMember.id}`}>
                        <TableCell className="font-medium">{facultyMember.facultyId}</TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">{facultyMember.firstName} {facultyMember.lastName}</div>
                            <div className="text-sm text-muted-foreground">{facultyMember.email}</div>
                          </div>
                        </TableCell>
                        <TableCell>{facultyMember.department}</TableCell>
                        <TableCell>{facultyMember.designation}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {Array.isArray(facultyMember.expertise) ? (
                              facultyMember.expertise.slice(0, 2).map((skill, index) => (
                                <Badge key={index} variant="secondary" className="text-xs">
                                  {skill}
                                </Badge>
                              ))
                            ) : (
                              <span className="text-sm text-muted-foreground">No expertise listed</span>
                            )}
                            {Array.isArray(facultyMember.expertise) && facultyMember.expertise.length > 2 && (
                              <Badge variant="outline" className="text-xs">
                                +{facultyMember.expertise.length - 2} more
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Clock className="w-4 h-4 text-muted-foreground" />
                            <span className="text-sm">{facultyMember.maxWorkload || 20}h/week</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={facultyMember.isActive ? "default" : "secondary"}>
                            {facultyMember.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center space-x-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEditDialog(facultyMember)}
                              data-testid={`button-edit-faculty-${facultyMember.id}`}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => deleteFacultyMutation.mutate(facultyMember.id)}
                              disabled={deleteFacultyMutation.isPending}
                              data-testid={`button-delete-faculty-${facultyMember.id}`}
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
      </main>
    </div>
  );
}
