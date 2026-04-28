import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Mail, Lock, Eye, EyeOff, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { motion } from 'motion/react';

export default function RegisterPage() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const { register } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password !== confirmPassword) {
      setError(t('register.err_password_mismatch'));
      return;
    }
    if (password.length < 6) {
      setError(t('register.err_password_short'));
      return;
    }
    if (username.length < 3) {
      setError(t('register.err_username_short'));
      return;
    }
    setIsLoading(true);
    const result = await register(email, password, username);
    setIsLoading(false);
    if (result.error) {
      setError(result.error);
    } else {
      navigate('/loading');
    }
  };

  return (
    <div className="size-full flex items-center justify-center relative overflow-hidden" style={{ background: '#000000' }}>

      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className="w-full max-w-md px-6 relative z-10"
      >
        <div
          className="bg-black/50 backdrop-blur-xl rounded-2xl border border-blue-500/20 p-8 shadow-2xl"
          style={{ boxShadow: '0 0 40px rgba(59,130,246,0.08), inset 0 1px 0 rgba(255,255,255,0.04)' }}
        >
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-4 p-3 bg-red-900/40 border border-red-500/30 rounded-lg text-red-300 text-sm text-center"
            >
              {error}
            </motion.div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Hero Name */}
            <div>
              <label className="block text-xs font-medium text-blue-300/70 mb-2 tracking-widest">
                {t('register.hero_name')}
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-400/40" />
                <input
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/25 focus:outline-none focus:border-blue-500/50 transition-all text-sm"
                  placeholder={t('register.placeholder_hero')}
                  required
                />
              </div>
            </div>

            {/* Email */}
            <div>
              <label className="block text-xs font-medium text-blue-300/70 mb-2 tracking-widest">
                {t('register.email')}
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-400/40" />
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/25 focus:outline-none focus:border-blue-500/50 transition-all text-sm"
                  placeholder={t('register.placeholder_email')}
                  autoComplete="email"
                  required
                />
              </div>
              <p className="mt-1.5 text-xs text-white/25 pl-1">{t('register.email_hint')}</p>
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-medium text-blue-300/70 mb-2 tracking-widest">
                {t('register.password')}
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-400/40" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full pl-10 pr-12 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/25 focus:outline-none focus:border-blue-500/50 transition-all text-sm"
                  placeholder={t('register.placeholder_password')}
                  required
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/70 transition-colors">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Confirm Password */}
            <div>
              <label className="block text-xs font-medium text-blue-300/70 mb-2 tracking-widest">
                {t('register.confirm_password')}
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-400/40" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/25 focus:outline-none focus:border-blue-500/50 transition-all text-sm"
                  placeholder={t('register.placeholder_confirm')}
                  required
                />
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3.5 rounded-xl text-sm font-medium tracking-widest transition-all duration-200 disabled:opacity-50 mt-2"
              style={{
                background: isLoading
                  ? 'rgba(30,58,138,0.4)'
                  : 'linear-gradient(135deg, #1d4ed8, #1e40af, #1e3a8a)',
                boxShadow: isLoading ? 'none' : '0 0 20px rgba(29,78,216,0.35), inset 0 1px 0 rgba(255,255,255,0.08)',
                color: '#bfdbfe',
              }}
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  {t('register.loading')}
                </span>
              ) : (
                t('register.submit')
              )}
            </button>
          </form>

          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-white/10" />
            <span className="text-white/25 text-xs">{t('register.or')}</span>
            <div className="flex-1 h-px bg-white/10" />
          </div>

          <p className="text-center text-xs text-white/40">
            {t('register.have_account')}{' '}
            <button onClick={() => navigate('/login')}
              className="text-blue-400 hover:text-blue-300 font-medium transition-colors">
              {t('register.login_link')}
            </button>
          </p>
        </div>
      </motion.div>
    </div>
  );
}