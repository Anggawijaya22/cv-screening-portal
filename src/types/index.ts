export type UserRole = 'developer' | 'hr_main_admin' | 'hr_admin'

export interface User {
  id: string
  nama: string
  email: string
  username: string | null
  role: UserRole
  is_active: boolean
  last_login: string | null
  created_at: string
  created_by: string | null
}

export interface Position {
  id: string
  kode: string
  nama: string
  is_active: boolean
  created_at: string
}

export type BatchStatus = 'processing' | 'completed' | 'submitted' | 'webhook_failed'

export interface CvBatch {
  id: string
  posisi_kode: string
  posisi_nama: string
  total_files: number
  processed: number
  success: number
  failed: number
  status: BatchStatus
  webhook_url: string | null
  webhook_sent_at: string | null
  created_by: string
  created_at: string
  users?: { nama: string }
}

export type ExtractStatus = 'waiting' | 'processing' | 'success' | 'failed' | 'timeout'

export interface CvCandidate {
  id: string
  batch_id: string
  nama_file: string
  file_type: 'pdf' | 'docx' | 'doc'
  file_url: string | null
  ocr_used: boolean
  cv_text: string | null
  extract_status: ExtractStatus
  error_message: string | null
  created_at: string
}

export interface ActivityLog {
  id: string
  user_id: string | null
  action: string
  detail: Record<string, unknown> | null
  status: 'success' | 'failed'
  created_at: string
  users?: { nama: string; email: string }
}

export interface AppSetting {
  key: string
  value: string | null
  updated_by: string | null
  updated_at: string
}

export interface DashboardStats {
  total_today: number
  strong_fit: number
  potential_fit: number
  low_fit: number
  hr_review: number
  trend: { date: string; count: number }[]
  per_posisi: { posisi: string; count: number }[]
  top_candidates: CvCandidate[]
}
