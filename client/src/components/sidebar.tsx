import { Link, useLocation } from "wouter";
import { 
  Calendar, 
  CalendarCheck, 
  Presentation, 
  Download, 
  Home, 
  Bot, 
  Settings, 
  Users, 
  BookOpen, 
  DoorOpen,
  User,
  GraduationCap
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

interface SidebarProps {
  className?: string;
}

const getNavigationItems = (userRole?: string) => {
  const adminItems = [
    { href: "/", icon: Home, label: "Dashboard" },
    { href: "/students", icon: Users, label: "Students" },
    { href: "/faculty", icon: Presentation, label: "Faculty" },
    { href: "/courses", icon: BookOpen, label: "Courses" },
    { href: "/rooms", icon: DoorOpen, label: "Rooms & Labs" },
    { href: "/ai-generator", icon: Bot, label: "AI Generator" },
    { href: "/timetables", icon: CalendarCheck, label: "Timetables" },
    { href: "/export", icon: Download, label: "Export" },
  ];

  const facultyItems = [
    { href: "/faculty-dashboard", icon: User, label: "Faculty Dashboard" },
    { href: "/faculty-workflow", icon: Calendar, label: "My Schedule" },
    { href: "/courses", icon: BookOpen, label: "Courses" },
  ];

  const studentItems = [
    { href: "/student-dashboard", icon: GraduationCap, label: "Student Dashboard" },
    { href: "/student-workflow", icon: Calendar, label: "My Timetable" },
    { href: "/courses", icon: BookOpen, label: "Courses" },
  ];

  switch (userRole) {
    case "admin":
      return adminItems;
    case "faculty":
      return facultyItems;
    case "student":
      return studentItems;
    default:
      return adminItems; // Default fallback
  }
};

export function Sidebar({ className }: SidebarProps) {
  const [location] = useLocation();
  const { user, logout } = useAuth();

  return (
    <div className={cn("w-64 bg-card border-r border-border flex flex-col", className)}>
      {/* Logo Section */}
      <div className="p-6 border-b border-border">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-gradient-to-br from-primary to-secondary rounded-lg flex items-center justify-center">
            <Calendar className="text-white text-lg" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">TimetableAI</h1>
            <p className="text-xs text-muted-foreground">NEP 2020 Compliant</p>
          </div>
        </div>
      </div>

      {/* Navigation Menu */}
      <nav className="flex-1 p-4 space-y-2">
        {getNavigationItems(user?.role).map((item) => {
          const Icon = item.icon;
          const isActive = location === item.href;
          
          return (
            <Link key={item.href} href={item.href}>
              <div 
                className={cn(
                  "sidebar-item flex items-center space-x-3 px-3 py-2 rounded-md font-medium cursor-pointer",
                  isActive 
                    ? "bg-primary text-primary-foreground" 
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
                data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
              >
                <Icon className="w-5 h-5" />
                <span>{item.label}</span>
              </div>
            </Link>
          );
        })}
      </nav>

      {/* User Profile */}
      <div className="p-4 border-t border-border">
        <div className="flex items-center space-x-3 px-3 py-2">
          <div className="w-8 h-8 bg-gradient-to-br from-primary to-secondary rounded-full flex items-center justify-center">
            <User className="w-4 h-4 text-white" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium" data-testid="user-name">{user?.name || 'User'}</p>
            <p className="text-xs text-muted-foreground" data-testid="user-role">{user?.role || 'Role'}</p>
          </div>
          <div className="relative group">
            <Settings 
              className="w-4 h-4 text-muted-foreground hover:text-foreground cursor-pointer" 
              data-testid="button-logout"
              onClick={logout}
              aria-label="Logout"
            />
            <div className="absolute right-0 bottom-full mb-2 hidden group-hover:block bg-foreground text-background text-xs px-2 py-1 rounded whitespace-nowrap">
              Logout
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
