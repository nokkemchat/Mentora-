import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LayoutDashboard, Users, BookOpen, CreditCard, LogOut, ShieldAlert, FileBox } from 'lucide-react';
import ThemeToggle from './ThemeToggle';
import RoleSelectionModal from './RoleSelectionModal';

export default function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { signOut, user, role, isAdmin, isTeacher, isStudent } = useAuth();
  const navigate = useNavigate();

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
    <div className="flex h-screen bg-background text-text overflow-hidden">
      {/* Role Selection Modal prompt */}
      <RoleSelectionModal />

      {/* Sidebar */}
      <aside className="w-64 bg-surface border-r border-border flex flex-col">
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

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto relative bg-background">
        {/* Background Gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent pointer-events-none z-0" />
        
        {/* Watermark Logo */}
        <div className="fixed inset-0 left-64 pointer-events-none opacity-[0.06] z-0 mix-blend-luminosity overflow-hidden flex items-center justify-center">
          <img src="/logo.png" alt="Watermark" className="w-[150%] h-[150%] max-w-none object-cover" />
        </div>

        <div className="p-8 relative z-10">
          {children}
        </div>
      </main>
    </div>
  );
}
