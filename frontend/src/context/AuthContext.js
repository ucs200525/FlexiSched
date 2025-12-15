// src/context/AuthContext.js
import React, { createContext, useContext, useState, useEffect } from 'react';
import { apiRequest, endpoints, healthCheck } from '../config/api';
import toast from 'react-hot-toast';

// Create context
const AuthContext = createContext();

// Custom hook to use auth context
export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};

// Auth provider component
export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [token, setToken] = useState(localStorage.getItem('token'));
    const [backendAvailable, setBackendAvailable] = useState(false);

    // Check if user is authenticated on mount
    useEffect(() => {
        const checkAuth = async () => {
            // Only log in development mode
            if (process.env.NODE_ENV === 'development') {
                console.log('Checking authentication status...');
            }

            try {
                // Check if backend is accessible first
                try {
                    await healthCheck();
                    setBackendAvailable(true);
                    if (process.env.NODE_ENV === 'development') {
                        console.log('Backend is accessible');
                    }
                } catch (error) {
                    setBackendAvailable(false);
                    if (process.env.NODE_ENV === 'development') {
                        console.error('Backend is not accessible:', error);
                    }
                    toast.error('Backend server is not accessible');
                    setLoading(false);
                    return;
                }

                const token = localStorage.getItem('token');
                const userStr = localStorage.getItem('user');

                if (process.env.NODE_ENV === 'development') {
                    console.log('Found token in localStorage:', !!token);
                    console.log('Found user in localStorage:', !!userStr);
                }

                if (token && userStr) {
                    const user = JSON.parse(userStr);
                    if (process.env.NODE_ENV === 'development') {
                        console.log('User data from localStorage:', user);
                    }
                    setUser(user);
                    setToken(token);
                }
            } catch (error) {
                if (process.env.NODE_ENV === 'development') {
                    console.error('Auth check failed:', error);
                }
                localStorage.removeItem('token');
                localStorage.removeItem('user');
                setToken(null);
                setUser(null);
            } finally {
                setLoading(false);
            }
        };

        checkAuth();
    }, []);

    // Login function
    const login = async (email, password) => {
        if (process.env.NODE_ENV === 'development') {
            console.log('Attempting login with email:', email);
        }

        try {
            const response = await apiRequest(endpoints.auth.login, {
                method: 'POST',
                data: {
                    email: email.trim(),
                    password: password
                },
            });

            if (process.env.NODE_ENV === 'development') {
                console.log('Login response:', response);
            }

            const { token: newToken, user: userData } = response;

            // Save token to localStorage
            localStorage.setItem('token', newToken);
            localStorage.setItem('user', JSON.stringify(userData));
            setToken(newToken);

            // Update user state
            setUser(userData);

            toast.success('Login successful!');
            return { success: true, user: userData };
        } catch (error) {
            if (process.env.NODE_ENV === 'development') {
                console.error('Login error:', error);
            }
            const message = error.message || 'Login failed';
            toast.error(message);
            return { success: false, error: message };
        }
    };

    // Register function
    const register = async (userData) => {
        if (process.env.NODE_ENV === 'development') {
            console.log('Attempting registration with data:', userData);
        }

        try {
            const response = await apiRequest(endpoints.auth.register, {
                method: 'POST',
                data: userData
            });

            if (process.env.NODE_ENV === 'development') {
                console.log('Registration response:', response);
            }

            const { token: newToken, user: newUser } = response;

            // Save token to localStorage
            localStorage.setItem('token', newToken);
            localStorage.setItem('user', JSON.stringify(newUser));
            setToken(newToken);

            // Update user state
            setUser(newUser);

            toast.success('Registration successful!');
            return { success: true, user: newUser };
        } catch (error) {
            if (process.env.NODE_ENV === 'development') {
                console.error('Registration error:', error);
            }
            const message = error.message || 'Registration failed';
            toast.error(message);
            return { success: false, error: message };
        }
    };

    // Logout function
    const logout = () => {
        if (process.env.NODE_ENV === 'development') {
            console.log('Logging out user');
        }

        // Remove token from localStorage
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        setToken(null);

        // Clear user state
        setUser(null);

        toast.success('Logged out successfully');
    };

    // Update password function
    const updatePassword = async (currentPassword, newPassword) => {
        if (process.env.NODE_ENV === 'development') {
            console.log('Attempting password update');
        }

        try {
            await apiRequest(endpoints.auth.updatePassword, {
                method: 'POST',
                data: {
                    current_password: currentPassword,
                    new_password: newPassword
                }
            });

            toast.success('Password updated successfully!');
            return { success: true };
        } catch (error) {
            if (process.env.NODE_ENV === 'development') {
                console.error('Password update error:', error);
            }
            const message = error.message || 'Password update failed';
            toast.error(message);
            return { success: false, error: message };
        }
    };

    // Check if user has specific role
    const hasRole = (role) => {
        if (process.env.NODE_ENV === 'development') {
            console.log('Checking if user has role:', role, 'User role:', user?.role);
        }
        return user?.role === role;
    };

    // Check if user has any of specified roles
    const hasAnyRole = (roles) => {
        if (process.env.NODE_ENV === 'development') {
            console.log('Checking if user has any of roles:', roles, 'User role:', user?.role);
        }
        return roles.includes(user?.role);
    };

    const value = {
        user,
        token,
        loading,
        backendAvailable,
        login,
        register,
        logout,
        updatePassword,
        hasRole,
        hasAnyRole,
        isAuthenticated: !!user
    };

    if (process.env.NODE_ENV === 'development') {
        console.log('AuthContext value:', value);
    }

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};

export default AuthContext;