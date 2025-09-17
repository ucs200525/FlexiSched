import { spawn } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface OptimizationRequest {
  courses: Array<{
    id: string;
    course_code: string;
    course_name: string;
    credits: number;
    course_type: string;
    expected_students: number;
    requires_consecutive_slots?: boolean;
  }>;
  faculty: Array<{
    id: string;
    name: string;
    email: string;
    expertise?: string[];
    max_hours_per_week?: number;
    preferred_days?: string[];
    unavailable_slots?: string[];
  }>;
  rooms: Array<{
    id: string;
    room_number: string;
    room_name: string;
    capacity: number;
    room_type: string;
    equipment?: string[];
  }>;
  students: Array<{
    id: string;
    student_id: string;
    name: string;
    program: string;
    semester: number;
    enrolled_courses: string[];
  }>;
  time_slots: Array<{
    day: string;
    start_time: string;
    end_time: string;
    duration: number;
  }>;
  constraints: {
    max_hours_per_day?: number;
    min_break_duration?: number;
    lunch_break_duration?: number;
    lunch_break_start?: string;
    consecutive_lab_slots?: boolean;
    max_consecutive_hours?: number;
  };
  program: string;
  semester: number;
  batch: string;
  academic_year: string;
}

export interface OptimizationResult {
  success: boolean;
  timetable_slots: Array<{
    course_id: string;
    faculty_id: string;
    room_id: string;
    day: string;
    start_time: string;
    end_time: string;
    duration: number;
    student_ids?: string[];
  }>;
  conflicts: Array<{
    type: string;
    description: string;
    affected_slots: any[];
    severity: string;
  }>;
  optimization_score: number;
  faculty_workload: Record<string, number>;
  room_utilization: Record<string, number>;
  warnings: string[];
  execution_time: number;
  algorithm_used: string;
}

class AIEngineClient {
  private pythonProcess: any = null;
  private isServerRunning = false;
  private serverPort = 8000;

  async startAIServer(): Promise<boolean> {
    if (this.isServerRunning) {
      return true;
    }

    try {
      const aiEnginePath = join(__dirname, '..', 'ai_engine');
      
      console.log('Starting AI optimization server...');
      
      // Use the correct Python command with absolute path
      const pythonCommand = process.platform === 'win32' 
        ? join(process.cwd(), '.venv', 'Scripts', 'python.exe')
        : 'python3';
      
      this.pythonProcess = spawn(pythonCommand, ['-m', 'uvicorn', 'api_server:app', '--host', '127.0.0.1', '--port', String(this.serverPort)], {
        cwd: aiEnginePath,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      this.pythonProcess.stdout.on('data', (data: Buffer) => {
        console.log(`AI Server: ${data.toString()}`);
      });

      this.pythonProcess.stderr.on('data', (data: Buffer) => {
        console.error(`AI Server Error: ${data.toString()}`);
      });

      this.pythonProcess.on('close', (code: number) => {
        console.log(`AI server process exited with code ${code}`);
        this.isServerRunning = false;
      });

      // Wait for server to start
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Test server health
      const healthCheck = await this.testConnection();
      if (healthCheck) {
        this.isServerRunning = true;
        console.log('AI optimization server started successfully');
        return true;
      } else {
        console.error('AI server failed health check');
        return false;
      }
      
    } catch (error) {
      console.error('Failed to start AI server:', error);
      return false;
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await fetch(`http://localhost:${this.serverPort}/`);
      return response.ok;
    } catch {
      return false;
    }
  }

  async optimizeTimetable(request: OptimizationRequest, algorithm: 'constraint_solver' | 'genetic_algorithm' = 'constraint_solver'): Promise<OptimizationResult> {
    if (!this.isServerRunning) {
      await this.startAIServer();
    }

    try {
      const response = await fetch(`http://localhost:${this.serverPort}/optimize/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          request,
          algorithm
        })
      });

      if (!response.ok) {
        throw new Error(`AI optimization failed: ${response.statusText}`);
      }

      const result = await response.json();
      return result;

    } catch (error) {
      console.error('AI optimization error:', error);
      throw new Error(`AI optimization failed: ${error}`);
    }
  }

  async optimizeTimetableAsync(request: OptimizationRequest, algorithm: 'constraint_solver' | 'genetic_algorithm' = 'genetic_algorithm'): Promise<{ job_id: string; message: string; status: string }> {
    if (!this.isServerRunning) {
      await this.startAIServer();
    }

    try {
      const response = await fetch(`http://localhost:${this.serverPort}/optimize/async`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          request,
          algorithm,
          job_name: `Timetable_${request.program}_${request.batch}_${Date.now()}`
        })
      });

      if (!response.ok) {
        throw new Error(`AI optimization failed: ${response.statusText}`);
      }

      return await response.json();

    } catch (error) {
      console.error('AI optimization error:', error);
      throw new Error(`AI optimization failed: ${error}`);
    }
  }

  async getOptimizationStatus(jobId: string): Promise<any> {
    try {
      const response = await fetch(`http://localhost:${this.serverPort}/optimize/status/${jobId}`);
      
      if (!response.ok) {
        throw new Error(`Failed to get job status: ${response.statusText}`);
      }

      return await response.json();

    } catch (error) {
      console.error('Failed to get optimization status:', error);
      throw error;
    }
  }

  async analyzeConflicts(timetableSlots: any[]): Promise<any> {
    if (!this.isServerRunning) {
      await this.startAIServer();
    }

    try {
      const response = await fetch(`http://localhost:${this.serverPort}/analyze/conflicts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(timetableSlots)
      });

      if (!response.ok) {
        throw new Error(`Conflict analysis failed: ${response.statusText}`);
      }

      return await response.json();

    } catch (error) {
      console.error('Conflict analysis error:', error);
      throw error;
    }
  }

  async generateTemplateTimetable(courses: any[], faculty: any[], rooms: any[], timeSlots: any[]): Promise<any> {
    if (!this.isServerRunning) {
      await this.startAIServer();
    }

    try {
      const response = await fetch(`http://localhost:${this.serverPort}/generate/template`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          courses,
          faculty,
          rooms,
          time_slots: timeSlots
        })
      });

      if (!response.ok) {
        throw new Error(`Template generation failed: ${response.statusText}`);
      }

      return await response.json();

    } catch (error) {
      console.error('Template generation error:', error);
      throw error;
    }
  }

  // Comprehensive AI System methods

  async saveComprehensiveAdminConfig(config: any): Promise<any> {
    if (!this.isServerRunning) {
      await this.startAIServer();
    }

    try {
      const response = await fetch(`http://localhost:${this.serverPort}/api/comprehensive/admin/config`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(config)
      });

      if (!response.ok) {
        throw new Error(`Admin config save failed: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Admin config save error:', error);
      throw error;
    }
  }

  async generateComprehensiveSlots(config: any): Promise<any> {
    if (!this.isServerRunning) {
      await this.startAIServer();
    }

    try {
      const response = await fetch(`http://localhost:${this.serverPort}/api/comprehensive/generate_slots`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(config)
      });

      if (!response.ok) {
        throw new Error(`Slot generation failed: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Slot generation error:', error);
      throw error;
    }
  }

  async createComprehensiveSections(request: any): Promise<any> {
    if (!this.isServerRunning) {
      await this.startAIServer();
    }

    try {
      const response = await fetch(`http://localhost:${this.serverPort}/api/comprehensive/sectioning`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request)
      });

      if (!response.ok) {
        throw new Error(`Section creation failed: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Section creation error:', error);
      throw error;
    }
  }

  async generateComprehensiveTimetable(request: any): Promise<any> {
    if (!this.isServerRunning) {
      await this.startAIServer();
    }

    try {
      const response = await fetch(`http://localhost:${this.serverPort}/api/comprehensive/generate_timetable`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request)
      });

      if (!response.ok) {
        throw new Error(`Comprehensive timetable generation failed: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Comprehensive timetable generation error:', error);
      throw error;
    }
  }

  stopAIServer(): void {
    if (this.pythonProcess) {
      this.pythonProcess.kill();
      this.isServerRunning = false;
      console.log('AI optimization server stopped');
    }
  }
}

// Singleton instance
export const aiEngineClient = new AIEngineClient();

// Auto-start AI server when module is imported
aiEngineClient.startAIServer().catch(console.error);