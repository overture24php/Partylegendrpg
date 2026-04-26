export type Lang = 'id' | 'en';

export const translations = {
  // ─── Login Page ────────────────────────────────────────────────────────────
  'login.email': { id: 'Email', en: 'Email' },
  'login.username': { id: 'Username', en: 'Username' },
  'login.password': { id: 'Password', en: 'Password' },
  'login.remember': { id: 'Ingat saya', en: 'Remember me' },
  'login.forgot': { id: 'Lupa password?', en: 'Forgot password?' },
  'login.submit': { id: 'Login', en: 'Login' },
  'login.loading': { id: 'Memuat...', en: 'Loading...' },
  'login.or': { id: 'atau', en: 'or' },
  'login.no_account': { id: 'Belum punya akun?', en: "Don't have an account?" },
  'login.register_link': { id: 'Daftar Sekarang →', en: 'Register Now →' },
  'login.placeholder_email': { id: 'nama@email.com', en: 'name@email.com' },
  'login.placeholder_username': { id: 'Username kamu...', en: 'Your username...' },
  'login.placeholder_password': { id: '••••••••', en: '••••••••' },
  'login.error_invalid': { id: 'Username atau password salah. Coba lagi.', en: 'Incorrect username or password. Try again.' },
  'login.error_not_found': { id: 'Username tidak ditemukan.', en: 'Username not found.' },

  // ─── Register Page ──────────────────────────────────────────────────────────
  'register.hero_name': { id: 'Username', en: 'Username' },
  'register.email': { id: 'Email Pemulihan', en: 'Recovery Email' },
  'register.email_hint': { id: 'Digunakan untuk pemulihan akun', en: 'Used for account recovery' },
  'register.password': { id: 'Password', en: 'Password' },
  'register.confirm_password': { id: 'Konfirmasi Password', en: 'Confirm Password' },
  'register.submit': { id: 'Buat Akun', en: 'Create Account' },
  'register.loading': { id: 'Membuat Akun...', en: 'Creating Account...' },
  'register.or': { id: 'atau', en: 'or' },
  'register.have_account': { id: 'Sudah punya akun?', en: 'Already have an account?' },
  'register.login_link': { id: 'Masuk Sekarang →', en: 'Login Now →' },
  'register.placeholder_hero': { id: 'Nama unik kamu...', en: 'Your unique name...' },
  'register.placeholder_email': { id: 'nama@email.com', en: 'name@email.com' },
  'register.placeholder_password': { id: 'Min. 6 karakter', en: 'Min. 6 characters' },
  'register.placeholder_confirm': { id: 'Ulangi password', en: 'Repeat password' },
  'register.err_password_mismatch': {
    id: 'Password dan konfirmasi password tidak cocok.',
    en: 'Passwords do not match.',
  },
  'register.err_password_short': {
    id: 'Password minimal 6 karakter.',
    en: 'Password must be at least 6 characters.',
  },
  'register.err_username_short': {
    id: 'Username minimal 3 karakter.',
    en: 'Username must be at least 3 characters.',
  },
  'register.err_generic': { id: 'Gagal membuat akun. Coba lagi.', en: 'Failed to create account. Try again.' },

  // ─── Game Top Bar ───────────────────────────────────────────────────────────
  'game.logout': { id: 'Keluar dari Game', en: 'Logout' },
  'game.daily_login': { id: 'LOGIN HARIAN', en: 'DAILY LOGIN' },
  'game.day': { id: 'Hari ke-', en: 'Day ' },

  // ─── Main Menu ──────────────────────────────────────────────────────────────
  'menu.adventure': { id: 'Petualangan', en: 'Adventure' },
  'menu.heroes': { id: 'Hero', en: 'Heroes' },
  'menu.guild': { id: 'Guild', en: 'Guild' },
  'menu.shop': { id: 'Toko', en: 'Shop' },
  'menu.world': { id: 'Peta Dunia', en: 'World Map' },
  'menu.arena': { id: 'Arena', en: 'Arena' },
  'menu.battle_cta': { id: 'Mulai Pertempuran', en: 'Start Battle' },

  // ─── Quests ─────────────────────────────────────────────────────────────────
  'quest.daily_title': { id: 'MISI HARIAN', en: 'DAILY QUESTS' },
  'quest.completed_fraction': { id: 'selesai', en: 'completed' },
  'quest.1_title': { id: 'Kalahkan 10 Goblin', en: 'Defeat 10 Goblins' },
  'quest.1_reward': { id: '200 Gold', en: '200 Gold' },
  'quest.2_title': { id: 'Kumpulkan 5 Kristal Biru', en: 'Collect 5 Blue Crystals' },
  'quest.2_reward': { id: '1 Permata', en: '1 Gem' },
  'quest.3_title': { id: 'Jelajahi Hutan Gelap', en: 'Explore the Dark Forest' },
  'quest.3_reward': { id: '150 XP', en: '150 XP' },

  // ─── Loading Page ────────────────────────────────────────────────────────────
  'loading.stage_init':    { id: 'Inisialisasi', en: 'Initializing' },
  'loading.stage_assets':  { id: 'Memuat Aset', en: 'Loading Assets' },
  'loading.stage_world':   { id: 'Memuat Dunia', en: 'Loading World' },
  'loading.stage_hero':    { id: 'Menyiapkan Hero', en: 'Preparing Hero' },
  'loading.stage_ready':   { id: 'Siap', en: 'Ready' },

  // ─── Intro / Start Screen ────────────────────────────────────────────────────
  'intro.tap_to_start': { id: 'TEKAN LAYAR UNTUK MEMULAI', en: 'TAP SCREEN TO CONTINUE' },
} as const;

export type TranslationKey = keyof typeof translations;