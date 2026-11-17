import React, { useEffect, useState } from 'react';
import { AlertTriangle, ShieldAlert, MessageSquare } from 'lucide-react';
import FlagrantAlert3D from './FlagrantAlert3D';
import ResolutionModal from './ResolutionModal';
import { dbService, supabase } from '../../../services/dbService';
import { useAuth } from '../../../context/AuthContext';
import { useParade } from '../../../context/ParadeContext';
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
  const { records, remarks, refreshRemarks } = useParade();
  const [activeAlerts, setActiveAlerts] = useState<CadetAlert[]>([]);
  const [selectedAlert, setSelectedAlert] = useState<CadetAlert | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const userRole = currentUser?.role || 'course_officer';
  const issuerDesignation = (currentUser?.designation || 'Commandant').trim();

  // Fetch & evaluate active misconduct alerts (including retroactive 5-day / same-day 3-activity scan)
  useEffect(() => {
    let isCancelled = false;

    const autoPopIfNeeded = (alertsList: CadetAlert[]) => {
      if (typeof window === 'undefined' || alertsList.length === 0) return;
      try {
        const raw = sessionStorage.getItem('polac_autopopped_misconduct_alerts');
        const poppedSet = new Set<string>(raw ? JSON.parse(raw) : []);

        for (const alert of alertsList) {
          const sig = `${alert.cadet_name.trim().toLowerCase()}::${alert.squad.trim().toLowerCase()}::${alert.alert_level}::${alert.trigger_count}::${Boolean(alert.commandant_directive)}`;
          if (!poppedSet.has(sig)) {
            poppedSet.add(sig);
            sessionStorage.setItem(
              'polac_autopopped_misconduct_alerts',
              JSON.stringify(Array.from(poppedSet).slice(-100))
            );
            setSelectedAlert(alert);
            toast.error(
              `${alert.alert_level} MISCONDUCT: Cadet ${alert.cadet_name} (${alert.trigger_count} unexcused absences)`,
              { duration: 6000 }
            );
            break;
          }
        }
      } catch {}
    };

    const fetchAlerts = async () => {
      try {
        const evaluated = await dbService.syncAndGetCadetAlerts(courseNumber);
        // Hide any alert that has already received a Commandant / Senior Officer directive
        // (or already has an active Misconduct Directive thread in the Remarks Log)
        const unhandledAlerts = (evaluated as CadetAlert[]).filter(a => {
          if (a.commandant_directive && String(a.commandant_directive).trim() !== '') {
            return false;
          }
          const hasRemarkThread = remarks.some(
            r =>
              r.remarkText.includes(`ALERT_ID:${a.id}`) ||
              (r.remarkText.includes(`CADET:${a.cadet_name}`) &&
                r.remarkText.includes(`SQUAD:${a.squad}`) &&
                r.remarkText.includes(`ABSENCES:${a.trigger_count}`))
          );
          return !hasRemarkThread;
        });

        if (!isCancelled) {
          setActiveAlerts(unhandledAlerts);
          autoPopIfNeeded(unhandledAlerts);
        }
      } catch (err) {
        console.error('Error fetching cadet alerts:', err);
      }
    };

    fetchAlerts();

    const handleAlertsUpdated = () => {
      fetchAlerts();
    };

    window.addEventListener('cadet-alerts-updated', handleAlertsUpdated);

    // Setup Supabase Realtime Subscription
    const channel = supabase
      .channel(`cadet-alerts-live-${courseNumber || 'all'}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'cadet_alerts'
        },
        () => {
          fetchAlerts();
        }
      )
      .subscribe();

    return () => {
      isCancelled = true;
      window.removeEventListener('cadet-alerts-updated', handleAlertsUpdated);
      supabase.removeChannel(channel);
    };
  }, [courseNumber, records.length, remarks.length]);

  const handleAction = async (notes: string) => {
    if (!selectedAlert) return;
    setIsSubmitting(true);
    
    try {
      if (userRole === 'commandant') {
        await dbService.updateCadetAlertDirective(selectedAlert.id, notes.trim(), {
          cadetName: selectedAlert.cadet_name,
          squad: selectedAlert.squad,
          triggerCount: selectedAlert.trigger_count
        });

        // Also dispatch as a structured Misconduct Directive into the unified Remarks & Resolution Log
        // so the Course Officer can reply to it in the exact same interface as Parade Remarks.
        const matchingCourseRecord = records.find(
          r => Number(r.courseNumber) === Number(selectedAlert.course_number)
        );
        const todayStr = new Date().toISOString().split('T')[0];
        const targetSubmissionId =
          matchingCourseRecord?.id ||
          `misconduct-${selectedAlert.course_number}-${todayStr}`;

        const structuredRemarkText = `[MISCONDUCT:${selectedAlert.alert_level}|CADET:${selectedAlert.cadet_name}|SQUAD:${selectedAlert.squad}|ABSENCES:${selectedAlert.trigger_count}|ALERT_ID:${selectedAlert.id}] ${notes.trim()}`;

        await dbService.createCommandantRemark({
          submissionId: targetSubmissionId,
          commandantId: currentUser?.id || null,
          commandantName: currentUser?.fullName || issuerDesignation.toUpperCase(),
          issuerRoleTitle: issuerDesignation,
          courseOfficerId: matchingCourseRecord?.officerId || null,
          courseOfficerName:
            matchingCourseRecord?.officerName || `RC ${selectedAlert.course_number} Course Officer`,
          courseNumber: selectedAlert.course_number,
          paradeType: matchingCourseRecord?.paradeType || 'muster',
          paradeDate: matchingCourseRecord?.date || todayStr,
          remarkText: structuredRemarkText
        });

        await refreshRemarks();
        
        // Remove the alert from the Attention Required widget immediately after the Commandant / Senior Officer replies
        // so it does not clutter the Parade State page (conversation continues in the Remarks & Resolution Log).
        setActiveAlerts((prev) => prev.filter((a) => a.id !== selectedAlert.id));
        toast.success(`Misconduct directive dispatched to RC ${selectedAlert.course_number} Remarks Log.`);
      } else if (userRole === 'course_officer') {
        // Course Officer resolution — also sync response to any linked Misconduct Remark thread
        await dbService.resolveCadetAlert({
          alertId: selectedAlert.id,
          resolutionNotes: notes.trim(),
          acknowledgedBy: currentUser?.fullName || 'OFFICER',
          cadetName: selectedAlert.cadet_name,
          squad: selectedAlert.squad,
          triggerCount: selectedAlert.trigger_count
        });

        const linkedRemark = remarks.find(
          r =>
            r.remarkText.includes(`ALERT_ID:${selectedAlert.id}`) ||
            (Number(r.courseNumber) === Number(selectedAlert.course_number) &&
              r.remarkText.includes(`CADET:${selectedAlert.cadet_name}`) &&
              !r.officerResponse)
        );
        if (linkedRemark) {
          await dbService.respondToCommandantRemark({
            remarkId: linkedRemark.id,
            officerResponse: notes.trim(),
            officerName: currentUser?.fullName || 'Course Officer',
            officerId: currentUser?.id
          });
          await refreshRemarks();
        }
        
        setActiveAlerts((prev) => prev.filter((a) => a.id !== selectedAlert.id));
        toast.success('Misconduct response filed in Remarks Log & alert resolved.');
      }
      setSelectedAlert(null);
    } catch (err) {
      console.error(err);
      toast.error('Failed to process action.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenInRemarksDrawer = (alert: CadetAlert) => {
    setSelectedAlert(null);
    const linkedRemark = remarks.find(
      r =>
        r.remarkText.includes(`ALERT_ID:${alert.id}`) ||
        (Number(r.courseNumber) === Number(alert.course_number) &&
          r.remarkText.includes(`CADET:${alert.cadet_name}`))
    );
    const matchingCourseRecord = records.find(
      r => Number(r.courseNumber) === Number(alert.course_number)
    );
    const targetSubId =
      linkedRemark?.submissionId ||
      matchingCourseRecord?.id ||
      `misconduct-${alert.course_number}-${new Date().toISOString().split('T')[0]}`;

    window.dispatchEvent(
      new CustomEvent('open-officer-remark-reply', {
        detail: {
          remarkId: linkedRemark?.id,
          submissionId: targetSubId,
          courseNumber: alert.course_number
        }
      })
    );
    window.dispatchEvent(
      new CustomEvent('open-parade-remark-drawer', {
        detail: {
          submissionId: targetSubId,
          remarkId: linkedRemark?.id,
          courseNumber: alert.course_number,
          remark: linkedRemark,
          focusLog: true
        }
      })
    );
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
          onOpenInRemarksLog={() => handleOpenInRemarksDrawer(selectedAlert)}
          isSubmitting={isSubmitting}
          userRole={userRole}
          issuerDesignation={issuerDesignation}
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
