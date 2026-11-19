# PANDUAN LENGKAP MIGRASI BACKEND & DATABASE CBT SIGMA 71 KE SUPABASE
### *Sistem Ujian Berbasis Komputer (CBT) Terintegrasi 500 Siswa Serentak, RBAC Guru, Realtime Monitoring & Multi-Device / Kodular*

---

## 1. Ringkasan Arsitektur Supabase CBT SIGMA 71

Sistem CBT SIGMA 71 PUSPENDIK telah dimigrasikan dari arsitektur Cloudflare ke ekosistem **Supabase** yang andal, scalable, dan mendukung multi-platform (Web Browser, Kodular, Android WebView, iOS). Seluruh data, otorisasi, dan media kini menggunakan layanan terkelola Supabase:

| Komponen CBT | Layanan Supabase | Fungsi Utama |
| :--- | :--- | :--- |
| **Database Utama** | **Supabase PostgreSQL** | Menyimpan tabel konfigurasi, akun pengguna, bank soal 5 tipe, jadwal ujian, nilai hasil, dan audit log. |
| **Autentikasi & RBAC** | **Supabase Auth + RLS** | Kontrol hak akses multi-role (Administrator Penuh, Guru Mata Pelajaran, dan Peserta Didik). |
| **Media & Gambar Soal** | **Supabase Storage (`cbt-media`)** | Menyimpan gambar wacana AKM, stimulus visual soal, dan foto profil. |
| **Monitoring Ujian 500 Siswa** | **Supabase Realtime (WebSocket)** | Sinkronisasi data progres, status pengerjaan, dan anti-cheat secara instan tanpa polling (60 FPS). |
| **Server-Side API / Webhook** | **Supabase Edge Functions** | Endpoint Deno TypeScript untuk validasi server, telemetri siswa, unblock langsung, dan batch insert. |

---

## 2. Konfigurasi Proyek Supabase Aktif

Proyek telah disinkronkan secara langsung dengan kredensial Supabase resmi berikut:

```javascript
// KONFIGURASI UTAMA SUPABASE (MENDUKUNG PUBLISHABLE KEY & MULTI-DEVICE / KODULAR)
let IS_PREVIEW = false;
const SUPABASE_URL = "https://gekubioxgyqqzvswxujy.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_17aStgaM9FI__bVC6A7bnQ_GUDkXjUN";
const SUPABASE_ANON_KEY = SUPABASE_PUBLISHABLE_KEY;
```

> [!NOTE]
> Format key `sb_publishable_...` adalah standar publishable key modern Supabase yang aman dipasang di sisi klien (frontend browser, Android APK Kodular/WebView) dan terlindungi oleh aturan **Row Level Security (RLS)** PostgreSQL.

---

## 3. Struktur Berkas Proyek

```plaintext
CBT SIGMA 71 VERSI BARU CLOUDFLARE - Edit/
├── index.html                           # Frontend SPA Lengkap (PUSPENDIK Theme, Realtime UI, Dashboard)
├── supabaseClient.js                    # Modul Client JavaScript Supabase (@supabase/supabase-js)
├── package.json                         # Konfigurasi dependensi & npm scripts Supabase
├── .env.example                         # Template variabel environment Supabase
├── PANDUAN_MIGRASI_SUPABASE.md          # Dokumen panduan langkah demi langkah ini
└── supabase/
    ├── schema.sql                       # Skema lengkap PostgreSQL (Tabel, Enum, RLS, Realtime, Seed Data)
    └── functions/
        └── cbt-api/
            └── index.ts                 # Supabase Edge Function (Deno TypeScript)
```

---

## 4. Langkah Demi Langkah Setup & Migrasi Supabase

### Langkah 1: Eksekusi Skema Database SQL
1. Buka dashboard proyek Anda di: [https://supabase.com/dashboard/project/gekubioxgyqqzvswxujy](https://supabase.com/dashboard/project/gekubioxgyqqzvswxujy).
2. Di bilah navigasi kiri, klik ikon **SQL Editor**.
3. Klik tombol **+ New Query**.
4. Buka file `supabase/schema.sql` yang ada di proyek ini, salin seluruh kodenya, dan tempelkan ke SQL Editor Supabase.
5. Klik tombol **Run** (atau tekan `Ctrl + Enter`).
6. Verifikasi seluruh 9 tabel berikut terbuat:
   - `public.app_config`
   - `public.users`
   - `public.teacher_permissions`
   - `public.master_items`
   - `public.exams`
   - `public.questions`
   - `public.exam_sessions`
   - `public.student_answers`
   - `public.audit_logs`

---

### Langkah 2: Verifikasi Bucket Penyimpanan `cbt-media`
1. Di bilah navigasi kiri Supabase, klik **Storage**.
2. Pastikan terdapat bucket bernama **`cbt-media`** dengan status **Public: Active**.
3. Jika belum ada, klik **New Bucket**, beri nama `cbt-media`, lalu aktifkan toggle **Public bucket**.

---

### Langkah 3: Menjalankan Frontend Web & Uji Koneksi
1. Buka file `index.html` di browser Anda.
2. Secara otomatis, sistem akan menghubungkan ke `https://gekubioxgyqqzvswxujy.supabase.co` menggunakan publishable key.
3. Masuk ke **Menu 5. Backend & Database (Supabase)**.
4. Anda akan melihat badge hijau:
   `Terhubung ke Supabase Live (gekubioxgyqqzvswxujy)`
5. Klik tombol **"Sinkronkan Data CBT"** untuk mengirimkan konfigurasi sekolah ke PostgreSQL.

---

### Langkah 4: Dukungan Multi-Device & Kodular / Android WebView
Bagi sekolah yang mengemas CBT ke aplikasi Android (.apk) menggunakan **Kodular**, **MIT App Inventor**, atau **Android WebView**:
1. Gunakan komponen **WebViewer** di Kodular dan arahkan URL ke hosting `index.html` (atau muat dari asset).
2. Semua pemanggilan penyimpanan aman dari error izin berkat pengamanan try-catch pada `localStorage`.
3. Kompatibel penuh dengan protokol `file:///android_asset/` maupun HTTPS.

---

## 5. Akun Default untuk Login Sistem

| Peran (Role) | Username / ID | Password | Hak Akses |
| :--- | :--- | :--- | :--- |
| **Administrator Utama** | `admin` | `admin71pass` | Akses penuh seluruh 9 menu, kendali RBAC Guru, dan konfigurasi master. |
| **Guru Mata Pelajaran** | *(NIP / Username Guru)* | *(Sesuai Manajemen User)* | Mengampu Mapel & Kelas sesuai penugasan RBAC (Bank Soal, Jadwal, Monitoring, Hasil Nilai). |
| **Siswa / Peserta** | *(NISN Peserta)* | *(Password Peserta)* | Portal peserta ujian dengan konfirmasi data, jadwal aktif, & sensor Anti-Cheat. |

---
*Dikembangkan oleh Tim IT SMP Negeri 71 Bandung — Siap untuk Pelaksanaan Asesmen & Ujian Berbasis Komputer Resmi.*
