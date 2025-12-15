// frontend/src/pages/StudentDashboard.js
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest, endpoints } from '../config/api';
import { toast } from 'react-hot-toast';
import {
  Calendar,
  BookOpen,
  Clock,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  BarChart3,
  RefreshCw,
  User
} from 'lucide-react';

const StudentDashboard = () => {
  const [stats, setStats] = useState({
    enrolledCourses: 0,
    totalCredits: 0,
    upcomingClasses: 0,
    weeklyClasses: 0
  });
  const [courses, setCourses] = useState([]);
  const [timetable, setTimetable] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setError(null);

      // Fetch all necessary data in parallel
      const [profileRes, timetableRes] = await Promise.all([
        apiRequest(endpoints.profile.student),
        apiRequest(endpoints.timetable.latest).catch(() => null) // Timetable might not exist yet
      ]);

      // Set courses from profile
      const enrolledCourses = profileRes.courses || [];
      setCourses(enrolledCourses);

      // Calculate stats
      const totalCredits = enrolledCourses.reduce((sum, course) => sum + course.credits, 0);

      // Calculate upcoming classes (next 7 days)
      let upcomingClasses = 0;
      let weeklyClasses = 0;

      if (timetableRes && timetableRes.schedule) {
        const today = new Date();
        const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, etc.
        const currentHour = today.getHours();
        const currentMinute = today.getMinutes();
        const currentTimeInMinutes = currentHour * 60 + currentMinute;

        const dayMap = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

        timetableRes.schedule.forEach(slot => {
          const slotDayIndex = dayMap.indexOf(slot.day);

          // Count weekly classes
          if (slotDayIndex >= 1 && slotDayIndex <= 5) { // Monday to Friday
            weeklyClasses++;
          }

          // Count upcoming classes
          if (slotDayIndex > dayOfWeek ||
            (slotDayIndex === dayOfWeek && slot.startTime > currentTimeInMinutes)) {
            upcomingClasses++;
          }
        });
      }

      setStats({
        enrolledCourses: enrolledCourses.length,
        totalCredits,
        upcomingClasses,
        weeklyClasses
      });

      // Set timetable
      setTimetable(timetableRes);
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

  // Format schedule as text
  const formatScheduleAsText = () => {
    if (!timetable || !timetable.schedule) return {};

    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    const scheduleText = {};

    days.forEach(day => {
      const daySlots = timetable.schedule.filter(slot => slot.day === day);

      if (daySlots.length > 0) {
        // Sort slots by start time
        daySlots.sort((a, b) => {
          const timeA = a.time.split(' - ')[0];
          const timeB = b.time.split(' - ')[0];
          return timeA.localeCompare(timeB);
        });

        // FIXED: Create an array of strings for proper line breaks
        scheduleText[day] = daySlots.map(slot =>
          `${slot.time}: ${slot.course_code || 'Unknown'} (${slot.course_name || 'Unknown Course'}) - ${slot.room_name || 'Unknown Room'}`
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
                Student Dashboard
              </h1>
              <p className="mt-1 text-sm text-gray-500">
                Overview of your courses and class schedule
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
                      <dt className="text-sm font-medium text-gray-500 truncate">Enrolled Courses</dt>
                      <dd className="text-lg font-medium text-gray-900">{stats.enrolledCourses}</dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0 bg-green-500 rounded-md p-3">
                    <BarChart3 className="h-6 w-6 text-white" />
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">Total Credits</dt>
                      <dd className="text-lg font-medium text-gray-900">{stats.totalCredits}</dd>
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
                to="/student/timetable"
                className="bg-white p-4 rounded-lg shadow hover:shadow-md transition-shadow duration-300 ease-in-out flex flex-col items-center"
              >
                <Calendar className="h-8 w-8 text-blue-500 mb-2" />
                <h3 className="text-base font-medium text-gray-900">View Timetable</h3>
                <p className="text-sm text-gray-500 text-center mt-1">See your class schedule</p>
              </Link>

              <Link
                to="/student/generate-timetable"
                className="bg-white p-4 rounded-lg shadow hover:shadow-md transition-shadow duration-300 ease-in-out flex flex-col items-center"
              >
                <Calendar className="h-8 w-8 text-green-500 mb-2" />
                <h3 className="text-base font-medium text-gray-900">Generate Timetable</h3>
                <p className="text-sm text-gray-500 text-center mt-1">Create a new schedule</p>
              </Link>
            </div>
          </div>

          {/* Teaching Schedule */}
          <div className="mt-6">
            <div className="bg-white shadow overflow-hidden sm:rounded-lg">
              <div className="px-4 py-5 sm:p-6">
                {/* FIXED: Separated the title and subtitle into different containers */}
                <div className="flex items-center">
                  <Calendar className="h-6 w-6 text-gray-400 mr-3" />
                  <h3 className="text-lg leading-6 font-medium text-gray-900">
                    Your Class Schedule
                  </h3>
                </div>
                <p className="mt-1 text-sm text-gray-500">
                  Based on your generated timetable
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
                              <div key={index} className="text-sm text-gray-700">
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
                    You haven't generated your timetable yet.
                  </p>
                  <div className="mt-6">
                    <Link
                      to="/student/generate-timetable"
                      className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                    >
                      <Calendar className="h-4 w-4 mr-2" />
                      Generate Timetable
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

export default StudentDashboard;