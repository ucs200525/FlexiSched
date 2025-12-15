// frontend/src/pages/Login.js
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { healthCheck } from '../config/api';
import { Button } from '../components/ui/button.jsx';
import { Input } from '../components/ui/input.jsx';
import { Label } from '../components/ui/label.jsx';
import { toast } from 'react-hot-toast';
import { AlertCircle, Loader2, Eye, EyeOff, User, Lock } from 'lucide-react';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [backendStatus, setBackendStatus] = useState('checking');
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();
  const { login, user } = useAuth();

  useEffect(() => {
    // Check backend health on component mount
    const checkBackend = async () => {
      try {
        await healthCheck();
        setBackendStatus('online');
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Backend health check failed:', error);
        }
        setBackendStatus('offline');
        toast.error('Backend server is not accessible. Please check if the server is running on http://localhost:8001');
      }
    };

    checkBackend();

    // If user is already logged in, redirect to appropriate dashboard
    if (user) {
      if (user.role === 'admin') {
        navigate('/admin/dashboard');
      } else if (user.role === 'faculty') {
        navigate('/faculty/dashboard');
      } else if (user.role === 'student') {
        navigate('/student/dashboard');
      }
    }
  }, [user, navigate]);

  const handleLogin = async (e) => {
    e.preventDefault();

    if (backendStatus === 'offline') {
      toast.error('Cannot login: Backend server is not accessible');
      return;
    }

    // FIXED: Correct email validation regex
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      toast.error('Please enter a valid email address');
      return;
    }

    // Validate password length
    if (password.length < 6) {
      toast.error('Password must be at least 6 characters long');
      return;
    }

    setLoading(true);

    try {
      if (process.env.NODE_ENV === 'development') {
        console.log('Attempting login with:', { email, password: '***' });
      }

      const result = await login(email, password);

      if (result.success) {
        if (process.env.NODE_ENV === 'development') {
          console.log('Login successful:', result.user);
        }
        // Redirect based on role
        if (result.user.role === 'admin') {
          navigate('/admin/dashboard');
        } else if (result.user.role === 'faculty') {
          navigate('/faculty/dashboard');
        } else if (result.user.role === 'student') {
          navigate('/student/dashboard');
        }
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Login error:', error);
        console.error('Error message:', error.message);
      }

      // Show more specific error message
      if (error.message.includes('Invalid credentials')) {
        toast.error('Invalid email or password');
      } else if (error.message.includes('validation')) {
        toast.error('Please check your input and try again');
      } else {
        toast.error(error.message || 'Login failed');
      }
    } finally {
      setLoading(false);
    }
  };

  const fillDemoCredentials = (role) => {
    switch (role) {
      case 'admin':
        setEmail('admin@flexisched.com');
        setPassword('admin123');
        break;
      case 'faculty':
        setEmail('dr.smith@univ.edu');
        setPassword('faculty123');
        break;
      case 'student':
        setEmail('student1@univ.edu');
        setPassword('student123');
        break;
      default:
        break;
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <div className="flex items-center justify-center mb-4">
            <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg">
              <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
              </svg>
            </div>
          </div>
          <h1 className="login-title">FlexiSched</h1>
          <p className="login-subtitle">NEP 2020 Compliant Timetable System</p>
        </div>

        {backendStatus === 'offline' && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            <div className="flex items-center">
              <AlertCircle className="h-5 w-5 mr-2" />
              <div>
                <p className="font-semibold">Backend Server Offline</p>
                <p>Please start backend server at <code className="bg-red-100 px-1 py-0.5 rounded text-xs">http://localhost:8001</code></p>
              </div>
            </div>
          </div>
        )}

        <form className="space-y-6" onSubmit={handleLogin}>
          <div>
            <Label htmlFor="email" className="flex items-center">
              <User className="h-4 w-4 mr-2 text-gray-500" />
              Email address
            </Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              required
              data-testid="login-email-input"
              className="pl-10"
            />
          </div>

          <div>
            <Label htmlFor="password" className="flex items-center">
              <Lock className="h-4 w-4 mr-2 text-gray-500" />
              Password
            </Label>
            <div className="relative">
              <Input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
                minLength="6"
                data-testid="login-password-input"
                className="pl-10 pr-10"
              />
              <button
                type="button"
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-500 hover:text-gray-700"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
          </div>

          <div>
            <Button
              type="submit"
              disabled={loading || backendStatus === 'offline'}
              className="w-full"
              data-testid="login-submit-button"
            >
              {loading ? (
                <>
                  <Loader2 className="animate-spin -ml-1 mr-3 h-5 w-5" />
                  Logging in...
                </>
              ) : (
                'Login'
              )}
            </Button>
          </div>
        </form>

        <div className="mt-6 pt-6 border-t border-gray-200">
          <p className="text-center text-sm text-gray-600 mb-4">Demo Credentials:</p>
          <div className="space-y-2">
            <div className="flex justify-between items-center p-2 bg-gray-50 rounded hover:bg-gray-100 transition-colors">
              <div className="flex items-center">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 mr-2">Admin</span>
                <span className="text-sm text-gray-700">admin@flexisched.com / admin123</span>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => fillDemoCredentials('admin')}
                className="text-blue-600 hover:text-blue-800"
              >
                Use
              </Button>
            </div>
            <div className="flex justify-between items-center p-2 bg-gray-50 rounded hover:bg-gray-100 transition-colors">
              <div className="flex items-center">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 mr-2">Faculty</span>
                <span className="text-sm text-gray-700">dr.smith@univ.edu / faculty123</span>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => fillDemoCredentials('faculty')}
                className="text-blue-600 hover:text-blue-800"
              >
                Use
              </Button>
            </div>
            <div className="flex justify-between items-center p-2 bg-gray-50 rounded hover:bg-gray-100 transition-colors">
              <div className="flex items-center">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 mr-2">Student</span>
                <span className="text-sm text-gray-700">student1@univ.edu / student123</span>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => fillDemoCredentials('student')}
                className="text-blue-600 hover:text-blue-800"
              >
                Use
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;