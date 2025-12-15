import { Switch, Route, useLocation } from "wouter";
import { useEffect } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Sidebar } from "@/components/sidebar";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";

// Pages
import Login from "@/pages/login";
import Dashboard from "@/pages/dashboard";
import StudentDashboard from "@/pages/student-dashboard";
import FacultyDashboard from "@/pages/faculty-dashboard";
import Students from "@/pages/students";
import Faculty from "@/pages/faculty";
import Courses from "@/pages/courses";
import Rooms from "@/pages/rooms";
import AIGenerator from "@/pages/ai-generator";
import Timetables from "@/pages/timetables";
import Export from "@/pages/export";
import NotFound from "@/pages/not-found";
import FacultyWorkflow from "@/components/workflows/faculty-workflow";
import StudentWorkflow from "@/components/workflows/student-workflow";

// Route configuration outside component to avoid hooks issues
const getDefaultRoute = (role?: string) => {
  switch (role) {
    case "admin": return "/";
    case "faculty": return "/faculty-dashboard";
    case "student": return "/student-dashboard";
    default: return "/";
  }
};

const getAllowedRoutes = (role?: string) => {
  switch (role) {
    case "admin": 
      return ["/", "/students", "/faculty", "/courses", "/rooms", "/ai-generator", "/timetables", "/export"];
    case "faculty": 
      return ["/faculty-dashboard", "/faculty-workflow", "/courses", "/timetables", "/ai-generator"];
    case "student": 
      return ["/student-dashboard", "/student-workflow", "/courses"];
    default: 
      return ["/"];
  }
};

function AuthenticatedApp() {
  const { user, isAuthenticated, login } = useAuth();
  const [location, setLocation] = useLocation();

  // Use useEffect to handle navigation to prevent setState during render
  // This must be called before any conditional returns to follow Rules of Hooks
  useEffect(() => {
    if (isAuthenticated && user?.role) {
      console.log("App.tsx - useEffect - user role:", user.role, "current location:", location);
      const allowedRoutes = getAllowedRoutes(user.role);
      console.log("App.tsx - useEffect - allowed routes:", allowedRoutes);
      if (!allowedRoutes.includes(location)) {
        const defaultRoute = getDefaultRoute(user.role);
        console.log("App.tsx - useEffect - redirecting from", location, "to", defaultRoute);
        setLocation(defaultRoute);
      }
    }
  }, [location, user?.role, setLocation, isAuthenticated]);

  if (!isAuthenticated) {
    return <Login onLoginSuccess={(userData: any) => {
      console.log("App.tsx - onLoginSuccess received userData:", userData);
      const userToLogin = {
        ...userData,
        id: userData.id || `${userData.role}-${Date.now()}`
      };
      console.log("App.tsx - logging in user:", userToLogin);
      login(userToLogin);
      // Redirect to appropriate dashboard after login
      const defaultRoute = getDefaultRoute(userData.role);
      console.log("App.tsx - redirecting to:", defaultRoute, "for role:", userData.role);
      setLocation(defaultRoute);
    }} />;
  }

  return (
    <div className="min-h-screen flex">
      <Sidebar />
      <div className="flex-1">
        <Switch>
          <Route path="/" component={Dashboard} />
          <Route path="/student-dashboard" component={StudentDashboard} />
          <Route path="/faculty-dashboard" component={FacultyDashboard} />
          <Route path="/students" component={Students} />
          <Route path="/faculty" component={Faculty} />
          <Route path="/courses" component={Courses} />
          <Route path="/rooms" component={Rooms} />
          <Route path="/ai-generator" component={AIGenerator} />
          <Route path="/timetables" component={Timetables} />
          <Route path="/export" component={Export} />
          <Route path="/faculty-workflow" component={FacultyWorkflow} />
          <Route path="/student-workflow" component={StudentWorkflow} />
          <Route component={NotFound} />
        </Switch>
      </div>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <AuthenticatedApp />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
