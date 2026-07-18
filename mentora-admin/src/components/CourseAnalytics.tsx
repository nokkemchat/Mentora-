import React from 'react';
import { Users, CheckCircle, Clock, DollarSign, Star, HelpCircle, ArrowDownRight, AlertTriangle } from 'lucide-react';

interface CourseAnalyticsProps {
  courseId: number;
  courseTitle: string;
}

export default function CourseAnalytics({ courseId, courseTitle }: CourseAnalyticsProps) {
  // Mock data for analytics
  const metrics = [
    { label: 'Students Enrolled', value: '1,350', icon: Users, color: 'text-blue-500', bg: 'bg-blue-500/10' },
    { label: 'Completion Rate', value: '42%', icon: CheckCircle, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
    { label: 'Avg Watch Time', value: '1h 15m', icon: Clock, color: 'text-purple-500', bg: 'bg-purple-500/10' },
    { label: 'Revenue', value: '$4,250', icon: DollarSign, color: 'text-green-500', bg: 'bg-green-500/10' },
    { label: 'Average Rating', value: '4.8/5', icon: Star, color: 'text-yellow-500', bg: 'bg-yellow-500/10' },
    { label: 'Quiz Performance', value: '78% Avg', icon: HelpCircle, color: 'text-indigo-500', bg: 'bg-indigo-500/10' },
  ];

  return (
    <div className="bg-background/80 border-t border-border p-6 rounded-b-xl animate-in fade-in slide-in-from-top-4 duration-300">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-bold text-text">Analytics: {courseTitle}</h3>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
        {metrics.map((metric, i) => {
          const Icon = metric.icon;
          return (
            <div key={i} className="bg-surface border border-border rounded-2xl p-4">
              <div className="flex items-center space-x-2 mb-2">
                <div className={`p-1.5 rounded-2xl ${metric.bg}`}>
                  <Icon className={`w-4 h-4 ${metric.color}`} />
                </div>
                <span className="text-xs font-medium text-textMuted leading-tight">{metric.label}</span>
              </div>
              <div className="text-xl font-bold text-text">{metric.value}</div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-surface border border-border rounded-2xl p-4 flex items-start space-x-4">
          <div className="p-3 bg-error/10 text-error rounded-3xl">
            <ArrowDownRight className="w-6 h-6" />
          </div>
          <div>
            <h4 className="text-sm font-medium text-textMuted mb-1">Top Drop-off Point</h4>
            <p className="text-lg font-bold text-text">Lecture 4: Advanced Substitution</p>
            <p className="text-xs text-error mt-1">28% of users abandon course here</p>
          </div>
        </div>

        <div className="bg-surface border border-border rounded-2xl p-4 flex items-start space-x-4">
          <div className="p-3 bg-warning/10 text-warning rounded-3xl">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <h4 className="text-sm font-medium text-textMuted mb-1">Most Difficult Topic</h4>
            <p className="text-lg font-bold text-text">Quiz 2: Mechanisms</p>
            <p className="text-xs text-warning mt-1">Average score of 45% (Needs review)</p>
          </div>
        </div>
      </div>
    </div>
  );
}
