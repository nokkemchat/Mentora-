import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LayoutDashboard, Users, BookOpen, CreditCard, LogOut, ShieldAlert, FileBox, Menu, X, MoreHorizontal } from 'lucide-react';
import ThemeToggle from './ThemeToggle';
import RoleSelectionModal from './RoleSelectionModal';

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
      <header className="md:hidden flex items-center justify-between px-4 py-3 bg-surface/90 backdrop-blur-md border-b border-border sticky top-0 z-30 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="p-2 -ml-1 rounded-xl text-text hover:bg-border/60 transition-colors cursor-pointer"
            aria-label="Open Navigation Menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 flex items-center justify-center bg-white rounded-xl p-0.5 overflow-hidden shadow-sm">
              <img src="/logo.png" alt="Mentora" className="w-full h-full object-contain" />
            </div>
            <div>
              <span className="font-bold text-base tracking-tight block leading-tight">Mentora</span>
              <span className="text-[10px] text-textMuted uppercase font-semibold tracking-wider block">
                {isAdmin ? 'Admin' : isTeacher ? 'Educator Hub' : 'Student Hub'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <div 
            onClick={() => setMobileMenuOpen(true)}
            className="w-8 h-8 rounded-full bg-primary/10 border border-primary/25 flex items-center justify-center text-primary font-bold text-xs cursor-pointer"
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
            className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
            onClick={() => setMobileMenuOpen(false)}
          />

          {/* Drawer Content */}
          <aside className="relative w-72 max-w-[85vw] bg-surface border-r border-border h-full flex flex-col z-10 shadow-2xl animate-slide-right">
            <div className="p-5 flex items-center justify-between border-b border-border">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 flex items-center justify-center bg-white rounded-xl p-1 overflow-hidden shadow-sm">
                  <img src="/logo.png" alt="Mentora" className="w-full h-full object-contain" />
                </div>
                <div>
                  <h2 className="text-lg font-bold">Mentora</h2>
                  <p className="text-[10px] text-textMuted uppercase tracking-wider font-semibold">
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
                    className={`flex items-center gap-3 px-4 py-3 rounded-2xl transition-colors ${
                      isActive 
                        ? 'bg-primary/10 text-primary font-medium' 
                        : 'text-textMuted hover:bg-border/50 hover:text-text'
                    }`}
                  >
                    <Icon className={`w-5 h-5 ${isActive ? 'text-primary' : 'text-textMuted'}`} />
                    <span className="text-sm">{item.label}</span>
                  </Link>
                );
              })}
            </nav>

            <div className="p-4 border-t border-border space-y-3 bg-background/50">
              <div className="px-2">
                <div className="flex items-center gap-3 mb-1">
                  <div className="w-8 h-8 rounded-full bg-border flex items-center justify-center text-primary font-bold text-xs">
                    {user?.email?.charAt(0).toUpperCase() || 'U'}
                  </div>
                  <div className="flex-1 truncate">
                    <p className="text-xs font-medium truncate">{user?.email}</p>
                    <p className="text-[11px] text-primary font-semibold">{roleLabel}</p>
                  </div>
                </div>
              </div>

              <button
                onClick={handleSignOut}
                className="flex items-center gap-3 w-full px-4 py-2.5 text-error hover:bg-error/10 rounded-2xl transition-colors cursor-pointer text-sm font-medium"
              >
                <LogOut className="w-4 h-4" />
                <span>Sign Out</span>
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Desktop Permanent Sidebar */}
      <aside className="hidden md:flex w-64 bg-surface border-r border-border flex-col shrink-0">
        <div className="p-6 flex items-center gap-3 border-b border-border">
          <div className="w-10 h-10 flex items-center justify-center bg-white rounded-2xl p-1 overflow-hidden shadow-sm">
            <img src="/logo.png" alt="Mentora" className="w-full h-full object-contain" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold">Mentora</h1>
            <p className="text-xs text-textMuted uppercase tracking-wider font-semibold">
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
                className={`flex items-center gap-3 px-4 py-3 rounded-2xl transition-colors ${
                  isActive 
                    ? 'bg-primary/10 text-primary font-medium' 
                    : 'text-textMuted hover:bg-border/50 hover:text-text'
                }`}
              >
                <Icon className={`w-5 h-5 ${isActive ? 'text-primary' : 'text-textMuted'}`} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-border space-y-3">
          <div className="px-2">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-8 h-8 rounded-full bg-border flex items-center justify-center text-primary font-bold text-xs">
                {user?.email?.charAt(0).toUpperCase() || 'U'}
              </div>
              <div className="flex-1 truncate">
                <p className="text-sm font-medium truncate">{user?.email}</p>
                <p className="text-xs text-primary font-semibold">{roleLabel}</p>
              </div>
            </div>
          </div>

          <button
            onClick={handleSignOut}
            className="flex items-center gap-3 w-full px-4 py-2 text-error hover:bg-error/10 rounded-2xl transition-colors cursor-pointer"
          >
            <LogOut className="w-5 h-5" />
            <span className="font-medium text-sm">Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto relative bg-background flex flex-col">
        {/* Background Gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent pointer-events-none z-0" />
        
        {/* Watermark Logo (Centered responsively) */}
        <div className="fixed inset-0 md:left-64 pointer-events-none opacity-[0.04] md:opacity-[0.06] z-0 mix-blend-luminosity overflow-hidden flex items-center justify-center">
          <img src="/logo.png" alt="Watermark" className="w-[180%] md:w-[150%] max-w-none object-cover" />
        </div>

        {/* Content with responsive padding: extra bottom space on mobile for bottom bar */}
        <div className="p-4 sm:p-6 lg:p-8 pb-24 md:pb-8 relative z-10 max-w-full">
          {children}
        </div>
      </main>

      {/* Mobile App Bottom Navigation Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-surface/95 backdrop-blur-lg border-t border-border px-3 py-1.5 flex items-center justify-around shadow-2xl">
        <Link
          to="/"
          className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-all ${
            location.pathname === '/' ? 'text-primary font-semibold' : 'text-textMuted hover:text-text'
          }`}
        >
          <LayoutDashboard className={`w-5 h-5 ${location.pathname === '/' ? 'text-primary' : 'text-textMuted'}`} />
          <span className="text-[10px]">Overview</span>
        </Link>

        <Link
          to="/papers"
          className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-all ${
            location.pathname === '/papers' ? 'text-primary font-semibold' : 'text-textMuted hover:text-text'
          }`}
        >
          <FileBox className={`w-5 h-5 ${location.pathname === '/papers' ? 'text-primary' : 'text-textMuted'}`} />
          <span className="text-[10px]">{isStudent ? 'Papers' : 'Past Papers'}</span>
        </Link>

        {(isTeacher || isAdmin) && (
          <Link
            to="/courses"
            className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-all ${
              location.pathname === '/courses' ? 'text-primary font-semibold' : 'text-textMuted hover:text-text'
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
