/**
 * ============================================================================
 * CBT SMP NEGERI 71 BANDUNG — SUPABASE EDGE FUNCTION (DENO / TYPESCRIPT)
 * Server-Side Logic: 500 Siswa Concurrent, RBAC Validation, Anti-Cheat & Storage
 * ============================================================================
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Content-Type": "application/json; charset=utf-8"
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: CORS_HEADERS });
}

function errorResponse(code: string, message: string, status = 400): Response {
  return jsonResponse({ error: { code, message } }, status);
}

serve(async (req: Request) => {
  // Handle CORS preflight request
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  const url = new URL(req.url);
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "https://lyfgwwmmubbusheavoyl.supabase.co";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx5Zmd3d21tdWJidXNoZWF2b3lsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5NDU3NDE0NiwiZXhwIjoyMTEwMTUwMTQ2fQ.vhf7GyT3ci64Jms_qc69IuEXGPkN62BYEVsc6LLHWFE";
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx5Zmd3d21tdWJidXNoZWF2b3lsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ1NzQxNDYsImV4cCI6MjExMDE1MDE0Nn0.jv2tpfGPCv08unG9JYZMkw1ns_CLNdvlD0jravWp9XM";

  const supabase = createClient(supabaseUrl, supabaseServiceKey || supabaseAnonKey);

  try {
    // 1. GET /health — Pemeriksaan Status Cluster Server Supabase
    if (url.pathname.endsWith("/health") && req.method === "GET") {
      const { data: config } = await supabase.from("app_config").select("maintenance_mode, school_name").eq("id", 1).single();
      return jsonResponse({
        status: "healthy",
        engine: "Supabase PostgreSQL + Realtime Engine",
        cluster: "500_STUDENTS_HIGH_CONCURRENCY",
        schoolName: config?.school_name || "SMP NEGERI 71 BANDUNG",
        maintenanceMode: config?.maintenance_mode || false,
        timestamp: new Date().toISOString()
      });
    }

    // 2. POST /auth/login — Validasi Kredensial Multi-Role & Sesi
    if (url.pathname.endsWith("/auth/login") && req.method === "POST") {
      const body = await req.json();
      const { username, password } = body;

      if (!username || !password) {
        return errorResponse("VALIDATION_ERROR", "Username dan password wajib diisi.", 400);
      }

      const { data: user, error: userErr } = await supabase
        .from("users")
        .select("*")
        .or(`username.eq.${username.trim()},user_id.eq.${username.trim()}`)
        .single();

      if (userErr || !user) {
        return errorResponse("INVALID_CREDENTIALS", "Username / NISN tidak terdaftar.", 401);
      }

      if (user.password_hash !== password.trim()) {
        return errorResponse("INVALID_CREDENTIALS", "Password yang dimasukkan salah.", 401);
      }

      // Cek Mode Maintenance jika role adalah Siswa
      const { data: cfg } = await supabase.from("app_config").select("maintenance_mode").eq("id", 1).single();
      if (cfg?.maintenance_mode && user.role === "Siswa") {
        return errorResponse("MAINTENANCE_ACTIVE", "Sistem sedang dalam mode pemeliharaan ujian.", 503);
      }

      // Ambil Hak Akses RBAC jika akun adalah Guru
      let teacherRbac = null;
      if (user.role === "Guru") {
        const { data: rbac } = await supabase.from("teacher_permissions").select("*").eq("teacher_id", user.user_id).single();
        teacherRbac = rbac;
      }

      return jsonResponse({
        status: "SUCCESS",
        user: {
          id: user.user_id,
          username: user.username,
          name: user.full_name,
          role: user.role,
          className: user.class_name,
          subject: user.subject,
          avatarUrl: user.avatar_url
        },
        teacherRbac,
        token: `sb_cbt_${btoa(user.user_id)}_${Date.now()}`
      });
    }

    // 3. POST /student/heartbeat — Telemetri Real-Time & Sensor Anti-Cheat 500 Siswa
    if (url.pathname.endsWith("/student/heartbeat") && req.method === "POST") {
      const body = await req.json();
      const { sessionId, studentId, progress, isCheating, cheatReason, answersCount } = body;

      if (!sessionId || !studentId) {
        return errorResponse("INVALID_PAYLOAD", "Session ID dan Student ID dibutuhkan.", 400);
      }

      const updateData: Record<string, unknown> = {
        progress_percent: progress ?? 0,
        last_activity: isCheating ? `TERBLOKIR: ${cheatReason || "Pindah tab browser"}` : `Mengerjakan (${answersCount || 0} dijawab)`,
        updated_at: new Date().toISOString()
      };

      if (isCheating) {
        updateData.status = "BLOCKED";
      }

      const { data: session, error } = await supabase
        .from("exam_sessions")
        .update(updateData)
        .eq("session_id", sessionId)
        .select()
        .single();

      if (error) {
        return errorResponse("UPDATE_FAILED", error.message, 500);
      }

      return jsonResponse({
        status: "OK",
        sessionStatus: session?.status,
        serverTime: new Date().toISOString()
      });
    }

    // 4. POST /proctor/unblock — Buka Blokir Langsung oleh Admin atau Guru Mapel
    if (url.pathname.endsWith("/proctor/unblock") && req.method === "POST") {
      const body = await req.json();
      const { studentId, proctorName, subject } = body;

      if (!studentId) {
        return errorResponse("VALIDATION_ERROR", "NISN / Student ID wajib diisi.", 400);
      }

      const { data: updated, error } = await supabase
        .from("exam_sessions")
        .update({
          status: "WORKING",
          unblocked_by_proctor: proctorName || "Pengawas Resmi",
          last_activity: `Blokir dibuka langsung oleh ${proctorName || "Pengawas"}`,
          updated_at: new Date().toISOString()
        })
        .eq("student_id", studentId)
        .select();

      if (error) {
        return errorResponse("UNBLOCK_FAILED", error.message, 500);
      }

      // Catat ke Audit Log
      await supabase.from("audit_logs").insert({
        actor_name: proctorName || "Pengawas",
        actor_role: "Pengawas",
        action_code: "DIRECT_UNBLOCK",
        detail: `Membuka blokir siswa ${studentId} pada mata pelajaran ${subject || "Semua"}`,
        status: "SUCCESS"
      });

      return jsonResponse({ status: "SUCCESS", message: "Peserta berhasil dibuka blokirnya." });
    }

    // 5. POST /questions/batch — Batch Insert Soal ke Supabase Database
    if (url.pathname.endsWith("/questions/batch") && req.method === "POST") {
      const body = await req.json();
      const { questions } = body;

      if (!Array.isArray(questions) || questions.length === 0) {
        return errorResponse("INVALID_QUESTIONS", "Daftar butir soal kosong.", 400);
      }

      const records = questions.map((q, idx) => ({
        question_id: q.id || `Q-SB-${Date.now()}-${idx + 1}`,
        subject: q.subject,
        question_type: q.type,
        type_name: q.typeName || "Pilihan Ganda",
        weight: q.weight || 20,
        prompt: q.prompt,
        media_url: q.media || "",
        options: q.options || null,
        statements: q.statements || null,
        premises: q.premises || null,
        responses: q.responses || null,
        correct_key: typeof q.correctKey === "object" ? q.correctKey : JSON.stringify(q.correctKey),
        explanation: q.explanation || "Pembahasan resmi Supabase CBT."
      }));

      const { data, error } = await supabase.from("questions").upsert(records).select();

      if (error) {
        return errorResponse("BATCH_INSERT_FAILED", error.message, 500);
      }

      return jsonResponse({
        status: "SUCCESS",
        count: data?.length || records.length,
        message: `${records.length} butir soal berhasil di-commit ke Supabase PostgreSQL.`
      });
    }

    // 6. POST /storage/upload — Unggah Gambar / Media Soal ke Supabase Storage Bucket
    if (url.pathname.endsWith("/storage/upload") && req.method === "POST") {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;

      if (!file) {
        return errorResponse("NO_FILE", "File gambar tidak ditemukan.", 400);
      }

      const allowedTypes = ["image/png", "image/jpeg", "image/jpg", "image/svg+xml"];
      if (!allowedTypes.includes(file.type)) {
        return errorResponse("INVALID_TYPE", "Hanya format .png, .jpg, dan .svg yang diizinkan.", 400);
      }

      const ext = file.name.split(".").pop() || "png";
      const fileName = `questions/${Date.now()}_${crypto.randomUUID()}.${ext}`;

      const { data, error } = await supabase.storage
        .from("cbt-media")
        .upload(fileName, file, {
          contentType: file.type,
          upsert: true
        });

      if (error) {
        return errorResponse("UPLOAD_FAILED", error.message, 500);
      }

      const { data: pubUrl } = supabase.storage.from("cbt-media").getPublicUrl(fileName);

      return jsonResponse({
        status: "SUCCESS",
        fileName,
        publicUrl: pubUrl.publicUrl
      });
    }

    return errorResponse("NOT_FOUND", `Endpoint ${url.pathname} tidak ditemukan pada Edge Function.`, 404);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Terjadi kesalahan internal pada Supabase Edge Function.";
    return errorResponse("INTERNAL_SERVER_ERROR", msg, 500);
  }
});

