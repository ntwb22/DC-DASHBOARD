import React from "react";
import { X, Sparkles, Calendar, CheckCircle2 } from "lucide-react";

export interface ReleaseNotesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ReleaseNotesModal({ isOpen, onClose }: ReleaseNotesModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fade-in">
      <div className="bg-white rounded-md shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col border border-slate-400 text-slate-800 font-sans max-h-[85vh]">
        {/* Top Header Bar - Tyrone Red */}
        <div className="bg-[#680505] text-white px-4 py-2.5 flex items-center justify-between select-none border-b border-[#4d0000]">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-300" />
            <h2 className="text-sm font-bold tracking-wide">Tyrone Core Console Release Notes</h2>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white transition-colors cursor-pointer p-0.5 rounded hover:bg-[#520000]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 text-xs leading-relaxed">
          {/* Release Version 6.2.0 */}
          <div className="border-b border-slate-200 pb-5">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="bg-[#680505] text-white text-xs font-bold px-2 py-0.5 rounded">
                  v6.2.0.bc154458
                </span>
                <span className="font-semibold text-slate-800 text-sm">Latest Enterprise Release</span>
              </div>
              <div className="flex items-center gap-1 text-slate-500 text-xs">
                <Calendar className="w-3.5 h-3.5" />
                <span>August 2026</span>
              </div>
            </div>

            <div className="space-y-2 mt-3 text-slate-700">
              <div className="font-semibold text-slate-800">What's New in Version 6.2.0:</div>
              <ul className="space-y-1.5 pl-2">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#680505] shrink-0 mt-0.5" />
                  <span><strong>3D Datacenter Room Canvas:</strong> Interactive three-dimensional rendering for server rack layouts, thermal heatmaps, and power distribution.</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#680505] shrink-0 mt-0.5" />
                  <span><strong>Native Redfish API Telemetry:</strong> Real-time HTTP/JSON proxy polling for CPU, Memory, Disk SMART, and Fan RPM metrics.</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#680505] shrink-0 mt-0.5" />
                  <span><strong>AIOps Predictive Analytics:</strong> Machine-learning powered anomaly scoring for thermal spikes and fan degradation.</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#680505] shrink-0 mt-0.5" />
                  <span><strong>Enhanced Help & About Dialogs:</strong> Native product licensing, version detail inspector, and support request tools.</span>
                </li>
              </ul>
            </div>
          </div>

          {/* Release Version 6.1.5 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="bg-slate-200 text-slate-800 text-xs font-bold px-2 py-0.5 rounded">
                  v6.1.5
                </span>
                <span className="font-semibold text-slate-800">Maintenance Update</span>
              </div>
              <div className="flex items-center gap-1 text-slate-500 text-xs">
                <Calendar className="w-3.5 h-3.5" />
                <span>June 2026</span>
              </div>
            </div>
            <ul className="space-y-1 text-slate-600 pl-2">
              <li>• Fixed power action relay status polling lag on high-density blade chassis.</li>
              <li>• Improved CSV & PDF report export speed for global inventory views.</li>
              <li>• Security updates and SSL/TLS proxy cipher upgrades.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
