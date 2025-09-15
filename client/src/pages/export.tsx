import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { 
  Download, 
  FileText, 
  Calendar, 
  Users, 
  BookOpen, 
  DoorOpen,
  Loader2
} from "lucide-react";

export default function Export() {
  const [selectedFormat, setSelectedFormat] = useState("pdf");
  const [selectedData, setSelectedData] = useState<string[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  const { toast } = useToast();

  // Fetch data for export options
  const { data: timetables } = useQuery({ queryKey: ["/api/timetables"] });
  const { data: students } = useQuery({ queryKey: ["/api/students"] });
  const { data: faculty } = useQuery({ queryKey: ["/api/faculty"] });
  const { data: courses } = useQuery({ queryKey: ["/api/courses"] });
  const { data: rooms } = useQuery({ queryKey: ["/api/rooms"] });

  const exportOptions = [
    {
      id: "timetables",
      label: "Timetables",
      description: "Export all timetables with schedules and assignments",
      icon: Calendar,
      count: Array.isArray(timetables) ? timetables.length : 0
    },
    {
      id: "students",
      label: "Students",
      description: "Export student records and enrollment data",
      icon: Users,
      count: Array.isArray(students) ? students.length : 0
    },
    {
      id: "faculty",
      label: "Faculty",
      description: "Export faculty information and assignments",
      icon: Users,
      count: Array.isArray(faculty) ? faculty.length : 0
    },
    {
      id: "courses",
      label: "Courses",
      description: "Export course catalog and details",
      icon: BookOpen,
      count: Array.isArray(courses) ? courses.length : 0
    },
    {
      id: "rooms",
      label: "Rooms & Labs",
      description: "Export room information and capacity details",
      icon: DoorOpen,
      count: Array.isArray(rooms) ? rooms.length : 0
    }
  ];

  const handleDataToggle = (dataType: string, checked: boolean) => {
    if (checked) {
      setSelectedData(prev => [...prev, dataType]);
    } else {
      setSelectedData(prev => prev.filter(item => item !== dataType));
    }
  };

  const handleExport = async () => {
    if (selectedData.length === 0) {
      toast({
        title: "No Data Selected",
        description: "Please select at least one data type to export.",
        variant: "destructive"
      });
      return;
    }

    setIsExporting(true);

    try {
      // Simulate export process
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Create and download a sample file
      const data = {
        exportDate: new Date().toISOString(),
        format: selectedFormat,
        selectedData: selectedData,
        summary: `Exported ${selectedData.length} data types in ${selectedFormat.toUpperCase()} format`
      };

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `timetable-export-${new Date().toISOString().split('T')[0]}.${selectedFormat === 'pdf' ? 'json' : selectedFormat}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: "Export Successful",
        description: `Successfully exported ${selectedData.length} data types as ${selectedFormat.toUpperCase()}.`
      });
    } catch (error) {
      toast({
        title: "Export Failed",
        description: "An error occurred while exporting data. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col">
      {/* Header */}
      <header className="bg-card border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground" data-testid="page-title">Export Data</h1>
            <p className="text-sm text-muted-foreground">
              Export timetables, student records, faculty data, and more
            </p>
          </div>
          <div className="flex items-center gap-2">
            <FileText className="w-8 h-8 text-primary" />
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          
          {/* Export Format Selection */}
          <Card>
            <CardHeader>
              <CardTitle>Export Format</CardTitle>
              <CardDescription>
                Choose the format for your exported data
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Select value={selectedFormat} onValueChange={setSelectedFormat}>
                <SelectTrigger className="w-48" data-testid="select-export-format">
                  <SelectValue placeholder="Select format" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pdf">PDF Document</SelectItem>
                  <SelectItem value="excel">Excel Spreadsheet</SelectItem>
                  <SelectItem value="csv">CSV File</SelectItem>
                  <SelectItem value="json">JSON Data</SelectItem>
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {/* Data Selection */}
          <Card>
            <CardHeader>
              <CardTitle>Select Data to Export</CardTitle>
              <CardDescription>
                Choose which data you want to include in your export
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {exportOptions.map((option) => (
                  <div 
                    key={option.id} 
                    className="flex items-start space-x-3 p-4 border border-border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <Checkbox
                      id={option.id}
                      checked={selectedData.includes(option.id)}
                      onCheckedChange={(checked) => handleDataToggle(option.id, checked as boolean)}
                      data-testid={`checkbox-${option.id}`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <option.icon className="w-4 h-4 text-primary" />
                        <label 
                          htmlFor={option.id} 
                          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                        >
                          {option.label}
                        </label>
                        <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
                          {option.count} items
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {option.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Export Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Export Summary</CardTitle>
              <CardDescription>
                Review your selection and start the export
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="p-4 bg-muted/50 rounded-lg">
                  <div className="text-sm">
                    <div className="font-medium mb-2">Export Details:</div>
                    <div className="space-y-1 text-muted-foreground">
                      <div>Format: <span className="font-medium text-foreground">{selectedFormat.toUpperCase()}</span></div>
                      <div>Data Types: <span className="font-medium text-foreground">{selectedData.length} selected</span></div>
                      {selectedData.length > 0 && (
                        <div>Selected: <span className="font-medium text-foreground">{selectedData.join(", ")}</span></div>
                      )}
                    </div>
                  </div>
                </div>
                
                <div className="flex gap-3">
                  <Button 
                    onClick={handleExport}
                    disabled={selectedData.length === 0 || isExporting}
                    className="flex-1"
                    data-testid="button-start-export"
                  >
                    {isExporting ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Exporting...
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4 mr-2" />
                        Start Export
                      </>
                    )}
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={() => setSelectedData([])}
                    disabled={selectedData.length === 0 || isExporting}
                    data-testid="button-clear-selection"
                  >
                    Clear Selection
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}