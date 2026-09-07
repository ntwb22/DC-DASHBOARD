import React, { useState } from "react";
import { X, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

export interface ColumnDefinition {
  id: string;
  label: string;
  page: 1 | 2;
  isCustom?: boolean;
  defaultVisible: boolean;
}

export const ALL_COLUMNS: ColumnDefinition[] = [
  // Page 1
  { id: "bmcIp", label: "Address", page: 1, defaultVisible: true },
  { id: "name", label: "Name", page: 1, defaultVisible: true },
  { id: "serialNumber", label: "Serial Number", page: 1, defaultVisible: true },
  { id: "room", label: "Room", page: 1, defaultVisible: true },
  { id: "rack", label: "Rack", page: 1, defaultVisible: true },
  { id: "weight", label: "Weight (kg)", page: 1, defaultVisible: true },

  // Page 2
  { id: "biosVersion", label: "BIOS Information", page: 2, defaultVisible: true },
  { id: "cpuCount", label: "Number of CPU", page: 2, defaultVisible: true },
  { id: "totalMemory", label: "Total Memory", page: 2, defaultVisible: true },
  { id: "notes", label: "Notes", page: 2, defaultVisible: true }
];

interface SelectColumnsModalProps {
  isOpen: boolean;
  onClose: () => void;
  visibleColumns: string[];
  onSaveColumns: (columns: string[]) => void;
}

export const SelectColumnsModal = ({ isOpen, onClose, visibleColumns, onSaveColumns }: SelectColumnsModalProps) => {
  const [page, setPage] = useState<1 | 2>(1);
  const [draftSelection, setDraftSelection] = useState<string[]>(visibleColumns);

  if (!isOpen) return null;

  const toggleColumn = (id: string) => {
    setDraftSelection(prev => 
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    );
  };

  const handleResetToDefault = () => {
    const defaults = ALL_COLUMNS.filter(c => c.defaultVisible).map(c => c.id);
    setDraftSelection(defaults);
  };

  const handleSave = () => {
    onSaveColumns(draftSelection);
    onClose();
  };

  const pageColumns = ALL_COLUMNS.filter(c => c.page === page);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs select-none font-sans">
      <div className="bg-white border border-slate-300 rounded shadow-2xl max-w-2xl w-full overflow-hidden text-slate-800 text-xs flex flex-col">
        
        {/* Header Bar matching Red Console Theme */}
        <div className="bg-[#7a0c0c] text-white px-5 py-3 flex items-center justify-between font-bold text-sm tracking-wide shrink-0">
          <span>Select columns</span>
          <button 
            type="button" 
            onClick={onClose}
            className="text-white/80 hover:text-white cursor-pointer p-0.5 rounded hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-4">
          <p className="font-bold text-slate-700 text-xs">Columns to be showed.</p>

          {/* Checkbox Grid (Single Page 3-column grid) */}
          <div className="border border-slate-200 rounded p-5 bg-slate-50">
            <div className="grid grid-cols-3 gap-y-3.5 gap-x-6">
              {ALL_COLUMNS.map((col) => {
                const isChecked = draftSelection.includes(col.id);
                return (
                  <label key={col.id} className="flex items-center gap-2 cursor-pointer hover:text-slate-950">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleColumn(col.id)}
                      className="w-3.5 h-3.5 accent-[#7a0c0c]"
                    />
                    <span className="font-medium text-slate-700 text-xs truncate" title={col.label}>
                      {col.label} {col.isCustom ? "*" : ""}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Footer controls bar matching Image 2 */}
          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={handleResetToDefault}
              className="text-blue-700 hover:text-blue-900 hover:underline font-bold text-xs cursor-pointer border-none bg-transparent"
            >
              Reset to default
            </button>

            <div className="flex items-center gap-4">
              <span className="text-[11px] text-slate-500 italic">* indicates a custom attribute</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSave}
                  className="px-5 py-1.5 bg-[#7a0c0c] hover:bg-[#520000] text-white font-bold rounded text-xs shadow-sm transition-colors cursor-pointer"
                >
                  OK
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-1.5 bg-slate-600 hover:bg-slate-700 text-white font-bold rounded text-xs shadow-sm transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
};
