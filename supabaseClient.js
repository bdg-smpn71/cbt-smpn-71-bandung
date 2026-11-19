/**
 * ============================================================================
 * CBT SMP NEGERI 71 BANDUNG — SUPABASE CLIENT & INTEGRATION ENGINE
 * Mendukung Koneksi Browser Standar, Publishable Key & Multi-Device / Kodular
 * Sinkron 100% dengan supabase/schema.sql & index.html
 * ============================================================================
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define(['@supabase/supabase-js'], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('@supabase/supabase-js'));
  } else {
    root.CbtSupabase = factory(root.supabase);
  }
}(typeof self !== 'undefined' ? self : this, function (supabaseLib) {

  // KONFIGURASI UTAMA SUPABASE (MENDUKUNG PUBLISHABLE KEY & MULTI-DEVICE / KODULAR)
  const DEFAULT_CONFIG = {
    url: 'https://lyfgwwmmubbusheavoyl.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx5Zmd3d21tdWJidXNoZWF2b3lsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ1NzQxNDYsImV4cCI6MjExMDE1MDE0Nn0.jv2tpfGPCv08unG9JYZMkw1ns_CLNdvlD0jravWp9XM',
    publishableKey: 'sb_publishable_yCs4baUGsayQGSKT2ovDRg_hBBq1Aip',
    isConnected: true
  };

  const DEFAULT_CONFIG_KEY = 'cbt_sigma71_supabase_config';
  let clientInstance = null;

  function markArrayOk(arr, isOk) {
    if (arr && typeof arr === 'object') {
      try {
        Object.defineProperty(arr, '__ok', { value: Boolean(isOk), enumerable: false });
      } catch (_) {}
    }
    return arr;
  }

  // Proteksi Tombstone Penghapusan Lokal agar item/guru terhapus tidak muncul ulang dari cache/Realtime
  const MASTER_TOMBSTONE_KEY = 'cbt_master_deleted_tombstones_v1';
  const USER_TOMBSTONE_KEY = 'cbt_deleted_users_tombstones_v1';
  const TOMBSTONE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

  function normMasterKey(val) {
    return String(val || '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function readTombstoneMap(lsKey) {
    try {
      const raw = localStorage.getItem(lsKey);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return {};
      const now = Date.now();
      const cleaned = {};
      Object.entries(parsed).forEach(([k, ts]) => {
        if (Number(ts) > 0 && (now - Number(ts)) < TOMBSTONE_TTL_MS) {
          cleaned[k] = Number(ts);
        }
      });
      return cleaned;
    } catch (_) {
      return {};
    }
  }

  function writeTombstoneMap(lsKey, map) {
    try {
      localStorage.setItem(lsKey, JSON.stringify(map || {}));
    } catch (_) {}
  }

  function masterTombstoneKey(category, value) {
    return `${String(category || '').trim()}::${normMasterKey(value)}`;
  }

  function markMasterItemDeleted(category, value) {
    const cleanVal = normMasterKey(value);
    if (!category || !cleanVal) return;
    const map = readTombstoneMap(MASTER_TOMBSTONE_KEY);
    map[masterTombstoneKey(category, value)] = Date.now();
    writeTombstoneMap(MASTER_TOMBSTONE_KEY, map);
  }

  function clearMasterItemDeleted(category, value) {
    const cleanVal = normMasterKey(value);
    if (!category || !cleanVal) return;
    const map = readTombstoneMap(MASTER_TOMBSTONE_KEY);
    const key = masterTombstoneKey(category, value);
    if (key in map) {
      delete map[key];
      writeTombstoneMap(MASTER_TOMBSTONE_KEY, map);
    }
  }

  function isMasterItemDeleted(category, value) {
    const cleanVal = normMasterKey(value);
    if (!category || !cleanVal) return false;
    const map = readTombstoneMap(MASTER_TOMBSTONE_KEY);
    return Boolean(map[masterTombstoneKey(category, value)]);
  }

  function markUserDeleted(userId, teacherId = '') {
    const map = readTombstoneMap(USER_TOMBSTONE_KEY);
    const uid = String(userId || '').trim();
    const tid = String(teacherId || '').trim();
    if (uid) map[`id::${uid.toLowerCase()}`] = Date.now();
    if (tid) map[`tid::${tid.toLowerCase()}`] = Date.now();
    writeTombstoneMap(USER_TOMBSTONE_KEY, map);
  }

  function clearUserDeleted(userId, teacherId = '') {
    const map = readTombstoneMap(USER_TOMBSTONE_KEY);
    const uid = String(userId || '').trim().toLowerCase();
    const tid = String(teacherId || '').trim().toLowerCase();
    let changed = false;
    if (uid && (`id::${uid}` in map)) { delete map[`id::${uid}`]; changed = true; }
    if (tid && (`tid::${tid}` in map)) { delete map[`tid::${tid}`]; changed = true; }
    if (changed) writeTombstoneMap(USER_TOMBSTONE_KEY, map);
  }

  function isUserDeleted(userId, teacherId = '') {
    const map = readTombstoneMap(USER_TOMBSTONE_KEY);
    const uid = String(userId || '').trim().toLowerCase();
    const tid = String(teacherId || '').trim().toLowerCase();
    return Boolean((uid && map[`id::${uid}`]) || (tid && map[`tid::${tid}`]));
  }

  function normalizeQuestionTypeEnum(rawType) {
    const t = String(rawType || 'PG').trim().toUpperCase();
    if (['PG', 'PGK', 'AKM', 'BS', 'MATCH', 'MENJODOHKAN', 'ISIAN', 'URAIAN', 'ESAI'].includes(t)) return t;
    if (t === 'MJD') return 'MATCH';
    return 'PG';
  }

  function normalizeExamStatusEnum(rawStatus) {
    const s = String(rawStatus || 'Terjadwal').trim();
    if (s === 'Ditutup') return 'Selesai';
    if (['Terjadwal', 'Berlangsung', 'Selesai'].includes(s)) return s;
    return 'Terjadwal';
  }

  function normalizeUserRoleEnum(rawRole) {
    const r = String(rawRole || 'Siswa').trim();
    if (r === 'Admin' || r === 'Guru' || r === 'Siswa') return r;
    const low = r.toLowerCase();
    if (low === 'admin' || low === 'administrator') return 'Admin';
    if (low === 'guru' || low === 'teacher') return 'Guru';
    return 'Siswa';
  }

  function safeJsonParseKey(val) {
    if (typeof val !== 'string') return val;
    if (val.startsWith('[') || val.startsWith('{')) {
      try { return JSON.parse(val); } catch (_) { return val; }
    }
    return val;
  }

  function normalizeTeachingAssignments(raw) {
    if (!Array.isArray(raw)) return [];
    const seen = new Set();
    const out = [];
    raw.forEach(item => {
      if (!item || typeof item !== 'object') return;
      const subject = String(item.subject || item.mapel || '').replace(/\s+/g, ' ').trim();
      const className = String(item.className || item.class || item.kelas || '').replace(/\s+/g, ' ').trim();
      if (!subject || !className) return;
      const key = `${subject.toLowerCase()}::${className.toLowerCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push({ subject, className });
      }
    });
    return out;
  }

  function mapSupabaseUserRow(u) {
    const parsedAssignments = normalizeTeachingAssignments(safeJsonParseKey(u.teaching_assignments));
    const derivedSubjects = parsedAssignments.length
      ? Array.from(new Set(parsedAssignments.map(a => a.subject)))
      : (Array.isArray(u.assigned_subjects) && u.assigned_subjects.length
        ? u.assigned_subjects
        : (u.subject && u.subject !== 'ALL' ? [u.subject] : []));
    const derivedClasses = parsedAssignments.length
      ? Array.from(new Set(parsedAssignments.map(a => a.className)))
      : (Array.isArray(u.assigned_classes) && u.assigned_classes.length
        ? u.assigned_classes
        : (u.class_name && u.class_name !== 'Semua Kelas' ? u.class_name.split(',').map(s => s.trim()) : ['Semua Kelas']));
    return {
      id: u.user_id,
      username: u.username,
      name: u.full_name,
      role: u.role,
      className: u.class_name,
      class: u.class_name,
      subject: u.subject || (derivedSubjects[0] || 'ALL'),
      assignedClasses: derivedClasses,
      assignedSubjects: derivedSubjects,
      teachingAssignments: parsedAssignments,
      pass: u.password_hash,
      gender: u.gender || 'Laki-laki',
      birthDate: u.birth_date || '2008-01-01',
      avatar: u.avatar_url || '',
      status: u.role === 'Siswa' ? 'BELUM_LOGIN' : 'WORKING',
      progress: 0,
      remainingTime: '-',
      objScore: 0,
      essayScore: 0,
      finalScore: 0,
      cheatCount: 0,
      lastActivity: 'Sinkron Supabase'
    };
  }

  function toIsoTimestamp(val, fallbackOffsetMs = 0) {
    if (!val) return new Date(Date.now() + fallbackOffsetMs).toISOString();
    const d = new Date(val);
    if (!isNaN(d.getTime())) return d.toISOString();
    return new Date(Date.now() + fallbackOffsetMs).toISOString();
  }

  function toLocalDateTimeStr(isoVal) {
    if (!isoVal) return '';
    const d = new Date(isoVal);
    if (isNaN(d.getTime())) return String(isoVal);
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function toIndoDateTimeDisplay(val) {
    if (!val) return '';
    const s = String(val).trim();
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})/);
    if (m) return `${m[3]}-${m[2]}-${m[1]} ${m[4]}:${m[5]}`;
    return s.replace('T', ' ');
  }

  // Baca kredensial tersimpan atau gunakan default konfigurasi utama
  function getStoredCredentials() {
    try {
      const lsUrl = localStorage.getItem('cbt_supabase_url');
      const lsKey = localStorage.getItem('cbt_supabase_anon_key');
      if (lsUrl && lsKey) {
        return { url: lsUrl, anonKey: lsKey, publishableKey: lsKey, isConnected: true };
      }
      const stored = localStorage.getItem(DEFAULT_CONFIG_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.url && (parsed.anonKey || parsed.publishableKey)) {
          return parsed;
        }
      }
    } catch (_) {}
    return { ...DEFAULT_CONFIG };
  }

  function saveStoredCredentials(url, anonKey, isConnected = true) {
    try {
      localStorage.setItem(DEFAULT_CONFIG_KEY, JSON.stringify({
        url,
        anonKey,
        publishableKey: anonKey,
        isConnected
      }));
      localStorage.setItem('cbt_supabase_url', url);
      localStorage.setItem('cbt_supabase_anon_key', anonKey);
    } catch (_) {}
  }

  // Inisialisasi Supabase Client (Kompatibel Browser, Kodular, Android WebView)
  function init(url, anonKey) {
    const targetUrl = (url || DEFAULT_CONFIG.url || '').trim();
    const targetKey = (anonKey || DEFAULT_CONFIG.publishableKey || '').trim();

    const lib = supabaseLib || (typeof window !== 'undefined' ? window.supabase : null);
    if (!lib || !lib.createClient) {
      console.warn('[CbtSupabase] Library @supabase/supabase-js belum dimuat. Berjalan dalam mode standby.');
      return null;
    }
    if (!targetUrl || !targetKey) {
      console.warn('[CbtSupabase] URL atau Anon/Publishable Key kosong.');
      return null;
    }

    try {
      const isFileProtocol = typeof window !== 'undefined' && window.location && window.location.protocol === 'file:';
      clientInstance = lib.createClient(targetUrl, targetKey, {
        auth: {
          persistSession: !isFileProtocol,
          autoRefreshToken: !isFileProtocol,
          detectSessionInUrl: false
        },
        global: {
          headers: {
            'apikey': targetKey,
            'x-client-info': 'cbt-sigma71-kodular-web/v7.0'
          }
        },
        realtime: {
          params: {
            eventsPerSecond: 20
          }
        }
      });
      saveStoredCredentials(targetUrl, targetKey, true);
    } catch (e) {
      console.error('[CbtSupabase] Gagal inisialisasi Supabase client:', e);
      clientInstance = null;
    }

    return clientInstance;
  }

  function getClient() {
    if (!clientInstance) {
      const creds = getStoredCredentials();
      if (creds.url && (creds.anonKey || creds.publishableKey)) {
        init(creds.url, creds.anonKey || creds.publishableKey);
      }
    }
    return clientInstance;
  }

  // 1. Pengujian Koneksi ke Supabase (Mendukung Publishable Key & Validasi Nyata)
  async function testConnection(url, anonKey) {
    const targetUrl = (url || DEFAULT_CONFIG.url || '').trim();
    const targetKey = (anonKey || DEFAULT_CONFIG.publishableKey || '').trim();

    if (!targetUrl || !targetKey) {
      return { success: false, message: 'URL Proyek dan Public API Key Supabase wajib diisi.' };
    }

    try {
      const tempClient = init(targetUrl, targetKey);
      const start = Date.now();

      if (tempClient) {
        const { data, error } = await tempClient.from('app_config').select('id, school_name').limit(1);
        const ping = Date.now() - start;

        if (!error) {
          saveStoredCredentials(targetUrl, targetKey, true);
          return { success: true, ping, data: data?.[0], message: 'Koneksi PostgreSQL & Realtime Aktif' };
        }

        // Tabel belum dibuat via schema.sql namun URL + API Key valid
        if (error.code === '42P01' || (error.message && error.message.includes('does not exist'))) {
          saveStoredCredentials(targetUrl, targetKey, true);
          return { success: true, ping, message: 'Terhubung ke Supabase (Jalankan schema.sql di SQL Editor)', data: null };
        }
      }

      // Fallback Direct REST Ping (OpenAPI root /rest/v1/)
      const probe = await fetch(`${targetUrl}/rest/v1/`, {
        headers: {
          'apikey': targetKey,
          'Authorization': `Bearer ${targetKey}`
        }
      });
      const ping = Date.now() - start;
      if (probe.ok || probe.status === 200) {
        saveStoredCredentials(targetUrl, targetKey, true);
        return { success: true, ping, message: `Terhubung ke Supabase PostgREST (HTTP ${probe.status})` };
      }

      return { success: false, ping, message: `Autentikasi/Endpoint ditolak (HTTP ${probe.status}). Periksa URL & Key.` };
    } catch (err) {
      return { success: false, message: err?.message || 'Tidak dapat menjangkau server Supabase (Mode Offline).' };
    }
  }

  // 2. Sinkronisasi Data Konfigurasi Sekolah
  async function fetchAppConfig() {
    const sb = getClient();
    if (!sb) return null;
    try {
      const { data, error } = await sb.from('app_config').select('*').eq('id', 1).maybeSingle();
      if (error || !data) {
        if (error) console.warn('[CbtSupabase] Gagal mengambil app_config:', error.message);
        return null;
      }
      const rawTitle = String(data.app_title || '').trim();
      const rawSub = String(data.app_subtitle || '').trim();
      return {
        appTitle: (!rawTitle || rawTitle.toUpperCase() === 'PUSPENDIK') ? (data.school_name || 'SMP NEGERI 71 BANDUNG') : rawTitle,
        appSubtitle: (!rawSub || rawSub === 'CBT Application') ? 'CBT APPLICATION' : rawSub,
        schoolName: data.school_name || 'SMP NEGERI 71 BANDUNG',
        schoolAddress: data.school_address || '',
        schoolPhone: data.school_phone || '(022) 7102026',
        schoolWebsite: data.school_website || 'https://smpn71bdg.sch.id',
        schoolEmail: data.school_email || 'info@smpn71bdg.sch.id',
        principalName: data.principal_name || '',
        principalNip: data.principal_nip || '',
        curriculumName: data.curriculum_name || '',
        curriculumNip: data.curriculum_nip || '',
        logoUrl: data.logo_url || '',
        schoolLogoUrl: data.school_logo_url || '',
        showResultToStudent: Boolean(data.show_result_to_student),
        showBlockToStudent: Boolean(data.show_block_to_student),
        maintenanceMode: Boolean(data.maintenance_mode),
        activeToken: data.active_token || 'PUSPENDIK71',
        ...(data.auto_rotate_token !== undefined ? { autoRotateTokenEnabled: Boolean(data.auto_rotate_token) } : {}),
        ...(data.manual_token_enabled !== undefined
          ? { manualTokenEnabled: Boolean(data.manual_token_enabled) }
          : (data.token_rotate_seconds !== undefined
            ? { manualTokenEnabled: Number(data.token_rotate_seconds) === 0 }
            : (data.auto_rotate_token !== undefined ? { manualTokenEnabled: !Boolean(data.auto_rotate_token) } : {}))),
        ...(data.token_rotate_seconds !== undefined ? { tokenRotateSeconds: Number(data.token_rotate_seconds) } : {}),
        ...(data.token_rotate_deadline_ms !== undefined ? { tokenRotateDeadlineMs: Number(data.token_rotate_deadline_ms) || 0 } : {})
      };
    } catch (_) {
      return null;
    }
  }

  async function updateAppConfig(configUpdates) {
    const sb = getClient();
    if (!sb) return false;
    const { error } = await sb.from('app_config').update({
      ...configUpdates,
      updated_at: new Date().toISOString()
    }).eq('id', 1);
    return !error;
  }

  async function syncConfigToSupabase(cfg, activePin = '') {
    const sb = getClient();
    if (!sb) return false;
    try {
      const buildPayload = (includeEmail = true, includeTokenMeta = true, includeExtendedTokenCols = true) => {
        const autoOn = Boolean(cfg.autoRotateTokenEnabled);
        const manualOn = !autoOn && Boolean(cfg.manualTokenEnabled);
        const tokenRotateSec = autoOn ? 900 : (manualOn ? 0 : -1);
        const p = {
          id: 1,
          app_title: cfg.appTitle || 'SMP NEGERI 71 BANDUNG',
          app_subtitle: cfg.appSubtitle || 'CBT APPLICATION',
          school_name: cfg.schoolName || 'SMP NEGERI 71 BANDUNG',
          school_address: cfg.schoolAddress || '',
          principal_name: cfg.principalName || '',
          principal_nip: cfg.principalNip || '',
          curriculum_name: cfg.curriculumName || '',
          curriculum_nip: cfg.curriculumNip || '',
          logo_url: cfg.logoUrl || '',
          school_logo_url: cfg.schoolLogoUrl || '',
          show_result_to_student: Boolean(cfg.showResultToStudent),
          show_block_to_student: Boolean(cfg.showBlockToStudent),
          maintenance_mode: Boolean(cfg.maintenanceMode),
          active_token: activePin || cfg.activeToken || 'PUSPENDIK71',
          updated_at: new Date().toISOString()
        };
        if (includeEmail) {
          p.school_phone = cfg.schoolPhone || '(022) 7102026';
          p.school_website = cfg.schoolWebsite || 'https://smpn71bdg.sch.id';
          p.school_email = cfg.schoolEmail || 'info@smpn71bdg.sch.id';
        }
        if (includeTokenMeta) {
          p.auto_rotate_token = autoOn;
          p.token_rotate_seconds = tokenRotateSec;
          if (includeExtendedTokenCols) {
            p.manual_token_enabled = manualOn;
            p.token_rotate_deadline_ms = autoOn ? (Number(cfg.tokenRotateDeadlineMs) || 0) : 0;
          }
        }
        return p;
      };
      let { error } = await sb.from('app_config').upsert(buildPayload(true, true, true));
      if (error && /manual_token_enabled|token_rotate_deadline_ms/i.test(String(error.message || ''))) {
        ({ error } = await sb.from('app_config').upsert(buildPayload(true, true, false)));
      }
      if (error && /auto_rotate_token|token_rotate_seconds/i.test(String(error.message || ''))) {
        ({ error } = await sb.from('app_config').upsert(buildPayload(true, false, false)));
      }
      if (error && /school_email|school_phone|school_website/i.test(String(error.message || ''))) {
        ({ error } = await sb.from('app_config').upsert(buildPayload(false, true, false)));
        if (error) {
          ({ error } = await sb.from('app_config').upsert(buildPayload(false, false, false)));
        }
      }
      if (error) console.warn('[CbtSupabase] syncConfigToSupabase error:', error.message);
      return !error;
    } catch (_) {
      return false;
    }
  }

  // 2B. Sinkronisasi Data Master (classes, subjects, examNames, proctors)
  async function fetchMasterItemsFromSupabase() {
    const sb = getClient();
    if (!sb) return null;
    try {
      const { data, error } = await sb.from('master_items').select('*').order('id', { ascending: true });
      if (error || !data) return null;
      const res = { classes: [], subjects: [], examNames: [], proctors: [] };
      const staleRemovals = [];
      data.forEach(row => {
        const cat = row.category;
        const val = String(row.value || '').replace(/\s+/g, ' ').trim();
        if (!res[cat] || !val) return;
        if (isMasterItemDeleted(cat, val)) {
          staleRemovals.push({ category: cat, value: val });
          return;
        }
        if (!res[cat].some(existing => normMasterKey(existing) === normMasterKey(val))) {
          res[cat].push(val);
        }
      });
      if (staleRemovals.length > 0) {
        staleRemovals.forEach(item => {
          deleteMasterItemFromSupabase(item.category, item.value).catch(() => {});
        });
      }
      return markArrayOk(res, true);
    } catch (_) {
      return null;
    }
  }

  async function saveMasterItemToSupabase(category, value) {
    const sb = getClient();
    const cleanVal = String(value || '').replace(/\s+/g, ' ').trim();
    if (!category || !cleanVal) return false;
    clearMasterItemDeleted(category, cleanVal);
    if (!sb) return false;
    try {
      const { error } = await sb.from('master_items').upsert(
        { category: String(category).trim(), value: cleanVal },
        { onConflict: 'category,value' }
      );
      return !error;
    } catch (_) {
      return false;
    }
  }

  async function deleteMasterItemFromSupabase(category, value) {
    const sb = getClient();
    const cleanCat = String(category || '').trim();
    const cleanVal = String(value || '').replace(/\s+/g, ' ').trim();
    if (!cleanCat || !cleanVal) return false;
    markMasterItemDeleted(cleanCat, cleanVal);
    if (!sb) return false;
    try {
      const { error } = await sb.from('master_items').delete().eq('category', cleanCat).eq('value', cleanVal);
      // Hapus juga varian spasi/huruf jika tersimpan berbeda di database
      try {
        const escaped = cleanVal.replace(/[%_\\]/g, '\\$&');
        await sb.from('master_items').delete().eq('category', cleanCat).ilike('value', escaped);
      } catch (_) {}
      return !error;
    } catch (_) {
      return false;
    }
  }

  async function syncMasterItemsToSupabase(masterObj, options = {}) {
    const sb = getClient();
    if (!sb || !masterObj) return false;
    const fullReplace = options.fullReplace !== false;
    try {
      const desiredRows = [];
      const desiredKeySet = new Set();
      ['classes', 'subjects', 'examNames', 'proctors'].forEach(cat => {
        (masterObj[cat] || []).forEach(val => {
          const v = String(val || '').replace(/\s+/g, ' ').trim();
          if (!v) return;
          if (options.clearTombstones) clearMasterItemDeleted(cat, v);
          if (!options.clearTombstones && isMasterItemDeleted(cat, v)) return;
          const k = `${cat}::${normMasterKey(v)}`;
          if (!desiredKeySet.has(k)) {
            desiredKeySet.add(k);
            desiredRows.push({ category: cat, value: v });
          }
        });
      });

      if (fullReplace) {
        try {
          const { data: existingRows } = await sb.from('master_items').select('id,category,value');
          if (Array.isArray(existingRows)) {
            const staleIds = existingRows
              .filter(r => ['classes', 'subjects', 'examNames', 'proctors'].includes(r.category) && !desiredKeySet.has(`${r.category}::${normMasterKey(r.value)}`))
              .map(r => r.id)
              .filter(id => id !== undefined && id !== null);
            for (let i = 0; i < staleIds.length; i += 100) {
              await sb.from('master_items').delete().in('id', staleIds.slice(i, i + 100));
            }
          }
        } catch (_) {}
      }

      if (desiredRows.length === 0) return true;
      const { error } = await sb.from('master_items').upsert(desiredRows, { onConflict: 'category,value' });
      return !error;
    } catch (_) {
      return false;
    }
  }

  // 2C. Sinkronisasi RBAC Guru
  async function fetchTeacherPermissionsFromSupabase() {
    const sb = getClient();
    if (!sb) return markArrayOk([], false);
    try {
      const { data, error } = await sb.from('teacher_permissions').select('*');
      if (error || !data) return markArrayOk([], false);
      const validRows = [];
      data.forEach(row => {
        if (isUserDeleted(row.nip || row.username, row.teacher_id)) {
          deleteTeacherPermissionsFromSupabase(row.teacher_id, row.nip, row.username).catch(() => {});
          return;
        }
        validRows.push(row);
      });
      return markArrayOk(validRows, true);
    } catch (_) {
      return markArrayOk([], false);
    }
  }

  async function saveTeacherPermissionsToSupabase(teacherId, tData) {
    const sb = getClient();
    if (!tData) return false;
    clearUserDeleted(tData.nip || teacherId, teacherId || tData.id);
    if (!sb) return false;
    try {
      const buildPermRow = (includeAssignments = true) => {
        const row = {
          teacher_id: String(teacherId || tData.id),
          nip: String(tData.nip || teacherId),
          full_name: String(tData.name || ''),
          username: String(tData.username || tData.nip || ''),
          assigned_subjects: Array.isArray(tData.assignedSubjects) ? tData.assignedSubjects : [],
          assigned_classes: Array.isArray(tData.assignedClasses) ? tData.assignedClasses : ['Semua Kelas'],
          perm_create_questions: tData.permCreateQuestions !== false,
          perm_manage_exams: tData.permManageExams !== false,
          perm_proctor: tData.permProctor !== false,
          perm_grade_analyze: tData.permGradeAnalyze !== false,
          can_set_token: Boolean(tData.canSetToken),
          can_unblock_students: tData.canUnblockStudents !== false,
          updated_at: new Date().toISOString()
        };
        if (includeAssignments && Array.isArray(tData.teachingAssignments)) {
          row.teaching_assignments = normalizeTeachingAssignments(tData.teachingAssignments);
        }
        return row;
      };
      let { error } = await sb.from('teacher_permissions').upsert(buildPermRow(true), { onConflict: 'teacher_id' });
      if (error && String(error.message || '').includes('teaching_assignments')) {
        ({ error } = await sb.from('teacher_permissions').upsert(buildPermRow(false), { onConflict: 'teacher_id' }));
      }
      if (error) console.warn('[CbtSupabase] saveTeacherPermissionsToSupabase error:', error.message);
      return !error;
    } catch (_) {
      return false;
    }
  }

  async function deleteTeacherPermissionsFromSupabase(teacherId, nip = '', username = '') {
    const sb = getClient();
    markUserDeleted(nip || username, teacherId);
    if (!sb) return false;
    try {
      if (teacherId) await sb.from('teacher_permissions').delete().eq('teacher_id', String(teacherId));
      if (nip) await sb.from('teacher_permissions').delete().eq('nip', String(nip));
      if (username) await sb.from('teacher_permissions').delete().eq('username', String(username));
      return true;
    } catch (_) {
      return false;
    }
  }

  // 3. Sinkronisasi Bank Soal
  async function fetchQuestionsFromSupabase(subject = 'ALL') {
    const sb = getClient();
    if (!sb) return markArrayOk([], false);
    try {
      let query = sb.from('questions').select('*').order('created_at', { ascending: true });
      if (subject && subject !== 'ALL') {
        query = query.eq('subject', subject);
      }
      const { data, error } = await query;
      if (error || !data) {
        if (error) console.error('[CbtSupabase] Gagal fetch questions:', error);
        return markArrayOk([], false);
      }
      const subjOrderCounters = {};
      const mapped = data.map(q => {
        const sKey = q.subject || 'ALL';
        subjOrderCounters[sKey] = (subjOrderCounters[sKey] || 0) + 1;
        return {
          id: q.question_id,
          subject: q.subject,
          type: q.question_type,
          typeName: q.type_name,
          weight: Math.round((Number(q.weight) || 0) * 100) / 100,
          weightLocked: Boolean(q.weight_locked),
          orderNumber: subjOrderCounters[sKey],
          createdBy: q.created_by || 'admin',
          prompt: q.prompt,
          media: q.media_url,
          options: q.options,
          statements: q.statements,
          premises: q.premises,
          responses: q.responses,
          correctKey: safeJsonParseKey(q.correct_key),
          explanation: q.explanation
        };
      });
      return markArrayOk(mapped, true);
    } catch (_) {
      return markArrayOk([], false);
    }
  }

  function buildQuestionRow(q, includeWeightLocked = true) {
    const row = {
      question_id: String(q.id),
      subject: String(q.subject || 'Umum').trim() || 'Umum',
      question_type: normalizeQuestionTypeEnum(q.type),
      type_name: String(q.typeName || 'Pilihan Ganda'),
      weight: Math.max(0, Math.round((Number(q.weight) || 0) * 100) / 100),
      prompt: String(q.prompt || ''),
      media_url: q.media || '',
      options: q.options || null,
      statements: q.statements || null,
      premises: q.premises || null,
      responses: q.responses || null,
      correct_key: (q.correctKey !== undefined && q.correctKey !== null) ? q.correctKey : '',
      explanation: q.explanation || '',
      created_by: q.createdBy || 'admin',
      updated_at: new Date().toISOString()
    };
    if (includeWeightLocked) {
      row.weight_locked = Boolean(q.weightLocked);
    }
    return row;
  }

  async function saveQuestionToSupabase(q) {
    const sb = getClient();
    if (!sb || !q) return false;
    try {
      let useLock = true;
      let forceIntWeight = false;
      const attempt = async () => {
        const row = buildQuestionRow(q, useLock);
        if (forceIntWeight) row.weight = Math.round(row.weight);
        return await sb.from('questions').upsert(row, { onConflict: 'question_id' });
      };
      let { error } = await attempt();
      if (error && useLock && String(error.message || '').includes('weight_locked')) {
        useLock = false;
        ({ error } = await attempt());
      }
      if (error && !forceIntWeight && /invalid input syntax for type integer|must be int/i.test(String(error.message || ''))) {
        forceIntWeight = true;
        console.warn('[CbtSupabase] Kolom weight di Supabase masih bertipe INT. Jalankan migrasi NUMERIC(5,2) pada supabase/schema.sql untuk bobot desimal persis.');
        ({ error } = await attempt());
      }
      if (error) console.warn('[CbtSupabase] saveQuestionToSupabase error:', error.message);
      return !error;
    } catch (_) {
      return false;
    }
  }

  async function saveQuestionsBatchToSupabase(questionsList) {
    const sb = getClient();
    if (!sb || !Array.isArray(questionsList) || questionsList.length === 0) return false;
    try {
      let includeLockCol = true;
      let forceIntWeight = false;
      const dedupeWithCol = (useLock, asInt) => Array.from(new Map(questionsList.filter(q => q && q.id).map(q => {
        const row = buildQuestionRow(q, useLock);
        if (asInt) row.weight = Math.round(row.weight);
        return [String(q.id), row];
      })).values());
      let deduped = dedupeWithCol(includeLockCol, forceIntWeight);
      for (let i = 0; i < deduped.length; i += 100) {
        const chunk = deduped.slice(i, i + 100);
        let { error } = await sb.from('questions').upsert(chunk, { onConflict: 'question_id' });
        if (error && includeLockCol && String(error.message || '').includes('weight_locked')) {
          includeLockCol = false;
          deduped = dedupeWithCol(includeLockCol, forceIntWeight);
          ({ error } = await sb.from('questions').upsert(deduped.slice(i, i + 100), { onConflict: 'question_id' }));
        }
        if (error && !forceIntWeight && /invalid input syntax for type integer|must be int/i.test(String(error.message || ''))) {
          forceIntWeight = true;
          console.warn('[CbtSupabase] Kolom weight di Supabase masih bertipe INT. Jalankan migrasi NUMERIC(5,2) pada supabase/schema.sql untuk bobot desimal persis.');
          deduped = dedupeWithCol(includeLockCol, true);
          ({ error } = await sb.from('questions').upsert(deduped.slice(i, i + 100), { onConflict: 'question_id' }));
        }
        if (error) {
          console.warn('[CbtSupabase] saveQuestionsBatchToSupabase error:', error.message);
          return false;
        }
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  async function deleteQuestionFromSupabase(qId) {
    const sb = getClient();
    if (!sb || !qId) return false;
    try {
      const { error } = await sb.from('questions').delete().eq('question_id', String(qId));
      if (error) console.warn('[CbtSupabase] deleteQuestionFromSupabase error:', error.message);
      return !error;
    } catch (_) {
      return false;
    }
  }

  async function deleteQuestionsBatchFromSupabase(qIds) {
    const sb = getClient();
    if (!sb || !Array.isArray(qIds) || qIds.length === 0) return false;
    try {
      const cleanIds = qIds.map(id => String(id || '').trim()).filter(Boolean);
      if (cleanIds.length === 0) return false;
      for (let i = 0; i < cleanIds.length; i += 100) {
        const chunk = cleanIds.slice(i, i + 100);
        const { error } = await sb.from('questions').delete().in('question_id', chunk);
        if (error) {
          console.warn('[CbtSupabase] deleteQuestionsBatchFromSupabase error:', error.message);
          return false;
        }
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  // 4. Sinkronisasi Jadwal Ujian
  async function fetchExamsFromSupabase() {
    const sb = getClient();
    if (!sb) return markArrayOk([], false);
    try {
      const { data, error } = await sb.from('exams').select('*').order('start_time', { ascending: false });
      if (error || !data) return markArrayOk([], false);
      const allRandKeys = ['PG', 'PGK', 'AKM', 'BS', 'MATCH', 'ESAI'];
      const mapped = data.map(ex => {
        const stLocal = toLocalDateTimeStr(ex.start_time);
        const enLocal = toLocalDateTimeStr(ex.end_time);
        const rawRt = ex.randomize_types;
        let randTypes = [];
        let randomizeConfig = {};
        if (Array.isArray(rawRt)) {
          randTypes = rawRt;
          allRandKeys.forEach(k => { randomizeConfig[k] = randTypes.includes(k); });
        } else if (rawRt && typeof rawRt === 'object') {
          randomizeConfig = { ...rawRt };
          randTypes = Object.keys(rawRt).filter(k => Boolean(rawRt[k]));
        } else {
          randTypes = ex.randomize === false ? [] : [...allRandKeys];
          allRandKeys.forEach(k => { randomizeConfig[k] = ex.randomize !== false; });
        }
        return {
          id: String(ex.id),
          subject: ex.subject,
          name: ex.exam_name,
          ownerId: ex.owner_id,
          ownerName: ex.owner_name,
          classes: ex.target_classes || [],
          startTime: stLocal || ex.start_time,
          endTime: enLocal || ex.end_time,
          datetime: stLocal && enLocal ? `${toIndoDateTimeDisplay(stLocal)} s.d ${toIndoDateTimeDisplay(enLocal)}` : '',
          duration: ex.duration_minutes,
          status: ex.status,
          pin: ex.session_token,
          randomize: ex.randomize !== false && randTypes.length > 0,
          randTypes,
          randomizeConfig
        };
      });
      return markArrayOk(mapped, true);
    } catch (_) {
      return markArrayOk([], false);
    }
  }

  async function saveExamToSupabase(examObj) {
    const sb = getClient();
    if (!sb) return false;
    const rtPayload = (examObj.randomizeConfig && typeof examObj.randomizeConfig === 'object' && !Array.isArray(examObj.randomizeConfig))
      ? examObj.randomizeConfig
      : (Array.isArray(examObj.randTypes) ? examObj.randTypes : (examObj.randomize === false ? [] : ['PG', 'PGK', 'AKM', 'BS', 'MATCH', 'ESAI']));
    const row = {
      id: String(examObj.id || ('EX-' + Date.now())),
      subject: String(examObj.subject || 'Umum').trim() || 'Umum',
      exam_name: String(examObj.name || 'Ujian'),
      owner_id: examObj.ownerId || 'admin',
      owner_name: examObj.ownerName || 'Administrator Utama',
      target_classes: Array.isArray(examObj.classes) && examObj.classes.length ? examObj.classes : ['Semua Kelas'],
      start_time: toIsoTimestamp(examObj.startTime, 0),
      end_time: toIsoTimestamp(examObj.endTime, 90 * 60000),
      duration_minutes: Math.max(1, Math.round(Number(examObj.duration) || 90)),
      session_token: examObj.pin || 'PUSPENDIK71',
      randomize: examObj.randomize !== false,
      randomize_types: rtPayload,
      status: normalizeExamStatusEnum(examObj.status),
      updated_at: new Date().toISOString()
    };
    const { error } = await sb.from('exams').upsert(row, { onConflict: 'id' });
    if (error) console.warn('[CbtSupabase] saveExamToSupabase error:', error.message);
    return !error;
  }

  async function syncTokenToAllExamsInSupabase(pin, examsList = []) {
    const sb = getClient();
    if (!sb || !pin) return false;
    try {
      const cleanPin = String(pin).trim().toUpperCase();
      await sb.from('app_config').update({
        active_token: cleanPin,
        updated_at: new Date().toISOString()
      }).eq('id', 1);
      await sb.from('exams').update({
        session_token: cleanPin,
        updated_at: new Date().toISOString()
      }).neq('id', '');
      if (Array.isArray(examsList) && examsList.length > 0) {
        examsList.forEach(ex => {
          if (ex) ex.pin = cleanPin;
        });
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  async function deleteExamFromSupabase(examId) {
    const sb = getClient();
    if (!sb || !examId) return false;
    try {
      const { error } = await sb.from('exams').delete().eq('id', String(examId));
      if (error) console.warn('[CbtSupabase] deleteExamFromSupabase error:', error.message);
      return !error;
    } catch (_) {
      return false;
    }
  }

  function buildUserRow(user, includeAvatar = true, includeTeachingAssignments = true) {
    const uid = String(user.id || '').trim();
    const row = {
      user_id: uid,
      username: String(user.username || uid).trim() || uid,
      full_name: String(user.name || '').trim() || uid,
      role: normalizeUserRoleEnum(user.role),
      class_name: user.className || user.class || 'Semua Kelas',
      subject: user.subject || 'ALL',
      assigned_classes: Array.isArray(user.assignedClasses) ? user.assignedClasses : [],
      assigned_subjects: Array.isArray(user.assignedSubjects) ? user.assignedSubjects : [],
      password_hash: user.pass || 'sigma71pass',
      gender: user.gender || 'Laki-laki',
      birth_date: user.birthDate || '2008-01-01',
      updated_at: new Date().toISOString()
    };
    if (includeAvatar && user.avatar) {
      row.avatar_url = String(user.avatar);
    }
    if (includeTeachingAssignments && Array.isArray(user.teachingAssignments) && user.teachingAssignments.length > 0) {
      row.teaching_assignments = normalizeTeachingAssignments(user.teachingAssignments);
    }
    return row;
  }

  // 4B. Sinkronisasi Pengguna
  async function saveUserToSupabase(user) {
    const sb = getClient();
    if (!user) return false;
    clearUserDeleted(user.id, user.teacherId || '');
    if (!sb) return false;
    try {
      let incAvatar = true;
      let incAssign = true;
      let { error } = await sb.from('users').upsert(buildUserRow(user, incAvatar, incAssign), { onConflict: 'user_id' });
      if (error && String(error.message || '').includes('teaching_assignments')) {
        incAssign = false;
        ({ error } = await sb.from('users').upsert(buildUserRow(user, incAvatar, incAssign), { onConflict: 'user_id' }));
      }
      if (error && String(error.message || '').includes('avatar_url')) {
        incAvatar = false;
        ({ error } = await sb.from('users').upsert(buildUserRow(user, incAvatar, incAssign), { onConflict: 'user_id' }));
      }
      if (error) console.warn('[CbtSupabase] saveUserToSupabase error:', error.message);
      return !error;
    } catch (_) {
      return false;
    }
  }

  async function deleteUserFromSupabase(userId, options = {}) {
    const sb = getClient();
    if (!userId) return false;
    const targetId = String(userId).trim();
    const derivedTid = options.teacherId || ('GURU-' + targetId.replace(/[^a-zA-Z0-9_-]/g, '_'));
    markUserDeleted(targetId, derivedTid);
    if (options.proctorName) {
      markMasterItemDeleted('proctors', options.proctorName);
    }
    if (!sb) return false;
    try {
      let rowMeta = null;
      try {
        const { data: found } = await sb.from('users').select('user_id,username,full_name,role').eq('user_id', targetId).maybeSingle();
        if (found) rowMeta = found;
      } catch (_) {}

      const { error } = await sb.from('users').delete().eq('user_id', targetId);
      if (error) {
        console.warn('[CbtSupabase] deleteUserFromSupabase error:', error.message);
        return false;
      }

      const usernameToDelete = options.username || (rowMeta && rowMeta.username) || '';
      const proctorNameToDelete = options.proctorName || (rowMeta && rowMeta.role === 'Guru' ? rowMeta.full_name : '');

      try {
        await deleteTeacherPermissionsFromSupabase(derivedTid, targetId, usernameToDelete);
        if (proctorNameToDelete) {
          await deleteMasterItemFromSupabase('proctors', proctorNameToDelete);
        }
        await sb.from('exam_sessions').delete().eq('student_id', targetId);
      } catch (_) {}
      return true;
    } catch (_) {
      return false;
    }
  }

  async function fetchUsersFromSupabase() {
    const sb = getClient();
    if (!sb) return markArrayOk([], false);
    try {
      const { data, error } = await sb.from('users').select('*').order('user_id');
      if (error || !data) return markArrayOk([], false);
      const validUsers = [];
      data.forEach(u => {
        if (isUserDeleted(u.user_id, '') && u.role !== 'Admin') {
          deleteUserFromSupabase(u.user_id, {
            role: u.role,
            proctorName: u.role === 'Guru' ? u.full_name : '',
            username: u.username
          }).catch(() => {});
          return;
        }
        validUsers.push(mapSupabaseUserRow(u));
      });
      return markArrayOk(validUsers, true);
    } catch (_) {
      return markArrayOk([], false);
    }
  }

  async function saveExamSessionResult(sessionData) {
    const sb = getClient();
    if (!sb || !sessionData) return false;
    try {
      const remSec = sessionData.remainingSeconds !== undefined ? Math.max(0, Number(sessionData.remainingSeconds) || 0) : 0;
      const mm = Math.floor(remSec / 60);
      const ss = remSec % 60;
      const subj = String(sessionData.subject || 'GENERAL').trim() || 'GENERAL';
      const examId = String(sessionData.examId || ('EX-' + subj)).trim();
      const studentId = String(sessionData.studentId).trim();
      const sessionId = String(sessionData.sessionId || ('SES-' + subj + '-' + studentId));

      const rawAnswers = (sessionData.answers || sessionData.itemAnswers || {});
      const packedAnswers = { ...rawAnswers };
      if (Array.isArray(sessionData.orderedQuestionIds) && sessionData.orderedQuestionIds.length > 0) {
        packedAnswers.__meta_order = sessionData.orderedQuestionIds;
      }
      if (sessionData.sessionSeed) {
        packedAnswers.__meta_seed = sessionData.sessionSeed;
      }
      if (sessionData.originalOrderMap && typeof sessionData.originalOrderMap === 'object') {
        packedAnswers.__meta_orig_order = sessionData.originalOrderMap;
      }
      if (sessionData.itemDoubts && typeof sessionData.itemDoubts === 'object') {
        packedAnswers.__meta_doubts = sessionData.itemDoubts;
      }
      if (sessionData.loginTime && sessionData.loginTime !== '-') {
        packedAnswers.__meta_loginTime = sessionData.loginTime;
      }
      if (sessionData.endTimestampMs && Number(sessionData.endTimestampMs) > 0) {
        packedAnswers.__meta_end_ts = Number(sessionData.endTimestampMs);
      }
      if (sessionData.essayItemScores && typeof sessionData.essayItemScores === 'object' && Object.keys(sessionData.essayItemScores).length > 0) {
        packedAnswers.__meta_essay_scores = sessionData.essayItemScores;
      }

      const rawProgress = sessionData.progress !== undefined ? Number(sessionData.progress) || 0 : 0;
      const rawStatus = sessionData.status || 'FINISHED';
      const resolvedStatus = (rawProgress >= 100 && rawStatus === 'WORKING') ? 'FINISHED' : rawStatus;

      const row = {
        session_id: sessionId,
        exam_id: examId,
        student_id: studentId,
        student_name: String(sessionData.studentName || ''),
        class_name: String(sessionData.className || '-'),
        subject: subj,
        status: resolvedStatus,
        login_time: sessionData.loginTime || packedAnswers.__meta_loginTime || new Date().toLocaleTimeString('id-ID'),
        remaining_seconds: remSec,
        remaining_time: sessionData.remainingTime || (remSec > 0 ? `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : (resolvedStatus === 'FINISHED' ? '00:00' : '-')),
        progress_percent: resolvedStatus === 'FINISHED' ? 100 : rawProgress,
        cheat_count: Number(sessionData.cheatCount) || 0,
        objective_score: Number(sessionData.objScore) || 0,
        essay_score: Number(sessionData.essayScore) || 0,
        final_score: Number(sessionData.finalScore) || 0,
        essay_answer_text: sessionData.essayText || '',
        item_answers: packedAnswers,
        last_activity: sessionData.lastActivity || 'Sinkron Sesi Ujian',
        updated_at: new Date().toISOString()
      };

      let { error } = await sb.from('exam_sessions').upsert(row, { onConflict: 'session_id' });
      if (error && (error.code === '23505' || String(error.message || '').includes('exam_sessions_exam_id_student_id_key'))) {
        const retry = await sb.from('exam_sessions').upsert(row, { onConflict: 'exam_id,student_id' });
        error = retry.error;
      }
      if (error) console.warn('[CbtSupabase] saveExamSessionResult error:', error.message);
      return !error;
    } catch (_) {
      return false;
    }
  }

  async function fetchStudentSessions(studentId) {
    const sb = getClient();
    if (!sb || !studentId) return [];
    try {
      const { data, error } = await sb
        .from('exam_sessions')
        .select('*')
        .eq('student_id', String(studentId))
        .order('updated_at', { ascending: true });
      if (error || !data) return [];
      return data;
    } catch (_) {
      return [];
    }
  }

  // 5. Monitoring Real-Time & Subscription (60 FPS)
  async function fetchMonitoringSessions(subject = 'ALL', className = 'ALL') {
    const sb = getClient();
    if (!sb) return markArrayOk([], false);
    try {
      let q = sb.from('exam_sessions').select('*');
      if (subject && subject !== 'ALL') q = q.eq('subject', subject);
      if (className && className !== 'ALL') q = q.eq('class_name', className);
      const { data, error } = await q;
      if (error || !data) return markArrayOk([], false);
      return markArrayOk(data, true);
    } catch (_) {
      return markArrayOk([], false);
    }
  }

  // Throttled Batch Rendering (1 detik) untuk Skalabilitas 400+ Siswa Serentak
  let __realtimeUiRefreshTimer = null;
  let __realtimeUiRefreshPendingFns = [];

  function scheduleRealtimeUiRefresh(renderFn, delayMs = 1200) {
    if (typeof renderFn === 'function') {
      __realtimeUiRefreshPendingFns.push(renderFn);
    }
    if (__realtimeUiRefreshTimer) return;
    __realtimeUiRefreshTimer = setTimeout(() => {
      __realtimeUiRefreshTimer = null;
      const fns = __realtimeUiRefreshPendingFns.splice(0, __realtimeUiRefreshPendingFns.length);
      const runBatch = () => {
        // Jalankan callback terbaru/unik agar DOM tidak dirender berulang kali
        const seen = new Set();
        const uniqueFns = [];
        for (let i = fns.length - 1; i >= 0; i--) {
          const src = fns[i].toString();
          if (!seen.has(src)) {
            seen.add(src);
            uniqueFns.unshift(fns[i]);
          }
        }
        uniqueFns.forEach(fn => {
          try { fn(); } catch (_) {}
        });
      };
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(runBatch);
      } else {
        runBatch();
      }
    }, Math.max(250, Number(delayMs) || 1200));
  }

  if (typeof window !== 'undefined') {
    window.scheduleRealtimeUiRefresh = scheduleRealtimeUiRefresh;
  }

  function subscribeMonitoringRealtime(onPayloadReceived, studentIdFilter = '') {
    const sb = getClient();
    if (!sb) return null;
    const pgFilter = studentIdFilter
      ? { event: '*', schema: 'public', table: 'exam_sessions', filter: `student_id=eq.${String(studentIdFilter)}` }
      : { event: '*', schema: 'public', table: 'exam_sessions' };
    const channel = sb.channel(studentIdFilter ? `realtime-student-${studentIdFilter}` : 'realtime-exam-monitoring')
      .on(
        'postgres_changes',
        pgFilter,
        (payload) => {
          if (typeof onPayloadReceived === 'function') {
            onPayloadReceived(payload);
          }
        }
      )
      .subscribe();
    return channel;
  }

  // Unified Realtime Listener dengan Throttled Batch Rendering (400+ Siswa Serentak 60 FPS)
  function subscribeRealtime(handlers = {}) {
    const sb = getClient();
    if (!sb) return null;
    const {
      onSessionChange,
      onConfigChange,
      onExamChange,
      onQuestionsChange,
      onUsersChange,
      onTeacherPermsChange,
      onMasterItemsChange,
      studentIdFilter = ''
    } = handlers || {};

    const sessionFilter = studentIdFilter
      ? { event: '*', schema: 'public', table: 'exam_sessions', filter: `student_id=eq.${String(studentIdFilter)}` }
      : { event: '*', schema: 'public', table: 'exam_sessions' };

    const channelName = studentIdFilter ? `realtime-cbt-student-${studentIdFilter}` : 'realtime-cbt-unified';
    const channel = sb.channel(channelName)
      .on('postgres_changes', sessionFilter, (payload) => {
        if (typeof onSessionChange === 'function') {
          onSessionChange(payload);
        } else {
          scheduleRealtimeUiRefresh(() => {
            if (typeof window !== 'undefined') {
              if (typeof window.renderMonitoringTable === 'function') window.renderMonitoringTable();
              if (typeof window.renderGradesTable === 'function') window.renderGradesTable();
            }
          });
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'app_config' }, (payload) => {
        if (typeof onConfigChange === 'function') onConfigChange(payload);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'exams' }, (payload) => {
        if (typeof onExamChange === 'function') onExamChange(payload);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'questions' }, (payload) => {
        if (typeof onQuestionsChange === 'function') onQuestionsChange(payload);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, (payload) => {
        if (typeof onUsersChange === 'function') onUsersChange(payload);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'teacher_permissions' }, (payload) => {
        if (typeof onTeacherPermsChange === 'function') onTeacherPermsChange(payload);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'master_items' }, (payload) => {
        if (typeof onMasterItemsChange === 'function') onMasterItemsChange(payload);
      })
      .subscribe();

    return channel;
  }

  function subscribeGlobalUpdatesRealtime(onConfigChange, onExamChange, extraHandlers = {}) {
    const sb = getClient();
    if (!sb) return null;
    const channel = sb.channel('realtime-global-cbt-updates')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'app_config' },
        (payload) => {
          if (typeof onConfigChange === 'function') onConfigChange(payload);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'exams' },
        (payload) => {
          if (typeof onExamChange === 'function') onExamChange(payload);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'questions' },
        (payload) => {
          if (typeof extraHandlers.onQuestionsChange === 'function') extraHandlers.onQuestionsChange(payload);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'users' },
        (payload) => {
          if (typeof extraHandlers.onUsersChange === 'function') extraHandlers.onUsersChange(payload);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'teacher_permissions' },
        (payload) => {
          if (typeof extraHandlers.onTeacherPermsChange === 'function') extraHandlers.onTeacherPermsChange(payload);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'master_items' },
        (payload) => {
          if (typeof extraHandlers.onMasterItemsChange === 'function') extraHandlers.onMasterItemsChange(payload);
        }
      )
      .subscribe();
    return channel;
  }

  // 6. Reset & Buka Blokir Siswa
  async function resetStudentSessionInSupabase(sessionId, studentId = '', subject = '') {
    const sb = getClient();
    if (!sb) return false;
    const resetPatch = {
      status: 'BELUM_LOGIN',
      progress_percent: 0,
      remaining_seconds: 0,
      remaining_time: '-',
      login_time: '-',
      cheat_count: 0,
      objective_score: 0,
      essay_score: 0,
      final_score: 0,
      essay_answer_text: '',
      item_answers: {},
      last_activity: 'Ujian di-reset oleh Pengawas / Admin',
      updated_at: new Date().toISOString()
    };
    const { error } = await sb.from('exam_sessions').update(resetPatch).eq('session_id', sessionId);
    if (studentId) {
      let q = sb.from('exam_sessions').update(resetPatch).eq('student_id', String(studentId));
      if (subject && subject !== 'ALL') q = q.eq('subject', String(subject));
      await q;
    }
    return !error;
  }

  // 7. Unggah File Media ke Supabase Storage (Bucket: cbt-media)
  async function uploadMedia(file) {
    const sb = getClient();
    if (!sb) throw new Error('Supabase client belum aktif.');
    const ext = (file.name && file.name.split('.').pop()) || 'png';
    const filePath = `questions/${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${ext}`;
    const { error: uploadError } = await sb.storage.from('cbt-media').upload(filePath, file, {
      cacheControl: '3600',
      upsert: true
    });
    if (uploadError) throw uploadError;
    const { data: pubData } = sb.storage.from('cbt-media').getPublicUrl(filePath);
    return pubData.publicUrl;
  }

  async function uploadLogoToStorage(file, prefix = 'school-logo') {
    const sb = getClient();
    if (!sb || !sb.storage || !file) return null;
    try {
      const ext = (file.name && file.name.includes('.')) ? file.name.split('.').pop().toLowerCase() : 'png';
      const filePath = `logos/${prefix}_${Date.now()}.${ext}`;
      const { error: uploadError } = await sb.storage.from('cbt-media').upload(filePath, file, {
        cacheControl: '3600',
        upsert: true
      });
      if (uploadError) return null;
      const { data: pubData } = sb.storage.from('cbt-media').getPublicUrl(filePath);
      return pubData && pubData.publicUrl ? pubData.publicUrl : null;
    } catch (_) {
      return null;
    }
  }

  // 8. Pencatatan Audit Log (Lokal Saja agar database Supabase tetap ringan)
  async function recordAudit(actor, role, action, detail, status = 'SUCCESS') {
    return { localOnly: true, skipped: true };
  }

  // Auto-init on load if running in browser window
  if (typeof window !== 'undefined') {
    setTimeout(() => {
      try {
        const creds = getStoredCredentials();
        init(creds.url, creds.anonKey || creds.publishableKey);
      } catch (_) {}
    }, 50);
  }

  // 9. Sinkronisasi Pengguna Massal ke Supabase
  async function syncUsersToSupabase(usersList) {
    const sb = getClient();
    if (!sb) return false;
    try {
      let useAvatar = true;
      let useAssign = true;
      const buildDeduped = (incAvatar, incAssign) => Array.from(new Map((usersList || []).filter(u => u && u.id).map(u => [String(u.id), buildUserRow(u, incAvatar, incAssign)])).values());
      let deduped = buildDeduped(useAvatar, useAssign);
      for (let i = 0; i < deduped.length; i += 100) {
        let chunk = deduped.slice(i, i + 100);
        let { error } = await sb.from('users').upsert(chunk, { onConflict: 'user_id' });
        if (error && useAssign && String(error.message || '').includes('teaching_assignments')) {
          useAssign = false;
          deduped = buildDeduped(useAvatar, false);
          chunk = deduped.slice(i, i + 100);
          ({ error } = await sb.from('users').upsert(chunk, { onConflict: 'user_id' }));
        }
        if (error && useAvatar && String(error.message || '').includes('avatar_url')) {
          useAvatar = false;
          deduped = buildDeduped(false, useAssign);
          chunk = deduped.slice(i, i + 100);
          ({ error } = await sb.from('users').upsert(chunk, { onConflict: 'user_id' }));
        }
        if (error) {
          console.warn('[CbtSupabase] syncUsersToSupabase chunk error:', error.message);
          return false;
        }
      }
      return true;
    } catch (e) {
      console.warn('[CbtSupabase] Gagal sync users:', e);
      return false;
    }
  }

  // 10. Sinkronisasi Penuh Seluruh Data CBT ke Supabase PostgreSQL (Upsert Batch Permanen)
  async function syncAllCbtData(state) {
    const sb = getClient();
    if (!sb) return { success: false, message: 'Supabase client belum aktif' };
    try {
      const results = { config: true, master: true, users: true, teachers: true, exams: true, questions: true, sessions: true };
      if (state.config) {
        results.config = await syncConfigToSupabase(state.config, state.activePin);
      }
      if (state.master) {
        results.master = await syncMasterItemsToSupabase(state.master, { fullReplace: true, clearTombstones: true });
      }
      if (state.users && state.users.length > 0) {
        results.users = await syncUsersToSupabase(state.users);
      }
      if (state.teachers && typeof state.teachers === 'object') {
        const teacherEntries = Object.entries(state.teachers).filter(([, tData]) => tData);
        const desiredTids = new Set(teacherEntries.map(([tid, tData]) => String(tid || tData.id)));
        try {
          const { data: existingPerms } = await sb.from('teacher_permissions').select('teacher_id');
          if (Array.isArray(existingPerms)) {
            const staleTids = existingPerms
              .map(r => r.teacher_id)
              .filter(id => id && !desiredTids.has(String(id)));
            for (let i = 0; i < staleTids.length; i += 100) {
              await sb.from('teacher_permissions').delete().in('teacher_id', staleTids.slice(i, i + 100));
            }
          }
        } catch (_) {}

        if (teacherEntries.length > 0) {
          const buildTeacherRows = (includeAssignments = true) => teacherEntries.map(([tid, tData]) => {
            clearUserDeleted(tData.nip || tid, tid || tData.id);
            const row = {
              teacher_id: String(tid || tData.id),
              nip: String(tData.nip || tid),
              full_name: String(tData.name || ''),
              username: String(tData.username || tData.nip || ''),
              assigned_subjects: Array.isArray(tData.assignedSubjects) ? tData.assignedSubjects : [],
              assigned_classes: Array.isArray(tData.assignedClasses) ? tData.assignedClasses : ['Semua Kelas'],
              perm_create_questions: tData.permCreateQuestions !== false,
              perm_manage_exams: tData.permManageExams !== false,
              perm_proctor: tData.permProctor !== false,
              perm_grade_analyze: tData.permGradeAnalyze !== false,
              can_set_token: Boolean(tData.canSetToken),
              can_unblock_students: tData.canUnblockStudents !== false,
              updated_at: new Date().toISOString()
            };
            if (includeAssignments && Array.isArray(tData.teachingAssignments)) {
              row.teaching_assignments = normalizeTeachingAssignments(tData.teachingAssignments);
            }
            return row;
          });
          let useTa = true;
          let teacherRows = buildTeacherRows(useTa);
          for (let i = 0; i < teacherRows.length; i += 100) {
            let { error } = await sb.from('teacher_permissions').upsert(teacherRows.slice(i, i + 100), { onConflict: 'teacher_id' });
            if (error && useTa && String(error.message || '').includes('teaching_assignments')) {
              useTa = false;
              teacherRows = buildTeacherRows(false);
              ({ error } = await sb.from('teacher_permissions').upsert(teacherRows.slice(i, i + 100), { onConflict: 'teacher_id' }));
            }
            if (error) {
              console.warn('[CbtSupabase] syncAll teacher_permissions error:', error.message);
              results.teachers = false;
            }
          }
        }
      }
      if (state.exams && state.exams.length > 0) {
        const examRows = state.exams.map(examObj => {
          const rtPayload = (examObj.randomizeConfig && typeof examObj.randomizeConfig === 'object' && !Array.isArray(examObj.randomizeConfig))
            ? examObj.randomizeConfig
            : (Array.isArray(examObj.randTypes) ? examObj.randTypes : (examObj.randomize === false ? [] : ['PG', 'PGK', 'AKM', 'BS', 'MATCH', 'ESAI']));
          return {
            id: String(examObj.id || ('EX-' + Date.now())),
            subject: String(examObj.subject || 'Umum').trim() || 'Umum',
            exam_name: String(examObj.name || 'Ujian'),
            owner_id: examObj.ownerId || 'admin',
            owner_name: examObj.ownerName || 'Administrator Utama',
            target_classes: Array.isArray(examObj.classes) && examObj.classes.length ? examObj.classes : ['Semua Kelas'],
            start_time: toIsoTimestamp(examObj.startTime, 0),
            end_time: toIsoTimestamp(examObj.endTime, 90 * 60000),
            duration_minutes: Math.max(1, Math.round(Number(examObj.duration) || 90)),
            session_token: examObj.pin || state.activePin || 'PUSPENDIK71',
            randomize: examObj.randomize !== false,
            randomize_types: rtPayload,
            status: normalizeExamStatusEnum(examObj.status),
            updated_at: new Date().toISOString()
          };
        });
        for (let i = 0; i < examRows.length; i += 100) {
          const { error } = await sb.from('exams').upsert(examRows.slice(i, i + 100), { onConflict: 'id' });
          if (error) {
            console.warn('[CbtSupabase] syncAll exams error:', error.message);
            results.exams = false;
          }
        }
      }
      if (state.questions && state.questions.length > 0) {
        results.questions = await saveQuestionsBatchToSupabase(state.questions);
      }

      // Kumpulkan seluruh sesi siswa (baik per-mapel di examSessions maupun status top-level) lalu upsert batch
      const sessionRowMap = new Map();
      const studentUsers = (state.users || []).filter(u => u && u.role === 'Siswa');
      for (const st of studentUsers) {
        const pushSessionEntry = (subjKey, sessObj) => {
          const subj = String(subjKey || 'GENERAL').trim() || 'GENERAL';
          const status = (sessObj && sessObj.status) || st.status || 'BELUM_LOGIN';
          const hasAnswers = sessObj && sessObj.itemAnswers && Object.keys(sessObj.itemAnswers).length > 0;
          if (status === 'BELUM_LOGIN' && !hasAnswers) return;
          const matchedExam = (state.exams || []).find(ex => ex.subject === subj || ex.id === subjKey);
          const realSubj = matchedExam ? matchedExam.subject : subj;
          const examId = matchedExam ? String(matchedExam.id) : ('EX-' + realSubj);
          const sessionId = `SES-${realSubj}-${st.id}`;
          const remSec = sessObj && sessObj.remainingSeconds !== undefined
            ? Math.max(0, Number(sessObj.remainingSeconds) || 0)
            : (Number(st.remainingSeconds) || 0);
          const rawAns = (sessObj && sessObj.itemAnswers) || st.itemAnswers || {};
          const packed = { ...rawAns };
          if (Array.isArray(sessObj?.orderedQuestionIds) && sessObj.orderedQuestionIds.length > 0) {
            packed.__meta_order = sessObj.orderedQuestionIds;
          } else if (Array.isArray(st.orderedQuestionIds) && st.orderedQuestionIds.length > 0) {
            packed.__meta_order = st.orderedQuestionIds;
          }
          if (sessObj?.sessionSeed || st.sessionSeed) packed.__meta_seed = sessObj?.sessionSeed || st.sessionSeed;
          if (sessObj?.itemDoubts || st.itemDoubts) packed.__meta_doubts = sessObj?.itemDoubts || st.itemDoubts || {};
          if (sessObj?.loginTime || st.loginTime) packed.__meta_loginTime = sessObj?.loginTime || st.loginTime;
          if (sessObj?.endTimestampMs) packed.__meta_end_ts = Number(sessObj.endTimestampMs);
          if (sessObj?.essayItemScores || st.essayItemScores) packed.__meta_essay_scores = sessObj?.essayItemScores || st.essayItemScores;
          const mm = Math.floor(remSec / 60);
          const ss = remSec % 60;
          sessionRowMap.set(sessionId, {
            session_id: sessionId,
            exam_id: examId,
            student_id: String(st.id),
            student_name: String(st.name || ''),
            class_name: String(st.className || st.class || '-'),
            subject: realSubj,
            status,
            login_time: sessObj?.loginTime || st.loginTime || '-',
            remaining_seconds: remSec,
            remaining_time: sessObj?.remainingTime || (remSec > 0 ? `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : (status === 'FINISHED' ? '00:00' : '-')),
            progress_percent: sessObj?.progress !== undefined ? Number(sessObj.progress) || 0 : (Number(st.progress) || 0),
            cheat_count: Number(sessObj?.cheatCount ?? st.cheatCount) || 0,
            objective_score: Number(sessObj?.objScore ?? st.objScore) || 0,
            essay_score: Number(sessObj?.essayScore ?? st.essayScore) || 0,
            final_score: Number(sessObj?.finalScore ?? st.finalScore) || 0,
            essay_answer_text: sessObj?.essayText || st.essayText || '',
            item_answers: packed,
            last_activity: sessObj?.lastActivity || st.lastActivity || 'Sinkron Restore Database',
            updated_at: new Date().toISOString()
          });
        };

        if (st.examSessions && typeof st.examSessions === 'object' && Object.keys(st.examSessions).length > 0) {
          Object.entries(st.examSessions).forEach(([sk, sObj]) => {
            if (sObj && typeof sObj === 'object') pushSessionEntry(sk, sObj);
          });
        } else if (st.status && st.status !== 'BELUM_LOGIN') {
          pushSessionEntry(st.subject || 'GENERAL', st);
        }
      }

      const sessionRows = Array.from(sessionRowMap.values());
      for (let i = 0; i < sessionRows.length; i += 50) {
        const chunk = sessionRows.slice(i, i + 50);
        let { error } = await sb.from('exam_sessions').upsert(chunk, { onConflict: 'session_id' });
        if (error && (error.code === '23505' || String(error.message || '').includes('exam_sessions_exam_id_student_id_key'))) {
          for (const row of chunk) {
            await sb.from('exam_sessions').upsert(row, { onConflict: 'exam_id,student_id' });
          }
        } else if (error) {
          console.warn('[CbtSupabase] syncAll exam_sessions error:', error.message);
          results.sessions = false;
        }
      }

      const allOk = Object.values(results).every(Boolean);
      return {
        success: allOk,
        results,
        message: allOk
          ? 'Seluruh konfigurasi, data master, pengguna, jadwal, bank soal, dan sesi ujian tersinkron penuh ke Supabase.'
          : 'Sebagian data gagal disinkronkan ke Supabase. Periksa koneksi atau schema tabel.'
      };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  function isTolerantUserIdMatch(candidate, inputRaw) {
    const a = String(candidate || '').trim().toLowerCase();
    const b = String(inputRaw || '').trim().toLowerCase();
    if (!a || !b) return false;
    if (a === b) return true;
    const aNoSpace = a.replace(/\s+/g, '');
    const bNoSpace = b.replace(/\s+/g, '');
    if (aNoSpace === bNoSpace) return true;
    if (/^\d{4,}$/.test(aNoSpace) && /^\d{4,}$/.test(bNoSpace)) {
      const aNoZero = aNoSpace.replace(/^0+/, '') || '0';
      const bNoZero = bNoSpace.replace(/^0+/, '') || '0';
      if (aNoZero === bNoZero) return true;
    }
    return false;
  }

  // 11. Autentikasi Universal Multi-Role (Admin / Guru / Siswa) langsung ke Supabase
  async function authenticateUserWithSupabase(identifier, password) {
    const sb = getClient();
    if (!sb) return { success: false, message: 'Supabase client belum aktif' };

    const cleanId = String(identifier || '').trim();
    const cleanPass = String(password || '').trim();
    if (!cleanId || !cleanPass) {
      return { success: false, message: 'Username dan password wajib diisi.' };
    }

    const checkPassMatch = (r) => {
      const dbPass = String(r.password_hash || '').trim();
      if (dbPass === cleanPass || dbPass.toLowerCase() === cleanPass.toLowerCase()) return true;
      if (r.role === 'Guru' && cleanPass === 'guru71pass' && !dbPass) return true;
      if (r.role === 'Siswa' && cleanPass === 'sigma71pass' && !dbPass) return true;
      return false;
    };

    try {
      const safeId = cleanId.replace(/["\\,()]/g, '').trim();
      const noSpaceId = safeId.replace(/\s+/g, '');
      const noZeroId = /^\d+$/.test(noSpaceId) ? (noSpaceId.replace(/^0+/, '') || '0') : noSpaceId;
      const orClauses = [
        `username.ilike."${safeId}"`,
        `user_id.ilike."${safeId}"`,
        `full_name.ilike."${safeId}"`
      ];
      if (noSpaceId && noSpaceId !== safeId) {
        orClauses.push(`username.ilike."${noSpaceId}"`, `user_id.ilike."${noSpaceId}"`);
      }
      if (noZeroId && noZeroId !== noSpaceId && noZeroId.length >= 4) {
        orClauses.push(`user_id.ilike."%${noZeroId}"`, `username.ilike."%${noZeroId}"`);
      }

      let { data: rows, error } = await sb
        .from('users')
        .select('*')
        .or(orClauses.join(','))
        .limit(10);

      const userExistsInRows = !error && Array.isArray(rows) && rows.some(r =>
        isTolerantUserIdMatch(r.user_id, cleanId) ||
        isTolerantUserIdMatch(r.username, cleanId) ||
        String(r.full_name || '').trim().toLowerCase() === cleanId.toLowerCase()
      );

      let matched = (!error && Array.isArray(rows))
        ? rows.find(r => (
            isTolerantUserIdMatch(r.user_id, cleanId) ||
            isTolerantUserIdMatch(r.username, cleanId) ||
            String(r.full_name || '').trim().toLowerCase() === cleanId.toLowerCase()
          ) && checkPassMatch(r))
        : null;

      if (!matched && userExistsInRows) {
        return { success: false, wrongPassword: true, message: 'Password yang Anda masukkan tidak sesuai dengan akun tersebut.' };
      }

      if (!matched && !error && (!Array.isArray(rows) || rows.length === 0)) {
        const { data: allRows, error: allErr } = await sb.from('users').select('*');
        if (!allErr && Array.isArray(allRows)) {
          matched = allRows.find(r => (
            isTolerantUserIdMatch(r.user_id, cleanId) ||
            isTolerantUserIdMatch(r.username, cleanId) ||
            String(r.full_name || '').trim().toLowerCase() === cleanId.toLowerCase()
          ) && checkPassMatch(r));
        }
      }

      if (matched) {
        const user = mapSupabaseUserRow(matched);
        let teacherPermission = null;
        if (user.role === 'Guru') {
          try {
            const safeNip = String(user.id || '').replace(/["\\,()]/g, '');
            const { data: permRow } = await sb
              .from('teacher_permissions')
              .select('*')
              .or(`nip.eq."${safeNip}",username.ilike."${safeId}"`)
              .maybeSingle();
            if (permRow) teacherPermission = permRow;
          } catch (_) {}
        }
        return { success: true, user, teacherPermission, source: 'supabase_table' };
      }
      return { success: false, message: error ? error.message : 'Kredensial tidak ditemukan atau password tidak sesuai di Supabase.' };
    } catch (e) {
      return { success: false, message: e?.message || 'Gagal memverifikasi ke Supabase.' };
    }
  }

  // 12. Autentikasi Admin via Supabase Auth & Users Table
  async function loginAdminWithSupabaseAuth(identifier, password) {
    const sb = getClient();
    if (!sb) return { success: false, message: 'Supabase client belum aktif' };

    try {
      const cleanId = String(identifier || '').trim();
      const safeId = cleanId.replace(/["\\,()]/g, '');
      const email = cleanId.includes('@') ? cleanId : `${cleanId.toLowerCase()}@smpn71bdg.sch.id`;
      const { data, error } = await sb.auth.signInWithPassword({
        email,
        password
      });

      if (!error && data && data.user) {
        return { success: true, user: data.user, source: 'supabase_auth' };
      }

      const { data: dbUser, error: dbErr } = await sb
        .from('users')
        .select('*')
        .eq('role', 'Admin')
        .or(`user_id.ilike."${safeId}",username.ilike."${safeId}"`)
        .eq('password_hash', password)
        .maybeSingle();

      if (dbUser) {
        return { success: true, user: dbUser, source: 'supabase_table' };
      }

      return { success: false, message: error ? error.message : (dbErr ? dbErr.message : 'Kredensial Admin tidak valid di Supabase.') };
    } catch (e) {
      return { success: false, message: e.message };
    }
  }

  return {
    DEFAULT_CONFIG,
    init,
    getClient,
    getStoredCredentials,
    saveStoredCredentials,
    testConnection,
    fetchAppConfig,
    updateAppConfig,
    syncConfigToSupabase,
    fetchMasterItemsFromSupabase,
    saveMasterItemToSupabase,
    deleteMasterItemFromSupabase,
    syncMasterItemsToSupabase,
    markMasterItemDeleted,
    clearMasterItemDeleted,
    isMasterItemDeleted,
    markUserDeleted,
    clearUserDeleted,
    isUserDeleted,
    fetchTeacherPermissionsFromSupabase,
    saveTeacherPermissionsToSupabase,
    deleteTeacherPermissionsFromSupabase,
    fetchQuestionsFromSupabase,
    saveQuestionToSupabase,
    saveQuestionsBatchToSupabase,
    deleteQuestionFromSupabase,
    deleteQuestionsBatchFromSupabase,
    fetchExamsFromSupabase,
    saveExamToSupabase,
    syncTokenToAllExamsInSupabase,
    deleteExamFromSupabase,
    fetchMonitoringSessions,
    fetchStudentSessions,
    scheduleRealtimeUiRefresh,
    subscribeRealtime,
    subscribeMonitoringRealtime,
    subscribeGlobalUpdatesRealtime,
    resetStudentSessionInSupabase,
    uploadMedia,
    uploadLogoToStorage,
    recordAudit,
    syncUsersToSupabase,
    syncAllCbtData,
    saveUserToSupabase,
    deleteUserFromSupabase,
    fetchUsersFromSupabase,
    saveExamSessionResult,
    authenticateUserWithSupabase,
    loginAdminWithSupabaseAuth
  };
}));
