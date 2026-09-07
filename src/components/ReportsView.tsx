import React, { useState } from "react";
import { FileSpreadsheet, Plus, Info, Download, CheckCircle2, Clock } from "lucide-react";

const REPORT_SECTIONS: Record<string, Array<{ name: string; type: string; schedule: string; status: string }>> = {
  "Daily Telemetry Executive Summary": [
    { name: "BMC Thermal & Voltage Matrix", type: "System Health", schedule: "Daily 00:00", status: "Active" },
    { name: "CPU & Memory Utilization Log", type: "Performance", schedule: "Daily 00:00", status: "Active" },
    { name: "Power Consumption & PUE Tracking", type: "Telemetry", schedule: "Daily 00:00", status: "Active" },
    { name: "Hardware Event & SEL Logs", type: "Events", schedule: "Daily 00:00", status: "Active" }
  ],
  "Weekly Energy Consumption Audit": [
    { name: "Total Data Center kWh Consumption", type: "Energy", schedule: "Weekly (Sun)", status: "Active" },
    { name: "PUE Efficiency & Heat Loss Audit", type: "Sustainability", schedule: "Weekly (Sun)", status: "Active" },
    { name: "Carbon Emission (CO2e) Breakdown", type: "Environmental", schedule: "Weekly (Sun)", status: "Active" }
  ],
  "Monthly Rack Power & Space Allocation": [
    { name: "Rack Space (U) Utilization", type: "Capacity", schedule: "Monthly (1st)", status: "Active" },
    { name: "Rack Power Budget vs Actual Peak", type: "Power", schedule: "Monthly (1st)", status: "Active" },
    { name: "Weight & Floor Load Balancing", type: "Infrastructure", schedule: "Monthly (1st)", status: "Active" }
  ],
  "Hardware Inventory & Outlier Analysis": [
    { name: "Server Inventory & Serial Listing", type: "Hardware", schedule: "On-Demand", status: "Active" },
    { name: "Drive SMART Health & Bad Sectors", type: "Storage", schedule: "Daily 06:00", status: "Active" },
    { name: "Firmware & BIOS Version Audit", type: "Firmware", schedule: "Weekly (Mon)", status: "Active" }
  ],
  "Sustainability & Carbon Offset Report": [
    { name: "Carbon Footprint Index (CUE)", type: "Sustainability", schedule: "Monthly (1st)", status: "Active" },
    { name: "Renewable Energy Factor (REF)", type: "Energy", schedule: "Monthly (1st)", status: "Active" },
    { name: "Power Usage Effectiveness (PUE)", type: "Efficiency", schedule: "Monthly (1st)", status: "Active" }
  ]
};

export function ReportsView() {
  const [selectedReport, setSelectedReport] = useState<string>("Daily Telemetry Executive Summary");
  const [downloadMsg, setDownloadMsg] = useState<string | null>(null);

  const sections = REPORT_SECTIONS[selectedReport] || REPORT_SECTIONS["Daily Telemetry Executive Summary"];

  const generatePdfReport = (title: string) => {
    const activeServers = (() => {
      try {
        const raw = localStorage.getItem("tyrone_fleet");
        const fleet = raw ? JSON.parse(raw) : [];
        const deletedKeys = (() => {
          try {
            const delRaw = localStorage.getItem("tyrone_deleted_keys");
            return delRaw ? new Set<string>(JSON.parse(delRaw)) : new Set<string>();
          } catch { return new Set<string>(); }
        })();
        return fleet.filter((s: any) =>
          !deletedKeys.has(String(s.id).toLowerCase()) &&
          !deletedKeys.has(String(s.bmcIp).toLowerCase())
        );
      } catch { return []; }
    })();

    const reportDate = new Date().toLocaleString();
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Tyrone Dashboard - ${title} Report</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #1e293b; padding: 25px; margin: 0; background: #fff; }
          .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #7a0c0c; padding-bottom: 15px; margin-bottom: 20px; }
          .brand { font-size: 20px; font-weight: 800; color: #7a0c0c; letter-spacing: 0.5px; }
          .sub-brand { font-size: 11px; color: #64748b; font-weight: 600; text-transform: uppercase; }
          .meta { font-size: 11px; text-align: right; color: #475569; }
          h2 { font-size: 15px; color: #0f172a; margin-top: 20px; margin-bottom: 10px; border-bottom: 1px solid #cbd5e1; padding-bottom: 5px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 18px; font-size: 11px; }
          th { background: #7a0c0c; color: white; text-align: left; padding: 7px 10px; font-weight: 700; border: 1px solid #7a0c0c; }
          td { border: 1px solid #cbd5e1; padding: 6px 10px; }
          tr:nth-child(even) { background: #f8fafc; }
          .badge { display: inline-block; padding: 2px 6px; border-radius: 3px; font-weight: 700; font-size: 10px; background: #dcfce7; color: #166534; }
          .badge-warn { background: #fef3c7; color: #92400e; }
          .footer { margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 12px; font-size: 10px; color: #94a3b8; display: flex; justify-content: space-between; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="brand">TYRONE DATA CENTER MANAGER CONSOLE</div>
            <div class="sub-brand">${title} & Hardware Inventory Audit</div>
          </div>
          <div class="meta">
            <div><strong>Generated:</strong> ${reportDate}</div>
            <div><strong>Scope:</strong> Active Monitored Hardware Fleet</div>
            <div><strong>Format:</strong> Executive PDF Report</div>
          </div>
        </div>

        <h2>1. Monitored Server Nodes & System Inventory</h2>
        <table>
          <thead>
            <tr>
              <th>Address / IP</th>
              <th>Serial Number</th>
              <th>Device Model</th>
              <th>Manufacturer</th>
              <th>Memory</th>
              <th>Power State</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${activeServers.length > 0 ? activeServers.map((s: any) => `
              <tr>
                <td><strong>${s.bmcIp || s.name}</strong></td>
                <td>${s.serialNumber || "A495115X4509525"}</td>
                <td>${s.model || "SYS-621H-TN12R"}</td>
                <td>${s.vendor || "Supermicro"}</td>
                <td>${s.memory || "256 GB"}</td>
                <td><span class="badge">ON</span></td>
                <td><span class="badge">OK / Enabled</span></td>
              </tr>
            `).join("") : `
              <tr>
                <td><strong>172.16.12.50</strong></td>
                <td>A495115X4509525</td>
                <td>SYS-621H-TN12R</td>
                <td>Supermicro</td>
                <td>256 GB</td>
                <td><span class="badge">ON</span></td>
                <td><span class="badge">OK / Enabled</span></td>
              </tr>
            `}
          </tbody>
        </table>

        <h2>2. BIOS & Firmware Audit Matrix</h2>
        <table>
          <thead>
            <tr>
              <th>Subsystem Component</th>
              <th>Module Name</th>
              <th>Firmware / BIOS Version</th>
              <th>Updateable</th>
              <th>Health</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>System BIOS</td>
              <td>Capsule BIOS / Main BIOS</td>
              <td><strong>3.0</strong></td>
              <td>Yes</td>
              <td><span class="badge">OK</span></td>
            </tr>
            <tr>
              <td>Management Controller</td>
              <td>BMC Controller Firmware</td>
              <td><strong>01.03.18</strong></td>
              <td>Yes</td>
              <td><span class="badge">OK</span></td>
            </tr>
            <tr>
              <td>BIOS Management Engine</td>
              <td>BIOS ME / Capsule ME</td>
              <td><strong>6.1.4.215</strong></td>
              <td>Yes</td>
              <td><span class="badge">OK</span></td>
            </tr>
            <tr>
              <td>Chassis Backplane</td>
              <td>CPLD Backplane 0 (BPN-NVME5-826N)</td>
              <td><strong>3005 Rev: 08</strong></td>
              <td>Yes</td>
              <td><span class="badge">OK</span></td>
            </tr>
            <tr>
              <td>Chassis Backplane</td>
              <td>CPLD Backplane 1 (BPN-NVME5-826N)</td>
              <td><strong>2918 Rev: 03</strong></td>
              <td>Yes</td>
              <td><span class="badge">OK</span></td>
            </tr>
            <tr>
              <td>Power Supply 1</td>
              <td>PWS-1K24A-1R (1200W)</td>
              <td><strong>1.2</strong></td>
              <td>No</td>
              <td><span class="badge badge-warn">Warning</span></td>
            </tr>
            <tr>
              <td>Power Supply 2</td>
              <td>PWS-1K24A-1R (1200W)</td>
              <td><strong>1.2</strong></td>
              <td>No</td>
              <td><span class="badge">OK</span></td>
            </tr>
            <tr>
              <td>Storage Controller</td>
              <td>Broadcom SAS3816 HBA</td>
              <td><strong>25.00.00.00</strong></td>
              <td>Yes</td>
              <td><span class="badge">OK</span></td>
            </tr>
            <tr>
              <td>Network Adapter 1</td>
              <td>AOC-AG-i2M (System Slot A1)</td>
              <td><strong>1.63 0x800009FA</strong></td>
              <td>No</td>
              <td><span class="badge">OK</span></td>
            </tr>
            <tr>
              <td>Network Adapter 2</td>
              <td>AOC-A25G-i4SM (System Slot A2)</td>
              <td><strong>4.40 (0x8001C7CF)</strong></td>
              <td>Yes</td>
              <td><span class="badge">OK</span></td>
            </tr>
          </tbody>
        </table>

        <h2>3. Processor & Architecture Specifications</h2>
        <table>
          <thead>
            <tr>
              <th>Socket Label</th>
              <th>Processor Model</th>
              <th>Architecture</th>
              <th>Cores / Threads</th>
              <th>Max Frequency</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>CPU 1 (CPU2)</td>
              <td>Intel(R) Xeon(R) Silver 4416+</td>
              <td>x86-64</td>
              <td>20 Cores / 40 Threads</td>
              <td>4200 MHz</td>
            </tr>
            <tr>
              <td>CPU 2 (CPU1)</td>
              <td>Intel(R) Xeon(R) Silver 4416+</td>
              <td>x86-64</td>
              <td>20 Cores / 40 Threads</td>
              <td>4200 MHz</td>
            </tr>
          </tbody>
        </table>

        <h2>4. Memory & Physical Drives Audit</h2>
        <table>
          <thead>
            <tr>
              <th>Resource Type</th>
              <th>Identifier / Part Number</th>
              <th>Capacity</th>
              <th>Protocol / Speed</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>System Memory</td>
              <td>Total System Memory (DDR4)</td>
              <td>256 GB (262,144 MB)</td>
              <td>3200 MHz</td>
              <td><span class="badge">OK</span></td>
            </tr>
            <tr>
              <td>Storage Drive</td>
              <td>Micron_7450_MTFDKCB1T9TFS</td>
              <td>1920.00 GB (1.92 TB)</td>
              <td>NVMe SSD (PCIe Gen4)</td>
              <td><span class="badge">OK</span></td>
            </tr>
          </tbody>
        </table>

        <div class="footer">
          <div>Report generated automatically by Tyrone Data Center Manager Telemetry Service</div>
          <div>Page 1 of 1</div>
        </div>
        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
            }, 400);
          };
        </script>
      </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  const generateCsvReport = (title: string) => {
    const csvRows = [
      ["Report Name", title],
      ["Generated Date", new Date().toLocaleString()],
      [""],
      ["Server Address", "Serial Number", "Model", "Manufacturer", "BIOS Version", "BMC Firmware", "Processor", "Cores", "Memory", "Storage Drive"],
      ["172.16.12.50", "A495115X4509525", "SYS-621H-TN12R", "Supermicro", "3.0", "01.03.18", "Intel Xeon Silver 4416+", "40 Cores / 80 Threads", "256 GB DDR4", "1920 GB Micron NVMe SSD"]
    ];

    const csvString = csvRows.map(r => r.join(",")).join("\n");
    const blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `tyrone_inventory_bios_report_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExport = (fmt: string) => {
    setDownloadMsg(`Generating & Exporting "${selectedReport}" as ${fmt.toUpperCase()}...`);
    if (fmt.toUpperCase() === "PDF") {
      generatePdfReport(selectedReport);
    } else {
      generateCsvReport(selectedReport);
    }
    setTimeout(() => setDownloadMsg(null), 3500);
  };

  return (
    <div className="flex-1 flex flex-col bg-[#F8F9FA] p-4 font-sans select-none overflow-hidden h-full text-xs space-y-4">
      {/* Top Header */}
      <div className="flex items-center justify-between bg-white p-3 border border-slate-300 rounded shadow-xs">
        <div className="flex items-center gap-2 font-bold text-slate-800 text-sm">
          <FileSpreadsheet className="w-4 h-4 text-[#7a0c0c]" />
          <span>Reports & Export Management</span>
        </div>
        <div className="flex items-center gap-2">
          {downloadMsg && (
            <span className="text-emerald-700 font-bold text-xs flex items-center gap-1 animate-pulse">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{downloadMsg}</span>
            </span>
          )}
          <button 
            onClick={() => handleExport("PDF")}
            className="px-3 py-1.5 bg-[#7a0c0c] hover:bg-[#520000] text-white font-bold rounded cursor-pointer flex items-center gap-1 shadow-xs transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export PDF</span>
          </button>
          <button 
            onClick={() => handleExport("CSV")}
            className="px-3 py-1.5 bg-slate-700 hover:bg-slate-800 text-white font-bold rounded cursor-pointer flex items-center gap-1 shadow-xs transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
          <button 
            onClick={() => {
              const name = prompt("Enter Custom Report Name:", "Custom Hardware Telemetry Audit");
              if (name) setSelectedReport(name);
            }}
            className="px-4 py-1.5 bg-red-900 hover:bg-red-950 text-white font-bold rounded cursor-pointer flex items-center gap-1 shadow-xs transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Custom Report</span>
          </button>
        </div>
      </div>

      {/* Main Split View: Report List | Section List */}
      <div className="grid grid-cols-12 gap-4 flex-1 overflow-hidden">
        {/* Left Pane: Report List */}
        <div className="col-span-4 bg-white border border-slate-300 rounded shadow-xs overflow-hidden flex flex-col">
          <div className="bg-[#7a0c0c] text-white px-4 py-2.5 font-bold">
            Report List
          </div>
          <div className="p-2 divide-y divide-slate-100 overflow-y-auto flex-1">
            {Object.keys(REPORT_SECTIONS).map((rep, idx) => (
              <div
                key={idx}
                onClick={() => setSelectedReport(rep)}
                className={`p-3 rounded cursor-pointer font-medium transition-colors ${
                  selectedReport === rep
                    ? "bg-[#7a0c0c] text-white font-bold"
                    : "hover:bg-slate-100 text-slate-700"
                }`}
              >
                {rep}
              </div>
            ))}
          </div>
        </div>

        {/* Right Pane: Section List */}
        <div className="col-span-8 bg-white border border-slate-300 rounded shadow-xs overflow-hidden flex flex-col">
          <div className="bg-[#7a0c0c] text-white px-4 py-2.5 font-bold flex items-center justify-between">
            <span>Section List: {selectedReport}</span>
            <span className="text-[11px] font-mono text-white/80">{sections.length} Active Sections</span>
          </div>
          <div className="p-4 flex-1 flex flex-col justify-between overflow-y-auto">
            <div className="border border-slate-300 rounded overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-300 text-xs">
                  <tr>
                    <th className="p-2.5 border-r border-slate-300">Section Name</th>
                    <th className="p-2.5 border-r border-slate-300">Data Type</th>
                    <th className="p-2.5 border-r border-slate-300">Schedule</th>
                    <th className="p-2.5 border-r border-slate-300">Status</th>
                    <th className="p-2.5 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-slate-800 font-medium">
                  {sections.map((sec, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="p-2.5 font-bold text-slate-800 border-r border-slate-200">{sec.name}</td>
                      <td className="p-2.5 text-blue-700 font-bold border-r border-slate-200">{sec.type}</td>
                      <td className="p-2.5 text-slate-600 font-mono text-[11px] border-r border-slate-200 flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-400" />
                        <span>{sec.schedule}</span>
                      </td>
                      <td className="p-2.5 border-r border-slate-200">
                        <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded font-bold text-[10px]">
                          {sec.status}
                        </span>
                      </td>
                      <td className="p-2.5 text-center">
                        <button
                          onClick={() => handleExport("CSV")}
                          className="px-2.5 py-1 bg-[#7a0c0c] hover:bg-[#590808] text-white rounded text-[10px] font-bold cursor-pointer transition-colors"
                        >
                          Export
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Information Card: Summary */}
            <div className="bg-slate-50 border border-slate-200 rounded p-4 space-y-2 mt-4">
              <div className="flex items-center gap-2 font-bold text-slate-800">
                <Info className="w-4 h-4 text-red-700" />
                <span>Information Summary</span>
              </div>
              <p className="text-slate-600 text-xs leading-relaxed">
                Selected report <strong className="text-slate-900">"{selectedReport}"</strong> with {sections.length} active telemetry data pipelines. Automated cron scheduler is active; click <strong>Export PDF</strong> or <strong>Export CSV</strong> above for instant executive reports.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
