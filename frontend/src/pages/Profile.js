import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiRequest, endpoints } from '../config/api';
import { toast } from 'react-hot-toast';
import {
    User,
    Mail,
    Shield,
    Clock,
    BookOpen,
    Save,
    Lock,
    Edit3,
    X,
    Check,
    Calendar,
    MapPin,
    Phone,
    Award,
    Briefcase
} from 'lucide-react';

const Profile = () => {
    const { user, hasRole } = useAuth();
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('profile');
    const [profileData, setProfileData] = useState({
        name: '',
        email: '',
        role: '',
        subjects: [],
        availableSlots: [],
        minTeachingHours: 0,
        courses: [],
        enrollmentYear: '',
        department: '',
        phone: '',
        officeLocation: '',
        bio: ''
    });

    const [passwordData, setPasswordData] = useState({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
    });

    const [editMode, setEditMode] = useState(false);
    const [formData, setFormData] = useState({});

    useEffect(() => {
        if (user) {
            fetchProfileData();
        }
    }, [user]);

    const fetchProfileData = async () => {
        try {
            setLoading(true);

            setProfileData(prev => ({
                ...prev,
                name: user?.name || '',
                email: user?.email || '',
                role: user?.role || ''
            }));

            if (hasRole('faculty')) {
                const facultyData = await apiRequest(endpoints.profile.faculty);
                setProfileData(prev => ({
                    ...prev,
                    subjects: facultyData.subjects || [],
                    availableSlots: facultyData.available_slots || [],
                    minTeachingHours: facultyData.min_teaching_hours || 0,
                    phone: facultyData.phone || '',
                    officeLocation: facultyData.office_location || '',
                    bio: facultyData.bio || ''
                }));
            } else if (hasRole('student')) {
                const studentData = await apiRequest(endpoints.profile.student);
                setProfileData(prev => ({
                    ...prev,
                    courses: studentData.courses || [],
                    enrollmentYear: studentData.enrollment_year || '',
                    phone: studentData.phone || '',
                    bio: studentData.bio || ''
                }));
            } else if (hasRole('admin')) {
                const adminData = await apiRequest(endpoints.profile.admin);
                setProfileData(prev => ({
                    ...prev,
                    department: adminData.department || '',
                    phone: adminData.phone || '',
                    officeLocation: adminData.office_location || '',
                    bio: adminData.bio || ''
                }));
            }
        } catch (error) {
            if (process.env.NODE_ENV === 'development') {
                console.error('Failed to load profile data:', error);
            }
            toast.error('Failed to load profile data');
        } finally {
            setLoading(false);
        }
    };

    const handleEditToggle = () => {
        if (editMode) {
            setFormData({});
            setEditMode(false);
        } else {
            setFormData({
                name: profileData.name,
                email: profileData.email,
                phone: profileData.phone,
                bio: profileData.bio,
                ...(hasRole('faculty') && {
                    subjects: [...profileData.subjects],
                    minTeachingHours: profileData.minTeachingHours,
                    officeLocation: profileData.officeLocation,
                    availableSlots: [...profileData.availableSlots]
                }),
                ...(hasRole('student') && {
                    enrollmentYear: profileData.enrollmentYear
                }),
                ...(hasRole('admin') && {
                    department: profileData.department,
                    officeLocation: profileData.officeLocation
                })
            });
            setEditMode(true);
        }
    };

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));
    };

    const handleSaveProfile = async () => {
        try {
            const endpoint = hasRole('faculty')
                ? endpoints.profile.faculty
                : hasRole('student')
                    ? endpoints.profile.student
                    : endpoints.profile.admin;

            const cleanData = { ...formData };

            if (hasRole('faculty')) {
                delete cleanData.enrollmentYear;
                delete cleanData.department;
            } else if (hasRole('student')) {
                delete cleanData.subjects;
                delete cleanData.availableSlots;
                delete cleanData.minTeachingHours;
                delete cleanData.officeLocation;
            } else if (hasRole('admin')) {
                delete cleanData.subjects;
                delete cleanData.availableSlots;
                delete cleanData.minTeachingHours;
                delete cleanData.enrollmentYear;
            }

            await apiRequest(endpoint, {
                method: 'PUT',
                data: cleanData
            });

            if (cleanData.name !== user.name) {
                const updatedUser = { ...user, name: cleanData.name };
                localStorage.setItem('user', JSON.stringify(updatedUser));
            }

            setProfileData(prev => ({
                ...prev,
                ...cleanData
            }));

            setEditMode(false);
            toast.success('Profile updated successfully');
        } catch (error) {
            if (process.env.NODE_ENV === 'development') {
                console.error('Failed to update profile:', error);
            }
            toast.error('Failed to update profile');
        }
    };

    const handlePasswordChange = async (e) => {
        e.preventDefault();

        if (passwordData.newPassword !== passwordData.confirmPassword) {
            toast.error('New passwords do not match');
            return;
        }

        if (passwordData.newPassword.length < 6) {
            toast.error('Password must be at least 6 characters');
            return;
        }

        try {
            await apiRequest(endpoints.auth.updatePassword, {
                method: 'POST',
                data: {
                    current_password: passwordData.currentPassword,
                    new_password: passwordData.newPassword
                }
            });

            setPasswordData({
                currentPassword: '',
                newPassword: '',
                confirmPassword: ''
            });

            toast.success('Password changed successfully');
        } catch (error) {
            if (process.env.NODE_ENV === 'development') {
                console.error('Failed to change password:', error);
            }
            toast.error('Failed to change password');
        }
    };

    const handleAddSubject = () => {
        setFormData(prev => ({
            ...prev,
            subjects: [...prev.subjects, '']
        }));
    };

    const handleRemoveSubject = (index) => {
        setFormData(prev => ({
            ...prev,
            subjects: prev.subjects.filter((_, i) => i !== index)
        }));
    };

    const handleSubjectChange = (index, value) => {
        setFormData(prev => ({
            ...prev,
            subjects: prev.subjects.map((subject, i) => i === index ? value : subject)
        }));
    };

    const handleAddAvailableSlot = () => {
        setFormData(prev => ({
            ...prev,
            availableSlots: [...prev.availableSlots, { day: '', startTime: '', endTime: '' }]
        }));
    };

    const handleRemoveAvailableSlot = (index) => {
        setFormData(prev => ({
            ...prev,
            availableSlots: prev.availableSlots.filter((_, i) => i !== index)
        }));
    };

    const handleAvailableSlotChange = (index, field, value) => {
        setFormData(prev => ({
            ...prev,
            availableSlots: prev.availableSlots.map((slot, i) =>
                i === index ? { ...slot, [field]: value } : slot
            )
        }));
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="mt-4 text-gray-600">Loading profile...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-gray-50 min-h-screen pb-8">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="bg-gradient-to-r from-blue-500 to-indigo-600 px-6 py-8 sm:px-10 sm:py-12 lg:px-8 lg:py-12">
                    <div className="flex items-center">
                        <div className="flex-shrink-0">
                            <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-lg">
                                <User className="h-10 w-10 text-blue-500" />
                            </div>
                        </div>
                        <div className="ml-6">
                            <h1 className="text-3xl font-bold text-white">
                                {profileData.name || 'User'}
                            </h1>
                            <p className="mt-1 text-sm text-blue-100">
                                {profileData.email || 'user@example.com'}
                            </p>
                            <p className="mt-1 text-sm text-blue-100 capitalize">
                                {profileData.role || 'user'}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Tab Navigation */}
                <div className="mt-8 border-b border-blue-400 border-opacity-25">
                    <nav className="flex space-x-8" aria-label="Tabs">
                        <button
                            onClick={() => setActiveTab('profile')}
                            className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'profile'
                                    ? 'border-blue-500 text-blue-500'
                                    : 'border-transparent text-blue-300 hover:text-blue-400 hover:border-blue-300'
                                }`}
                        >
                            <User className="w-5 h-5 mr-2" />
                            Profile Information
                        </button>

                        <button
                            onClick={() => setActiveTab('security')}
                            className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'security'
                                    ? 'border-blue-500 text-blue-500'
                                    : 'border-transparent text-blue-300 hover:text-blue-400 hover:border-blue-300'
                                }`}
                        >
                            <Lock className="w-5 h-5 mr-2" />
                            Security
                        </button>
                    </nav>
                </div>

                {/* Tab Content */}
                <div className="mt-6">
                    {activeTab === 'profile' && (
                        <div>
                            <div className="flex justify-between items-center mb-6">
                                <h2 className="text-lg font-medium text-gray-900">Personal Information</h2>
                                <button
                                    onClick={handleEditToggle}
                                    className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                                >
                                    {editMode ? (
                                        <>
                                            <X className="h-4 w-4 mr-2" />
                                            Cancel
                                        </>
                                    ) : (
                                        <>
                                            <Edit3 className="h-4 w-4 mr-2" />
                                            Edit Profile
                                        </>
                                    )}
                                </button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Full Name
                                    </label>
                                    {editMode ? (
                                        <input
                                            type="text"
                                            name="name"
                                            value={formData.name || ''}
                                            onChange={handleInputChange}
                                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                                        />
                                    ) : (
                                        <p className="mt-1 text-sm text-gray-900">{profileData.name}</p>
                                    )}
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Email Address
                                    </label>
                                    {editMode ? (
                                        <input
                                            type="email"
                                            name="email"
                                            value={formData.email || ''}
                                            onChange={handleInputChange}
                                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                                        />
                                    ) : (
                                        <p className="mt-1 text-sm text-gray-900">{profileData.email}</p>
                                    )}
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Phone Number
                                    </label>
                                    {editMode ? (
                                        <input
                                            type="tel"
                                            name="phone"
                                            value={formData.phone || ''}
                                            onChange={handleInputChange}
                                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                                        />
                                    ) : (
                                        <p className="mt-1 text-sm text-gray-900">{profileData.phone || 'Not provided'}</p>
                                    )}
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Role
                                    </label>
                                    <p className="mt-1 text-sm text-gray-900 capitalize">{profileData.role}</p>
                                </div>

                                {hasRole('admin') && (
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Department
                                        </label>
                                        {editMode ? (
                                            <input
                                                type="text"
                                                name="department"
                                                value={formData.department || ''}
                                                onChange={handleInputChange}
                                                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                                            />
                                        ) : (
                                            <p className="mt-1 text-sm text-gray-900">{profileData.department || 'Not specified'}</p>
                                        )}
                                    </div>
                                )}

                                {hasRole('faculty') && (
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Office Location
                                        </label>
                                        {editMode ? (
                                            <input
                                                type="text"
                                                name="officeLocation"
                                                value={formData.officeLocation || ''}
                                                onChange={handleInputChange}
                                                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                                            />
                                        ) : (
                                            <p className="mt-1 text-sm text-gray-900">{profileData.officeLocation || 'Not specified'}</p>
                                        )}
                                    </div>
                                )}

                                {hasRole('student') && (
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Enrollment Year
                                        </label>
                                        {editMode ? (
                                            <input
                                                type="text"
                                                name="enrollmentYear"
                                                value={formData.enrollmentYear || ''}
                                                onChange={handleInputChange}
                                                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                                            />
                                        ) : (
                                            <p className="mt-1 text-sm text-gray-900">{profileData.enrollmentYear || 'Not specified'}</p>
                                        )}
                                    </div>
                                )}

                                {/* Bio field - spans both columns */}
                                <div className="md:col-span-2">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Bio
                                    </label>
                                    {editMode ? (
                                        <textarea
                                            name="bio"
                                            value={formData.bio || ''}
                                            onChange={handleInputChange}
                                            rows={4}
                                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                                        />
                                    ) : (
                                        <p className="mt-1 text-sm text-gray-900">{profileData.bio || 'No bio provided'}</p>
                                    )}
                                </div>
                            </div>

                            {/* Faculty-specific fields */}
                            {hasRole('faculty') && editMode && (
                                <div className="mt-6 space-y-6">
                                    <div>
                                        <h3 className="text-lg font-medium text-gray-900 mb-4">Subjects</h3>
                                        <div className="space-y-2">
                                            {formData.subjects?.map((subject, index) => (
                                                <div key={index} className="flex items-center space-x-2">
                                                    <input
                                                        type="text"
                                                        value={subject}
                                                        onChange={(e) => handleSubjectChange(index, e.target.value)}
                                                        className="flex-1 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRemoveSubject(index)}
                                                        className="ml-2 px-3 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-red-600 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                                                    >
                                                        <X className="h-4 w-4" />
                                                    </button>
                                                </div>
                                            ))}
                                            <button
                                                type="button"
                                                onClick={handleAddSubject}
                                                className="mt-2 w-full px-3 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                                            >
                                                + Add Subject
                                            </button>
                                        </div>
                                    </div>

                                    <div>
                                        <h3 className="text-lg font-medium text-gray-900 mb-4">Available Time Slots</h3>
                                        <div className="space-y-2">
                                            {formData.availableSlots?.map((slot, index) => (
                                                <div key={index} className="flex items-center space-x-2">
                                                    <select
                                                        value={slot.day}
                                                        onChange={(e) => handleAvailableSlotChange(index, 'day', e.target.value)}
                                                        className="flex-1 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                                                    >
                                                        <option value="">Select Day</option>
                                                        <option value="Monday">Monday</option>
                                                        <option value="Tuesday">Tuesday</option>
                                                        <option value="Wednesday">Wednesday</option>
                                                        <option value="Thursday">Thursday</option>
                                                        <option value="Friday">Friday</option>
                                                        <option value="Saturday">Saturday</option>
                                                        <option value="Sunday">Sunday</option>
                                                    </select>
                                                    <input
                                                        type="time"
                                                        value={slot.startTime}
                                                        onChange={(e) => handleAvailableSlotChange(index, 'startTime', e.target.value)}
                                                        className="px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                                                        placeholder="Start Time"
                                                    />
                                                    <input
                                                        type="time"
                                                        value={slot.endTime}
                                                        onChange={(e) => handleAvailableSlotChange(index, 'endTime', e.target.value)}
                                                        className="px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                                                        placeholder="End Time"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRemoveAvailableSlot(index)}
                                                        className="ml-2 px-3 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-red-600 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                                                    >
                                                        <X className="h-4 w-4" />
                                                    </button>
                                                </div>
                                            ))}
                                            <button
                                                type="button"
                                                onClick={handleAddAvailableSlot}
                                                className="mt-2 w-full px-3 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                                            >
                                                + Add Time Slot
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {editMode && (
                                <div className="mt-8 flex justify-end">
                                    <button
                                        onClick={handleSaveProfile}
                                        className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                                    >
                                        <Save className="h-4 w-4 mr-2" />
                                        Save Changes
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'security' && (
                        <div>
                            <h2 className="text-lg font-medium text-gray-900 mb-6">Change Password</h2>

                            <form onSubmit={handlePasswordChange} className="space-y-6">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Current Password
                                    </label>
                                    <input
                                        type="password"
                                        value={passwordData.currentPassword}
                                        onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
                                        required
                                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        New Password
                                    </label>
                                    <input
                                        type="password"
                                        value={passwordData.newPassword}
                                        onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                                        required
                                        minLength={6}
                                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Confirm New Password
                                    </label>
                                    <input
                                        type="password"
                                        value={passwordData.confirmPassword}
                                        onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                                        required
                                        minLength={6}
                                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                                    />
                                </div>

                                <div>
                                    <button
                                        type="submit"
                                        className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                                    >
                                        <Lock className="h-4 w-4 mr-2" />
                                        Change Password
                                    </button>
                                </div>
                            </form>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Profile;