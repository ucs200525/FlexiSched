// src/App.js
import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Toaster } from 'react-hot-toast';
import Login from './pages/Login';
import AdminDashboard from './pages/AdminDashboard';
import Courses from './pages/Courses';
import Users from './pages/Users';
import Rooms from './pages/Rooms';
import GenerateTimetable from './pages/GenerateTimetable';
import FacultyDashboard from './pages/FacultyDashboard';
import FacultyCourses from './pages/FacultyCourses';
import FacultyTimeSlots from './pages/FacultyTimeSlots';
import StudentDashboard from './pages/StudentDashboard';
import StudentTimetable from './pages/StudentTimetable';
import Profile from './pages/Profile';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import NotFound from './pages/NotFound';
import './App.css';

function AppRoutes() {
  const { user, loading, backendAvailable } = useAuth();

  useEffect(() => {
    // Only log in development mode
    if (process.env.NODE_ENV === 'development') {
      console.log('App mounted, user:', user, 'loading:', loading);
    }
  }, [user, loading, backendAvailable]);

  // Show a more informative loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center p-8 bg-white rounded-lg shadow-md">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading application...</p>
          {!backendAvailable && (
            <p className="mt-2 text-red-500 text-sm">Backend server is not accessible</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <Routes>
      {/* Public Routes */}
      <Route path="/login" element={<Login />} />

      {/* Admin Routes */}
      <Route
        path="/admin/*"
        element={
          <ProtectedRoute allowedRoles={['admin']}>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="dashboard" element={<AdminDashboard />} />
        <Route path="courses" element={<Courses />} />
        <Route path="users" element={<Users />} />
        <Route path="rooms" element={<Rooms />} />
        <Route path="generate-timetable" element={<GenerateTimetable />} />
        <Route path="profile" element={<Profile />} />
        <Route path="" element={<Navigate to="dashboard" replace />} />
      </Route>

      {/* Faculty Routes */}
      <Route
        path="/faculty/*"
        element={
          <ProtectedRoute allowedRoles={['faculty']}>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="dashboard" element={<FacultyDashboard />} />
        <Route path="courses" element={<FacultyCourses />} />
        <Route path="time-slots" element={<FacultyTimeSlots />} />
        <Route path="profile" element={<Profile />} />
        <Route path="" element={<Navigate to="dashboard" replace />} />
      </Route>

      {/* Student Routes */}
      <Route
        path="/student/*"
        element={
          <ProtectedRoute allowedRoles={['student']}>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="dashboard" element={<StudentDashboard />} />
        <Route path="timetable" element={<StudentTimetable />} />
        <Route path="profile" element={<Profile />} />
        <Route path="" element={<Navigate to="dashboard" replace />} />
      </Route>

      {/* 404 Page */}
      <Route path="*" element={<NotFound />} />

      {/* Default redirect */}
      <Route path="/" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="App font-body">
          <AppRoutes />
        </div>
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: {
              background: '#363636',
              color: '#fff',
            },
            success: {
              duration: 3000,
              iconTheme: {
                primary: '#4ade80',
                secondary: '#fff',
              },
            },
            error: {
              duration: 5000,
              iconTheme: {
                primary: '#ef4444',
                secondary: '#fff',
              },
            },
          }}
        />
      </Router>
    </AuthProvider>
  );
}

export default App;