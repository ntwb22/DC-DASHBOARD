import React, { useState } from "react";
import { X, BookOpen, Server, Activity, Shield, Layers, Cpu, Search } from "lucide-react";

export interface UserGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function UserGuideModal({ isOpen, onClose }: UserGuideModalProps) {
  const [activeSection, setActiveSection] = useState("overview");
  const [searchTerm, setSearchTerm] = useState("");

  if (!isOpen) return null;

  const sections = [
    { id: "overview", label: "Dashboard Overview", icon: BookOpen },
    { id: "servers", label: "Server Management", icon: Server },
    { id: "telemetry", label: "Redfish Telemetry", icon: Activity },
    { id: "hierarchy", label: "3D Rack Hierarchy", icon: Layers },
    { id: "aiops", label: "AIOps & Thermal Alerts", icon: Cpu },
  ];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fade-in">
      <div className="bg-white rounded-md shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col border border-slate-400 text-slate-800 font-sans max-h-[90vh]">
        {/* Top Header - Tyrone Red Theme */}
        <div className="bg-[#680505] text-white px-4 py-2.5 flex items-center justify-between select-none border-b border-[#4d0000]">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-red-200" />
            <h2 className="text-sm font-bold tracking-wide">Tyrone TCM User Guide & Documentation</h2>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white transition-colors cursor-pointer p-0.5 rounded hover:bg-[#520000]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search Bar */}
        <div className="bg-slate-100 px-4 py-2 border-b border-slate-200 flex items-center gap-2">
          <Search className="w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search User Guide topics..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full text-xs bg-transparent border-0 focus:outline-none text-slate-700 placeholder-slate-400"
          />
        </div>

        {/* Content Body */}
        <div className="flex flex-1 min-h-[420px] overflow-hidden">
          {/* Sidebar */}
          <div className="w-56 bg-slate-50 border-r border-slate-200 p-2 shrink-0 select-none overflow-y-auto">
            <div className="space-y-1 text-xs">
              {sections.map((s) => {
                const Icon = s.icon;
                return (
                  <button
                    key={s.id}
                    onClick={() => setActiveSection(s.id)}
                    className={`w-full text-left px-3 py-2 rounded transition-colors flex items-center gap-2 cursor-pointer ${
                      activeSection === s.id
                        ? "bg-[#680505] text-white font-semibold"
                        : "text-slate-700 hover:bg-slate-200/60"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <span>{s.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Details Area */}
          <div className="flex-1 p-6 overflow-y-auto text-xs leading-relaxed space-y-4">
            {activeSection === "overview" && (
              <div>
                <h3 className="text-sm font-bold text-slate-900 border-b border-slate-300 pb-1 mb-3">
                  1. Dashboard Overview
                </h3>
                <p className="text-slate-700 mb-2">
                  Tyrone Data Center Manager (TCM) provides unified fleet management, real-time Redfish sensor telemetry, rack hierarchy visualization, and AI-driven predictive anomaly detection for enterprise data centers.
                </p>
                <ul className="list-disc pl-5 space-y-1 text-slate-600">
                  <li><strong>Global Navigation Bar:</strong> Top quick search, user profile, logout, and Help menu.</li>
                  <li><strong>Left Sidebar:</strong> Navigation between Summary Dashboard, Server Inventory, 3D Data Center, AIOps Engine, Sustainability Metrics, and Settings.</li>
                  <li><strong>Widget Grid:</strong> Customizable gadgets showing real-time temperature trends, power consumption, PUE, and event logs.</li>
                </ul>
              </div>
            )}

            {activeSection === "servers" && (
              <div>
                <h3 className="text-sm font-bold text-slate-900 border-b border-slate-300 pb-1 mb-3">
                  2. Server Management & BMC Discovery
                </h3>
                <p className="text-slate-700 mb-2">
                  Add server nodes by specifying BMC IPv4 addresses or hostname credentials. TCM automatically queries standard Redfish endpoints.
                </p>
                <div className="bg-slate-50 border border-slate-200 p-3 rounded space-y-1 text-slate-700">
                  <div className="font-semibold text-slate-800">Supported Power Actions:</div>
                  <div>• <strong>On / Force Off:</strong> Instant power relay control.</div>
                  <div>• <strong>Graceful Shutdown:</strong> Triggers clean OS ACPI power-down signal.</div>
                  <div>• <strong>Power Cycle / Reset:</strong> Hard reboot or cold reset execution.</div>
                </div>
              </div>
            )}

            {activeSection === "telemetry" && (
              <div>
                <h3 className="text-sm font-bold text-slate-900 border-b border-slate-300 pb-1 mb-3">
                  3. Redfish Telemetry & Hardware Health
                </h3>
                <p className="text-slate-700 mb-2">
                  TCM polls chassis temperatures, fan RPM, voltage rails, CPU/RAM utilization, and storage disk SMART statuses every 5 seconds.
                </p>
                <p className="text-slate-600">
                  Thermal warnings are highlighted in orange (&gt; 75°C) and critical alerts in red (&gt; 85°C).
                </p>
              </div>
            )}

            {activeSection === "hierarchy" && (
              <div>
                <h3 className="text-sm font-bold text-slate-900 border-b border-slate-300 pb-1 mb-3">
                  4. 3D Rack & Hierarchy Layout
                </h3>
                <p className="text-slate-700 mb-2">
                  Visualize your data center room layouts in interactive 3D perspective. Filter by thermal heatmaps, power density per rack, or blade server placement.
                </p>
              </div>
            )}

            {activeSection === "aiops" && (
              <div>
                <h3 className="text-sm font-bold text-slate-900 border-b border-slate-300 pb-1 mb-3">
                  5. AIOps Anomaly Engine
                </h3>
                <p className="text-slate-700 mb-2">
                  The embedded Tyrone AI engine continuously scans telemetry streams for abnormal thermal drift, fan degradation, and power spikes before hardware failure occurs.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
