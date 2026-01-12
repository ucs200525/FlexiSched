import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000/api/v1';

const api = axios.create({
    baseURL: API_BASE_URL,
    timeout: 0,
    headers: {
        'Content-Type': 'application/json',
    },
});

const getAuthToken = () => {
    const token = localStorage.getItem('token');
    return token ? `Bearer ${token}` : null;
};
api.interceptors.request.use(
    (config) => {
        const token = getAuthToken();
        if (token) {
            config.headers.Authorization = token;
        }

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

api.interceptors.response.use(
    (response) => {
        if (process.env.NODE_ENV === 'development') {
            console.log(`✅ API Response: [${response.config.method?.toUpperCase()}] ${response.config.url} - Status: ${response.status}`);
            console.log('Response data:', response.data);
        }

        return response;
    },
    (error) => {
        if (error.response) {
            const { status, data } = error.response;

            if (process.env.NODE_ENV === 'development') {
                console.error(`❌ API Error Response: [${error.config.method?.toUpperCase()}] ${error.config.url} - Status: ${status}`, data);

                if (status === 422) {
                    console.error('Validation errors:', data);
                }
            }
            if (status === 401) {
                console.warn('🔐 Authentication error. Redirecting to login.');
                localStorage.removeItem('token');
                localStorage.removeItem('user');
                window.location.href = '/login';
            }

            let errorMessage;
            if (status === 422) {
                if (typeof data.detail === 'string') {
                    errorMessage = data.detail;
                } else if (Array.isArray(data.detail)) {
                    errorMessage = data.detail.map(err => err.msg || err).join(', ');
                } else if (typeof data.detail === 'object') {
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
            console.error('🌐 Network Error:', error.message);
            return Promise.reject(new Error('Network error. Please check your connection.'));
        } else {
            console.error('💥 Unexpected Error:', error.message);
            return Promise.reject(new Error('An unexpected error occurred.'));
        }
    }
);

export const endpoints = {
    auth: {
        login: '/auth/login',
        register: '/auth/register',
        logout: '/auth/logout',
        updatePassword: '/auth/update-password',
    },
    dashboard: {
        stats: '/dashboard/stats',
    },
    users: {
        list: '/users',
        create: '/users',
        update: (id) => `/users/${id}`,
        delete: (id) => `/users/${id}`,
    },
    courses: {
        list: '/courses',
        create: '/courses',
        update: (id) => `/courses/${id}`,
        delete: (id) => `/courses/${id}`,
    },
    rooms: {
        list: '/rooms',
        create: '/rooms',
        update: (id) => `/rooms/${id}`,
        delete: (id) => `/rooms/${id}`,
    },
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
    faculty: {
        courses: '/faculty/courses',
        timetablePreferences: '/faculty/timetable-preferences',
    },
    profile: {
        admin: '/admin/profile',
        faculty: '/faculty/profile',
        student: '/student/profile',
    },
    settings: {
        creditLimits: '/settings/credit-limits',
    },
    health: '/health',
};

export { api };

export const apiRequest = async (endpoint, options = {}) => {
    const {
        method = 'GET',
        data,
        headers = {},
        timeout = 0
    } = options;

    const config = {
        method,
        url: endpoint,
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
        if (error.response) {
            const errorMessage = error.response.data?.detail || error.response.data?.message || 'Request failed';
            throw new Error(errorMessage);
        }
        throw error;
    }
};

export const healthCheck = async () => {
    try {
        const response = await api.get(endpoints.health);
        return response.data;
    } catch (error) {
        throw error;
    }
};

export default api;