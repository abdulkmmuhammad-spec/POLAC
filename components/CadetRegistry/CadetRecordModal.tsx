import React, { useState, useEffect } from 'react';
import { X, FileText, TrendingUp, AlertCircle, CheckCircle, Shield, Calendar, User as UserIcon, Medal, BadgeAlert } from 'lucide-react';
import { dbService } from '../../services/dbService';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { toast } from 'react-hot-toast';

const logo = '/logo.png';

interface CadetRecordModalProps {
    cadet: any;
    activeRC: number;
    onClose: () => void;
}

export const CadetRecordModal: React.FC<CadetRecordModalProps> = ({ cadet, activeRC, onClose }) => {
    const [stats, setStats] = useState({ absent: 0, sick: 0, detention: 0, lastEvent: null as any });
    const [isLoading, setIsLoading] = useState(true);

    const level = cadet.course_number ? (activeRC - cadet.course_number + 1) : cadet.year_group;

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
        if (currentStats.absent > 8) punches.push("Persistent unauthorized absences are a primary concern.");
        if (currentStats.detention > 3) punches.push("Frequent disciplinary detentions indicate a failure to adhere to command hierarchy.");

        return punches.length > 0 ? `${narrative} ${punches.join(" ")}` : narrative;
    };

    const exportToPDF = () => {
        try {
            const doc = new jsPDF();
            const status = getStatusInfo(currentScore);
            const cadetName = cadet?.name || 'Unknown Cadet';

            // Formal Border
            doc.setDrawColor(20, 30, 60);
            doc.setLineWidth(0.5);
            doc.rect(10, 10, 190, 277);

            // Header - Blue Bar
            doc.setFillColor(30, 58, 138); // blue-900
            doc.rect(10, 10, 190, 40, 'F');

            // Add Logo
            try {
                doc.addImage(logo, 'PNG', 15, 15, 20, 20);
            } catch (e) {
                console.warn('Logo could not be added to PDF', e);
            }

            doc.setFontSize(22);
            doc.setTextColor(255);
            doc.setFont('helvetica', 'bold');
            doc.text('NIGERIAN POLICE ACADEMY', 110, 25, { align: 'center' });

            doc.setFontSize(10);
            doc.setFont('helvetica', 'normal');
            doc.text('OFFICE OF THE COMMANDANT • CADET PERFORMANCE DOSSIER', 110, 33, { align: 'center' });

            // Identification Section
            doc.setTextColor(0);
            doc.setFontSize(11);
            doc.setFont('helvetica', 'bold');
            doc.text('CADET IDENTIFICATION', 20, 65);
            doc.line(20, 67, 70, 67);

            doc.setFont('helvetica', 'normal');
            doc.text(`Full Name: ${cadetName.toUpperCase()}`, 20, 75);
            doc.text(`Regular Course: RC ${cadet.course_number || 'N/A'}`, 20, 83);
            doc.text(`Year Level: Year ${level}`, 20, 91);
            doc.text(`Assigned Squad: ${cadet.squad || 'N/A'}`, 20, 99);

            // Standing Label
            doc.setFont('helvetica', 'bold');
            doc.text('CURRENT STANDING:', 130, 75);
            doc.setFontSize(14);
            doc.text(status.label, 130, 83);

            // Draw Progress Bar Background
            doc.setFillColor(224, 224, 224); // Light Grey
            doc.roundedRect(20, 115, 170, 5, 2, 2, 'F');

            // Draw Fill based on score
            if (currentScore >= 89) doc.setFillColor(16, 185, 129);      // Emerald
            else if (currentScore >= 70) doc.setFillColor(37, 99, 235); // Blue
            else if (currentScore >= 50) doc.setFillColor(245, 158, 11); // Amber
            else doc.setFillColor(220, 38, 38);                  // Red

            const barWidth = (currentScore / 100) * 170;
            doc.roundedRect(20, 115, barWidth, 5, 2, 2, 'F');

            // Add text label
            doc.setFontSize(10);
            doc.setTextColor(80, 80, 80);
            doc.text(`Institutional Standing: ${currentScore.toFixed(1)}% (${status.label})`, 20, 110);

            // Stats Table
            autoTable(doc, {
                startY: 130, // Adjust this Y-value to prevent overlapping with the bar
                head: [['Accountability Category', 'Metric', 'Assessment']],
                body: [
                    ['Duty Attendance', `${(100 - (stats.absent * 0.5)).toFixed(1)}%`, stats.absent === 0 ? 'Exemplary' : 'Needs Attention'],
                    ['Fitness Index', `${calculateFitness(stats.sick || 0, level).toFixed(1)}%`, getFitnessAssessment(calculateFitness(stats.sick || 0, level))],
                    ['Conduct & Discipline', stats.detention > 0 ? `${stats.detention} Infractions` : 'NIL', stats.detention === 0 ? 'Distinguished' : 'Action Required']
                ],
                headStyles: { fillColor: [30, 58, 138] }, // Navy Blue to match Academy branding
                theme: 'striped',
                margin: { left: 20, right: 20 }
            });

            const currentY = (doc as any).lastAutoTable.finalY + 15;

            // Last Event
            if (stats.lastEvent) {
                doc.setFontSize(11);
                doc.setFont('helvetica', 'bold');
                doc.text('MOST RECENT INCIDENT:', 20, currentY);
                doc.setFont('helvetica', 'normal');
                doc.text(`${stats.lastEvent.status.toUpperCase()} recorded on ${new Date(stats.lastEvent.date).toLocaleDateString()} (${stats.lastEvent.type})`, 20, currentY + 8);
            }

            // Command Assessment
            const assessmentY = stats.lastEvent ? currentY + 25 : currentY + 10;
            doc.setFontSize(11);
            doc.setFont('helvetica', 'bold');
            doc.text("COMMANDANT'S ASSESSMENT:", 20, assessmentY);
            doc.setFont('times', 'italic');
            doc.setFontSize(11);
            const assessmentText = getCommandantAssessment(currentScore, stats);
            const splitAssessment = doc.splitTextToSize(assessmentText, 170);
            doc.text(splitAssessment, 20, assessmentY + 8);

            // Signature
            doc.setFontSize(10);
            doc.text('__________________________', 140, 260);
            doc.text('Commandant Signature', 140, 265);
            doc.text('Security ID: ' + Math.random().toString(36).substring(7).toUpperCase(), 140, 271);

            // Footer
            doc.setFontSize(8);
            doc.setTextColor(150);
            doc.text(`CONFIDENTIAL DOCUMENT • GENERATED ${new Date().toLocaleString()} • POLAC CMS V2`, 105, 282, { align: 'center' });

            doc.save(`${cadetName.replace(/\s+/g, '_')}_Dossier.pdf`);
            toast.success('Professional Dossier Exported');
        } catch (err) {
            console.error('PDF Export Error:', err);
            toast.error('Failed to export PDF');
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
                            <div className="space-y-1">
                                <h2 className="text-xl sm:text-2xl font-black tracking-tight">{cadet.name}</h2>
                                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 sm:gap-3">
                                    <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-[0.2em] text-blue-400">Regular Course {cadet.course_number}</span>
                                    <span className="hidden sm:inline-block w-1 h-1 bg-slate-700 rounded-full"></span>
                                    <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Squad {cadet.squad}</span>
                                </div>
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
                                                <td className={`p-4 font-bold ${stats.absent === 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
                                                    {stats.absent === 0 ? 'EXEMPLARY' : 'NEEDS ATTENTION'}
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
                <div className="p-4 sm:p-8 bg-slate-50 border-t border-slate-200 flex items-center gap-4 shrink-0">
                    <button
                        onClick={exportToPDF}
                        disabled={isLoading}
                        className="flex-1 bg-[#0f172a] hover:bg-slate-800 text-white font-black py-4 sm:py-5 rounded-2xl transition-all shadow-xl flex items-center justify-center gap-2 sm:gap-3 group active:scale-[0.98] disabled:opacity-50"
                    >
                        <FileText size={18} className="sm:w-5 sm:h-5 group-hover:translate-y-[-2px] transition-transform" />
                        <span className="text-xs sm:text-sm uppercase tracking-widest leading-tight text-center">Generate<span className="hidden sm:inline"> Official</span> Dossier</span>
                    </button>

                </div>
            </div>
        </div>
    );
};
