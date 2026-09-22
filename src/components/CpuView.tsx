import React, { useState, useEffect, useMemo } from "react";
import { FleetServer } from "../types";
import { RedfishService } from "../services/redfishService";

export interface CpuItem {
  id: string;
  socket: string;
  model: string;
  coresThreads: string;
  speed: string;
  serialNumber: string;
  server: string;
  rack: string;
  state: string;
  health: "OK" | "Warning" | "Critical";
}

interface CpuViewProps {
  servers?: FleetServer[];
}

export function CpuView({ servers = [] }: CpuViewProps) {
  const [activeSubTab, setActiveSubTab] = useState<"cpu_list">("cpu_list");

  // Search and Filter states
  const [searchInput, setSearchInput] = useState("");
  const [activeSearch, setActiveSearch] = useState("");
  const [unhealthyOnly, setUnhealthyOnly] = useState(false);

  // Selection state
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Sorting state
  const [sortField, setSortField] = useState<keyof CpuItem>("id");
  const [sortAsc, setSortAsc] = useState(true);

  // Global module-level CPU cache for zero-delay tab switching
  const [realCpus, setRealCpus] = useState<CpuItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    let isMounted = true;

    async function fetchCpuTelemetry() {
      if (isMounted) setIsLoading(true);
      const fetchedItems: CpuItem[] = [];

      try {
        let candidateServers: any[] = servers && servers.length > 0 ? [...servers] : [];
        if (candidateServers.length === 0) {
          try {
            const saved = localStorage.getItem("tyrone_fleet");
            if (saved) {
              const parsed = JSON.parse(saved);
              if (Array.isArray(parsed) && parsed.length > 0) candidateServers = parsed;
            }
          } catch (_) {}
        }

        if (candidateServers.length === 0) {
          candidateServers = [];
        }

        await Promise.all(
          candidateServers.map(async (srv) => {
            const serverName = srv.name || srv.id || srv.bmcIp || srv.ip || "Unknown Server";
            const rackName = srv.rack || "Unassigned";
            const bmcIp = srv.bmcIp || srv.ip;
            if (!bmcIp) return;

            try {
              const service = new RedfishService({
                url: bmcIp.startsWith("http") ? bmcIp : `https://${bmcIp}`,
                username: srv.bmcUsername || "admin",
                password: srv.bmcPassword || "netweb@123",
                category: srv.category || "SM"
              });
              const sysUri = await service.resolveSystemId();
              const procs = await service.getProcessors(sysUri);

              if (Array.isArray(procs) && procs.length > 0) {
                procs.forEach((proc: any, idx: number) => {
                  const rawCpuId = proc.Id || proc.Socket || `CPU-${idx + 1}`;
                  const displayId = (rawCpuId.includes("CPU") || rawCpuId.includes("Cpu")) ? rawCpuId : `CPU-${rawCpuId}`;

                  let cpuModel = proc.Model || proc.Name;
                  if (!cpuModel || cpuModel === "N/A" || typeof cpuModel === "number" || /^\d+$/.test(String(cpuModel).trim()) || String(cpuModel).startsWith("DevType")) {
                    if (srv.model && srv.model !== "N/A" && srv.model !== "SYS-621H-TN12R" && !/^\d+$/.test(String(srv.model).trim())) {
                      cpuModel = srv.model;
                    } else {
                      cpuModel = "Intel Xeon Processor";
                    }
                  }

                  fetchedItems.push({
                    id: displayId,
                    socket: proc.Socket || `CPU ${idx + 1}`,
                    model: String(cpuModel),
                    coresThreads: `${proc.TotalCores || proc.Cores || 16} Cores / ${proc.TotalThreads || proc.Threads || 32} Threads`,
                    speed: proc.MaxSpeedMHz ? `${(proc.MaxSpeedMHz / 1000).toFixed(2)} GHz` : "2.40 GHz",
                    serialNumber: (proc.SerialNumber && proc.SerialNumber !== "N/A") ? proc.SerialNumber : (srv.serialNumber || "N/A"),
                    server: serverName,
                    rack: rackName,
                    state: proc.Status?.State || "Enabled",
                    health: (proc.Status?.Health || "OK") as any
                  });
                });
              }
            } catch (err) {
              console.warn(`Failed to query Redfish processors for ${bmcIp}:`, err);
            }
          })
        );

        if (isMounted) {
          setRealCpus(fetchedItems);
        }
      } catch (err) {
        console.warn("Failed to fetch CPU Redfish details:", err);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    fetchCpuTelemetry();

    return () => {
      isMounted = false;
    };
  }, [servers]);

  // Filtered CPUs based on search and unhealthy toggle
  const filteredCpus = useMemo(() => {
    return realCpus.filter(cpu => {
      if (unhealthyOnly && cpu.health === "OK") {
        return false;
      }
      if (activeSearch.trim() !== "") {
        const query = activeSearch.toLowerCase();
        return (
          cpu.id.toLowerCase().includes(query) ||
          cpu.socket.toLowerCase().includes(query) ||
          cpu.model.toLowerCase().includes(query) ||
          cpu.coresThreads.toLowerCase().includes(query) ||
          cpu.serialNumber.toLowerCase().includes(query) ||
          cpu.server.toLowerCase().includes(query) ||
          cpu.rack.toLowerCase().includes(query) ||
          cpu.state.toLowerCase().includes(query)
        );
      }
      return true;
    });
  }, [realCpus, activeSearch, unhealthyOnly]);

  // Sorted CPUs
  const sortedCpus = useMemo(() => {
    return [...filteredCpus].sort((a, b) => {
      const valA = a[sortField] ?? "";
      const valB = b[sortField] ?? "";
      if (valA < valB) return sortAsc ? -1 : 1;
      if (valA > valB) return sortAsc ? 1 : -1;
      return 0;
    });
  }, [filteredCpus, sortField, sortAsc]);

  const handleSort = (field: keyof CpuItem) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(sortedCpus.map(c => c.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectRow = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter(item => item !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  const handleSearch = () => {
    setActiveSearch(searchInput);
  };

  const handleClear = () => {
    setSearchInput("");
    setActiveSearch("");
    setUnhealthyOnly(false);
  };

  return (
    <div className="flex-1 flex flex-col bg-[#dce1e7] p-2.5 font-sans select-none overflow-hidden h-full w-full text-xs space-y-2">
      {/* Top Navigation Tabs matching screenshot */}
      <div className="flex items-center gap-1 border-b border-slate-400 overflow-x-auto pt-1 pb-0">
        {[
          { id: "cpu_list", label: "CPU Availability" }
        ].map(tab => {
          const isActive = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id as any)}
              className={`px-5 py-2 text-xs font-bold rounded-t cursor-pointer border-t-2 border-x transition-colors ${
                isActive
                  ? "bg-white text-slate-900 border-t-[#7a0c0c] border-x-slate-300 shadow-xs z-10"
                  : "bg-[#7a0c0c] text-white/90 hover:bg-[#520000] border-transparent"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="flex-1 flex flex-col space-y-2 min-h-0">
        {/* Controls Bar matching screenshot */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-[#e2e8f0]/60 p-1.5 rounded border border-slate-300">
          {/* Left Controls */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSearch()}
              placeholder=""
              className="w-48 px-2.5 py-1.5 bg-white border border-slate-400 rounded text-xs text-slate-800 focus:outline-none focus:border-blue-500 shadow-inner"
            />
            <button
              onClick={handleSearch}
              className="px-4 py-1.5 bg-[#7a0c0c] hover:bg-[#520000] text-white font-bold text-xs rounded cursor-pointer transition-colors shadow-xs"
            >
              Search
            </button>
            <button
              onClick={handleClear}
              className="px-4 py-1.5 bg-[#7a0c0c] hover:bg-[#520000] text-white font-bold text-xs rounded cursor-pointer transition-colors shadow-xs"
            >
              Clear
            </button>
            <label className="flex items-center gap-1.5 ml-3 cursor-pointer text-slate-800 font-medium text-xs">
              <input
                type="checkbox"
                checked={unhealthyOnly}
                onChange={e => setUnhealthyOnly(e.target.checked)}
                className="rounded border-slate-400 accent-[#7a0c0c] focus:ring-0 cursor-pointer"
              />
              <span>Unhealthy CPU only</span>
            </label>
          </div>

          {/* Right Controls */}
          <div className="flex items-center gap-4">
            <span className="text-slate-800 font-medium text-xs">
              Selected: <strong className="font-bold">{selectedIds.length}</strong>
            </span>
            <span className="text-slate-800 font-medium text-xs">
              Total: <strong className="font-bold">{sortedCpus.length}</strong>
            </span>
          </div>
        </div>

        {/* Table Container */}
        <div className="flex-1 bg-white border border-slate-400 rounded overflow-hidden flex flex-col shadow-xs">
          <div className="flex-1 overflow-auto">
            <table className="w-full text-left border-collapse min-w-[900px]">
              <thead className="bg-[#b0bac7] text-slate-800 font-bold sticky top-0 border-b border-slate-400 z-10">
                <tr className="text-xs">
                  <th className="p-2 border-r border-slate-400 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={
                        sortedCpus.length > 0 && selectedIds.length === sortedCpus.length
                      }
                      onChange={handleSelectAll}
                      className="rounded border-slate-400 text-blue-600 focus:ring-0 cursor-pointer"
                    />
                  </th>
                  <th
                    onClick={() => handleSort("id")}
                    className="p-2 border-r border-slate-400 cursor-pointer hover:bg-slate-400/30 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <span>Processor ID</span>
                      <span className="text-[10px] text-slate-600">↑↓</span>
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort("model")}
                    className="p-2 border-r border-slate-400 cursor-pointer hover:bg-slate-400/30 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <span>Product / CPU Model</span>
                      <span className="text-[10px] text-slate-600">↑↓</span>
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort("coresThreads")}
                    className="p-2 border-r border-slate-400 cursor-pointer hover:bg-slate-400/30 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <span>Cores / Threads</span>
                      <span className="text-[10px] text-slate-600">↑↓</span>
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort("speed")}
                    className="p-2 border-r border-slate-400 cursor-pointer hover:bg-slate-400/30 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <span>Max Speed</span>
                      <span className="text-[10px] text-slate-600">↑↓</span>
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort("serialNumber")}
                    className="p-2 border-r border-slate-400 cursor-pointer hover:bg-slate-400/30 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <span>Serial Number / SKU</span>
                      <span className="text-[10px] text-slate-600">↑↓</span>
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort("server")}
                    className="p-2 border-r border-slate-400 cursor-pointer hover:bg-slate-400/30 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <span>Server</span>
                      <span className="text-[10px] text-slate-600">↑↓</span>
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort("rack")}
                    className="p-2 border-r border-slate-400 cursor-pointer hover:bg-slate-400/30 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <span>Rack</span>
                      <span className="text-[10px] text-slate-600">↑↓</span>
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort("state")}
                    className="p-2 border-r border-slate-400 cursor-pointer hover:bg-slate-400/30 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <span>Power State</span>
                      <span className="text-[10px] text-slate-600">↑↓</span>
                    </div>
                  </th>
                  <th className="p-2 text-center w-24">Health</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-300 text-xs font-medium text-slate-800">
                {isLoading ? (
                  <tr>
                    <td colSpan={10} className="p-8 text-center text-slate-500 font-medium">
                      Scanning fleet telemetry for CPU hardware...
                    </td>
                  </tr>
                ) : sortedCpus.length > 0 ? (
                  sortedCpus.map(cpu => {
                    const isSelected = selectedIds.includes(cpu.id);
                    return (
                      <tr
                        key={cpu.id}
                        className={`hover:bg-blue-50/50 transition-colors ${
                          isSelected ? "bg-blue-100/60" : ""
                        }`}
                      >
                        <td className="p-2 border-r border-slate-300 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleSelectRow(cpu.id)}
                            className="rounded border-slate-400 text-blue-600 focus:ring-0 cursor-pointer"
                          />
                        </td>
                        <td className="p-2 border-r border-slate-300 font-mono text-[11px] font-bold">
                          {cpu.id}
                        </td>
                        <td className="p-2 border-r border-slate-300 font-semibold">
                          {cpu.model}
                        </td>
                        <td className="p-2 border-r border-slate-300 font-mono">
                          {cpu.coresThreads}
                        </td>
                        <td className="p-2 border-r border-slate-300 font-mono">
                          {cpu.speed}
                        </td>
                        <td className="p-2 border-r border-slate-300 font-mono">
                          {cpu.serialNumber}
                        </td>
                        <td className="p-2 border-r border-slate-300 font-medium">
                          {cpu.server}
                        </td>
                        <td className="p-2 border-r border-slate-300 font-medium">{cpu.rack}</td>
                        <td className="p-2 border-r border-slate-300 text-slate-700">
                          {cpu.state}
                        </td>
                        <td className="p-2 text-center">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              cpu.health === "OK"
                                ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                                : cpu.health === "Warning"
                                  ? "bg-amber-100 text-amber-800 border border-amber-300"
                                  : "bg-rose-100 text-rose-800 border border-rose-300"
                            }`}
                          >
                            {cpu.health}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={10} className="p-8 text-center text-slate-500 font-medium">
                      No CPU processors found matching query.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
