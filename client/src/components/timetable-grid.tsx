import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Edit, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TimetableSlot, Course, Faculty, Room } from "@shared/schema";
import { courseTypes, daysOfWeek, timeSlots } from "@/lib/types";

interface TimetableGridProps {
  slots: TimetableSlot[];
  courses: Course[];
  faculty: Faculty[];
  rooms: Room[];
  onSlotClick?: (slot: TimetableSlot) => void;
  editable?: boolean;
}

interface GridSlot extends TimetableSlot {
  course?: Course;
  facultyMember?: Faculty;
  room?: Room;
}

export function TimetableGrid({ 
  slots, 
  courses, 
  faculty, 
  rooms, 
  onSlotClick, 
  editable = true 
}: TimetableGridProps) {
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);

  // Create a map for easier lookups
  const courseMap = new Map(courses.map(c => [c.id, c]));
  const facultyMap = new Map(faculty.map(f => [f.id, f]));
  const roomMap = new Map(rooms.map(r => [r.id, r]));

  // Enhance slots with related data
  const enhancedSlots: GridSlot[] = slots.map(slot => ({
    ...slot,
    course: courseMap.get(slot.courseId),
    facultyMember: facultyMap.get(slot.facultyId),
    room: roomMap.get(slot.roomId),
  }));

  // Create time grid
  const createTimeGrid = () => {
    const grid: Record<string, Record<string, GridSlot | null>> = {};
    
    timeSlots.forEach(time => {
      grid[time] = {};
      daysOfWeek.forEach(day => {
        grid[time][day] = null;
      });
    });

    enhancedSlots.forEach(slot => {
      if (grid[slot.startTime]) {
        grid[slot.startTime][slot.dayOfWeek] = slot;
      }
    });

    return grid;
  };

  const timeGrid = createTimeGrid();

  const getCourseTypeColor = (courseType: string) => {
    const type = courseTypes.find(t => t.value === courseType);
    return type?.color || "primary";
  };

  const handleSlotClick = (slot: GridSlot) => {
    setSelectedSlot(slot.id);
    onSlotClick?.(slot);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Current Timetable Preview</CardTitle>
            <p className="text-sm text-muted-foreground">Interactive Timetable View</p>
          </div>
          <div className="flex space-x-2">
            {editable && (
              <Button variant="outline" size="sm" data-testid="button-edit-timetable">
                <Edit className="w-4 h-4 mr-2" />
                Edit
              </Button>
            )}
            <Button variant="outline" size="sm" data-testid="button-export-timetable">
              <Download className="w-4 h-4 mr-2" />
              Export
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse" data-testid="timetable-grid">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-4 py-3 text-sm font-semibold text-foreground bg-muted">
                  Time
                </th>
                {daysOfWeek.map(day => (
                  <th key={day} className="text-left px-4 py-3 text-sm font-semibold text-foreground bg-muted">
                    {day}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {timeSlots.map(time => {
                // Special handling for break time
                if (time === "11:15") {
                  return (
                    <tr key={time} className="bg-muted/30">
                      <td className="px-4 py-3 text-sm font-medium text-foreground bg-muted">
                        11:00-11:15
                      </td>
                      <td colSpan={5} className="px-4 py-3 text-center text-sm text-muted-foreground">
                        Break
                      </td>
                    </tr>
                  );
                }

                return (
                  <tr key={time}>
                    <td className="px-4 py-3 text-sm font-medium text-foreground bg-muted/50">
                      {time === "09:00" && "9:00-10:00"}
                      {time === "10:00" && "10:00-11:00"}  
                      {time === "12:15" && "11:15-12:15"}
                      {time === "13:15" && "12:15-13:15"}
                      {time === "14:15" && "13:15-14:15"}
                      {time === "15:15" && "14:15-15:15"}
                      {time === "16:15" && "15:15-16:15"}
                    </td>
                    {daysOfWeek.map(day => {
                      const slot = timeGrid[time]?.[day];
                      
                      if (!slot) {
                        return (
                          <td key={day} className="px-4 py-3">
                            <div className="h-16 border-2 border-dashed border-border rounded-lg flex items-center justify-center text-xs text-muted-foreground">
                              Free
                            </div>
                          </td>
                        );
                      }

                      const colorClass = getCourseTypeColor(slot.course?.courseType || "");
                      
                      return (
                        <td key={day} className="px-4 py-3">
                          <div
                            className={cn(
                              "timetable-slot rounded-lg p-3 cursor-pointer border-2",
                              colorClass === "primary" && "bg-primary/10 border-primary/20",
                              colorClass === "secondary" && "bg-secondary/10 border-secondary/20", 
                              colorClass === "accent" && "bg-accent/10 border-accent/20",
                              colorClass === "chart-1" && "bg-chart-1/10 border-chart-1/20",
                              colorClass === "chart-2" && "bg-chart-2/10 border-chart-2/20",
                              colorClass === "chart-3" && "bg-chart-3/10 border-chart-3/20",
                              colorClass === "chart-4" && "bg-chart-4/10 border-chart-4/20",
                              selectedSlot === slot.id && "ring-2 ring-ring",
                              editable && "hover:scale-105"
                            )}
                            onClick={() => editable && handleSlotClick(slot)}
                            data-testid={`timetable-slot-${slot.id}`}
                          >
                            <p className={cn(
                              "text-sm font-medium mb-1",
                              colorClass === "primary" && "text-primary",
                              colorClass === "secondary" && "text-secondary",
                              colorClass === "accent" && "text-accent", 
                              colorClass === "chart-1" && "text-chart-1",
                              colorClass === "chart-2" && "text-chart-2",
                              colorClass === "chart-3" && "text-chart-3",
                              colorClass === "chart-4" && "text-chart-4"
                            )}>
                              {slot.course?.courseName || "Unknown Course"}
                            </p>
                            <p className={cn(
                              "text-xs mb-1",
                              colorClass === "primary" && "text-primary/70",
                              colorClass === "secondary" && "text-secondary/70",
                              colorClass === "accent" && "text-accent/70",
                              colorClass === "chart-1" && "text-chart-1/70",
                              colorClass === "chart-2" && "text-chart-2/70", 
                              colorClass === "chart-3" && "text-chart-3/70",
                              colorClass === "chart-4" && "text-chart-4/70"
                            )}>
                              {slot.facultyMember ? 
                                `${slot.facultyMember.firstName} ${slot.facultyMember.lastName}` : 
                                "Unknown Faculty"
                              } • {slot.room?.roomNumber || "TBD"}
                            </p>
                            <p className={cn(
                              "text-xs",
                              colorClass === "primary" && "text-primary/70",
                              colorClass === "secondary" && "text-secondary/70",
                              colorClass === "accent" && "text-accent/70",
                              colorClass === "chart-1" && "text-chart-1/70",
                              colorClass === "chart-2" && "text-chart-2/70",
                              colorClass === "chart-3" && "text-chart-3/70", 
                              colorClass === "chart-4" && "text-chart-4/70"
                            )}>
                              {slot.course?.courseType || "Unknown"} • {slot.course?.credits || 0} Credits
                            </p>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Legend */}
        <div className="mt-6 flex flex-wrap gap-4 text-xs">
          {courseTypes.map(type => (
            <div key={type.value} className="flex items-center space-x-2">
              <div className={cn(
                "w-4 h-4 border rounded",
                type.color === "primary" && "bg-primary/20 border-primary/40",
                type.color === "secondary" && "bg-secondary/20 border-secondary/40",
                type.color === "accent" && "bg-accent/20 border-accent/40",
                type.color === "chart-1" && "bg-chart-1/20 border-chart-1/40",
                type.color === "chart-2" && "bg-chart-2/20 border-chart-2/40",
                type.color === "chart-3" && "bg-chart-3/20 border-chart-3/40",
                type.color === "chart-4" && "bg-chart-4/20 border-chart-4/40"
              )} />
              <span className="text-muted-foreground">{type.label}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
