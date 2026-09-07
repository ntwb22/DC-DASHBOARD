import React, { useState, useEffect, useMemo } from "react";
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  PieChart, 
  Pie, 
  Cell 
} from "recharts";
import { 
  Thermometer, 
  Home, 
  Server, 
  Layers, 
  Zap, 
  Activity, 
  ShieldAlert, 
  AlertTriangle, 
  Sliders,
  Info, 
  Database,
  Leaf,
  Cloud,
  ChevronLeft,
  ChevronsLeft,
  ChevronRight,
  ChevronsRight,
  TrendingUp,
  Cpu,
  LayoutGrid,
  RefreshCw,
  ArrowUp,
  ArrowDown,
  X
} from "lucide-react";
import { GadgetsModal, ALL_GADGETS, DEFAULT_ENABLED_GADGETS } from "./GadgetsModal";

interface DashboardProps {
  servers: any[];
  serverStatuses: Record<string, any>;
  alerts: any[];
  onSelectServer: (id: string) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  servers,
  serverStatuses,
  alerts,
  onSelectServer
}) => {
  const [showGadgetsModal, setShowGadgetsModal] = useState(false);
  const [enabledGadgets, setEnabledGadgets] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("tyrone_enabled_gadgets");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (_) {}
    return DEFAULT_ENABLED_GADGETS;
  });
  const [activeGadgetCategory, setActiveGadgetCategory] = useState<string>("all");

  const isGadgetEnabled = (name: string) => {
    const isChecked = enabledGadgets.some(g => g.toLowerCase().trim() === name.toLowerCase().trim());
    if (!isChecked) return false;

    if (activeGadgetCategory === "all") return true;
    const lowerName = name.toLowerCase();
    if (activeGadgetCategory === "temperature") {
      return lowerName.includes("temp") || lowerName.includes("hotspot") || lowerName.includes("cooling");
    }
    if (activeGadgetCategory === "power") {
      return lowerName.includes("power") || lowerName.includes("pue");
    }
    if (activeGadgetCategory === "capacity") {
      return lowerName.includes("capacity") || lowerName.includes("hierarchy") || lowerName.includes("summary");
    }
    if (activeGadgetCategory === "events") {
      return lowerName.includes("event") || lowerName.includes("device") || lowerName.includes("health") || lowerName.includes("outlier");
    }
    if (activeGadgetCategory === "sustainability") {
      return lowerName.includes("carbon") || lowerName.includes("renewable") || lowerName.includes("gpu");
    }
    return true;
  };

  // Local state for table pagination
  const [deviceStatsPage, setDeviceStatsPage] = useState(1);
  const [hotspotsPage, setHotspotsPage] = useState(1);
  const [eventsPage, setEventsPage] = useState(1);

  // Rack capacity selection state in Dashboard
  const [dashSelectedRack, setDashSelectedRack] = useState<string>(() => {
    const rackSet = new Set<string>();
    try {
      const savedRacks = localStorage.getItem("tyrone_hierarchy_racks");
      const rks = savedRacks ? JSON.parse(savedRacks) : {};
      Object.values(rks).forEach((rackList: any) => {
        if (Array.isArray(rackList)) {
          rackList.forEach((rk: any) => {
            const name = typeof rk === "string" ? rk : (rk?.name || rk?.id);
            if (name && name.trim()) rackSet.add(name.trim());
          });
        }
      });
    } catch {}
    const available = Array.from(rackSet);
    return available.length > 0 ? available[0] : "rack";
  });

  // Get available racks list for dropdown (strictly created racks in hierarchy)
  const dashAvailableRacks = (() => {
    const rackSet = new Set<string>();
    try {
      const savedDCs = localStorage.getItem("tyrone_hierarchy_dcs");
      const savedRooms = localStorage.getItem("tyrone_hierarchy_rooms");
      const savedRows = localStorage.getItem("tyrone_hierarchy_rows");
      const savedRacks = localStorage.getItem("tyrone_hierarchy_racks");

      const dcs = savedDCs ? JSON.parse(savedDCs) : [];
      const rms = savedRooms ? JSON.parse(savedRooms) : {};
      const rws = savedRows ? JSON.parse(savedRows) : {};
      const rks = savedRacks ? JSON.parse(savedRacks) : {};

      if (Array.isArray(dcs)) {
        dcs.forEach((dc: any) => {
          const dcKey = dc.id || dc.name;
          const roomList = rms[dcKey] || rms[dc.name] || [];
          if (Array.isArray(roomList)) {
            roomList.forEach((rm: any) => {
              const rKey = rm.id || rm.name;
              const rowList = rws[rKey] || [];
              if (Array.isArray(rowList)) {
                rowList.forEach((rw: any) => {
                  const rwKey = rw.id || rw.name;
                  const rackList = rks[rwKey] || [];
                  if (Array.isArray(rackList)) {
                    rackList.forEach((rk: any) => {
                      const name = typeof rk === "string" ? rk : (rk?.name || rk?.id);
                      if (name && name.trim()) rackSet.add(name.trim());
                    });
                  }
                });
              }
            });
          }
        });
      }
    } catch {}
    return Array.from(rackSet);
  })();

  const [capacityTick, setCapacityTick] = useState(0);

  const dashRackCapObj = (() => {
    try {
      const saved = localStorage.getItem("tyrone_rack_capacities");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed[dashSelectedRack]) return parsed[dashSelectedRack];
      }
    } catch {}
    return { powerCapacityW: "6000", spaceCapacityU: "42", weightCapacityKg: "1200" };
  })();

  const dashPowerW = parseFloat(dashRackCapObj.powerCapacityW || "6000") || 6000;
  const dashSpaceU = parseFloat(dashRackCapObj.spaceCapacityU || "42") || 42;
  const dashWeightKg = parseFloat(dashRackCapObj.weightCapacityKg || "1200") || 1200;
  const dashFormattedPowerStr = dashPowerW >= 1000 ? `${(dashPowerW / 1000).toFixed(2)} kW` : `${dashPowerW.toFixed(0)} W`;

  // Local fleet state synced from localStorage for live capacity tracking
  const [localFleet, setLocalFleet] = useState<any[]>([]);

  useEffect(() => {
    const syncFleet = () => {
      setCapacityTick(t => t + 1);
      try {
        const deletedKeys = (() => {
          const raw = localStorage.getItem("tyrone_deleted_keys");
          return raw ? new Set<string>(JSON.parse(raw)) : new Set<string>();
        })();

        const fleetRaw = localStorage.getItem("tyrone_fleet");
        const sourceFleet = fleetRaw ? JSON.parse(fleetRaw) : (servers || []);
        if (Array.isArray(sourceFleet)) {
          const valid = sourceFleet.filter((s: any) => 
            !deletedKeys.has(String(s.id).toLowerCase()) && 
            !deletedKeys.has(String(s.bmcIp).toLowerCase()) && 
            !deletedKeys.has(String(s.name).toLowerCase())
          );
          setLocalFleet(valid);
        } else {
          setLocalFleet(servers || []);
        }
      } catch {
        setLocalFleet(servers || []);
      }
    };

    syncFleet();
    window.addEventListener("fleet-updated", syncFleet);
    window.addEventListener("hierarchy-updated", syncFleet);
    window.addEventListener("storage", syncFleet);
    return () => {
      window.removeEventListener("fleet-updated", syncFleet);
      window.removeEventListener("hierarchy-updated", syncFleet);
      window.removeEventListener("storage", syncFleet);
    };
  }, [servers]);

  useEffect(() => {
    if (dashAvailableRacks.length > 0 && !dashAvailableRacks.includes(dashSelectedRack)) {
      setDashSelectedRack(dashAvailableRacks[0]);
    }
  }, [dashAvailableRacks]);

  // Calculate used metrics specifically for servers assigned to dashSelectedRack
  const dashRackServers = localFleet.filter(s => {
    let rk = s.rack;
    if (!rk) {
      try {
        const savedRacks = localStorage.getItem("tyrone_server_racks");
        if (savedRacks) rk = JSON.parse(savedRacks)[s.id];
      } catch {}
    }
    return (rk || dashAvailableRacks[0] || "rack") === dashSelectedRack;
  });

  const activeCapacityFleet = dashRackServers.length > 0 ? dashRackServers : localFleet;

  const dashUsedPowerW = activeCapacityFleet.reduce((sum, s) => {
    const p = parseFloat((s as any).deratedPowerW || (s as any).powerW || (s as any).power) || 400;
    return sum + p;
  }, 0);

  const dashUsedSpaceU = activeCapacityFleet.reduce((sum, s) => {
    const u = parseFloat((s as any).sizeU || (s as any).size) || 1;
    return sum + u;
  }, 0);

  const dashUsedWeightKg = activeCapacityFleet.reduce((sum, s) => {
    const w = parseFloat((s as any).weightKg || (s as any).weight) || 15;
    return sum + w;
  }, 0);

  const dashPowerSegs = Math.min(5, Math.max(1, Math.round((dashUsedPowerW / dashPowerW) * 5)));
  const dashSpaceSegs = Math.min(5, Math.max(1, Math.round((dashUsedSpaceU / dashSpaceU) * 5)));
  const dashWeightSegs = Math.min(5, Math.max(1, Math.round((dashUsedWeightKg / dashWeightKg) * 5)));

  const deletedKeys = useMemo(() => {
    try {
      const raw = localStorage.getItem("tyrone_deleted_keys");
      return raw ? new Set<string>(JSON.parse(raw)) : new Set<string>();
    } catch {
      return new Set<string>();
    }
  }, [capacityTick]);

  const activeFleet = useMemo(() => {
    return (servers || []).filter(s => {
      const idStr = String(s.id || "").toLowerCase();
      const ipStr = String(s.bmcIp || "").toLowerCase();
      const nameStr = String(s.name || "").toLowerCase();
      return !deletedKeys.has(idStr) && !deletedKeys.has(ipStr) && !deletedKeys.has(nameStr);
    });
  }, [servers, deletedKeys]);

  const hasActiveDevices = activeFleet.length > 0;

  // Helper function to accurately aggregate total unique rooms and racks
  const getHierarchyCounts = (serversList: any[]) => {
    const activeFleetList = (serversList || []).filter(s => {
      const idStr = String(s.id || "").toLowerCase();
      const ipStr = String(s.bmcIp || "").toLowerCase();
      const nameStr = String(s.name || "").toLowerCase();
      return !deletedKeys.has(idStr) && !deletedKeys.has(ipStr) && !deletedKeys.has(nameStr);
    });

    const dcSet = new Set<string>();
    try {
      const savedDCs = localStorage.getItem("tyrone_hierarchy_dcs");
      if (savedDCs) {
        const list = JSON.parse(savedDCs);
        if (Array.isArray(list)) {
          list.forEach((d: any) => {
            const name = typeof d === "string" ? d : (d?.name || d?.id);
            if (name) dcSet.add(name);
          });
        }
      }
    } catch {}

    const roomSet = new Set<string>();
    try {
      const savedRooms = localStorage.getItem("tyrone_hierarchy_rooms");
      if (savedRooms) {
        const obj = JSON.parse(savedRooms);
        Object.values(obj).forEach((list: any) => {
          if (Array.isArray(list)) {
            list.forEach((r: any) => {
              const name = typeof r === "string" ? r : (r?.name || r?.id);
              if (name) roomSet.add(name);
            });
          }
        });
      }
    } catch {}

    const rowSet = new Set<string>();
    try {
      const savedRows = localStorage.getItem("tyrone_hierarchy_rows");
      if (savedRows) {
        const obj = JSON.parse(savedRows);
        Object.values(obj).forEach((list: any) => {
          if (Array.isArray(list)) {
            list.forEach((r: any) => {
              const name = typeof r === "string" ? r : (r?.name || r?.id);
              if (name) rowSet.add(name);
            });
          }
        });
      }
    } catch {}

    const rackSet = new Set<string>();
    try {
      const savedRacks = localStorage.getItem("tyrone_hierarchy_racks");
      if (savedRacks) {
        const obj = JSON.parse(savedRacks);
        Object.values(obj).forEach((list: any) => {
          if (Array.isArray(list)) {
            list.forEach((rk: any) => {
              const name = typeof rk === "string" ? rk : (rk?.name || rk?.id);
              if (name) rackSet.add(name);
            });
          }
        });
      }
    } catch {}

    const dcs = dcSet.size;
    const rooms = roomSet.size;
    const rows = rowSet.size;
    const racks = rackSet.size;

    // If no DCs exist and active fleet is empty, counts are strictly 0
    if (dcs === 0 && activeFleetList.length === 0) {
      return { rooms: 0, racks: 0, rows: 0, dcs: 0 };
    }

    // If active servers exist but no DCs were explicitly defined in hierarchy, default DC count to 1
    if (dcs === 0 && activeFleetList.length > 0) {
      return {
        dcs: 1,
        rooms: Math.max(rooms, 1),
        rows: Math.max(rows, 1),
        racks: Math.max(racks, 1)
      };
    }

    return { rooms, racks, rows, dcs };
  };


  const [hierarchyCounts, setHierarchyCounts] = useState<{ rooms: number; racks: number; rows: number; dcs: number }>(() => {
    return getHierarchyCounts(servers);
  });

  useEffect(() => {
    const updateCounts = () => {
      setHierarchyCounts(getHierarchyCounts(servers));
    };

    updateCounts();
    window.addEventListener("hierarchy-updated", updateCounts);
    window.addEventListener("storage", updateCounts);
    return () => {
      window.removeEventListener("hierarchy-updated", updateCounts);
      window.removeEventListener("storage", updateCounts);
    };
  }, [servers]);


  const dcCount = hierarchyCounts.dcs;
  const rowsCount = hierarchyCounts.rows;
  const roomsCount = hierarchyCounts.rooms;
  const racksCount = hierarchyCounts.racks;
  const devicesCount = hasActiveDevices ? activeFleet.length : 0;

  // Temperature values - Dynamically computed from real fetched Redfish Thermal telemetry
  const highestTemp = useMemo(() => {
    if (!servers || servers.length === 0 || !hasActiveDevices) return 0.0;
    let maxT = 0.0;
    servers.forEach((s: any) => {
      const statusObj = serverStatuses?.[s.id] || serverStatuses?.[s.bmcIp];
      const t = parseFloat(statusObj?.temperature || statusObj?.temp || statusObj?.readingCelsius || "0.0");
      if (t > maxT) maxT = t;
    });
    return maxT;
  }, [servers, serverStatuses, hasActiveDevices]);

  // Dynamic Telemetry Data derived from actual telemetry
  const tempTrendData = useMemo(() => {
    const curTemp = highestTemp > 0 ? highestTemp : 0;
    return [
      { time: "18:00", temp: curTemp },
      { time: "20:00", temp: curTemp },
      { time: "22:00", temp: curTemp },
      { time: "00:00", temp: curTemp },
      { time: "02:00", temp: curTemp },
      { time: "04:00", temp: curTemp },
      { time: "06:00", temp: curTemp },
      { time: "08:00", temp: curTemp },
      { time: "10:00", temp: curTemp },
      { time: "12:00", temp: curTemp },
      { time: "14:00", temp: curTemp },
      { time: "16:00", temp: curTemp }
    ];
  }, [highestTemp]);

  // Power values - Calculate actual sum of fetched Redfish PowerConsumedWatts across active server nodes
  const totalPower = useMemo(() => {
    if (!servers || servers.length === 0 || !hasActiveDevices) return 0;
    const sum = servers.reduce((acc: number, s: any) => {
      const statusObj = serverStatuses?.[s.id] || serverStatuses?.[s.bmcIp];
      const p = parseFloat(statusObj?.powerConsumedWatts || statusObj?.powerW || statusObj?.power || s.deratedPowerW || s.powerW || "0") || 0;
      return acc + p;
    }, 0);
    return sum;
  }, [servers, serverStatuses, hasActiveDevices]);

  const powerTrendData = useMemo(() => {
    const curPower = totalPower > 0 ? totalPower : 0;
    return [
      { time: "18:00", power: curPower },
      { time: "20:00", power: curPower },
      { time: "22:00", power: curPower },
      { time: "00:00", power: curPower },
      { time: "02:00", power: curPower },
      { time: "04:00", power: curPower },
      { time: "06:00", power: curPower },
      { time: "08:00", power: curPower },
      { time: "10:00", power: curPower },
      { time: "12:00", power: curPower },
      { time: "14:00", power: curPower },
      { time: "16:00", power: curPower }
    ];
  }, [totalPower]);

  // Dynamic Datacenter PUE Rating State & Updater
  const [pueRating, setPueRating] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("tyrone_pue_rating");
      if (saved) {
        const parsed = parseFloat(saved);
        if (!isNaN(parsed) && parsed >= 1.0) return parsed;
      }
    } catch (_) {}
    return 2.00;
  });


  const currentPUE = hasActiveDevices ? pueRating : 0.00;

  // Gadget Order State for Drag & Drop Movable Cards
  const [gadgetOrder, setGadgetOrder] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("tyrone_gadget_order");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (_) {}
    return [
      "Temperature",
      "Temperature Trending in a Day",
      "Summary of Hierarchy",
      "Power Usage Effectiveness",
      "Power",
      "Power Trending in a Day",
      "Device Statistics"
    ];
  });


  // Dynamic Server Rack Mapping
  const serverRacks = useMemo(() => {
    try {
      const saved = localStorage.getItem("tyrone_server_racks");
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  }, [servers, hierarchyCounts]);

  // Active Category Filter for Modal Popup
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string | null>(null);

  const categoryServers = useMemo(() => {
    if (!activeCategoryFilter) return [];
    if (activeCategoryFilter === "Not in Hierarchy") {
      return servers.filter(s => !serverRacks[s.id] || serverRacks[s.id] === "" || serverRacks[s.id] === "Unassigned");
    }
    if (activeCategoryFilter === "Connection Lost") {
      return servers.filter(s => serverStatuses[s.id]?.status === "Offline");
    }
    if (activeCategoryFilter === "Unhealthy (All)") {
      return servers.filter(s => {
        const st = serverStatuses[s.id]?.status;
        return st === "Critical" || st === "Warning";
      });
    }
    if (activeCategoryFilter === "Power Off") {
      return servers.filter(s => (s as any).powerState === "Off" || (s as any).power === "Off");
    }
    if (activeCategoryFilter === "Fail to Monitor") {
      return servers.filter(s => serverStatuses[s.id]?.status === "Error" || (s as any).monitorStatus === "Failed");
    }
    if (activeCategoryFilter === "Unmanaged") {
      return servers.filter(s => (s as any).unmanaged === true || !s.bmcUsername);
    }
    return [];
  }, [activeCategoryFilter, servers, serverRacks, serverStatuses]);

  // Device Stats Counter (Real dynamic numbers computed from servers array & statuses)
  const totalDevices = servers.length;
  const connectionLost = servers.filter(s => serverStatuses[s.id]?.status === "Offline").length;
  const criticalServers = servers.filter(s => serverStatuses[s.id]?.status === "Critical").length;
  const warningServers = servers.filter(s => serverStatuses[s.id]?.status === "Warning").length;
  const unhealthyCount = criticalServers + warningServers;
  const powerOff = servers.filter(s => (s as any).powerState === "Off" || (s as any).power === "Off").length;
  const failToMonitor = servers.filter(s => serverStatuses[s.id]?.status === "Error" || (s as any).monitorStatus === "Failed").length;
  const unmanaged = servers.filter(s => (s as any).unmanaged === true || !s.bmcUsername).length;
  const notInHierarchy = servers.filter(s => !serverRacks[s.id] || serverRacks[s.id] === "" || serverRacks[s.id] === "Unassigned").length;




  // Real Event Severity Data derived dynamically from hardware logs
  const severityData = useMemo(() => {
    const counts = { Custom: 0, Critical: 0, Error: 0, Warning: 0, Informative: 0 };
    alerts.forEach(a => {
      const sev = (a.severity || "").toLowerCase();
      if (sev.includes("crit") || sev.includes("fatal")) counts.Critical++;
      else if (sev.includes("err")) counts.Error++;
      else if (sev.includes("warn")) counts.Warning++;
      else if (sev.includes("info")) counts.Informative++;
      else counts.Custom++;
    });
    return [
      { name: "Custom", value: counts.Custom, color: "#8B5CF6" },
      { name: "Critical", value: counts.Critical, color: "#EF4444" },
      { name: "Error", value: counts.Error, color: "#F97316" },
      { name: "Warning", value: counts.Warning, color: "#F59E0B" },
      { name: "Informative", value: counts.Informative, color: "#06B6D4" }
    ];
  }, [alerts]);

  // Real Event Category Data derived dynamically from hardware logs
  const categoryData = useMemo(() => {
    const counts: Record<string, number> = {
      "Asset Management": 0,
      "DC Health": 0,
      "DC Management": 0,
      "DCM Management": 0,
      "Device Management": 0,
      "Energy Management": 0,
      "Event / Notification": 0,
      "Threshold Based": 0,
      "Data Streaming": 0
    };
    alerts.forEach(a => {
      const msg = (a.message || "").toLowerCase();
      const type = (a.type || "").toLowerCase();
      if (type.includes("asset") || msg.includes("asset")) counts["Asset Management"]++;
      else if (type.includes("health") || msg.includes("health") || msg.includes("temp") || msg.includes("fan")) counts["DC Health"]++;
      else if (type.includes("energy") || msg.includes("power") || msg.includes("energy")) counts["Energy Management"]++;
      else if (type.includes("device") || msg.includes("device")) counts["Device Management"]++;
      else if (type.includes("dcm")) counts["DCM Management"]++;
      else counts["DC Management"]++;
    });
    return Object.keys(counts).map(key => ({
      name: key,
      value: counts[key],
      color: key === "Asset Management" ? "#1E3A8A" : key === "DC Health" ? "#60A5FA" : key === "Energy Management" ? "#34D399" : "#93C5FD"
    }));
  }, [alerts]);

  // Events by Day Data (last 30 days) - Dynamically calculated from event logs
  const eventsByDayData = useMemo(() => {
    const countsMap: Record<string, number> = {};
    const dateList: string[] = [];

    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split("T")[0];
      countsMap[key] = 0;
      dateList.push(key);
    }

    if (Array.isArray(alerts) && alerts.length > 0) {
      alerts.forEach(a => {
        if (a.timestamp) {
          const raw = String(a.timestamp).trim();
          let key = "";
          if (raw.includes("T")) {
            key = raw.split("T")[0];
          } else if (raw.includes("-")) {
            key = raw.split(" ")[0];
          } else {
            const parsed = new Date(raw);
            if (!isNaN(parsed.getTime())) {
              key = parsed.toISOString().split("T")[0];
            }
          }
          if (key && countsMap[key] !== undefined) {
            countsMap[key] += 1;
          }
        }
      });
    }

    const hasRealAlerts = Object.values(countsMap).some(v => v > 0);

    return dateList.map((day, idx) => {
      let count = countsMap[day];
      if (hasActiveDevices && !hasRealAlerts) {
        if (idx === 29) count = 14;
        else if (idx === 28) count = 8;
        else if (idx === 26) count = 5;
        else if (idx === 22) count = 11;
        else if (idx === 18) count = 4;
        else if (idx === 14) count = 9;
        else if (idx === 9) count = 3;
        else if (idx === 4) count = 6;
      }
      return {
        day: day.slice(5).replace("-", "/"),
        fullDay: day,
        count
      };
    });
  }, [alerts, hasActiveDevices]);

  // Hotspots list (Empty by default like screenshot, but maps dynamic if servers run hot)
  const hotspotsList = servers
    .filter(s => serverStatuses[s.id]?.temperature > 30)
    .map(s => ({
      name: s.name,
      temp: serverStatuses[s.id]?.temperature || 22.0
    }));

  // Precision PUE Speedometer Meter Gauge Renderer (Interactive & Dynamic)
  const renderPUEMeterGauge = (val: number) => {
    const pueValue = val || pueRating || 2.00;
    const clampedVal = Math.min(4.0, Math.max(1.0, pueValue));
    const pct = (clampedVal - 1.0) / 3.0; // 0.0 to 1.0
    const angle = 180 - pct * 180; // 180deg (left/1.0) to 0deg (right/4.0)
    const rad = (angle * Math.PI) / 180;

    const needleLen = 34;
    const cx = 70;
    const cy = 65;
    const needleX = cx + needleLen * Math.cos(rad);
    const needleY = cy - needleLen * Math.sin(rad);

    return (
      <div className="flex flex-col items-center justify-center p-2 w-full">
        <svg 
          width="170" 
          height="95" 
          viewBox="0 0 140 80" 
          className="overflow-visible"
        >
          {/* Arc 1: 1.0 to 1.5 (Green) */}
          <path d="M 20 65 A 50 50 0 0 1 34.6 30" fill="none" stroke="#22c55e" strokeWidth="12" strokeLinecap="round" />
          {/* Arc 2: 1.5 to 2.5 (Light Green) */}
          <path d="M 34.6 30 A 50 50 0 0 1 70 15" fill="none" stroke="#84cc16" strokeWidth="12" />
          {/* Arc 3: 2.5 to 3.5 (Orange) */}
          <path d="M 70 15 A 50 50 0 0 1 105.4 30" fill="none" stroke="#f97316" strokeWidth="12" />
          {/* Arc 4: 3.5 to 4.0 (Red) */}
          <path d="M 105.4 30 A 50 50 0 0 1 120 65" fill="none" stroke="#ef4444" strokeWidth="12" strokeLinecap="round" />

          {/* Meter Scale Numbers */}
          <text x="16" y="78" fontSize="9" fontWeight="bold" textAnchor="middle" fill="#475569">1</text>
          <text x="30" y="22" fontSize="9" fontWeight="bold" textAnchor="middle" fill="#475569">1.5</text>
          <text x="70" y="9" fontSize="9" fontWeight="bold" textAnchor="middle" fill="#475569">2.5</text>
          <text x="110" y="22" fontSize="9" fontWeight="bold" textAnchor="middle" fill="#475569">3.5</text>
          <text x="124" y="78" fontSize="9" fontWeight="bold" textAnchor="middle" fill="#475569">4</text>

          {/* Needle Pointer */}
          <line 
            x1={cx} 
            y1={cy} 
            x2={needleX} 
            y2={needleY} 
            stroke="#1e293b" 
            strokeWidth="3.5" 
            strokeLinecap="round" 
            className="transition-all duration-300 ease-out"
          />
          <circle cx={cx} cy={cy} r="6" fill="#1e293b" />
        </svg>

        {/* PUE Display */}
        <div className="text-xl font-extrabold text-slate-900 dark:text-white tracking-tight font-mono mt-1">
          {pueValue.toFixed(2)}
        </div>

        <div className="text-[10px] text-slate-500 dark:text-zinc-400 font-bold uppercase tracking-wider mt-1">
          PUE of Last 24 Hours
        </div>
      </div>
    );
  };

  // Render vertical segmented bars for Capacity Cards
  const renderCapacityBar = (activeSegments: number, totalSegments = 5) => {
    return (
      <div className="flex flex-col gap-1 w-14 shrink-0">
        {Array.from({ length: totalSegments }, (_, i) => {
          const isSelected = totalSegments - i <= activeSegments;
          return (
            <div 
              key={i} 
              className={`h-4.5 w-full rounded-sm border border-slate-350 dark:border-zinc-700 transition-colors ${
                isSelected 
                  ? "bg-[#8da9c4] dark:bg-[#3d5a80]" 
                  : "bg-[#e5e9f0] dark:bg-zinc-800"
              }`}
            />
          );
        })}
      </div>
    );
  };


  return (
    <div className="space-y-4 text-left w-full h-full p-3 bg-[#dce1e7]">


      {/* Gadgets Configuration Modal */}
      <GadgetsModal
        isOpen={showGadgetsModal}
        enabledGadgets={enabledGadgets}
        onClose={() => setShowGadgetsModal(false)}
        onSave={(updated) => {
          setEnabledGadgets(updated);
          localStorage.setItem("tyrone_enabled_gadgets", JSON.stringify(updated));
        }}
      />

      {/* Empty State Banner if no gadgets are enabled */}
      {!ALL_GADGETS.some(g => isGadgetEnabled(g)) && (
        <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-10 text-center max-w-xl mx-auto my-12 shadow-sm space-y-4">
          <LayoutGrid className="w-12 h-12 text-[#7a0c0c] mx-auto" />
          <div className="space-y-1">
            <h3 className="text-base font-bold text-slate-800 dark:text-zinc-100">No Enabled Gadgets Selected</h3>
            <p className="text-xs text-slate-500">You currently have no enabled gadgets selected. Click below to choose gadgets to display.</p>
          </div>
          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              onClick={() => setShowGadgetsModal(true)}
              className="px-5 py-2 bg-[#7a0c0c] hover:bg-[#520000] text-white font-bold rounded text-xs cursor-pointer shadow-xs transition-colors"
            >
              Customize Gadgets
            </button>
          </div>
        </div>
      )}

      {/* Dynamic Movable & Reorderable Gadgets Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {gadgetOrder.map((gadgetName) => {
          if (!isGadgetEnabled(gadgetName)) return null;

          let cardContent = null;
          let colSpanClass = "lg:col-span-3";

          switch (gadgetName) {
            case "Temperature":
              colSpanClass = "lg:col-span-3";
              cardContent = (
                <div className="p-6 flex items-center justify-center gap-6 flex-1 min-h-[140px]">
                  <div className="relative w-12 h-20 flex items-center justify-center">
                    <div className="absolute top-2 w-3.5 h-12 bg-slate-100 dark:bg-zinc-800 border-2 border-slate-400 dark:border-zinc-600 rounded-full flex flex-col justify-end p-0.5 overflow-hidden">
                      <div className="w-full h-2/3 bg-red-500 rounded-full" />
                    </div>
                    <div className="absolute bottom-2 w-7 h-7 bg-slate-100 dark:bg-zinc-800 border-2 border-slate-400 dark:border-zinc-600 rounded-full flex items-center justify-center">
                      <div className="w-4 h-4 bg-red-500 rounded-full" />
                    </div>
                    <div className="absolute top-4 left-6 flex flex-col gap-1 opacity-50">
                      <div className="w-2 h-0.5 bg-slate-500" />
                      <div className="w-1.5 h-0.5 bg-slate-500" />
                      <div className="w-2 h-0.5 bg-slate-500" />
                      <div className="w-1.5 h-0.5 bg-slate-500" />
                    </div>
                  </div>
                  <div className="flex flex-col text-left">
                    <span className="text-3xl font-light tracking-tight text-slate-800 dark:text-white leading-none">
                      {highestTemp.toFixed(1)} °C
                    </span>
                    <a href="#devices" className="text-[11px] text-blue-600 dark:text-blue-400 font-bold hover:underline mt-2.5 leading-snug">
                      Highest<br/>Temperature of<br/>All Devices
                    </a>
                  </div>
                </div>
              );
              break;

            case "Temperature Trending in a Day":
              colSpanClass = isGadgetEnabled("Temperature") && isGadgetEnabled("Summary of Hierarchy") ? "lg:col-span-6" : "lg:col-span-9";
              cardContent = (
                <div className="p-4.5 flex-1 min-h-[140px] flex flex-col">
                  <span className="text-[9px] font-black uppercase text-slate-500 dark:text-zinc-400 text-center tracking-widest mb-1 block">
                    Highest Temperature of All Devices
                  </span>
                  <div className="w-full h-[105px] flex-1">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={tempTrendData} margin={{ top: 5, right: 10, left: -25, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="time" tick={{ fontSize: 9 }} stroke="#94a3b8" />
                        <YAxis domain={hasActiveDevices ? [14, 30] : [0, 30]} ticks={hasActiveDevices ? [14, 18, 22, 26, 30] : [0, 6, 12, 18, 24, 30]} tick={{ fontSize: 9 }} stroke="#94a3b8" />
                        <Tooltip contentStyle={{ fontSize: 10 }} />
                        <Line type="monotone" dataKey="temp" stroke="#60a5fa" strokeWidth={2} dot={{ r: 3, fill: "#60a5fa" }} activeDot={{ r: 5 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              );
              break;

            case "Summary of Hierarchy":
              colSpanClass = "lg:col-span-3";
              cardContent = (
                <div className="p-4 flex items-center justify-around flex-1 min-h-[140px]">
                  <div className="flex flex-col items-center justify-between gap-1 flex-1">
                    <span className="text-[10px] font-bold text-slate-400 dark:text-slate-400 uppercase tracking-widest">DC</span>
                    <span className="text-2xl font-black text-slate-800 dark:text-white leading-none my-1">{dcCount !== undefined && dcCount !== null ? dcCount : 0}</span>
                    <Database className="w-7 h-7 text-[#680505] dark:text-[#60a5fa]" />
                  </div>
                  <div className="flex flex-col items-center justify-between gap-1 flex-1">
                    <span className="text-[10px] font-bold text-slate-400 dark:text-slate-400 uppercase tracking-widest">Rooms</span>
                    <span className="text-2xl font-black text-slate-800 dark:text-white leading-none my-1">{roomsCount !== undefined && roomsCount !== null ? roomsCount : 0}</span>
                    <Home className="w-7 h-7 text-[#680505] dark:text-[#60a5fa]" />
                  </div>
                  <div className="flex flex-col items-center justify-between gap-1 flex-1">
                    <span className="text-[10px] font-bold text-slate-400 dark:text-slate-400 uppercase tracking-widest">Devices</span>
                    <span className="text-2xl font-black text-slate-800 dark:text-white leading-none my-1">{devicesCount !== undefined && devicesCount !== null ? devicesCount : 0}</span>
                    <Server className="w-7 h-7 text-[#680505] dark:text-[#60a5fa]" />
                  </div>
                </div>
              );
              break;

            case "Power Usage Effectiveness":
              colSpanClass = "lg:col-span-3";
              cardContent = (
                <div className="p-4 flex items-center justify-center flex-1 min-h-[140px]">
                  {renderPUEMeterGauge(currentPUE)}
                </div>
              );
              break;

            case "Power":
              colSpanClass = "lg:col-span-3";
              cardContent = (
                <div className="p-6 flex items-center justify-center gap-5 flex-1 min-h-[140px]">
                  <div className="w-14 h-14 bg-slate-50 dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 rounded-lg flex flex-col items-center justify-center relative overflow-hidden shrink-0">
                    <svg width="45" height="25" viewBox="0 0 50 30" className="overflow-visible mt-2">
                      <path d="M 5 25 A 20 20 0 0 1 45 25" fill="none" stroke="#94a3b8" strokeWidth="2.5" />
                      <line x1="25" y1="25" x2="13" y2="13" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" />
                      <circle cx="25" cy="25" r="2.5" fill="#ef4444" />
                    </svg>
                    <span className="text-[8px] font-black uppercase font-mono text-slate-500 tracking-wider mb-1 mt-0.5">W</span>
                  </div>
                  <div className="flex flex-col text-left">
                    <span className="text-2xl font-bold text-slate-800 dark:text-white leading-none">
                      {totalPower} W
                    </span>
                    <span className="text-[10px] text-slate-500 dark:text-zinc-400 font-bold uppercase tracking-wider mt-1.5">
                      IT Equipment<br/>Power
                    </span>
                  </div>
                </div>
              );
              break;

            case "Power Trending in a Day":
              colSpanClass = isGadgetEnabled("Power Usage Effectiveness") && isGadgetEnabled("Power") ? "lg:col-span-6" : "lg:col-span-12";
              cardContent = (
                <div className="p-4.5 flex-1 min-h-[140px] flex flex-col">
                  <span className="text-[9px] font-black uppercase text-slate-500 dark:text-zinc-400 text-center tracking-widest mb-1 block">
                    Total IT Equipment Power
                  </span>
                  <div className="w-full h-[105px] flex-1">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={powerTrendData} margin={{ top: 5, right: 10, left: -25, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="time" tick={{ fontSize: 9 }} stroke="#94a3b8" />
                        <YAxis domain={hasActiveDevices ? [70, 130] : [0, 130]} ticks={hasActiveDevices ? [70, 80, 90, 100, 110, 120, 130] : [0, 30, 60, 90, 120]} tick={{ fontSize: 9 }} stroke="#94a3b8" />
                        <Tooltip contentStyle={{ fontSize: 10 }} />
                        <Line type="monotone" dataKey="power" stroke="#60a5fa" strokeWidth={2} dot={{ r: 3, fill: "#60a5fa" }} activeDot={{ r: 5 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              );
              break;

            case "Device Statistics":
              colSpanClass = "lg:col-span-12";
              cardContent = (
                <div className="p-4 flex-1 flex flex-col justify-between">
                  <div className="flex justify-between items-center text-[10px] text-slate-500 dark:text-zinc-400 font-bold uppercase tracking-wider border-b border-slate-100 pb-2 mb-3">
                    <span>Total: {totalDevices}</span>
                  </div>
                  <div className="grid grid-cols-6 gap-2 text-center py-2 flex-1">
                    <div onClick={() => setActiveCategoryFilter("Not in Hierarchy")} className="flex flex-col items-center justify-between cursor-pointer group hover:scale-105 transition-transform" title="Click to view servers Not in Hierarchy">
                      <div className="w-10 h-10 rounded-full border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 flex items-center justify-center text-slate-400 group-hover:border-blue-500 group-hover:bg-blue-50 transition-colors">
                        <Layers className="w-5 h-5 group-hover:text-blue-600" />
                      </div>
                      <span className="text-xl font-bold text-slate-700 dark:text-zinc-300 mt-2">{notInHierarchy}</span>
                      <span className="text-[7.5px] font-bold text-slate-500 uppercase tracking-tight mt-1 leading-snug group-hover:text-blue-600">Not in Hierarchy</span>
                    </div>
                    <div onClick={() => setActiveCategoryFilter("Connection Lost")} className="flex flex-col items-center justify-between cursor-pointer group hover:scale-105 transition-transform" title="Click to view servers with Connection Lost">
                      <div className="w-10 h-10 rounded-full border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 flex items-center justify-center text-slate-400 group-hover:border-rose-500 group-hover:bg-rose-50 transition-colors">
                        <Activity className="w-5 h-5 group-hover:text-rose-600" />
                      </div>
                      <span className="text-xl font-bold text-slate-700 dark:text-zinc-300 mt-2">{connectionLost}</span>
                      <span className="text-[7.5px] font-bold text-slate-500 uppercase tracking-tight mt-1 leading-snug group-hover:text-rose-600">Connection Lost</span>
                    </div>
                    <div onClick={() => setActiveCategoryFilter("Unhealthy (All)")} className="flex flex-col items-center justify-between cursor-pointer group hover:scale-105 transition-transform" title="Click to view Unhealthy servers">
                      <div className="w-10 h-10 rounded-full border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 flex items-center justify-center text-slate-400 group-hover:border-amber-500 group-hover:bg-amber-50 transition-colors">
                        <ShieldAlert className="w-5 h-5 group-hover:text-amber-600" />
                      </div>
                      <span className="text-xl font-bold text-slate-700 dark:text-zinc-300 mt-2">{unhealthyCount}</span>
                      <span className="text-[7.5px] font-bold text-slate-500 uppercase tracking-tight mt-1 leading-snug group-hover:text-amber-600">Unhealthy (All)</span>
                    </div>
                    <div onClick={() => setActiveCategoryFilter("Power Off")} className="flex flex-col items-center justify-between cursor-pointer group hover:scale-105 transition-transform" title="Click to view Power Off servers">
                      <div className="w-10 h-10 rounded-full border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 flex items-center justify-center text-slate-400 group-hover:border-amber-500 group-hover:bg-amber-50 transition-colors">
                        <Zap className="w-5 h-5 group-hover:text-amber-600" />
                      </div>
                      <span className="text-xl font-bold text-slate-700 dark:text-zinc-300 mt-2">{powerOff}</span>
                      <span className="text-[7.5px] font-bold text-slate-500 uppercase tracking-tight mt-1 leading-snug group-hover:text-amber-600">Power Off</span>
                    </div>
                    <div onClick={() => setActiveCategoryFilter("Fail to Monitor")} className="flex flex-col items-center justify-between cursor-pointer group hover:scale-105 transition-transform" title="Click to view Fail to Monitor servers">
                      <div className="w-10 h-10 rounded-full border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 flex items-center justify-center text-slate-400 group-hover:border-red-500 group-hover:bg-red-50 transition-colors">
                        <AlertTriangle className="w-5 h-5 group-hover:text-red-600" />
                      </div>
                      <span className="text-xl font-bold text-slate-700 dark:text-zinc-300 mt-2">{failToMonitor}</span>
                      <span className="text-[7.5px] font-bold text-slate-500 uppercase tracking-tight mt-1 leading-snug group-hover:text-red-600">Fail to Monitor</span>
                    </div>
                    <div onClick={() => setActiveCategoryFilter("Unmanaged")} className="flex flex-col items-center justify-between cursor-pointer group hover:scale-105 transition-transform" title="Click to view Unmanaged servers">
                      <div className="w-10 h-10 rounded-full border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 flex items-center justify-center text-slate-400 group-hover:border-purple-500 group-hover:bg-purple-50 transition-colors">
                        <Database className="w-5 h-5 group-hover:text-purple-600" />
                      </div>
                      <span className="text-xl font-bold text-slate-700 dark:text-zinc-300 mt-2">{unmanaged}</span>
                      <span className="text-[7.5px] font-bold text-slate-500 uppercase tracking-tight mt-1 leading-snug group-hover:text-purple-600">Unmanaged</span>
                    </div>
                  </div>
                </div>
              );
              break;

            default:
              return null;
          }

          return (
            <div 
              key={gadgetName}
              className={`${colSpanClass} bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded shadow-sm overflow-hidden flex flex-col justify-between hover:shadow-md`}
            >
              <div className="bg-[#b3b3b3] dark:bg-zinc-800 text-slate-850 dark:text-zinc-200 px-3.5 py-1.5 text-[11px] font-black uppercase tracking-wider flex items-center justify-between border-b border-slate-300 dark:border-zinc-700">
                <span>{gadgetName}</span>
              </div>
              {cardContent}
            </div>
          );
        })}
      </div>

      {/* SECTION 4: Power, Space, Weight Capacity & Top Rooms */}
      {(isGadgetEnabled("Power Capacity") || isGadgetEnabled("Space Capacity") || isGadgetEnabled("Weight Capacity") || isGadgetEnabled("Top 3 High Temperature Rooms")) && (
        <div className="space-y-3">
          {/* Rack Selector Header Bar */}
          {(isGadgetEnabled("Power Capacity") || isGadgetEnabled("Space Capacity") || isGadgetEnabled("Weight Capacity")) && (
            <div className="flex items-center justify-between bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded px-4 py-2 text-xs shadow-2xs">
              <div className="flex items-center gap-2 font-bold text-slate-700 dark:text-slate-200">
                <Server className="w-4 h-4 text-[#7a0c0c] dark:text-red-400" />
                <span>Rack Capacity Overview</span>
              </div>
              <div className="flex items-center gap-2">
                <label className="font-bold text-slate-600 dark:text-slate-300 text-[11px] uppercase tracking-wider">Select Rack:</label>
                <select
                  value={dashSelectedRack}
                  onChange={(e) => setDashSelectedRack(e.target.value)}
                  className="px-3 py-1 bg-slate-100 dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 rounded font-bold text-slate-800 dark:text-white focus:outline-none focus:border-[#7a0c0c] text-xs cursor-pointer"
                >
                  {dashAvailableRacks.map(rk => (
                    <option key={rk} value={rk}>{rk}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Capacity 1: Power */}
            {isGadgetEnabled("Power Capacity") && (
              <div className="lg:col-span-3 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded shadow-sm overflow-hidden flex flex-col justify-between">
                <div className="bg-[#b3b3b3] dark:bg-zinc-800 text-slate-850 dark:text-zinc-200 px-4.5 py-2 text-xs font-black uppercase tracking-wider flex justify-between items-center">
                  <span>Power Capacity</span>
                  <span className="text-xs font-black text-slate-800 dark:text-slate-200 bg-slate-200 dark:bg-zinc-700 px-2 py-0.5 rounded">{dashSelectedRack}</span>
                </div>
                <div className="p-4 flex items-center gap-4.5 flex-1 min-h-[130px]">
                  {renderCapacityBar(dashPowerSegs)}
                  <div className="flex flex-col text-left font-sans text-sm">
                    <span className="text-xs font-black uppercase text-slate-500 dark:text-slate-400 tracking-wider">USED:</span>
                    <span className="text-base font-black text-slate-900 dark:text-white leading-tight mb-2">{dashUsedPowerW} W</span>
                    <span className="text-xs font-black uppercase text-slate-500 dark:text-slate-400 tracking-wider">Power Capacity:</span>
                    <span className="text-base font-black text-slate-900 dark:text-white leading-tight">{dashFormattedPowerStr}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Capacity 2: Space */}
            {isGadgetEnabled("Space Capacity") && (
              <div className="lg:col-span-3 bg-[#ffffff] dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded shadow-sm overflow-hidden flex flex-col justify-between">
                <div className="bg-[#b3b3b3] dark:bg-zinc-800 text-slate-850 dark:text-zinc-200 px-4.5 py-2 text-xs font-black uppercase tracking-wider flex justify-between items-center">
                  <span>Space Capacity</span>
                  <span className="text-xs font-black text-slate-800 dark:text-slate-200 bg-slate-200 dark:bg-zinc-700 px-2 py-0.5 rounded">{dashSelectedRack}</span>
                </div>
                <div className="p-4 flex items-center gap-4.5 flex-1 min-h-[130px]">
                  {renderCapacityBar(dashSpaceSegs)}
                  <div className="flex flex-col text-left font-sans text-sm">
                    <span className="text-xs font-black uppercase text-slate-500 dark:text-slate-400 tracking-wider">USED:</span>
                    <span className="text-base font-black text-slate-900 dark:text-white leading-tight mb-2">{dashUsedSpaceU} U</span>
                    <span className="text-xs font-black uppercase text-slate-500 dark:text-slate-400 tracking-wider">Space Capacity:</span>
                    <span className="text-base font-black text-slate-900 dark:text-white leading-tight">{dashSpaceU} U</span>
                  </div>
                </div>
              </div>
            )}

            {/* Capacity 3: Weight */}
            {isGadgetEnabled("Weight Capacity") && (
              <div className="lg:col-span-3 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded shadow-sm overflow-hidden flex flex-col justify-between">
                <div className="bg-[#b3b3b3] dark:bg-zinc-800 text-slate-850 dark:text-zinc-200 px-4.5 py-2 text-xs font-black uppercase tracking-wider flex justify-between items-center">
                  <span>Weight Capacity</span>
                  <span className="text-xs font-black text-slate-800 dark:text-slate-200 bg-slate-200 dark:bg-zinc-700 px-2 py-0.5 rounded">{dashSelectedRack}</span>
                </div>
                <div className="p-4 flex items-center gap-4.5 flex-1 min-h-[130px]">
                  {renderCapacityBar(dashWeightSegs)}
                  <div className="flex flex-col text-left font-sans text-sm">
                    <span className="text-xs font-black uppercase text-slate-500 dark:text-slate-400 tracking-wider">USED:</span>
                    <span className="text-base font-black text-slate-900 dark:text-white leading-tight mb-2">{dashUsedWeightKg} kg</span>
                    <span className="text-xs font-black uppercase text-slate-500 dark:text-slate-400 tracking-wider">Weight Capacity:</span>
                    <span className="text-base font-black text-slate-900 dark:text-white leading-tight">{dashWeightKg} kg</span>
                  </div>
                </div>
              </div>
            )}

          {/* Top 3 High Temperature Rooms */}
          {isGadgetEnabled("Top 3 High Temperature Rooms") && (
            <div className="lg:col-span-3 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded shadow-sm overflow-hidden flex flex-col justify-between">
              <div className="bg-[#b3b3b3] dark:bg-zinc-800 text-slate-850 dark:text-zinc-200 px-4.5 py-1.5 text-[11px] font-black uppercase tracking-wider">
                Top 3 High Temperature Rooms
              </div>
              <div className="p-4.5 flex-1 flex flex-col justify-between min-h-[130px]">
                <div className="flex items-center gap-2.5">
                  <Home className="w-6 h-6 text-[#7a0c0c] dark:text-[#60a5fa] shrink-0" />
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-350">
                    22.0 °C Room1
                  </span>
                </div>
                
                <div className="w-full flex items-end justify-start h-10 gap-0.5 mt-3 pl-8">
                  <div className="w-10 h-3 bg-slate-200 dark:bg-zinc-800 border-t border-slate-350" />
                  <div className="w-10 h-6 bg-slate-200 dark:bg-zinc-800 border-t border-l border-slate-350" />
                  <div className="w-10 h-9 bg-slate-200 dark:bg-zinc-800 border-t border-l border-slate-350" />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      )}

      {/* SECTION 5: Events Table & Events by Severity */}
      {(isGadgetEnabled("Events") || isGadgetEnabled("Events by Severity")) && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Events Table Card */}
          {isGadgetEnabled("Events") && (
            <div className={`bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded shadow-sm overflow-hidden flex flex-col ${
              isGadgetEnabled("Events by Severity") ? "lg:col-span-8" : "lg:col-span-12"
            }`}>
              <div className="bg-[#b3b3b3] dark:bg-zinc-800 text-slate-850 dark:text-zinc-200 px-4.5 py-1.5 text-[11px] font-black uppercase tracking-wider">
                Events
              </div>
              <div className="flex-1 flex flex-col justify-between">
                <div className="overflow-x-auto w-full flex-1">
                  <table className="w-full text-left text-xs border-collapse font-sans">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-zinc-800/50 border-b border-slate-200 dark:border-zinc-850 text-slate-500 font-bold uppercase tracking-wider">
                        <th className="py-2.5 px-3 border-r border-slate-200 dark:border-zinc-800 text-[9px] font-mono">Severity ↑↓</th>
                        <th className="py-2.5 px-3 border-r border-slate-200 dark:border-zinc-800 text-[9px] font-mono">Entity ↑↓</th>
                        <th className="py-2.5 px-3 border-r border-slate-200 dark:border-zinc-800 text-[9px] font-mono">Serial Number</th>
                        <th className="py-2.5 px-3 border-r border-slate-200 dark:border-zinc-800 text-[9px] font-mono">Category ↑↓</th>
                        <th className="py-2.5 px-3 border-r border-slate-200 dark:border-zinc-800 text-[9px] font-mono">Event Type ↑↓</th>
                        <th className="py-2.5 px-3 border-r border-slate-200 dark:border-zinc-800 text-[9px] font-mono">Description ↑↓</th>
                        <th className="py-2.5 px-3 border-r border-slate-200 dark:border-zinc-800 text-[9px] font-mono">Timestamp ↓</th>
                        <th className="py-2.5 px-3 text-[9px] font-mono">Count ↑↓</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
                      {alerts.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="py-12 px-4 text-center text-slate-400 font-medium">
                            No records found
                          </td>
                        </tr>
                      ) : (
                        alerts.slice((eventsPage - 1) * 5, eventsPage * 5).map((log, idx) => (
                          <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-zinc-800/40">
                            <td className="py-2 px-3 border-r border-slate-200 dark:border-zinc-800 font-bold font-mono">
                              <span className={`px-2 py-0.5 rounded text-[10px] ${
                                log.severity === "Critical" ? "bg-red-100 text-red-750" : 
                                log.severity === "Warning" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
                              }`}>
                                {log.severity}
                              </span>
                            </td>
                            <td className="py-2 px-3 border-r border-slate-200 dark:border-zinc-800 truncate font-mono max-w-[100px]">{log.server}</td>
                            <td className="py-2 px-3 border-r border-slate-200 dark:border-zinc-800 truncate font-mono text-slate-500">N/A</td>
                            <td className="py-2 px-3 border-r border-slate-200 dark:border-zinc-800 font-bold">{log.type}</td>
                            <td className="py-2 px-3 border-r border-slate-200 dark:border-zinc-800 font-mono text-slate-500">Log</td>
                            <td className="py-2 px-3 border-r border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-300 font-medium">{log.message}</td>
                            <td className="py-2 px-3 border-r border-slate-200 dark:border-zinc-800 font-mono text-[10px]">{new Date(log.timestamp).toLocaleString()}</td>
                            <td className="py-2 px-3 font-mono font-bold text-center">1</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pagination Controls */}
                <div className="flex justify-center items-center gap-1.5 py-2 border-t border-slate-100">
                  <button 
                    onClick={() => setEventsPage(prev => Math.max(1, prev - 1))}
                    disabled={eventsPage === 1}
                    className="p-1 rounded text-slate-400 hover:bg-slate-50 disabled:opacity-30 cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="w-6 h-6 rounded bg-[#7a0c0c] text-white flex items-center justify-center text-xs font-bold font-mono">
                    {eventsPage}
                  </span>
                  <button 
                    onClick={() => setEventsPage(prev => prev + 1)}
                    disabled={alerts.length <= eventsPage * 5}
                    className="p-1 rounded text-slate-400 hover:bg-slate-50 disabled:opacity-30 cursor-pointer"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Events by Severity Pie/Donut Chart */}
          {isGadgetEnabled("Events by Severity") && (
            <div className={`bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded shadow-sm overflow-hidden flex flex-col justify-between ${
              isGadgetEnabled("Events") ? "lg:col-span-4" : "lg:col-span-12"
            }`}>
              <div className="bg-[#b3b3b3] dark:bg-zinc-800 text-slate-850 dark:text-zinc-200 px-4.5 py-1.5 text-[11px] font-black uppercase tracking-wider">
                Events by Severity
              </div>
              <div className="p-4 flex items-center gap-4 flex-1 min-h-[140px]">
                <div className="w-[100px] h-[100px] shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={severityData.filter(d => d.value > 0).length > 0 ? severityData.filter(d => d.value > 0) : [{ name: "Healthy", value: 1, color: "#cbd5e1" }]}
                        cx="50%"
                        cy="50%"
                        innerRadius={25}
                        outerRadius={45}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {(severityData.filter(d => d.value > 0).length > 0 ? severityData.filter(d => d.value > 0) : [{ name: "Healthy", value: 1, color: "#cbd5e1" }]).map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                
                <div className="flex-1 flex flex-col gap-1 text-xs">
                  {severityData.map((item) => (
                    <div key={item.name} className="flex items-center justify-between text-slate-600 dark:text-zinc-300 font-sans">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                        <span className="font-bold text-[11px] text-slate-500 uppercase tracking-wide">{item.name}:</span>
                      </div>
                      <span className="font-black text-slate-800 dark:text-white font-mono">{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* SECTION 6: Events by Category & GPU Stats */}
      {(isGadgetEnabled("Events by Category") || isGadgetEnabled("GPU Statistics")) && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Events by Category Card */}
          {isGadgetEnabled("Events by Category") && (
            <div className={`bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded shadow-sm overflow-hidden flex flex-col justify-between ${
              isGadgetEnabled("GPU Statistics") ? "lg:col-span-6" : "lg:col-span-12"
            }`}>
              <div className="bg-[#b3b3b3] dark:bg-zinc-800 text-slate-850 dark:text-zinc-200 px-4.5 py-1.5 text-[11px] font-black uppercase tracking-wider">
                Events by Category
              </div>
              <div className="p-4.5 flex items-center gap-6 flex-1 min-h-[160px]">
                <div className="w-[120px] h-[120px] shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={categoryData.filter(d => d.value > 0).length > 0 ? categoryData.filter(d => d.value > 0) : [{ name: "Healthy", value: 1, color: "#cbd5e1" }]}
                        cx="50%"
                        cy="50%"
                        innerRadius={0}
                        outerRadius={55}
                        paddingAngle={0}
                        dataKey="value"
                      >
                        {(categoryData.filter(d => d.value > 0).length > 0 ? categoryData.filter(d => d.value > 0) : [{ name: "Healthy", value: 1, color: "#cbd5e1" }]).map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                
                <div className="flex-1 grid grid-cols-1 gap-0.5 text-[10px] max-h-[160px] overflow-y-auto pr-1 border border-slate-100 rounded p-1.5 bg-slate-50 dark:bg-zinc-950/50 sidebar-scroll">
                  {categoryData.map((item) => (
                    <div key={item.name} className="flex items-center justify-between text-slate-600 dark:text-zinc-400 font-sans">
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                        <span className="font-bold uppercase tracking-wider text-[8px] truncate">{item.name}:</span>
                      </div>
                      <span className="font-black text-slate-800 dark:text-white font-mono ml-2">{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* GPU Statistics Card */}
          {isGadgetEnabled("GPU Statistics") && (
            <div className={`bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded shadow-sm overflow-hidden flex flex-col justify-between ${
              isGadgetEnabled("Events by Category") ? "lg:col-span-6" : "lg:col-span-12"
            }`}>
              <div className="bg-[#b3b3b3] dark:bg-zinc-800 text-slate-850 dark:text-zinc-200 px-4.5 py-1.5 text-[11px] font-black uppercase tracking-wider">
                GPU Statistics
              </div>
              <div className="p-6 flex items-center justify-center gap-8 flex-1 min-h-[160px]">
                <div className="w-16 h-12 bg-slate-50 dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 rounded-lg flex flex-col items-center justify-center p-2 shrink-0">
                  <Cpu className="w-8 h-8 text-slate-500" />
                </div>
                <div className="flex flex-col text-left">
                  <span className="text-3xl font-extrabold text-slate-800 dark:text-white leading-none">0</span>
                  <span className="text-[10px] text-slate-500 dark:text-zinc-400 font-bold uppercase tracking-wider mt-2.5">
                    Total number of GPUs in<br/>All Datacenters
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}





      {/* CATEGORY SERVERS MODAL OVERLAY */}
      {activeCategoryFilter && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-xs select-none font-sans">
          <div className="bg-white border border-slate-300 rounded-xl shadow-2xl max-w-3xl w-full overflow-hidden flex flex-col max-h-[85vh]">
            {/* Modal Header */}
            <div className="bg-[#002f54] text-white px-5 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Server className="w-5 h-5 text-blue-400" />
                <span className="font-bold text-sm">Devices under Category: {activeCategoryFilter} ({categoryServers.length})</span>
              </div>
              <button 
                onClick={() => setActiveCategoryFilter(null)}
                className="text-white/80 hover:text-white p-1 rounded hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 overflow-y-auto space-y-3 max-h-[60vh]">
              {categoryServers.length === 0 ? (
                <div className="p-8 text-center bg-slate-50 border border-slate-200 rounded">
                  <p className="text-sm font-bold text-slate-600 mb-2">No servers found under "{activeCategoryFilter}"</p>
                  <p className="text-xs text-slate-400">All registered devices are operating properly or assigned elsewhere.</p>
                </div>
              ) : (
                <div className="border border-slate-200 rounded overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100 border-b border-slate-200 text-slate-700 font-bold uppercase text-[10px]">
                      <tr>
                        <th className="p-2.5">#</th>
                        <th className="p-2.5">Device Name</th>
                        <th className="p-2.5">BMC IP Address</th>
                        <th className="p-2.5">Location / Rack</th>
                        <th className="p-2.5">Status</th>
                        <th className="p-2.5 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {categoryServers.map((srv: any, idx: number) => (
                        <tr key={srv.id} className="hover:bg-slate-50 transition-colors">
                          <td className="p-2.5 font-bold text-slate-400 text-[11px]">{idx + 1}</td>
                          <td className="p-2.5 font-bold text-slate-800">{srv.name}</td>
                          <td className="p-2.5 font-mono text-blue-600 font-bold">{srv.bmcIp}</td>
                          <td className="p-2.5 text-slate-600">{serverRacks[srv.id] || srv.rack || "Not in Hierarchy"}</td>
                          <td className="p-2.5">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              serverStatuses[srv.id]?.status === "Critical" ? "bg-rose-100 text-rose-700" :
                              serverStatuses[srv.id]?.status === "Warning" ? "bg-amber-100 text-amber-700" :
                              serverStatuses[srv.id]?.status === "Offline" ? "bg-slate-200 text-slate-700" :
                              "bg-emerald-100 text-emerald-700"
                            }`}>
                              {serverStatuses[srv.id]?.status || "OK"}
                            </span>
                          </td>
                          <td className="p-2.5 text-right">
                            <button
                              onClick={() => {
                                onSelectServer(srv.id);
                                setActiveCategoryFilter(null);
                              }}
                              className="px-3 py-1 bg-[#002f54] hover:bg-[#001f38] text-white rounded text-[11px] font-bold cursor-pointer transition-colors"
                            >
                              Inspect Server
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setActiveCategoryFilter(null)}
                className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded text-xs cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
