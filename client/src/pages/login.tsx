import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar, User, GraduationCap, Shield, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface LoginCredentials {
  username: string;
  password: string;
  role: "admin" | "faculty" | "student";
}

interface LoginProps {
  onLoginSuccess: (user: { role: string; username: string; name: string }) => void;
}

export default function Login({ onLoginSuccess }: LoginProps) {
  const { toast } = useToast();
  const [credentials, setCredentials] = useState<LoginCredentials>({
    username: "",
    password: "",
    role: "student"
  });

  const loginMutation = useMutation({
    mutationFn: async (creds: LoginCredentials) => {
      // For demo purposes, we'll simulate authentication
      // In a real app, this would call your authentication API
      const response = await apiRequest("POST", "/api/auth/login", creds);
      return response.json();
    },
    onSuccess: (data) => {
      console.log("Login response data:", data);
      // Extract user data from the response
      const userData = data.user || data;
      console.log("Extracted user data:", userData);
      toast({
        title: "Login Successful",
        description: `Welcome, ${userData.name}!`,
      });
      // Pass the user data along with the token
      onLoginSuccess({
        ...userData,
        token: data.token
      });
    },
    onError: (error) => {
      toast({
        title: "Login Failed",
        description: error instanceof Error ? error.message : "Invalid credentials",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!credentials.username || !credentials.password) {
      toast({
        title: "Validation Error",
        description: "Please enter both username and password",
        variant: "destructive",
      });
      return;
    }
    loginMutation.mutate(credentials);
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case "admin": return Shield;
      case "faculty": return User;
      case "student": return GraduationCap;
      default: return User;
    }
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case "admin": return "text-red-600";
      case "faculty": return "text-blue-600";
      case "student": return "text-green-600";
      default: return "text-gray-600";
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-secondary/10 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 bg-gradient-to-br from-primary to-secondary rounded-lg flex items-center justify-center mb-4">
            <Calendar className="text-white text-2xl" />
          </div>
          <CardTitle className="text-2xl font-bold">TimetableAI</CardTitle>
          <p className="text-sm text-muted-foreground">NEP 2020 Compliant System</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Role Selection */}
            <div className="space-y-2">
              <Label htmlFor="role">Select Your Role</Label>
              <Select 
                value={credentials.role} 
                onValueChange={(value) => setCredentials(prev => ({ ...prev, role: value as any }))}
              >
                <SelectTrigger data-testid="select-role">
                  <SelectValue placeholder="Choose your role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="student">
                    <div className="flex items-center space-x-2">
                      <GraduationCap className="w-4 h-4 text-green-600" />
                      <span>Student</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="faculty">
                    <div className="flex items-center space-x-2">
                      <User className="w-4 h-4 text-blue-600" />
                      <span>Faculty</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="admin">
                    <div className="flex items-center space-x-2">
                      <Shield className="w-4 h-4 text-red-600" />
                      <span>Administrator</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Username */}
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                type="text"
                placeholder="Enter your username"
                value={credentials.username}
                onChange={(e) => setCredentials(prev => ({ ...prev, username: e.target.value }))}
                data-testid="input-username"
                required
              />
            </div>

            {/* Password */}
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={credentials.password}
                onChange={(e) => setCredentials(prev => ({ ...prev, password: e.target.value }))}
                data-testid="input-password"
                required
              />
            </div>

            {/* Login Button */}
            <Button 
              type="submit" 
              className="w-full py-6 bg-gradient-to-r from-primary to-secondary text-white hover:from-primary/90 hover:to-secondary/90"
              disabled={loginMutation.isPending}
              data-testid="button-login"
            >
              {loginMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Signing In...
                </>
              ) : (
                <>
                  {(() => {
                    const Icon = getRoleIcon(credentials.role);
                    return <Icon className={`w-4 h-4 mr-2 ${getRoleColor(credentials.role)}`} />;
                  })()}
                  Sign In as {credentials.role.charAt(0).toUpperCase() + credentials.role.slice(1)}
                </>
              )}
            </Button>
          </form>

          {/* Demo Credentials */}
          <div className="mt-6 p-4 bg-muted rounded-lg">
            <h4 className="font-medium text-sm mb-2">Demo Credentials:</h4>
            <div className="space-y-1 text-xs text-muted-foreground">
              <div><strong>Admin:</strong> admin / admin123</div>
              <div><strong>Faculty:</strong> faculty / faculty123</div>
              <div><strong>Student:</strong> student / student123</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}