import React, { useEffect, useState } from 'react';
import { AlertTriangle, ShieldAlert } from 'lucide-react';
import FlagrantAlert3D from './FlagrantAlert3D';
import ResolutionModal from './ResolutionModal';
import { supabase } from '../../../services/dbService';
import { useAuth } from '../../../context/AuthContext';
import { toast } from 'react-hot-toast';

export interface CadetAlert {
  id: string;
  cadet_name: string;
  squad: string;
  course_number: number;
  alert_level: 'CRITICAL' | 'FLAGRANT';
  status: 'ACTIVE' | 'RESOLVED';
  trigger_count: number;
  commandant_directive?: string;
}

export interface AtRiskCadetsWidgetProps {
  courseNumber?: number;
}

export default function AtRiskCadetsWidget({ courseNumber }: AtRiskCadetsWidgetProps) {
  const { currentUser } = useAuth();
  const [activeAlerts, setActiveAlerts] = useState<CadetAlert[]>([]);
  const [selectedAlert, setSelectedAlert] = useState<CadetAlert | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const userRole = currentUser?.role || 'course_officer';

  // Fetch initial alerts
  useEffect(() => {
    const fetchAlerts = async () => {
      let query = supabase
        .from('cadet_alerts')
        .select('id, cadet_name, squad, course_number, alert_level, status, trigger_count, commandant_directive, created_at, updated_at, resolution_notes, acknowledged_by')
        .eq('status', 'ACTIVE')
        .order('created_at', { ascending: false });

      if (courseNumber) {
        query = query.eq('course_number', courseNumber);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching cadet alerts:', error);
      } else {
        setActiveAlerts(data as CadetAlert[]);
      }
    };

    fetchAlerts();

    // Setup Supabase Realtime Subscription
    const channel = supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'cadet_alerts',
          filter: 'status=eq.ACTIVE'
        },
        (payload) => {
          const newAlert = payload.new as CadetAlert;
          
          if (payload.eventType === 'INSERT') {
            if (courseNumber && newAlert.course_number !== courseNumber) return;
            setActiveAlerts((prev) => [newAlert, ...prev]);
            toast.error(`New ${newAlert.alert_level} alert for ${newAlert.cadet_name}`);
          } else if (payload.eventType === 'UPDATE') {
            setActiveAlerts((prev) =>
              prev.map((alert) => (alert.id === payload.new.id ? (payload.new as CadetAlert) : alert))
            );
          } else if (payload.eventType === 'DELETE') {
            setActiveAlerts((prev) => prev.filter((alert) => alert.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [courseNumber]);

  const handleAction = async (notes: string) => {
    if (!selectedAlert) return;
    setIsSubmitting(true);
    
    try {
      if (userRole === 'commandant') {
        const { error } = await supabase
          .from('cadet_alerts')
          .update({
            commandant_directive: notes,
            updated_at: new Date().toISOString()
          })
          .eq('id', selectedAlert.id);

        if (error) throw error;
        
        // Update UI optimistically, adding the directive. We DO NOT resolve the alert.
        setActiveAlerts((prev) => 
          prev.map((a) => a.id === selectedAlert.id ? { ...a, commandant_directive: notes } : a)
        );
        toast.success('Directive attached to alert.');
      } else {
        // Course Officer resolution
        const { error } = await supabase
          .from('cadet_alerts')
          .update({
            status: 'RESOLVED',
            resolution_notes: notes,
            acknowledged_by: currentUser?.fullName || 'OFFICER',
            updated_at: new Date().toISOString()
          })
          .eq('id', selectedAlert.id);

        if (error) throw error;
        
        setActiveAlerts((prev) => prev.filter((a) => a.id !== selectedAlert.id));
        toast.success('Alert resolved and counter reset.');
      }
      setSelectedAlert(null);
    } catch (err) {
      console.error(err);
      toast.error('Failed to process action.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (activeAlerts.length === 0) {
    return null; // Don't render widget if there are no active alerts
  }

  return (
    <>
      <div className="w-full relative z-20 p-6 rounded-3xl backdrop-blur-2xl bg-[#0A1128]/95 border border-[#D4AF37]/30 shadow-[0_8px_32px_0_rgba(0,0,0,0.5)] overflow-hidden">
        {/* Subtle background glow */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-[#D4AF37]/5 rounded-full blur-[80px] pointer-events-none" />
        
        <div className="flex items-center justify-between mb-6 relative">
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <ShieldAlert className="text-[#D4AF37] w-6 h-6 animate-pulse" />
            Attention Required
          </h2>
          <span className="px-3 py-1 text-xs font-bold tracking-wider text-[#0A1128] bg-[#D4AF37] rounded-full uppercase shadow-lg shadow-[#D4AF37]/20">
            {activeAlerts.length} Active
          </span>
        </div>

        <div className="space-y-4 relative">
          {activeAlerts.map((alert) => (
            <div key={alert.id} className="cursor-pointer" onClick={() => setSelectedAlert(alert)}>
              {alert.alert_level === 'FLAGRANT' ? (
                <FlagrantAlert3D>
                  <AlertRow alert={alert} />
                </FlagrantAlert3D>
              ) : (
                <AlertRow alert={alert} />
              )}
            </div>
          ))}
        </div>
      </div>

      {selectedAlert && (
        <ResolutionModal 
          isOpen={true} 
          onClose={() => setSelectedAlert(null)} 
          alert={selectedAlert}
          onAction={handleAction}
          isSubmitting={isSubmitting}
          userRole={userRole}
        />
      )}
    </>
  );
}

function AlertRow({ alert }: { alert: CadetAlert }) {
  const isFlagrant = alert.alert_level === 'FLAGRANT';
  
  return (
    <div className={`flex items-center justify-between p-4 rounded-xl border transition-all duration-300 relative ${
      isFlagrant 
        ? 'bg-red-950/40 border-red-500/50 hover:bg-red-950/60 shadow-[inset_0_0_20px_rgba(239,68,68,0.1)]' 
        : 'bg-white/5 border-white/10 hover:bg-white/10'
    }`}>
      {alert.commandant_directive && (
        <div className="absolute -top-2.5 right-4 bg-[#D4AF37] text-[#0A1128] text-[9px] font-black uppercase px-2 py-0.5 rounded shadow-md border border-[#D4AF37]/50 shadow-[#D4AF37]/50 animate-pulse">
          Directive Pending
        </div>
      )}
      <div className="flex items-center gap-4">
        <div className={`p-3 rounded-lg ${isFlagrant ? 'bg-red-500/20 text-red-400' : 'bg-[#D4AF37]/20 text-[#D4AF37]'}`}>
          <AlertTriangle className="w-5 h-5" />
        </div>
        <div>
          <h3 className="font-medium text-white tracking-wide">{alert.cadet_name}</h3>
          <p className="text-xs text-gray-400 mt-0.5">SQUADRON: <span className="text-gray-300 font-mono">{alert.squad}</span></p>
        </div>
      </div>
      <div className="text-right">
        <p className={`text-2xl font-black font-mono ${isFlagrant ? 'text-red-400' : 'text-white'}`}>
          {alert.trigger_count}
        </p>
        <p className="text-[10px] text-gray-400 uppercase tracking-widest mt-0.5 font-bold">Absences</p>
      </div>
    </div>
  );
}
