import React, { useState, useEffect, useRef } from 'react';
import { X, FileText, TrendingUp, AlertCircle, CheckCircle, Shield, User as UserIcon, Medal, BadgeAlert, History, Camera, Loader2, Edit3, Save, ShieldAlert, Download } from 'lucide-react';
import { dbService, supabase } from '../../services/dbService';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { toast } from 'react-hot-toast';
import { SubmissionPreview } from '../Common/SubmissionPreview';
import { calculateCurrentLevel } from '../../utils/rcHelpers';
import { useAuth } from '../../context/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';

const logo = '/logo.png';

interface CadetRecordModalProps {
    cadet: any;
    activeRC: number;
    onClose: () => void;
    initialPreviewMode?: boolean;
}

export const CadetRecordModal: React.FC<CadetRecordModalProps> = ({ cadet, activeRC, onClose, initialPreviewMode }) => {
    const { currentUser } = useAuth();
    const fileInputRef = useRef<HTMLInputElement>(null);
    
    const [stats, setStats] = useState({ absent: 0, sick: 0, detention: 0, lastEvent: null as any });
    const [alertHistory, setAlertHistory] = useState<any[]>([]);
    const [absenceTrace, setAbsenceTrace] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isUploading, setIsUploading] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [mobileTab, setMobileTab] = useState<'identity' | 'metrics' | 'history'>('identity');
    
    // Dismissal States
    const [showDismissal, setShowDismissal] = useState(false);
    const [dismissalReason, setDismissalReason] = useState('');
    const [dismissalAuthority, setDismissalAuthority] = useState('');
    const [dismissalConfirmText, setDismissalConfirmText] = useState('');
    const [dismissalAudit, setDismissalAudit] = useState<any>(null);
    const [logoBase64, setLogoBase64] = useState<string | null>(null);

    // Controlled Fields
    const [editName, setEditName] = useState(cadet.name);
    const [editSquad, setEditSquad] = useState(cadet.squad);
    const [editCourse, setEditCourse] = useState(cadet.course_number);
    const [avatarUrl, setAvatarUrl] = useState(cadet.avatar_url);

    // Preview state
    const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);
    const hasTriggeredPreview = useRef(false);

    const level = cadet.course_number ? (activeRC - cadet.course_number + 1) : cadet.year_group;

    useEffect(() => {
        const loadLogo = async () => {
            try {
                const response = await fetch(logo);
                const blob = await response.blob();
                const reader = new FileReader();
                reader.onloadend = () => {
                    setLogoBase64(reader.result as string);
                };
                reader.readAsDataURL(blob);
            } catch (err) {
                console.warn('Failed to preload logo', err);
            }
        };
        loadLogo();
    }, []);

    // Generate preview once logo and data are loaded
    useEffect(() => {
        if (initialPreviewMode && logoBase64 && !isLoading && !hasTriggeredPreview.current) {
            hasTriggeredPreview.current = true;
            exportToPDF(true);
        }
    }, [initialPreviewMode, logoBase64, isLoading]);

    useEffect(() => {
        setEditName(cadet.name);
        setEditSquad(cadet.squad);
        setEditCourse(cadet.course_number);
        setAvatarUrl(cadet.avatar_url);
    }, [cadet]);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const data = await dbService.getCadetStats(cadet.name);
                setStats(data);

                const { data: alerts } = await supabase
                    .from('cadet_alerts')
                    .select('*')
                    .eq('cadet_name', cadet.name)
                    .order('created_at', { ascending: false });
                setAlertHistory(alerts || []);

                const { data: traces } = await supabase
                    .from('cadet_details')
                    .select(`
                      status,
                      parade_records (date, parade_type, created_at)
                    `)
                    .eq('name', cadet.name);

                if (traces) {
                    const flatTraces = traces
                        .filter((t: any) => t.status?.toLowerCase() !== 'present')
                        .map((t: any) => ({
                            status: t.status,
                            date: Array.isArray(t.parade_records) ? t.parade_records[0]?.date : (t.parade_records as any)?.date,
                            type: Array.isArray(t.parade_records) ? t.parade_records[0]?.parade_type : (t.parade_records as any)?.parade_type,
                            created_at: Array.isArray(t.parade_records) ? t.parade_records[0]?.created_at : (t.parade_records as any)?.created_at
                        }))
                        .filter((t: any) => t.date)
                        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
                    setAbsenceTrace(flatTraces);
                }

                if (cadet.status === 'DISMISSED') {
                    const { data: auditData } = await supabase
                        .from('audit_events')
                        .select('*')
                        .eq('action_type', 'CADET_DISMISSAL')
                        .eq('target_id', cadet.id)
                        .order('created_at', { ascending: false })
                        .limit(1)
                        .single();
                    if (auditData) setDismissalAudit(auditData);
                }
            } catch (err) {
                console.error('Failed to load stats', err);
            } finally {
                setIsLoading(false);
            }
        };
        fetchData();
    }, [cadet.name]);

    const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsUploading(true);
        const loadingToast = toast.loading('Uploading official photograph...');
        
        try {
            const { publicUrl, error } = await dbService.uploadCadetPhoto(cadet.id, file);
            if (error) throw error;

            // Update Database Registry
            await dbService.updateCadetRegistry(cadet.id, { ...cadet, avatar_url: publicUrl }, currentUser!);
            
            setAvatarUrl(publicUrl);
            toast.success('Cadet photograph synchronized successfully.');
        } catch (err: any) {
            toast.error('Uplink failed: ' + (err.message || 'Check storage permissions.'));
        } finally {
            setIsUploading(false);
            toast.dismiss(loadingToast);
        }
    };

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

    const getAttendanceAssessment = (absences: number, yearLevel: number) => {
        const exemplaryLimit = Math.round(yearLevel * 6.5);
        const satisfactoryLimit = Math.round(yearLevel * 15);
        if (absences <= exemplaryLimit) return { label: 'EXEMPLARY', color: 'text-emerald-600' };
        if (absences <= satisfactoryLimit) return { label: 'SATISFACTORY', color: 'text-blue-600' };
        return { label: 'UNDER REVIEW', color: 'text-rose-700' };
    };

    const currentScore = calculateStandingScore(stats.absent, stats.detention);
    const standing = (() => {
        if (currentScore >= 89) return { label: 'EXEMPLARY', color: 'text-emerald-600', bg: 'bg-emerald-600', icon: <Medal size={14} /> };
        if (currentScore >= 70) return { label: 'SATISFACTORY', color: 'text-blue-600', bg: 'bg-blue-600', icon: <CheckCircle size={14} /> };
        if (currentScore >= 50) return { label: 'UNDER REVIEW', color: 'text-amber-600', bg: 'bg-amber-600', icon: <AlertCircle size={14} /> };
        return { label: 'CRITICAL', color: 'text-rose-600', bg: 'bg-rose-600', icon: <BadgeAlert size={14} /> };
    })();

    const handleSave = async () => {
        setIsLoading(true);
        try {
            const { error } = await dbService.updateCadetRegistry(cadet.id, {
                name: editName,
                squad: editSquad,
                course_number: editCourse
            }, currentUser!);
            if (error) throw error;
            toast.success('Cadet records updated.');
            setIsEditing(false);
            setShowConfirm(false);
        } catch (err: any) {
            toast.error(`Save failed: ${err.message || 'Network disconnected'}`);
        } finally {
            setIsLoading(false);
        }
    };

    const handleDismissal = async () => {
        if (dismissalConfirmText.trim().toUpperCase() !== `DISMISS ${cadet.course_number || activeRC}`.toUpperCase()) {
            toast.error('Confirmation phrase mismatch.');
            return;
        }
        if (!dismissalReason.trim() || !dismissalAuthority.trim()) {
            toast.error('Reason and Authority Reference are required.');
            return;
        }
        setIsLoading(true);
        try {
            const { error } = await dbService.dismissCadetV2(
                cadet.id,
                `${dismissalReason.trim()} (Authority: ${dismissalAuthority.trim()})`,
                '', // Bypass ghost session ID mapping to prevent strict FK violations
                currentUser!.fullName || currentUser!.username
            );
            if (error) throw error;
            
            toast.success('Cadet formally dismissed.');
            window.dispatchEvent(new Event('cadet-registry-updated'));
            setShowDismissal(false);
            onClose(); // Close modal to refresh list in parent
        } catch (err: any) {
            console.error(err);
            toast.error(`Failed: ${err.message || 'Cannot reach database.'}`);
        } finally {
            setIsLoading(false);
        }
    };

    const exportToPDF = (previewOnly = false) => {
        const toastId = !previewOnly ? toast.loading('Synthesizing Official Dossier...') : undefined;
        try {
            const doc = new jsPDF();
            const status = standing;
            const cadetName = cadet?.name || 'Unknown Cadet';
            
            const generateAuditId = () => {
                try {
                    return crypto.randomUUID().toUpperCase();
                } catch (e) {
                    return 'CR-' + Date.now().toString(36).toUpperCase();
                }
            };

            const auditId = generateAuditId();

            // 1. Formal Border & Authority Header
            doc.setDrawColor(30, 58, 138); 
            doc.setLineWidth(1);
            doc.rect(5, 5, 200, 287);

            doc.setFillColor(15, 23, 42); // Slate 900
            doc.rect(10, 10, 190, 40, 'F');

            if (logoBase64) {
                try {
                    doc.addImage(logoBase64, 'PNG', 15, 15, 30, 30);
                } catch (e) { console.warn('Logo missing', e); }
            }

            doc.setFontSize(22);
            doc.setTextColor(255);
            doc.setFont('helvetica', 'bold');
            doc.text('NIGERIAN POLICE ACADEMY', 110, 25, { align: 'center' });
            
            doc.setFontSize(10);
            doc.setFont('helvetica', 'normal');
            doc.text('OFFICE OF THE COMMANDANT • TAC-REPORT V4.0', 110, 32, { align: 'center' });
            doc.text(`AUDIT_ID: ${auditId} | AUTHORITATIVE_FILE`, 110, 38, { align: 'center' });

            // 2. Identification Block (with Photo if available)
            doc.setTextColor(15, 23, 42);
            doc.setFontSize(14);
            doc.setFont('helvetica', 'bold');
            doc.text('I. PERSONNEL IDENTIFICATION', 20, 65);
            doc.line(20, 67, 100, 67);

            if (avatarUrl) {
                try {
                    doc.rect(140, 60, 50, 60);
                    doc.setFontSize(8);
                    doc.text('OFFICIAL PHOTO', 165, 90, { align: 'center' });
                } catch (e) { console.warn('Photo skip'); }
            } else {
                doc.rect(140, 60, 50, 60);
                doc.setFontSize(8);
                doc.text('PHOTO_PENDING', 165, 90, { align: 'center' });
            }

            doc.setFontSize(11);
            doc.setFont('helvetica', 'bold');
            doc.text(`NAME: ${cadetName.toUpperCase()}`, 25, 78);
            doc.setFont('helvetica', 'normal');
            doc.text(`RC: REGULAR COURSE ${cadet.course_number}`, 25, 86);
            doc.text(`SQUAD: ${cadet.squad?.toUpperCase()}`, 25, 94);
            doc.text(`STANDING: ${status.label}`, 25, 102);

            // 3. Performance Metrics Table
            autoTable(doc, {
                startY: 130,
                head: [['Accountability Category', 'Metric Index', 'Institutional Assessment']],
                body: [
                    ['Duty Attendance', `${(100 - (stats.absent * 0.5)).toFixed(1)}%`, getAttendanceAssessment(stats.absent, level).label],
                    ['Fitness Index', `${calculateFitness(stats.sick, level).toFixed(1)}%`, getFitnessAssessment(calculateFitness(stats.sick, level))],
                    ['Disciplinary Record', stats.detention > 0 ? `${stats.detention} INFRACTIONS` : 'DISTINGUISHED', stats.detention === 0 ? 'NIL' : 'ACTION_REQUIRED']
                ],
                headStyles: { fillColor: [15, 23, 42], fontSize: 10, fontStyle: 'bold' },
                styles: { fontSize: 10, cellPadding: 5 },
                alternateRowStyles: { fillColor: [248, 250, 252] },
                didDrawPage: function (data) {
                    if (cadet.status === 'DISMISSED') {
                        doc.setTextColor(230, 230, 230);
                        doc.setFontSize(50);
                        doc.text('DISMISSED - NOT FOR ACTIVE DUTY', 30, 200, { angle: 45 });
                        doc.setTextColor(15, 23, 42); // Reset color
                    }
                }
            });

            // 4. Command Assessment
            const finalY = (doc as any).lastAutoTable.finalY + 20;
            doc.setFont('helvetica', 'bold');
            doc.text("II. COMMANDANT'S ASSESSMENT", 20, finalY);
            doc.setFont('times', 'italic');
            doc.setFontSize(12);
            doc.setTextColor(70);
            const assessment = status.label === 'EXEMPLARY' 
                ? "This cadet represents the highest institutional standard of discipline. Maintain current trajectory."
                : "Administrative oversight is required to reconcile deviations in accountability.";
            const splitContent = doc.splitTextToSize(`"${assessment}"`, 170);
            doc.text(splitContent, 20, finalY + 10);

            // 5. Audit Trail & Sign-off
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8);
            doc.setTextColor(150);
            doc.text(`VALIDATED SECURE_ID: ${auditId}`, 20, 275);
            doc.text(`GENERATED: ${new Date().toLocaleString()} | NPA_FORENSIC_CMS`, 20, 280);

            doc.text('__________________________', 140, 270);
            doc.text('OFFICE OF THE COMMANDANT', 140, 275);

            if (previewOnly) {
                const blobUrl = doc.output('bloburl');
                setPreviewPdfUrl(blobUrl.toString());
            } else {
                doc.save(`${cadetName.replace(/\s+/g, '_')}_AUTHORITATIVE_DOSSIER.pdf`);
                toast.success('Dossier Synchronized.', { id: toastId });

                dbService.addNotification({
                    type: 'system',
                    title: 'Official Dossier Produced',
                    content: `Commandant Dossier generated for Cadet ${cadetName} (Audit ID: ${auditId})`,
                    timestamp: new Date().toISOString(),
                    read: false,
                    officerName: 'COMMANDANT',
                    yearGroup: 5,
                    courseNumber: cadet.course_number || activeRC
                }).catch(notifyErr => {
                    console.warn('Failed to add notification for dossier generation', notifyErr);
                });
            }
            
        } catch (err: any) {
            console.error('PDF Generation Error:', err);
            if (!previewOnly) {
                toast.error(`Synthesis Failed: ${err.message || 'Check console'}`, { id: toastId });
            }
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/90 backdrop-blur-xl animate-in fade-in duration-300">
            <div className="bg-white w-full max-w-6xl rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-200 flex flex-col max-h-[90vh]">
                
                {/* Header (Condensed) */}
                <div className="bg-[#0f172a] text-white px-8 py-6 relative overflow-hidden shrink-0">
                    <div className="flex justify-between items-center relative z-10">
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg overflow-hidden shrink-0">
                                <img src={logo} alt="NPA" className="w-[75%] h-[75%] object-contain block" />
                            </div>
                            <div>
                                <h2 className="text-lg font-black tracking-tight uppercase">Performance Dossier</h2>
                                <p className="text-[9px] font-bold text-slate-400 tracking-[0.3em] uppercase opacity-60">Authoritative Administrative View</p>
                            </div>
                        </div>
                        <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors text-slate-400 hover:text-white">
                            <X size={24} />
                        </button>
                    </div>
                </div>

                {previewPdfUrl ? (
                    <div className="flex-1 flex flex-col min-h-0 bg-slate-100">
                        <iframe src={previewPdfUrl} className="w-full flex-1 min-h-[60vh] border-0" title="PDF Preview" />
                        <div className="p-4 bg-white border-t flex justify-end gap-3 shrink-0">
                            <button onClick={() => setPreviewPdfUrl(null)} className="px-6 py-3 rounded-xl text-[11px] font-black uppercase text-slate-600 hover:bg-slate-100 border border-slate-200">Back to Profile</button>
                            <button onClick={() => exportToPDF(false)} className="px-6 py-3 rounded-xl text-[11px] font-black uppercase bg-blue-600 text-white hover:bg-blue-700 flex items-center gap-2 shadow-sm"><Download size={16}/> Download Authoritative Copy</button>
                        </div>
                    </div>
                ) : (
                    <>
                {cadet.status === 'DISMISSED' && (
                    <div className="bg-rose-900/10 border-b border-rose-900/20 px-8 py-3 flex items-center justify-center gap-3 backdrop-blur-md shrink-0">
                        <BadgeAlert size={16} className="text-rose-600" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-rose-700">Record Closed • Cadet Dismissed from Academy</span>
                    </div>
                )}

                {/* Mobile Tabs */}
                <div className="lg:hidden px-8 pt-4 shrink-0">
                    <div className="flex bg-slate-100 p-1 rounded-xl">
                        <button onClick={() => setMobileTab('identity')} className={`flex-1 py-2 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all ${mobileTab === 'identity' ? 'bg-white shadow-sm text-blue-700' : 'text-slate-500 hover:text-slate-800'}`}>Identity</button>
                        <button onClick={() => setMobileTab('metrics')} className={`flex-1 py-2 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all ${mobileTab === 'metrics' ? 'bg-white shadow-sm text-blue-700' : 'text-slate-500 hover:text-slate-800'}`}>Metrics</button>
                        <button onClick={() => setMobileTab('history')} className={`flex-1 py-2 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all ${mobileTab === 'history' ? 'bg-white shadow-sm text-blue-700' : 'text-slate-500 hover:text-slate-800'}`}>History</button>
                    </div>
                </div>

                {/* Main 3-Column Content (High Density) */}
                <div className="flex-1 overflow-y-auto p-8 pt-4 lg:pt-6">
                    <div className="grid grid-cols-12 gap-8">
                        
                        {/* COL 1: IDENTITY & STANDING (3/12) */}
                        <div className={`col-span-12 lg:col-span-3 space-y-6 ${mobileTab === 'identity' ? 'block' : 'hidden lg:block'}`}>
                            <div className="relative group mx-auto lg:mx-0 w-48 h-48 lg:w-full lg:h-64 rounded-3xl bg-slate-100 border-2 border-slate-200 overflow-hidden shadow-inner">
                                {avatarUrl ? (
                                    <img src={avatarUrl} alt={cadet.name} className="w-full h-full object-cover transition-transform group-hover:scale-110" />
                                ) : (
                                    <div className="w-full h-full flex flex-col items-center justify-center text-slate-300">
                                        <UserIcon size={64} strokeWidth={1} />
                                        <p className="text-[10px] font-black uppercase tracking-widest mt-2">No Photo On Record</p>
                                    </div>
                                )}
                                
                                <div 
                                    onClick={() => fileInputRef.current?.click()}
                                    className="absolute inset-0 bg-blue-900/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center cursor-pointer backdrop-blur-sm"
                                >
                                    {isUploading ? <Loader2 size={32} className="animate-spin text-white" /> : <Camera size={32} className="text-white" />}
                                    <span className="text-white text-[10px] font-black uppercase tracking-widest mt-2">Upload Identification</span>
                                </div>
                                <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handlePhotoUpload} />
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Cadet Identity</p>
                                    <h3 className="text-xl font-black text-slate-800 leading-tight uppercase">{cadet.name}</h3>
                                    <div className="flex items-center gap-2 mt-2">
                                        <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-[10px] font-black rounded border border-blue-100 uppercase">RC {cadet.course_number}</span>
                                        <span className="px-2 py-0.5 bg-slate-50 text-slate-600 text-[10px] font-black rounded border border-slate-100 uppercase">{cadet.squad}</span>
                                    </div>
                                </div>

                                <div className={`p-4 rounded-2xl border ${standing.bg.replace('bg-', 'bg-')}/5 ${standing.color.replace('text-', 'border-')}/20 flex flex-col items-center text-center`}>
                                    <div className={`w-12 h-12 rounded-full ${standing.bg} text-white flex items-center justify-center mb-2 shadow-lg`}>
                                        {standing.icon}
                                    </div>
                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Standing Status</p>
                                    <p className={`text-lg font-black uppercase ${standing.color}`}>{standing.label}</p>
                                </div>
                            </div>
                        </div>

                        {/* COL 2: METRICS & ASSESSMENT (5/12) */}
                        <div className={`col-span-12 lg:col-span-5 space-y-6 ${mobileTab === 'metrics' ? 'block' : 'hidden lg:block'}`}>
                            <section className="bg-slate-50 border border-slate-200 rounded-3xl p-6">
                                <div className="flex justify-between items-end mb-4">
                                    <h4 className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                        <TrendingUp size={14} className="text-blue-500" />
                                        Performance Index
                                    </h4>
                                    <span className="text-2xl font-mono font-black text-slate-700">{currentScore.toFixed(1)}%</span>
                                </div>
                                <div className="h-4 w-full bg-white rounded-full overflow-hidden border border-slate-200 relative mb-6">
                                    <motion.div
                                        initial={{ width: 0 }}
                                        animate={{ width: `${currentScore}%` }}
                                        className={`h-full ${standing.bg} relative`}
                                    >
                                        <div className="absolute inset-0 bg-gradient-to-r from-white/10 to-transparent" />
                                    </motion.div>
                                </div>

                                <div className="rounded-2xl border border-slate-200 overflow-hidden bg-white">
                                    <table className="w-full text-left text-xs">
                                        <thead className="bg-slate-800 text-white font-black uppercase tracking-widest text-[8px]">
                                            <tr>
                                                <th className="p-3">Category</th>
                                                <th className="p-3">Index</th>
                                                <th className="p-3">Assessment</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 font-bold">
                                            <tr>
                                                <td className="p-3 text-slate-500 uppercase">Attendance</td>
                                                <td className="p-3 font-mono">{(100 - (stats.absent * 0.5)).toFixed(1)}%</td>
                                                <td className={`p-3 ${getAttendanceAssessment(stats.absent, level).color}`}>{getAttendanceAssessment(stats.absent, level).label}</td>
                                            </tr>
                                            <tr>
                                                <td className="p-3 text-slate-500 uppercase">Fitness</td>
                                                <td className="p-3 font-mono">{calculateFitness(stats.sick, level).toFixed(1)}%</td>
                                                <td className="p-3 text-blue-600">{getFitnessAssessment(calculateFitness(stats.sick, level))}</td>
                                            </tr>
                                            <tr>
                                                <td className="p-3 text-slate-500 uppercase">Conduct</td>
                                                <td className="p-3 font-mono">{stats.detention > 0 ? stats.detention : 'NIL'}</td>
                                                <td className={`p-3 ${stats.detention === 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{stats.detention === 0 ? 'DISTINGUISHED' : 'REVIEW REQ'}</td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </section>

                            <section className="p-6 bg-[#f8fafc] border-l-4 border-slate-800 rounded-r-2xl h-fit">
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                                    <Shield size={12} className="text-slate-800" />
                                    Commandant's Institutional Assessment
                                </p>
                                <p className="text-sm font-medium text-slate-600 italic leading-relaxed">
                                    "{standing.label === 'EXEMPLARY' 
                                        ? "This cadet represents the highest institutional standard of discipline and reliability. Maintain current trajectory."
                                        : "Administrative oversight is required to reconcile deviations in accountability. High-frequency monitoring advised."}"
                                </p>
                            </section>
                        </div>

                        {/* COL 3: FORENSIC HISTORY (4/12) */}
                        <div className={`col-span-12 lg:col-span-4 space-y-4 h-full flex flex-col ${mobileTab === 'history' ? 'flex' : 'hidden lg:flex'}`}>
                            <div className="flex-1 bg-white border border-slate-200 rounded-3xl p-5 flex flex-col min-h-[300px]">
                                <h4 className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">
                                    <History size={14} className="text-blue-500" />
                                    Accountability Trace
                                </h4>
                                <div className="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
                                    {cadet.status === 'DISMISSED' && dismissalAudit && (
                                        <div className="p-3 bg-rose-50 rounded-xl border border-rose-200 flex justify-between items-center z-10 relative">
                                            <div>
                                                <p className="text-[10px] font-black text-rose-800 uppercase tracking-tight">DISMISSED</p>
                                                <p className="text-[8px] font-bold text-rose-600 uppercase">AUTH: {dismissalAudit.actor_name}</p>
                                                <p className="text-[8px] text-rose-500 mt-1 italic max-w-[150px] truncate">{dismissalAudit.payload?.reason}</p>
                                            </div>
                                            <div className="text-right flex flex-col items-end">
                                                <p className="text-[9px] font-mono font-bold text-rose-700">{new Date(dismissalAudit.created_at).toLocaleDateString()}</p>
                                                <span className="text-[7px] font-black bg-rose-200 text-rose-800 px-1 rounded uppercase mt-1">Terminal</span>
                                            </div>
                                        </div>
                                    )}
                                    {absenceTrace.length > 0 ? (
                                        absenceTrace.map((trace, idx) => (
                                            <div key={idx} className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex justify-between items-center group hover:bg-white hover:shadow-md transition-all">
                                                <div>
                                                    <p className="text-[10px] font-black text-slate-800 uppercase tracking-tight capitalize">{trace.status}</p>
                                                    <p className="text-[8px] font-bold text-slate-400 uppercase">{trace.type}</p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-[9px] font-mono font-bold text-slate-500">{trace.date}</p>
                                                    <span className="text-[7px] font-black bg-rose-100 text-rose-700 px-1 rounded uppercase">Audit Log</span>
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="flex flex-col items-center justify-center h-full text-emerald-600 opacity-60 italic text-xs gap-2">
                                            <CheckCircle size={20} />
                                            Zero Negative Events
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="bg-rose-50 border border-rose-100 rounded-3xl p-5 h-48 overflow-hidden flex flex-col">
                                <h4 className="flex items-center gap-2 text-[10px] font-black text-rose-400 uppercase tracking-widest mb-3">
                                    <AlertCircle size={14} className="text-rose-500" />
                                    System Flags
                                </h4>
                                <div className="flex-1 overflow-y-auto pr-2">
                                    {alertHistory.length > 0 ? (
                                        alertHistory.map((alert) => (
                                            <div key={alert.id} className="p-2 mb-2 bg-white rounded-lg border border-rose-200 shadow-sm">
                                                <div className="flex justify-between items-center mb-1">
                                                    <span className="text-[8px] font-black px-1.5 py-0.5 bg-rose-600 text-white rounded uppercase">{alert.alert_level}</span>
                                                    <span className="text-[8px] font-bold text-slate-400">{new Date(alert.created_at).toLocaleDateString()}</span>
                                                </div>
                                                <p className="text-[10px] font-bold text-slate-700">{alert.trigger_count}X Rolling Absences</p>
                                            </div>
                                        ))
                                    ) : (
                                        <p className="text-xs text-rose-400 italic text-center mt-8">No Disciplinary Flags</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer Actions (Responsive Sticky Mobile Action Bar) */}
                <div className="sticky bottom-0 left-0 right-0 z-40 bg-slate-900/95 sm:bg-slate-50 border-t border-slate-800 sm:border-slate-200 px-4 sm:px-8 py-3.5 sm:py-4 backdrop-blur-md pb-safe shrink-0">
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-2.5 sm:gap-4 max-w-4xl mx-auto">
                        {/* Primary Action: Dominant Full-Width Button on Mobile */}
                        <button
                            onClick={() => exportToPDF()}
                            className="w-full sm:flex-1 sm:max-w-xs bg-blue-600 sm:bg-slate-900 hover:bg-blue-700 sm:hover:bg-black text-white min-h-[48px] px-5 py-3 rounded-xl flex items-center justify-center gap-2.5 transition-all active:scale-[0.98] shadow-lg group font-black text-xs uppercase tracking-wider"
                        >
                            <FileText size={18} className="group-hover:translate-y-[-2px] transition-transform shrink-0" />
                            <span>Generate Official Dossier</span>
                        </button>
                        
                        {/* Secondary & Destructive Action Row */}
                        <div className="flex items-center gap-2.5 w-full sm:w-auto sm:flex-1 sm:max-w-md">
                            <button
                                onClick={() => isEditing ? setShowConfirm(true) : setIsEditing(true)}
                                className={`flex-1 min-h-[48px] px-4 py-3 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-[0.98] border-2 font-black text-xs uppercase tracking-wider ${
                                    isEditing ? 'bg-amber-500 border-amber-600 text-white shadow-md' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                                }`}
                            >
                                {isEditing ? <Save size={18} className="shrink-0" /> : <Edit3 size={18} className="shrink-0" />}
                                <span className="truncate">{isEditing ? 'Commit' : 'Admin Edit'}</span>
                            </button>
                            {cadet.status !== 'DISMISSED' && (
                                <button
                                    onClick={() => setShowDismissal(true)}
                                    className="flex-1 min-h-[48px] px-4 py-3 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-[0.98] border-2 border-rose-200 font-black text-xs uppercase tracking-wider text-rose-600 bg-rose-50 hover:bg-rose-100 hover:border-rose-300 shadow-sm"
                                >
                                    <ShieldAlert size={18} className="shrink-0" />
                                    <span className="truncate">Dismiss</span>
                                </button>
                            )}
                        </div>
                    </div>
                </div>
                </>
                )}

                {/* Overlays for Edit Modes */}
                <AnimatePresence>
                    {showDismissal && (
                        <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-md z-50 p-8 flex flex-col items-center justify-center">
                            <motion.div 
                                initial={{ y: 20, opacity: 0, scale: 0.95 }}
                                animate={{ y: 0, opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                className="bg-white p-8 rounded-[2rem] shadow-2xl border border-rose-200 w-full max-w-md space-y-6 relative overflow-hidden"
                            >
                                <div className="absolute top-0 left-0 w-full h-2 bg-rose-600" />
                                <div className="flex items-center gap-3 text-rose-600">
                                    <ShieldAlert size={28} />
                                    <div>
                                        <h3 className="font-black uppercase tracking-widest text-sm leading-tight text-slate-800">Execute Dismissal</h3>
                                        <p className="text-[9px] font-bold tracking-widest uppercase">Terminal Action • Cannot Be Undone</p>
                                    </div>
                                </div>
                                <div className="space-y-4">
                                    <div className="space-y-1">
                                        <label className="text-[8px] font-black text-slate-400 uppercase ml-1">Dismissal Reason</label>
                                        <textarea className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold uppercase outline-none focus:ring-2 focus:ring-rose-500 min-h-[80px]" value={dismissalReason} onChange={e => setDismissalReason(e.target.value)} placeholder="e.g., SEVERE INDISCIPLINE" />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[8px] font-black text-slate-400 uppercase ml-1">Authority Reference</label>
                                        <input className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold uppercase outline-none focus:ring-2 focus:ring-rose-500" value={dismissalAuthority} onChange={e => setDismissalAuthority(e.target.value)} placeholder="e.g., BOARD OF INQUIRY #482" />
                                    </div>
                                    <div className="space-y-1 mt-4 p-4 bg-rose-50 rounded-xl border border-rose-100">
                                        <label className="text-[9px] font-black text-rose-600 uppercase">Type "DISMISS {cadet.course_number || activeRC}" to confirm</label>
                                        <input className="w-full mt-2 bg-white border border-rose-200 rounded-lg px-4 py-2 text-sm font-black uppercase outline-none focus:ring-2 focus:ring-rose-500 text-rose-600 placeholder:text-rose-200" value={dismissalConfirmText} onChange={e => setDismissalConfirmText(e.target.value)} placeholder={`DISMISS ${cadet.course_number || activeRC}`} />
                                    </div>
                                </div>
                                <div className="flex gap-4">
                                    <button 
                                        disabled={isLoading || dismissalConfirmText.trim().toUpperCase() !== `DISMISS ${cadet.course_number || activeRC}`.toUpperCase() || !dismissalReason.trim() || !dismissalAuthority.trim()}
                                        onClick={handleDismissal} 
                                        className="flex-[2] bg-rose-600 disabled:opacity-50 text-white py-4 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-rose-700 transition-all shadow-lg shadow-rose-600/20"
                                    >
                                        Finalize Dismissal
                                    </button>
                                    <button onClick={() => setShowDismissal(false)} className="flex-1 bg-slate-100 text-slate-600 py-4 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-200 transition-all">Cancel</button>
                                </div>
                            </motion.div>
                        </div>
                    )}
                    {isEditing && (
                        <div className="absolute inset-0 bg-slate-900/5 backdrop-blur-sm z-50 p-8 flex flex-col items-center justify-center">
                            <motion.div 
                                initial={{ y: 20, opacity: 0 }}
                                animate={{ y: 0, opacity: 1 }}
                                className="bg-white p-8 rounded-[2rem] shadow-2xl border border-slate-200 w-full max-w-md space-y-6"
                            >
                                <div className="flex items-center gap-3 text-amber-600">
                                    <ShieldAlert />
                                    <h3 className="font-black uppercase tracking-widest">Master Record Overwrite</h3>
                                </div>
                                <div className="space-y-4">
                                    <div className="space-y-1">
                                        <label className="text-[8px] font-black text-slate-400 uppercase ml-1">Full Legal Name</label>
                                        <input className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold uppercase outline-none focus:ring-2 focus:ring-blue-500" value={editName} onChange={e => setEditName(e.target.value)} />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1">
                                            <label className="text-[8px] font-black text-slate-400 uppercase ml-1">Regular Course</label>
                                            <input type="number" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500" value={editCourse} onChange={e => setEditCourse(parseInt(e.target.value))} />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[8px] font-black text-slate-400 uppercase ml-1">Squad Unit</label>
                                            <input className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold uppercase outline-none focus:ring-2 focus:ring-blue-500" value={editSquad} onChange={e => setEditSquad(e.target.value)} />
                                        </div>
                                    </div>
                                </div>
                                <div className="flex gap-4">
                                    <button onClick={handleSave} className="flex-1 bg-blue-900 text-white py-4 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-blue-800 transition-all">Save Changes</button>
                                    <button onClick={() => setIsEditing(false)} className="flex-1 bg-slate-100 text-slate-600 py-4 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-200">Discard Changes</button>
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
};
