// frontend/src/pages/StudentTimetable.js
import React, { useState, useEffect } from 'react';
import { apiRequest, endpoints } from '../config/api';
import { Button } from '../components/ui/button.jsx';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card.jsx';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog.jsx';
import { Input } from '../components/ui/input.jsx';
import { Label } from '../components/ui/label.jsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select.jsx';
import { toast } from 'react-hot-toast';
import { Loader2, Calendar, BookOpen, AlertCircle, RefreshCw, Clock, User, Plus, X } from 'lucide-react';

const StudentTimetable = () => {
    const [availableCourses, setAvailableCourses] = useState([]);
    const [creditLimits, setCreditLimits] = useState({ minCredits: 0, maxCredits: 0 });
    const [selectedCourseIds, setSelectedCourseIds] = useState([]);
    const [coursePreferences, setCoursePreferences] = useState({});
    const [generatedTimetable, setGeneratedTimetable] = useState(null);
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [preferencesDialogOpen, setPreferencesDialogOpen] = useState(false);
    const [currentPreferenceCourse, setCurrentPreferenceCourse] = useState(null);
    const [availableFaculty, setAvailableFaculty] = useState([]);

    useEffect(() => {
        fetchInitialData();
    }, []);

    const fetchInitialData = async () => {
        try {
            setLoading(true);
            const [coursesRes, limitsRes, preferencesRes] = await Promise.all([
                apiRequest(endpoints.courses.list),
                apiRequest(endpoints.settings.creditLimits),
                apiRequest('/student/course-preferences').catch(() => null)
            ]);

            setAvailableCourses(coursesRes || []);
            setCreditLimits(limitsRes || { minCredits: 15, maxCredits: 25 });

            // Set up course preferences if they exist
            if (preferencesRes && preferencesRes.length > 0) {
                const prefs = {};
                preferencesRes.forEach(pref => {
                    prefs[pref.course_id] = {
                        preferred_time: pref.preferred_time || '',
                        preferred_professor: pref.preferred_professor || '',
                        priority: pref.priority || 1
                    };
                });
                setCoursePreferences(prefs);

                // Set selected course IDs based on preferences
                setSelectedCourseIds(Object.keys(prefs));
            }
        } catch (error) {
            toast.error('Failed to load initial data.');
        } finally {
            setLoading(false);
        }
    };

    const handleCourseSelection = (courseId) => {
        setSelectedCourseIds(prev => {
            if (prev.includes(courseId)) {
                // Remove course from selection and preferences
                const newPrefs = { ...coursePreferences };
                delete newPrefs[courseId];
                setCoursePreferences(newPrefs);
                return prev.filter(id => id !== courseId);
            } else {
                // Add course to selection with default preferences
                setCoursePreferences(prev => ({
                    ...prev,
                    [courseId]: {
                        preferred_time: '',
                        preferred_professor: '',
                        priority: 1
                    }
                }));
                return [...prev, courseId];
            }
        });
    };

    const handlePreferenceChange = (courseId, field, value) => {
        setCoursePreferences(prev => ({
            ...prev,
            [courseId]: {
                ...prev[courseId],
                [field]: value
            }
        }));
    };

    const openPreferencesDialog = async (courseId) => {
        setCurrentPreferenceCourse(courseId);

        // Fetch available faculty for this course
        try {
            const facultyRes = await apiRequest(`/courses/${courseId}/faculty`);
            setAvailableFaculty(facultyRes || []);

            // If no faculty is assigned to this course, show a warning
            if (!facultyRes || facultyRes.length === 0) {
                toast.warning('No faculty is currently assigned to this course.');
            }
        } catch (error) {
            toast.error('Failed to fetch faculty for this course.');
            setAvailableFaculty([]);
        }

        setPreferencesDialogOpen(true);
    };

    const saveCoursePreferences = async () => {
        try {
            const preferences = Object.keys(coursePreferences).map(courseId => ({
                course_id: courseId,
                preferred_time: coursePreferences[courseId].preferred_time,
                preferred_professor: coursePreferences[courseId].preferred_professor,
                priority: coursePreferences[courseId].priority
            }));

            await apiRequest('/student/register-courses', {
                method: 'POST',
                data: { courses: preferences }
            });

            toast.success('Course preferences saved successfully!');
        } catch (error) {
            toast.error(error.message || 'Failed to save course preferences.');
        }
    };

    const totalSelectedCredits = availableCourses
        .filter(course => selectedCourseIds.includes(course._id))
        .reduce((sum, course) => sum + course.credits, 0);

    const isGenerateDisabled = totalSelectedCredits < creditLimits.minCredits || totalSelectedCredits > creditLimits.maxCredits;

    const handleGenerateTimetable = async () => {
        if (selectedCourseIds.length === 0) {
            toast.error('Please select at least one course.');
            return;
        }
        if (isGenerateDisabled) {
            toast.error(`Selected credits must be between ${creditLimits.minCredits} and ${creditLimits.maxCredits}.`);
            return;
        }

        // Save preferences before generating
        await saveCoursePreferences();

        try {
            setGenerating(true);
            const response = await apiRequest('/timetable/generate-student', {
                method: 'POST',
                data: { courseIds: selectedCourseIds },
                timeout: 0 // No timeout
            });

            setGeneratedTimetable(response);
            toast.success('Timetable generated successfully!');
        } catch (error) {
            toast.error(error.message || 'Failed to generate timetable. Please try again.');
        } finally {
            setGenerating(false);
        }
    };

    // Function to get background color based on course category
    const getCourseColor = (category) => {
        switch (category) {
            case 'Major': return 'bg-blue-100 text-blue-800 border-blue-200';
            case 'Minor': return 'bg-green-100 text-green-800 border-green-200';
            case 'SEC': return 'bg-purple-100 text-purple-800 border-purple-200';
            case 'AEC': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
            case 'VAC': return 'bg-pink-100 text-pink-800 border-pink-200';
            default: return 'bg-gray-100 text-gray-800 border-gray-200';
        }
    };

    // Function to convert time string to minutes for comparison
    const timeToMinutes = (timeStr) => {
        const [time, period] = timeStr.split(' ');
        const [hours, minutes] = time.split(':').map(Number);
        const totalMinutes = hours * 60 + minutes;
        return period.includes('PM') && hours !== 12 ? totalMinutes + 12 * 60 : totalMinutes;
    };

    // Function to generate time slots for the grid
    const generateTimeSlots = () => {
        if (!generatedTimetable || !generatedTimetable.schedule) return [];

        // Extract all unique time slots from the schedule
        const timeSlots = [...new Set(generatedTimetable.schedule.map(slot => slot.time))];

        // Sort time slots chronologically
        timeSlots.sort((a, b) => timeToMinutes(a) - timeToMinutes(b));

        return timeSlots;
    };

    // Function to get course for a specific day and time slot
    const getCourseForSlot = (day, timeSlot) => {
        if (!generatedTimetable || !generatedTimetable.schedule) return null;

        return generatedTimetable.schedule.find(slot =>
            slot.day === day && slot.time === timeSlot
        );
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="text-center">
                    <Loader2 className="animate-spin h-12 w-12 text-blue-600 mx-auto" />
                    <p className="mt-4 text-gray-600">Loading courses...</p>
                </div>
            </div>
        );
    }

    const timeSlots = generateTimeSlots();
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

    return (
        <div>
            <div className="page-header">
                <h1 className="page-title">My Timetable</h1>
                <p className="page-subtitle">Select your courses, set preferences, and generate a personalized schedule</p>
            </div>

            {/* Credit Limit Information */}
            <Card className="mb-6">
                <CardHeader>
                    <CardTitle>Credit Limits</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex justify-between items-center">
                        <span>
                            Your selection must be between <strong>{creditLimits.minCredits}</strong> and <strong>{creditLimits.maxCredits}</strong> credits.
                        </span>
                        <span className={`font-semibold ${isGenerateDisabled ? 'text-red-600' : 'text-green-600'}`}>
                            Current Total: {totalSelectedCredits} credits
                        </span>
                    </div>
                </CardContent>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Course Selection */}
                <div className="lg:col-span-1">
                    <Card>
                        <CardHeader>
                            <CardTitle>Select Your Courses</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="max-h-96 overflow-y-auto space-y-3">
                                {availableCourses.length === 0 ? (
                                    <p className="text-gray-500">No courses available to select.</p>
                                ) : (
                                    availableCourses.map(course => (
                                        <div key={course._id} className="flex items-center p-3 border rounded-lg">
                                            <input
                                                type="checkbox"
                                                id={`course-${course._id}`}
                                                checked={selectedCourseIds.includes(course._id)}
                                                onChange={() => handleCourseSelection(course._id)}
                                                className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                                            />
                                            <label htmlFor={`course-${course._id}`} className="ml-3 flex-1 cursor-pointer">
                                                <div>
                                                    <p className="font-medium text-gray-900">{course.name}</p>
                                                    <p className="text-sm text-gray-500">{course.code} &bull; {course.credits} credits &bull; {course.category}</p>
                                                </div>
                                            </label>
                                            {selectedCourseIds.includes(course._id) && (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => openPreferencesDialog(course._id)}
                                                    className="ml-2"
                                                >
                                                    <User className="h-4 w-4" />
                                                </Button>
                                            )}
                                        </div>
                                    ))
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Generated Timetable Display */}
                <div className="lg:col-span-2">
                    <Card>
                        <CardHeader>
                            <CardTitle>Generated Schedule</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {generating ? (
                                <div className="flex flex-col items-center justify-center h-64">
                                    <Loader2 className="animate-spin h-8 w-8 text-blue-600" />
                                    <p className="mt-2 text-gray-600">Generating your timetable...</p>
                                </div>
                            ) : generatedTimetable ? (
                                <div className="overflow-x-auto">
                                    <table className="min-w-full divide-y divide-gray-200">
                                        <thead className="bg-gray-50">
                                            <tr>
                                                <th className="px-6 py-4 text-left text-base font-medium text-gray-900 uppercase tracking-wider">Time</th>
                                                {days.map(day => (
                                                    <th key={day} className="px-6 py-4 text-left text-base font-medium text-gray-900 uppercase tracking-wider">{day}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody className="bg-white divide-y divide-gray-200">
                                            {timeSlots.map((timeSlot, index) => (
                                                <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                                    <td className="px-6 py-4 whitespace-nowrap text-base font-medium text-gray-900">{timeSlot}</td>
                                                    {days.map(day => {
                                                        const course = getCourseForSlot(day, timeSlot);
                                                        return (
                                                            <td key={`${day}-${index}`} className="px-6 py-4 whitespace-nowrap text-sm">
                                                                {course ? (
                                                                    <div className={`p-4 rounded-lg border ${getCourseColor(course.category || 'Major')}`}>
                                                                        <p className="font-bold text-lg">{course.course_code}</p>
                                                                        <p className="text-base mt-1">{course.course_name}</p>
                                                                        <p className="text-sm mt-2 font-medium">{course.room_name}</p>
                                                                        <p className="text-xs mt-1">{course.faculty_name}</p>
                                                                    </div>
                                                                ) : (
                                                                    <span className="text-gray-400 text-base">-</span>
                                                                )}
                                                            </td>
                                                        );
                                                    })}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-64 text-center">
                                    <Calendar className="h-12 w-12 text-gray-400" />
                                    <p className="mt-2 text-gray-500">Your generated timetable will appear here</p>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* Action Buttons */}
            <div className="mt-6 flex justify-center">
                <Button
                    onClick={handleGenerateTimetable}
                    disabled={isGenerateDisabled || generating}
                    className="px-6 py-3 text-base font-medium"
                >
                    {generating ? (
                        <>
                            <Loader2 className="animate-spin -ml-1 mr-3 h-5 w-5" />
                            Generating...
                        </>
                    ) : (
                        <>
                            <Calendar className="-ml-1 mr-2 h-5 w-5" />
                            Generate My Timetable
                        </>
                    )}
                </Button>
            </div>

            {/* Course Preferences Dialog */}
            <Dialog open={preferencesDialogOpen} onOpenChange={setPreferencesDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Course Preferences</DialogTitle>
                    </DialogHeader>
                    {currentPreferenceCourse && (
                        <div className="space-y-4">
                            <div>
                                <Label htmlFor="preferred-time">Preferred Time</Label>
                                <Select
                                    value={coursePreferences[currentPreferenceCourse]?.preferred_time || ''}
                                    onValueChange={(value) => handlePreferenceChange(currentPreferenceCourse, 'preferred_time', value)}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select preferred time" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="morning">Morning (9:00 AM - 12:00 PM)</SelectItem>
                                        <SelectItem value="afternoon">Afternoon (12:00 PM - 5:00 PM)</SelectItem>
                                        <SelectItem value="no-preference">No Preference</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div>
                                <Label htmlFor="preferred-professor">Preferred Professor</Label>
                                {availableFaculty.length > 0 ? (
                                    <Select
                                        value={coursePreferences[currentPreferenceCourse]?.preferred_professor || ''}
                                        onValueChange={(value) => handlePreferenceChange(currentPreferenceCourse, 'preferred_professor', value)}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select preferred professor" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="no-preference">No Preference</SelectItem>
                                            {availableFaculty.map(faculty => (
                                                <SelectItem key={faculty._id} value={faculty._id}>
                                                    {faculty.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                ) : (
                                    <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                                        <p className="text-sm text-yellow-800">
                                            No faculty is currently assigned to this course.
                                        </p>
                                    </div>
                                )}
                            </div>

                            <div>
                                <Label htmlFor="priority">Priority</Label>
                                <Select
                                    value={coursePreferences[currentPreferenceCourse]?.priority?.toString() || '1'}
                                    onValueChange={(value) => handlePreferenceChange(currentPreferenceCourse, 'priority', parseInt(value))}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select priority" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="1">Low</SelectItem>
                                        <SelectItem value="2">Medium</SelectItem>
                                        <SelectItem value="3">High</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="flex justify-end space-x-2">
                                <Button variant="outline" onClick={() => setPreferencesDialogOpen(false)}>
                                    Cancel
                                </Button>
                                <Button onClick={() => setPreferencesDialogOpen(false)}>
                                    Save Preferences
                                </Button>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default StudentTimetable;