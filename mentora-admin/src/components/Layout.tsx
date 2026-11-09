import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LayoutDashboard, Users, BookOpen, CreditCard, LogOut, ShieldAlert, FileBox, Menu, X, MoreHorizontal } from 'lucide-react';
import ThemeToggle from './ThemeToggle';
import RoleSelectionModal from './RoleSelectionModal';
import ZivisoArtisticBackground from './ZivisoArtisticBackground';

// V1 focuses exclusively on the Past Papers & AI Marking workspace for both Students and Teachers.
// Flip to `true` in V2 to restore the multi-section side drawer (Overview, My Courses, etc.).
const ENABLE_V2_SIDEBAR_NAV = false;

export default function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { signOut, user, isAdmin, isTeacher, isStudent } = useAuth();
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

  // Build role-specific navigation (preserved for V2 multi-tab release)
  let navItems = [
    { label: 'Overview', path: '/overview', icon: LayoutDashboard },
    { label: isStudent ? 'Past Papers & Schemes' : 'Past Papers', path: '/papers', icon: FileBox },
  ];

  if (isTeacher) {
    navItems = [
      { label: 'Overview', path: '/overview', icon: LayoutDashboard },
      { label: 'My Courses', path: '/courses', icon: BookOpen },
      { label: 'Past Papers', path: '/papers', icon: FileBox },
    ];
  } else if (isAdmin) {
    navItems = [
      { label: 'Overview', path: '/overview', icon: LayoutDashboard },
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

  const hubSubtitle = isAdmin
    ? 'Admin Console'
    : isTeacher
    ? 'Educator Hub'
    : 'Student Hub';

  return (
    <div className={`flex ${ENABLE_V2_SIDEBAR_NAV ? 'flex-col md:flex-row' : 'flex-col'} h-dvh min-h-dvh bg-background text-text overflow-hidden`}>
      {/* Role Selection Modal prompt */}
      <RoleSelectionModal />

      {!ENABLE_V2_SIDEBAR_NAV ? (
        /* ===================================================================== */
        /* V1 SLEEK FULL-WIDTH TOP HEADER BAR (No Side Drawer Required)          */
        /* ===================================================================== */
        <header className="w-full px-4 sm:px-6 lg:px-8 py-3 bg-white/80 dark:bg-slate-900/75 backdrop-blur-2xl border-b border-slate-200/80 dark:border-white/10 sticky top-0 z-30 shrink-0 shadow-xs">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
            {/* Brand Identity */}
            <Link to="/papers" className="flex items-center gap-3 group">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-primary/30 via-white/10 to-transparent p-0.5 border border-indigo-500/25 dark:border-white/25 shadow-md shadow-primary/20 overflow-hidden flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                <img src="/logo.png" alt="Ziviso" className="w-full h-full object-cover rounded-xl" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-lg tracking-tight leading-none text-slate-900 dark:text-white">
                    Ziviso
                  </span>
                  <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-indigo-500/10 text-indigo-700 border border-indigo-500/20 dark:bg-indigo-400/15 dark:text-indigo-200 dark:border-indigo-300/30">
                    {hubSubtitle}
                  </span>
                </div>
                <span className="text-[11px] text-slate-500 dark:text-slate-300 font-medium block mt-0.5">
                  Question Papers &amp; AI Examiner Workspace
                </span>
              </div>
            </Link>

            {/* Right Controls: Theme Toggle, User Badge & Sign Out */}
            <div className="flex items-center gap-2 sm:gap-3">
              <ThemeToggle />

              {/* User Profile Pill */}
              <div className="flex items-center gap-2.5 pl-1.5 pr-3 py-1 rounded-2xl bg-slate-100/90 dark:bg-white/[0.06] border border-slate-200/90 dark:border-white/12">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 border border-white/20 shadow-xs flex items-center justify-center text-white font-bold text-xs shrink-0">
                  {user?.email?.charAt(0).toUpperCase() || 'U'}
                </div>
                <div className="hidden sm:block max-w-[180px]">
                  <p className="text-xs font-semibold truncate text-slate-900 dark:text-white leading-tight">
                    {user?.email}
                  </p>
                  <p className="text-[10px] text-indigo-600 dark:text-sky-300 font-bold leading-tight mt-0.5">
                    {roleLabel}
                  </p>
                </div>
              </div>

              {/* Sign Out Button */}
              <button
                type="button"
                onClick={handleSignOut}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-rose-600 dark:text-rose-300 hover:bg-rose-500/10 dark:hover:bg-rose-400/15 border border-rose-500/20 dark:border-rose-400/25 transition-all cursor-pointer active:scale-95"
                title="Sign Out"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Sign Out</span>
              </button>
            </div>
          </div>
        </header>
      ) : (
        <>
          {/* Mobile Top Navigation Header (V2) */}
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
                    {hubSubtitle}
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

          {/* Mobile Navigation Slide-Over Drawer (V2) */}
          {mobileMenuOpen && (
            <div className="fixed inset-0 z-50 md:hidden flex animate-fade-in">
              <div 
                className="fixed inset-0 bg-black/70 backdrop-blur-md transition-opacity"
                onClick={() => setMobileMenuOpen(false)}
              />
              <aside className="relative w-72 max-w-[85vw] bg-surface/95 backdrop-blur-2xl border-r border-border h-full flex flex-col z-10 shadow-2xl animate-slide-right">
                <div className="p-5 flex items-center justify-between border-b border-border/80">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-primary/30 via-white/10 to-transparent p-0.5 border border-white/20 shadow-md shadow-primary/25 overflow-hidden flex items-center justify-center shrink-0">
                      <img src="/logo.png" alt="Ziviso" className="w-full h-full object-cover rounded-xl" />
                    </div>
                    <div>
                      <h2 className="text-lg font-extrabold bg-gradient-to-r from-text to-primaryLight bg-clip-text">Ziviso</h2>
                      <p className="text-[10px] text-primaryLight uppercase tracking-wider font-bold">
                        {hubSubtitle}
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

          {/* Desktop Permanent Sidebar (V2) */}
          <aside className="hidden md:flex w-64 bg-surface/80 backdrop-blur-2xl border-r border-border/80 flex-col shrink-0 relative z-20 shadow-xl shadow-black/10">
            <div className="p-5 flex items-center gap-3 border-b border-border/80">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-primary/30 via-white/10 to-transparent p-0.5 border border-white/25 shadow-lg shadow-primary/25 overflow-hidden flex items-center justify-center shrink-0 group hover:scale-105 transition-transform">
                <img src="/logo.png" alt="Ziviso" className="w-full h-full object-cover rounded-xl" />
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="text-xl font-extrabold tracking-tight bg-gradient-to-r from-text via-text to-primaryLight bg-clip-text">Ziviso</h1>
                <p className="text-[10px] text-primaryLight uppercase tracking-wider font-extrabold truncate">
                  {hubSubtitle}
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
        </>
      )}

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto relative bg-transparent flex flex-col">
        {/* Ambient colour orbs: give the frosted glass cards something to blur */}
        <div className="pointer-events-none fixed -top-24 right-[8%] w-[28rem] h-[28rem] rounded-full bg-primary/40 blur-[100px] z-0" />
        <div className="pointer-events-none fixed top-[38%] left-[18%] w-[24rem] h-[24rem] rounded-full bg-fuchsia-400/30 blur-[110px] z-0" />
        <div className="pointer-events-none fixed -bottom-24 right-[22%] w-[26rem] h-[26rem] rounded-full bg-cyan-400/30 blur-[110px] z-0" />

        {/* Artistic Scattered & Falling Z-I-V-I-S-O Letters Background */}
        <ZivisoArtisticBackground offsetSidebar={ENABLE_V2_SIDEBAR_NAV} />

        {/* Content with responsive padding — no z-index here so fixed modals aren't trapped below the z-20 sidebar */}
        <div className={`p-4 sm:p-6 lg:p-8 ${ENABLE_V2_SIDEBAR_NAV ? 'pb-24 md:pb-8' : 'pb-10'} relative max-w-full`}>
          {children}
        </div>
      </main>

      {/* Mobile App Bottom Navigation Bar (V2 only) */}
      {ENABLE_V2_SIDEBAR_NAV && (
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-surface/90 backdrop-blur-xl border-t border-border px-3 py-1.5 flex items-center justify-around shadow-2xl">
          <Link
            to="/overview"
            className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-all ${
              location.pathname === '/overview' ? 'text-primary font-bold' : 'text-textMuted hover:text-text'
            }`}
          >
            <LayoutDashboard className={`w-5 h-5 ${location.pathname === '/overview' ? 'text-primary' : 'text-textMuted'}`} />
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
      )}
    </div>
  );
}
