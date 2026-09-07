import React from "react";
import { AlertTriangle, X } from "lucide-react";

export interface ConfirmModalProps {
  isOpen: boolean;
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "danger" | "warning" | "info";
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title = "Confirm Action",
  message,
  confirmText = "OK",
  cancelText = "Cancel",
  variant = "danger",
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null;

  const headerBg =
    variant === "danger"
      ? "bg-[#7a0c0c]"
      : variant === "warning"
      ? "bg-amber-700"
      : "bg-slate-800";

  const buttonBg =
    variant === "danger"
      ? "bg-[#7a0c0c] hover:bg-[#600909]"
      : variant === "warning"
      ? "bg-amber-600 hover:bg-amber-700"
      : "bg-blue-600 hover:bg-blue-700";

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs select-none font-sans">
      <div className="bg-white border border-slate-300 rounded shadow-2xl max-w-md w-full overflow-hidden text-slate-800 text-xs flex flex-col">
        {/* Header Bar matching Red Console Theme */}
        <div className={`${headerBg} text-white px-4 py-2.5 flex items-center justify-between font-bold text-sm tracking-wide shrink-0`}>
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4.5 h-4.5 text-amber-300 shrink-0" />
            <span>{title}</span>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="text-white/80 hover:text-white cursor-pointer p-0.5 rounded hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Content Body */}
        <div className="p-5">
          <p className="text-slate-700 text-xs sm:text-sm leading-relaxed font-medium">
            {message}
          </p>
        </div>

        {/* Modal Footer / Actions */}
        <div className="bg-slate-50 px-4 py-3 border-t border-slate-200 flex justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-1.5 rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 font-semibold transition-colors cursor-pointer text-xs"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`px-5 py-1.5 rounded text-white font-bold transition-colors cursor-pointer text-xs shadow-sm ${buttonBg}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};
