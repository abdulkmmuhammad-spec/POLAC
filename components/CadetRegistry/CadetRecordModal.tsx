import React, { useState, useEffect } from 'react';
import { X, FileText, TrendingUp, AlertCircle, CheckCircle, Shield, Calendar, User as UserIcon, Medal, BadgeAlert } from 'lucide-react';
import { dbService } from '../../services/dbService';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { toast } from 'react-hot-toast';
import { SubmissionPreview } from '../Common/SubmissionPreview';
import { calculateCurrentLevel } from '../../utils/rcHelpers';
import { useAuth } from '../../context/AuthContext';
import { Edit3, Save, ShieldAlert } from 'lucide-react';

const logo = '/logo.png';

interface CadetRecordModalProps {
    cadet: any;
    activeRC: number;
    onClose: () => void;
}

export const CadetRecordModal: React.FC<CadetRecordModalProps> = ({ cadet, activeRC, onClose }) => {
    const { currentUser } = useAuth();
    const [stats, setStats] = useState({ absent: 0, sick: 0, detention: 0, lastEvent: null as any });
    const [isLoading, setIsLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);

    // Editable Fields
    const [editName, setEditName] = useState(cadet.name);
    const [editSquad, setEditSquad] = useState(cadet.squad);
    const [editCourse, setEditCourse] = useState(cadet.course_number);

    const level = cadet.course_number ? (activeRC - cadet.course_number + 1) : cadet.year_group;

    useEffect(() => {
        setEditName(cadet.name);
        setEditSquad(cadet.squad);
        setEditCourse(cadet.course_number);
    }, [cadet.id, cadet.name, cadet.squad, cadet.course_number]);

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const data = await dbService.getCadetStats(cadet.name);
                setStats(data);
            } catch (err) {
                console.error('Failed to load stats', err);
            } finally {
                setIsLoading(false);
            }
        };
        fetchStats();
    }, [cadet.name]);

    // Calculation Constants
    const ABSENCE_PENALTY = 0.5;
    const DETENTION_PENALTY = 2.0;

    const calculateStandingScore = (absences: number, detentions: number) => {
        const score = 100 - (absences * ABSENCE_PENALTY) - (detentions * DETENTION_PENALTY);
        return Math.max(0, Math.min(100, score));
    };

    const calculateFitness = (visits: number, yearLevel: number) => {
        const allowedVisits = yearLevel * 2.5;
        if (visits <= allowedVisits) return 100;
        const excess = visits - allowedVisits;
        const score = 100 - (excess * 1.8);
        return Math.max(0, Math.min(100, score));
    };

    const getFitnessAssessment = (score: number) => {
        if (score >= 95) return "COMBAT READY";
        if (score >= 80) return "FIT FOR DUTY";
        return "MEDICAL REVIEW";
    };

    // Year-weighted attendance thresholds (confirmed: EXEMPLARY ≤ yearLevel × 6.5)
    const getAttendanceAssessment = (absences: number, yearLevel: number) => {
        const exemplaryLimit = Math.round(yearLevel * 6.5);  // Year4 → 26
        const satisfactoryLimit = Math.round(yearLevel * 15);  // Year4 → 60
        const underReviewLimit = Math.round(yearLevel * 26);  // Year4 → 104

        if (absences <= exemplaryLimit) return { label: 'EXEMPLARY', color: 'text-emerald-600' };
        if (absences <= satisfactoryLimit) return { label: 'SATISFACTORY', color: 'text-blue-600' };
        if (absences <= underReviewLimit) return { label: 'UNDER REVIEW', color: 'text-amber-600' };
        return { label: 'ACTION REQUIRED', color: 'text-rose-700' };
    };

    const currentScore = calculateStandingScore(stats.absent, stats.detention);

    const getStatusInfo = (score: number) => {
        if (score >= 89) return { label: 'EXEMPLARY', color: 'text-emerald-600', bg: 'bg-emerald-600', icon: <Medal size={14} className="w-4 h-4" /> };
        if (score >= 70) return { label: 'SATISFACTORY', color: 'text-blue-600', bg: 'bg-blue-600', icon: <CheckCircle size={14} className="w-4 h-4" /> };
        if (score >= 50) return { label: 'UNDER REVIEW', color: 'text-amber-600', bg: 'bg-amber-600', icon: <AlertCircle size={14} className="w-4 h-4" /> };
        return { label: 'CRITICAL', color: 'text-rose-600', bg: 'bg-rose-600', icon: <BadgeAlert size={14} className="w-4 h-4" /> };
    };

    const getCommandantAssessment = (score: number, currentStats: { absent: number, detention: number }) => {
        let narrative = "";

        if (score >= 89) {
            narrative = "This cadet maintains an exemplary record of discipline and institutional presence. Performance is within the highest standards of the Academy.";
        } else if (score >= 70) {
            narrative = "Cadet demonstrates satisfactory conduct. Minor inconsistencies in accountability are noted but do not currently impact overall standing.";
        } else if (score >= 50) {
            narrative = "Conduct is under administrative review. Improvement in personal accountability and adherence to academy regulations is required to maintain standing.";
        } else {
            narrative = "CRITICAL: Cadet's standing has fallen below acceptable institutional thresholds. Immediate intervention and disciplinary counseling are mandated.";
        }

        const punches = [];
        const exemplaryLimit = Math.round(level * 6.5);
        const satisfactoryLimit = Math.round(level * 15);
        if (currentStats.absent > satisfactoryLimit) punches.push("Persistent unauthorized absences are a primary concern.");
        if (currentStats.absent > exemplaryLimit && currentStats.absent <= satisfactoryLimit) punches.push("Absence count is trending above exemplary thresholds — review is advised.");
        if (currentStats.detention > 3) punches.push("Frequent disciplinary detentions indicate a failure to adhere to command hierarchy.");

        return punches.length > 0 ? `${narrative} ${punches.join(" ")}` : narrative;
    };

    const exportToPDF = async () => {
        try {
            const doc = new jsPDF();
            const status = getStatusInfo(currentScore);
            const cadetName = cadet?.name || 'Unknown Cadet';
            const generateAuditId = () => {
                try {
                    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
                        return crypto.randomUUID().toUpperCase();
                    }
                    if (typeof window !== 'undefined' && window.crypto && window.crypto.randomUUID) {
                        return window.crypto.randomUUID().toUpperCase();
                    }
                    return Math.random().toString(36).substring(2, 15).toUpperCase() +
                        Math.random().toString(36).substring(2, 15).toUpperCase();
                } catch (e) {
                    return 'CR-' + Date.now().toString(36).toUpperCase();
                }
            };

            const auditId = generateAuditId();

            // 1. Formal Command Border
            doc.setDrawColor(30, 58, 138); // Blue 900
            doc.setLineWidth(1);
            doc.rect(5, 5, 200, 287);

            // 2. High-Authority Header (35% Upscale)
            doc.setFillColor(30, 58, 138);
            doc.rect(10, 10, 190, 45, 'F');

            try {
                doc.addImage(logo, 'PNG', 15, 17, 24, 24);
            } catch (e) {
                console.warn('Logo missing');
            }

            doc.setFontSize(24.3); // 18 * 1.35
            doc.setTextColor(255);
            doc.setFont('helvetica', 'bold');
            doc.text('NIGERIAN POLICE ACADEMY', 110, 28, { align: 'center' });

            doc.setFontSize(13.5); // 10 * 1.35
            doc.setFont('helvetica', 'normal');
            doc.text('OFFICE OF THE COMMANDANT • OFFICIAL PERFORMANCE DOSSIER', 110, 38, { align: 'center' });
            doc.setFontSize(10.8);
            doc.text(`AUDIT_ID: ${auditId} | STATUS: AUTHORITATIVE_UNCLASSIFIED`, 110, 46, { align: 'center' });

            // 3. Identification Section
            doc.setTextColor(0);
            doc.setFontSize(14.8); // 11 * 1.35
            doc.setFont('helvetica', 'bold');
            doc.text('I. CADET IDENTIFICATION', 20, 75);
            doc.line(20, 77, 90, 77);

            doc.setFontSize(12);
            doc.setFont('helvetica', 'normal');
            doc.text(`NAME: ${cadetName.toUpperCase()}`, 25, 88);
            doc.text(`COURSE: REGULAR COURSE ${cadet.course_number || 'N/A'}`, 25, 96);
            doc.text(`LEVEL: YEAR ${level}`, 25, 104);
            doc.text(`SQUAD: ${cadet.squad?.toUpperCase() || 'N/A'}`, 25, 112);

            // Standing Module (Visual)
            const fScore = calculateFitness(stats.sick || 0, level);
            doc.setFont('helvetica', 'bold');
            doc.text('INSTITUTIONAL STANDING:', 130, 88);
            doc.setFontSize(18.9); // 14 * 1.35
            if (status.bg === 'bg-rose-600') doc.setTextColor(159, 18, 57);
            else doc.setTextColor(30, 58, 138);
            doc.text(status.label, 130, 98);

            // Bar
            doc.setFillColor(241, 245, 249);
            doc.roundedRect(20, 125, 170, 6, 1, 1, 'F');
            if (currentScore >= 89) doc.setFillColor(5, 150, 105);
            else if (currentScore >= 70) doc.setFillColor(37, 99, 235);
            else if (currentScore >= 50) doc.setFillColor(217, 119, 6);
            else doc.setFillColor(185, 28, 28);
            doc.roundedRect(20, 125, (currentScore / 100) * 170, 6, 1, 1, 'F');

            // 4. Detailed Accountability Table (NIL Rendering)
            autoTable(doc, {
                startY: 145,
                head: [['Accountability Logic', 'Metric Index', 'Command Assessment']],
                body: [
                    ['Duty Attendance', `${attendanceScore}%`, `${getAttendanceAssessment(stats.absent, level).label} (${stats.absent} ABSENCES)`],
                    ['Fitness Index (Weighted)', `${fitnessScore.toFixed(1)}%`, getFitnessAssessment(fitnessScore)],
                    ['Disciplinary Record', stats.detention > 0 ? `${stats.detention} INFRACTIONS` : 'NIL (DISTINGUISHED)', stats.detention === 0 ? 'NIL_OFFENSES' : 'ACTION_REQUIRED']
                ],
                headStyles: { fillColor: [30, 58, 138], fontSize: 11, fontStyle: 'bold' },
                styles: { fontSize: 10.8, cellPadding: 6 },
                alternateRowStyles: { fillColor: [248, 250, 252] }
            });

            const finalY = (doc as any).lastAutoTable.finalY + 20;

            // 5. Commandant's Assessment (Serif for Gravity)
            doc.setFont('times', 'bold');
            doc.setFontSize(14.8);
            doc.setTextColor(30, 58, 138);
            doc.text("II. COMMANDANT'S ASSESSMENT", 20, finalY);

            doc.setFont('times', 'italic');
            doc.setFontSize(13);
            doc.setTextColor(0);
            const assessment = getCommandantAssessment(currentScore, stats);
            const splitContent = doc.splitTextToSize(`"${assessment}"`, 170);
            doc.text(splitContent, 20, finalY + 10);

            // 6. Secure Sign-off
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(11);
            doc.text('__________________________', 140, 260);
            doc.text('OFFICE OF THE COMMANDANT', 140, 266);
            doc.setFontSize(9);
            doc.setTextColor(150);
            doc.text(`VALIDATED SECURE_ID: ${auditId}`, 140, 272);

            // Footer
            doc.setFontSize(9);
            doc.text(`CONFIDENTIAL CADET RECORD • GENERATED: ${new Date().toLocaleString()} • NPA_CMS_V2_AUDIT`, 105, 282, { align: 'center' });

            // Traceability Notification
            await dbService.addNotification({
                type: 'system',
                title: 'Official Dossier Produced',
                content: `Commandant Dossier generated for Cadet ${cadetName} (Audit ID: ${auditId})`,
                timestamp: new Date().toISOString(),
                read: false,
                officerName: 'COMMANDANT',
                yearGroup: 5,
                courseNumber: cadet.course_number || activeRC
            });

            doc.save(`${cadetName.replace(/\s+/g, '_')}_AUTHORITATIVE_DOSSIER.pdf`);
            toast.success('Dossier Generated with Search ID: ' + auditId);
        } catch (err) {
            console.error(err);
            toast.error('Dossier Generation Failed');
        }
    };



    const handleSave = async () => {
        // Validation Layer
        const trimmedName = editName?.trim();
        const trimmedSquad = editSquad?.trim();
        const parsedCourse = parseInt(String(editCourse), 10);

        if (!trimmedName) {
            toast.error('Name cannot be empty');
            return;
        }

        if (isNaN(parsedCourse) || parsedCourse < 1 || parsedCourse > 20) {
            toast.error('RC Number must be between 1 and 20');
            return;
        }

        if (!trimmedSquad) {
            toast.error('Squad assignment is required');
            return;
        }

        setIsLoading(true);
        try {
            const updates = {
                name: trimmedName,
                squad: trimmedSquad,
                course_number: parsedCourse,
                year_group: calculateCurrentLevel(parsedCourse, activeRC)
            };

            const { error } = await dbService.updateCadetRegistry(cadet.id, updates, currentUser!);
            if (error) throw error;

            toast.success('Master Record updated and audit-logged.');
            setIsEditing(false);
            setShowConfirm(false);
            // The CadetManager will refresh when we close/modify
        } catch (err) {
            console.error('Save failed:', err);
            toast.error('Failed to update Master Registry.');
        } finally {
            setIsLoading(false);
        }
    };

    const standing = getStatusInfo(currentScore);
    const attendanceScore = (100 - (stats.absent * 0.5)).toFixed(1);
    const fitnessScore = calculateFitness(stats.sick || 0, level);
    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4 bg-slate-900/80 backdrop-blur-md animate-in fade-in duration-300">
            <div className="bg-white w-full max-w-2xl rounded-[1.5rem] sm:rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-300 flex flex-col max-h-[95vh] sm:max-h-[90vh]">
                {/* Premium Header */}
                <div className="bg-[#0f172a] text-white p-6 md:p-8 relative overflow-hidden shrink-0">
                    <div className="relative z-10 flex flex-col sm:flex-row items-start justify-between gap-4">
                        <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 items-center sm:items-start text-center sm:text-left w-full sm:w-auto">
                            <div className="relative">
                                <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-slate-800 border-2 border-slate-700 flex items-center justify-center overflow-hidden shadow-2xl">
                                    <UserIcon size={40} className="text-slate-600 sm:w-12 sm:h-12" />
                                </div>
                                <div className="absolute -bottom-2 -right-2 w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-blue-600 border-2 sm:border-4 border-[#0f172a] flex items-center justify-center shadow-lg">
                                    <img src={logo} alt="Academy Logo" className="w-5 h-5 sm:w-6 sm:h-6 object-contain" />
                                </div>
                            </div>
                            <div className="space-y-1 w-full">
                                {isEditing ? (
                                    <div className="space-y-3 p-4 bg-slate-800/50 rounded-xl border border-slate-700 animate-in fade-in slide-in-from-top-2">
                                        <div className="flex items-center gap-2 mb-2">
                                            <ShieldAlert size={12} className="text-amber-500" />
                                            <span className="text-[9px] font-black uppercase tracking-widest text-amber-500">Administrative Override Mode</span>
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                            <div className="sm:col-span-2">
                                                <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest ml-1">Full Name</label>
                                                <input
                                                    className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-xs font-bold text-white focus:ring-1 focus:ring-blue-500 outline-none uppercase"
                                                    value={editName}
                                                    onChange={e => setEditName(e.target.value)}
                                                />
                                            </div>
                                            <div>
                                                <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest ml-1">RC Number</label>
                                                <input
                                                    type="number"
                                                    className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-xs font-mono font-bold text-white focus:ring-1 focus:ring-blue-500 outline-none"
                                                    value={editCourse || ''}
                                                    onChange={e => {
                                                        const val = e.target.value;
                                                        if (val === '') {
                                                            setEditCourse(null);
                                                        } else {
                                                            setEditCourse(parseInt(val, 10));
                                                        }
                                                    }}
                                                />
                                            </div>
                                            <div>
                                                <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest ml-1">Assigned Squad</label>
                                                <input
                                                    className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-xs font-bold text-white focus:ring-1 focus:ring-blue-500 outline-none uppercase"
                                                    value={editSquad}
                                                    onChange={e => setEditSquad(e.target.value)}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        <h2 className="text-xl sm:text-2xl font-black tracking-tight">{cadet.name}</h2>
                                        <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 sm:gap-3">
                                            <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-[0.2em] text-blue-400">Regular Course {cadet.course_number}</span>
                                            <span className="hidden sm:inline-block w-1 h-1 bg-slate-700 rounded-full"></span>
                                            <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Squad {cadet.squad}</span>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                        <button onClick={onClose} className="absolute top-0 right-0 sm:relative p-2 hover:bg-white/10 rounded-full transition-colors text-slate-400 hover:text-white">
                            <X size={24} />
                        </button>
                    </div>

                    {/* Background Accents */}
                    <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
                    <div className="absolute bottom-0 left-0 w-32 h-32 bg-slate-400/5 rounded-full translate-y-1/2 -translate-x-1/2 blur-2xl" />
                </div>

                <div className="flex-1 overflow-y-auto p-4 sm:p-8 space-y-6 sm:space-y-8">
                    {isLoading ? (
                        <div className="py-20 flex flex-col items-center gap-4 text-slate-400">
                            <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                            <p className="text-xs font-black uppercase tracking-widest animate-pulse">Scanning Intelligence Database...</p>
                        </div>
                    ) : (
                        <div className="space-y-6 sm:space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                            {/* Institutional Standing Visualizer & Accountability Data Table */}
                            <div className="flex flex-col gap-y-12 mt-10">
                                {/* 1. Header & Progress Bar Section */}
                                <section className="space-y-4">
                                    <div className="flex justify-between items-end">
                                        <span className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">Institutional Standing</span>
                                        <span className="text-xl font-mono font-bold text-slate-700">{currentScore.toFixed(1)}%</span>
                                    </div>
                                    <div className="h-4 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                                        <div
                                            className={`h-full transition-all duration-1000 ease-out ${standing.bg} relative`}
                                            style={{ width: `${currentScore}%` }}
                                        >
                                            {/* Glossy overlay for a premium look */}
                                            <div className="absolute inset-0 bg-white/10 w-full h-1/2"></div>
                                        </div>
                                    </div>
                                </section>

                                {/* 2. Professional Metrics Table */}
                                <section className="rounded-lg border border-slate-200 overflow-hidden shadow-sm">
                                    <table className="w-full text-left">
                                        <thead className="bg-[#1e3a8a] text-white text-[10px] uppercase tracking-wider">
                                            <tr>
                                                <th className="p-4">Accountability Category</th>
                                                <th className="p-4">Metric</th>
                                                <th className="p-4">Assessment</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 text-sm">
                                            <tr className="bg-white">
                                                <td className="p-4 font-medium text-slate-600">Duty Attendance</td>
                                                <td className="p-4 font-mono">{attendanceScore}%</td>
                                                <td className={`p-4 font-bold ${getAttendanceAssessment(stats.absent, level).color}`}>
                                                    {getAttendanceAssessment(stats.absent, level).label}
                                                </td>
                                            </tr>
                                            <tr className="bg-slate-50/50">
                                                <td className="p-4 font-medium text-slate-600">Fitness Index</td>
                                                <td className="p-4 font-mono">{fitnessScore.toFixed(1)}%</td>
                                                <td className={`p-4 font-bold ${fitnessScore >= 95 ? 'text-blue-700' : (fitnessScore >= 80 ? 'text-emerald-600' : 'text-amber-600')}`}>
                                                    {getFitnessAssessment(fitnessScore)}
                                                </td>
                                            </tr>
                                            <tr className="bg-white">
                                                <td className="p-4 font-medium text-slate-600">Conduct & Discipline</td>
                                                <td className="p-4 font-mono text-slate-400 italic">
                                                    {stats.detention > 0 ? `${stats.detention} Infractions` : "NIL"}
                                                </td>
                                                <td className={`p-4 font-bold ${stats.detention === 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                                    {stats.detention === 0 ? "DISTINGUISHED" : "ACTION REQUIRED"}
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </section>
                            </div>

                            {/* Accountability Focus */}
                            <div className="p-5 sm:p-6 rounded-2xl sm:rounded-[2rem] bg-[#f8fafc] border border-slate-200 relative overflow-hidden group">
                                <div className="relative z-10">
                                    <h4 className="flex items-center gap-2 text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">
                                        <Calendar size={14} className="text-blue-500" />
                                        Last Recorded Accountability
                                    </h4>
                                    {stats.lastEvent ? (
                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-0">
                                            <div className="space-y-1">
                                                <p className="text-sm font-bold text-slate-800 capitalize">Incident: {stats.lastEvent.status}</p>
                                                <p className="text-xs text-slate-500">{new Date(stats.lastEvent.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} • {stats.lastEvent.type}</p>
                                            </div>
                                            <div className={`px-4 py-2 rounded-xl text-xs font-black border ${stats.lastEvent.status === 'absent' ? 'bg-rose-50 text-rose-600 border-rose-100' : 'bg-amber-50 text-amber-600 border-amber-100'}`}>
                                                FLAGGED
                                            </div>
                                        </div>
                                    ) : (
                                        <p className="text-sm font-bold text-emerald-600 flex items-center gap-2">
                                            <CheckCircle size={16} />
                                            No negative accountability events recorded.
                                        </p>
                                    )}
                                </div>
                                <div className="absolute top-0 right-0 w-24 h-24 bg-slate-200/20 rounded-full translate-x-1/2 -translate-y-1/2 group-hover:scale-150 transition-transform duration-700" />
                            </div>

                            {/* Command Assessment */}
                            <div className="mt-6 p-5 sm:p-6 border-l-4 border-slate-800 bg-[#f8fafc] rounded-r-2xl shadow-sm relative italic">
                                <h4 className="flex items-center gap-2 text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3">
                                    <TrendingUp size={14} className="text-blue-500" />
                                    Commandant's Assessment
                                </h4>
                                <p className="text-slate-600 leading-relaxed text-sm font-medium">
                                    "{getCommandantAssessment(currentScore, stats)}"
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Secure Actions */}
                <div className="p-4 sm:p-8 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center gap-4 shrink-0">
                    <button
                        onClick={exportToPDF}
                        disabled={isLoading || isEditing}
                        className="flex-1 w-full bg-[#0f172a] hover:bg-slate-800 text-white font-black py-4 sm:py-5 rounded-2xl transition-all shadow-xl flex items-center justify-center gap-2 sm:gap-3 group active:scale-[0.98] disabled:opacity-50"
                    >
                        <FileText size={18} className="sm:w-5 sm:h-5 group-hover:translate-y-[-2px] transition-transform" />
                        <span className="text-xs sm:text-sm uppercase tracking-widest leading-tight text-center">Generate<span className="hidden sm:inline"> Official</span> Dossier</span>
                    </button>

                    <button
                        onClick={() => isEditing ? setShowConfirm(true) : setIsEditing(true)}
                        disabled={isLoading}
                        className={`flex-1 w-full font-black py-4 sm:py-5 rounded-2xl transition-all border-2 flex items-center justify-center gap-2 sm:gap-3 group active:scale-[0.98] ${isEditing
                            ? 'bg-amber-500 border-amber-600 text-white hover:bg-amber-600'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                            }`}
                    >
                        {isEditing ? <Save size={18} /> : <Edit3 size={18} />}
                        <span className="text-xs sm:text-sm uppercase tracking-widest leading-tight text-center">
                            {isEditing ? 'Commit Changes' : 'Administrative Edit'}
                        </span>
                    </button>

                    {isEditing && (
                        <button
                            onClick={() => setIsEditing(false)}
                            className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-rose-600 transition-colors"
                        >
                            Cancel
                        </button>
                    )}
                </div>

                <SubmissionPreview
                    isOpen={showConfirm}
                    onClose={() => setShowConfirm(false)}
                    onConfirm={handleSave}
                    title="Confirm Master Registry Edit"
                    type="system"
                    data={{
                        officer: 'COMMANDANT',
                        action: 'MASTER_RECORD_STABILIZATION',
                        changes: [
                            { field: 'Name', from: cadet.name, to: editName },
                            { field: 'Squad', from: cadet.squad, to: editSquad },
                            { field: 'RC', from: cadet.course_number, to: editCourse }
                        ].filter(c => c.from !== c.to)
                    }}
                />
            </div>
        </div>
    );
};
