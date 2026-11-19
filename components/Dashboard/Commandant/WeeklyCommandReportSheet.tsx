import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Send,
  FileDown,
  ChevronDown,
  ChevronUp,
  Check,
  Loader2,
  Calendar
} from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useAuth } from '../../../context/AuthContext';
import { useParade } from '../../../context/ParadeContext';
import { dbService, supabase } from '../../../services/dbService';
import {
  CommandReportSummaryPayload,
  CommandReportCourseBreakdown,
  CommandReportParadeDetail,
  CommandReportRepeatAbsentee
} from '../../../types';
import { formatRC } from '../../../utils/rcHelpers';
import { toast } from 'react-hot-toast';

interface WeeklyCommandReportSheetProps {
  isOpen: boolean;
  defaultRecipient?: 'commandant' | 'deputy_commandant' | 'both';
  onClose: () => void;
  onSent?: () => void;
}

type PeriodPreset = 'this_week' | 'last_7_days' | 'last_week';

const computePeriodBounds = (preset: PeriodPreset): { start: string; end: string } => {
  const now = new Date();
  const toISO = (d: Date) => d.toISOString().split('T')[0];

  if (preset === 'last_7_days') {
    const end = new Date(now);
    const start = new Date(now);
    start.setDate(now.getDate() - 6);
    return { start: toISO(start), end: toISO(end) };
  }

  const day = now.getDay();
  const diffToMonday = now.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(now.getFullYear(), now.getMonth(), diffToMonday);

  if (preset === 'last_week') {
    const prevMonday = new Date(monday);
    prevMonday.setDate(monday.getDate() - 7);
    const prevSunday = new Date(prevMonday);
    prevSunday.setDate(prevMonday.getDate() + 6);
    return { start: toISO(prevMonday), end: toISO(prevSunday) };
  }

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { start: toISO(monday), end: toISO(sunday) };
};

export const exportCommandReportPDF = (
  weekStart: string,
  weekEnd: string,
  senderName: string,
  summary: CommandReportSummaryPayload,
  executiveNote?: string
) => {
  const doc = new jsPDF();
  const auditId =
    typeof window !== 'undefined' && window.crypto?.randomUUID
      ? window.crypto.randomUUID().slice(0, 13).toUpperCase()
      : 'DFS-' + Date.now().toString(36).toUpperCase();
  const logoImg = '/logo.png';

  const drawPageFrame = (pdf: jsPDF) => {
    pdf.setDrawColor(30, 58, 138);
    pdf.setLineWidth(1);
    pdf.rect(5, 5, 200, 287);
  };

  const addWatermark = (pdf: any) => {
    try {
      pdf.saveGraphicsState();
      pdf.setGState(new pdf.GState({ opacity: 0.06 }));
      const w = 120;
      const h = 120;
      pdf.addImage(logoImg, 'PNG', (210 - w) / 2, (297 - h) / 2, w, h);
      pdf.restoreGraphicsState();
    } catch {
      pdf.setTextColor(245);
      pdf.setFontSize(40);
      pdf.text('NIGERIA POLICE ACADEMY', 105, 140, { align: 'center', angle: 45 });
    }
  };

  // 1. Structural Border & Watermark on Page 1
  drawPageFrame(doc);
  addWatermark(doc);

  // 2. Briefing Header (Left-Aligned Crest)
  try {
    doc.addImage(logoImg, 'PNG', 15, 12, 22, 22);
  } catch {
    // Logo optional if offline
  }

  doc.setTextColor(30, 58, 138);
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.text('WEEKLY COMMAND REPORT', 42, 22);

  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text(`${weekStart} TO ${weekEnd}`.toUpperCase(), 42, 29);

  doc.setFontSize(9.5);
  doc.setTextColor(100);
  doc.text(
    `OFFICER IN CHARGE: DIRECTOR FIELD STUDIES (${senderName.toUpperCase()}) | AUDIT ID: ${auditId}`,
    42,
    36,
    { maxWidth: 155 }
  );

  // 3. Section A: Academy Snapshot (Weekly Aggregate)
  doc.setDrawColor(30, 58, 138);
  doc.setLineWidth(0.5);
  doc.line(15, 45, 195, 45);

  doc.setFontSize(14);
  doc.setTextColor(30, 58, 138);
  doc.setFont('helvetica', 'bold');
  doc.text('SECTION A: ACADEMY SNAPSHOT (WEEKLY AGGREGATE)', 15, 55);

  const startY = 62;
  const boxWidth = 55;
  const boxHeight = 25;

  const renderBox = (x: number, title: string, val: number, color: number[]) => {
    doc.setDrawColor(30, 58, 138);
    doc.setLineWidth(0.5);
    doc.rect(x, startY, boxWidth, boxHeight);

    doc.setFontSize(8.5);
    doc.setTextColor(100);
    doc.setFont('helvetica', 'normal');
    doc.text(title, x + 5, startY + 8);

    if (val === 0) {
      doc.setTextColor(5, 150, 105);
      doc.setFont('courier', 'bold');
      doc.setFontSize(16);
      doc.text('NIL', x + boxWidth / 2, startY + 18, { align: 'center' });
    } else {
      doc.setTextColor(color[0], color[1], color[2]);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.text(val.toString(), x + boxWidth / 2, startY + 18, { align: 'center' });
    }
    doc.setFont('helvetica', 'normal');
  };

  renderBox(15, 'TOTAL ABSENCES', summary.totalAbsent, [159, 18, 57]);
  renderBox(75, 'SICK', summary.totalSick, [180, 83, 9]);
  renderBox(135, 'DETENTION', summary.totalDetention, [67, 56, 202]);

  doc.setFontSize(9.5);
  doc.setTextColor(71, 85, 105);
  doc.text(
    `Parades Held: ${summary.totalParades}   |   Avg. Weekly Attendance: ${summary.attendanceRate.toFixed(1)}%   |   Detention: ${summary.totalDetention}`,
    15,
    95
  );

  // 4. Section B: Course Performance Matrices
  let currentY = 107;
  doc.setFontSize(14);
  doc.setTextColor(30, 58, 138);
  doc.setFont('helvetica', 'bold');
  doc.text('SECTION B: COURSE PERFORMANCE MATRICES', 15, currentY);
  currentY += 10;

  const ensureSpace = (needed: number) => {
    if (currentY + needed > 265) {
      doc.addPage();
      drawPageFrame(doc);
      addWatermark(doc);
      currentY = 22;
    }
  };

  const courseRows = summary.courseBreakdown || [];
  courseRows.forEach(course => {
    ensureSpace(45);

    const avgPct =
      typeof course.avgAttendance === 'number'
        ? course.avgAttendance
        : course.total > 0
        ? (course.present / course.total) * 100
        : 100;
    const standing = avgPct >= 95 ? 'OPTIMAL' : avgPct < 85 ? 'CRITICAL' : 'WATCH';
    const standingColor =
      avgPct >= 95 ? [5, 150, 105] : avgPct < 85 ? [185, 28, 28] : [30, 58, 138];

    // Tactical Sub-header
    doc.setDrawColor(30, 58, 138);
    doc.setLineWidth(1.5);
    doc.line(15, currentY - 5, 15, currentY + 5);

    doc.setFontSize(13);
    doc.setTextColor(30, 58, 138);
    doc.setFont('helvetica', 'bold');
    doc.text(`REGULAR COURSE ${course.courseNumber}`, 20, currentY);

    doc.setFontSize(9.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100);
    doc.text('Standing: ', 20, currentY + 7);
    doc.setTextColor(standingColor[0], standingColor[1], standingColor[2]);
    doc.setFont('helvetica', 'bold');
    doc.text(standing, 36, currentY + 7);

    doc.setTextColor(100);
    doc.setFont('helvetica', 'normal');
    doc.text(' | Avg. Attendance: ', 56, currentY + 7);
    doc.setTextColor(standingColor[0], standingColor[1], standingColor[2]);
    doc.setFont('helvetica', 'bold');
    doc.text(`${avgPct.toFixed(1)}%`, 88, currentY + 7);

    doc.setTextColor(100);
    doc.setFont('helvetica', 'normal');
    doc.text(` | Parades Held: ${course.parades}`, 106, currentY + 7);

    currentY += 12;

    const repeatAbsentees = course.repeatAbsentees || [];
    if (repeatAbsentees.length === 0) {
      doc.setFillColor(248, 250, 252);
      doc.rect(20, currentY, 170, 11, 'F');
      doc.setFontSize(8.5);
      doc.setTextColor(5, 150, 105);
      doc.setFont('helvetica', 'bold');
      doc.text('NIL (NO CADETS WITH 3+ WEEKLY ABSENCES)', 105, currentY + 7, { align: 'center' });
      currentY += 18;
    } else {
      autoTable(doc, {
        startY: currentY,
        head: [['SQUAD', 'CADET NAME (3+ ABSENCES)', 'WEEKLY ABSENCES']],
        body: repeatAbsentees.map(c => [
          (c.squad || 'N/A').toUpperCase(),
          c.name.toUpperCase(),
          String(c.absences)
        ]),
        headStyles: { fillColor: [30, 58, 138], fontSize: 9, halign: 'left' },
        styles: { fontSize: 9.5, cellPadding: 3.5 },
        columnStyles: {
          0: { fontStyle: 'bold', cellWidth: 38 },
          1: { fontStyle: 'bold' },
          2: { textColor: [159, 18, 57], fontStyle: 'bold', halign: 'right', font: 'courier' }
        },
        margin: { left: 20, right: 20, top: 18, bottom: 20 },
        didDrawPage: data => {
          if (data.pageNumber > 1) {
            drawPageFrame(doc);
            addWatermark(doc);
          }
        }
      });

      currentY = ((doc as any).lastAutoTable?.finalY ?? currentY + 18) + 10;
    }

    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.4);
    doc.line(15, currentY - 4, 195, currentY - 4);
  });

  // 5. Section C: Director Field Studies Assessment
  ensureSpace(65);
  doc.setFontSize(14);
  doc.setTextColor(30, 58, 138);
  doc.setFont('helvetica', 'bold');
  doc.text('SECTION C: DIRECTOR FIELD STUDIES ASSESSMENT', 15, currentY);

  const sorted = [...courseRows].sort((a, b) => {
    const rateA = a.avgAttendance ?? (a.total > 0 ? (a.present / a.total) * 100 : 100);
    const rateB = b.avgAttendance ?? (b.total > 0 ? (b.present / b.total) * 100 : 100);
    return rateB - rateA;
  });
  const bestRC = sorted[0];
  const worstRC = sorted[sorted.length - 1];

  const autoSummary = bestRC
    ? `Institutional Performance Summary: Academy average attendance stands at ${summary.attendanceRate.toFixed(1)}% across ${summary.totalParades} parade state(s). RC ${bestRC.courseNumber} leads at ${(bestRC.avgAttendance ?? (bestRC.total > 0 ? (bestRC.present / bestRC.total) * 100 : 100)).toFixed(1)}%, while RC ${worstRC.courseNumber} stands at ${(worstRC.avgAttendance ?? (worstRC.total > 0 ? (worstRC.present / worstRC.total) * 100 : 100)).toFixed(1)}%.`
    : `Institutional Performance Summary: ${summary.totalParades} parade state(s) recorded during this period.`;

  const narrative = executiveNote ? `${executiveNote}\n\n${autoSummary}` : autoSummary;

  doc.setFont('times', 'italic');
  doc.setFontSize(11.5);
  doc.setTextColor(15, 23, 42);
  const splitNarrative = doc.splitTextToSize(narrative, 175);
  doc.text(splitNarrative, 15, currentY + 9);

  // Sign-off & Footer
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  doc.setTextColor(0);
  doc.text('__________________________', 138, 258);
  doc.setFont('helvetica', 'bold');
  doc.text('DIRECTOR FIELD STUDIES', 138, 264);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(130);
  doc.text(`VALIDATED SECURE_ID: ${auditId}`, 138, 270);

  doc.setFontSize(8.5);
  doc.text(
    `WEEKLY COMMAND REPORT • GENERATED: ${new Date().toLocaleString()} • SECURE_COPY`,
    105,
    282,
    { align: 'center' }
  );

  doc.save(`WEEKLY_COMMAND_REPORT_${weekStart}_${weekEnd}.pdf`);
};

export const WeeklyCommandReportSheet: React.FC<WeeklyCommandReportSheetProps> = ({
  isOpen,
  defaultRecipient = 'both',
  onClose,
  onSent
}) => {
  const { currentUser } = useAuth();
  const { records } = useParade();
  const shouldReduceMotion = useReducedMotion();

  const [period, setPeriod] = useState<PeriodPreset>('this_week');
  const [sendToCmd, setSendToCmd] = useState(true);
  const [sendToDcmd, setSendToDcmd] = useState(true);
  const [executiveNote, setExecutiveNote] = useState('');
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [expandedCourse, setExpandedCourse] = useState<number | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [repeatAbsenteesByCourse, setRepeatAbsenteesByCourse] = useState<
    Record<number, CommandReportRepeatAbsentee[]>
  >({});

  useEffect(() => {
    if (!isOpen) return;
    setSendToCmd(defaultRecipient === 'commandant' || defaultRecipient === 'both');
    setSendToDcmd(defaultRecipient === 'deputy_commandant' || defaultRecipient === 'both');
    setExecutiveNote('');
    setShowBreakdown(false);
  }, [isOpen, defaultRecipient]);

  const bounds = useMemo(() => computePeriodBounds(period), [period]);

  useEffect(() => {
    if (!isOpen) return;
    const filteredRecords = records.filter(r => r.date >= bounds.start && r.date <= bounds.end);
    const recordCourseMap = new Map<string, number>();
    const recordIds: string[] = [];

    for (const r of filteredRecords) {
      if (r.id && r.courseNumber) {
        recordIds.push(String(r.id));
        recordCourseMap.set(String(r.id), Number(r.courseNumber));
      }
    }

    if (recordIds.length === 0) {
      setRepeatAbsenteesByCourse({});
      return;
    }

    let cancelled = false;
    supabase
      .from('cadet_details')
      .select('parade_record_id, name, squad, status')
      .in('parade_record_id', recordIds)
      .ilike('status', '%absent%')
      .then(({ data }) => {
        if (cancelled || !data) return;
        const counts = new Map<
          number,
          Map<string, { name: string; squad: string; absences: number }>
        >();

        for (const row of data) {
          const cNum = recordCourseMap.get(String(row.parade_record_id));
          if (!cNum) continue;
          const name = String(row.name || '').trim();
          if (!name) continue;
          const squad = String(row.squad || 'N/A').trim();
          const key = `${name.toLowerCase()}::${squad.toLowerCase()}`;

          if (!counts.has(cNum)) counts.set(cNum, new Map());
          const courseMap = counts.get(cNum)!;
          const cur = courseMap.get(key) || { name, squad, absences: 0 };
          cur.absences += 1;
          courseMap.set(key, cur);
        }

        const grouped: Record<number, CommandReportRepeatAbsentee[]> = {};
        for (const [cNum, courseMap] of counts.entries()) {
          grouped[cNum] = Array.from(courseMap.values())
            .filter(item => item.absences >= 3)
            .sort((a, b) => b.absences - a.absences || a.name.localeCompare(b.name));
        }
        setRepeatAbsenteesByCourse(grouped);
      }, () => {});

    return () => {
      cancelled = true;
    };
  }, [isOpen, bounds.start, bounds.end, records]);

  // Body scroll lock
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  const summary: CommandReportSummaryPayload = useMemo(() => {
    const filtered = records.filter(r => r.date >= bounds.start && r.date <= bounds.end);
    let totalPresent = 0;
    let totalCadets = 0;
    let totalAbsent = 0;
    let totalSick = 0;
    let totalDetention = 0;

    const byCourse = new Map<number, CommandReportCourseBreakdown>();

    for (const r of filtered) {
      const cNum = Number(r.courseNumber || 0);
      totalPresent += r.presentCount || 0;
      totalCadets += r.grandTotal || 0;
      totalAbsent += r.absentCount || 0;
      totalSick += r.sickCount || 0;
      totalDetention += r.detentionCount || 0;

      if (cNum > 0) {
        const entry = byCourse.get(cNum) || {
          courseNumber: cNum,
          parades: 0,
          present: 0,
          absent: 0,
          sick: 0,
          detention: 0,
          total: 0,
          avgAttendance: 100,
          paradeDetails: [] as CommandReportParadeDetail[]
        };
        const pTotal = r.grandTotal || 0;
        const pPresent = r.presentCount || 0;
        const pRate = pTotal > 0 ? (pPresent / pTotal) * 100 : 100;

        entry.parades += 1;
        entry.present += pPresent;
        entry.absent += r.absentCount || 0;
        entry.sick += r.sickCount || 0;
        entry.detention += r.detentionCount || 0;
        entry.total += pTotal;
        entry.avgAttendance = entry.total > 0 ? (entry.present / entry.total) * 100 : 100;
        entry.paradeDetails = [
          ...(entry.paradeDetails || []),
          {
            date: r.date,
            paradeType: r.paradeType || 'MUSTER',
            present: pPresent,
            absent: r.absentCount || 0,
            sick: r.sickCount || 0,
            detention: r.detentionCount || 0,
            total: pTotal,
            rate: pRate
          }
        ];
        byCourse.set(cNum, entry);
      }
    }

    const attendanceRate = totalCadets > 0 ? (totalPresent / totalCadets) * 100 : 100;

    return {
      totalParades: filtered.length,
      attendanceRate,
      totalPresent,
      totalCadets,
      totalAbsent,
      totalSick,
      totalDetention,
      sickbayNoShows: 0,
      courseBreakdown: Array.from(byCourse.values())
        .map(c => ({
          ...c,
          repeatAbsentees: repeatAbsenteesByCourse[c.courseNumber] || []
        }))
        .sort((a, b) => a.courseNumber - b.courseNumber)
    };
  }, [records, bounds, repeatAbsenteesByCourse]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || (!sendToCmd && !sendToDcmd) || isSending) return;

    const recipientRole: 'commandant' | 'deputy_commandant' | 'both' =
      sendToCmd && sendToDcmd ? 'both' : sendToCmd ? 'commandant' : 'deputy_commandant';

    setIsSending(true);
    try {
      await dbService.sendWeeklyCommandReport({
        senderId: String(currentUser.id),
        senderName: currentUser.fullName,
        recipientRole,
        weekStart: bounds.start,
        weekEnd: bounds.end,
        summaryPayload: summary,
        executiveNote: executiveNote.trim() || undefined
      });
      toast.success('Weekly Command Report dispatched');
      window.dispatchEvent(new CustomEvent('command-reports-updated'));
      onSent?.();
      onClose();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to send report.');
    } finally {
      setIsSending(false);
    }
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          data-drawer-open="true"
          className="fixed inset-0 z-[999] flex items-end sm:items-center justify-center"
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => !isSending && onClose()}
            className="fixed inset-0 bg-slate-950/50 backdrop-blur-xs"
          />

          <motion.form
            onSubmit={handleSend}
            initial={shouldReduceMotion ? { opacity: 0 } : { y: '100%', opacity: 0.9 }}
            animate={{ y: 0, opacity: 1 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { y: '100%', opacity: 0.9 }}
            transition={
              shouldReduceMotion
                ? { duration: 0.12 }
                : { type: 'spring', stiffness: 360, damping: 32 }
            }
            className="relative z-10 w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl border-t sm:border border-slate-200 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] max-h-[92vh] overflow-y-auto space-y-4"
          >
            <div className="w-10 h-1 bg-slate-300 rounded-full mx-auto -mt-1 sm:hidden" />

            {/* Header */}
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Weekly Command Report</h3>
                <p className="text-xs text-slate-500 mt-0.5 inline-flex items-center gap-1">
                  <Calendar size={12} />
                  <span>
                    {bounds.start} to {bounds.end}
                  </span>
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="min-w-[44px] min-h-[44px] -mr-2 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X size={20} />
              </button>
            </div>

            {/* 3-Segment Period Pills */}
            <div className="grid grid-cols-3 gap-1 bg-slate-100 p-1 rounded-xl">
              {(
                [
                  { id: 'this_week', label: 'This Week' },
                  { id: 'last_7_days', label: 'Last 7 Days' },
                  { id: 'last_week', label: 'Last Week' }
                ] as const
              ).map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPeriod(p.id)}
                  className={`min-h-[40px] px-2 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    period === p.id
                      ? 'bg-white text-slate-900 shadow-2xs font-bold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Auto-Compiled Summary Preview Card */}
            <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4 space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <p className="text-[11px] font-medium text-slate-500">Attendance</p>
                  <p className="text-lg font-bold text-emerald-700 font-mono">
                    {summary.attendanceRate.toFixed(1)}%
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-medium text-slate-500">Parades</p>
                  <p className="text-lg font-bold text-slate-900 font-mono">
                    {summary.totalParades}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-medium text-slate-500">Absent</p>
                  <p className="text-lg font-bold text-rose-600 font-mono">
                    {summary.totalAbsent}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-medium text-slate-500">Sick</p>
                  <p className="text-lg font-bold text-amber-700 font-mono">
                    {summary.totalSick}
                  </p>
                </div>
              </div>

              {summary.courseBreakdown.length > 0 && (
                <div className="pt-2 border-t border-slate-200/80">
                  <button
                    type="button"
                    onClick={() => setShowBreakdown(prev => !prev)}
                    className="w-full min-h-[36px] flex items-center justify-between text-xs font-semibold text-blue-800"
                  >
                    <span>Course Breakdown ({summary.courseBreakdown.length})</span>
                    {showBreakdown ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                  </button>
                  {showBreakdown && (
                    <div className="mt-2 space-y-2">
                      {summary.courseBreakdown.map(c => {
                        const avgPct =
                          typeof c.avgAttendance === 'number'
                            ? c.avgAttendance
                            : c.total > 0
                            ? (c.present / c.total) * 100
                            : 100;
                        const isExpanded = expandedCourse === c.courseNumber;
                        const details = c.paradeDetails || [];

                        return (
                          <div
                            key={c.courseNumber}
                            className="bg-white rounded-xl border border-slate-200/80 overflow-hidden"
                          >
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedCourse(prev =>
                                  prev === c.courseNumber ? null : c.courseNumber
                                )
                              }
                              className="w-full min-h-[48px] px-3 py-2 flex items-center justify-between gap-2 text-left hover:bg-slate-50/70 transition-colors"
                            >
                              <div className="min-w-0">
                                <span className="text-xs font-bold text-slate-900">
                                  {formatRC(c.courseNumber)}
                                </span>
                                <span className="text-[11px] text-slate-500 ml-1.5">
                                  • {c.parades} parade{c.parades === 1 ? '' : 's'}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[11px] font-bold font-mono ${
                                    avgPct >= 95
                                      ? 'bg-emerald-50 text-emerald-700'
                                      : avgPct < 85
                                      ? 'bg-rose-50 text-rose-700'
                                      : 'bg-blue-50 text-blue-800'
                                  }`}
                                >
                                  {avgPct.toFixed(1)}%
                                </span>
                                <span className="text-[11px] text-slate-500 font-mono hidden sm:inline">
                                  {c.absent} abs • {c.sick} sick
                                </span>
                                <ChevronDown
                                  size={15}
                                  className={`text-slate-400 ${
                                    shouldReduceMotion ? '' : 'transition-transform duration-200'
                                  } ${isExpanded ? 'rotate-180' : ''}`}
                                />
                              </div>
                            </button>

                            {isExpanded && details.length > 0 && (
                              <div className="border-t border-slate-100 bg-slate-50/70 divide-y divide-slate-100">
                                {details.map((d, idx) => (
                                  <div
                                    key={`${c.courseNumber}-${d.date}-${d.paradeType}-${idx}`}
                                    className="px-3 py-2 flex items-center justify-between text-[11px]"
                                  >
                                    <span className="font-medium text-slate-700">
                                      {d.date} •{' '}
                                      <span className="uppercase text-slate-500">
                                        {d.paradeType}
                                      </span>
                                    </span>
                                    <span className="font-mono text-slate-700">
                                      {d.present}/{d.total}{' '}
                                      <strong className="text-blue-900">
                                        ({d.rate.toFixed(0)}%)
                                      </strong>
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Recipients */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Send To
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setSendToCmd(prev => !prev)}
                  className={`min-h-[44px] px-3 py-2 rounded-xl border text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-all ${
                    sendToCmd
                      ? 'bg-blue-900 text-white border-blue-900'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {sendToCmd && <Check size={14} />}
                  <span>Commandant</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSendToDcmd(prev => !prev)}
                  className={`min-h-[44px] px-3 py-2 rounded-xl border text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-all ${
                    sendToDcmd
                      ? 'bg-blue-900 text-white border-blue-900'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {sendToDcmd && <Check size={14} />}
                  <span>Deputy Commandant</span>
                </button>
              </div>
            </div>

            {/* Executive Note */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Executive Note (Optional)
              </label>
              <textarea
                rows={2}
                value={executiveNote}
                onChange={e => setExecutiveNote(e.target.value)}
                placeholder="Add command summary note..."
                className="w-full bg-slate-50 focus:bg-white border border-slate-200 focus:border-blue-600 rounded-xl px-3.5 py-2.5 text-base sm:text-sm text-slate-900 placeholder:text-slate-400 outline-none resize-none"
              />
            </div>

            {/* Stacked Dual Actions (Edge Case #2: full-width Send on top, Export PDF beneath) */}
            <div className="space-y-2 pt-1">
              <button
                type="submit"
                disabled={isSending || (!sendToCmd && !sendToDcmd)}
                className="w-full min-h-[48px] flex items-center justify-center gap-2 rounded-xl bg-blue-900 hover:bg-blue-800 disabled:opacity-50 text-white text-sm font-bold shadow-sm transition-all"
              >
                {isSending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                <span>{isSending ? 'Sending Report...' : 'Send Report'}</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  exportCommandReportPDF(
                    bounds.start,
                    bounds.end,
                    currentUser?.fullName || 'Director Field Studies',
                    summary,
                    executiveNote.trim() || undefined
                  )
                }
                className="w-full min-h-[44px] flex items-center justify-center gap-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold transition-all"
              >
                <FileDown size={15} />
                <span>Export PDF</span>
              </button>
            </div>
          </motion.form>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
};

