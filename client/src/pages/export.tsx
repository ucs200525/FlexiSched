import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { 
  Download, 
  FileText, 
  Calendar, 
  Users, 
  BookOpen, 
  DoorOpen,
  Loader2,
  AlertCircle
} from "lucide-react";

interface DataState {
  timetables: any[];
  students: any[];
  faculty: any[];
  courses: any[];
  rooms: any[];
}

export default function Export() {
  const [selectedFormat, setSelectedFormat] = useState("json");
  const [selectedData, setSelectedData] = useState<string[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [data, setData] = useState<DataState>({
    timetables: [],
    students: [],
    faculty: [],
    courses: [],
    rooms: []
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { toast } = useToast();

  // Fetch all data on component mount
  useEffect(() => {
    const fetchAllData = async () => {
      setIsLoading(true);
      const endpoints = [
        { key: 'timetables', url: '/api/timetables' },
        { key: 'students', url: '/api/students' },
        { key: 'faculty', url: '/api/faculty' },
        { key: 'courses', url: '/api/courses' },
        { key: 'rooms', url: '/api/rooms' }
      ];

      const newData: DataState = {
        timetables: [],
        students: [],
        faculty: [],
        courses: [],
        rooms: []
      };
      const newErrors: Record<string, string> = {};

      for (const endpoint of endpoints) {
        try {
          const response = await apiRequest('GET', endpoint.url);
          if (response.ok) {
            const result = await response.json();
            newData[endpoint.key as keyof DataState] = Array.isArray(result) ? result : [];
            console.log(`Fetched ${endpoint.key}:`, result);
          } else {
            newErrors[endpoint.key] = `Failed to fetch ${endpoint.key}`;
            console.error(`Error fetching ${endpoint.key}:`, response.status);
          }
        } catch (error) {
          newErrors[endpoint.key] = `Network error for ${endpoint.key}`;
          console.error(`Network error fetching ${endpoint.key}:`, error);
        }
      }

      setData(newData);
      setErrors(newErrors);
      setIsLoading(false);
      
      console.log('Final data state:', newData);
    };

    fetchAllData();
  }, []);

  const exportOptions = [
    {
      id: "timetables",
      label: "Timetables",
      description: "Export all timetables with schedules and assignments",
      icon: Calendar,
      count: data.timetables.length,
      hasError: !!errors.timetables
    },
    {
      id: "students",
      label: "Students",
      description: "Export student records and enrollment data",
      icon: Users,
      count: data.students.length,
      hasError: !!errors.students
    },
    {
      id: "faculty",
      label: "Faculty",
      description: "Export faculty information and assignments",
      icon: Users,
      count: data.faculty.length,
      hasError: !!errors.faculty
    },
    {
      id: "courses",
      label: "Courses",
      description: "Export course catalog and details",
      icon: BookOpen,
      count: data.courses.length,
      hasError: !!errors.courses
    },
    {
      id: "rooms",
      label: "Rooms & Labs",
      description: "Export room information and capacity details",
      icon: DoorOpen,
      count: data.rooms.length,
      hasError: !!errors.rooms
    }
  ];

  const handleDataToggle = (dataType: string, checked: boolean) => {
    if (checked) {
      setSelectedData(prev => [...prev, dataType]);
    } else {
      setSelectedData(prev => prev.filter(item => item !== dataType));
    }
  };

  const generateFileName = (format: string) => {
    const date = new Date().toISOString().split('T')[0];
    const extensions: Record<string, string> = {
      json: 'json',
      csv: 'csv',
      excel: 'xlsx',
      pdf: 'txt'
    };
    return `timetable-export-${date}.${extensions[format] || 'txt'}`;
  };

  const exportAsJSON = (exportData: any) => {
    const jsonData = {
      exportInfo: {
        exportDate: new Date().toISOString(),
        format: 'JSON',
        selectedDataTypes: selectedData,
        totalRecords: Object.values(exportData).reduce((sum: number, arr: any) => 
          sum + (Array.isArray(arr) ? arr.length : 0), 0)
      },
      data: exportData
    };
    
    return new Blob([JSON.stringify(jsonData, null, 2)], { type: 'application/json' });
  };

  const exportAsCSV = (exportData: any) => {
    let csvContent = `Timetable Export Report\n`;
    csvContent += `Generated: ${new Date().toLocaleString()}\n`;
    csvContent += `Format: CSV\n`;
    csvContent += `Selected Data: ${selectedData.join(', ')}\n\n`;

    Object.entries(exportData).forEach(([dataType, items]: [string, any]) => {
      csvContent += `\n=== ${dataType.toUpperCase()} ===\n`;
      
      if (!Array.isArray(items) || items.length === 0) {
        csvContent += `No ${dataType} data available\n`;
        return;
      }

      // Get headers from first item
      const headers = Object.keys(items[0]);
      csvContent += headers.join(',') + '\n';

      // Add data rows
      items.forEach((item: any) => {
        const row = headers.map(header => {
          const value = item[header];
          // Handle different data types properly
          let stringValue: string;
          if (value === null || value === undefined) {
            stringValue = '';
          } else if (typeof value === 'object') {
            stringValue = JSON.stringify(value);
          } else {
            stringValue = String(value);
          }
          
          // Escape quotes and wrap in quotes if contains comma or quotes
          return stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')
            ? `"${stringValue.replace(/"/g, '""')}"` 
            : stringValue;
        });
        csvContent += row.join(',') + '\n';
      });
    });

    return new Blob([csvContent], { type: 'text/csv' });
  };

  const exportAsExcel = (exportData: any) => {
    let excelContent = `Timetable Export Report\t\t\t\n`;
    excelContent += `Generated:\t${new Date().toLocaleString()}\t\t\n`;
    excelContent += `Format:\tExcel\t\t\n`;
    excelContent += `Selected Data:\t${selectedData.join(', ')}\t\t\n\n`;

    Object.entries(exportData).forEach(([dataType, items]: [string, any]) => {
      excelContent += `\n${dataType.toUpperCase()}\t\t\t\n`;
      
      if (!Array.isArray(items) || items.length === 0) {
        excelContent += `No ${dataType} data available\t\t\t\n`;
        return;
      }

      // Headers
      const headers = Object.keys(items[0]);
      excelContent += headers.join('\t') + '\n';

      // Data rows
      items.forEach((item: any) => {
        const row = headers.map(header => String(item[header] || '').replace(/\t/g, ' '));
        excelContent += row.join('\t') + '\n';
      });
    });

    return new Blob([excelContent], { type: 'application/vnd.ms-excel' });
  };

  const exportAsPDF = (exportData: any) => {
    let pdfContent = `TIMETABLE EXPORT REPORT\n`;
    pdfContent += `${'='.repeat(80)}\n\n`;
    pdfContent += `Generated: ${new Date().toLocaleString()}\n`;
    pdfContent += `Format: PDF (Text)\n`;
    pdfContent += `Selected Data Types: ${selectedData.join(', ')}\n\n`;

    Object.entries(exportData).forEach(([dataType, items]: [string, any]) => {
      pdfContent += `\n${'='.repeat(80)}\n`;
      pdfContent += `${dataType.toUpperCase()}\n`;
      pdfContent += `${'='.repeat(80)}\n`;
      
      if (!Array.isArray(items) || items.length === 0) {
        pdfContent += `\nNo ${dataType} data available\n`;
        return;
      }

      items.forEach((item: any, index: number) => {
        pdfContent += `\n--- Record ${index + 1} ---\n`;
        Object.entries(item).forEach(([field, value]) => {
          let displayValue: string;
          if (value === null || value === undefined) {
            displayValue = 'N/A';
          } else if (typeof value === 'object') {
            displayValue = JSON.stringify(value, null, 2);
          } else {
            displayValue = String(value);
          }
          pdfContent += `${field}: ${displayValue}\n`;
        });
      });
    });

    return new Blob([pdfContent], { type: 'text/plain' });
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
      // Collect selected data
      const exportData: Record<string, any> = {};
      let totalRecords = 0;

      selectedData.forEach(dataType => {
        const dataArray = data[dataType as keyof DataState];
        exportData[dataType] = dataArray;
        totalRecords += dataArray.length;
        console.log(`Including ${dataType}: ${dataArray.length} records`);
      });

      console.log('Exporting data:', exportData);

      if (totalRecords === 0) {
        toast({
          title: "No Data Available",
          description: "The selected data types contain no records to export.",
          variant: "destructive"
        });
        return;
      }

      // Generate file based on format
      let blob: Blob;
      switch (selectedFormat) {
        case 'json':
          blob = exportAsJSON(exportData);
          break;
        case 'csv':
          blob = exportAsCSV(exportData);
          break;
        case 'excel':
          blob = exportAsExcel(exportData);
          break;
        case 'pdf':
        default:
          blob = exportAsPDF(exportData);
          break;
      }

      // Download file
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = generateFileName(selectedFormat);
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: "Export Successful",
        description: `Successfully exported ${totalRecords} records in ${selectedFormat.toUpperCase()} format.`
      });

    } catch (error) {
      console.error('Export error:', error);
      toast({
        title: "Export Failed",
        description: `Failed to export data: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: "destructive"
      });
    } finally {
      setIsExporting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" />
          <p>Loading data for export...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col">
      {/* Header */}
      <header className="bg-card border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Export Data</h1>
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
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Select format" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="json">JSON Data</SelectItem>
                  <SelectItem value="csv">CSV File</SelectItem>
                  <SelectItem value="excel">Excel Spreadsheet</SelectItem>
                  <SelectItem value="pdf">PDF Document (Text)</SelectItem>
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
                      disabled={option.hasError}
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
                        {option.hasError ? (
                          <AlertCircle className="w-4 h-4 text-destructive" />
                        ) : (
                          <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
                            {option.count} records
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {option.hasError ? errors[option.id] : option.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Export Button */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">
                    {selectedData.length === 0 
                      ? "Select data types to export" 
                      : `Ready to export ${selectedData.length} data type(s)`
                    }
                  </p>
                </div>
                <Button 
                  onClick={handleExport} 
                  disabled={selectedData.length === 0 || isExporting}
                  className="min-w-32"
                >
                  {isExporting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Exporting...
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4 mr-2" />
                      Export Data
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}