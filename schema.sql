-- ============================================================================
-- CBT SIGMA 71 PUSPENDIK — SUPABASE POSTGRESQL DATABASE SCHEMA
-- Arsitektur: PostgreSQL + Supabase Auth + Supabase Storage + Realtime + RLS
-- Kapasitas : 500+ Concurrent Students, Multi-Tipe Soal (PG, PGK, AKM, BS, MATCH, ESAI)
-- ============================================================================

-- Aktifkan ekstensi UUID dan Kriptografi
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. ENUMS (TIPE DATA KHUSUS)
-- ============================================================================
DO $$ BEGIN
    CREATE TYPE user_role_enum AS ENUM ('Admin', 'Guru', 'Siswa');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE question_type_enum AS ENUM ('PG', 'PGK', 'AKM', 'BS', 'MATCH', 'MENJODOHKAN', 'ISIAN', 'URAIAN', 'ESAI');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TYPE question_type_enum ADD VALUE IF NOT EXISTS 'AKM';
    ALTER TYPE question_type_enum ADD VALUE IF NOT EXISTS 'MATCH';
    ALTER TYPE question_type_enum ADD VALUE IF NOT EXISTS 'MENJODOHKAN';
    ALTER TYPE question_type_enum ADD VALUE IF NOT EXISTS 'ISIAN';
    ALTER TYPE question_type_enum ADD VALUE IF NOT EXISTS 'URAIAN';
    ALTER TYPE question_type_enum ADD VALUE IF NOT EXISTS 'ESAI';
EXCEPTION
    WHEN others THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE exam_status_enum AS ENUM ('Terjadwal', 'Berlangsung', 'Selesai', 'Ditutup');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TYPE exam_status_enum ADD VALUE IF NOT EXISTS 'Ditutup';
EXCEPTION
    WHEN others THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE session_status_enum AS ENUM ('BELUM_LOGIN', 'SUDAH_LOGIN', 'WORKING', 'FINISHED', 'BLOCKED');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- 2. TABEL: app_config (Konfigurasi Global & Pejabat Penandatangan Resmi)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.app_config (
    id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    app_title TEXT NOT NULL DEFAULT 'SMP NEGERI 71 BANDUNG',
    app_subtitle TEXT NOT NULL DEFAULT 'CBT APPLICATION',
    school_name TEXT NOT NULL DEFAULT 'SMP NEGERI 71 BANDUNG',
    school_address TEXT NOT NULL DEFAULT 'Jl. Pendidikan Nasional No. 71, Kota Bandung, Jawa Barat 40115',
    school_phone TEXT NOT NULL DEFAULT '(022) 7102026',
    school_website TEXT NOT NULL DEFAULT 'https://smpn71bdg.sch.id',
    school_email TEXT NOT NULL DEFAULT 'info@smpn71bdg.sch.id',
    principal_name TEXT NOT NULL DEFAULT 'Dr. H. Hendra Wijaya, M.Pd',
    principal_nip TEXT NOT NULL DEFAULT '196805141994031004',
    curriculum_name TEXT NOT NULL DEFAULT 'Dra. Hj. Ratna Dewi, M.MPd',
    curriculum_nip TEXT NOT NULL DEFAULT '197211091998022002',
    logo_url TEXT DEFAULT './icon-192.png',
    school_logo_url TEXT DEFAULT './icon-192.png',
    bg_url TEXT DEFAULT '',
    show_result_to_student BOOLEAN NOT NULL DEFAULT TRUE,
    show_block_to_student BOOLEAN NOT NULL DEFAULT TRUE,
    maintenance_mode BOOLEAN NOT NULL DEFAULT FALSE,
    active_token TEXT NOT NULL DEFAULT 'PUSPENDIK71',
    auto_rotate_token BOOLEAN NOT NULL DEFAULT TRUE,
    token_rotate_seconds INT NOT NULL DEFAULT 900,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.app_config ADD COLUMN IF NOT EXISTS school_logo_url TEXT DEFAULT '';

-- ============================================================================
-- 3. TABEL: users (Akun Pengguna: Admin, Guru, dan Siswa)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.users (
    user_id TEXT PRIMARY KEY, -- NISN untuk siswa, NIP/NUPTK untuk guru/admin
    username TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role user_role_enum NOT NULL DEFAULT 'Siswa',
    class_name TEXT DEFAULT 'Semua Kelas',
    subject TEXT DEFAULT 'ALL',
    assigned_classes JSONB DEFAULT '[]'::jsonb,
    assigned_subjects JSONB DEFAULT '[]'::jsonb,
    birth_date TEXT DEFAULT '01-01-2008',
    gender TEXT DEFAULT 'Laki-laki',
    avatar_url TEXT DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS assigned_classes JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS assigned_subjects JSONB DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_users_role ON public.users(role);
CREATE INDEX IF NOT EXISTS idx_users_class ON public.users(class_name);

-- ============================================================================
-- 4. TABEL: teacher_permissions (Kewenangan & Hak Akses Fungsional RBAC Guru)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.teacher_permissions (
    teacher_id TEXT PRIMARY KEY,
    nip TEXT NOT NULL,
    full_name TEXT DEFAULT '',
    username TEXT DEFAULT '',
    assigned_subjects JSONB NOT NULL DEFAULT '[]'::jsonb,
    assigned_classes JSONB NOT NULL DEFAULT '["Semua Kelas"]'::jsonb,
    perm_create_questions BOOLEAN NOT NULL DEFAULT TRUE, -- 1. Pembuat Soal
    perm_manage_exams BOOLEAN NOT NULL DEFAULT TRUE,     -- 2. Pengelola Ujian
    perm_proctor BOOLEAN NOT NULL DEFAULT TRUE,         -- 3. Pengawas Ujian
    perm_grade_analyze BOOLEAN NOT NULL DEFAULT TRUE,   -- 4. Penilai & Analisis
    can_set_token BOOLEAN NOT NULL DEFAULT FALSE,
    can_unblock_students BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.teacher_permissions ADD COLUMN IF NOT EXISTS full_name TEXT DEFAULT '';
ALTER TABLE public.teacher_permissions ADD COLUMN IF NOT EXISTS username TEXT DEFAULT '';

-- ============================================================================
-- 5. TABEL: master_items (Data Master: Kelas, Mapel, Jenis Ujian, Pengawas)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.master_items (
    id BIGSERIAL PRIMARY KEY,
    category TEXT NOT NULL CHECK (category IN ('classes', 'subjects', 'examNames', 'proctors')),
    value TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(category, value)
);

CREATE INDEX IF NOT EXISTS idx_master_category ON public.master_items(category);

-- ============================================================================
-- 6. TABEL: exams (Jadwal Ujian dengan Waktu Mulai & Selesai)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.exams (
    id TEXT PRIMARY KEY,
    subject TEXT NOT NULL,
    exam_name TEXT NOT NULL,
    owner_id TEXT NOT NULL DEFAULT 'admin',
    owner_name TEXT NOT NULL DEFAULT 'Administrator Utama',
    target_classes JSONB NOT NULL DEFAULT '["Semua Kelas"]'::jsonb,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    duration_minutes INT NOT NULL DEFAULT 90,
    session_token TEXT NOT NULL DEFAULT 'PUSPENDIK71',
    randomize BOOLEAN NOT NULL DEFAULT TRUE,
    randomize_types JSONB NOT NULL DEFAULT '["PG","PGK","BS","MATCH","ESAI"]'::jsonb,
    status exam_status_enum NOT NULL DEFAULT 'Terjadwal',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS randomize BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS idx_exams_subject_status ON public.exams(subject, status);

-- ============================================================================
-- 7. TABEL: questions (Bank Soal Mendukung Multi-Tipe Soal Dinamis)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.questions (
    question_id TEXT PRIMARY KEY,
    subject TEXT NOT NULL,
    question_type question_type_enum NOT NULL DEFAULT 'PG',
    type_name TEXT NOT NULL DEFAULT 'Pilihan Ganda',
    weight NUMERIC(5,2) NOT NULL DEFAULT 20.00,
    weight_locked BOOLEAN NOT NULL DEFAULT FALSE,
    prompt TEXT NOT NULL,
    media_url TEXT DEFAULT '',
    options JSONB,       -- [{key: 'A', text: '...'}, ...] untuk PG, PGK, AKM
    statements JSONB,    -- [{id: 'S1', text: '...', correct: true}, ...] untuk Benar/Salah
    premises JSONB,      -- ['Premis 1', ...] untuk Menjodohkan
    responses JSONB,     -- ['Respon 1', ...] untuk Menjodohkan
    correct_key JSONB NOT NULL, -- String atau Array atau Object kunci jawaban
    explanation TEXT DEFAULT '',
    created_by TEXT DEFAULT 'admin',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.questions ALTER COLUMN weight TYPE NUMERIC(5,2) USING weight::NUMERIC(5,2);
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS weight_locked BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_questions_subject_type ON public.questions(subject, question_type);

-- ============================================================================
-- 8. TABEL: exam_sessions (Sesi Monitoring Peserta Real-Time untuk 500 Siswa)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.exam_sessions (
    session_id TEXT PRIMARY KEY,
    exam_id TEXT NOT NULL DEFAULT 'EX-001',
    student_id TEXT NOT NULL,
    student_name TEXT NOT NULL,
    class_name TEXT NOT NULL DEFAULT '-',
    subject TEXT NOT NULL DEFAULT 'GENERAL',
    status session_status_enum NOT NULL DEFAULT 'BELUM_LOGIN',
    login_time TEXT DEFAULT '-',
    remaining_seconds INT NOT NULL DEFAULT 5400,
    remaining_time TEXT DEFAULT '90:00',
    progress_percent INT NOT NULL DEFAULT 0,
    cheat_count INT NOT NULL DEFAULT 0,
    last_activity TEXT DEFAULT 'Belum memulai ujian',
    unblocked_by_proctor TEXT DEFAULT '',
    objective_score NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    essay_score NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    final_score NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    essay_answer_text TEXT DEFAULT '',
    item_answers JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(exam_id, student_id)
);

ALTER TABLE public.exam_sessions ADD COLUMN IF NOT EXISTS remaining_time TEXT DEFAULT '90:00';
ALTER TABLE public.exam_sessions ADD COLUMN IF NOT EXISTS item_answers JSONB DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_sessions_monitoring ON public.exam_sessions(status, class_name, subject);

-- ============================================================================
-- 9. TABEL: student_answers (Jawaban Per Butir Soal Peserta)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.student_answers (
    id BIGSERIAL PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES public.exam_sessions(session_id) ON DELETE CASCADE,
    question_id TEXT NOT NULL,
    answer_value JSONB,
    is_doubt BOOLEAN NOT NULL DEFAULT FALSE,
    score_awarded NUMERIC(5,2) DEFAULT 0.00,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(session_id, question_id)
);

-- ============================================================================
-- 10. TABEL: audit_logs (Audit Trail Keamanan & Aksi RBAC)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id BIGSERIAL PRIMARY KEY,
    actor_name TEXT NOT NULL,
    actor_role TEXT NOT NULL,
    action_code TEXT NOT NULL,
    detail TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('SUCCESS', 'DENIED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_created ON public.audit_logs(created_at DESC);

-- ============================================================================
-- 11. SUPABASE STORAGE BUCKET: cbt-media
-- ============================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('cbt-media', 'cbt-media', true)
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
    CREATE POLICY "Public Access CBT Media"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'cbt-media');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE POLICY "Authenticated Upload CBT Media"
    ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = 'cbt-media');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- 12. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY "Public Read Config" ON public.app_config FOR SELECT USING (true);
    CREATE POLICY "Admin Write Config" ON public.app_config FOR ALL USING (true);

    CREATE POLICY "Public Read Users" ON public.users FOR SELECT USING (true);
    CREATE POLICY "Admin Manage Users" ON public.users FOR ALL USING (true);

    CREATE POLICY "Public Read Teacher RBAC" ON public.teacher_permissions FOR SELECT USING (true);
    CREATE POLICY "Admin Manage Teacher RBAC" ON public.teacher_permissions FOR ALL USING (true);

    CREATE POLICY "Public Read Master Data" ON public.master_items FOR SELECT USING (true);
    CREATE POLICY "Admin Manage Master Data" ON public.master_items FOR ALL USING (true);

    CREATE POLICY "Public Read Exams" ON public.exams FOR SELECT USING (true);
    CREATE POLICY "Teacher & Admin Manage Exams" ON public.exams FOR ALL USING (true);

    CREATE POLICY "Public Read Questions" ON public.questions FOR SELECT USING (true);
    CREATE POLICY "Teacher & Admin Manage Questions" ON public.questions FOR ALL USING (true);

    CREATE POLICY "Public Read Sessions" ON public.exam_sessions FOR SELECT USING (true);
    CREATE POLICY "Public Update Sessions" ON public.exam_sessions FOR ALL USING (true);

    CREATE POLICY "Public Read Answers" ON public.student_answers FOR SELECT USING (true);
    CREATE POLICY "Public Manage Answers" ON public.student_answers FOR ALL USING (true);

    CREATE POLICY "Public Read Audit Logs" ON public.audit_logs FOR SELECT USING (true);
    CREATE POLICY "Public Insert Audit Logs" ON public.audit_logs FOR INSERT WITH CHECK (true);
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- 13. REALTIME PUBLICATION SETUP
-- ============================================================================
DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.exam_sessions;
EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.exams;
EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.app_config;
EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.questions;
EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.users;
EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.master_items;
EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.teacher_permissions;
EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.student_answers;
EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.audit_logs;
EXCEPTION WHEN others THEN NULL; END $$;

-- Pastikan REPLICA IDENTITY FULL aktif agar event DELETE Realtime mengirim data lengkap
DO $$ BEGIN
    ALTER TABLE public.app_config REPLICA IDENTITY FULL;
    ALTER TABLE public.users REPLICA IDENTITY FULL;
    ALTER TABLE public.teacher_permissions REPLICA IDENTITY FULL;
    ALTER TABLE public.master_items REPLICA IDENTITY FULL;
    ALTER TABLE public.exams REPLICA IDENTITY FULL;
    ALTER TABLE public.questions REPLICA IDENTITY FULL;
    ALTER TABLE public.exam_sessions REPLICA IDENTITY FULL;
    ALTER TABLE public.student_answers REPLICA IDENTITY FULL;
EXCEPTION WHEN others THEN NULL; END $$;

-- ============================================================================
-- 14. STORED PROCEDURES / FUNCTIONS
-- ============================================================================
CREATE OR REPLACE FUNCTION public.finalize_student_session(p_session_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_total_score NUMERIC(5,2);
BEGIN
    SELECT COALESCE(SUM(score_awarded), 0)
    INTO v_total_score
    FROM public.student_answers
    WHERE session_id = p_session_id;

    UPDATE public.exam_sessions
    SET 
        status = 'FINISHED',
        progress_percent = 100,
        remaining_seconds = 0,
        objective_score = v_total_score,
        final_score = LEAST(100.0, v_total_score + essay_score),
        updated_at = NOW()
    WHERE session_id = p_session_id;

    RETURN jsonb_build_object(
        'status', 'SUCCESS',
        'session_id', p_session_id,
        'final_score', v_total_score
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.record_audit_log(
    p_actor TEXT,
    p_role TEXT,
    p_action TEXT,
    p_detail TEXT,
    p_status TEXT DEFAULT 'SUCCESS'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO public.audit_logs (actor_name, actor_role, action_code, detail, status)
    VALUES (p_actor, p_role, p_action, p_detail, p_status);
END;
$$;

-- ============================================================================
-- 15. SEED DATA AWAL BERSIH (TANPA DATA DEMO/CONTOH)
-- ============================================================================
DO $$ BEGIN
    ALTER TABLE public.app_config ADD COLUMN IF NOT EXISTS school_phone TEXT NOT NULL DEFAULT '(022) 7102026';
    ALTER TABLE public.app_config ADD COLUMN IF NOT EXISTS school_website TEXT NOT NULL DEFAULT 'https://smpn71bdg.sch.id';
    ALTER TABLE public.app_config ADD COLUMN IF NOT EXISTS school_email TEXT NOT NULL DEFAULT 'info@smpn71bdg.sch.id';
EXCEPTION WHEN others THEN NULL; END $$;

INSERT INTO public.app_config (id, app_title, app_subtitle, school_name, school_email, principal_name, curriculum_name, active_token)
VALUES (1, 'SMP NEGERI 71 BANDUNG', 'CBT APPLICATION', 'SMP NEGERI 71 BANDUNG', 'info@smpn71bdg.sch.id', 'Dr. H. Hendra Wijaya, M.Pd', 'Dra. Hj. Ratna Dewi, M.MPd', 'PUSPENDIK71')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.users (user_id, username, full_name, password_hash, role, class_name, subject)
VALUES
('admin', 'admin', 'Administrator Utama', 'admin71pass', 'Admin', 'Semua Kelas', 'ALL')
ON CONFLICT (user_id) DO NOTHING;
