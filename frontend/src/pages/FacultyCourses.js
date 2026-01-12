import React, { useState, useEffect } from 'react';
import { apiRequest, endpoints } from '../config/api';
import { toast } from 'react-hot-toast';
import { BookOpen, Check, X, Search, Filter } from 'lucide-react';

const FacultyCourses = () => {
    const [courses, setCourses] = useState([]);
    const [selectedCourses, setSelectedCourses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterCategory, setFilterCategory] = useState('all');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        fetchCourses();
        fetchFacultyCourses();
    }, []);

    const fetchCourses = async () => {
        try {
            const response = await apiRequest(endpoints.courses.list);
            setCourses(response);
        } catch (error) {
            if (process.env.NODE_ENV === 'development') {
                console.error('Failed to fetch courses:', error);
            }
            toast.error('Failed to fetch courses');
        } finally {
            setLoading(false);
        }
    };

    const fetchFacultyCourses = async () => {
        try {
            const response = await apiRequest(endpoints.faculty.courses);
            setSelectedCourses(response.map(course => course._id));
        } catch (error) {
            if (process.env.NODE_ENV === 'development') {
                console.error('Failed to fetch faculty courses:', error);
            }
            toast.error('Failed to fetch faculty courses');
        }
    };

    const handleCourseToggle = (courseId) => {
        if (selectedCourses.includes(courseId)) {
            setSelectedCourses(selectedCourses.filter(id => id !== courseId));
        } else {
            setSelectedCourses([...selectedCourses, courseId]);
        }
    };

    const handleSaveCourses = async () => {
        try {
            setSaving(true);
            await apiRequest(endpoints.faculty.courses, {
                method: 'PUT',
                data: { courseIds: selectedCourses }
            });
            toast.success('Courses updated successfully');
        } catch (error) {
            if (process.env.NODE_ENV === 'development') {
                console.error('Failed to update courses:', error);
            }
            toast.error('Failed to update courses');
        } finally {
            setSaving(false);
        }
    };

    const filteredCourses = courses.filter(course => {
        const matchesSearch = course.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            course.code.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesCategory = filterCategory === 'all' || course.category === filterCategory;
        return matchesSearch && matchesCategory;
    });

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="mt-4 text-gray-600">Loading courses...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-gray-50 min-h-screen pb-8">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="py-6">
                    <div className="md:flex md:items-center md:justify-between mb-6">
                        <div className="flex-1 min-w-0">
                            <h2 className="text-2xl font-bold leading-7 text-gray-900 sm:text-3xl sm:truncate">
                                My Courses
                            </h2>
                            <p className="mt-1 text-sm text-gray-500">
                                Select courses you would like to teach
                            </p>
                        </div>
                        <div className="mt-4 flex md:mt-0 md:ml-4">
                            <button
                                onClick={handleSaveCourses}
                                disabled={saving}
                                className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                            >
                                {saving ? (
                                    <>
                                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                                        Saving...
                                    </>
                                ) : (
                                    <>
                                        <Check className="h-4 w-4 mr-2" />
                                        Save Selection
                                    </>
                                )}
                            </button>
                        </div>
                    </div>

                    <div className="bg-white shadow overflow-hidden sm:rounded-md">
                        <div className="px-4 py-5 sm:p-6 border-b border-gray-200">
                            <div className="md:flex md:items-center md:justify-between">
                                <div className="flex-1 min-w-0">
                                    <div className="relative rounded-md shadow-sm max-w-md">
                                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                            <Search className="h-5 w-5 text-gray-400" />
                                        </div>
                                        <input
                                            type="text"
                                            placeholder="Search courses..."
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            className="pl-10 pr-4 py-2 block w-full sm:text-sm border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                                        />
                                    </div>
                                </div>
                                <div className="mt-4 md:mt-0 md:ml-4">
                                    <div className="flex items-center">
                                        <Filter className="h-5 w-5 text-gray-400 mr-2" />
                                        <select
                                            value={filterCategory}
                                            onChange={(e) => setFilterCategory(e.target.value)}
                                            className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
                                        >
                                            <option value="all">All Categories</option>
                                            <option value="Major">Major</option>
                                            <option value="Minor">Minor</option>
                                            <option value="SEC">SEC</option>
                                            <option value="AEC">AEC</option>
                                            <option value="VAC">VAC</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <ul className="divide-y divide-gray-200">
                            {filteredCourses.length > 0 ? (
                                filteredCourses.map((course) => (
                                    <li key={course._id} className="hover:bg-gray-50">
                                        <div className="px-4 py-4 sm:px-6">
                                            <div className="flex items-center justify-between">
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center">
                                                        <BookOpen className="h-5 w-5 text-gray-400 mr-3" />
                                                        <div>
                                                            <h3 className="text-lg font-medium text-gray-900 truncate">
                                                                {course.name}
                                                            </h3>
                                                            <p className="text-sm text-gray-500">
                                                                Code: {course.code} | Credits: {course.credits}
                                                            </p>
                                                            <div className="mt-1 flex items-center space-x-4">
                                                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${course.category === 'Major' ? 'bg-blue-100 text-blue-800' :
                                                                    course.category === 'Minor' ? 'bg-green-100 text-green-800' :
                                                                        course.category === 'SEC' ? 'bg-purple-100 text-purple-800' :
                                                                            course.category === 'AEC' ? 'bg-yellow-100 text-yellow-800' :
                                                                                'bg-pink-100 text-pink-800'
                                                                    }`}>
                                                                    {course.category}
                                                                </span>
                                                                <span className="text-sm text-gray-500">
                                                                    Duration: {course.duration_hours} hour{course.duration_hours > 1 ? 's' : ''}
                                                                </span>
                                                                {course.is_lab && (
                                                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                                                        Lab
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="ml-4 flex-shrink-0">
                                                    <button
                                                        onClick={() => handleCourseToggle(course._id)}
                                                        className={`inline-flex items-center p-2 rounded-full ${selectedCourses.includes(course._id)
                                                            ? 'bg-blue-100 text-blue-600'
                                                            : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                                                            }`}
                                                    >
                                                        {selectedCourses.includes(course._id) ? (
                                                            <Check className="h-5 w-5" />
                                                        ) : (
                                                            <X className="h-5 w-5" />
                                                        )}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </li>
                                ))
                            ) : (
                                <li className="px-4 py-8 text-center">
                                    <div className="text-gray-500">
                                        <BookOpen className="mx-auto h-12 w-12 text-gray-400" />
                                        <h3 className="mt-2 text-sm font-medium text-gray-900">No courses found</h3>
                                        <p className="mt-1 text-sm text-gray-500">
                                            Try adjusting your search or filter criteria.
                                        </p>
                                    </div>
                                </li>
                            )}
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default FacultyCourses;