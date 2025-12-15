import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LogOut, User, Shield, GraduationCap, Bot, Sparkles, Settings, Users } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import AdminWorkflow from "@/components/workflows/admin-workflow";
import FacultyWorkflow from "@/components/workflows/faculty-workflow";
import StudentWorkflow from "@/components/workflows/student-workflow";
import { NotificationSystem } from "@/components/notifications/notification-system";


export default function AIGenerator() {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<"admin" | "faculty" | "student">(user?.role || "admin");

  // Redirect to login if not authenticated
  if (!user) {
    window.location.href = "/login";
    return null;
  }

  // Type the dashboard stats properly
  interface DashboardStats {
    totalStudents: number;
    activeFaculty: number;
    totalCourses: number;
    availableRooms: number;
  }

  const { data: dashboardStats } = useQuery<DashboardStats>({
    queryKey: ["/api/dashboard/stats"],
  });

  return (
    <div className="flex-1 flex flex-col">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">AI Timetable Workflow</h1>
          <p className="text-gray-600 mt-2">
            Role-based timetable generation and management system
          </p>
        </div>
        
        {/* User Info, Notifications, and Logout */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            {user.role === "admin" && <Shield className="w-5 h-5 text-blue-600" />}
            {user.role === "faculty" && <User className="w-5 h-5 text-green-600" />}
            {user.role === "student" && <GraduationCap className="w-5 h-5 text-purple-600" />}
            <div>
              <div className="font-medium">{user.name}</div>
              <div className="text-sm text-gray-500 capitalize">{user.role}</div>
            </div>
          </div>
          
          {/* Notification System */}
          <NotificationSystem />
          
          <Button variant="outline" onClick={logout}>
            <LogOut className="w-4 h-4 mr-2" />
            Logout
          </Button>
        </div>
      </div>

      {/* Content */}
      <main className="flex-1 p-6">
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "admin" | "faculty" | "student")} className="space-y-6">
          <TabsList className="grid w-full grid-cols-1">
            {user.role === 'admin' && (
              <TabsTrigger value="admin">
                <Settings className="w-4 h-4 mr-2" />
                Admin Workflow
              </TabsTrigger>
            )}
            {user.role === 'faculty' && (
              <TabsTrigger value="faculty">
                <Users className="w-4 h-4 mr-2" />
                Faculty Dashboard
              </TabsTrigger>
            )}
            {user.role === 'student' && (
              <TabsTrigger value="student">
                <GraduationCap className="w-4 h-4 mr-2" />
                Student Portal
              </TabsTrigger>
            )}
          </TabsList>

          {user.role === 'admin' && (
            <TabsContent value="admin">
              <AdminWorkflow />
            </TabsContent>
          )}

          {user.role === 'faculty' && (
            <TabsContent value="faculty">
              <FacultyWorkflow />
            </TabsContent>
          )}

          {user.role === 'student' && (
            <TabsContent value="student">
              <StudentWorkflow />
            </TabsContent>
          )}
        </Tabs>

        {/* Quick Stats */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-primary">
                {dashboardStats?.totalStudents || 0}
              </div>
              <div className="text-sm text-muted-foreground">Total Students</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-secondary">
                {dashboardStats?.activeFaculty || 0}
              </div>
              <div className="text-sm text-muted-foreground">Active Faculty</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-accent">
                {dashboardStats?.totalCourses || 0}
              </div>
              <div className="text-sm text-muted-foreground">Total Courses</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-green-600">
                {dashboardStats?.availableRooms || 0}
              </div>
              <div className="text-sm text-muted-foreground">Available Rooms</div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
