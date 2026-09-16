import React, { useState } from 'react';
import { AuditEvent } from '../../types';
import { Terminal, ChevronDown, ChevronUp } from 'lucide-react';

interface AuditPayloadRendererProps {
    log: AuditEvent;
}

export const AuditPayloadRenderer: React.FC<AuditPayloadRendererProps> = ({ log }) => {
    const [showRaw, setShowRaw] = useState(false);
    const { actionType, payload, actorName } = log;

    // Helper to render entity tags with rich light-contrast styling
    const renderName = (name?: string) => (
        <span className="text-blue-950 font-bold tracking-wide px-1.5 py-0.5 bg-blue-100/60 rounded border border-blue-200/60 inline-block my-0.5 text-xs sm:text-sm">
            {name || 'N/A'}
        </span>
    );

    const renderRC = (courseNum?: string | number) => (
        <span className="text-blue-700 font-mono font-black bg-blue-50 border border-blue-200/50 px-1.5 py-0.5 rounded inline-block my-0.5 text-xs sm:text-sm">
            RC {courseNum || 'N/A'}
        </span>
    );

    const renderSquad = (squad?: string) => (
        <span className="text-slate-700 font-bold px-1.5 py-0.5 bg-slate-100 rounded border border-slate-200/80 inline-block my-0.5 text-xs sm:text-sm">
            {squad || 'N/A'}
        </span>
    );

    const renderActionText = () => {
        try {
            if (!payload) return <span className="text-slate-500 font-medium">No event details stored.</span>;

            switch (actionType) {
                case 'CADET_ADDED': {
                    const name = payload.cadet_name || payload.name;
                    const squad = payload.squad;
                    const course = payload.course_number || payload.courseNumber;
                    return (
                        <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">
                            Cadet {renderName(name)} was enrolled into the academy database and assigned to {renderSquad(squad)} under {renderRC(course)}.
                        </p>
                    );
                }
                case 'CADET_REMOVED':
                case 'CADET_DISMISSED': {
                    const name = payload.cadet_name || payload.name;
                    const reason = payload.reason || 'No dismissal reason logged';
                    const actor = payload.action_by_name || actorName;
                    return (
                        <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">
                            Cadet {renderName(name)} was officially dismissed from the academy by officer {renderName(actor)}.<br />
                            <span className="text-[11px] text-rose-700 font-bold block mt-1.5 bg-rose-50 border border-rose-100 px-2 py-1 rounded">REASON: {reason}</span>
                        </p>
                    );
                }
                case 'CADET_MODIFIED': {
                    const diffs = payload.diff || [];
                    const cadetName = payload.cadet_name || payload.name || 'Unknown Cadet';
                    if (diffs.length === 0) {
                        return <p className="text-xs sm:text-sm text-slate-700">Administrative updates were saved for Cadet {renderName(cadetName)}.</p>;
                    }
                    return (
                        <div className="space-y-2">
                            <p className="text-xs sm:text-sm text-slate-700">
                                Modifications recorded for Cadet {renderName(cadetName)}:
                            </p>
                            <div className="space-y-1.5 pl-2 border-l-2 border-blue-100 mt-2">
                                {diffs.map((d: any, idx: number) => {
                                    const fieldName = String(d.field).replace(/_/g, ' ').toUpperCase();
                                    return (
                                        <div key={idx} className="text-[11px] text-slate-600 flex flex-wrap items-center gap-1.5">
                                            <span className="font-bold text-slate-500">{fieldName}:</span>
                                            <span className="line-through text-rose-700 bg-rose-50 border border-rose-100/50 px-1.5 py-0.5 rounded">{String(d.from)}</span>
                                            <span className="text-slate-400">➔</span>
                                            <span className="text-emerald-700 bg-emerald-50 border border-emerald-100/50 px-1.5 py-0.5 rounded font-semibold">{String(d.to)}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                }
                case 'OFFICER_INVITED': {
                    const email = payload.email;
                    const course = payload.course_number || payload.courseNumber;
                    return (
                        <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">
                            A secure invitation was dispatched to register a new Course Officer account for {renderRC(course)} at email target {renderName(email)}.
                        </p>
                    );
                }
                case 'COURSE_GRADUATION': {
                    const course = payload.course_number || payload.courseNumber;
                    const officer = payload.officer_name || payload.officerName;
                    const cadetCount = payload.cadet_count;
                    return (
                        <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">
                            Regular Course {course} was graduated by the Commandant with {cadetCount} cadets. Assigned officer {renderName(officer)} has been deactivated.
                        </p>
                    );
                }
                case 'SETTINGS_CHANGED': {
                    const diffs = payload.diff || [];
                    if (diffs.length === 0) {
                        return <p className="text-xs sm:text-sm text-slate-700">System configuration settings were updated by {renderName(actorName)}.</p>;
                    }
                    return (
                        <div className="space-y-2">
                            <p className="text-xs sm:text-sm text-slate-700">System configurations updated by {renderName(actorName)}:</p>
                            <div className="space-y-1.5 pl-2 border-l-2 border-blue-100 mt-2">
                                {diffs.map((d: any, idx: number) => {
                                    const fieldName = String(d.field).replace(/_/g, ' ').toUpperCase();
                                    return (
                                        <div key={idx} className="text-[11px] text-slate-600 flex flex-wrap items-center gap-1.5">
                                            <span className="font-bold text-slate-500">{fieldName}:</span>
                                            <span className="line-through text-rose-700 bg-rose-50 border border-rose-100/50 px-1.5 py-0.5 rounded">{String(d.from)}</span>
                                            <span className="text-slate-400">➔</span>
                                            <span className="text-emerald-700 bg-emerald-50 border border-emerald-100/50 px-1.5 py-0.5 rounded font-semibold">{String(d.to)}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                }
                default:
                    return (
                        <div className="space-y-2">
                            <p className="text-xs sm:text-sm text-slate-800 font-bold capitalize">
                                Action: {actionType.replace(/_/g, ' ').toLowerCase()}
                            </p>
                            <p className="text-xs text-slate-500">
                                Details were recorded in the institutional database ledger.
                            </p>
                        </div>
                    );
            }
        } catch (err) {
            console.error('Failed to parse audit payload:', err);
            return <span className="text-rose-600 text-xs font-bold">Failed to decrypt transaction payload safely.</span>;
        }
    };

    return (
        <div className="space-y-4">
            <div className="bg-blue-50/20 border border-blue-100/60 p-4 sm:p-5 rounded-xl shadow-sm">
                {renderActionText()}
            </div>

            <div className="border-t border-slate-200/60 pt-3">
                <button
                    onClick={() => setShowRaw(!showRaw)}
                    className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-slate-500 hover:text-slate-700 transition-colors"
                >
                    <Terminal size={12} />
                    {showRaw ? 'Hide Raw Cryptographic Payload' : 'Show Raw Cryptographic Payload'}
                    {showRaw ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                </button>

                {showRaw && (
                    <pre className="mt-3 p-4 bg-slate-50 rounded-lg text-[9px] sm:text-[10px] font-mono text-slate-600 border border-slate-200 overflow-x-auto whitespace-pre-wrap max-h-48 leading-relaxed">
                        {JSON.stringify(payload, null, 2)}
                    </pre>
                )}
            </div>
        </div>
    );
};
