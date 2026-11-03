import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LayoutDashboard, Users, BookOpen, CreditCard, LogOut, ShieldAlert, FileBox, Menu, X, MoreHorizontal } from 'lucide-react';
import ThemeToggle from './ThemeToggle';
import RoleSelectionModal from './RoleSelectionModal';
import ZivisoArtisticBackground from './ZivisoArtisticBackground';

export default function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { signOut, user, role, isAdmin, isTeacher, isStudent } = useAuth();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Close mobile drawer automatically when navigating between pages
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  // Build role-specific navigation
  let navItems = [
    { label: 'Overview', path: '/', icon: LayoutDashboard },
    { label: isStudent ? 'Past Papers & Schemes' : 'Past Papers', path: '/papers', icon: FileBox },
  ];

  if (isTeacher) {
    navItems = [
      { label: 'Overview', path: '/', icon: LayoutDashboard },
      { label: 'My Courses', path: '/courses', icon: BookOpen },
      { label: 'Past Papers', path: '/papers', icon: FileBox },
    ];
  } else if (isAdmin) {
    navItems = [
      { label: 'Overview', path: '/', icon: LayoutDashboard },
      { label: 'Teachers', path: '/teachers', icon: Users },
      { label: 'Courses', path: '/courses', icon: BookOpen },
      { label: 'Past Papers', path: '/papers', icon: FileBox },
      { label: 'Finance & Payouts', path: '/subscriptions', icon: CreditCard },
      { label: 'Moderation', path: '/moderation', icon: ShieldAlert },
    ];
  }

  const roleLabel = isAdmin 
    ? 'Super Admin' 
    : isTeacher 
    ? 'Educator / Teacher' 
    : isStudent 
    ? 'Student (Practice Mode)' 
    : 'Select Role';

  return (
    <div className="flex flex-col md:flex-row h-dvh min-h-dvh bg-background text-text overflow-hidden">
      {/* Role Selection Modal prompt */}
      <RoleSelectionModal />

      {/* Mobile Top Navigation Header */}
      <header className="md:hidden flex items-center justify-between px-4 py-3 bg-surface/80 backdrop-blur-xl border-b border-border sticky top-0 z-30 shrink-0 shadow-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="p-2 -ml-1 rounded-2xl text-text hover:bg-border/60 transition-all cursor-pointer active:scale-95"
            aria-label="Open Navigation Menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-primary/30 via-white/10 to-transparent p-0.5 border border-white/20 shadow-md shadow-primary/25 overflow-hidden flex items-center justify-center shrink-0">
              <img src="/logo.png" alt="Ziviso" className="w-full h-full object-cover rounded-xl" />
            </div>
            <div>
              <span className="font-extrabold text-base tracking-tight block leading-tight bg-gradient-to-r from-text via-text to-primaryLight bg-clip-text">Ziviso</span>
              <span className="text-[10px] text-primaryLight uppercase font-bold tracking-wider block">
                {isAdmin ? 'Admin Console' : isTeacher ? 'Educator Hub' : 'Student Hub'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <div 
            onClick={() => setMobileMenuOpen(true)}
            className="w-8 h-8 rounded-2xl bg-gradient-to-br from-primary to-indigo-600 border border-white/20 shadow-sm flex items-center justify-center text-white font-bold text-xs cursor-pointer active:scale-95 transition-transform"
            title={user?.email || 'User Profile'}
          >
            {user?.email?.charAt(0).toUpperCase() || 'U'}
          </div>
        </div>
      </header>

      {/* Mobile Navigation Slide-Over Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex animate-fade-in">
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-black/70 backdrop-blur-md transition-opacity"
            onClick={() => setMobileMenuOpen(false)}
          />

          {/* Drawer Content */}
          <aside className="relative w-72 max-w-[85vw] bg-surface/95 backdrop-blur-2xl border-r border-border h-full flex flex-col z-10 shadow-2xl animate-slide-right">
            <div className="p-5 flex items-center justify-between border-b border-border/80">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-primary/30 via-white/10 to-transparent p-0.5 border border-white/20 shadow-md shadow-primary/25 overflow-hidden flex items-center justify-center shrink-0">
                  <img src="/logo.png" alt="Ziviso" className="w-full h-full object-cover rounded-xl" />
                </div>
                <div>
                  <h2 className="text-lg font-extrabold bg-gradient-to-r from-text to-primaryLight bg-clip-text">Ziviso</h2>
                  <p className="text-[10px] text-primaryLight uppercase tracking-wider font-bold">
                    {isAdmin ? 'Admin Console' : isTeacher ? 'Educator Hub' : 'Student Hub'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="p-1.5 rounded-xl text-textMuted hover:text-text hover:bg-border/60 transition-colors cursor-pointer"
                aria-label="Close Navigation Menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`flex items-center gap-3 px-4 py-3 rounded-2xl transition-all ${
                      isActive 
                        ? 'bg-primary text-white font-bold shadow-md shadow-primary/30 border border-white/15' 
                        : 'text-textMuted hover:bg-border/50 hover:text-text'
                    }`}
                  >
                    <Icon className={`w-5 h-5 ${isActive ? 'text-white' : 'text-textMuted'}`} />
                    <span className="text-sm">{item.label}</span>
                  </Link>
                );
              })}
            </nav>

            <div className="p-4 border-t border-border space-y-3 bg-surface-sunken/60">
              <div className="px-2">
                <div className="flex items-center gap-3 mb-1">
                  <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-primary to-indigo-600 border border-white/20 shadow-sm flex items-center justify-center text-white font-bold text-xs shrink-0">
                    {user?.email?.charAt(0).toUpperCase() || 'U'}
                  </div>
                  <div className="flex-1 truncate">
                    <p className="text-xs font-semibold truncate text-text">{user?.email}</p>
                    <p className="text-[11px] text-primary font-bold">{roleLabel}</p>
                  </div>
                </div>
              </div>

              <button
                onClick={handleSignOut}
                className="flex items-center gap-3 w-full px-4 py-2.5 text-error hover:bg-error/15 border border-error/20 rounded-2xl transition-all cursor-pointer text-sm font-semibold"
              >
                <LogOut className="w-4 h-4" />
                <span>Sign Out</span>
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Desktop Permanent Sidebar */}
      <aside className="hidden md:flex w-64 bg-surface/80 backdrop-blur-2xl border-r border-border/80 flex-col shrink-0 relative z-20 shadow-xl shadow-black/10">
        <div className="p-5 flex items-center gap-3 border-b border-border/80">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-primary/30 via-white/10 to-transparent p-0.5 border border-white/25 shadow-lg shadow-primary/25 overflow-hidden flex items-center justify-center shrink-0 group hover:scale-105 transition-transform">
            <img src="/logo.png" alt="Ziviso" className="w-full h-full object-cover rounded-xl" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-extrabold tracking-tight bg-gradient-to-r from-text via-text to-primaryLight bg-clip-text">Ziviso</h1>
            <p className="text-[10px] text-primaryLight uppercase tracking-wider font-extrabold truncate">
              {isAdmin ? 'Admin Console' : isTeacher ? 'Educator Hub' : 'Student Hub'}
            </p>
          </div>
          <ThemeToggle />
        </div>

        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3.5 px-4 py-3 rounded-2xl transition-all duration-200 ${
                  isActive 
                    ? 'btn-3d-primary font-bold shadow-lg shadow-primary/30' 
                    : 'text-textMuted hover:text-text hover:bg-surface-elevated/70 hover:translate-x-1'
                }`}
              >
                <Icon className={`w-5 h-5 shrink-0 ${isActive ? 'text-white' : 'text-textMuted'}`} />
                <span className="text-sm font-semibold">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-border/80 space-y-3 bg-surface-sunken/40">
          <div className="px-2">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-primary to-indigo-600 border border-white/20 shadow-md shadow-primary/20 flex items-center justify-center text-white font-bold text-xs shrink-0">
                {user?.email?.charAt(0).toUpperCase() || 'U'}
              </div>
              <div className="flex-1 truncate">
                <p className="text-sm font-semibold truncate text-text">{user?.email}</p>
                <p className="text-xs text-primary font-bold">{roleLabel}</p>
              </div>
            </div>
          </div>

          <button
            onClick={handleSignOut}
            className="flex items-center gap-3 w-full px-4 py-2 text-error hover:bg-error/15 border border-transparent hover:border-error/25 rounded-2xl transition-all cursor-pointer font-semibold text-sm"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto relative bg-transparent flex flex-col">
        {/* Ambient colour orbs: give the frosted glass cards something to blur */}
        <div className="pointer-events-none fixed -top-24 right-[8%] w-[28rem] h-[28rem] rounded-full bg-primary/40 blur-[100px] z-0" />
        <div className="pointer-events-none fixed top-[38%] left-[18%] w-[24rem] h-[24rem] rounded-full bg-fuchsia-400/30 blur-[110px] z-0" />
        <div className="pointer-events-none fixed -bottom-24 right-[22%] w-[26rem] h-[26rem] rounded-full bg-cyan-400/30 blur-[110px] z-0" />

        {/* Artistic Scattered & Falling Z-I-V-I-S-O Letters Background */}
        <ZivisoArtisticBackground />

        {/* Content with responsive padding */}
        <div className="p-4 sm:p-6 lg:p-8 pb-24 md:pb-8 relative z-10 max-w-full">
          {children}
        </div>
      </main>

      {/* Mobile App Bottom Navigation Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-surface/90 backdrop-blur-xl border-t border-border px-3 py-1.5 flex items-center justify-around shadow-2xl">
        <Link
          to="/"
          className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-all ${
            location.pathname === '/' ? 'text-primary font-bold' : 'text-textMuted hover:text-text'
          }`}
        >
          <LayoutDashboard className={`w-5 h-5 ${location.pathname === '/' ? 'text-primary' : 'text-textMuted'}`} />
          <span className="text-[10px]">Overview</span>
        </Link>

        <Link
          to="/papers"
          className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-all ${
            location.pathname === '/papers' ? 'text-primary font-bold' : 'text-textMuted hover:text-text'
          }`}
        >
          <FileBox className={`w-5 h-5 ${location.pathname === '/papers' ? 'text-primary' : 'text-textMuted'}`} />
          <span className="text-[10px]">{isStudent ? 'Papers' : 'Past Papers'}</span>
        </Link>

        {(isTeacher || isAdmin) && (
          <Link
            to="/courses"
            className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-all ${
              location.pathname === '/courses' ? 'text-primary font-bold' : 'text-textMuted hover:text-text'
            }`}
          >
            <BookOpen className={`w-5 h-5 ${location.pathname === '/courses' ? 'text-primary' : 'text-textMuted'}`} />
            <span className="text-[10px]">Courses</span>
          </Link>
        )}

        <button
          onClick={() => setMobileMenuOpen(true)}
          className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-all text-textMuted hover:text-text cursor-pointer`}
          aria-label="More navigation options"
        >
          <MoreHorizontal className="w-5 h-5 text-textMuted" />
          <span className="text-[10px]">More</span>
        </button>
      </nav>
    </div>
  );
}
