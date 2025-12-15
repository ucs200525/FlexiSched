// src/components/Layout.js
import React, { useState, useMemo } from 'react';
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard,
  Users,
  BookOpen,
  DoorOpen,
  Calendar,
  LogOut,
  User,
  Menu,
  X
} from 'lucide-react';

const Layout = () => {
  const { user, logout, hasRole } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleNavClick = (path) => {
    navigate(path);
    if (window.innerWidth < 1024) {
      setSidebarOpen(false);
    }
  };

  // UPDATED: Navigate to correct role-based profile page
  const handleProfileClick = () => {
    if (user?.role) {
      const profilePath = `/${user.role}/profile`;
      navigate(profilePath);
      if (window.innerWidth < 1024) {
        setSidebarOpen(false);
      }
    }
  };

  const isActive = (path) => {
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  // Use useMemo to prevent re-calculating navItems on every render
  const navItems = useMemo(() => {
    const items = [];

    if (hasRole('admin')) {
      items.push(
        {
          label: 'Dashboard',
          path: '/admin/dashboard',
          icon: LayoutDashboard
        },
        {
          label: 'Users',
          path: '/admin/users',
          icon: Users
        },
        {
          label: 'Courses',
          path: '/admin/courses',
          icon: BookOpen
        },
        {
          label: 'Rooms',
          path: '/admin/rooms',
          icon: DoorOpen
        },
        {
          label: 'Generate Timetable',
          path: '/admin/generate-timetable',
          icon: Calendar
        }
      );
    }

    if (hasRole('faculty')) {
      items.push(
        {
          label: 'Dashboard',
          path: '/faculty/dashboard',
          icon: LayoutDashboard
        },
        {
          label: 'My Courses',
          path: '/faculty/courses',
          icon: BookOpen
        },
        {
          label: 'Time Slots',
          path: '/faculty/time-slots',
          icon: Calendar // or Clock
        }
      );
    }

    if (hasRole('student')) {
      items.push(
        {
          label: 'Dashboard',
          path: '/student/dashboard',
          icon: LayoutDashboard
        },
        {
          label: 'My Timetable',  // ADDED: Timetable option for students
          path: '/student/timetable',
          icon: Calendar
        }
      );
    }

    return items;
  }, [user, hasRole]); // Dependency array: only recalculate if user or hasRole changes

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <div className={`${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-lg transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:inset-0`}>
        <div className="flex items-center justify-between h-16 px-4 border-b">
          <h1 className="text-xl font-bold text-gray-800">FlexiSched</h1>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <nav className="mt-8">
          <div className="px-4 space-y-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.path}
                  onClick={() => handleNavClick(item.path)}
                  className={`flex items-center px-4 py-2 text-sm font-medium rounded-lg transition-colors w-full text-left ${isActive(item.path)
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    }`}
                >
                  <Icon className="w-5 h-5 mr-3" />
                  {item.label}
                </button>
              );
            })}
          </div>
        </nav>

        {/* User info and logout */}
        <div className="absolute bottom-0 w-full p-4 border-t">
          <div
            className="flex items-center mb-4 p-2 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
            onClick={handleProfileClick}
          >
            <User className="w-8 h-8 text-gray-400 mr-3" />
            <div>
              <p className="text-sm font-medium text-gray-900">{user?.name}</p>
              <p className="text-xs text-gray-500 capitalize">{user?.role}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center w-full px-4 py-2 text-sm font-medium text-red-600 rounded-lg hover:bg-red-50"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Logout
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 lg:ml-0">
        {/* Mobile header */}
        <div className="lg:hidden flex items-center justify-between h-16 px-4 bg-white border-b">
          <button
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="w-6 h-6" />
          </button>
          <h1 className="text-xl font-bold text-gray-800">FlexiSched</h1>
          <div></div>
        </div>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <div className="p-6">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black bg-opacity-50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  );
};

export default Layout;