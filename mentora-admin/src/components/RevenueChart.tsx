import { DollarSign, TrendingUp, Users } from 'lucide-react';

interface RevenueChartProps {
  totalRevenue: number;
  teacherShare: number;
  platformShare: number;
  totalPending: number;
}

export default function RevenueChart({ totalRevenue, teacherShare, platformShare, totalPending }: RevenueChartProps) {
  const teacherPercentage = totalRevenue > 0 ? Math.round((teacherShare / totalRevenue) * 100) : 0;
  const platformPercentage = totalRevenue > 0 ? 100 - teacherPercentage : 0;

  return (
    <div className="bg-surface border border-border rounded-3xl p-6 mb-6">
      <h3 className="text-lg font-bold text-text mb-6">Revenue Split Overview (Platform-Wide)</h3>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-background rounded-2xl p-4 border border-border">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              <DollarSign className="w-4 h-4 text-primary" />
            </div>
            <span className="text-textMuted font-medium">Gross Revenue</span>
          </div>
          <p className="text-3xl font-bold text-text">${totalRevenue.toFixed(2)}</p>
        </div>
        
        <div className="bg-background rounded-2xl p-4 border border-border">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-full bg-success/10 flex items-center justify-center">
              <Users className="w-4 h-4 text-success" />
            </div>
            <span className="text-textMuted font-medium">Teachers' Earnings (75%)</span>
          </div>
          <p className="text-3xl font-bold text-success">${teacherShare.toFixed(2)}</p>
        </div>
        
        <div className="bg-background rounded-2xl p-4 border border-border">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-blue-500" />
            </div>
            <span className="text-textMuted font-medium">Platform Cut (25%)</span>
          </div>
          <p className="text-3xl font-bold text-blue-500">${platformShare.toFixed(2)}</p>
        </div>

        <div className="bg-background rounded-2xl p-4 border border-border">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-full bg-orange-500/10 flex items-center justify-center">
              <DollarSign className="w-4 h-4 text-orange-500" />
            </div>
            <span className="text-textMuted font-medium">Pending Payments</span>
          </div>
          <p className="text-3xl font-bold text-orange-500">${totalPending.toFixed(2)}</p>
        </div>
      </div>

      <div>
        <div className="flex justify-between text-sm mb-2 font-medium">
          <span className="text-success">Teachers: {teacherPercentage}%</span>
          <span className="text-blue-500">Mentora: {platformPercentage}%</span>
        </div>
        <div className="h-4 w-full bg-background rounded-full overflow-hidden flex">
          <div 
            className="h-full bg-success transition-all duration-1000 ease-out" 
            style={{ width: `${teacherPercentage}%` }}
          />
          <div 
            className="h-full bg-blue-500 transition-all duration-1000 ease-out" 
            style={{ width: `${platformPercentage}%` }}
          />
        </div>
      </div>
    </div>
  );
}
