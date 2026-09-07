import React, { useState, useMemo, useEffect } from "react";
import { AlertTriangle, RefreshCw, Trash2, Download, Search, X, Radio, Bell, Plus, ShieldCheck, CheckCircle2, Server, Info } from "lucide-react";
import axios from "axios";
import { ConfirmModal } from "./ConfirmModal";
import { RedfishService } from "../services/redfishService";

interface HardwareLog {
  id: string;
  type: "NIC" | "HBA" | "Power" | "Thermal" | string;
  message: string;
  severity: "OK" | "Warning" | "Critical";
  timestamp: string;
  server: string;
}

interface EventsViewProps {
  alerts: HardwareLog[];
  onClearAlerts: () => void;
  onScan: () => void;
  isScanning: boolean;
  lastScanTime: string;
  onSelectServer?: (serverId: string) => void;
  servers?: Array<{ id: string; bmcIp: string; name: string }>;
}

interface EventSubscription {
  id: string;
  name: string;
  destination: string;
  eventTypes: string[];
  protocol: string;
  context: string;
  created: string;
}

export function EventsView({ alerts, onClearAlerts, onScan, isScanning, lastScanTime, onSelectServer, servers = [] }: EventsViewProps) {
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const [liveFetchedLogs, setLiveFetchedLogs] = useState<HardwareLog[]>([]);
  const [isRefreshingLogs, setIsRefreshingLogs] = useState<boolean>(false);
  const [selectedSeverityFilter, setSelectedSeverityFilter] = useState<string>("All");
  const [fetchFullHistory, setFetchFullHistory] = useState<boolean>(false);

  // Fetch event logs across ALL servers in active fleet
  const fetchLiveLogs = async () => {
    setIsRefreshingLogs(true);
    try {
      const activeFleet = (servers || []).filter((s: any) =>
        s.bmcIp !== "172.16.12.142" && s.bmcIp !== "172.16.15.202" && s.bmcIp !== "172.16.15.237"
      );
      const deletedKeys = (() => {
        try {
          const raw = localStorage.getItem("tyrone_deleted_keys");
          return raw ? new Set<string>(JSON.parse(raw)) : new Set<string>();
        } catch {
          return new Set<string>();
        }
      })();

      const validServers = (Array.isArray(activeFleet) ? activeFleet : []).filter((s: any) =>
        !deletedKeys.has(String(s.id).toLowerCase()) &&
        !deletedKeys.has(String(s.bmcIp).toLowerCase()) &&
        !deletedKeys.has(String(s.name).toLowerCase())
      );

      if (validServers.length === 0) {
        setLiveFetchedLogs([]);
        setIsRefreshingLogs(false);
        return;
      }

      const limitParam = fetchFullHistory ? 1000 : 10;
      const res = await axios.get(`/api/local/logs?limit=${limitParam}`).catch(() => null);
      const backendLogs = (res?.data && Array.isArray(res.data)) ? res.data : [];

      const bmcLogPromises = validServers.map(async (server: any) => {
        if (!server?.bmcIp) return [];
        try {
          const bmcUser = (server.bmcUsername && server.bmcUsername.trim()) ? server.bmcUsername.trim() : "admin";
          const bmcPass = (server.bmcPassword !== undefined && server.bmcPassword !== null) ? server.bmcPassword.trim() : "netweb@123";
          const service = new RedfishService({
            url: server.bmcIp.startsWith("http") ? server.bmcIp : `https://${server.bmcIp}`,
            username: bmcUser,
            password: bmcPass
          });
          const logs = await service.getEventLogs("1").catch(() => []);
          if (Array.isArray(logs) && logs.length > 0) {
            const mapped = logs.map((l: any, idx: number) => ({
              id: l.Id || `bmc-${server.bmcIp}-${idx}`,
              type: l.SensorType || l.EntryType || "Power",
              message: l.Message || l.Name || `BMC System Event Log [OEM]: Event on ${server.name || server.bmcIp}`,
              severity: l.Severity === "Critical" ? "Critical" : (l.Severity === "Warning" ? "Warning" : "OK"),
              timestamp: l.Created ? l.Created.replace("T", " ").slice(0, 19) : new Date().toISOString().replace("T", " ").slice(0, 19),
              server: server.bmcIp
            }));
            return fetchFullHistory ? mapped : mapped.slice(0, 10);
          }
        } catch (_) {}
        return [];
      });

      const bmcResults = await Promise.all(bmcLogPromises);
      const allBmcLogs = bmcResults.flat();

      const merged = [...allBmcLogs, ...backendLogs];
      setLiveFetchedLogs(fetchFullHistory ? merged : merged.slice(0, 10));
    } catch (_) {
    } finally {
      setIsRefreshingLogs(false);
    }
  };

  useEffect(() => {
    fetchLiveLogs();
    const interval = setInterval(fetchLiveLogs, 2000);
    return () => clearInterval(interval);
  }, [fetchFullHistory]);

  const activeAlerts = useMemo(() => {
    const deletedKeys = (() => {
      try {
        const raw = localStorage.getItem("tyrone_deleted_keys");
        return raw ? new Set<string>(JSON.parse(raw)) : new Set<string>();
      } catch {
        return new Set<string>();
      }
    })();

    const activeServers = (servers || []).filter(s => {
      const idStr = String(s.id || "").toLowerCase();
      const ipStr = String(s.bmcIp || "").toLowerCase();
      const nameStr = String(s.name || "").toLowerCase();
      return !deletedKeys.has(idStr) && !deletedKeys.has(ipStr) && !deletedKeys.has(nameStr);
    });

    if (activeServers.length === 0) {
      return [];
    }

    const validServerIps = new Set<string>(
      activeServers.map(s => String(s.bmcIp || s.id || s.name).toLowerCase())
    );

    const combined = [...liveFetchedLogs, ...(alerts || [])];
    const seen = new Set<string>();
    const unique: HardwareLog[] = [];
    combined.forEach((item, idx) => {
      const srvStr = String(item.server || "").toLowerCase();
      if (deletedKeys.has(srvStr)) return;

      // STRICT FILTER: Only show event if it belongs to one of the added active devices!
      const matchesAddedDevice = Array.from(validServerIps).some(validIp =>
        srvStr === validIp || srvStr.includes(validIp) || validIp.includes(srvStr)
      );
      if (!matchesAddedDevice) return;

      const key = item.id || `${item.server}-${item.message}-${item.timestamp}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push({
          id: item.id || `evt-${idx}-${Date.now()}`,
          type: (item.type || "System") as any,
          message: String(item.message || "Hardware alert recorded"),
          severity: (item.severity === "Critical" || item.severity === "Warning" ? item.severity : "OK") as any,
          timestamp: String(item.timestamp || new Date().toISOString().replace("T", " ").slice(0, 19)),
          server: String(item.server || "")
        });
      }
    });
    return unique;
  }, [liveFetchedLogs, alerts, servers]);


  const [activeTab, setActiveTab] = useState<"events" | "event_service" | "thresholds">("events");
  const [selectedServerFilter, setSelectedServerFilter] = useState<string>("ALL");
  const [searchText, setSearchText] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [compressedView, setCompressedView] = useState(true);
  const [visibleLimit, setVisibleLimit] = useState<number>(50);
  const [selectedEventModal, setSelectedEventModal] = useState<HardwareLog | null>(null);
  const eventTableRef = React.useRef<HTMLDivElement>(null);

  const availableServers = useMemo(() => {
    return (servers || []).map(s => ({
      ip: s.bmcIp || s.name,
      name: s.name || s.bmcIp
    }));
  }, [servers]);

  // Redfish EventService Subscription Management State
  const [subscriptions, setSubscriptions] = useState<EventSubscription[]>([
    {
      id: "sub-1",
      name: "DCM Primary Event Listener",
      destination: "https://172.16.15.1:8443/api/events/receiver",
      eventTypes: ["StatusChange", "ResourceAdded", "Alert"],
      protocol: "Redfish",
      context: "DCMGatewayContext",
      created: "2026-08-01 10:00:00"
    }
  ]);

  const [newSubName, setNewSubName] = useState("");
  const [newSubDestination, setNewSubDestination] = useState("");
  const [newSubProtocol, setNewSubProtocol] = useState("Redfish");
  const [showAddSubModal, setShowAddSubModal] = useState(false);

  const handleAddSubscriptionSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubDestination.trim()) return;
    const newSub: EventSubscription = {
      id: `sub-${Date.now()}`,
      name: newSubName.trim() || `Subscription ${subscriptions.length + 1}`,
      destination: newSubDestination.trim(),
      eventTypes: ["StatusChange", "Alert"],
      protocol: newSubProtocol,
      context: "DCMGatewayContext",
      created: new Date().toISOString().replace("T", " ").slice(0, 19)
    };
    setSubscriptions(prev => [...prev, newSub]);
    setNewSubName("");
    setNewSubDestination("");
    setShowAddSubModal(false);
  };

  const handleDeleteSubscription = (id: string) => {
    setSubscriptions(prev => prev.filter(s => s.id !== id));
  };

  const now = new Date();
  const refreshTimestamp = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()} ${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;

  // Severity counts
  const severityCounts = useMemo(() => {
    const counts = { Custom: 0, Critical: 0, Error: 0, Warning: 0, Informative: 0 };
    activeAlerts.forEach(a => {
      if (a.severity === "Critical") counts.Critical++;
      else if (a.severity === "Warning") counts.Warning++;
      else counts.Informative++;
    });
    return counts;
  }, [activeAlerts]);

  // Category counts
  const categoryCounts = useMemo(() => {
    const cats: Record<string, number> = {
      "Asset Management": 0,
      "DC Health": 0,
      "DC Management": 0,
      "DCM Management": 0,
      "Device Management": 0,
      "Energy Management": 0,
      "Event / Notification": 0,
      "Threshold Based": 0,
      "Data Streaming": 0,
    };
    activeAlerts.forEach(a => {
      const catName = a.type === "Thermal" ? "DC Health" : (a.type === "Power" ? "Energy Management" : "Asset Management");
      if (cats[catName] !== undefined) {
        cats[catName]++;
      } else {
        cats["DC Health"]++;
      }
    });
    return cats;
  }, [activeAlerts]);

  // Events by day (last 7 days)
  const eventsByDay = useMemo(() => {
    const days: Record<string, number> = {};
    const d = new Date();
    for (let i = 6; i >= 0; i--) {
      const date = new Date(d);
      date.setDate(date.getDate() - i);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
      days[key] = 0;
    }
    activeAlerts.forEach(a => {
      if (a.timestamp) {
        const ts = a.timestamp.split(" ")[0]?.split("T")[0];
        if (ts && days[ts] !== undefined) days[ts]++;
      }
    });
    return days;
  }, [activeAlerts]);

  // Compressed: group by server+message, count duplicates
  const displayAlerts = useMemo(() => {
    if (!compressedView) return activeAlerts.map(a => ({ ...a, count: 1 }));
    const map = new Map<string, typeof activeAlerts[0] & { count: number }>();
    activeAlerts.forEach(a => {
      const key = `${a.server || "Server"}:${a.message || "Event"}`;
      if (map.has(key)) {
        map.get(key)!.count++;
      } else {
        map.set(key, { ...a, count: 1 });
      }
    });
    return [...map.values()];
  }, [activeAlerts, compressedView]);

  // Filter logic
  const filtered = useMemo(() => {
    let list = displayAlerts;
    const q = searchText.trim().toLowerCase();

    // 1. Target Server Filter (Defaults to ALL for all devices)
    if (selectedServerFilter && selectedServerFilter !== "ALL") {
      list = list.filter(a => (a.server || "").toLowerCase() === selectedServerFilter.toLowerCase());
    }

    // 2. Filter by Severity option
    if (selectedSeverityFilter && selectedSeverityFilter !== "All") {
      list = list.filter(a => {
        const sev = (a.severity || "").toLowerCase();
        const target = selectedSeverityFilter.toLowerCase();
        if (target === "critical") return sev === "critical";
        if (target === "warning") return sev === "warning";
        if (target.includes("ok") || target.includes("info")) return sev === "ok" || sev === "informative" || sev === "info";
        return true;
      });
    }

    // 3. Filter by Date range
    if (startDate) {
      list = list.filter(a => (a.timestamp || "").split(" ")[0] >= startDate);
    }
    if (endDate) {
      list = list.filter(a => (a.timestamp || "").split(" ")[0] <= endDate);
    }

    // 4. Search query: matches Server IP, Description, Event Type, or Severity
    if (q) {
      list = list.filter(a =>
        (a.server || "").toLowerCase().includes(q) ||
        (a.message || "").toLowerCase().includes(q) ||
        (a.type || "").toLowerCase().includes(q) ||
        (a.severity || "").toLowerCase().includes(q)
      );
    }

    return list;
  }, [displayAlerts, selectedServerFilter, selectedSeverityFilter, searchText, startDate, endDate]);

  const handleExportCSV = () => {
    const headers = ["Severity", "Entity", "Event Type", "Description", "Timestamp"];
    const rows = filtered.map(a => [
      a.severity,
      `"${a.server}"`,
      `"${a.type}"`,
      `"${a.message.replace(/"/g, '""')}"`,
      `"${a.timestamp}"`
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `tyrone_events_export_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleClearAll = () => {
    setShowClearConfirm(true);
  };

  const handleConfirmClearAll = async () => {
    setShowClearConfirm(false);
    try {
      await axios.post("/api/local/clear-logs");
    } catch (_) {}
    setLiveFetchedLogs([]);
    onClearAlerts();
  };


  const polarToCartesian = (cx: number, cy: number, r: number, angleInDegrees: number) => {
    const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
    return {
      x: cx + r * Math.cos(angleInRadians),
      y: cy + r * Math.sin(angleInRadians)
    };
  };

  // Donut chart SVG helper
  const DonutChart = ({
    data,
    size = 96,
    innerRadiusRatio = 0.55
  }: {
    data: { label: string; value: number; color: string }[];
    size?: number;
    innerRadiusRatio?: number;
  }) => {
    const total = data.reduce((s, d) => s + d.value, 0);
    const r = size / 2 - 4;
    const innerR = r * innerRadiusRatio;
    const cx = size / 2;
    const cy = size / 2;

    if (total === 0) {
      return (
        <div className="relative flex items-center justify-center shrink-0">
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            <circle cx={cx} cy={cy} r={r} fill="#f1f5f9" stroke="#cbd5e1" strokeWidth="1" />
            <circle cx={cx} cy={cy} r={innerR} fill="#ffffff" />
          </svg>
          <div className="absolute text-[10px] font-bold text-slate-400">0</div>
        </div>
      );
    }

    let cumulative = 0;

    return (
      <div className="relative flex items-center justify-center shrink-0 group">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="drop-shadow-xs">
          {data.map((d, i) => {
            if (d.value === 0) return null;
            const startAngle = (cumulative / total) * 360;
            cumulative += d.value;
            const endAngle = (cumulative / total) * 360;

            const outerStart = polarToCartesian(cx, cy, r, startAngle);
            const outerEnd = polarToCartesian(cx, cy, r, endAngle);
            const innerStart = polarToCartesian(cx, cy, innerR, startAngle);
            const innerEnd = polarToCartesian(cx, cy, innerR, endAngle);
            const largeArc = endAngle - startAngle > 180 ? 1 : 0;

            if (d.value === total) {
              return (
                <g key={i}>
                  <circle cx={cx} cy={cy} r={r} fill={d.color} />
                  <circle cx={cx} cy={cy} r={innerR} fill="#ffffff" />
                </g>
              );
            }

            const pathData = [
              `M ${outerStart.x} ${outerStart.y}`,
              `A ${r} ${r} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
              `L ${innerEnd.x} ${innerEnd.y}`,
              `A ${innerR} ${innerR} 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y}`,
              `Z`
            ].join(" ");

            return (
              <path
                key={i}
                d={pathData}
                fill={d.color}
                className="transition-opacity hover:opacity-85 cursor-pointer"
              >
                <title>{`${d.label}: ${d.value}`}</title>
              </path>
            );
          })}
        </svg>
        <div className="absolute flex flex-col items-center justify-center pointer-events-none">
          <span className="text-xs font-black text-slate-800 leading-none">{total}</span>
          <span className="text-[8px] font-semibold text-slate-400 uppercase tracking-tighter">Events</span>
        </div>
      </div>
    );
  };

  const maxDayVal = Math.max(...(Object.values(eventsByDay) as number[]), 1);
  const dayEntries = Object.entries(eventsByDay);

  const categoryColorMap: Record<string, string> = {
    "Asset Management": "#3b82f6",
    "DC Health": "#ef4444",
    "DC Management": "#f59e0b",
    "DCM Management": "#10b981",
    "Device Management": "#8b5cf6",
    "Energy Management": "#ec4899",
    "Event / Notification": "#06b6d4",
    "Threshold Based": "#f97316",
    "Data Streaming": "#64748b"
  };

  const tabs = [
    { id: "events" as const, label: "Events & SEL Logs" },
  ];

  return (
    <div className="flex-1 flex flex-col overflow-y-auto min-h-0 bg-[#dce1e7] p-3 font-sans w-full h-full text-xs">
      {/* Top tabs */}
      <div className="flex items-center gap-1 mb-3">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`px-5 py-2 text-xs font-bold uppercase tracking-wider rounded-t transition-all cursor-pointer ${activeTab === t.id
                ? "bg-white text-[#7a0c0c] border border-b-0 border-slate-300 shadow-xs font-extrabold"
                : "bg-[#7a0c0c] text-white hover:bg-[#520000]"
              }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: EVENTS & SEL LOGS                                                  */}
      {/* ========================================================================= */}
      {activeTab === "events" && (
        <div className="flex-1 flex flex-col min-h-0 w-full space-y-3">
          {/* Events title bar */}
          <div className="bg-[#7a0c0c] text-white py-2.5 text-xs font-bold tracking-wider rounded-t flex items-center justify-between px-4 shadow-xs">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-amber-300" />
              <span>Real-Time Datacenter & BMC Events</span>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  const nextState = !fetchFullHistory;
                  setFetchFullHistory(nextState);
                }}
                className={`px-3 py-1 rounded text-xs font-bold transition-all cursor-pointer border flex items-center gap-1.5 ${
                  fetchFullHistory
                    ? "bg-amber-500 hover:bg-amber-600 text-white border-amber-600 shadow-xs"
                    : "bg-white/20 hover:bg-white/30 text-white border-white/30"
                }`}
                title={fetchFullHistory ? "Currently showing full log history. Click to show recent 10 logs only." : "Currently showing recent 10 logs with details. Click to view previous historical logs."}
              >
                <Radio className="w-3.5 h-3.5" />
                <span>{fetchFullHistory ? "Showing All Logs (Click for Recent 10)" : "Show Previous Logs"}</span>
              </button>
              <button 
                onClick={fetchLiveLogs} 
                disabled={isRefreshingLogs}
                className="flex items-center gap-1 text-white/90 hover:text-white cursor-pointer text-xs font-semibold bg-white/10 px-2.5 py-1 rounded hover:bg-white/20 transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingLogs ? "animate-spin" : ""}`} />
                <span>Refresh Live</span>
              </button>
            </div>
          </div>

          {/* Charts Row */}
          <div className="bg-white border border-slate-300 rounded-b p-4 shadow-xs">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Events by Severity */}
              <div className="bg-slate-50/70 border border-slate-200/80 rounded-lg p-3 flex flex-col justify-between">
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-700 mb-2 border-b border-slate-200 pb-1 flex items-center justify-between">
                  <span>Events by Severity</span>
                  <span className="text-[10px] font-normal text-slate-500 font-mono">{activeAlerts.length} Total</span>
                </h4>
                <div className="flex items-center gap-4 py-1">
                  <DonutChart
                    data={[
                      { label: "Critical", value: severityCounts.Critical, color: "#ef4444" },
                      { label: "Warning", value: severityCounts.Warning, color: "#f59e0b" },
                      { label: "Informative", value: severityCounts.Informative, color: "#3b82f6" },
                    ]}
                    size={90}
                  />
                  <div className="text-[11px] space-y-1.5 flex-1">
                    {[
                      { label: "Critical", count: severityCounts.Critical, dotColor: "bg-red-500", textStyle: "text-red-700 font-bold" },
                      { label: "Warning", count: severityCounts.Warning, dotColor: "bg-amber-500", textStyle: "text-amber-800 font-bold" },
                      { label: "Informative", count: severityCounts.Informative, dotColor: "bg-blue-500", textStyle: "text-blue-700 font-medium" }
                    ].map((item) => (
                      <button
                        key={item.label}
                        type="button"
                        onClick={() => {
                          setSelectedSeverityFilter(item.label);
                          setVisibleLimit(50);
                        }}
                        className={`flex items-center gap-2 hover:bg-white px-2 py-1 rounded cursor-pointer transition-all w-full text-left border border-transparent hover:border-slate-200 group ${
                          selectedSeverityFilter === item.label ? "bg-white border-amber-300 ring-1 ring-amber-400 shadow-2xs" : "bg-transparent"
                        }`}
                        title={`Click to filter by ${item.label}`}
                      >
                        <span className={`w-2.5 h-2.5 rounded-full ${item.dotColor} group-hover:scale-110 transition-transform shrink-0`} />
                        <span className="text-slate-600 group-hover:text-slate-900 font-semibold text-[11px]">{item.label}:</span>
                        <span className={`ml-auto font-mono text-xs ${item.textStyle}`}>{item.count}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Events by Category */}
              <div className="bg-slate-50/70 border border-slate-200/80 rounded-lg p-3 flex flex-col justify-between">
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-700 mb-2 border-b border-slate-200 pb-1">
                  Events by Category
                </h4>
                <div className="flex items-start gap-3 py-1">
                  <DonutChart
                    data={Object.entries(categoryCounts).map(([cat, count]) => ({
                      label: cat,
                      value: Number(count) || 0,
                      color: categoryColorMap[cat] || "#64748b"
                    }))}
                    size={90}
                  />
                  <div className="text-[10px] grid grid-cols-1 gap-1 flex-1 max-h-[110px] overflow-y-auto pr-1">
                    {Object.entries(categoryCounts).map(([cat, count]) => {
                      const color = categoryColorMap[cat] || "#64748b";
                      return (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => {
                            setSearchText(cat);
                            setVisibleLimit(50);
                          }}
                          className={`flex items-center gap-1.5 hover:bg-white px-1.5 py-0.5 rounded cursor-pointer transition-colors w-full text-left border border-transparent hover:border-slate-200 group ${
                            searchText.toLowerCase() === cat.toLowerCase() ? "bg-white border-blue-300 ring-1 ring-blue-400" : "bg-transparent"
                          }`}
                          title={`Click to filter by ${cat}`}
                        >
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                          <span className="text-slate-600 truncate group-hover:text-slate-900 font-medium text-[10px] flex-1">{cat}</span>
                          <span className="font-mono font-bold text-slate-800 text-[10px] bg-slate-200/60 px-1.5 py-0.2 rounded-full">{count}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Controls & Device Selection Section */}
          <div className="bg-white border border-slate-300 rounded p-3 shadow-xs space-y-3">
            {/* Device / Server Single Selector Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-1.5 text-slate-800 font-bold text-xs bg-slate-100 px-3 py-1.5 rounded border border-slate-300">
                  <Server className="w-4 h-4 text-[#7a0c0c]" />
                  <span>Target Device / Server:</span>
                </div>

                {/* Single Dropdown Selector */}
                <select
                  value={selectedServerFilter}
                  onChange={e => setSelectedServerFilter(e.target.value)}
                  className="bg-white border border-slate-300 text-slate-900 font-bold text-xs rounded px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-red-500 shadow-xs cursor-pointer min-w-[260px]"
                >
                  <option value="ALL">🖥️ All Target Servers ({activeAlerts.length} events)</option>
                  {availableServers.map(s => {
                    const count = activeAlerts.filter(a => (a.server || "").toLowerCase() === s.ip.toLowerCase()).length;
                    return (
                      <option key={s.ip} value={s.ip}>
                        🖥️ {s.name} ({s.ip}) — [{count} events]
                      </option>
                    );
                  })}
                </select>

                {/* Severity Filter Dropdown */}
                <div className="flex items-center gap-1.5 bg-slate-100 border border-slate-300 px-2.5 py-1.5 rounded">
                  <span className="font-bold text-slate-700 text-xs">Severity:</span>
                  <select
                    value={selectedSeverityFilter}
                    onChange={e => setSelectedSeverityFilter(e.target.value)}
                    className="bg-white border border-slate-300 rounded px-2 py-0.5 font-bold text-slate-800 text-xs focus:outline-none cursor-pointer"
                  >
                    <option value="All">All Severities</option>
                    <option value="Critical">Critical Only</option>
                    <option value="Warning">Warning Only</option>
                    <option value="Informative">Informative Only</option>
                  </select>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2">
                <button
                  onClick={handleExportCSV}
                  className="px-3 py-1.5 bg-slate-700 hover:bg-slate-800 text-white rounded font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export CSV</span>
                </button>
                <button
                  onClick={handleClearAll}
                  className="px-3 py-1.5 bg-red-700 hover:bg-red-800 text-white rounded font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Clear Logs</span>
                </button>
              </div>
                {/* Group Duplicates Checkbox */}
              <label className="flex items-center gap-1.5 cursor-pointer text-slate-700 whitespace-nowrap font-semibold bg-slate-100 border border-slate-300 px-2.5 py-1 rounded">
                <input
                  type="checkbox"
                  checked={compressedView}
                  onChange={e => setCompressedView(e.target.checked)}
                  className="accent-[#7a0c0c] w-3.5 h-3.5 cursor-pointer"
                />
                <span>Group Duplicates</span>
              </label>
            </div>
          </div>

          {/* Event Log Table */}
          <div ref={eventTableRef} className="bg-white border border-slate-300 rounded shadow-xs overflow-x-auto flex-1 min-h-[300px]">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-[#1e293b] text-slate-100 font-bold sticky top-0 border-b border-slate-700 uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="p-2.5 border-r border-slate-700 w-28">Severity</th>
                  <th className="p-2.5 border-r border-slate-700 w-36">Entity / Server</th>
                  <th className="p-2.5 border-r border-slate-700 w-32">Event Type</th>
                  <th className="p-2.5 border-r border-slate-700">Description</th>
                  <th className="p-2.5 border-r border-slate-700 text-center w-20">Count</th>
                  <th className="p-2.5 w-44">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-medium">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-500">
                      <div className="flex flex-col items-center gap-2">
                        <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                        <span className="font-semibold">No matching events found. All systems operating normally.</span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filtered.slice(0, visibleLimit).map((item, idx) => (
                    <tr 
                      key={item.id || idx} 
                      onClick={() => setSelectedEventModal(item)}
                      className="hover:bg-slate-50/90 cursor-pointer transition-colors"
                    >
                      <td className="p-2.5 border-r border-slate-200 font-bold">
                        {item.severity === "Critical" ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] uppercase bg-red-100 text-red-800 border border-red-300 font-black shadow-2xs">
                            <AlertTriangle className="w-3 h-3 text-red-600 shrink-0" />
                            Critical
                          </span>
                        ) : item.severity === "Warning" ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] uppercase bg-amber-100 text-amber-800 border border-amber-300 font-black shadow-2xs">
                            <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />
                            Warning
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] uppercase bg-blue-50 text-blue-800 border border-blue-200 font-bold">
                            <Info className="w-3 h-3 text-blue-600 shrink-0" />
                            {item.severity}
                          </span>
                        )}
                      </td>
                      <td 
                        className="p-2.5 border-r border-slate-200 font-mono font-bold text-blue-700 hover:underline cursor-pointer"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedServerFilter(item.server);
                        }}
                        title={`Filter events specifically for ${item.server}`}
                      >
                        {item.server}
                      </td>
                      <td className="p-2.5 border-r border-slate-200 font-medium text-slate-700">
                        {item.type}
                      </td>
                      <td className="p-2.5 border-r border-slate-200 text-slate-800">
                        <div className="line-clamp-2 leading-relaxed">
                          {item.message}
                        </div>
                      </td>
                      <td className="p-2.5 border-r border-slate-200 text-center font-mono font-bold">
                        <span className="px-2 py-0.5 bg-slate-100 border border-slate-200 rounded font-mono font-bold text-slate-700 text-[11px]">
                          {item.count || 1}
                        </span>
                      </td>
                      <td className="p-2.5 font-mono text-slate-600 whitespace-nowrap">
                        {item.timestamp}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>


          {filtered.length > visibleLimit && (
            <div className="bg-slate-100 p-2 border border-slate-300 rounded flex items-center justify-between text-xs">
              <span className="text-slate-600 font-medium">
                Showing {visibleLimit} of {filtered.length} matching events
              </span>
              <button
                onClick={() => setVisibleLimit(prev => Math.min(filtered.length, prev + 50))}
                className="px-4 py-1 bg-[#7a0c0c] hover:bg-[#520000] text-white font-bold rounded cursor-pointer transition-colors"
              >
                Load More Events (+50)
              </button>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: REDFISH EVENTSERVICE SUBSCRIPTIONS                                 */}
      {/* ========================================================================= */}
      {activeTab === "event_service" && (
        <div className="bg-white border border-slate-300 rounded shadow-xs overflow-hidden flex flex-col flex-1 min-h-0">
          <div className="bg-[#7a0c0c] text-white px-4 py-2 font-bold text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Radio className="w-4 h-4 text-emerald-400" />
              <span>Redfish EventService Subscriptions & Webhook Streaming</span>
            </div>
            <button
              onClick={() => setShowAddSubModal(true)}
              className="px-3 py-1 bg-white text-slate-900 rounded font-bold text-xs flex items-center gap-1.5 cursor-pointer hover:bg-slate-100 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Subscription</span>
            </button>
          </div>

          <div className="p-4 space-y-4 overflow-y-auto flex-1 text-xs">
            <div className="bg-blue-50 border border-blue-200 rounded p-3 text-blue-900 flex items-start gap-2">
              <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <div>
                <strong>Redfish EventService Protocol:</strong> Out-of-band BMCs push real-time alerts, telemetry changes, and lifecycle events over HTTPS POST webhooks directly to registered endpoints.
              </div>
            </div>

            <div className="border border-slate-300 rounded overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-100 font-bold text-slate-700 border-b border-slate-300">
                  <tr>
                    <th className="p-2.5 border-r border-slate-300">Subscription ID</th>
                    <th className="p-2.5 border-r border-slate-300">Name / Context</th>
                    <th className="p-2.5 border-r border-slate-300">Destination Webhook URI</th>
                    <th className="p-2.5 border-r border-slate-300">Event Types</th>
                    <th className="p-2.5 border-r border-slate-300">Protocol</th>
                    <th className="p-2.5 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {subscriptions.map(sub => (
                    <tr key={sub.id} className="hover:bg-slate-50">
                      <td className="p-2.5 border-r border-slate-200 font-mono font-bold text-slate-800">{sub.id}</td>
                      <td className="p-2.5 border-r border-slate-200 font-bold text-blue-700">{sub.name}</td>
                      <td className="p-2.5 border-r border-slate-200 font-mono text-slate-700">{sub.destination}</td>
                      <td className="p-2.5 border-r border-slate-200">
                        <div className="flex flex-wrap gap-1">
                          {sub.eventTypes.map(t => (
                            <span key={t} className="px-2 py-0.5 bg-slate-200 rounded text-[10px] font-bold text-slate-800">
                              {t}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="p-2.5 border-r border-slate-200 font-mono">{sub.protocol}</td>
                      <td className="p-2.5 text-center">
                        <button
                          onClick={() => handleDeleteSubscription(sub.id)}
                          className="px-2.5 py-1 bg-red-100 hover:bg-red-200 text-red-800 rounded font-bold text-xs cursor-pointer transition-colors"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: THRESHOLDS                                                         */}
      {/* ========================================================================= */}
      {activeTab === "thresholds" && (
        <div className="flex-1 bg-white border border-slate-300 rounded p-8 flex items-center justify-center">
          <div className="text-center space-y-3 max-w-md">
            <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto" />
            <h3 className="text-sm font-black uppercase text-slate-800 tracking-wider">Configured Hardware Thresholds</h3>
            <p className="text-xs text-slate-600 font-medium leading-relaxed">
              Thermal and power alerting thresholds are active. Critical alerts trigger automatic out-of-band BMC notifications.
            </p>
          </div>
        </div>
      )}

      {/* Event Details Modal */}
      {selectedEventModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-300 max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-[#7a0c0c] text-white px-5 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
                <h3 className="font-extrabold text-sm uppercase tracking-wider">Event Details</h3>
              </div>
              <button onClick={() => setSelectedEventModal(null)} className="text-white/70 hover:text-white p-1">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-5 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded border border-slate-200">
                <div>
                  <span className="text-slate-500 block">Server Entity:</span>
                  <span className="font-bold text-blue-700">{selectedEventModal.server}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Severity:</span>
                  <span className="font-bold text-red-600">{selectedEventModal.severity}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Event Type:</span>
                  <span className="font-bold text-slate-800">{selectedEventModal.type}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Timestamp:</span>
                  <span className="font-mono text-slate-700">{selectedEventModal.timestamp}</span>
                </div>
              </div>

              <div>
                <span className="font-bold text-slate-700 block mb-1">Message Detail:</span>
                <div className="bg-slate-900 text-emerald-400 p-3 rounded font-mono text-[11px]">
                  {selectedEventModal.message}
                </div>
              </div>

              <div className="text-right pt-2 border-t border-slate-200">
                <button
                  onClick={() => setSelectedEventModal(null)}
                  className="px-4 py-1.5 bg-[#7a0c0c] hover:bg-[#520000] text-white font-bold rounded cursor-pointer transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Subscription Modal */}
      {showAddSubModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-300 max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-[#7a0c0c] text-white px-5 py-3 flex items-center justify-between">
              <h3 className="font-extrabold text-sm uppercase">Add Redfish Event Subscription</h3>
              <button onClick={() => setShowAddSubModal(false)} className="text-white/70 hover:text-white">✕</button>
            </div>
              <form onSubmit={handleAddSubscriptionSubmit} className="p-5 space-y-3 text-xs">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Destination Webhook URL:</label>
                  <input
                    type="text"
                    required
                    value={newSubDestination}
                    onChange={e => setNewSubDestination(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded font-mono"
                  />
                </div>
                <div className="text-right pt-2 border-t border-slate-200 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAddSubModal(false)}
                    className="px-3 py-1.5 bg-slate-200 text-slate-700 font-bold rounded cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 bg-[#7a0c0c] hover:bg-[#520000] text-white font-bold rounded cursor-pointer transition-colors"
                  >
                    Create Subscription
                  </button>
                </div>
              </form>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={showClearConfirm}
        title="Clear All Event Logs"
        message="Are you sure you want to clear all event logs from memory and database?"
        confirmText="Clear Logs"
        onConfirm={handleConfirmClearAll}
        onCancel={() => setShowClearConfirm(false)}
      />
    </div>
  );
}

