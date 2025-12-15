// frontend/src/pages/Users.js
import React, { useState, useEffect } from 'react';
import { apiRequest, endpoints } from '../config/api';
import { Button } from '../components/ui/button.jsx';
import { Input } from '../components/ui/input.jsx';
import { Label } from '../components/ui/label.jsx';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog.jsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select.jsx';
import { toast } from 'react-hot-toast';

const Users = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    role: 'student',
    password: '',
  });

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const response = await apiRequest(endpoints.users.list);
      setUsers(response);
    } catch (error) {
      toast.error('Failed to fetch users');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Client-side validation
    if (!formData.name || formData.name.trim().length < 2) {
      toast.error('Name must be at least 2 characters long');
      return;
    }

    if (!formData.email || !formData.email.includes('@')) {
      toast.error('Please enter a valid email address');
      return;
    }

    if (!formData.password || formData.password.length < 6) {
      toast.error('Password must be at least 6 characters long');
      return;
    }

    try {
      // Properly structure data according to backend's RegisterRequest model
      const data = {
        name: formData.name.trim(),
        email: formData.email.trim().toLowerCase(),
        role: formData.role,
        password: formData.password,
      };

      console.log('Creating user with data:', data);

      await apiRequest(endpoints.users.create, {
        method: 'POST',
        data: data,
      });

      toast.success('User created successfully');

      setDialogOpen(false);
      setFormData({
        name: '',
        email: '',
        role: 'student',
        password: '',
      });
      fetchUsers();
    } catch (error) {
      console.error('Create user error:', error);
      toast.error(error.message || 'Failed to create user');
    }
  };

  const handleDelete = async (userId) => {
    if (!window.confirm('Are you sure you want to delete this user?')) return;

    try {
      await apiRequest(endpoints.users.delete(userId), {
        method: 'DELETE',
      });
      toast.success('User deleted successfully');
      fetchUsers();
    } catch (error) {
      toast.error('Failed to delete user');
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">User Management</h1>
        <p className="page-subtitle">View and manage all users in system</p>
      </div>

      <div className="table-container">
        <div className="table-header">
          <h2 className="table-title">All Users</h2>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button
                onClick={() => {
                  setFormData({
                    name: '',
                    email: '',
                    role: 'student',
                    password: '',
                  });
                }}
                data-testid="add-user-button"
              >
                Add User
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New User</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit}>
                <div style={{ marginBottom: '1rem' }}>
                  <Label htmlFor="name">Full Name</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Enter full name"
                    required
                    minLength={2}
                    data-testid="user-name-input"
                  />
                </div>

                <div style={{ marginBottom: '1rem' }}>
                  <Label htmlFor="email">Email Address</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="Enter email address"
                    required
                    data-testid="user-email-input"
                  />
                </div>

                <div style={{ marginBottom: '1rem' }}>
                  <Label htmlFor="role">Role</Label>
                  <Select
                    value={formData.role}
                    onValueChange={(value) => setFormData({ ...formData, role: value })}
                  >
                    <SelectTrigger data-testid="user-role-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="faculty">Faculty</SelectItem>
                      <SelectItem value="student">Student</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div style={{ marginBottom: '1.5rem' }}>
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder="Enter password"
                    required
                    minLength={6}
                    data-testid="user-password-input"
                  />
                  <small style={{ color: '#666', fontSize: '0.875rem', display: 'block', marginTop: '0.25rem' }}>
                    Password must be at least 6 characters long
                  </small>
                </div>

                <Button type="submit" className="w-full" data-testid="user-submit-button">
                  Add User
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {loading ? (
          <div className="loading-state">
            <div className="loading-spinner"></div>
            <p>Loading users...</p>
          </div>
        ) : users.length === 0 ? (
          <div className="empty-state">
            <p>No users found. Add your first user!</p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Created At</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user._id} data-testid={`user-row-${user.email}`}>
                  <td>{user.name}</td>
                  <td>{user.email}</td>
                  <td>
                    <span className={`badge badge-${user.role}`}>
                      {user.role}
                    </span>
                  </td>
                  <td>{new Date(user.created_at).toLocaleDateString()}</td>
                  <td>
                    {/* Only show delete button for non-admin users */}
                    {user.role !== 'admin' && (
                      <button
                        className="btn-action btn-delete"
                        onClick={() => handleDelete(user._id)}
                        data-testid={`delete-user-${user.email}`}
                      >
                        Delete
                      </button>
                    )}
                    {user.role === 'admin' && (
                      <span style={{ color: '#999', fontStyle: 'italic', fontSize: '0.875rem' }}>
                        Protected
                      </span>
                    )}
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

export default Users;