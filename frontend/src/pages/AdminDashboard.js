import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest, endpoints } from '../config/api';
import { toast } from 'react-hot-toast';

const AdminDashboard = () => {
  const [stats, setStats] = useState({
    total_students: 0,
    total_faculty: 0,
    total_courses: 0,
    total_rooms: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('AdminDashboard component mounted');
    }
    fetchStats();
  }, []);

  const fetchStats = async () => {
    if (process.env.NODE_ENV === 'development') {
      console.log('Fetching stats...');
    }

    try {
      const response = await apiRequest(endpoints.dashboard.stats);
      if (process.env.NODE_ENV === 'development') {
        console.log('Stats response:', response);
      }
      setStats(response);
      setError(null);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to fetch stats:', error);
      }
      setError('Failed to fetch statistics');
      toast.error('Failed to fetch statistics');
    } finally {
      if (process.env.NODE_ENV === 'development') {
        console.log('Setting loading to false');
      }
      setLoading(false);
    }
  };

  const handleRetry = () => {
    setLoading(true);
    fetchStats();
  };

  if (loading) {
    if (process.env.NODE_ENV === 'development') {
      console.log('Rendering loading state');
    }

    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center p-8 bg-white rounded-lg shadow-md">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <div className="text-center p-8 bg-white rounded-lg shadow-md">
          <div className="text-red-500 text-6xl mb-4">⚠️</div>
          <h2 className="text-xl font-semibold text-gray-800 mb-2">Something went wrong</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={handleRetry}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (process.env.NODE_ENV === 'development') {
    console.log('Rendering dashboard with stats:', stats);
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Admin Dashboard</h1>
        <p className="page-subtitle">Manage your institution's timetable system</p>
      </div>

      <div className="stats-grid">
        <div className="stat-card" data-testid="stat-students">
          <div className="stat-icon icon-blue">👨‍🎓</div>
          <div className="stat-label">Total Students</div>
          <div className="stat-value">{stats.total_students}</div>
        </div>

        <div className="stat-card" data-testid="stat-faculty">
          <div className="stat-icon icon-green">👨‍🏫</div>
          <div className="stat-label">Total Faculty</div>
          <div className="stat-value">{stats.total_faculty}</div>
        </div>

        <div className="stat-card" data-testid="stat-courses">
          <div className="stat-icon icon-purple">📚</div>
          <div className="stat-label">Total Courses</div>
          <div className="stat-value">{stats.total_courses}</div>
        </div>

        <div className="stat-card" data-testid="stat-rooms">
          <div className="stat-icon icon-orange">🏫</div>
          <div className="stat-label">Total Rooms</div>
          <div className="stat-value">{stats.total_rooms}</div>
        </div>
      </div>

      <div className="page-header" style={{ marginTop: '3rem' }}>
        <h2 className="page-title" style={{ fontSize: '1.5rem' }}>Quick Actions</h2>
      </div>

      <div className="quick-actions">
        <Link to="/admin/courses" className="action-card" data-testid="quick-action-courses">
          <div className="action-icon icon-purple">📚</div>
          <div className="action-title">Manage Courses</div>
          <div className="action-description">Add, edit or remove courses</div>
        </Link>

        <Link to="/admin/users" className="action-card" data-testid="quick-action-users">
          <div className="action-icon icon-blue">👥</div>
          <div className="action-title">Manage Users</div>
          <div className="action-description">Add or remove users (faculty and students)</div>
        </Link>

        <Link to="/admin/rooms" className="action-card" data-testid="quick-action-rooms">
          <div className="action-icon icon-orange">🏫</div>
          <div className="action-title">Manage Rooms</div>
          <div className="action-description">Add, edit or remove rooms</div>
        </Link>

        <Link to="/admin/generate-timetable" className="action-card" data-testid="quick-action-structure">
          <div className="action-icon icon-green">📅</div>
          <div className="action-title">Timetable Structure</div>
          <div className="action-description">Define base timetable structure</div>
        </Link>
      </div>
    </div>
  );
};

export default AdminDashboard;