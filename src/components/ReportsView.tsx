import React from "react";
import { FileBarChart, Download, Filter, Search } from "lucide-react";

export function ReportsView({ servers = [] }: { servers?: any[] }) {
  return (
    <div className="flex-1 flex flex-col bg-[#dce1e7] p-2.5 font-sans select-none overflow-hidden h-full">
      {/* Top Sub-tabs / Header */}
      <div className="border-b border-slate-400 mb-2.5 flex items-center justify-between pt-1 pb-2 shrink-0">
        <div className="flex items-center gap-2">
          <FileBarChart className="w-5 h-5 text-[#680505]" />
          <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Reports & Audit Log Console</h2>
        </div>
        <div className="flex items-center gap-2">
          <button className="px-3 py-1.5 bg-[#680505] text-white rounded text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer hover:bg-[#520000]">
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Main Reports Table Container */}
      <div className="flex-1 bg-white border border-slate-300 rounded-xl shadow-xs p-4 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between mb-3 text-xs">
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search reports by server or topic..."
              className="px-3 py-1 bg-slate-50 border border-slate-300 rounded text-xs font-medium focus:outline-none focus:border-[#680505]"
            />
          </div>
          <span className="text-slate-500 font-mono text-[11px]">Total Monitored Nodes: {servers.length}</span>
        </div>

        <div className="flex-1 overflow-auto border border-slate-200 rounded">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-300 uppercase tracking-wider text-[11px]">
              <tr>
                <th className="px-3 py-2 border-r border-slate-300">Report Category</th>
                <th className="px-3 py-2 border-r border-slate-300">Target Node</th>
                <th className="px-3 py-2 border-r border-slate-300">Status</th>
                <th className="px-3 py-2">Generated Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 font-medium text-slate-800">
              {servers.map((s: any, idx: number) => (
                <tr key={idx} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                  <td className="px-3 py-2 border-r border-slate-200 font-bold text-[#680505]">Server Inventory & Health Audit</td>
                  <td className="px-3 py-2 border-r border-slate-200">{s.name || "Server Node"} ({s.bmcIp || s.ip || "N/A"})</td>
                  <td className="px-3 py-2 border-r border-slate-200">
                    <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded font-bold text-[10px] uppercase">Compliant</span>
                  </td>
                  <td className="px-3 py-2 text-slate-500 font-mono text-[11px]">{new Date().toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
