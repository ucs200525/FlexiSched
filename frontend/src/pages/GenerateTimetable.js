import React, { useState, useEffect } from 'react';
import { apiRequest, endpoints } from '../config/api';
import { Button } from '../components/ui/button.jsx';
import { Input } from '../components/ui/input.jsx';
import { Label } from '../components/ui/label.jsx';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog.jsx';
import { toast } from 'react-hot-toast';

const SegmentedControl = ({ options, value, onChange, name }) => {
  return (
    <div className="segmented-control" data-testid={`${name}-segmented-control`}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`segmented-option ${value === option.value ? 'active' : ''}`}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
};

const GenerateTimetable = () => {
  const [loading, setLoading] = useState(false);
  const [baseTimetable, setBaseTimetable] = useState(null);
  const [fetching, setFetching] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    startTime: '09:00',
    endTime: '17:00',
    classDuration: '1',
    lunchBreakDuration: '1',
    days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
  });

  useEffect(() => {
    fetchBaseTimetable();
  }, []);

  const fetchBaseTimetable = async () => {
    setFetching(true);
    try {
      const response = await apiRequest(endpoints.timetable.base.get);

      if (process.env.NODE_ENV === 'development') {
        console.log('Successfully fetched base timetable:', response);
      }

      if (response) {
        setBaseTimetable(response);
        setFormData(prev => ({
          ...prev,
          ...response,
        }));
      } else {
        setBaseTimetable(null);
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Error fetching base timetable:', error);
      }
      setBaseTimetable(null);
      setFormData({
        startTime: '09:00',
        endTime: '17:00',
        classDuration: '1',
        lunchBreakDuration: '1',
        days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
      });
    } finally {
      setFetching(false);
    }
  };

  const handleCreateBase = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const data = {
        startTime: formData.startTime,
        endTime: formData.endTime,
        classDuration: parseFloat(formData.classDuration),
        lunchBreakDuration: parseFloat(formData.lunchBreakDuration),
        days: formData.days,
      };

      await apiRequest(endpoints.timetable.base.create, {
        method: 'POST',
        data: data,
      });

      toast.success('Base timetable structure saved successfully!');
      setDialogOpen(false);

      await fetchBaseTimetable();

    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Base timetable save error:', error);
      }
      toast.error(error.message || 'Failed to save base timetable');
    } finally {
      setLoading(false);
    }
  };

  const timeToMinutes = (timeStr) => {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
  };
  const minutesToTime = (totalMinutes) => {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  };

  const generateTimeSlots = (baseTimetable) => {
    const { startTime, endTime, classDuration, lunchBreakDuration } = baseTimetable;

    const startMinutes = timeToMinutes(startTime);
    const endMinutes = timeToMinutes(endTime);
    const classDurationMinutes = parseFloat(classDuration) * 60;
    const lunchDurationMinutes = parseFloat(lunchBreakDuration) * 60;

    const allSlots = [];
    let currentMinutes = startMinutes;

    const defaultLunchStart = 13 * 60;
    let lunchStartMinutes = null;
    let lunchEndMinutes = null;

    if (endMinutes > defaultLunchStart && startMinutes < defaultLunchStart + lunchDurationMinutes) {
      lunchStartMinutes = defaultLunchStart;
      lunchEndMinutes = lunchStartMinutes + lunchDurationMinutes;
    }

    while (currentMinutes < endMinutes) {
      if (lunchStartMinutes && currentMinutes >= lunchStartMinutes && currentMinutes < lunchEndMinutes) {
        allSlots.push({
          time: `${minutesToTime(lunchStartMinutes)} - ${minutesToTime(lunchEndMinutes)}`,
          startTime: minutesToTime(lunchStartMinutes),
          endTime: minutesToTime(lunchEndMinutes),
          isLunch: true,
        });
        currentMinutes = lunchEndMinutes;
        continue;
      }

      const nextSlotEnd = currentMinutes + classDurationMinutes;

      if (nextSlotEnd <= endMinutes) {
        if (lunchStartMinutes && currentMinutes < lunchStartMinutes && nextSlotEnd > lunchStartMinutes) {
          allSlots.push({
            time: `${minutesToTime(currentMinutes)} - ${minutesToTime(lunchStartMinutes)}`,
            startTime: minutesToTime(currentMinutes),
            endTime: minutesToTime(lunchStartMinutes),
            isLunch: false,
          });
          currentMinutes = lunchStartMinutes;
        } else {
          allSlots.push({
            time: `${minutesToTime(currentMinutes)} - ${minutesToTime(nextSlotEnd)}`,
            startTime: minutesToTime(currentMinutes),
            endTime: minutesToTime(nextSlotEnd),
            isLunch: false,
          });
          currentMinutes = nextSlotEnd;
        }
      } else {
        break;
      }
    }
    const finalSlots = allSlots.sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));

    return finalSlots;
  };

  const generateBaseTimetableStructure = () => {
    if (!baseTimetable) return null;

    const timeSlots = generateTimeSlots(baseTimetable);

    return (
      <div>
        <div style={{ background: 'white', borderRadius: '12px', padding: '1.5rem', marginBottom: '2rem', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
          <h3 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '1rem' }}>Base Timetable Structure</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
            <div><strong>Time Range:</strong> {baseTimetable.startTime} - {baseTimetable.endTime}</div>
            <div><strong>Class Duration:</strong> {baseTimetable.classDuration} hour(s)</div>
            <div><strong>Lunch Break:</strong> {baseTimetable.lunchBreakDuration} hour(s)</div>
            <div><strong>Days:</strong> {baseTimetable.days.join(', ')}</div>
          </div>
          <div style={{ marginTop: '1rem', fontSize: '0.85rem', color: '#64748b' }}>
            Created on: {new Date(baseTimetable.created_at).toLocaleString()}
          </div>
        </div>

        <div className="timetable-table-container">
          <table className="timetable-table">
            <thead>
              <tr>
                <th>Time</th>
                {baseTimetable.days.map((day) => (
                  <th key={day}>{day}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {timeSlots.map((slot, index) => (
                <tr key={index}>
                  <td className="time-slot">{slot.time}</td>
                  {baseTimetable.days.map((day) => (
                    <td key={`${day}-${index}`} className={
                      slot.isLunch ? 'lunch-slot' : 'available-slot'
                    }>
                      {slot.isLunch ? 'Lunch Break' : 'Available'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Timetable Structure</h1>
        <p className="page-subtitle">Create a base timetable structure for scheduling</p>
      </div>

      <div style={{ marginBottom: '2rem' }}>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button
              onClick={() => {
              }}
              data-testid="create-base-timetable-button"
            >
              {baseTimetable ? 'Update Base Structure' : 'Create Base Structure'}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{baseTimetable ? 'Update Base Timetable Structure' : 'Create Base Timetable Structure'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateBase}>
              <div style={{ marginBottom: '1rem' }}>
                <Label htmlFor="startTime">Start Time</Label>
                <Input
                  id="startTime"
                  type="time"
                  value={formData.startTime}
                  onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                  required
                  data-testid="start-time-input"
                />
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <Label htmlFor="endTime">End Time</Label>
                <Input
                  id="endTime"
                  type="time"
                  value={formData.endTime}
                  onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                  required
                  data-testid="end-time-input"
                />
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <Label>Class Duration</Label>
                <SegmentedControl
                  name="class-duration"
                  options={[
                    { value: '0.5', label: '30 min' },
                    { value: '1', label: '1 hour' },
                    { value: '1.5', label: '1.5 hours' },
                    { value: '2', label: '2 hours' },
                    { value: '3', label: '3 hours' },
                  ]}
                  value={formData.classDuration}
                  onChange={(value) => setFormData({ ...formData, classDuration: value })}
                />
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <Label>Lunch Break Duration</Label>
                <SegmentedControl
                  name="lunch-duration"
                  options={[
                    { value: '0.5', label: '30 min' },
                    { value: '1', label: '1 hour' },
                    { value: '1.5', label: '1.5 hours' },
                    { value: '2', label: '2 hours' },
                  ]}
                  value={formData.lunchBreakDuration}
                  onChange={(value) => setFormData({ ...formData, lunchBreakDuration: value })}
                />
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <Label>Working Days</Label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                  {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((day) => (
                    <div key={day} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <input
                        type="checkbox"
                        id={`day-${day}`}
                        checked={formData.days.includes(day)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setFormData({ ...formData, days: [...formData.days, day] });
                          } else {
                            setFormData({ ...formData, days: formData.days.filter(d => d !== day) });
                          }
                        }}
                        data-testid={`day-checkbox-${day.toLowerCase()}`}
                      />
                      <Label htmlFor={`day-${day}`} style={{ marginBottom: 0 }}>{day}</Label>
                    </div>
                  ))}
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={loading} data-testid="create-base-submit">
                {loading ? 'Saving...' : (baseTimetable ? 'Update Base Structure' : 'Create Base Structure')}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {fetching && (
        <div className="loading-state">
          <div className="loading-spinner"></div>
          <p>Loading timetable structure...</p>
        </div>
      )}

      {!fetching && baseTimetable && generateBaseTimetableStructure()}

      {!fetching && !baseTimetable && (
        <div className="empty-state">
          <p>No base timetable structure created yet. Click the button above to create one!</p>
        </div>
      )}
    </div>
  );
};

export default GenerateTimetable;