import React, { useState, useEffect } from 'react';
import { apiRequest, endpoints } from '../config/api';
import { Button } from '../components/ui/button.jsx';
import { Input } from '../components/ui/input.jsx';
import { Label } from '../components/ui/label.jsx';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog.jsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select.jsx';
import { toast } from 'react-hot-toast';

const Rooms = () => {
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRoom, setEditingRoom] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    capacity: '',
    type: 'classroom',
  });

  useEffect(() => {
    fetchRooms();
  }, []);

  const fetchRooms = async () => {
    try {
      const response = await apiRequest(endpoints.rooms.list);
      setRooms(response);
    } catch (error) {
      toast.error('Failed to fetch rooms');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      const data = {
        ...formData,
        capacity: parseInt(formData.capacity),
      };

      if (editingRoom) {
        await apiRequest(endpoints.rooms.update(editingRoom._id), {
          method: 'PUT',
          data: data,
        });
        toast.success('Room updated successfully');
      } else {
        await apiRequest(endpoints.rooms.create, {
          method: 'POST',
          data: data,
        });
        toast.success('Room created successfully');
      }

      setDialogOpen(false);
      setEditingRoom(null);
      setFormData({
        name: '',
        capacity: '',
        type: 'classroom',
      });
      fetchRooms();
    } catch (error) {
      toast.error('Failed to save room');
    }
  };

  const handleEdit = (room) => {
    setEditingRoom(room);
    setFormData({
      name: room.name,
      capacity: room.capacity.toString(),
      type: room.type,
    });
    setDialogOpen(true);
  };

  const handleDelete = async (roomId) => {
    if (!window.confirm('Are you sure you want to delete this room?')) return;

    try {
      await apiRequest(endpoints.rooms.delete(roomId), {
        method: 'DELETE',
      });
      toast.success('Room deleted successfully');
      fetchRooms();
    } catch (error) {
      toast.error('Failed to delete room');
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Room Management</h1>
        <p className="page-subtitle">Manage all rooms and facilities</p>
      </div>

      <div className="table-container">
        <div className="table-header">
          <h2 className="table-title">All Rooms</h2>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button
                onClick={() => {
                  setEditingRoom(null);
                  setFormData({
                    name: '',
                    capacity: '',
                    type: 'classroom',
                  });
                }}
                data-testid="add-room-button"
              >
                Add Room
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingRoom ? 'Edit Room' : 'Add New Room'}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit}>
                <div style={{ marginBottom: '1rem' }}>
                  <Label htmlFor="name">Room Name</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                    data-testid="room-name-input"
                  />
                </div>

                <div style={{ marginBottom: '1rem' }}>
                  <Label htmlFor="capacity">Capacity</Label>
                  <Input
                    id="capacity"
                    type="number"
                    value={formData.capacity}
                    onChange={(e) => setFormData({ ...formData, capacity: e.target.value })}
                    required
                    data-testid="room-capacity-input"
                  />
                </div>

                <div style={{ marginBottom: '1.5rem' }}>
                  <Label htmlFor="type">Room Type</Label>
                  <Select
                    value={formData.type}
                    onValueChange={(value) => setFormData({ ...formData, type: value })}
                  >
                    <SelectTrigger data-testid="room-type-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="classroom">Classroom</SelectItem>
                      <SelectItem value="lab">Lab</SelectItem>
                      <SelectItem value="auditorium">Auditorium</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button type="submit" className="w-full" data-testid="room-submit-button">
                  {editingRoom ? 'Update Room' : 'Add Room'}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {loading ? (
          <div className="loading-state">
            <div className="loading-spinner"></div>
            <p>Loading rooms...</p>
          </div>
        ) : rooms.length === 0 ? (
          <div className="empty-state">
            <p>No rooms found. Add your first room!</p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Room Name</th>
                <th>Capacity</th>
                <th>Type</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rooms.map((room) => (
                <tr key={room._id} data-testid={`room-row-${room.name}`}>
                  <td><strong>{room.name}</strong></td>
                  <td>{room.capacity}</td>
                  <td>
                    <span className={`badge badge-${room.type}`}>
                      {room.type}
                    </span>
                  </td>
                  <td>
                    <button
                      className="btn-action btn-edit"
                      onClick={() => handleEdit(room)}
                      data-testid={`edit-room-${room.name}`}
                    >
                      Edit
                    </button>
                    <button
                      className="btn-action btn-delete"
                      onClick={() => handleDelete(room._id)}
                      data-testid={`delete-room-${room.name}`}
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

export default Rooms;