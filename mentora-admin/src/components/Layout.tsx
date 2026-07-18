import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LayoutDashboard, Users, BookOpen, CreditCard, LogOut, Shield, ShieldAlert } from 'lucide-react';

export default function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { signOut, user } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const navItems = [
    { label: 'Overview', path: '/', icon: LayoutDashboard },
    { label: 'Teachers', path: '/teachers', icon: Users },
    { label: 'Courses', path: '/courses', icon: BookOpen },
    { label: 'Finance & Payouts', path: '/subscriptions', icon: CreditCard },
    { label: 'Moderation', path: '/moderation', icon: ShieldAlert },
  ];

  return (
    <div className="flex h-screen bg-background text-text overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 bg-surface border-r border-border flex flex-col">
        <div className="p-6 flex items-center gap-3 border-b border-border">
          <div className="w-10 h-10 flex items-center justify-center bg-white rounded-2xl p-1 overflow-hidden">
            <img src="/logo.png" alt="Mentora" className="w-full h-full object-contain" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Mentora</h1>
            <p className="text-xs text-textMuted uppercase tracking-wider font-semibold">Admin Console</p>
          </div>
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

        <div className="p-4 border-t border-border">
          <div className="flex items-center gap-3 mb-4 px-2">
            <div className="w-8 h-8 rounded-full bg-border flex items-center justify-center">
              <span className="text-xs font-bold">{user?.email?.charAt(0).toUpperCase()}</span>
            </div>
            <div className="flex-1 truncate">
              <p className="text-sm font-medium truncate">{user?.email}</p>
              <p className="text-xs text-textMuted">Super Admin</p>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-3 w-full px-4 py-2 text-error hover:bg-error/10 rounded-2xl transition-colors"
          >
            <LogOut className="w-5 h-5" />
            <span className="font-medium">Sign Out</span>
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
