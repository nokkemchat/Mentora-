import React, { useEffect, useState } from 'react';
import { Check, X, Clock, User } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function PendingApproval() {
  const [pendingTeachers, setPendingTeachers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPendingTeachers();
  }, []);

  const fetchPendingTeachers = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', 'teacher')
      .eq('is_approved', false)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setPendingTeachers(data);
    }
    setLoading(false);
  };

  const handleApprove = async (teacher: any) => {
    // 1. Generate 6-digit secure code
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    // 2. Update Supabase
    const { error } = await supabase
      .from('profiles')
      .update({ 
        is_approved: true,
        activation_code: code
      })
      .eq('id', teacher.id);

    if (error) {
      alert("Error approving teacher: " + error.message);
      return;
    }

    // 3. Remove from pending list locally
    setPendingTeachers(prev => prev.filter(t => t.id !== teacher.id));

    // 4. Invoke the Resend Edge Function
    try {
      // Don't await it so we don't block the UI
      supabase.functions.invoke('send-teacher-approval', {
        body: { 
          teacher_id: teacher.id, 
          code: code,
          name: teacher.first_name || 'Educator'
        }
      });
    } catch (err) {
      console.log("Edge function error:", err);
    }

    // 5. Show Toast for testing purposes!
    alert(`Teacher Approved!\n\nVerification Code: ${code}\n\n(We also requested the email to be sent)`);
  };

  const handleReject = async (id: string) => {
    // For now, rejecting just hides them from the UI (you could delete them or add a status='rejected' field)
    if(confirm("Are you sure you want to reject this teacher?")) {
       setPendingTeachers(prev => prev.filter(t => t.id !== id));
    }
  };

  return (
    <div className="bg-surface border border-border rounded-3xl p-6 flex flex-col h-full">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-text flex items-center">
          <Clock className="w-5 h-5 mr-2 text-warning" />
          Pending Approvals
        </h2>
        <span className="bg-warning/10 text-warning px-3 py-1 rounded-full text-xs font-medium border border-warning/20">
          {pendingTeachers.length} Pending Review
        </span>
      </div>

      <div className="space-y-4 flex-1 overflow-y-auto pr-2">
        {loading ? (
          <div className="text-center text-textMuted py-8">Loading...</div>
        ) : pendingTeachers.length === 0 ? (
          <div className="text-center text-textMuted py-8">No pending approvals!</div>
        ) : (
          pendingTeachers.map(teacher => (
            <div key={teacher.id} className="bg-background border border-border rounded-2xl p-5 transition-colors hover:border-primary/50">
              <h3 className="font-bold text-lg text-text mb-2 flex items-center">
                <User className="w-4 h-4 mr-2 text-primary" />
                {teacher.first_name} {teacher.last_name}
              </h3>
              
              <div className="flex flex-col sm:flex-row sm:items-center text-sm text-textMuted mb-4 space-y-1 sm:space-y-0 sm:space-x-4">
                <div>
                  <span className="opacity-75">School:</span> <span className="font-medium text-text">{teacher.school || 'N/A'}</span>
                </div>
                <div className="hidden sm:block w-1 h-1 rounded-full bg-border"></div>
                <div>
                  <span className="opacity-75">Applied:</span> <span className="font-medium text-text">{new Date(teacher.created_at).toLocaleDateString()}</span>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 mt-4">
                <button 
                  onClick={() => handleApprove(teacher)}
                  className="flex-1 sm:flex-none flex items-center justify-center space-x-1 bg-success/10 hover:bg-success/20 text-success border border-success/20 px-4 py-2 rounded-2xl font-medium transition-colors text-sm"
                >
                  <Check className="w-4 h-4" />
                  <span>Approve</span>
                </button>
                <button 
                  onClick={() => handleReject(teacher.id)}
                  className="flex-1 sm:flex-none flex items-center justify-center space-x-1 bg-error/10 hover:bg-error/20 text-error border border-error/20 px-4 py-2 rounded-2xl font-medium transition-colors text-sm"
                >
                  <X className="w-4 h-4" />
                  <span>Reject</span>
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
