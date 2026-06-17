export interface Worker {
  id: string;
  name: string;
  employee_id?: string;
  department: string;
  photo_url: string | null;
  face_encoding?: number[] | null;
  has_face_encoding?: boolean;
  encoding_status?: 'valid' | 'missing' | 'invalid';
  enrolled_at: string;
  active: number;
}

export interface AttendanceEvent {
  id: string;
  worker_id: string;
  event_type: 'clock_in' | 'clock_out';
  kiosk_id: string | null;
  timestamp: string;
  synced: number;
}

export interface Kiosk {
  id: string;
  name: string;
  kiosk_id: string | null;
  type: 'entry' | 'exit';
  location: string;
  last_sync: string | null;
  active: number;
}

export interface AttendanceWithWorker extends AttendanceEvent {
  worker_name: string;
  worker_department: string;
  kiosk_name?: string;
}

export interface DashboardStats {
  totalWorkers: number;
  clockedIn: number;
  clockedOut: number;
  notArrived: number;
  scheduleWarning?: string;
}

export interface Schedule {
  id: string;
  name: string;
  days: string; // JSON array e.g. '[1,2,3,4,5]'
  start_time: string;
  end_time: string;
  department: string | null;
  active: number;
  created_at: string;
}
