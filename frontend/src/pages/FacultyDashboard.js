import React, { useState, useEffect } from 'react';
import { apiRequest, endpoints } from '../config/api';
import { toast } from 'react-hot-toast';
import {
  Calendar,
  BookOpen,
  Clock,
  Users,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  BarChart3,
  RefreshCw
} from 'lucide-react';
import { Link } from 'react-router-dom';

const FacultyDashboard = () => {
  const [stats, setStats] = useState({
    totalCourses: 0,
    scheduledHours: 0,
    weeklyClasses: 0,
    upcomingClasses: 0
  });
  const [courses, setCourses] = useState([]);
  const [preferences, setPreferences] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setError(null);

      const [coursesRes, preferencesRes] = await Promise.all([
        apiRequest(endpoints.faculty.courses),
        apiRequest(endpoints.faculty.timetablePreferences).catch(() => ({ preferences: [] }))
      ]);

      setCourses(coursesRes || []);

      const preferencesMap = {};
      const preferences = preferencesRes.preferences || preferencesRes || [];

      preferences.forEach(pref => {
        const key = `${pref.day}-${pref.start_time}`;
        preferencesMap[key] = pref;
      });
      setPreferences(preferencesMap);

      const totalCourses = coursesRes ? coursesRes.length : 0;
      const scheduledHours = Object.values(preferencesMap).reduce((total, pref) => {
        const [startHour, startMin] = pref.start_time.split(':').map(Number);
        const [endHour, endMin] = pref.end_time.split(':').map(Number);

        let duration = endHour - startHour;
        if (endMin < startMin) {
          duration -= 1;
        }
        duration += (endMin - startMin) / 60;

        return total + duration;
      }, 0);

      const weeklyClasses = Object.keys(preferencesMap).length;

      const today = new Date();
      const nextWeek = new Date(today);
      nextWeek.setDate(today.getDate() + 7);

      const upcomingClasses = Object.values(preferencesMap).filter(pref => {
        const dayIndex = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].indexOf(pref.day);
        const prefDate = new Date(today);
        const currentDay = today.getDay();
        const daysUntilDay = (dayIndex - currentDay + 7) % 7;
        prefDate.setDate(today.getDate() + daysUntilDay);

        return prefDate <= nextWeek;
      }).length;

      setStats({
        totalCourses,
        scheduledHours,
        weeklyClasses,
        upcomingClasses
      });
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to load dashboard data:', error);
      }
      setError('Failed to load dashboard data');
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await fetchDashboardData();
      toast.success('Dashboard refreshed');
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to refresh dashboard:', error);
      }
      toast.error('Failed to refresh dashboard');
    } finally {
      setRefreshing(false);
    }
  };

  const formatScheduleAsText = () => {
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    const scheduleText = {};

    days.forEach(day => {
      const dayPreferences = Object.values(preferences).filter(pref => pref.day === day);

      if (dayPreferences.length > 0) {
        dayPreferences.sort((a, b) => {
          const timeA = a.start_time.split(':').map(Number);
          const timeB = b.start_time.split(':').map(Number);
          return timeA[0] * 60 + timeA[1] - (timeB[0] * 60 + timeB[1]);
        });

        scheduleText[day] = dayPreferences.map(pref =>
          `${pref.start_time} - ${pref.end_time}: ${pref.course_code || 'Unknown'} (${pref.course_name || 'Unknown Course'})`
        );
      } else {
        scheduleText[day] = ['No classes scheduled'];
      }
    });

    return scheduleText;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center p-8 bg-white rounded-lg shadow-md">
          <AlertCircle className="mx-auto h-12 w-12 text-red-500" />
          <h2 className="mt-4 text-xl font-semibold text-gray-900">Something went wrong</h2>
          <p className="mt-2 text-gray-600">{error}</p>
          <button
            onClick={handleRefresh}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  const scheduleText = formatScheduleAsText();

  return (
    <div className="bg-gray-50 min-h-screen pb-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="py-6">
          <div className="md:flex md:items-center md:justify-between mb-6">
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-bold leading-7 text-gray-900 sm:text-3xl sm:truncate">
                Faculty Dashboard
              </h1>
              <p className="mt-1 text-sm text-gray-500">
                Overview of your teaching schedule and course assignments
              </p>
            </div>
            <div className="mt-4 flex md:mt-0 md:ml-4">
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
              >
                {refreshing ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Refreshing...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Refresh
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4 mb-6">
            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0 bg-blue-500 rounded-md p-3">
                    <BookOpen className="h-6 w-6 text-white" />
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">Assigned Courses</dt>
                      <dd className="text-lg font-medium text-gray-900">{stats.totalCourses}</dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0 bg-green-500 rounded-md p-3">
                    <Clock className="h-6 w-6 text-white" />
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">Scheduled Hours</dt>
                      <dd className="text-lg font-medium text-gray-900">{stats.scheduledHours.toFixed(1)}</dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0 bg-purple-500 rounded-md p-3">
                    <Calendar className="h-6 w-6 text-white" />
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">Weekly Classes</dt>
                      <dd className="text-lg font-medium text-gray-900">{stats.weeklyClasses}</dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0 bg-yellow-500 rounded-md p-3">
                    <TrendingUp className="h-6 w-6 text-white" />
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">Upcoming Classes</dt>
                      <dd className="text-lg font-medium text-gray-900">{stats.upcomingClasses}</dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="mt-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">Quick Actions</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Link
                to="/faculty/courses"
                className="bg-white p-4 rounded-lg shadow hover:shadow-md transition-shadow duration-300 ease-in-out flex flex-col items-center"
              >
                <BookOpen className="h-8 w-8 text-blue-500 mb-2" />
                <h3 className="text-base font-medium text-gray-900">Manage Courses</h3>
                <p className="text-sm text-gray-500 text-center mt-1">Select or deselect courses</p>
              </Link>

              <Link
                to="/faculty/time-slots"
                className="bg-white p-4 rounded-lg shadow hover:shadow-md transition-shadow duration-300 ease-in-out flex flex-col items-center"
              >
                <Calendar className="h-8 w-8 text-green-500 mb-2" />
                <h3 className="text-base font-medium text-gray-900">Time Slots</h3>
                <p className="text-sm text-gray-500 text-center mt-1">Set your teaching schedule</p>
              </Link>
            </div>
          </div>

          {/* --- UPDATED: Teaching Schedule as Text --- */}
          <div className="mt-6">
            <div className="bg-white shadow overflow-hidden sm:rounded-lg">
              <div className="px-4 py-5 sm:p-6">
                {/* FIXED: Separated the title and subtitle into different containers */}
                <div className="flex items-center">
                  <Calendar className="h-6 w-6 text-gray-400 mr-3" />
                  <h3 className="text-lg leading-6 font-medium text-gray-900">
                    Your Teaching Schedule
                  </h3>
                </div>
                <p className="mt-1 text-sm text-gray-500">
                  Based on your time slot preferences
                </p>
              </div>

              {Object.keys(scheduleText).length > 0 ? (
                <div className="px-4 py-5 sm:p-6">
                  <div className="space-y-6">
                    {Object.entries(scheduleText).map(([day, schedule]) => (
                      <div key={day} className="border-b border-gray-200 pb-4 last:border-b-0">
                        <h4 className="text-base font-medium text-gray-900 mb-2">{day}</h4>
                        <div className="bg-gray-50 p-4 rounded-md">
                          {/* FIXED: Changed from pre tag to a list for better line breaks */}
                          <div className="space-y-2">
                            {schedule.map((item, index) => (
                              <div key={index} className="text-sm text-gray-700 font-mono">
                                {item}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="px-4 py-5 sm:p-6 text-center">
                  <AlertCircle className="mx-auto h-12 w-12 text-gray-400" />
                  <h3 className="mt-2 text-sm font-medium text-gray-900">No schedule available</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    You haven't set your time slot preferences yet.
                  </p>
                  <div className="mt-6">
                    <Link
                      to="/faculty/time-slots"
                      className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                    >
                      <Calendar className="h-4 w-4 mr-2" />
                      Set Time Slots
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FacultyDashboard;