import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Search, Ban, History, ShieldAlert, X, MessageSquare, AlertTriangle } from 'lucide-react';

export default function Moderation() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Modal state
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [isChatHistoryOpen, setIsChatHistoryOpen] = useState(false);

  // Mock Chat History (Since real chat history requires a messages table that we might not have yet)
  const mockChatHistory = [
    { room: 'O-Level Math Revision', message: 'Anyone know how to solve Q4?', time: '10:00 AM' },
    { room: 'O-Level Math Revision', message: 'Nevermind I got it. It was 42.', time: '10:05 AM' },
    { room: 'A-Level Biology', message: 'Is mitosis going to be on the exam?', time: 'Yesterday' },
    { room: 'A-Level Biology', message: 'This teacher sucks lol', time: 'Yesterday', toxic: true },
  ];

  const fetchUsers = async () => {
    setLoading(true);
    try {
      // Fetch students and maybe their ban status
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('role', 'student')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setUsers(data || []);
    } catch (err) {
      console.error('Error fetching users:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const toggleBanStatus = async (userId: string, currentStatus: boolean, userName: string) => {
    const action = currentStatus ? 'unban' : 'ban';
    const confirmed = window.confirm(`Are you sure you want to ${action} ${userName}?`);
    if (!confirmed) return;

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ is_banned: !currentStatus })
        .eq('id', userId);

      if (error) throw error;

      setUsers(prev => prev.map(u => u.id === userId ? { ...u, is_banned: !currentStatus } : u));
      alert(`Successfully ${action}ned ${userName}.`);
      
      if (selectedUser?.id === userId) {
        setSelectedUser({ ...selectedUser, is_banned: !currentStatus });
      }
    } catch (err) {
      console.error('Error updating ban status:', err);
      alert('Failed to update status. Make sure the database schema is updated.');
    }
  };

  const filteredUsers = users.filter(u => 
    (u.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) || '') ||
    (u.email?.toLowerCase().includes(searchQuery.toLowerCase()) || '')
  );

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-text flex items-center gap-3">
            <ShieldAlert className="w-8 h-8 text-error" />
            User Moderation
          </h1>
          <p className="text-textMuted mt-2">Manage student access, review chat logs, and enforce community guidelines.</p>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative max-w-md">
        <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-textMuted" />
        <input 
          type="text"
          placeholder="Search students by name or email..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-surface border border-border rounded-2xl pl-10 pr-4 py-3 text-text placeholder-textMuted focus:outline-none focus:border-primary transition-colors"
        />
      </div>

      {/* Users Table */}
      <div className="bg-surface border border-border rounded-3xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-background border-b border-border text-textMuted text-sm">
                <th className="p-4 font-medium">Student Name</th>
                <th className="p-4 font-medium">Email</th>
                <th className="p-4 font-medium">Account Status</th>
                <th className="p-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-textMuted">Loading users...</td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-textMuted">
                    {searchQuery ? 'No users matched your search.' : 'No students found.'}
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-background transition-colors">
                    <td className="p-4 font-medium text-text">{user.full_name || 'Unnamed Student'}</td>
                    <td className="p-4 text-textMuted">{user.email}</td>
                    <td className="p-4">
                      {user.is_banned ? (
                        <span className="px-2 py-1 bg-error/10 text-error text-xs rounded-full font-medium inline-flex items-center gap-1">
                          <Ban className="w-3 h-3" /> Banned
                        </span>
                      ) : (
                        <span className="px-2 py-1 bg-success/10 text-success text-xs rounded-full font-medium">Active</span>
                      )}
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button 
                          onClick={() => { setSelectedUser(user); setIsChatHistoryOpen(true); }}
                          className="flex items-center gap-1 px-3 py-1.5 bg-background border border-border hover:bg-border/50 text-text rounded-2xl text-sm transition-colors"
                        >
                          <History className="w-4 h-4" />
                          Chat Logs
                        </button>
                        <button 
                          onClick={() => toggleBanStatus(user.id, user.is_banned, user.full_name || user.email)}
                          className={`flex items-center gap-1 px-3 py-1.5 rounded-2xl text-sm transition-colors ${
                            user.is_banned 
                              ? 'bg-background border border-border text-text hover:bg-border/50'
                              : 'bg-error/10 text-error hover:bg-error/20'
                          }`}
                        >
                          <Ban className="w-4 h-4" />
                          {user.is_banned ? 'Unban User' : 'Ban User'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Chat History Modal */}
      {isChatHistoryOpen && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90  p-4" onClick={() => setIsChatHistoryOpen(false)}>
          <div className="bg-surface border border-border rounded-3xl w-full max-w-2xl overflow-hidden " onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-border flex justify-between items-start">
              <div>
                <h2 className="text-2xl font-bold text-text flex items-center gap-2">
                  <MessageSquare className="w-6 h-6 text-primary" />
                  Chat History
                </h2>
                <p className="text-textMuted">Recent study room messages for {selectedUser.full_name || selectedUser.email}</p>
              </div>
              <button onClick={() => setIsChatHistoryOpen(false)} className="p-2 hover:bg-background rounded-2xl text-textMuted transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6">
              <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
                {mockChatHistory.map((msg, idx) => (
                  <div key={idx} className={`p-4 rounded-2xl border ${msg.toxic ? 'bg-error/5 border-error/20' : 'bg-background border-border'}`}>
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-xs font-bold text-primary uppercase tracking-wider">{msg.room}</span>
                      <span className="text-xs text-textMuted">{msg.time}</span>
                    </div>
                    <p className="text-text">{msg.message}</p>
                    {msg.toxic && (
                      <div className="mt-2 text-xs text-error flex items-center gap-1 font-medium">
                        <AlertTriangle className="w-3 h-3" />
                        Flagged by AI Moderation Filter
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="mt-6 pt-6 border-t border-border flex justify-end">
                <button 
                  onClick={() => {
                    setIsChatHistoryOpen(false);
                    toggleBanStatus(selectedUser.id, selectedUser.is_banned, selectedUser.full_name || selectedUser.email);
                  }}
                  className={`flex items-center gap-2 px-6 py-2 rounded-2xl font-medium transition-colors ${
                    selectedUser.is_banned 
                      ? 'bg-background border border-border text-text hover:bg-border/50'
                      : 'bg-error text-white hover:bg-error/90'
                  }`}
                >
                  <Ban className="w-5 h-5" />
                  {selectedUser.is_banned ? 'Unban User' : 'Ban User Instantly'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
