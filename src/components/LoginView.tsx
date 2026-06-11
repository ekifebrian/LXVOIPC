import React, { useState } from 'react';
import { auth, db } from '../firebase';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword 
} from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { ShieldAlert, UserCheck, Clipboard, ArrowLeft, Key, Mail, LogIn, Database } from 'lucide-react';
import { Language, translations } from '../languages';

interface LoginViewProps {
  user: any;
  isAdmin: boolean;
  isSurveyor?: boolean;
  surveyorName?: string;
  lang: Language;
  onSuccess: () => void;
  onNavigateHome: () => void;
}

export default function LoginView({ 
  user, 
  isAdmin, 
  isSurveyor = false, 
  surveyorName = '', 
  lang, 
  onSuccess, 
  onNavigateHome 
}: LoginViewProps) {
  const t = translations[lang];
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; isError: boolean } | null>(null);

  const showStatus = (text: string, isError = false) => {
    setStatusMessage({ text, isError });
    setTimeout(() => setStatusMessage(null), 5000);
  };

  const handleGoogleLogin = async () => {
    setIsSubmitting(true);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await signInWithPopup(auth, provider);
      showStatus(lang === 'id' ? 'Berhasil masuk dengan Google!' : '使用 Google 登录成功！');
      setTimeout(() => onSuccess(), 800);
    } catch (err: any) {
      console.error(err);
      showStatus(err.message || 'Gagal login Google', true);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCustomLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = loginEmail.trim();
    const password = loginPassword.trim();

    if (!email || !password) {
      showStatus(lang === 'id' ? 'Masukkan Email/Username dan Kata Sandi.' : '请输入账号/邮箱和密码。', true);
      return;
    }

    const finalEmail = email.includes('@') ? email : `${email}@admin.com`;
    setIsSubmitting(true);

    try {
      await signInWithEmailAndPassword(auth, finalEmail, password);
      showStatus(lang === 'id' ? 'Berhasil masuk!' : '登录成功！');
      setTimeout(() => onSuccess(), 800);
    } catch (err: any) {
      console.error(err);
      // Create demo admin account automatically if keys match
      if (finalEmail === 'admin@admin.com' && password === 'admin123' && 
         (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential')) {
        try {
          await createUserWithEmailAndPassword(auth, finalEmail, password);
          showStatus(lang === 'id' ? 'Akun demo admin otomatis didaftarkan & masuk!' : '演示管理员账号自动注册并登录！');
          setTimeout(() => onSuccess(), 800);
          return;
        } catch (createErr: any) {
          console.error(createErr);
        }
      }
      let errMsg = err.message;
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        errMsg = lang === 'id' ? 'Email/Username atau Password tidak cocok.' : '账号或密码不正确！';
      }
      showStatus(errMsg, true);
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyUid = () => {
    if (user?.uid) {
      navigator.clipboard.writeText(user.uid);
      showStatus(lang === 'id' ? 'UID berhasil disalin ke clipboard!' : 'UID 已成功复制到剪贴板！');
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      showStatus(lang === 'id' ? 'Berhasil keluar!' : '已退出账号！');
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="max-w-md w-full mx-auto py-12 px-4">
      {/* Back to Home Button */}
      <button
        onClick={onNavigateHome}
        className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-slate-800 mb-6 transition cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4" />
        {lang === 'id' ? 'Kembali ke Dashboard' : '返回主控台'}
      </button>

      <div className="p-1.5 bg-linear-to-b from-slate-100 to-slate-200 rounded-3xl shadow-2xl border border-white">
        <div className="bg-white rounded-[22px] px-6 py-8 sm:p-10">
          {/* Header branding lockup */}
          <div className="text-center mb-8">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-extrabold tracking-widest text-blue-600 bg-blue-50 uppercase mb-4">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
              LXVOIP PORTAL
            </span>
            <h1 className="font-sans font-black text-2xl sm:text-3xl text-slate-950 tracking-tight leading-none">
              LXVOIP DATABASE
            </h1>
            <p className="text-xs text-slate-400 mt-2">
              {lang === 'id' ? 'Sistem Pusat Data Grup LX' : 'Lx集团数据中心系统'}
            </p>
          </div>

          {/* Alert messages */}
          {statusMessage && (
            <div
              className={`mb-6 p-4 rounded-xl text-xs font-semibold border ${
                statusMessage.isError 
                  ? 'bg-rose-50 text-rose-800 border-rose-100' 
                  : 'bg-emerald-50 text-emerald-800 border-emerald-100'
              }`}
            >
              {statusMessage.text}
            </div>
          )}

          {!user ? (
            /* Form inputs */
            <form onSubmit={handleCustomLogin} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400 flex items-center gap-1">
                  <Mail className="w-3.5 h-3.5" />
                  {lang === 'id' ? 'Akun / Email' : '账号'}
                </label>
                <input
                  type="text"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  placeholder={lang === 'id' ? 'budi atau admin@admin.com' : '请输入名或邮箱'}
                  className="bg-slate-50 border border-slate-200 focus:border-blue-500 rounded-xl p-3 text-xs font-medium text-slate-800 focus:outline-hidden transition"
                  required
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400 flex items-center gap-1">
                  <Key className="w-3.5 h-3.5" />
                  {lang === 'id' ? 'Kata Sandi' : '密码'}
                </label>
                <input
                  type="password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="••••••••"
                  className="bg-slate-50 border border-slate-200 focus:border-blue-500 rounded-xl p-3 text-xs font-medium text-slate-800 focus:outline-hidden transition"
                  required
                />
              </div>

              <div className="flex flex-col gap-3 mt-4">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition cursor-pointer shadow-md shadow-blue-500/10 disabled:opacity-50"
                >
                  <LogIn className="w-4 h-4" />
                  {lang === 'id' ? 'Masuk' : '登录'}
                </button>

                <div className="relative flex py-2 items-center">
                  <div className="flex-grow border-t border-slate-100"></div>
                  <span className="flex-shrink mx-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    {lang === 'id' ? 'Atau login instan' : '或者一键登录'}
                  </span>
                  <div className="flex-grow border-t border-slate-100"></div>
                </div>

                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  disabled={isSubmitting}
                  className="w-full py-3.5 bg-white hover:bg-slate-50 text-slate-700 font-bold rounded-xl text-xs flex items-center justify-center gap-2.5 transition cursor-pointer border border-slate-200 shadow-3xs"
                >
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                  {lang === 'id' ? 'OAuth Akun Google' : '谷歌安全授权登录'}
                </button>
              </div>
            </form>
          ) : (isAdmin || isSurveyor) ? (
            /* Verified Authorized User (Admin or Surveyor) */
            <div className="flex flex-col items-center justify-center py-4 text-center gap-5 text-xs">
              <div className="w-14 h-14 bg-emerald-50 border border-emerald-100 rounded-full flex items-center justify-center text-emerald-500 shadow-xs animate-bounce">
                <UserCheck className="w-7 h-7" />
              </div>
              
              <div className="flex flex-col items-center gap-1.5">
                <h3 className="font-sans font-black text-[15px] text-slate-900">
                  {lang === 'id' ? 'Selamat Datang Kembali' : '欢迎回来'}
                </h3>
                {isSurveyor && surveyorName ? (
                  <p className="text-sm font-extrabold text-blue-600">{surveyorName}</p>
                ) : (
                  <p className="text-xs font-semibold text-slate-500">{user?.displayName || user?.email?.split('@')[0] || 'Administrator'}</p>
                )}
                <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-[9px] font-extrabold tracking-wider uppercase mt-1 ${
                  isAdmin 
                    ? 'bg-blue-100 text-blue-800 border border-blue-200' 
                    : 'bg-indigo-100 text-indigo-800 border border-indigo-200'
                }`}>
                  {isAdmin 
                    ? (lang === 'id' ? 'Administrator' : '系统超级管理员') 
                    : (lang === 'id' ? 'Petugas Lapangan / Operator' : '外勤踩点与测量专员')
                  }
                </span>
              </div>

              <div className="w-full bg-slate-50 border border-slate-100 p-3.5 rounded-xl flex flex-col gap-1.5">
                <div className="flex justify-between items-center text-[10px]">
                  <span className="text-slate-400 font-bold">{lang === 'id' ? 'ID Pengguna:' : '用户标识 (UID):'}</span>
                  <span className="text-slate-700 font-mono truncate max-w-[160px]">{user?.uid}</span>
                </div>
                <div className="flex justify-between items-center text-[10px]">
                  <span className="text-slate-400 font-bold">{lang === 'id' ? 'Akun Email:' : '登录邮箱:'}</span>
                  <span className="text-slate-700 font-medium">{user?.email}</span>
                </div>
              </div>

              <div className="flex flex-col gap-2 w-full pt-1">
                <button
                  type="button"
                  onClick={onSuccess}
                  className="w-full py-4.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-black rounded-xl transition cursor-pointer shadow-md shadow-blue-500/10 text-xs uppercase tracking-wider"
                >
                  {lang === 'id' ? 'Masuk ke Portal Kontrol' : '进入集团业务控制台'}
                </button>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-xl transition cursor-pointer text-xs"
                >
                  {lang === 'id' ? 'Keluar / Ganti Akun' : '退出账号'}
                </button>
              </div>
            </div>
          ) : (
            /* Logged in but NOT Admin and NOT Surveyor block */
            <div className="flex flex-col gap-4 text-xs">
              <div className="bg-amber-50 border border-amber-200/45 p-4 rounded-xl flex items-start gap-2.5">
                <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5 animate-pulse" />
                <div>
                  <h4 className="font-extrabold text-amber-950">{t.notAdminWarningTitle || 'Akses Ditangguhkan'}</h4>
                  <p className="leading-relaxed text-amber-800 text-[11px] mt-0.5">
                    {lang === 'id' 
                      ? 'Akun Anda berhasil masuk ke Firebase Auth namun tidak terdaftar sebagai Administrator maupun Petugas Lapangan di dalam basis data.'
                      : '您的账号虽然已通过身份校验，但在数据库中尚未被赋予管理员或踩点工程师授权。'}
                  </p>
                </div>
              </div>

              <div className="border border-slate-100 p-4 rounded-xl bg-slate-50 flex flex-col gap-2">
                <div className="flex justify-between items-center text-[11px]">
                  <span className="text-slate-400 font-bold">{lang === 'id' ? 'Email Masuk:' : '邮箱账号:'}</span>
                  <span className="text-slate-800 font-bold">{user.email}</span>
                </div>
                <div className="flex justify-between items-center text-[11px] gap-2">
                  <span className="text-slate-400 font-bold">UID:</span>
                  <span className="text-slate-500 font-mono truncate max-w-[150px]">{user.uid}</span>
                </div>
              </div>

              <div className="flex flex-col gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={async () => {
                    setIsSubmitting(true);
                    try {
                      const adminRef = doc(db, 'admins', user.uid);
                      await setDoc(adminRef, {
                        email: user.email || `${user.uid}@auth`,
                        name: user.displayName || user.email?.split('@')[0] || 'Admin Baru',
                        createdAt: serverTimestamp(),
                      });
                      showStatus(lang === 'id' ? 'Sukses mendaftarkan sebagai Admin!' : '管理员信息成功注册及通过！');
                      setTimeout(() => onSuccess(), 800);
                    } catch (e: any) {
                      showStatus(e.message || 'Error registering admin doc', true);
                    } finally {
                      setIsSubmitting(false);
                    }
                  }}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-4 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer transition shadow-3xs"
                >
                  <UserCheck className="w-4 h-4" />
                  {lang === 'id' ? 'Aktifkan Akun Admin' : '添加官方安全组管理员'}
                </button>
                <button
                  type="button"
                  onClick={copyUid}
                  className="w-full bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold py-2.5 px-4 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer transition"
                >
                  <Clipboard className="w-4 h-4 text-slate-400" />
                  {lang === 'id' ? 'Salin UID Akun' : '复制 UID'}
                </button>
                
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="w-full bg-rose-50 text-rose-600 hover:bg-rose-100 font-bold py-2 px-4 rounded-xl transition cursor-pointer mt-2 text-center"
                >
                  {lang === 'id' ? 'Keluar / Ganti Akun' : '登出 / 切换账号'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
