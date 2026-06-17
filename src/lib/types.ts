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

export type RecognitionDecision = string;
export type RecognitionReviewStatus = 'unreviewed' | 'confirmed' | 'corrected' | 'ignored';
export type RecognitionConfidenceBand = 'high' | 'medium' | 'low';

export interface RecognitionAttempt {
  id: string;
  kiosk_id: string | null;
  kiosk_name?: string | null;
  candidate_worker_id?: string | null;
  candidate_worker_name?: string | null;
  decision: RecognitionDecision;
  review_status: RecognitionReviewStatus;
  confidence_band?: RecognitionConfidenceBand | null;
  score: number | null;
  second_score?: number | null;
  margin: number | null;
  threshold?: number | null;
  liveness_passed?: boolean | null;
  timestamp: string;
  reviewed_at?: string | null;
  review_note?: string | null;
  model_version?: string | null;
}

export interface RecognitionAttemptSummary {
  accepted: number;
  rejected: number;
  unknown: number;
  near_miss: number;
  low_margin_accepted: number;
  median_score: number | null;
  review_backlog: number;
  total: number;
}

export interface RecognitionAttemptsResponse {
  attempts: RecognitionAttempt[];
  summary: RecognitionAttemptSummary;
  backend_unavailable?: boolean;
  warning?: string;
}
