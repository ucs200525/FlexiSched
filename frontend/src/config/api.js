// frontend/src/config/api.js
import axios from 'axios';

// --- CONFIGURATION ---
// Use a single source of truth for API base URL
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000/api/v1';

// Create a pre-configured axios instance
const api = axios.create({
    baseURL: API_BASE_URL,
    timeout: 0, // No timeout - wait indefinitely
    headers: {
        'Content-Type': 'application/json',
    },
});

// --- AUTH TOKEN MANAGEMENT ---
// Centralized token retrieval
const getAuthToken = () => {
    const token = localStorage.getItem('token');
    return token ? `Bearer ${token}` : null;
};

// --- REQUEST INTERCEPTOR ---
// Add auth token to every outgoing request
api.interceptors.request.use(
    (config) => {
        const token = getAuthToken();
        if (token) {
            config.headers.Authorization = token;
        }

        // For debugging: log method and URL
        if (process.env.NODE_ENV === 'development') {
            console.log(`🚀 API Request: [${config.method?.toUpperCase()}] ${config.url}`);
            console.log('Request data:', config.data);
        }

        return config;
    },
    (error) => {
        console.error('❌ Request Interceptor Error:', error.message);
        return Promise.reject(error);
    }
);

// --- RESPONSE INTERCEPTOR ---
// Handle responses and global errors
api.interceptors.response.use(
    (response) => {
        // For debugging: log successful responses in development
        if (process.env.NODE_ENV === 'development') {
            console.log(`✅ API Response: [${response.config.method?.toUpperCase()}] ${response.config.url} - Status: ${response.status}`);
            console.log('Response data:', response.data);
        }

        return response;
    },
    (error) => {
        // Handle different types of errors
        if (error.response) {
            // Server responded with an error status (4xx, 5xx)
            const { status, data } = error.response;

            if (process.env.NODE_ENV === 'development') {
                console.error(`❌ API Error Response: [${error.config.method?.toUpperCase()}] ${error.config.url} - Status: ${status}`, data);

                // More detailed error logging for 422
                if (status === 422) {
                    console.error('Validation errors:', data);
                }
            }

            // Handle specific auth errors
            if (status === 401) {
                console.warn('🔐 Authentication error. Redirecting to login.');
                localStorage.removeItem('token');
                localStorage.removeItem('user');
                window.location.href = '/login';
            }

            // Better error handling for 422
            let errorMessage;
            if (status === 422) {
                // If it's a validation error with details
                if (typeof data.detail === 'string') {
                    errorMessage = data.detail;
                } else if (Array.isArray(data.detail)) {
                    errorMessage = data.detail.map(err => err.msg || err).join(', ');
                } else if (typeof data.detail === 'object') {
                    // Handle nested validation errors
                    const errorMessages = [];
                    Object.keys(data.detail).forEach(key => {
                        if (Array.isArray(data.detail[key])) {
                            errorMessages.push(...data.detail[key]);
                        } else {
                            errorMessages.push(data.detail[key]);
                        }
                    });
                    errorMessage = errorMessages.join(', ');
                } else {
                    errorMessage = 'Validation error';
                }
            } else {
                errorMessage = data?.detail || data?.message || data?.error || 'An unknown error occurred';
            }

            return Promise.reject(new Error(errorMessage));
        } else if (error.request) {
            // Request was made but no response was received (network error)
            console.error('🌐 Network Error:', error.message);
            return Promise.reject(new Error('Network error. Please check your connection.'));
        } else {
            // Something else happened in setting up request
            console.error('💥 Unexpected Error:', error.message);
            return Promise.reject(new Error('An unexpected error occurred.'));
        }
    }
);

export const endpoints = {
    // Auth endpoints
    auth: {
        login: '/auth/login',
        register: '/auth/register',
        logout: '/auth/logout',
        updatePassword: '/auth/update-password',
    },
    // Dashboard endpoints
    dashboard: {
        stats: '/dashboard/stats',
    },
    // User endpoints
    users: {
        list: '/users',
        create: '/users',
        update: (id) => `/users/${id}`,
        delete: (id) => `/users/${id}`,
    },
    // Course endpoints
    courses: {
        list: '/courses',
        create: '/courses',
        update: (id) => `/courses/${id}`,
        delete: (id) => `/courses/${id}`,
    },
    // Room endpoints
    rooms: {
        list: '/rooms',
        create: '/rooms',
        update: (id) => `/rooms/${id}`,
        delete: (id) => `/rooms/${id}`,
    },
    // Timetable endpoints
    timetable: {
        base: {
            get: '/timetable/base',
            create: '/timetable/base',
        },
        generate: '/timetable/generate',
        generateStudent: '/timetable/generate-student',
        latest: '/timetable/latest',
        all: '/timetable/all',
        facultySchedule: '/faculty/schedule',
        studentSchedule: '/student/schedule',
    },
    // Faculty endpoints
    faculty: {
        courses: '/faculty/courses',
        timetablePreferences: '/faculty/timetable-preferences',
    },
    // Profile endpoints
    profile: {
        admin: '/admin/profile',
        faculty: '/faculty/profile',
        student: '/student/profile',
    },
    // Settings endpoints
    settings: {
        creditLimits: '/settings/credit-limits',
    },
    // Health check
    health: '/health',
};

// Export axios instance
export { api };

// Helper function for making requests with the axios instance
export const apiRequest = async (endpoint, options = {}) => {
    const {
        method = 'GET',
        data,
        headers = {},
        timeout = 0 // No timeout
    } = options;

    const config = {
        method,
        url: endpoint, // Just the endpoint path, since baseURL is already set
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`,
            ...headers
        }
    };

    if (data) {
        config.data = data;
    }

    try {
        const response = await api(config);

        if (!response.data) {
            throw new Error('No data received from server');
        }

        return response.data;
    } catch (error) {
        // Forward axios errors
        if (error.response) {
            const errorMessage = error.response.data?.detail || error.response.data?.message || 'Request failed';
            throw new Error(errorMessage);
        }
        throw error;
    }
};

export const healthCheck = async () => {
    // Use the main api instance
    try {
        const response = await api.get(endpoints.health);
        return response.data;
    } catch (error) {
        throw error;
    }
};

export default api;