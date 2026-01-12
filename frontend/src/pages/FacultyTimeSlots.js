import React, { useState, useEffect } from 'react';
import { apiRequest, endpoints } from '../config/api';
import { toast } from 'react-hot-toast';
import { Calendar, Clock, Save, BookOpen, AlertCircle, X, Coffee, RefreshCw } from 'lucide-react';

const FacultyTimeSlots = () => {
    const [baseTimetable, setBaseTimetable] = useState(null);
    const [facultyCourses, setFacultyCourses] = useState([]);
    const [preferences, setPreferences] = useState({});
    const [selectedCourse, setSelectedCourse] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [refreshing, setRefreshing] = useState(false);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async (isRefresh = false) => {
        try {
            if (isRefresh) {
                setRefreshing(true);
            } else {
                setLoading(true);
            }

            const [baseTimetableRes, coursesRes, preferencesRes] = await Promise.all([
                apiRequest(endpoints.timetable.base.get),
                apiRequest(endpoints.faculty.courses),
                apiRequest(endpoints.faculty.timetablePreferences).catch(() => [])
            ]);

            setBaseTimetable(baseTimetableRes);
            setFacultyCourses(coursesRes);

            const preferencesMap = {};
            preferencesRes.forEach(pref => {
                const key = `${pref.day}-${pref.start_time}`;
                preferencesMap[key] = pref;
            });
            setPreferences(preferencesMap);

            if (coursesRes.length > 0) {
                setSelectedCourse(coursesRes[0]._id);
            }
        } catch (error) {
            if (process.env.NODE_ENV === 'development') {
                console.error('Failed to load data:', error);
            }
            toast.error('Failed to load data');
        } finally {
            if (isRefresh) {
                setRefreshing(false);
            } else {
                setLoading(false);
            }
        }
    };

    const generateTimeSlots = () => {
        if (!baseTimetable) return [];

        const { startTime, endTime, classDuration, lunchBreakDuration } = baseTimetable;
        const slots = [];
        let currentTime = startTime;

        const lunchBreakHours = parseFloat(lunchBreakDuration);
        const classDurationHours = parseFloat(classDuration);

        const [startHour] = startTime.split(':').map(Number);
        const [endHour] = endTime.split(':').map(Number);
        const totalHours = endHour - startHour;
        const lunchStartHour = startHour + (totalHours / 2) - (lunchBreakHours / 2);
        const lunchStart = `${String(Math.floor(lunchStartHour)).padStart(2, '0')}:00`;
        const lunchEndHour = lunchStartHour + lunchBreakHours;
        const lunchEnd = `${String(Math.floor(lunchEndHour)).padStart(2, '0')}:00`;

        while (currentTime < endTime) {
            if (currentTime === lunchStart) {
                slots.push({
                    time: `${lunchStart} - ${lunchEnd}`,
                    value: currentTime,
                    isLunchBreak: true
                });
                currentTime = lunchEnd;
                continue;
            }

            const [slotStartHour, slotStartMin] = currentTime.split(':').map(Number);
            const duration = classDurationHours;
            const endHour = slotStartHour + Math.floor(duration);
            const endMin = slotStartMin + (duration % 1) * 60;

            const endHourFormatted = endHour + Math.floor(endMin / 60);
            const endMinFormatted = endMin % 60;

            const endTimeStr = `${String(endHourFormatted).padStart(2, '0')}:${String(endMinFormatted).padStart(2, '0')}`;

            slots.push({
                time: `${currentTime} - ${endTimeStr}`,
                value: currentTime
            });

            const nextHour = slotStartHour + Math.floor(duration);
            const nextMin = slotStartMin + (duration % 1) * 60;
            currentTime = `${String(nextHour + Math.floor(nextMin / 60)).padStart(2, '0')}:${String(nextMin % 60).padStart(2, '0')}`;
        }

        return slots;
    };

    const handleSlotClick = (day, timeSlot) => {
        if (timeSlot.isLunchBreak) {
            toast.error('The lunch break period is not available for scheduling.');
            return;
        }

        if (!selectedCourse) {
            toast.error('Please select a course first');
            return;
        }

        const course = facultyCourses.find(c => c._id === selectedCourse);
        if (!course) {
            toast.error('Selected course not found. Please refresh.');
            return;
        }

        const courseDuration = parseInt(course.duration_hours);
        const clickedSlotIndex = timeSlots.findIndex(slot => slot.value === timeSlot.value);

        if (clickedSlotIndex === -1) {
            toast.error('Invalid time slot selected.');
            return;
        }

        const courseEndTime = clickedSlotIndex + courseDuration;
        if (courseEndTime > timeSlots.length) {
            toast.error(`Insufficient time for a ${courseDuration}-hour class at this time. The class would run past the end of the day.`);
            return;
        }

        for (let i = clickedSlotIndex; i < courseEndTime; i++) {
            const slotToCheck = timeSlots[i];
            if (slotToCheck.isLunchBreak) {
                toast.error(`This class clashes with lunch break.`);
                return;
            }

            const key = `${day}-${slotToCheck.value}`;
            const existingPref = preferences[key];

            if (existingPref && existingPref.course_id !== selectedCourse) {
                toast.error(`This time slot clashes with another class: ${existingPref.course_name} (${existingPref.course_code}).`);
                return;
            }
        }

        const newPreferences = { ...preferences };
        for (let i = clickedSlotIndex; i < courseEndTime; i++) {
            const slotKey = `${day}-${timeSlots[i].value}`;
            newPreferences[slotKey] = {
                course_id: selectedCourse,
                course_name: course.name,
                course_code: course.code,
                day,
                start_time: timeSlots[i].value,
                end_time: timeSlots[courseEndTime - 1].time.split(' - ')[1]
            };
        }

        setPreferences(newPreferences);
        toast.success(`${course.name} scheduled successfully.`);
    };

    const handleSavePreferences = async () => {
        try {
            setSaving(true);
            const preferencesArray = Object.values(preferences);
            await apiRequest(endpoints.faculty.timetablePreferences, {
                method: 'PUT',
                data: { preferences: preferencesArray }
            });
            toast.success('Time slot preferences saved successfully');
        } catch (error) {
            if (process.env.NODE_ENV === 'development') {
                console.error('Failed to save preferences:', error);
            }
            toast.error('Failed to save preferences');
        } finally {
            setSaving(false);
        }
    };

    const handleRefresh = () => {
        fetchData(true);
    };

    const timeSlots = generateTimeSlots();
    const days = baseTimetable?.days || ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

    const shouldRenderSlot = (day, slotIndex) => {
        const slot = timeSlots[slotIndex];
        const key = `${day}-${slot.value}`;
        const pref = preferences[key];

        if (!pref) return true;

        if (pref.course_id === selectedCourse) {
            return true;
        }

        const course = facultyCourses.find(c => c._id === pref.course_id);
        if (course) {
            const courseDuration = parseInt(course.duration_hours);
            const courseStartIndex = timeSlots.findIndex(s => s.value === pref.start_time);

            if (courseStartIndex !== -1) {
                for (let i = 0; i < courseDuration; i++) {
                    if (courseStartIndex + i === slotIndex) {
                        return true;
                    }
                }
            }
        }

        return false;
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="mt-4 text-gray-600">Loading timetable...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-gray-50 min-h-screen pb-8">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="py-6">
                    <div className="md:flex md:items-center md:justify-between mb-6">
                        <div className="flex-1 min-w-0">
                            <h2 className="text-2xl font-bold leading-7 text-gray-900 sm:text-3xl sm:truncate">
                                My Teaching Schedule
                            </h2>
                            <p className="mt-1 text-sm text-gray-500">
                                Select time slots for your courses based on the base timetable structure
                            </p>
                        </div>
                        <div className="mt-4 flex md:mt-0 md:ml-4">
                            <button
                                onClick={handleRefresh}
                                disabled={refreshing}
                                className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 mr-2 disabled:opacity-50"
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
                            <button
                                onClick={handleSavePreferences}
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
                                        <Save className="h-4 w-4 mr-2" />
                                        Save Preferences
                                    </>
                                )}
                            </button>
                        </div>
                    </div>

                    <div className="bg-white shadow overflow-hidden sm:rounded-md mb-6">
                        <div className="px-4 py-5 sm:p-6 border-b border-gray-200">
                            <div className="flex items-center">
                                <BookOpen className="h-5 w-5 text-gray-400 mr-3" />
                                <label htmlFor="course-select" className="block text-sm font-medium text-gray-700 mr-3">
                                    Select Course:
                                </label>
                                <select
                                    id="course-select"
                                    value={selectedCourse}
                                    onChange={(e) => setSelectedCourse(e.target.value)}
                                    className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md max-w-xs"
                                >
                                    {facultyCourses.map(course => (
                                        <option key={course._id} value={course._id}>
                                            {course.name} ({course.code}) - {course.duration_hours}h
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white shadow overflow-hidden sm:rounded-lg">
                        <div className="px-4 py-5 sm:p-6 border-b border-gray-200">
                            <div className="flex items-center">
                                <Calendar className="h-5 w-5 text-gray-400 mr-3" />
                                <h3 className="text-lg leading-6 font-medium text-gray-900">
                                    Weekly Timetable
                                </h3>
                            </div>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Time
                                        </th>
                                        {days.map(day => (
                                            <th key={day} scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                {day}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {timeSlots.map((slot, slotIndex) => (
                                        <tr key={slotIndex} className={slotIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                                <div className="flex items-center">
                                                    {slot.isLunchBreak ? (
                                                        <Coffee className="h-4 w-4 text-orange-500 mr-2" />
                                                    ) : (
                                                        <Clock className="h-4 w-4 text-gray-400 mr-2" />
                                                    )}
                                                    {slot.time}
                                                </div>
                                            </td>
                                            {days.map(day => {
                                                if (!shouldRenderSlot(day, slotIndex)) {
                                                    return null;
                                                }

                                                const key = `${day}-${slot.value}`;
                                                const pref = preferences[key];
                                                const isSelected = pref && pref.course_id === selectedCourse;

                                                return (
                                                    <td
                                                        key={key}
                                                        onClick={() => handleSlotClick(day, slot)}
                                                        className={`px-6 py-4 whitespace-nowrap text-sm cursor-pointer hover:bg-gray-100 ${slot.isLunchBreak ? 'bg-orange-100 text-orange-800 font-medium' :
                                                                isSelected ? 'bg-blue-100 text-blue-800 font-medium' :
                                                                    pref ? 'bg-red-100 text-red-800' :
                                                                        'text-gray-500'
                                                            }`}
                                                    >
                                                        {pref ? (
                                                            <div className="flex items-center justify-between">
                                                                <div>
                                                                    <div className="font-medium">{pref.course_code}</div>
                                                                    <div className="text-xs">{pref.course_name}</div>
                                                                </div>
                                                                {isSelected && (
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            handleSlotClick(day, slot);
                                                                        }}
                                                                        className="ml-2 p-1 rounded-full bg-blue-200 hover:bg-blue-300 text-blue-800"
                                                                    >
                                                                        <X className="h-4 w-4" />
                                                                    </button>
                                                                )}
                                                            </div>
                                                        ) : (
                                                            <span className={slot.isLunchBreak ? 'font-medium' : 'text-gray-400'}>
                                                                {slot.isLunchBreak ? 'Lunch Break' : 'Available'}
                                                            </span>
                                                        )}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="px-4 py-5 sm:p-6 border-t border-gray-200">
                            <div className="flex items-start">
                                <AlertCircle className="h-5 w-5 text-yellow-400 mr-3 mt-0.5" />
                                <div className="text-sm text-gray-700">
                                    <p className="font-medium">How to use this timetable:</p>
                                    <ul className="list-disc list-inside mt-1 space-y-1">
                                        <li>Select a course from the dropdown above (shows duration)</li>
                                        <li>Click on an available time slot to assign the course</li>
                                        <li>Multi-hour classes will automatically occupy consecutive slots</li>
                                        <li>Click on a blue slot to remove the assignment</li>
                                        <li>Red slots indicate a class is already scheduled</li>
                                        <li>Orange slots are the designated lunch break</li>
                                        <li>Click "Save Preferences" when you're done</li>
                                        <li>Click "Refresh" to update the course list after changes</li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default FacultyTimeSlots;