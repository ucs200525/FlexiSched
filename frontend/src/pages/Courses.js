import React, { useState, useEffect } from 'react';
import { apiRequest, endpoints } from '../config/api';
import { Button } from '../components/ui/button.jsx';
import { Input } from '../components/ui/input.jsx';
import { Label } from '../components/ui/label.jsx';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog.jsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select.jsx';
import { toast } from 'react-hot-toast';

const Courses = () => {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    credits: '',
    category: 'Major',
    duration_hours: '1',
    hasLab: false,
    labDetails: {
      name: '',
      code: '',
      credits: '',
      duration_hours: '2'
    }
  });

  const [creditLimits, setCreditLimits] = useState({
    minCredits: 15,
    maxCredits: 25
  });
  const [creditLimitsDialogOpen, setCreditLimitsDialogOpen] = useState(false);
  const [creditLimitsForm, setCreditLimitsForm] = useState({
    minCredits: 15,
    maxCredits: 25
  });

  useEffect(() => {
    fetchCourses();
    fetchCreditLimits();
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

  const fetchCreditLimits = async () => {
    try {
      const response = await apiRequest(endpoints.settings.creditLimits);
      if (response) {
        setCreditLimits(response);
        setCreditLimitsForm(response);
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.log('Credit limits not configured, using defaults');
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      if (editingCourse) {
        const updateData = {
          name: formData.name,
          code: formData.code,
          credits: parseInt(formData.credits),
          category: formData.category,
          duration_hours: parseInt(formData.duration_hours),
        };

        await apiRequest(endpoints.courses.update(editingCourse._id), {
          method: 'PUT',
          data: updateData,
        });
        toast.success('Course updated successfully');

      } else {
        const theoryCourseData = {
          name: formData.name,
          code: formData.code,
          credits: parseInt(formData.credits),
          category: formData.category,
          duration_hours: parseInt(formData.duration_hours),
          is_lab: false,
        };

        await apiRequest(endpoints.courses.create, {
          method: 'POST',
          data: theoryCourseData,
        });

        if (formData.hasLab && formData.labDetails.name && formData.labDetails.code && formData.labDetails.credits) {
          const labCourseData = {
            name: formData.labDetails.name,
            code: formData.labDetails.code,
            credits: parseInt(formData.labDetails.credits),
            category: formData.category,
            duration_hours: parseInt(formData.labDetails.duration_hours),
            is_lab: true,
          };

          await apiRequest(endpoints.courses.create, {
            method: 'POST',
            data: labCourseData,
          });
        }

        toast.success(formData.hasLab ? 'Theory and Lab courses created successfully' : 'Course created successfully');
      }

      setDialogOpen(false);
      setEditingCourse(null);
      setFormData({
        name: '',
        code: '',
        credits: '',
        category: 'Major',
        duration_hours: '1',
        hasLab: false,
        labDetails: {
          name: '',
          code: '',
          credits: '',
          duration_hours: '2'
        }
      });
      fetchCourses();
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Save course error:', error);
      }
      toast.error(error.message || 'Failed to save course');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreditLimitsSubmit = async (e) => {
    e.preventDefault();

    try {
      if (parseInt(creditLimitsForm.minCredits) >= parseInt(creditLimitsForm.maxCredits)) {
        toast.error('Minimum credits must be less than maximum credits');
        return;
      }

      const data = {
        minCredits: parseInt(creditLimitsForm.minCredits),
        maxCredits: parseInt(creditLimitsForm.maxCredits)
      };

      if (process.env.NODE_ENV === 'development') {
        console.log('Sending credit limits data:', data);
      }

      await apiRequest(endpoints.settings.creditLimits, {
        method: 'POST',
        data: data,
      });

      setCreditLimits(creditLimitsForm);
      setCreditLimitsDialogOpen(false);
      toast.success('Credit limits updated successfully');
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Update credit limits error:', error);
      }
      toast.error(error.message || 'Failed to update credit limits');
    }
  };

  const handleEdit = (course) => {
    setEditingCourse(course);
    setFormData({
      name: course.name,
      code: course.code,
      credits: course.credits.toString(),
      category: course.category,
      duration_hours: course.duration_hours.toString(),
      hasLab: false,
      labDetails: {
        name: '',
        code: '',
        credits: '',
        duration_hours: '2'
      }
    });
    setDialogOpen(true);
  };

  const handleDelete = async (courseId) => {
    if (!window.confirm('Are you sure you want to delete this course?')) return;

    try {
      await apiRequest(endpoints.courses.delete(courseId), {
        method: 'DELETE',
      });
      toast.success('Course deleted successfully');
      fetchCourses();
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Delete course error:', error);
      }
      toast.error('Failed to delete course');
    }
  };

  const handleTheoryCourseChange = (field, value) => {
    setFormData(prev => {
      const newData = { ...prev, [field]: value };

      if (prev.hasLab) {
        if (field === 'name') {
          newData.labDetails.name = `${value} Lab`;
        } else if (field === 'code') {
          newData.labDetails.code = `${value}L`;
        }
      }

      return newData;
    });
  };

  const handleHasLabChange = (hasLab) => {
    setFormData(prev => {
      if (hasLab) {
        return {
          ...prev,
          hasLab: true,
          labDetails: {
            name: `${prev.name} Lab`,
            code: `${prev.code}L`,
            credits: prev.credits ? Math.max(1, parseInt(prev.credits) - 1).toString() : '1',
            duration_hours: '2'
          }
        };
      } else {
        return { ...prev, hasLab: false };
      }
    });
  };

  const validateForm = () => {
    if (!formData.name.trim()) {
      toast.error('Course name is required');
      return false;
    }
    if (!formData.code.trim()) {
      toast.error('Course code is required');
      return false;
    }
    if (!formData.credits || parseInt(formData.credits) < 1) {
      toast.error('Valid credits are required');
      return false;
    }
    if (formData.hasLab) {
      if (!formData.labDetails.name.trim()) {
        toast.error('Lab course name is required');
        return false;
      }
      if (!formData.labDetails.code.trim()) {
        toast.error('Lab course code is required');
        return false;
      }
      if (!formData.labDetails.credits || parseInt(formData.labDetails.credits) < 1) {
        toast.error('Valid lab credits are required');
        return false;
      }
    }
    return true;
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Course Management</h1>
        <p className="page-subtitle">Manage all courses in the system</p>
      </div>

      {/* New section for credit limits */}
      <div style={{ background: 'white', borderRadius: '12px', padding: '1.5rem', marginBottom: '2rem', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '0.5rem' }}>Timetable Credit Limits</h3>
            <p style={{ color: '#64748b', fontSize: '0.9rem' }}>
              Set minimum and maximum credit limits for student timetable generation
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '0.85rem', color: '#64748b' }}>Minimum</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#3b82f6' }}>{creditLimits.minCredits}</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '0.85rem', color: '#64748b' }}>Maximum</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#3b82f6' }}>{creditLimits.maxCredits}</div>
            </div>
            <Dialog open={creditLimitsDialogOpen} onOpenChange={setCreditLimitsDialogOpen}>
              <DialogTrigger asChild>
                <Button
                  onClick={() => setCreditLimitsForm(creditLimits)}
                  data-testid="edit-credit-limits-button"
                >
                  Edit Limits
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Edit Credit Limits</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleCreditLimitsSubmit}>
                  <div style={{ marginBottom: '1rem' }}>
                    <Label htmlFor="minCredits">Minimum Credits</Label>
                    <Input
                      id="minCredits"
                      type="number"
                      min="1"
                      max="30"
                      value={creditLimitsForm.minCredits}
                      onChange={(e) => setCreditLimitsForm({ ...creditLimitsForm, minCredits: e.target.value })}
                      required
                      data-testid="min-credits-input"
                    />
                  </div>

                  <div style={{ marginBottom: '1.5rem' }}>
                    <Label htmlFor="maxCredits">Maximum Credits</Label>
                    <Input
                      id="maxCredits"
                      type="number"
                      min="1"
                      max="30"
                      value={creditLimitsForm.maxCredits}
                      onChange={(e) => setCreditLimitsForm({ ...creditLimitsForm, maxCredits: e.target.value })}
                      required
                      data-testid="max-credits-input"
                    />
                  </div>

                  <Button type="submit" className="w-full" data-testid="credit-limits-submit-button">
                    Update Credit Limits
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>

      <div className="table-container">
        <div className="table-header">
          <h2 className="table-title">All Courses</h2>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button
                onClick={() => {
                  setEditingCourse(null);
                  setFormData({
                    name: '',
                    code: '',
                    credits: '',
                    category: 'Major',
                    duration_hours: '1',
                    hasLab: false,
                    labDetails: {
                      name: '',
                      code: '',
                      credits: '',
                      duration_hours: '2'
                    }
                  });
                }}
                data-testid="add-course-button"
              >
                Add Course
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingCourse ? 'Edit Course' : 'Add New Course'}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit}>
                <div style={{ marginBottom: '1rem' }}>
                  <Label htmlFor="name">Course Name</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => handleTheoryCourseChange('name', e.target.value)}
                    required
                    data-testid="course-name-input"
                  />
                </div>

                <div style={{ marginBottom: '1rem' }}>
                  <Label htmlFor="code">Course Code</Label>
                  <Input
                    id="code"
                    value={formData.code}
                    onChange={(e) => handleTheoryCourseChange('code', e.target.value)}
                    required
                    data-testid="course-code-input"
                  />
                </div>

                <div style={{ marginBottom: '1rem' }}>
                  <Label htmlFor="credits">Credits</Label>
                  <Input
                    id="credits"
                    type="number"
                    min="1"
                    max="10"
                    value={formData.credits}
                    onChange={(e) => setFormData({ ...formData, credits: e.target.value })}
                    required
                    data-testid="course-credits-input"
                  />
                </div>

                <div style={{ marginBottom: '1rem' }}>
                  <Label htmlFor="category">Category (NEP 2020)</Label>
                  <Select
                    value={formData.category}
                    onValueChange={(value) => setFormData({ ...formData, category: value })}
                  >
                    <SelectTrigger data-testid="course-category-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Major">Major</SelectItem>
                      <SelectItem value="Minor">Minor</SelectItem>
                      <SelectItem value="SEC">SEC (Skill Enhancement)</SelectItem>
                      <SelectItem value="AEC">AEC (Ability Enhancement)</SelectItem>
                      <SelectItem value="VAC">VAC (Value Added)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div style={{ marginBottom: '1rem' }}>
                  <Label htmlFor="duration">Duration (hours)</Label>
                  <Input
                    id="duration"
                    type="number"
                    min="1"
                    max="5"
                    value={formData.duration_hours}
                    onChange={(e) => setFormData({ ...formData, duration_hours: e.target.value })}
                    required
                    data-testid="course-duration-input"
                  />
                </div>

                {/* Only show "has lab" option when creating a new course */}
                {!editingCourse && (
                  <div style={{ marginBottom: '1.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <input
                        type="checkbox"
                        id="hasLab"
                        checked={formData.hasLab}
                        onChange={(e) => handleHasLabChange(e.target.checked)}
                        data-testid="course-has-lab-checkbox"
                      />
                      <Label htmlFor="hasLab" style={{ marginBottom: 0 }}>This course has a lab component</Label>
                    </div>
                  </div>
                )}

                {/* Lab details section - only shown when hasLab is true and not editing */}
                {formData.hasLab && !editingCourse && (
                  <div style={{
                    padding: '1rem',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    marginBottom: '1.5rem',
                    backgroundColor: '#f8fafc'
                  }}>
                    <h4 style={{ marginTop: 0, marginBottom: '1rem', color: '#475569' }}>Lab Course Details</h4>

                    <div style={{ marginBottom: '1rem' }}>
                      <Label htmlFor="labName">Lab Course Name</Label>
                      <Input
                        id="labName"
                        value={formData.labDetails.name}
                        onChange={(e) => setFormData({
                          ...formData,
                          labDetails: { ...formData.labDetails, name: e.target.value }
                        })}
                        required={formData.hasLab}
                        data-testid="lab-name-input"
                      />
                    </div>

                    <div style={{ marginBottom: '1rem' }}>
                      <Label htmlFor="labCode">Lab Course Code</Label>
                      <Input
                        id="labCode"
                        value={formData.labDetails.code}
                        onChange={(e) => setFormData({
                          ...formData,
                          labDetails: { ...formData.labDetails, code: e.target.value }
                        })}
                        required={formData.hasLab}
                        data-testid="lab-code-input"
                      />
                    </div>

                    <div style={{ marginBottom: '1rem' }}>
                      <Label htmlFor="labCredits">Lab Credits</Label>
                      <Input
                        id="labCredits"
                        type="number"
                        min="1"
                        max="10"
                        value={formData.labDetails.credits}
                        onChange={(e) => setFormData({
                          ...formData,
                          labDetails: { ...formData.labDetails, credits: e.target.value }
                        })}
                        required={formData.hasLab}
                        data-testid="lab-credits-input"
                      />
                    </div>

                    <div style={{ marginBottom: '1rem' }}>
                      <Label htmlFor="labDuration">Lab Duration (hours)</Label>
                      <Select
                        value={formData.labDetails.duration_hours}
                        onValueChange={(value) => setFormData({
                          ...formData,
                          labDetails: { ...formData.labDetails, duration_hours: value }
                        })}
                      >
                        <SelectTrigger data-testid="lab-duration-select">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="2">2 hours</SelectItem>
                          <SelectItem value="3">3 hours</SelectItem>
                          <SelectItem value="4">4 hours</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}

                <Button
                  type="submit"
                  className="w-full"
                  data-testid="course-submit-button"
                  disabled={submitting}
                >
                  {submitting ? 'Processing...' : (editingCourse ? 'Update Course' : 'Add Course')}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {loading ? (
          <div className="loading-state">
            <div className="loading-spinner"></div>
            <p>Loading courses...</p>
          </div>
        ) : courses.length === 0 ? (
          <div className="empty-state">
            <p>No courses found. Add your first course!</p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Credits</th>
                <th>Category</th>
                <th>Duration</th>
                <th>Type</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {courses.map((course) => (
                <tr key={course._id} data-testid={`course-row-${course.code}`}>
                  <td><strong>{course.code}</strong></td>
                  <td>{course.name}</td>
                  <td>{course.credits}</td>
                  <td>
                    <span className={`badge badge-${course.category.toLowerCase()}`}>
                      {course.category}
                    </span>
                  </td>
                  <td>{course.duration_hours}h</td>
                  <td>
                    <span className={`badge badge-${course.is_lab ? 'practical' : 'theory'}`}>
                      {course.is_lab ? 'Practical/Lab' : 'Theory'}
                    </span>
                  </td>
                  <td>
                    <button
                      className="btn-action btn-edit"
                      onClick={() => handleEdit(course)}
                      data-testid={`edit-course-${course.code}`}
                    >
                      Edit
                    </button>
                    <button
                      className="btn-action btn-delete"
                      onClick={() => handleDelete(course._id)}
                      data-testid={`delete-course-${course.code}`}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default Courses;