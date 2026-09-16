import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, AlertOctagon, FileText, User, CheckCircle } from 'lucide-react';
import React, { useState } from 'react';
import { CadetAlert } from './AtRiskCadetsWidget';

export interface ResolutionModalProps {
  isOpen: boolean;
  onClose: () => void;
  alert: CadetAlert;
  onAction: (notes: string) => void;
  isSubmitting: boolean;
  userRole: string;
}

export default function ResolutionModal({ isOpen, onClose, alert, onAction, isSubmitting, userRole }: ResolutionModalProps) {
  const [notes, setNotes] = useState('');

  const handleSubmit = () => {
    if (notes.trim() === '') return;
    onAction(notes);
  };

  const isFlagrant = alert.alert_level === 'FLAGRANT';
  const isCommandant = userRole === 'commandant';

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 backdrop-blur-md bg-black/60"
          />

          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
            transition={{ type: "spring", duration: 0.5 }}
            className="relative w-full max-w-2xl p-0 overflow-hidden rounded-2xl bg-[#0A1128]/90 backdrop-blur-2xl border border-[#D4AF37]/30 shadow-[0_8px_32px_0_rgba(0,0,0,0.5)] flex flex-col md:flex-row"
          >
            {/* Left Panel: Primary Misconduct Focus */}
            <div className={`p-8 md:w-1/2 flex flex-col justify-center relative ${isFlagrant ? 'bg-red-950/40 border-r border-red-500/30' : 'bg-white/5 border-r border-white/10'}`}>
              <div className={`absolute top-0 left-0 w-full h-1 ${isFlagrant ? 'bg-red-500' : 'bg-[#D4AF37]'}`} />
              
              <div className="mb-6">
                <div className={`inline-flex items-center gap-2 px-3 py-1 mb-4 rounded-full text-xs font-bold tracking-widest uppercase ${isFlagrant ? 'bg-red-500/20 text-red-400 border border-red-500/30 shadow-[0_0_15px_rgba(239,68,68,0.2)]' : 'bg-[#D4AF37]/20 text-[#D4AF37] border border-[#D4AF37]/30 shadow-[0_0_15px_rgba(212,175,55,0.2)]'}`}>
                  <AlertOctagon className="w-4 h-4" />
                  {alert.alert_level} MISCONDUCT
                </div>
                <h3 className="text-3xl font-bold text-white tracking-tight leading-tight">
                  Disciplinary<br />Incident Report
                </h3>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="text-[10px] text-gray-400 uppercase tracking-widest font-bold mb-1 block">Offender Profile</label>
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-gradient-to-br from-[#1A2235] to-[#0A1128] rounded-lg border border-white/10">
                      <User className="w-5 h-5 text-gray-300" />
                    </div>
                    <div>
                      <p className="text-lg font-medium text-white">{alert.cadet_name}</p>
                      <p className="text-xs text-gray-400 font-mono">Course {alert.course_number} • SQD {alert.squad}</p>
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-xl border bg-black/40 border-white/10 relative overflow-hidden group">
                  <div className={`absolute inset-0 opacity-10 transition-opacity duration-500 group-hover:opacity-20 ${isFlagrant ? 'bg-red-500' : 'bg-[#D4AF37]'}`} />
                  <label className="text-[10px] text-gray-400 uppercase tracking-widest font-bold mb-2 block relative z-10">Specific Infraction</label>
                  <p className="text-sm text-gray-200 leading-relaxed relative z-10">
                    Cadet <span className="font-semibold text-white">{alert.cadet_name}</span> has accumulated <span className={`font-bold ${isFlagrant ? 'text-red-400' : 'text-[#D4AF37]'}`}>{alert.trigger_count} unexcused absences</span> within a 5-day rolling period, violating fundamental attendance protocols.
                  </p>
                </div>
              </div>
            </div>

            {/* Right Panel: Action Area */}
            <div className="p-8 md:w-1/2 flex flex-col justify-between">
              <button 
                onClick={onClose}
                className="absolute p-2 text-gray-400 transition-colors top-4 right-4 hover:text-white rounded-full hover:bg-white/5 z-50"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="mt-8 md:mt-4 space-y-6 h-full flex flex-col">
                {/* Condition: Show Commandant's Directive to Course Officers if it exists */}
                {!isCommandant && alert.commandant_directive && (
                  <div className="bg-[#D4AF37]/10 border border-[#D4AF37]/30 rounded-xl p-4 shadow-inner">
                    <h5 className="text-[#D4AF37] text-[10px] font-black uppercase tracking-widest mb-1">Official Commandant Directive</h5>
                    <p className="text-sm text-white italic font-medium leading-relaxed">
                      "{alert.commandant_directive}"
                    </p>
                  </div>
                )}

                <div className="flex-1 flex flex-col">
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className={`w-5 h-5 ${isCommandant ? 'text-[#D4AF37]' : 'text-gray-400'}`} />
                    <h4 className="text-lg font-medium text-white">
                      {isCommandant ? "Add Commandant official Directive (Optional)" : "Resolution Log"}
                    </h4>
                  </div>
                  
                  <p className="mb-4 text-xs text-gray-400">
                    {isCommandant 
                      ? "Attach instructions for the responsible Course Officer. This does not resolve the alert."
                      : "Document the administrative or disciplinary action taken to permanently resolve this flag."}
                  </p>
                  
                  <textarea 
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder={
                      isCommandant 
                        ? "e.g., 'Do not accept medical excuses. Bring this cadet to my office'..."
                        : "e.g., 'Issued formal query', 'Remanded to guardroom'..."
                    }
                    className="w-full flex-1 min-h-[100px] p-4 text-sm text-white placeholder-gray-600 transition-colors border rounded-xl bg-black/20 border-white/10 focus:outline-none focus:border-[#D4AF37]/50 focus:ring-1 focus:ring-[#D4AF37]/50 resize-none shadow-inner"
                  />
                </div>

                <button 
                  onClick={handleSubmit}
                  disabled={isSubmitting || notes.trim() === ''}
                  className={`flex items-center justify-center w-full gap-2 px-4 py-3 mt-4 text-sm font-semibold transition-all rounded-xl hover:opacity-90 active:scale-[0.98] disabled:opacity-50 disabled:grayscale disabled:cursor-not-allowed shadow-lg ${
                    isCommandant 
                      ? "bg-gradient-to-r from-[#D4AF37] to-[#F3E5AB] text-[#0A1128] shadow-[#D4AF37]/20" 
                      : "bg-blue-600 hover:bg-blue-500 text-white shadow-blue-500/20"
                  }`}
                >
                  {isCommandant ? (
                    <>
                      <Send className="w-4 h-4" />
                      {isSubmitting ? 'Attaching Directive...' : 'Submit Directive'}
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4" />
                      {isSubmitting ? 'Resolving...' : 'Acknowledge & Close'}
                    </>
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
