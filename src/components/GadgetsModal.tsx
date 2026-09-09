import React, { useState } from "react";
import { X, RotateCcw } from "lucide-react";

export const ALL_GADGETS = [
  "Error Alert System",
  "Network Port Monitoring",
  "Temperature",
  "Temperature Trending in a Day",
  "Power Trending in a Day",
  "Power",
  "Events",
  "Power Capacity",
  "Space Capacity",
  "Weight Capacity",
  "Summary of Hierarchy",
  "Top 3 High Temperature Rooms",
  "Temperature Trending in a Week",
  "Power Trending in a Week",
  "Temperature Trending in a Month",
  "Power Trending in a Month",
  "Power Data Summary",
  "Device Statistics",
  "Firmware/Software Outlier",
  "Cooling Anomaly",
  "Fan Outlier",
  "Device Health Summary",
  "Component Health Summary",
  "Recent Inventory Changes",
  "Events by Severity",
  "Events by Category",
  "Events by Day",
  "Power Usage Effectiveness",
  "GPU Statistics"
];

export const DEFAULT_ENABLED_GADGETS = [
  "Error Alert System",
  "Network Port Monitoring",
  "Summary of Hierarchy",
  "Device Health Summary",
  "Power Capacity",
  "Temperature Trending in a Day",
  "Power Trending in a Day",
  "Device Statistics"
];

export interface GadgetsModalProps {
  isOpen: boolean;
  enabledGadgets: string[];
  onClose: () => void;
  onSave: (gadgets: string[]) => void;
}

export function GadgetsModal({ isOpen, enabledGadgets, onClose, onSave }: GadgetsModalProps) {
  const [selected, setSelected] = useState<string[]>(enabledGadgets);

  if (!isOpen) return null;

  const toggleGadget = (gadget: string) => {
    if (selected.includes(gadget)) {
      setSelected(selected.filter(g => g !== gadget));
    } else {
      setSelected([...selected, gadget]);
    }
  };

  const handleReset = () => {
    setSelected(DEFAULT_ENABLED_GADGETS);
  };

  const handleOK = () => {
    onSave(selected);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs font-sans select-none">
      <div className="bg-white border border-slate-300 rounded shadow-2xl max-w-2xl w-full overflow-hidden text-slate-800 text-xs flex flex-col max-h-[85vh]">
        
        {/* Header Bar matching Tyrone style */}
        <div className="bg-[#7a0c0c] text-white px-5 py-3 flex items-center justify-between font-sans shrink-0">
          <span className="font-bold text-sm tracking-wide">Customize Dashboard Gadgets</span>
          <button type="button" onClick={onClose} className="text-white/80 hover:text-white cursor-pointer p-0.5">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Checklist Body */}
        <div className="p-6 font-sans overflow-y-auto flex-1 space-y-4">
          <p className="text-slate-500 font-medium text-xs">
            Select the gadgets you want to display on your dashboard layout:
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 bg-slate-50 p-4 border border-slate-200 rounded">
            {ALL_GADGETS.map(gadget => (
              <label
                key={gadget}
                className="flex items-center gap-2.5 p-2 rounded hover:bg-white border border-transparent hover:border-slate-200 cursor-pointer transition-colors"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(gadget)}
                  onChange={() => toggleGadget(gadget)}
                  className="accent-[#7a0c0c] w-4 h-4 cursor-pointer"
                />
                <span className="text-slate-800 font-medium text-xs">{gadget}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Footer Actions matching prompt */}
        <div className="p-4 px-6 bg-slate-100 flex items-center justify-between border-t border-slate-200 shrink-0">
          <button
            type="button"
            onClick={handleReset}
            className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded cursor-pointer text-xs flex items-center gap-1.5 border border-slate-300"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset to default</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleOK}
              className="px-6 py-1.5 bg-[#7a0c0c] hover:bg-[#590808] text-white font-bold rounded cursor-pointer text-xs shadow-xs"
            >
              OK
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded cursor-pointer text-xs shadow-xs"
            >
              Cancel
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
