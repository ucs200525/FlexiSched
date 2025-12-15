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
import { Plus, Search, Edit, Trash2, DoorOpen, Users, MapPin, Monitor } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Room, InsertRoom } from "@shared/schema";
import { roomTypes } from "@/lib/types";

export default function Rooms() {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [formData, setFormData] = useState<InsertRoom>({
    roomNumber: "",
    roomName: "",
    roomType: "Classroom",
    capacity: 30,
    equipment: [],
    location: "",
    isAvailable: true,
    maintenanceSchedule: [],
  });

  const { data: rooms, isLoading } = useQuery<Room[]>({
    queryKey: ["/api/rooms"],
  });

  const createRoomMutation = useMutation({
    mutationFn: async (data: InsertRoom) => {
      const response = await apiRequest("POST", "/api/rooms", data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Room created successfully!",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/rooms"] });
      setIsDialogOpen(false);
      resetForm();
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create room",
        variant: "destructive",
      });
    },
  });

  const updateRoomMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Room> }) => {
      const response = await apiRequest("PUT", `/api/rooms/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Room updated successfully!",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/rooms"] });
      setIsDialogOpen(false);
      resetForm();
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update room",
        variant: "destructive",
      });
    },
  });

  const deleteRoomMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/rooms/${id}`);
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Room deleted successfully!",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/rooms"] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete room",
        variant: "destructive",
      });
    },
  });

  const filteredRooms = rooms?.filter(room => {
    const matchesSearch = 
      room.roomNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      room.roomName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      room.location?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      room.roomType.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesType = filterType === "all" || room.roomType === filterType;
    
    return matchesSearch && matchesType;
  }) || [];

  const resetForm = () => {
    setFormData({
      roomNumber: "",
      roomName: "",
      roomType: "Classroom",
      capacity: 30,
      equipment: [],
      location: "",
      isAvailable: true,
      maintenanceSchedule: [],
    });
    setEditingRoom(null);
  };

  const openEditDialog = (room: Room) => {
    setEditingRoom(room);
    setFormData({
      roomNumber: room.roomNumber,
      roomName: room.roomName,
      roomType: room.roomType,
      capacity: room.capacity,
      equipment: Array.isArray(room.equipment) ? room.equipment : [],
      location: room.location || "",
      isAvailable: room.isAvailable,
      maintenanceSchedule: Array.isArray(room.maintenanceSchedule) ? room.maintenanceSchedule : [],
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (editingRoom) {
      updateRoomMutation.mutate({ id: editingRoom.id, data: formData });
    } else {
      createRoomMutation.mutate(formData);
    }
  };

  const getRoomTypeIcon = (roomType: string) => {
    switch (roomType) {
      case "Lab":
        return <Monitor className="w-4 h-4" />;
      case "Auditorium":
        return <Users className="w-4 h-4" />;
      case "Seminar Hall":
        return <DoorOpen className="w-4 h-4" />;
      default:
        return <DoorOpen className="w-4 h-4" />;
    }
  };

  const getRoomTypeColor = (roomType: string) => {
    switch (roomType) {
      case "Lab":
        return "bg-accent/10 text-accent border-accent/20";
      case "Auditorium":
        return "bg-secondary/10 text-secondary border-secondary/20";
      case "Seminar Hall":
        return "bg-chart-3/10 text-chart-3 border-chart-3/20";
      default:
        return "bg-primary/10 text-primary border-primary/20";
    }
  };

  return (
    <div className="flex-1 flex flex-col">
      {/* Header */}
      <header className="bg-card border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground" data-testid="page-title">Rooms & Labs</h1>
            <p className="text-sm text-muted-foreground">
              Manage classroom, laboratory, and facility allocation
            </p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={resetForm} data-testid="button-add-room">
                <Plus className="w-4 h-4 mr-2" />
                Add Room
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>
                  {editingRoom ? "Edit Room" : "Add New Room"}
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="roomNumber">Room Number</Label>
                    <Input
                      id="roomNumber"
                      value={formData.roomNumber}
                      onChange={(e) => setFormData(prev => ({ ...prev, roomNumber: e.target.value }))}
                      placeholder="e.g., R-101"
                      required
                      data-testid="input-room-number"
                    />
                  </div>
                  <div>
                    <Label htmlFor="capacity">Capacity</Label>
                    <Input
                      id="capacity"
                      type="number"
                      value={formData.capacity}
                      onChange={(e) => setFormData(prev => ({ ...prev, capacity: parseInt(e.target.value) || 0 }))}
                      min="1"
                      max="500"
                      required
                      data-testid="input-capacity"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="roomName">Room Name</Label>
                  <Input
                    id="roomName"
                    value={formData.roomName}
                    onChange={(e) => setFormData(prev => ({ ...prev, roomName: e.target.value }))}
                    placeholder="e.g., Computer Lab 1"
                    required
                    data-testid="input-room-name"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="roomType">Room Type</Label>
                    <Select
                      value={formData.roomType}
                      onValueChange={(value) => setFormData(prev => ({ ...prev, roomType: value }))}
                    >
                      <SelectTrigger data-testid="select-room-type">
                        <SelectValue placeholder="Select room type" />
                      </SelectTrigger>
                      <SelectContent>
                        {roomTypes.map(type => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="location">Location</Label>
                    <Input
                      id="location"
                      value={formData.location}
                      onChange={(e) => setFormData(prev => ({ ...prev, location: e.target.value }))}
                      placeholder="e.g., Ground Floor, Block A"
                      data-testid="input-location"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="equipment">Equipment & Facilities</Label>
                  <Textarea
                    id="equipment"
                    value={Array.isArray(formData.equipment) ? formData.equipment.join(", ") : ""}
                    onChange={(e) => setFormData(prev => ({ 
                      ...prev, 
                      equipment: e.target.value.split(",").map(s => s.trim()).filter(s => s.length > 0)
                    }))}
                    placeholder="e.g., Projector, Smart Board, Audio System, Computers"
                    data-testid="input-equipment"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Enter equipment and facilities separated by commas
                  </p>
                </div>

                <div className="flex justify-end space-x-2">
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button 
                    type="submit" 
                    disabled={createRoomMutation.isPending || updateRoomMutation.isPending}
                    data-testid="button-save-room"
                  >
                    {(createRoomMutation.isPending || updateRoomMutation.isPending) ? (
                      "Saving..."
                    ) : (
                      editingRoom ? "Update Room" : "Add Room"
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
                <DoorOpen className="w-5 h-5" />
                Facility Management
              </CardTitle>
              <div className="flex items-center space-x-2">
                <Select value={filterType} onValueChange={setFilterType}>
                  <SelectTrigger className="w-40" data-testid="filter-room-type">
                    <SelectValue placeholder="Room Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    {roomTypes.map(type => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                  <Input
                    placeholder="Search rooms..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 w-64"
                    data-testid="input-search-rooms"
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
                    <TableHead>Room Number</TableHead>
                    <TableHead>Room Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Capacity</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Equipment</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRooms.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                        {searchTerm || filterType !== "all" ? 
                          "No rooms found matching your filters." : 
                          "No rooms found. Add your first room to get started."
                        }
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredRooms.map((room) => (
                      <TableRow key={room.id} data-testid={`room-row-${room.id}`}>
                        <TableCell className="font-medium">{room.roomNumber}</TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">{room.roomName}</div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge 
                            className={`flex items-center gap-1 w-fit ${getRoomTypeColor(room.roomType)}`}
                            variant="outline"
                          >
                            {getRoomTypeIcon(room.roomType)}
                            {room.roomType}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Users className="w-4 h-4 text-muted-foreground" />
                            <span className="font-medium">{room.capacity}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <MapPin className="w-4 h-4 text-muted-foreground" />
                            <span className="text-sm">{room.location || "Not specified"}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {Array.isArray(room.equipment) ? (
                              room.equipment.slice(0, 2).map((equipment, index) => (
                                <Badge key={index} variant="secondary" className="text-xs">
                                  {equipment}
                                </Badge>
                              ))
                            ) : (
                              <span className="text-sm text-muted-foreground">No equipment listed</span>
                            )}
                            {Array.isArray(room.equipment) && room.equipment.length > 2 && (
                              <Badge variant="outline" className="text-xs">
                                +{room.equipment.length - 2} more
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={room.isAvailable ? "default" : "secondary"}>
                            {room.isAvailable ? "Available" : "Unavailable"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center space-x-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEditDialog(room)}
                              data-testid={`button-edit-room-${room.id}`}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => deleteRoomMutation.mutate(room.id)}
                              disabled={deleteRoomMutation.isPending}
                              data-testid={`button-delete-room-${room.id}`}
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
