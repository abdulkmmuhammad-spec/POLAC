import React, { useState, useEffect } from 'react';
import { X, FileText, TrendingUp, AlertCircle, CheckCircle, Shield, Calendar, User as UserIcon, Medal, BadgeAlert } from 'lucide-react';
import { dbService } from '../../services/dbService';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { toast } from 'react-hot-toast';
import logo from '../../download.jpg';

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

    const getStatusInfo = () => {
        const { absent, detention } = stats;
        if (detention > 5 || absent > 10) return { label: 'CRITICAL', color: 'text-rose-600 bg-rose-50 border-rose-100', icon: <BadgeAlert size={14} /> };
        if (detention > 2 || absent > 5) return { label: 'UNDER REVIEW', color: 'text-amber-600 bg-amber-50 border-amber-100', icon: <AlertCircle size={14} /> };
        return { label: 'EXEMPLARY', color: 'text-emerald-600 bg-emerald-50 border-emerald-100', icon: <Medal size={14} /> };
    };

    const getPerformanceComment = () => {
        const { absent, sick, detention } = stats;
        let comments = [];

        if (absent === 0 && detention === 0) comments.push("This cadet maintains an outstanding record of discipline and presence.");
        else if (absent <= 3 && detention === 0) comments.push("Performance is highly satisfactory with minor attendance gaps.");
        else if (detention > 0) comments.push(`Disciplinary concerns noted with ${detention} recorded detentions.`);

        if (absent > 7) comments.push("Urgent review required due to persistent unauthorized absences.");
        if (sick > 12) comments.push("Review of medical fitness is recommended given recurrent illness reports.");

        return comments.length > 0 ? comments.join(' ') : "Cadet performance is within expected academy standards.";
    };

    const exportToPDF = () => {
        try {
            const doc = new jsPDF();
            const status = getStatusInfo();
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
                doc.addImage(logo, 'JPEG', 15, 15, 20, 20);
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

            // Stats Table
            autoTable(doc, {
                startY: 110,
                head: [['Accountability Category', 'Total Count', 'Command Assessment']],
                body: [
                    ['Unauthorized Absences', stats.absent, stats.absent > 5 ? 'NEEDS ATTENTION' : 'SATISFACTORY'],
                    ['Medical / Sick Reports', stats.sick, stats.sick > 10 ? 'REVIEW REQUIRED' : 'NORMAL'],
                    ['Disciplinary Detentions', stats.detention, stats.detention > 0 ? 'CORRECTIVE ACTION' : 'CLEAN RECORD'],
                ],
                theme: 'striped',
                headStyles: { fillColor: [30, 58, 138] },
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
            doc.text('AUTOMATED COMMAND ASSESSMENT:', 20, assessmentY);
            doc.setFont('helvetica', 'normal');
            const splitComment = doc.splitTextToSize(getPerformanceComment(), 170);
            doc.text(splitComment, 20, assessmentY + 8);

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



    const standing = getStatusInfo();

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md animate-in fade-in duration-300">
            <div className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-300 flex flex-col max-h-[90vh]">
                {/* Premium Header */}
                <div className="bg-[#0f172a] text-white p-8 relative overflow-hidden shrink-0">
                    <div className="relative z-10 flex items-start justify-between">
                        <div className="flex gap-6">
                            <div className="relative">
                                <div className="w-24 h-24 rounded-2xl bg-slate-800 border-2 border-slate-700 flex items-center justify-center overflow-hidden shadow-2xl">
                                    <UserIcon size={48} className="text-slate-600" />
                                </div>
                                <div className="absolute -bottom-2 -right-2 w-10 h-10 rounded-xl bg-blue-600 border-4 border-[#0f172a] flex items-center justify-center shadow-lg">
                                    <img src={logo} alt="Academy Logo" className="w-6 h-6 object-contain" />
                                </div>
                            </div>
                            <div className="space-y-1">
                                <h2 className="text-2xl font-black tracking-tight">{cadet.name}</h2>
                                <div className="flex items-center gap-3">
                                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-400">Regular Course {cadet.course_number}</span>
                                    <span className="w-1 h-1 bg-slate-700 rounded-full"></span>
                                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Squad {cadet.squad}</span>
                                </div>
                                <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border text-[10px] font-black mt-2 ${standing.color}`}>
                                    {standing.icon}
                                    {standing.label}
                                </div>
                            </div>
                        </div>
                        <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors text-slate-400 hover:text-white">
                            <X size={24} />
                        </button>
                    </div>

                    {/* Background Accents */}
                    <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
                    <div className="absolute bottom-0 left-0 w-32 h-32 bg-slate-400/5 rounded-full translate-y-1/2 -translate-x-1/2 blur-2xl" />
                </div>

                <div className="flex-1 overflow-y-auto p-8 space-y-8">
                    {isLoading ? (
                        <div className="py-20 flex flex-col items-center gap-4 text-slate-400">
                            <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                            <p className="text-xs font-black uppercase tracking-widest animate-pulse">Scanning Intelligence Database...</p>
                        </div>
                    ) : (
                        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                            {/* Stats Cards */}
                            <div className="grid grid-cols-3 gap-4">
                                <div className="p-5 rounded-3xl bg-slate-50 border border-slate-100 flex flex-col group hover:border-blue-200 hover:bg-blue-50/30 transition-all">
                                    <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                                        <CheckCircle size={16} />
                                    </div>
                                    <span className="text-3xl font-black text-slate-900">{stats.absent}</span>
                                    <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest mt-1">Absences</span>
                                </div>
                                <div className="p-5 rounded-3xl bg-slate-50 border border-slate-100 flex flex-col group hover:border-blue-200 hover:bg-blue-50/30 transition-all">
                                    <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                                        <Medal size={16} />
                                    </div>
                                    <span className="text-3xl font-black text-slate-900">{stats.sick}</span>
                                    <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest mt-1">Medical</span>
                                </div>
                                <div className="p-5 rounded-3xl bg-slate-50 border border-slate-100 flex flex-col group hover:border-blue-200 hover:bg-blue-50/30 transition-all">
                                    <div className="w-8 h-8 rounded-lg bg-rose-100 text-rose-600 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                                        <Shield size={16} />
                                    </div>
                                    <span className="text-3xl font-black text-slate-900">{stats.detention}</span>
                                    <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest mt-1">Detention</span>
                                </div>
                            </div>

                            {/* Accountability Focus */}
                            <div className="p-6 rounded-[2rem] bg-[#f8fafc] border border-slate-200 relative overflow-hidden group">
                                <div className="relative z-10">
                                    <h4 className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">
                                        <Calendar size={14} className="text-blue-500" />
                                        Last Recorded Accountability
                                    </h4>
                                    {stats.lastEvent ? (
                                        <div className="flex items-center justify-between">
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
                            <div className="space-y-3">
                                <h4 className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] px-2">
                                    <TrendingUp size={14} className="text-blue-500" />
                                    Command Assessment
                                </h4>
                                <div className="p-6 rounded-[2rem] bg-white border-2 border-slate-100 shadow-sm relative italic">
                                    <p className="text-slate-600 leading-relaxed text-sm font-medium">
                                        "{getPerformanceComment()}"
                                    </p>
                                    <div className="absolute -top-3 -right-3 w-10 h-10 bg-[#0f172a] rounded-xl flex items-center justify-center text-white text-lg font-black italic">!</div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Secure Actions */}
                <div className="p-8 bg-slate-50 border-t border-slate-200 flex items-center gap-4 shrink-0">
                    <button
                        onClick={exportToPDF}
                        disabled={isLoading}
                        className="flex-1 bg-[#0f172a] hover:bg-slate-800 text-white font-black py-5 rounded-2xl transition-all shadow-xl flex items-center justify-center gap-3 group active:scale-[0.98] disabled:opacity-50"
                    >
                        <FileText size={20} className="group-hover:translate-y-[-2px] transition-transform" />
                        <span className="text-sm uppercase tracking-widest">Generate Official Dossier</span>
                    </button>

                </div>
            </div>
        </div>
    );
};
