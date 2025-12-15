import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Users, Presentation, BookOpen, Sparkles, TrendingUp, CheckCircle, Star } from "lucide-react";
import type { DashboardStats } from "@/lib/types";

export function StatsCards() {
  const { data: stats, isLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/dashboard/stats"],
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="card-hover">
            <CardContent className="p-6">
              <div className="animate-pulse">
                <div className="h-4 bg-muted rounded w-1/2 mb-2"></div>
                <div className="h-8 bg-muted rounded w-3/4 mb-2"></div>
                <div className="h-3 bg-muted rounded w-full"></div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const statsData = [
    {
      title: "Total Students",
      value: stats?.totalStudents || 0,
      subtitle: "+12% from last semester",
      icon: Users,
      color: "primary",
      bgColor: "bg-primary/10",
      textColor: "text-primary",
      testId: "stat-total-students"
    },
    {
      title: "Active Faculty", 
      value: stats?.activeFaculty || 0,
      subtitle: "98% utilization rate",
      icon: Presentation,
      color: "secondary",
      bgColor: "bg-secondary/10",
      textColor: "text-secondary",
      testId: "stat-active-faculty"
    },
    {
      title: "Course Offerings",
      value: stats?.courses || 0,
      subtitle: "NEP 2020 compliant",
      icon: BookOpen,
      color: "accent",
      bgColor: "bg-accent/10", 
      textColor: "text-accent",
      testId: "stat-course-offerings"
    },
    {
      title: "Conflicts Resolved",
      value: stats?.conflictsResolved || 0,
      subtitle: "AI-powered resolution",
      icon: Sparkles,
      color: "chart-1",
      bgColor: "bg-chart-1/10",
      textColor: "text-chart-1",
      testId: "stat-conflicts-resolved"
    }
  ];

  const getSubtitleIcon = (index: number) => {
    switch (index) {
      case 0: return TrendingUp;
      case 1: return CheckCircle;
      case 2: return Star;
      case 3: return Sparkles;
      default: return TrendingUp;
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
      {statsData.map((stat, index) => {
        const Icon = stat.icon;
        const SubtitleIcon = getSubtitleIcon(index);
        
        return (
          <Card key={stat.title} className="card-hover" data-testid={stat.testId}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">{stat.title}</p>
                  <p className="text-2xl font-bold text-foreground" data-testid={`${stat.testId}-value`}>
                    {stat.value.toLocaleString()}
                  </p>
                  <p className={`text-xs mt-1 flex items-center gap-1 ${stat.textColor}`}>
                    <SubtitleIcon className="w-3 h-3" />
                    {stat.subtitle}
                  </p>
                </div>
                <div className={`w-12 h-12 ${stat.bgColor} rounded-full flex items-center justify-center`}>
                  <Icon className={`${stat.textColor} text-xl`} />
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
