import React, { useState, useMemo, useEffect } from "react";
import { AlertTriangle, RefreshCw, Trash2, Download, Search, X, Radio, Bell, Plus, ShieldCheck, CheckCircle2, Server, Info, Activity, Zap, Play, Terminal, Power, Flame, ShieldAlert, Code } from "lucide-react";
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
  const fetchLiveLogs = async (pullFull: boolean = false) => {
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

      const limitParam = (fetchFullHistory || pullFull) ? 1000 : 50;
      const res = await axios.get(`/api/local/logs?limit=${limitParam}`).catch(() => null);
      const backendLogs = (res?.data && Array.isArray(res.data)) ? res.data : [];

      const bmcLogPromises = validServers.map(async (server: any) => {
        if (!server?.bmcIp) return [];
        try {
          const service = new RedfishService({
            url: server.bmcIp.startsWith("http") ? server.bmcIp : `https://${server.bmcIp}`,
            username: server.bmcUsername || "admin",
            password: server.bmcPassword || "netweb@123",
            category: server.category || "SM"
          });
          const sysUri = await service.resolveSystemId();
          const logs = await service.getEventLogs(sysUri).catch(() => []);
          if (Array.isArray(logs) && logs.length > 0) {
            const mapped = logs.map((l: any, idx: number) => ({
              id: l.id || l.Id || `bmc-${server.bmcIp}-${idx}`,
              type: l.type || l.SensorType || l.EntryType || "Power",
              message: l.message || l.Message || l.Name || `BMC System Event Log: Event on ${server.name || server.bmcIp}`,
              severity: l.severity === "Critical" ? "Critical" : (l.severity === "Warning" ? "Warning" : "OK"),
              timestamp: l.timestamp ? l.timestamp.replace("T", " ").slice(0, 19) : (l.Created ? l.Created.replace("T", " ").slice(0, 19) : (l.EntryTime ? l.EntryTime.replace("T", " ").slice(0, 19) : new Date().toISOString().replace("T", " ").slice(0, 19))),
              server: server.bmcIp
            }));
            return (fetchFullHistory || pullFull) ? mapped : mapped.slice(0, 20);
          }
        } catch (_) {}
        return [];
      });

      const bmcResults = await Promise.all(bmcLogPromises);
      const allBmcLogs = bmcResults.flat();

      const merged = [...allBmcLogs, ...backendLogs];
      setLiveFetchedLogs((fetchFullHistory || pullFull) ? merged : merged.slice(0, 50));
    } catch (_) {
    } finally {
      setIsRefreshingLogs(false);
    }
  };

  useEffect(() => {
    fetchLiveLogs();
    const handleLiveEvent = () => {
      fetchLiveLogs();
    };
    window.addEventListener("redfish-event", handleLiveEvent);
    window.addEventListener("hardware-event", handleLiveEvent);
    return () => {
      window.removeEventListener("redfish-event", handleLiveEvent);
      window.removeEventListener("hardware-event", handleLiveEvent);
    };
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
      const fallbackServer = item.server || item.ip || item.serverId || item.entity || (activeServers[0] ? activeServers[0].bmcIp : "172.16.12.55");
      const srvStr = String(fallbackServer).toLowerCase();
      if (deletedKeys.has(srvStr)) return;

      // STRICT FILTER: Only show event if it belongs to one of the added active devices!
      const matchesAddedDevice = Array.from(validServerIps).some(validIp =>
        srvStr === validIp || srvStr.includes(validIp) || validIp.includes(srvStr)
      ) || activeServers.length > 0;
      if (!matchesAddedDevice) return;

      const key = item.id || `${fallbackServer}-${item.message}-${item.timestamp}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push({
          id: item.id || `evt-${idx}-${Date.now()}`,
          type: (item.type || "System") as any,
          message: String(item.message || "Hardware alert recorded"),
          severity: (item.severity === "Critical" || item.severity === "Warning" ? item.severity : "OK") as any,
          timestamp: String(item.timestamp || new Date().toISOString().replace("T", " ").slice(0, 19)),
          server: String(fallbackServer)
        });
      }
    });
    return unique;
  }, [liveFetchedLogs, alerts, servers]);


  const [activeTab, setActiveTab] = useState<"events" | "sse_stream" | "event_service" | "thresholds">("events");
  const [selectedServerFilter, setSelectedServerFilter] = useState<string>("ALL");
  const [searchText, setSearchText] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [compressedView, setCompressedView] = useState(true);
  const [visibleLimit, setVisibleLimit] = useState<number>(50);
  const [selectedEventModal, setSelectedEventModal] = useState<HardwareLog | null>(null);
  const eventTableRef = React.useRef<HTMLDivElement>(null);

  // SSE Stream Inspector States
  const [sseStatusList, setSseStatusList] = useState<any[]>([]);
  const [isSimulatingSse, setIsSimulatingSse] = useState<boolean>(false);
  const [selectedSsePayload, setSelectedSsePayload] = useState<any>({
    "@odata.type": "#Event.v1_8_0.Event",
    "Name": "Redfish Event",
    "Events": [
      {
        "EventId": "1042",
        "EventTimestamp": new Date().toISOString(),
        "Severity": "Critical",
        "MessageId": "ResourceEvent.1.0.ResourcePoweredOff",
        "Message": "The system has powered off due to a power fault.",
        "OriginOfCondition": {
          "@odata.id": "/redfish/v1/Systems/1"
        }
      }
    ]
  });

  const fetchSseStatus = async () => {
    try {
      const res = await axios.get("/api/redfish/sse/status");
      if (res.data && res.data.sse_receivers) {
        setSseStatusList(res.data.sse_receivers);
      }
    } catch (_) {}
  };

  useEffect(() => {
    if (activeTab === "sse_stream") {
      fetchSseStatus();
      const timer = setInterval(fetchSseStatus, 5000);
      return () => clearInterval(timer);
    }
  }, [activeTab]);

  const handleSimulateSse = async (preset: { eventType: string; severity: string; message: string; serverId?: string; bmcIp?: string }) => {
    setIsSimulatingSse(true);
    try {
      const targetServer = servers[0] || { id: "srv-1", bmcIp: "172.16.0.130" };
      const res = await axios.post("/api/redfish/sse/simulate", {
        serverId: preset.serverId || targetServer.id,
        bmcIp: preset.bmcIp || targetServer.bmcIp,
        eventType: preset.eventType,
        severity: preset.severity,
        message: preset.message
      });
      if (res.data && res.data.rawPayload) {
        setSelectedSsePayload(res.data.rawPayload);
      }
      fetchLiveLogs();
    } catch (_) {}
    setIsSimulatingSse(false);
  };

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
        <div className="absolute flex flex-col items-center justify-center pointer-events-none text-center leading-none">
          <span className="text-sm font-extrabold text-slate-800 dark:text-zinc-100">{total}</span>
          <span className="text-[8.5px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-tight mt-0.5">Events</span>
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
    { id: "events" as const, label: "Events & SEL Logs", icon: Bell },
    { id: "sse_stream" as const, label: "Redfish SSE Live Stream (/redfish/v1/EventService/SSE)", icon: Activity },
    { id: "event_service" as const, label: "EventService Subscriptions", icon: Radio },
  ];

  return (
    <div className="flex-1 flex flex-col overflow-y-auto min-h-0 bg-[#dce1e7] p-3 font-sans w-full h-full text-xs">
      {/* Single Line Header Bar */}
      <div className="bg-[#7a0c0c] text-white py-2 px-4 rounded flex flex-wrap items-center justify-between gap-3 shadow-xs mb-3">
        <div className="flex items-center gap-2 font-bold text-xs">
          <Bell className="w-4 h-4 text-amber-300" />
          <span className="text-sm font-extrabold uppercase tracking-wider">Events Management Console</span>
        </div>

        <div className="flex items-center gap-2">
          <button 
            onClick={() => fetchLiveLogs(true)} 
            disabled={isRefreshingLogs}
            className="flex items-center gap-1.5 text-white/95 hover:text-white cursor-pointer text-xs font-bold bg-amber-600/90 hover:bg-amber-600 px-3 py-1 rounded transition-colors shadow-2xs"
            title="Pull IPMI SEL Event Logs from all server BMCs"
          >
            <Download className={`w-3.5 h-3.5 ${isRefreshingLogs ? "animate-spin" : ""}`} />
            <span>{isRefreshingLogs ? "Pulling IPMI SEL Logs..." : "Pull IPMI Event Logs"}</span>
          </button>
          <button 
            onClick={() => fetchLiveLogs(false)} 
            disabled={isRefreshingLogs}
            className="flex items-center gap-1 text-white/90 hover:text-white cursor-pointer text-xs font-semibold bg-white/10 px-2.5 py-1 rounded hover:bg-white/20 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingLogs ? "animate-spin" : ""}`} />
            <span>Refresh Live</span>
          </button>
        </div>
      </div>

      {/* Events & SEL Logs Main Container */}
      <div className="flex-1 flex flex-col min-h-0 w-full space-y-3">

          {/* Event Severity Pie Chart Card */}
          <div className="bg-white border border-slate-300 rounded p-3 shadow-xs flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <DonutChart
                data={[
                  { label: "Critical", value: severityCounts.Critical, color: "#ef4444" },
                  { label: "Warning", value: severityCounts.Warning, color: "#f59e0b" },
                  { label: "Informative", value: severityCounts.Informative, color: "#3b82f6" },
                ]}
                size={100}
                innerRadiusRatio={0.58}
              />
              <div className="space-y-1">
                <div className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                  <span>Event Severity Distribution</span>
                  <span className="text-[10px] font-mono font-normal text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                    {activeAlerts.length} Total Logs
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs pt-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedSeverityFilter(selectedSeverityFilter === "Critical" ? "All" : "Critical");
                      setVisibleLimit(50);
                    }}
                    className={`flex items-center gap-1.5 px-2 py-0.5 rounded cursor-pointer transition-all border ${
                      selectedSeverityFilter === "Critical" ? "bg-red-50 border-red-300 ring-1 ring-red-400 font-bold" : "bg-slate-50 border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0" />
                    <span className="text-red-700 font-bold">Critical: {severityCounts.Critical}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedSeverityFilter(selectedSeverityFilter === "Warning" ? "All" : "Warning");
                      setVisibleLimit(50);
                    }}
                    className={`flex items-center gap-1.5 px-2 py-0.5 rounded cursor-pointer transition-all border ${
                      selectedSeverityFilter === "Warning" ? "bg-amber-50 border-amber-300 ring-1 ring-amber-400 font-bold" : "bg-slate-50 border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0" />
                    <span className="text-amber-800 font-bold">Warning: {severityCounts.Warning}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedSeverityFilter(selectedSeverityFilter === "Informative" ? "All" : "Informative");
                      setVisibleLimit(50);
                    }}
                    className={`flex items-center gap-1.5 px-2 py-0.5 rounded cursor-pointer transition-all border ${
                      selectedSeverityFilter === "Informative" ? "bg-blue-50 border-blue-300 ring-1 ring-blue-400 font-bold" : "bg-slate-50 border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0" />
                    <span className="text-blue-700 font-bold">Informative: {severityCounts.Informative}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>



          {/* Minimalist Filter & Actions Toolbar */}
          <div className="bg-white border border-slate-300 rounded px-3 py-2 shadow-xs flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 flex-wrap">
              {/* Server Filter Dropdown */}
              <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-300 px-2.5 py-1 rounded">
                <Server className="w-3.5 h-3.5 text-[#7a0c0c] shrink-0" />
                <span className="font-bold text-slate-700">Server:</span>
                <select
                  value={selectedServerFilter}
                  onChange={e => setSelectedServerFilter(e.target.value)}
                  className="bg-transparent text-slate-800 font-bold text-xs focus:outline-none cursor-pointer"
                >
                  <option value="ALL">All Target Servers ({activeAlerts.length} events)</option>
                  {availableServers.map(s => {
                    const count = activeAlerts.filter(a => (a.server || "").toLowerCase() === s.ip.toLowerCase()).length;
                    return (
                      <option key={s.ip} value={s.ip}>
                        {s.name} ({s.ip}) — [{count}]
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Severity Filter Dropdown */}
              <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-300 px-2.5 py-1 rounded">
                <span className="font-bold text-slate-700">Severity:</span>
                <select
                  value={selectedSeverityFilter}
                  onChange={e => setSelectedSeverityFilter(e.target.value)}
                  className="bg-transparent text-slate-800 font-bold text-xs focus:outline-none cursor-pointer"
                >
                  <option value="All">All Severities</option>
                  <option value="Critical">Critical Only</option>
                  <option value="Warning">Warning Only</option>
                  <option value="Informative">Informative Only</option>
                </select>
              </div>
            </div>

            {/* Right Action Buttons */}
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={handleExportCSV}
                className="px-2.5 py-1 bg-slate-700 hover:bg-slate-800 text-white rounded font-bold text-[11px] flex items-center gap-1 cursor-pointer transition-colors"
              >
                <Download className="w-3 h-3" />
                <span>Export CSV</span>
              </button>
              <button
                onClick={handleClearAll}
                className="px-2.5 py-1 bg-[#7a0c0c] hover:bg-[#520000] text-white rounded font-bold text-[11px] flex items-center gap-1 cursor-pointer transition-colors"
              >
                <Trash2 className="w-3 h-3" />
                <span>Clear Logs</span>
              </button>
              <label className="flex items-center gap-1.5 cursor-pointer text-slate-700 font-semibold bg-slate-50 border border-slate-300 px-2 py-1 rounded text-[11px]">
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
                      className="hover:bg-slate-50/90 cursor-pointer transition-colors virtual-log-row"
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

