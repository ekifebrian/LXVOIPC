import React from 'react';
import { db, auth } from '../firebase';
import { signOut } from 'firebase/auth';
import { LogOut, User, Menu } from 'lucide-react';
import { Language, translations } from '../languages';

interface NavbarProps {
  user: any;
  isAdmin: boolean;
  lang: Language;
  setLang: (lang: Language) => void;
  onToggleSidebar: () => void;
  onLogout?: () => void;
}

export default function Navbar({ 
  user, 
  isAdmin, 
  lang, 
  setLang,
  onToggleSidebar,
  onLogout
}: NavbarProps) {
  const t = translations[lang];

  const handleLogout = async () => {
    if (onLogout) {
      onLogout();
    }
    try {
      await signOut(auth);
    } catch (err) {
      console.error("Signout error", err);
    }
  };

  return (
    <header className="bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between shrink-0 select-none">
      
      {/* Brand logo trigger for responsive sidebar drawer on mobile */}
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          className="lg:hidden p-1.5 rounded-lg text-slate-500 hover:bg-slate-50 active:bg-slate-100 transition duration-200"
          title="Toggle Sidebar"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div>
          <h1 className="font-sans font-black text-lg sm:text-xl text-slate-900 tracking-tight leading-none uppercase">
            {t.appName}
          </h1>
          <p className="text-[10px] text-slate-400 mt-1 font-bold uppercase tracking-wider">
            {t.appSubtitle}
          </p>
        </div>
      </div>

      {/* Profile log state info and localization widgets */}
      <div className="flex items-center gap-4 text-xs font-semibold">
        
        {/* User state display */}
        {user ? (
          <div className="flex items-center gap-3 border-l border-slate-200/50 pl-4">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center border border-blue-200/20">
                <User className="w-4 h-4" />
              </div>
              <div className="hidden sm:block text-left">
                <p className="text-slate-800 text-[11px] font-black tracking-wide leading-none">
                  {user.displayName || user.email?.split('@')[0] || 'Administrator'}
                </p>
                <p className="text-[9px] text-slate-400 font-bold uppercase mt-0.5 tracking-wider">
                  {isAdmin ? t.adminTag : 'User'}
                </p>
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="p-1.5 rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-500 transition cursor-pointer"
              title={t.logoutBtn}
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        ) : null}

      </div>
    </header>
  );
}
