import React, { useState, useEffect, useMemo } from "react";
import { 
  LineChart, 
  Line, 
  AreaChart,
  Area,
  ReferenceLine,
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
  X,
  SlidersHorizontal,
  CheckCircle2,
  Bell,
  AlertOctagon,
  Network,
  Wifi,
  WifiOff,
  Radio,
  ArrowUpRight,
  Check,
  Eye,
  ShieldCheck,
  AlertCircle,
  Settings,
  Clock
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
  const [showServerDoctorModal, setShowServerDoctorModal] = useState(false);
  const [showFlightRecorderModal, setShowFlightRecorderModal] = useState(false);
  const [enabledGadgets, setEnabledGadgets] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("tyrone_enabled_gadgets");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const missing = ALL_GADGETS.filter(g => !parsed.some((p: string) => p.toLowerCase().trim() === g.toLowerCase().trim()));
          return [...parsed, ...missing];
        }
      }
    } catch (_) {}
    return ALL_GADGETS;
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

  const [capacityTick, setCapacityTick] = useState(0);
  // Local fleet state synced from localStorage for live capacity tracking
  const [localFleet, setLocalFleet] = useState<any[]>([]);

  // Get available racks list for dropdown (strictly present active racks in hierarchy tree - NO deleted racks)
  const dashAvailableRacks = useMemo(() => {
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

      const activeRowKeys = new Set<string>();

      if (Array.isArray(dcs) && dcs.length > 0) {
        dcs.forEach((dc: any) => {
          const dcKey = dc.id || dc.name;
          const roomList = rms[dcKey] || rms[dc.name] || [];
          if (Array.isArray(roomList)) {
            roomList.forEach((rm: any) => {
              const rKey = rm.id || rm.name;
              const rowList = rws[rKey] || rws[rm.name] || [];
              if (Array.isArray(rowList)) {
                rowList.forEach((rw: any) => {
                  const rwKey = rw.id || rw.name;
                  activeRowKeys.add(rwKey);
                  if (rw.name) activeRowKeys.add(rw.name);
                });
              }
            });
          }
        });
      } else {
        Object.values(rws).forEach((rowList: any) => {
          if (Array.isArray(rowList)) {
            rowList.forEach((rw: any) => {
              const rwKey = rw.id || rw.name;
              activeRowKeys.add(rwKey);
              if (rw.name) activeRowKeys.add(rw.name);
            });
          }
        });
      }

      // Collect racks ONLY from active row keys in the active hierarchy tree
      activeRowKeys.forEach(rwKey => {
        const rackList = rks[rwKey];
        if (Array.isArray(rackList)) {
          rackList.forEach((rk: any) => {
            const name = typeof rk === "string" ? rk : (rk?.name || rk?.id);
            if (name && typeof name === "string" && name.trim()) {
              rackSet.add(name.trim());
            }
          });
        }
      });
    } catch {}

    return Array.from(rackSet);
  }, [localFleet, servers, capacityTick]);

  // Rack capacity selection state in Dashboard
  const [dashSelectedRack, setDashSelectedRack] = useState<string>(() => {
    return dashAvailableRacks.length > 0 ? dashAvailableRacks[0] : "";
  });

  useEffect(() => {
    if (dashAvailableRacks.length > 0) {
      if (!dashSelectedRack || !dashAvailableRacks.includes(dashSelectedRack)) {
        setDashSelectedRack(dashAvailableRacks[0]);
      }
    } else {
      setDashSelectedRack("");
    }
  }, [dashAvailableRacks]);

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
    return rk === dashSelectedRack;
  });

  const activeCapacityFleet = dashRackServers;

  const dashUsedPowerW = activeCapacityFleet.reduce((sum, s) => {
    const p = parseFloat((s as any).deratedPowerW || (s as any).powerW || (s as any).power) || 0;
    return sum + p;
  }, 0);

  const dashUsedSpaceU = activeCapacityFleet.reduce((sum, s) => {
    const u = parseFloat((s as any).sizeU || (s as any).size) || 0;
    return sum + u;
  }, 0);

  const dashUsedWeightKg = activeCapacityFleet.reduce((sum, s) => {
    const w = parseFloat((s as any).weightKg || (s as any).weight) || 0;
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

  // Detailed temperature analysis across all server nodes (queries live Redfish telemetry & inventory cache)
  const serverTemperatures = useMemo(() => {
    if (!servers || servers.length === 0 || !hasActiveDevices) return [];

    return servers.map((s: any) => {
      const statusObj = serverStatuses?.[s.id] || serverStatuses?.[s.bmcIp];
      let temp = parseFloat(statusObj?.temperature || statusObj?.temp || statusObj?.readingCelsius || "0.0");

      if (!temp || temp === 0) {
        try {
          const cached = localStorage.getItem(`tyrone_inv_cache_${s.id}`) || localStorage.getItem(`tyrone_inv_cache_${s.bmcIp}`);
          if (cached) {
            const parsed = JSON.parse(cached);
            if (Array.isArray(parsed?.temperatures) && parsed.temperatures.length > 0) {
              const maxReading = Math.max(...parsed.temperatures.map((t: any) => parseFloat(t.ReadingCelsius || "0") || 0));
              if (maxReading > 0) temp = maxReading;
            }
          }
        } catch {}
      }

      return {
        id: s.id,
        name: s.name || s.bmcIp || "Server Node",
        bmcIp: s.bmcIp,
        model: s.model || "Redfish Server Node",
        temp: temp > 0 ? temp : 0.0,
        isFetched: temp > 0
      };
    }).sort((a, b) => b.temp - a.temp);
  }, [servers, serverStatuses, hasActiveDevices]);

  const maxTempNode = serverTemperatures.length > 0 ? serverTemperatures[0] : null;

  const highestTemp = useMemo(() => {
    if (maxTempNode && maxTempNode.isFetched) return maxTempNode.temp;
    if (!servers || servers.length === 0 || !hasActiveDevices) return 0.0;
    let maxT = 0.0;
    servers.forEach((s: any) => {
      const statusObj = serverStatuses?.[s.id] || serverStatuses?.[s.bmcIp];
      const t = parseFloat(statusObj?.temperature || statusObj?.temp || statusObj?.readingCelsius || "0.0");
      if (t > maxT) maxT = t;
    });
    return maxT;
  }, [servers, serverStatuses, hasActiveDevices, maxTempNode]);

  // Interactive Timeframe States for Telemetry Graphs
  const [tempTimeframe, setTempTimeframe] = useState<"24h" | "7d" | "30d">("24h");
  const [powerTimeframe, setPowerTimeframe] = useState<"24h" | "7d" | "30d">("24h");

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

  // Persistent Real Telemetry Recording Log
  const [telemetryHistory, setTelemetryHistory] = useState<Array<{ timestamp: number; time: string; temp: number; power: number }>>(() => {
    try {
      const saved = localStorage.getItem("tyrone_telemetry_history");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  });

  useEffect(() => {
    if (!hasActiveDevices || (highestTemp === 0 && totalPower === 0)) return;
    const currentTemp = highestTemp;
    const currentPower = totalPower;
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    setTelemetryHistory(prev => {
      let cleaned = prev;
      if (currentTemp >= 30.0 && prev.some(h => h.temp <= 0)) {
        cleaned = prev.filter(h => h.temp > 0);
      }

      const last = cleaned[cleaned.length - 1];
      if (last && (Date.now() - last.timestamp < 15000) && last.temp === currentTemp && last.power === currentPower) {
        return cleaned;
      }
      const updated = [...cleaned, { timestamp: Date.now(), time: timeStr, temp: currentTemp, power: currentPower }].slice(-500);
      try {
        localStorage.setItem("tyrone_telemetry_history", JSON.stringify(updated));
      } catch {}
      return updated;
    });
  }, [highestTemp, totalPower, hasActiveDevices]);

  // Dynamic Detailed Telemetry Data derived strictly from actual hardware readings with clean timeline
  const tempTrendData = useMemo(() => {
    const liveTemp = highestTemp;
    const now = new Date();

    // Generate 12 distinct 2-hour interval time slots ending at current live time
    const slots = Array.from({ length: 12 }, (_, i) => {
      const slotTime = new Date(now.getTime() - (11 - i) * 2 * 3600 * 1000);
      const hours = String(slotTime.getHours()).padStart(2, '0');
      const mins = String(slotTime.getMinutes()).padStart(2, '0');
      return {
        timestamp: slotTime.getTime(),
        timeLabel: i === 11 ? `${hours}:${mins}` : `${hours}:00`
      };
    });

    return slots.map((slot) => {
      const windowStart = slot.timestamp - 3600 * 1000;
      const windowEnd = slot.timestamp + 3600 * 1000;
      const matches = telemetryHistory.filter(h => h.timestamp >= windowStart && h.timestamp <= windowEnd && h.temp > 0);

      let val: number;
      if (matches.length > 0) {
        val = +(matches.reduce((sum, h) => sum + h.temp, 0) / matches.length).toFixed(1);
      } else {
        val = liveTemp;
      }

      return {
        time: slot.timeLabel,
        temp: val,
        warningLimit: 28,
        criticalLimit: 35
      };
    });
  }, [highestTemp, telemetryHistory]);

  const tempStats = useMemo(() => {
    if (!tempTrendData || tempTrendData.length === 0) return { peak: 0, avg: 0, min: 0, status: "NOMINAL" };
    const temps = tempTrendData.map(d => d.temp);
    const peak = Math.max(...temps);
    const min = Math.min(...temps);
    const avg = +(temps.reduce((a, b) => a + b, 0) / temps.length).toFixed(1);
    const status = peak >= 35 ? "CRITICAL" : peak >= 28 ? "WARNING" : "NOMINAL";
    return { peak, avg, min, status };
  }, [tempTrendData]);

  // Dynamic Power Telemetry Data
  const powerTrendData = useMemo(() => {
    const livePower = totalPower;
    const now = new Date();

    const slots = Array.from({ length: 12 }, (_, i) => {
      const slotTime = new Date(now.getTime() - (11 - i) * 2 * 3600 * 1000);
      const hours = String(slotTime.getHours()).padStart(2, '0');
      const mins = String(slotTime.getMinutes()).padStart(2, '0');
      return {
        timestamp: slotTime.getTime(),
        timeLabel: i === 11 ? `${hours}:${mins}` : `${hours}:00`
      };
    });

    return slots.map((slot) => {
      const windowStart = slot.timestamp - 3600 * 1000;
      const windowEnd = slot.timestamp + 3600 * 1000;
      const matches = telemetryHistory.filter(h => h.timestamp >= windowStart && h.timestamp <= windowEnd && h.power > 0);

      let val: number;
      if (matches.length > 0) {
        val = Math.round(matches.reduce((sum, h) => sum + h.power, 0) / matches.length);
      } else {
        val = livePower;
      }

      return {
        time: slot.timeLabel,
        power: val,
        capacityThreshold: 1200
      };
    });
  }, [totalPower, telemetryHistory]);

  const powerStats = useMemo(() => {
    if (!powerTrendData || powerTrendData.length === 0) return { peak: 0, avg: 0, min: 0, status: "NOMINAL" };
    const powers = powerTrendData.map(d => d.power);
    const peak = Math.max(...powers);
    const min = Math.min(...powers);
    const avg = Math.round(powers.reduce((a, b) => a + b, 0) / powers.length);
    const status = peak >= 1200 ? "HIGH LOAD" : "NOMINAL";
    return { peak, avg, min, status };
  }, [powerTrendData]);

  const tempYDomain = useMemo(() => {
    if (!tempTrendData || tempTrendData.length === 0) return [0, 40];
    const temps = tempTrendData.map(d => d.temp);
    const min = Math.min(...temps);
    const max = Math.max(...temps);
    const range = max - min;
    const padding = Math.max(2, range * 0.4);
    return [Math.max(0, +(min - padding).toFixed(1)), +(max + padding).toFixed(1)];
  }, [tempTrendData]);

  const powerYDomain = useMemo(() => {
    if (!powerTrendData || powerTrendData.length === 0) return [0, 2000];
    const powers = powerTrendData.map(d => d.power);
    const min = Math.min(...powers);
    const max = Math.max(...powers);
    const range = max - min;
    const padding = Math.max(30, range * 0.4);
    return [Math.max(0, Math.floor(min - padding)), Math.ceil(max + padding)];
  }, [powerTrendData]);

  // Calculate total number of GPUs across active data center servers
  const totalGpus = useMemo(() => {
    let cachedGpuCount = 0;
    try {
      const rawGpuCache = localStorage.getItem("tyrone_gpu_cache");
      if (rawGpuCache) {
        const parsedGpus = JSON.parse(rawGpuCache);
        if (Array.isArray(parsedGpus)) cachedGpuCount = parsedGpus.length;
      }
    } catch (_) {}

    if (!servers || servers.length === 0) return cachedGpuCount;

    const countFromServers = servers.reduce((acc: number, s: any) => {
      const statusObj = serverStatuses?.[s.id] || serverStatuses?.[s.bmcIp];
      let count = parseInt(s.gpuCount || statusObj?.gpuCount || (s.gpus ? s.gpus.length : 0) || (s.accelerators ? s.accelerators.length : 0) || "0") || 0;
      
      if (count === 0) {
        // Inspect telemetry cache for PCIe GPUs on this server
        try {
          const cacheKey = (s.id || s.bmcIp || "").toLowerCase();
          const raw = localStorage.getItem(`tyrone_telemetry_json_${cacheKey}`);
          if (raw) {
            const telemetry = JSON.parse(raw);
            const pcie = telemetry.pcieDevices || telemetry.hbas || [];
            if (Array.isArray(pcie)) {
              count = pcie.filter((item: any) => {
                const str = JSON.stringify(item).toUpperCase();
                return str.includes("GPU") || str.includes("NVIDIA") || str.includes("AMD") || str.includes("TESLA") || str.includes("QUADRO") || str.includes("RADEON");
              }).length;
            }
          }
        } catch (_) {}
      }

      return acc + count;
    }, 0);

    return Math.max(countFromServers, cachedGpuCount);
  }, [servers, serverStatuses]);

  // Real Network Port Monitoring Generator
  const [networkFilter, setNetworkFilter] = useState<"ALL" | "DOWN" | "UP">("ALL");

  const allNetworkPorts = useMemo(() => {
    const list: Array<{
      id: string;
      serverId: string;
      serverName: string;
      bmcIp: string;
      portId: string;
      portName: string;
      speed: string;
      mac: string;
      status: "UP" | "DOWN";
      rxKbps: number | null;
      txKbps: number | null;
      diagnostics: string;
    }> = [];

    if (!servers || servers.length === 0) return list;

    servers.forEach((s: any, idx: number) => {
      const sName = s.name || s.id || `Server-${idx + 1}`;
      const sIp = s.bmcIp || s.ip || s.osIp || "N/A";
      const sStatus = serverStatuses[s.id]?.status || serverStatuses[s.bmcIp]?.status || "OK";
      const isServerOffline = sStatus === "Offline" || sStatus === "Error";

      // Inspect Redfish telemetry cached for this server node
      let fetchedNics: any[] = [];
      let managerMac = "";
      try {
        const cacheKey = (s.id || s.bmcIp || "").toLowerCase();
        const raw = localStorage.getItem(`tyrone_telemetry_json_${cacheKey}`) || 
                    localStorage.getItem(`tyrone_telemetry_json_${(s.bmcIp || "").toLowerCase()}`);
        if (raw) {
          const telemetry = JSON.parse(raw);
          if (Array.isArray(telemetry.nics) && telemetry.nics.length > 0) {
            fetchedNics = telemetry.nics;
          }
          if (telemetry.manager?.Network?.MACAddress) {
            managerMac = telemetry.manager.Network.MACAddress;
          } else if (telemetry.system?.EthernetInterfaces?.MACAddress) {
            managerMac = telemetry.system.EthernetInterfaces.MACAddress;
          }
        }
      } catch (_) {}

      if (fetchedNics.length === 0) {
        try {
          const cachedInv = localStorage.getItem(`tyrone_inv_cache_${s.id}`) || 
                            localStorage.getItem(`tyrone_inv_cache_${s.bmcIp}`);
          if (cachedInv) {
            const parsedInv = JSON.parse(cachedInv);
            if (Array.isArray(parsedInv?.network) && parsedInv.network.length > 0) {
              fetchedNics = parsedInv.network;
            }
          }
        } catch (_) {}
      }

      if (fetchedNics.length === 0) {
        if (Array.isArray(s.networkInterfaces) && s.networkInterfaces.length > 0) {
          fetchedNics = s.networkInterfaces;
        } else if (Array.isArray(s.nics) && s.nics.length > 0) {
          fetchedNics = s.nics;
        } else if (Array.isArray(s.EthernetInterfaces) && s.EthernetInterfaces.length > 0) {
          fetchedNics = s.EthernetInterfaces;
        }
      }

      if (fetchedNics.length > 0) {
        fetchedNics.forEach((nic: any, nIdx: number) => {
          const pId = `${s.id}-nic-${nIdx}`;
          const nicHealth = nic.Status?.Health || nic.Health || "OK";
          const nicState = nic.Status?.State || nic.LinkStatus || nic.State || "Enabled";
          const isDown = isServerOffline || nicHealth === "Critical" || nicState === "Disabled" || nic.status === "LinkDown" || nic.LinkStatus === "LinkDown" || nic.LinkStatus === "NoLink" || nic.InterfaceEnabled === false;
          
          let speedVal = "N/A";
          if (nic.SpeedMbps && typeof nic.SpeedMbps === "number" && nic.SpeedMbps > 0) {
            speedVal = nic.SpeedMbps >= 1000 ? `${nic.SpeedMbps / 1000} Gbps` : `${nic.SpeedMbps} Mbps`;
          } else if (nic.speed) {
            speedVal = typeof nic.speed === "number" ? `${nic.speed} Gbps` : String(nic.speed);
          } else if (nic.MaxSpeedMbps) {
            speedVal = nic.MaxSpeedMbps >= 1000 ? `${nic.MaxSpeedMbps / 1000} Gbps` : `${nic.MaxSpeedMbps} Mbps`;
          }

          const macAddr = nic.MACAddress || nic.PermanentMACAddress || nic.macAddress || nic.mac || s.macAddress || s.mac || managerMac || "N/A";
          
          const rxVal = (nic.rxKbps !== undefined && nic.rxKbps !== null) ? Number(nic.rxKbps) : (nic.RxKbps !== undefined && nic.RxKbps !== null ? Number(nic.RxKbps) : null);
          const txVal = (nic.txKbps !== undefined && nic.txKbps !== null) ? Number(nic.txKbps) : (nic.TxKbps !== undefined && nic.TxKbps !== null ? Number(nic.TxKbps) : null);

          list.push({
            id: pId,
            serverId: s.id,
            serverName: sName,
            bmcIp: sIp,
            portId: nic.Id || nic.id || `nic${nIdx}`,
            portName: nic.Name || nic.name || nic.Description || `Ethernet Interface ${nIdx + 1}`,
            speed: speedVal,
            mac: macAddr,
            status: isDown ? "DOWN" : "UP",
            rxKbps: isDown ? 0 : rxVal,
            txKbps: isDown ? 0 : txVal,
            diagnostics: isDown 
              ? `Link DOWN (${nicHealth === "Critical" ? "Fault" : nicState === "Disabled" ? "Disabled" : "Disconnected"})` 
              : `Link UP${speedVal !== "N/A" ? ` (${speedVal})` : " (Operational)"}`
          });
        });
      }
    });

    return list;
  }, [servers, serverStatuses]);

  const downPortsList = useMemo(() => {
    return allNetworkPorts.filter(p => p.status === "DOWN");
  }, [allNetworkPorts]);

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
    let order: string[] = ALL_GADGETS;
    try {
      const saved = localStorage.getItem("tyrone_gadget_order");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const missing = ALL_GADGETS.filter(g => !parsed.includes(g));
          order = [...parsed, ...missing];
        }
      }
    } catch (_) {}
    return order;
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
    if (activeCategoryFilter === "Online") {
      return servers.filter(s => {
        const stObj = serverStatuses[s.id] || serverStatuses[s.bmcIp];
        const st = String(stObj?.status || (s as any).status || "OK").toLowerCase();
        const p = String(stObj?.powerState || (s as any).powerState || (s as any).power || "On").toLowerCase();
        return st !== "offline" && st !== "connection lost" && st !== "unreachable" && st !== "error" && st !== "failed" && st !== "fail to monitor" && p !== "off";
      });
    }
    if (activeCategoryFilter === "Not in Hierarchy") {
      return servers.filter(s => !serverRacks[s.id] || serverRacks[s.id] === "" || serverRacks[s.id] === "Unassigned");
    }
    if (activeCategoryFilter === "Connection Lost" || activeCategoryFilter === "Offline") {
      return servers.filter(s => {
        const stObj = serverStatuses[s.id] || serverStatuses[s.bmcIp];
        const st = String(stObj?.status || (s as any).status || "").toLowerCase();
        return st === "offline" || st === "connection lost" || st === "unreachable";
      });
    }
    if (activeCategoryFilter === "Unhealthy (All)") {
      return servers.filter(s => {
        const stObj = serverStatuses[s.id] || serverStatuses[s.bmcIp];
        const st = String(stObj?.status || (s as any).status || "").toLowerCase();
        return st === "critical" || st === "warning";
      });
    }
    if (activeCategoryFilter === "Power Off") {
      return servers.filter(s => {
        const stObj = serverStatuses[s.id] || serverStatuses[s.bmcIp];
        const p = String(stObj?.powerState || (s as any).powerState || (s as any).power || "").toLowerCase();
        return p === "off";
      });
    }
    if (activeCategoryFilter === "Fail to Monitor") {
      return servers.filter(s => {
        const stObj = serverStatuses[s.id] || serverStatuses[s.bmcIp];
        const st = String(stObj?.status || (s as any).status || "").toLowerCase();
        return st === "error" || st === "failed" || st === "fail to monitor" || (s as any).monitorStatus === "Failed";
      });
    }
    if (activeCategoryFilter === "Unmanaged") {
      return servers.filter(s => (s as any).unmanaged === true || !s.bmcUsername);
    }
    return [];
  }, [activeCategoryFilter, servers, serverRacks, serverStatuses]);

  // Detailed Datacenter GPU Inventory list computation for click-to-check modal
  const gpuDetailsList = useMemo(() => {
    const list: Array<{
      id: string;
      productName: string;
      serverName: string;
      bmcIp: string;
      rack: string;
      health: string;
      count: number;
    }> = [];

    servers.forEach((s: any, idx: number) => {
      const statusObj = serverStatuses?.[s.id] || serverStatuses?.[s.bmcIp];
      let count = parseInt(s.gpuCount || statusObj?.gpuCount || (s.gpus ? s.gpus.length : 0) || (s.accelerators ? s.accelerators.length : 0) || "0") || 0;
      let model = s.gpuModel || statusObj?.gpuModel || "NVIDIA / PCIe GPU Accelerator";

      if (count === 0) {
        try {
          const cacheKey = (s.id || s.bmcIp || "").toLowerCase();
          const raw = localStorage.getItem(`tyrone_telemetry_json_${cacheKey}`);
          if (raw) {
            const telemetry = JSON.parse(raw);
            const pcie = telemetry.pcieDevices || telemetry.hbas || [];
            if (Array.isArray(pcie)) {
              const matched = pcie.filter((item: any) => {
                const str = JSON.stringify(item).toUpperCase();
                return str.includes("GPU") || str.includes("NVIDIA") || str.includes("AMD") || str.includes("TESLA") || str.includes("QUADRO") || str.includes("RADEON");
              });
              if (matched.length > 0) {
                count = matched.length;
                model = matched[0]?.Name || matched[0]?.Device || "NVIDIA PCIe Accelerator";
              }
            }
          }
        } catch (_) {}
      }

      if (count > 0) {
        list.push({
          id: s.id || `gpu-${idx}`,
          productName: model,
          serverName: s.name || `Server (${s.bmcIp})`,
          bmcIp: s.bmcIp || "N/A",
          rack: serverRacks[s.id] || s.rack || "Unassigned",
          health: "OK",
          count
        });
      }
    });

    if (list.length === 0) {
      try {
        const rawGpuCache = localStorage.getItem("tyrone_gpu_cache");
        if (rawGpuCache) {
          const parsed = JSON.parse(rawGpuCache);
          if (Array.isArray(parsed) && parsed.length > 0) {
            parsed.forEach((g: any, i: number) => {
              list.push({
                id: g.uuid || `gpu-cache-${i}`,
                productName: g.productName || "NVIDIA Accelerator",
                serverName: g.server || "DataCenter Host Node",
                bmcIp: g.server || "N/A",
                rack: g.rack || "Unassigned",
                health: g.health || "OK",
                count: 1
              });
            });
          }
        }
      } catch (_) {}
    }

    return list;
  }, [servers, serverStatuses, serverRacks]);

  // Device Stats Counter (Real dynamic numbers computed from servers array & statuses)
  const totalDevices = servers.length;
  const onlineCount = useMemo(() => {
    return servers.filter(s => {
      const stObj = serverStatuses[s.id] || serverStatuses[s.bmcIp];
      const st = String(stObj?.status || (s as any).status || "OK").toLowerCase();
      const p = String(stObj?.powerState || (s as any).powerState || (s as any).power || "On").toLowerCase();
      return st !== "offline" && st !== "connection lost" && st !== "unreachable" && st !== "error" && st !== "failed" && st !== "fail to monitor" && p !== "off";
    }).length;
  }, [servers, serverStatuses]);

  const connectionLost = useMemo(() => {
    return servers.filter(s => {
      const stObj = serverStatuses[s.id] || serverStatuses[s.bmcIp];
      const st = String(stObj?.status || (s as any).status || "").toLowerCase();
      return st === "offline" || st === "connection lost" || st === "unreachable";
    }).length;
  }, [servers, serverStatuses]);

  const criticalServers = useMemo(() => {
    return servers.filter(s => {
      const stObj = serverStatuses[s.id] || serverStatuses[s.bmcIp];
      const st = String(stObj?.status || (s as any).status || "").toLowerCase();
      return st === "critical";
    }).length;
  }, [servers, serverStatuses]);

  const warningServers = useMemo(() => {
    return servers.filter(s => {
      const stObj = serverStatuses[s.id] || serverStatuses[s.bmcIp];
      const st = String(stObj?.status || (s as any).status || "").toLowerCase();
      return st === "warning";
    }).length;
  }, [servers, serverStatuses]);

  const unhealthyCount = criticalServers + warningServers;

  const powerOff = useMemo(() => {
    return servers.filter(s => {
      const stObj = serverStatuses[s.id] || serverStatuses[s.bmcIp];
      const p = String(stObj?.powerState || (s as any).powerState || (s as any).power || "").toLowerCase();
      return p === "off";
    }).length;
  }, [servers, serverStatuses]);

  const failToMonitor = useMemo(() => {
    return servers.filter(s => {
      const stObj = serverStatuses[s.id] || serverStatuses[s.bmcIp];
      const st = String(stObj?.status || (s as any).status || "").toLowerCase();
      return st === "error" || st === "failed" || st === "fail to monitor" || (s as any).monitorStatus === "Failed";
    }).length;
  }, [servers, serverStatuses]);

  const unmanaged = useMemo(() => {
    return servers.filter(s => (s as any).unmanaged === true || !s.bmcUsername).length;
  }, [servers]);

  const notInHierarchy = useMemo(() => {
    return servers.filter(s => !serverRacks[s.id] || serverRacks[s.id] === "" || serverRacks[s.id] === "Unassigned").length;
  }, [servers, serverRacks]);

  const healthyCount = Math.max(0, totalDevices - unhealthyCount - connectionLost);
  const unreachableCount = connectionLost;




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

      {/* Top Dashboard Control Bar with Gadgets Button & Category Filter Pills */}
      <div className="bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-800 rounded-lg p-2.5 px-4 flex flex-wrap items-center justify-between gap-3 shadow-xs font-sans">
        <div className="flex items-center gap-2">
          <LayoutGrid className="w-5 h-5 text-[#7a0c0c] shrink-0" />
          <h2 className="text-sm font-bold text-slate-800 dark:text-zinc-100 tracking-tight">Dashboard Overview</h2>
          <span className="text-[11px] text-slate-400 font-medium hidden sm:inline">| {enabledGadgets.length} Gadgets Active</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Gadgets Configuration Button */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowGadgetsModal(true)}
              className="px-3.5 py-1.5 bg-[#7a0c0c] hover:bg-[#590808] text-white font-bold rounded text-xs cursor-pointer flex items-center gap-2 transition-all shadow-xs border border-red-900/40"
              title="Configure and toggle visible dashboard gadgets"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-white" />
              <span>Gadgets ({enabledGadgets.length})</span>
            </button>
          </div>
        </div>
      </div>

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
            case "Error Alert System":
              colSpanClass = "lg:col-span-12";
              cardContent = (
                <div className="p-4 flex flex-col space-y-4">
                  {/* Error Alert Header Summary Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-3 bg-red-50/70 dark:bg-rose-950/30 border border-red-200 dark:border-rose-900/50 rounded-lg p-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-red-100 dark:bg-rose-900/60 text-[#7a0c0c] dark:text-rose-400 flex items-center justify-center shrink-0 shadow-xs">
                        <ShieldAlert className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-xs font-extrabold text-slate-800 dark:text-zinc-100 tracking-tight">Active Error Alert Monitoring System</h4>
                        <p className="text-[11px] text-slate-500 dark:text-zinc-400">Real-time detection across hardware endpoints & BMC Redfish controllers</p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2.5 py-1 bg-red-100 dark:bg-rose-900/50 text-red-700 dark:text-rose-300 rounded font-mono font-bold text-[11px] border border-red-200">
                        {alerts.filter(a => a.severity === "Critical").length} Critical Errors
                      </span>
                      <span className="px-2.5 py-1 bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300 rounded font-mono font-bold text-[11px] border border-amber-200">
                        {alerts.filter(a => a.severity === "Warning").length} Warnings
                      </span>
                      <span className="px-2.5 py-1 bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 rounded font-mono font-bold text-[11px] border border-slate-200">
                        {alerts.length} Total Logs
                      </span>
                    </div>
                  </div>

                  {/* Active Alerts Table */}
                  {alerts.length === 0 ? (
                    <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/40 rounded-lg p-6 text-center space-y-2">
                      <CheckCircle2 className="w-8 h-8 text-emerald-600 dark:text-emerald-400 mx-auto" />
                      <h5 className="text-xs font-bold text-emerald-900 dark:text-emerald-200">All System Hardware Parameters Operating Nominally</h5>
                      <p className="text-[11px] text-emerald-700 dark:text-emerald-400">No active hardware failures, thermal spikes, or network drops detected.</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto border border-slate-200 dark:border-zinc-800 rounded-lg">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-100 dark:bg-zinc-800/80 text-slate-700 dark:text-zinc-300 font-bold uppercase tracking-wider text-[10px]">
                          <tr>
                            <th className="p-2.5 pl-3">Severity</th>
                            <th className="p-2.5">Category</th>
                            <th className="p-2.5">Endpoint Server</th>
                            <th className="p-2.5">Error Log Description</th>
                            <th className="p-2.5 pr-3 text-right">Timestamp</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-zinc-800 font-mono text-[11px]">
                          {alerts.slice(0, 5).map((al) => (
                            <tr key={al.id} className="hover:bg-slate-50 dark:hover:bg-zinc-800/50">
                              <td className="p-2.5 pl-3">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  al.severity === "Critical"
                                    ? "bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300"
                                    : al.severity === "Warning"
                                    ? "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                                    : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                                }`}>
                                  {al.severity}
                                </span>
                              </td>
                              <td className="p-2.5 font-sans font-medium text-slate-800 dark:text-zinc-200">{al.type}</td>
                              <td className="p-2.5 text-blue-600 dark:text-blue-400 font-bold">{al.server}</td>
                              <td className="p-2.5 font-sans text-slate-600 dark:text-zinc-300">{al.message}</td>
                              <td className="p-2.5 pr-3 text-right text-slate-400 dark:text-zinc-500 text-[10px]">{al.timestamp}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
              break;

            case "Temperature":
              colSpanClass = "lg:col-span-3";
              {
                const isHot = highestTemp >= 38;
                const isWarm = highestTemp >= 30;
                const tempColor = isHot ? "text-rose-600 dark:text-rose-400" : isWarm ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400";
                const thermometerFill = isHot ? "bg-rose-600" : isWarm ? "bg-amber-500" : "bg-emerald-500";

                cardContent = (
                  <div className="p-4 flex-1 flex flex-col justify-between space-y-2.5 font-sans min-h-[140px]">
                    <div className="flex items-center justify-between gap-3">
                      <div className="relative w-10 h-16 flex items-center justify-center shrink-0">
                        <div className="absolute top-1 w-3.5 h-10 bg-slate-100 dark:bg-zinc-800 border-2 border-slate-400 dark:border-zinc-600 rounded-full flex flex-col justify-end p-0.5 overflow-hidden">
                          <div className={`w-full rounded-full transition-all ${thermometerFill}`} style={{ height: `${Math.min(100, Math.max(25, (highestTemp / 50) * 100))}%` }} />
                        </div>
                        <div className="absolute bottom-1 w-6 h-6 bg-slate-100 dark:bg-zinc-800 border-2 border-slate-400 dark:border-zinc-600 rounded-full flex items-center justify-center">
                          <div className={`w-3.5 h-3.5 rounded-full ${thermometerFill}`} />
                        </div>
                      </div>

                      <div className="flex flex-col text-right">
                        <span className={`text-2xl font-black tracking-tight leading-none ${tempColor}`}>
                          {highestTemp.toFixed(1)} °C
                        </span>
                        <span className="text-[10px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider mt-1">
                          Highest Temp of All Devices
                        </span>
                        {maxTempNode && (
                          <button
                            type="button"
                            onClick={() => onSelectServer(maxTempNode.id)}
                            className="text-[10px] font-mono font-extrabold text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:underline cursor-pointer truncate max-w-[130px] mt-0.5 text-right transition-colors"
                            title={`Inspect server ${maxTempNode.name}`}
                          >
                            {maxTempNode.name}
                          </button>
                        )}
                      </div>
                    </div>

                    {serverTemperatures.length > 0 && (
                      <div className="space-y-1 border-t border-slate-100 dark:border-zinc-800/80 pt-1.5">
                        {serverTemperatures.slice(0, 2).map((st) => (
                          <div 
                            key={st.id} 
                            onClick={() => onSelectServer(st.id)}
                            className="flex items-center justify-between text-[10px] font-semibold text-slate-600 dark:text-zinc-300 hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer group transition-colors"
                            title={`Inspect server ${st.name}`}
                          >
                            <span className="truncate max-w-[110px] font-mono group-hover:underline">{st.name}</span>
                            <span className={`font-bold font-mono ${st.temp >= 38 ? "text-rose-600" : st.temp >= 30 ? "text-amber-600" : "text-emerald-600"}`}>
                              {st.temp.toFixed(1)} °C
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              }
              break;

            case "Network Port Monitoring":
              colSpanClass = "lg:col-span-12";
              {
                const filteredPorts = allNetworkPorts.filter(p => {
                  if (networkFilter === "DOWN") return p.status === "DOWN";
                  if (networkFilter === "UP") return p.status === "UP";
                  return true;
                });

                const totalCount = allNetworkPorts.length;
                const upCount = allNetworkPorts.filter(p => p.status === "UP").length;
                const downCount = downPortsList.length;

                cardContent = (
                  <div className="p-4.5 flex-1 flex flex-col space-y-4 font-sans">
                    {/* Proactive Monitoring Critical Alert Banner when any port is DOWN */}
                    {downCount > 0 && (
                      <div className="bg-red-500/10 border border-red-500/50 dark:bg-rose-950/40 rounded-lg p-3 flex items-center gap-3 shadow-xs">
                        <div className="w-8 h-8 rounded-full bg-red-600 text-white flex items-center justify-center shrink-0 shadow-md">
                          <WifiOff className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="text-xs font-black text-red-700 dark:text-red-300 uppercase tracking-wide">
                              NETWORK ALERT: {downCount} PORT(S) DOWN / OFFLINE
                            </h4>
                          </div>
                          <p className="text-[11px] text-slate-700 dark:text-zinc-300 font-medium mt-0.5">
                            Physical link disconnect or interface offline detected on <span className="font-bold text-red-600 dark:text-red-400">{downPortsList.map(p => `${p.serverName} [${p.portId}]`).join(", ")}</span>.
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Status Stats Bar & Filter Tabs */}
                    <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 dark:bg-zinc-800/60 p-3 rounded-lg border border-slate-200 dark:border-zinc-700">
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                          <Network className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                          <span className="text-xs font-extrabold text-slate-800 dark:text-zinc-200">Port Health Matrix</span>
                        </div>
                        <div className="h-4 w-px bg-slate-300 dark:bg-zinc-700" />
                        <div className="flex items-center gap-2 text-xs font-bold">
                          <span className="text-slate-500">Total:</span>
                          <span className="px-2 py-0.5 bg-slate-200 dark:bg-zinc-700 text-slate-800 dark:text-zinc-200 rounded-full font-mono">{totalCount}</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs font-bold">
                          <span className="text-emerald-600 dark:text-emerald-400">UP:</span>
                          <span className="px-2 py-0.5 bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 rounded-full font-mono">{upCount}</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs font-bold">
                          <span className="text-red-600 dark:text-red-400">DOWN:</span>
                          <span className={`px-2 py-0.5 rounded-full font-mono ${downCount > 0 ? "bg-red-600 text-white animate-pulse" : "bg-slate-200 dark:bg-zinc-700 text-slate-700"}`}>{downCount}</span>
                        </div>
                      </div>

                      {/* Filter Tabs */}
                      <div className="flex items-center bg-slate-200 dark:bg-zinc-700 p-0.5 rounded text-[11px] font-bold">
                        {(["ALL", "DOWN", "UP"] as const).map(f => (
                          <button
                            key={f}
                            onClick={() => setNetworkFilter(f)}
                            className={`px-3 py-1 rounded cursor-pointer transition-colors ${
                              networkFilter === f
                                ? "bg-white dark:bg-zinc-900 text-blue-600 dark:text-blue-400 shadow-2xs font-extrabold"
                                : "text-slate-600 dark:text-zinc-300 hover:text-slate-900"
                            }`}
                          >
                            {f === "ALL" ? "All Ports" : f === "DOWN" ? `DOWN (${downCount})` : `UP (${upCount})`}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Network Port Table Matrix */}
                    <div className="overflow-x-auto border border-slate-200 dark:border-zinc-800 rounded-lg">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-100 dark:bg-zinc-800/80 text-slate-700 dark:text-zinc-300 font-bold uppercase tracking-wider text-[10px]">
                          <tr>
                            <th className="p-2.5 pl-3">Server Node</th>
                            <th className="p-2.5">Port ID</th>
                            <th className="p-2.5">Interface Name</th>
                            <th className="p-2.5">Link Status</th>
                            <th className="p-2.5">Speed / Medium</th>
                            <th className="p-2.5">MAC Address</th>
                            <th className="p-2.5">Rx / Tx Rate</th>
                            <th className="p-2.5 pr-3 text-right">Proactive Diagnostics</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-zinc-800 font-mono text-[11px]">
                          {filteredPorts.length === 0 ? (
                            <tr>
                              <td colSpan={8} className="p-6 text-center text-slate-400 dark:text-zinc-500 font-sans text-xs">
                                No network interfaces discovered for connected server nodes.
                              </td>
                            </tr>
                          ) : (
                            filteredPorts.map((p) => {
                              const isDown = p.status === "DOWN";
                              return (
                                <tr key={p.id} className={`transition-colors ${isDown ? "bg-red-50/60 dark:bg-rose-950/30 hover:bg-red-100/70" : "hover:bg-slate-50 dark:hover:bg-zinc-800/50"}`}>
                                  <td className="p-2.5 pl-3 font-sans font-bold text-slate-800 dark:text-zinc-100">{p.serverName}</td>
                                  <td className="p-2.5 text-blue-600 dark:text-blue-400 font-bold">{p.portId}</td>
                                  <td className="p-2.5 font-sans font-medium text-slate-600 dark:text-zinc-300">{p.portName}</td>
                                  <td className="p-2.5">
                                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                                      isDown
                                        ? "bg-red-600 text-white shadow-2xs animate-pulse"
                                        : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800"
                                    }`}>
                                      <span className={`w-1.5 h-1.5 rounded-full ${isDown ? "bg-white" : "bg-emerald-500"}`} />
                                      {isDown ? "PORT DOWN" : "LINK UP"}
                                    </span>
                                  </td>
                                  <td className="p-2.5 font-sans text-slate-600 dark:text-zinc-300">{p.speed}</td>
                                  <td className="p-2.5 text-slate-500 dark:text-zinc-400 text-[10px]">{p.mac}</td>
                                  <td className="p-2.5 font-sans text-slate-600 dark:text-zinc-300">
                                    {isDown ? (
                                      <span className="text-red-500 font-bold">0 Kbps</span>
                                    ) : p.rxKbps !== null && p.txKbps !== null ? (
                                      `${p.rxKbps} ↓ / ${p.txKbps} ↑ Kbps`
                                    ) : (
                                      <span className="text-slate-400 dark:text-zinc-500 text-[10px]">N/A</span>
                                    )}
                                  </td>
                                  <td className="p-2.5 pr-3 text-right">
                                    <span className={`inline-block px-2.5 py-0.5 rounded text-[10px] font-bold font-mono ${
                                      isDown
                                        ? "bg-red-100 text-red-800 dark:bg-red-950/80 dark:text-red-300 border border-red-200 dark:border-red-800"
                                        : "bg-slate-100 text-slate-700 dark:bg-zinc-800 dark:text-zinc-300 border border-slate-200 dark:border-zinc-700"
                                    }`}>
                                      {p.diagnostics}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              }
              break;

            case "Temperature Trending in a Day":
            case "Temperature Trending in a Week":
            case "Temperature Trending in a Month":
              colSpanClass = isGadgetEnabled("Temperature") && isGadgetEnabled("Summary of Hierarchy") ? "lg:col-span-6" : "lg:col-span-9";
              cardContent = (
                <div className="p-3.5 flex-1 min-h-[160px] flex flex-col justify-between space-y-2.5 font-sans">
                  {/* Minimalist Metrics Header */}
                  <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs">
                    <div className="flex items-center gap-3.5">
                      <div className="flex flex-col">
                        <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Peak Temp</span>
                        <span className="text-xs font-black text-rose-600 dark:text-rose-400">{tempStats.peak.toFixed(1)} °C</span>
                      </div>
                      <div className="h-5 w-px bg-slate-200 dark:bg-zinc-700/60" />
                      <div className="flex flex-col">
                        <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Avg Temp</span>
                        <span className="text-xs font-black text-blue-600 dark:text-blue-400">{tempStats.avg} °C</span>
                      </div>
                      <div className="h-5 w-px bg-slate-200 dark:bg-zinc-700/60" />
                      <div className="flex flex-col">
                        <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Min Temp</span>
                        <span className="text-xs font-black text-emerald-600 dark:text-emerald-400">{tempStats.min.toFixed(1)} °C</span>
                      </div>
                      <div className="h-5 w-px bg-slate-200 dark:bg-zinc-700/60" />
                      <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${
                        tempStats.status === "CRITICAL" ? "bg-red-600 text-white" : tempStats.status === "WARNING" ? "bg-amber-500 text-white" : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                      }`}>
                        {tempStats.status}
                      </span>
                    </div>
                  </div>

                  {/* Minimalist Area Chart */}
                  <div className="w-full h-[125px] flex-1">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={tempTrendData} margin={{ top: 5, right: 10, left: -25, bottom: 0 }}>
                        <defs>
                          <linearGradient id="tempGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="time" tick={{ fontSize: 9 }} stroke="#94a3b8" axisLine={false} tickLine={false} />
                        <YAxis domain={tempYDomain} tick={{ fontSize: 9 }} stroke="#94a3b8" axisLine={false} tickLine={false} />
                        <Tooltip content={({ active, payload, label }) => {
                          if (active && payload && payload.length) {
                            const val = payload[0].value;
                            return (
                              <div className="bg-slate-900/95 backdrop-blur-xs text-white p-2 rounded shadow-xl border border-slate-700 text-xs space-y-1">
                                <div className="font-bold text-slate-300 text-[10px] uppercase border-b border-slate-800 pb-1 flex justify-between gap-4">
                                  <span>Time: {label}</span>
                                </div>
                                <div className="flex items-center gap-1.5 pt-0.5">
                                  <Thermometer className="w-3.5 h-3.5 text-blue-400" />
                                  <span className="text-xs font-extrabold">{Number(val).toFixed(1)} °C</span>
                                </div>
                                <div className="text-[9px] text-slate-400">
                                  Thermal Limit: <span className="text-amber-400 font-bold">28.0 °C</span>
                                </div>
                              </div>
                            );
                          }
                          return null;
                        }} />
                        {tempYDomain[0] <= 28 && tempYDomain[1] >= 28 && (
                          <ReferenceLine y={28} stroke="#f59e0b" strokeDasharray="3 3" label={{ value: "Warning 28°C", fill: "#f59e0b", fontSize: 9, position: "insideTopLeft" }} />
                        )}
                        <Area type="monotone" dataKey="temp" stroke="#2563eb" strokeWidth={2} fillOpacity={1} fill="url(#tempGradient)" activeDot={{ r: 4 }} />
                      </AreaChart>
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
            case "Power Trending in a Week":
            case "Power Trending in a Month":
              colSpanClass = isGadgetEnabled("Power") ? "lg:col-span-6" : "lg:col-span-12";
              cardContent = (
                <div className="p-3.5 flex-1 min-h-[160px] flex flex-col justify-between space-y-2.5 font-sans">
                  {/* Minimalist Metrics Header */}
                  <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs">
                    <div className="flex items-center gap-3.5">
                      <div className="flex flex-col">
                        <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Peak Load</span>
                        <span className="text-xs font-black text-amber-600 dark:text-amber-400">{powerStats.peak} W</span>
                      </div>
                      <div className="h-5 w-px bg-slate-200 dark:bg-zinc-700/60" />
                      <div className="flex flex-col">
                        <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Avg Load</span>
                        <span className="text-xs font-black text-blue-600 dark:text-blue-400">{powerStats.avg} W</span>
                      </div>
                      <div className="h-5 w-px bg-slate-200 dark:bg-zinc-700/60" />
                      <div className="flex flex-col">
                        <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Min Load</span>
                        <span className="text-xs font-black text-emerald-600 dark:text-emerald-400">{powerStats.min} W</span>
                      </div>
                      <div className="h-5 w-px bg-slate-200 dark:bg-zinc-700/60" />
                      <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                        {powerStats.status}
                      </span>
                    </div>
                  </div>

                  {/* Minimalist Area Chart */}
                  <div className="w-full h-[125px] flex-1">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={powerTrendData} margin={{ top: 5, right: 10, left: -25, bottom: 0 }}>
                        <defs>
                          <linearGradient id="powerGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0.0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="time" tick={{ fontSize: 9 }} stroke="#94a3b8" axisLine={false} tickLine={false} />
                        <YAxis domain={powerYDomain} tick={{ fontSize: 9 }} stroke="#94a3b8" axisLine={false} tickLine={false} />
                        <Tooltip content={({ active, payload, label }) => {
                          if (active && payload && payload.length) {
                            const val = payload[0].value;
                            return (
                              <div className="bg-slate-900/95 backdrop-blur-xs text-white p-2 rounded shadow-xl border border-slate-700 text-xs space-y-1">
                                <div className="font-bold text-slate-300 text-[10px] uppercase border-b border-slate-800 pb-1 flex justify-between gap-4">
                                  <span>Time: {label}</span>
                                </div>
                                <div className="flex items-center gap-1.5 pt-0.5">
                                  <Zap className="w-3.5 h-3.5 text-emerald-400" />
                                  <span className="text-xs font-extrabold">{val} W</span>
                                </div>
                                <div className="text-[9px] text-slate-400">
                                  Capacity Limit: <span className="text-emerald-400 font-bold">1200 W</span>
                                </div>
                              </div>
                            );
                          }
                          return null;
                        }} />
                        {powerYDomain[0] <= 1000 && powerYDomain[1] >= 1000 && (
                          <ReferenceLine y={1000} stroke="#10b981" strokeDasharray="3 3" label={{ value: "Target 1000W", fill: "#10b981", fontSize: 9, position: "insideTopLeft" }} />
                        )}
                        <Area type="monotone" dataKey="power" stroke="#059669" strokeWidth={2} fillOpacity={1} fill="url(#powerGradient)" activeDot={{ r: 4 }} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              );
              break;

            case "Device Statistics":
              colSpanClass = "lg:col-span-12";
              cardContent = (
                <div className="px-3 py-2 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                  {/* 1. ONLINE */}
                  <div 
                    onClick={() => setActiveCategoryFilter("Online")} 
                    className={`flex items-center gap-2 p-1.5 rounded-md cursor-pointer transition-all group border ${
                      onlineCount > 0
                        ? "bg-emerald-50/90 dark:bg-emerald-950/40 border-emerald-400 dark:border-emerald-600/80 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 hover:border-emerald-500 shadow-2xs"
                        : "bg-slate-50/70 dark:bg-zinc-800/40 border-slate-200/80 dark:border-zinc-700/60 hover:border-emerald-400 hover:bg-emerald-50/40"
                    }`} 
                    title="Click to view Online servers"
                  >
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform shadow-2xs ${
                      onlineCount > 0 ? "bg-emerald-100 dark:bg-emerald-900/80 text-emerald-600 dark:text-emerald-300" : "bg-white dark:bg-zinc-700 text-emerald-600 dark:text-emerald-400"
                    }`}>
                      <Wifi className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex flex-col leading-tight min-w-0">
                      <span className={`text-xs font-black ${onlineCount > 0 ? "text-emerald-800 dark:text-emerald-300" : "text-slate-800 dark:text-zinc-200"}`}>{onlineCount}</span>
                      <span className="text-[8px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-tight truncate">ONLINE</span>
                    </div>
                  </div>

                  {/* 2. NOT IN HIERARCHY */}
                  <div 
                    onClick={() => setActiveCategoryFilter("Not in Hierarchy")} 
                    className={`flex items-center gap-2 p-1.5 rounded-md cursor-pointer transition-all group border ${
                      notInHierarchy > 0
                        ? "bg-blue-50/90 dark:bg-blue-950/40 border-blue-400 dark:border-blue-600/80 hover:bg-blue-100 dark:hover:bg-blue-900/60 hover:border-blue-500 shadow-2xs"
                        : "bg-slate-50/70 dark:bg-zinc-800/40 border-slate-200/80 dark:border-zinc-700/60 hover:border-blue-400 hover:bg-blue-50/40"
                    }`} 
                    title="Click to view servers Not in Hierarchy"
                  >
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform shadow-2xs ${
                      notInHierarchy > 0 ? "bg-blue-100 dark:bg-blue-900/80 text-blue-600 dark:text-blue-300" : "bg-white dark:bg-zinc-700 text-blue-600 dark:text-blue-400"
                    }`}>
                      <Layers className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex flex-col leading-tight min-w-0">
                      <span className={`text-xs font-black ${notInHierarchy > 0 ? "text-blue-800 dark:text-blue-300" : "text-slate-800 dark:text-zinc-200"}`}>{notInHierarchy}</span>
                      <span className="text-[8px] font-bold text-blue-700 dark:text-blue-400 uppercase tracking-tight truncate">Not in Hierarchy</span>
                    </div>
                  </div>

                  {/* 3. CONNECTION LOST */}
                  <div 
                    onClick={() => setActiveCategoryFilter("Connection Lost")} 
                    className={`flex items-center gap-2 p-1.5 rounded-md cursor-pointer transition-all group border ${
                      connectionLost > 0
                        ? "bg-rose-50/90 dark:bg-rose-950/40 border-rose-400 dark:border-rose-600/80 hover:bg-rose-100 dark:hover:bg-rose-900/60 hover:border-rose-500 shadow-2xs"
                        : "bg-slate-50/70 dark:bg-zinc-800/40 border-slate-200/80 dark:border-zinc-700/60 hover:border-rose-400 hover:bg-rose-50/40"
                    }`} 
                    title="Click to view servers with Connection Lost"
                  >
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform shadow-2xs ${
                      connectionLost > 0 ? "bg-rose-100 dark:bg-rose-900/80 text-rose-600 dark:text-rose-300" : "bg-white dark:bg-zinc-700 text-rose-600 dark:text-rose-400"
                    }`}>
                      <Activity className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex flex-col leading-tight min-w-0">
                      <span className={`text-xs font-black ${connectionLost > 0 ? "text-rose-800 dark:text-rose-300" : "text-slate-800 dark:text-zinc-200"}`}>{connectionLost}</span>
                      <span className="text-[8px] font-bold text-rose-700 dark:text-rose-400 uppercase tracking-tight truncate">Connection Lost</span>
                    </div>
                  </div>

                  {/* 4. UNHEALTHY (ALL) */}
                  <div 
                    onClick={() => setActiveCategoryFilter("Unhealthy (All)")} 
                    className={`flex items-center gap-2 p-1.5 rounded-md cursor-pointer transition-all group border ${
                      unhealthyCount > 0
                        ? "bg-amber-50/90 dark:bg-amber-950/40 border-amber-400 dark:border-amber-600/80 hover:bg-amber-100 dark:hover:bg-amber-900/60 hover:border-amber-500 shadow-2xs"
                        : "bg-slate-50/70 dark:bg-zinc-800/40 border-slate-200/80 dark:border-zinc-700/60 hover:border-amber-400 hover:bg-amber-50/40"
                    }`} 
                    title="Click to view Unhealthy servers"
                  >
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform shadow-2xs ${
                      unhealthyCount > 0 ? "bg-amber-100 dark:bg-amber-900/80 text-amber-600 dark:text-amber-300" : "bg-white dark:bg-zinc-700 text-amber-600 dark:text-amber-400"
                    }`}>
                      <ShieldAlert className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex flex-col leading-tight min-w-0">
                      <span className={`text-xs font-black ${unhealthyCount > 0 ? "text-amber-800 dark:text-amber-300" : "text-slate-800 dark:text-zinc-200"}`}>{unhealthyCount}</span>
                      <span className="text-[8px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-tight truncate">Unhealthy (All)</span>
                    </div>
                  </div>

                  {/* 5. POWER OFF */}
                  <div 
                    onClick={() => setActiveCategoryFilter("Power Off")} 
                    className={`flex items-center gap-2 p-1.5 rounded-md cursor-pointer transition-all group border ${
                      powerOff > 0
                        ? "bg-slate-100 dark:bg-zinc-800 border-slate-400 dark:border-zinc-600 hover:bg-slate-200 dark:hover:bg-zinc-700 shadow-2xs"
                        : "bg-slate-50/70 dark:bg-zinc-800/40 border-slate-200/80 dark:border-zinc-700/60 hover:border-slate-400 hover:bg-slate-100/40"
                    }`} 
                    title="Click to view Power Off servers"
                  >
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform shadow-2xs ${
                      powerOff > 0 ? "bg-slate-200 dark:bg-zinc-700 text-slate-700 dark:text-zinc-200" : "bg-white dark:bg-zinc-700 text-slate-500 dark:text-zinc-300"
                    }`}>
                      <Zap className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex flex-col leading-tight min-w-0">
                      <span className={`text-xs font-black ${powerOff > 0 ? "text-slate-900 dark:text-zinc-100" : "text-slate-800 dark:text-zinc-200"}`}>{powerOff}</span>
                      <span className="text-[8px] font-bold text-slate-600 dark:text-zinc-400 uppercase tracking-tight truncate">Power Off</span>
                    </div>
                  </div>

                  {/* 6. FAIL TO MONITOR */}
                  <div 
                    onClick={() => setActiveCategoryFilter("Fail to Monitor")} 
                    className={`flex items-center gap-2 p-1.5 rounded-md cursor-pointer transition-all group border ${
                      failToMonitor > 0
                        ? "bg-red-50/90 dark:bg-red-950/40 border-red-400 dark:border-red-600/80 hover:bg-red-100 dark:hover:bg-red-900/60 hover:border-red-500 shadow-2xs"
                        : "bg-slate-50/70 dark:bg-zinc-800/40 border-slate-200/80 dark:border-zinc-700/60 hover:border-red-400 hover:bg-red-50/40"
                    }`} 
                    title="Click to view Fail to Monitor servers"
                  >
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform shadow-2xs ${
                      failToMonitor > 0 ? "bg-red-100 dark:bg-red-900/80 text-red-600 dark:text-red-300" : "bg-white dark:bg-zinc-700 text-red-600 dark:text-red-400"
                    }`}>
                      <AlertTriangle className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex flex-col leading-tight min-w-0">
                      <span className={`text-xs font-black ${failToMonitor > 0 ? "text-red-800 dark:text-red-300" : "text-slate-800 dark:text-zinc-200"}`}>{failToMonitor}</span>
                      <span className="text-[8px] font-bold text-red-700 dark:text-red-400 uppercase tracking-tight truncate">Fail to Monitor</span>
                    </div>
                  </div>

                  {/* 7. UNMANAGED */}
                  <div 
                    onClick={() => setActiveCategoryFilter("Unmanaged")} 
                    className={`flex items-center gap-2 p-1.5 rounded-md cursor-pointer transition-all group border ${
                      unmanaged > 0
                        ? "bg-purple-50/90 dark:bg-purple-950/40 border-purple-400 dark:border-purple-600/80 hover:bg-purple-100 dark:hover:bg-purple-900/60 hover:border-purple-500 shadow-2xs"
                        : "bg-slate-50/70 dark:bg-zinc-800/40 border-slate-200/80 dark:border-zinc-700/60 hover:border-purple-400 hover:bg-purple-50/40"
                    }`} 
                    title="Click to view Unmanaged servers"
                  >
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform shadow-2xs ${
                      unmanaged > 0 ? "bg-purple-100 dark:bg-purple-900/80 text-purple-600 dark:text-purple-300" : "bg-white dark:bg-zinc-700 text-purple-600 dark:text-purple-400"
                    }`}>
                      <Database className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex flex-col leading-tight min-w-0">
                      <span className={`text-xs font-black ${unmanaged > 0 ? "text-purple-800 dark:text-purple-300" : "text-slate-800 dark:text-zinc-200"}`}>{unmanaged}</span>
                      <span className="text-[8px] font-bold text-purple-700 dark:text-purple-400 uppercase tracking-tight truncate">Unmanaged</span>
                    </div>
                  </div>
                </div>
              );
              break;

            case "Events":
              colSpanClass = "lg:col-span-6";
              cardContent = (
                <div className="p-4 flex-1 flex flex-col space-y-3 font-sans">
                  <div className="overflow-x-auto border border-slate-200 dark:border-zinc-800 rounded-lg">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-100 dark:bg-zinc-800/80 text-[10px] uppercase font-bold text-slate-600 dark:text-zinc-400">
                        <tr>
                          <th className="p-2">Time</th>
                          <th className="p-2">Severity</th>
                          <th className="p-2">Message</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-zinc-800 text-slate-700 dark:text-zinc-300">
                        {alerts.slice(0, 5).map((e, idx) => (
                          <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-zinc-800/40">
                            <td className="p-2 text-[10px] font-mono text-slate-500">{e.timestamp || "Just now"}</td>
                            <td className="p-2">
                              <span className={`px-1.5 py-0.5 text-[9px] font-bold rounded ${e.severity === "Critical" ? "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300" : "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"}`}>
                                {e.severity}
                              </span>
                            </td>
                            <td className="p-2 text-xs truncate max-w-[200px]">{e.message || e.event || "System state check nominal"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
              break;

            case "Power Capacity":
              colSpanClass = "lg:col-span-4";
              cardContent = (
                <div className="p-4 flex-1 flex flex-col justify-between space-y-3 font-sans">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-600 dark:text-zinc-400">Max Rack Power Allocation</span>
                    <span className="text-sm font-black text-amber-600 dark:text-amber-400">{dashFormattedPowerStr}</span>
                  </div>
                  <div className="w-full bg-slate-100 dark:bg-zinc-800 rounded-full h-3 overflow-hidden border border-slate-200 dark:border-zinc-700">
                    <div className="bg-gradient-to-r from-emerald-500 via-amber-500 to-rose-600 h-full rounded-full" style={{ width: `${Math.min(100, Math.round((dashUsedPowerW / dashPowerW) * 100))}%` }} />
                  </div>
                  <div className="flex justify-between text-[11px] font-semibold text-slate-500 dark:text-zinc-400">
                    <span>Used: {(dashUsedPowerW / 1000).toFixed(2)} kW</span>
                    <span>Headroom: {Math.max(0, (dashPowerW - dashUsedPowerW) / 1000).toFixed(2)} kW</span>
                  </div>
                </div>
              );
              break;

            case "Space Capacity":
              colSpanClass = "lg:col-span-4";
              cardContent = (
                <div className="p-4 flex-1 flex flex-col justify-between space-y-3 font-sans">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-600 dark:text-zinc-400">Rack Space (U) Utilization</span>
                    <span className="text-sm font-black text-indigo-600 dark:text-indigo-400">{dashUsedSpaceU} U Used</span>
                  </div>
                  <div className="w-full bg-slate-100 dark:bg-zinc-800 rounded-full h-3 overflow-hidden border border-slate-200 dark:border-zinc-700">
                    <div className="bg-indigo-600 h-full rounded-full" style={{ width: `${Math.min(100, Math.round((dashUsedSpaceU / dashSpaceU) * 100))}%` }} />
                  </div>
                  <div className="flex justify-between text-[11px] font-semibold text-slate-500 dark:text-zinc-400">
                    <span>Rack Limit: {dashSpaceU} U</span>
                    <span>Free: {Math.max(0, dashSpaceU - dashUsedSpaceU)} U</span>
                  </div>
                </div>
              );
              break;

            case "Weight Capacity":
              colSpanClass = "lg:col-span-4";
              cardContent = (
                <div className="p-4 flex-1 flex flex-col justify-between space-y-3 font-sans">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-600 dark:text-zinc-400">Rack Structural Weight</span>
                    <span className="text-sm font-black text-cyan-600 dark:text-cyan-400">{dashUsedWeightKg} kg</span>
                  </div>
                  <div className="w-full bg-slate-100 dark:bg-zinc-800 rounded-full h-3 overflow-hidden border border-slate-200 dark:border-zinc-700">
                    <div className="bg-cyan-600 h-full rounded-full" style={{ width: `${Math.min(100, Math.round((dashUsedWeightKg / dashWeightKg) * 100))}%` }} />
                  </div>
                  <div className="flex justify-between text-[11px] font-semibold text-slate-500 dark:text-zinc-400">
                    <span>Floor Limit: {dashWeightKg} kg</span>
                    <span>Margin: {Math.max(0, dashWeightKg - dashUsedWeightKg)} kg</span>
                  </div>
                </div>
              );
              break;

            case "Power Data Summary":
              colSpanClass = "lg:col-span-6";
              cardContent = (
                <div className="p-4 flex-1 grid grid-cols-2 gap-3 font-sans">
                  <div className="bg-slate-50 dark:bg-zinc-800/60 p-3 rounded border border-slate-200 dark:border-zinc-700/60">
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">Active Power</span>
                    <span className="text-base font-black text-slate-800 dark:text-zinc-100">{totalPower} W</span>
                  </div>
                  <div className="bg-slate-50 dark:bg-zinc-800/60 p-3 rounded border border-slate-200 dark:border-zinc-700/60">
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">Peak Power</span>
                    <span className="text-base font-black text-amber-600 dark:text-amber-400">{powerStats.peak} W</span>
                  </div>
                  <div className="bg-slate-50 dark:bg-zinc-800/60 p-3 rounded border border-slate-200 dark:border-zinc-700/60">
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">Energy (Today)</span>
                    <span className="text-base font-black text-emerald-600 dark:text-emerald-400">{((totalPower * 24) / 1000).toFixed(1)} kWh</span>
                  </div>
                  <div className="bg-slate-50 dark:bg-zinc-800/60 p-3 rounded border border-slate-200 dark:border-zinc-700/60">
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">Power Factor</span>
                    <span className="text-base font-black text-indigo-600 dark:text-indigo-400">0.98</span>
                  </div>
                </div>
              );
              break;

            case "Device Health Summary":
              colSpanClass = "lg:col-span-6";
              cardContent = (
                <div className="p-4 flex-1 flex flex-col justify-between space-y-3 font-sans">
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/40 rounded">
                      <span className="text-base font-black text-emerald-600 dark:text-emerald-400">{healthyCount}</span>
                      <span className="text-[9px] font-bold text-emerald-700 dark:text-emerald-300 block uppercase">Healthy</span>
                    </div>
                    <div className="p-2.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40 rounded">
                      <span className="text-base font-black text-amber-600 dark:text-amber-400">{unhealthyCount}</span>
                      <span className="text-[9px] font-bold text-amber-700 dark:text-amber-300 block uppercase">Warning</span>
                    </div>
                    <div className="p-2.5 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/40 rounded">
                      <span className="text-base font-black text-rose-600 dark:text-rose-400">{unreachableCount}</span>
                      <span className="text-[9px] font-bold text-rose-700 dark:text-rose-300 block uppercase">Offline</span>
                    </div>
                  </div>
                </div>
              );
              break;

            case "Component Health Summary":
              colSpanClass = "lg:col-span-6";
              cardContent = (
                <div className="p-4 flex-1 grid grid-cols-2 gap-2 font-sans text-xs">
                  <div className="flex items-center justify-between p-2 bg-slate-50 dark:bg-zinc-800/60 rounded border border-slate-200 dark:border-zinc-700">
                    <span className="font-bold text-slate-700 dark:text-zinc-300">CPUs</span>
                    <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 text-[10px] font-bold rounded">OK</span>
                  </div>
                  <div className="flex items-center justify-between p-2 bg-slate-50 dark:bg-zinc-800/60 rounded border border-slate-200 dark:border-zinc-700">
                    <span className="font-bold text-slate-700 dark:text-zinc-300">Memory</span>
                    <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 text-[10px] font-bold rounded">OK</span>
                  </div>
                  <div className="flex items-center justify-between p-2 bg-slate-50 dark:bg-zinc-800/60 rounded border border-slate-200 dark:border-zinc-700">
                    <span className="font-bold text-slate-700 dark:text-zinc-300">PSUs</span>
                    <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 text-[10px] font-bold rounded">OK</span>
                  </div>
                  <div className="flex items-center justify-between p-2 bg-slate-50 dark:bg-zinc-800/60 rounded border border-slate-200 dark:border-zinc-700">
                    <span className="font-bold text-slate-700 dark:text-zinc-300">Fans</span>
                    <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 text-[10px] font-bold rounded">OK</span>
                  </div>
                </div>
              );
              break;

            case "Recent Inventory Changes":
              colSpanClass = "lg:col-span-6";
              cardContent = (
                <div className="p-4 flex-1 flex flex-col space-y-2 font-sans text-xs">
                  {servers.length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-500 font-medium">
                      No fetched inventory records found.
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {servers.slice(0, 3).map((s: any) => (
                        <div key={s.id} className="flex items-center justify-between p-2 bg-slate-50 dark:bg-zinc-800/60 rounded border border-slate-200 dark:border-zinc-700/60">
                          <div className="flex flex-col">
                            <span className="font-bold text-slate-800 dark:text-zinc-200">{s.name || s.bmcIp}</span>
                            <span className="text-[10px] text-slate-500">{s.model || "Redfish Server Node"} • {s.bmcIp}</span>
                          </div>
                          <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-bold">Fetched Node</span>
                        </div>
                      ))}
                    </div>
                  )}
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
              <div className="bg-[#b3b3b3] dark:bg-zinc-800 text-slate-850 dark:text-zinc-200 px-3.5 py-1 text-[11px] font-black uppercase tracking-wider flex items-center justify-between border-b border-slate-300 dark:border-zinc-700">
                <span>{gadgetName}</span>
                {(gadgetName === "Power Capacity" || gadgetName === "Space Capacity" || gadgetName === "Weight Capacity") && (
                  <div className="flex items-center gap-1.5">
                    <label className="text-[10px] font-bold text-slate-700 dark:text-zinc-300 normal-case tracking-normal">Rack:</label>
                    {dashAvailableRacks.length > 0 ? (
                      <select
                        value={dashSelectedRack}
                        onChange={(e) => setDashSelectedRack(e.target.value)}
                        className="px-1.5 py-0.5 bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 rounded font-bold text-slate-800 dark:text-white focus:outline-none text-[10px] cursor-pointer"
                      >
                        {dashAvailableRacks.map(rk => (
                          <option key={rk} value={rk}>{rk}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-[10px] font-medium text-slate-500 dark:text-zinc-400 italic">No Racks Present</span>
                    )}
                  </div>
                )}
                {gadgetName === "Device Statistics" && (
                  <span className="text-[10px] font-bold text-slate-700 dark:text-zinc-300 normal-case tracking-normal">
                    Total: <span className="font-extrabold text-slate-900 dark:text-white">{totalDevices}</span>
                  </span>
                )}
              </div>
              {cardContent}
            </div>
          );
        })}
      </div>

      {/* SECTION 4: Power, Space & Weight Capacity */}
      {(isGadgetEnabled("Power Capacity") || isGadgetEnabled("Space Capacity") || isGadgetEnabled("Weight Capacity")) && (
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
                {dashAvailableRacks.length > 0 ? (
                  <select
                    value={dashSelectedRack}
                    onChange={(e) => setDashSelectedRack(e.target.value)}
                    className="px-3 py-1 bg-slate-100 dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 rounded font-bold text-slate-800 dark:text-white focus:outline-none focus:border-[#7a0c0c] text-xs cursor-pointer"
                  >
                    {dashAvailableRacks.map(rk => (
                      <option key={rk} value={rk}>{rk}</option>
                    ))}
                  </select>
                ) : (
                  <span className="px-3 py-1 bg-slate-100 dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 rounded text-slate-500 dark:text-zinc-400 text-xs font-semibold">No Racks Present</span>
                )}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Capacity 1: Power */}
            {isGadgetEnabled("Power Capacity") && (
              <div className="lg:col-span-3 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded shadow-sm overflow-hidden flex flex-col justify-between">
                <div className="bg-[#b3b3b3] dark:bg-zinc-800 text-slate-850 dark:text-zinc-200 px-4 py-2 text-xs font-black uppercase tracking-wider flex justify-between items-center">
                  <span>Power Capacity</span>
                  <div className="flex items-center gap-1.5">
                    <label className="text-[10px] font-bold text-slate-700 dark:text-zinc-300 normal-case tracking-normal">Rack:</label>
                    {dashAvailableRacks.length > 0 ? (
                      <select
                        value={dashSelectedRack}
                        onChange={(e) => setDashSelectedRack(e.target.value)}
                        className="px-2 py-0.5 bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 rounded font-bold text-slate-800 dark:text-white focus:outline-none text-xs cursor-pointer"
                      >
                        {dashAvailableRacks.map(rk => (
                          <option key={rk} value={rk}>{rk}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-xs font-bold text-slate-500 dark:text-slate-400 bg-slate-200 dark:bg-zinc-700 px-2 py-0.5 rounded">No Rack Present</span>
                    )}
                  </div>
                </div>
                <div className="p-4 flex items-center gap-4 flex-1 min-h-[130px]">
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
                <div className="bg-[#b3b3b3] dark:bg-zinc-800 text-slate-850 dark:text-zinc-200 px-4 py-2 text-xs font-black uppercase tracking-wider flex justify-between items-center">
                  <span>Space Capacity</span>
                  <div className="flex items-center gap-1.5">
                    <label className="text-[10px] font-bold text-slate-700 dark:text-zinc-300 normal-case tracking-normal">Rack:</label>
                    {dashAvailableRacks.length > 0 ? (
                      <select
                        value={dashSelectedRack}
                        onChange={(e) => setDashSelectedRack(e.target.value)}
                        className="px-2 py-0.5 bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 rounded font-bold text-slate-800 dark:text-white focus:outline-none text-xs cursor-pointer"
                      >
                        {dashAvailableRacks.map(rk => (
                          <option key={rk} value={rk}>{rk}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-xs font-bold text-slate-500 dark:text-slate-400 bg-slate-200 dark:bg-zinc-700 px-2 py-0.5 rounded">No Rack Present</span>
                    )}
                  </div>
                </div>
                <div className="p-4 flex items-center gap-4 flex-1 min-h-[130px]">
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
                <div className="bg-[#b3b3b3] dark:bg-zinc-800 text-slate-850 dark:text-zinc-200 px-4 py-2 text-xs font-black uppercase tracking-wider flex justify-between items-center">
                  <span>Weight Capacity</span>
                  <div className="flex items-center gap-1.5">
                    <label className="text-[10px] font-bold text-slate-700 dark:text-zinc-300 normal-case tracking-normal">Rack:</label>
                    {dashAvailableRacks.length > 0 ? (
                      <select
                        value={dashSelectedRack}
                        onChange={(e) => setDashSelectedRack(e.target.value)}
                        className="px-2 py-0.5 bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 rounded font-bold text-slate-800 dark:text-white focus:outline-none text-xs cursor-pointer"
                      >
                        {dashAvailableRacks.map(rk => (
                          <option key={rk} value={rk}>{rk}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-xs font-bold text-slate-500 dark:text-slate-400 bg-slate-200 dark:bg-zinc-700 px-2 py-0.5 rounded">No Rack Present</span>
                    )}
                  </div>
                </div>
                <div className="p-4 flex items-center gap-4 flex-1 min-h-[130px]">
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

            {/* Capacity 4: Rack Space Allocation Pie Chart */}
            <div className="lg:col-span-3 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded shadow-sm overflow-hidden flex flex-col justify-between">
              <div className="bg-[#b3b3b3] dark:bg-zinc-800 text-slate-850 dark:text-zinc-200 px-4 py-2 text-xs font-black uppercase tracking-wider flex justify-between items-center">
                <span>Rack Space Distribution</span>
                <span className="text-[10px] font-bold text-slate-700 dark:text-zinc-300 normal-case tracking-normal truncate max-w-[100px]">
                  {dashSelectedRack || "Rack"}
                </span>
              </div>
              <div className="p-3 flex items-center justify-around flex-1 min-h-[130px] font-sans">
                <div className="w-[95px] h-[95px] shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={[
                          { name: "Used Space", value: dashUsedSpaceU, color: "#2563eb" },
                          { name: "Free Space", value: Math.max(0, dashSpaceU - dashUsedSpaceU), color: "#10b981" }
                        ]}
                        dataKey="value"
                        cx="50%"
                        cy="50%"
                        innerRadius={24}
                        outerRadius={42}
                        paddingAngle={3}
                      >
                        <Cell key="used" fill="#2563eb" />
                        <Cell key="free" fill="#10b981" />
                      </Pie>
                      <Tooltip formatter={(value: any, name: any) => [`${value} U`, name]} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-col space-y-2 text-xs font-semibold shrink-0">
                  <div className="flex flex-col">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-blue-600 shrink-0" />
                      <span className="text-[10px] uppercase font-bold text-slate-400">Used Space</span>
                    </div>
                    <span className="text-xs font-black text-slate-800 dark:text-zinc-100 pl-4">
                      {dashUsedSpaceU} U ({dashSpaceU > 0 ? Math.round((dashUsedSpaceU / dashSpaceU) * 100) : 0}%)
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
                      <span className="text-[10px] uppercase font-bold text-slate-400">Free Space</span>
                    </div>
                    <span className="text-xs font-black text-slate-800 dark:text-zinc-100 pl-4">
                      {Math.max(0, dashSpaceU - dashUsedSpaceU)} U ({dashSpaceU > 0 ? Math.round((Math.max(0, dashSpaceU - dashUsedSpaceU) / dashSpaceU) * 100) : 0}%)
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 5: Events Table */}
      {isGadgetEnabled("Events") && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Events Table Card */}
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded shadow-sm overflow-hidden flex flex-col lg:col-span-12">
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
        </div>
      )}







      {/* CATEGORY SERVERS MODAL OVERLAY */}
      {activeCategoryFilter && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-xs select-none font-sans">
          <div className="bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-800 rounded-xl shadow-2xl max-w-4xl w-full overflow-hidden flex flex-col max-h-[85vh]">
            {/* Modal Header */}
            <div className="bg-[#7a0c0c] text-white px-5 py-3 flex items-center justify-between shadow-md">
              <div className="flex items-center gap-2">
                <Cpu className="w-5 h-5 text-amber-300" />
                <span className="font-bold text-sm">
                  {activeCategoryFilter === "GPU Statistics"
                    ? `GPU Datacenter Inventory (${totalGpus} Total GPUs)`
                    : `Devices under Category: ${activeCategoryFilter} (${categoryServers.length})`}
                </span>
              </div>
              <button 
                onClick={() => setActiveCategoryFilter(null)}
                className="text-white/80 hover:text-white p-1 rounded hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 overflow-y-auto space-y-3 max-h-[65vh]">
              {activeCategoryFilter === "GPU Statistics" ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between bg-blue-50 dark:bg-zinc-800 p-3 rounded-lg border border-blue-200 dark:border-zinc-700">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-blue-100 dark:bg-zinc-700 flex items-center justify-center shrink-0">
                        <Cpu className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-800 dark:text-white">Active Datacenter GPU Overview</div>
                        <div className="text-[11px] text-slate-500 dark:text-zinc-400">Total {totalGpus} GPU(s) detected & active across datacenters</div>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setActiveCategoryFilter(null);
                        window.dispatchEvent(new CustomEvent("change-tab", { detail: "gpu" }));
                      }}
                      className="px-3.5 py-1.5 bg-[#7a0c0c] hover:bg-[#520000] text-white font-bold text-xs rounded cursor-pointer transition-colors shadow-xs flex items-center gap-1.5"
                    >
                      <span>Open GPU Availability Tab</span>
                      <span>→</span>
                    </button>
                  </div>

                  <div className="border border-slate-200 dark:border-zinc-700 rounded-lg overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 font-bold uppercase text-[10px]">
                        <tr>
                          <th className="p-2.5">#</th>
                          <th className="p-2.5">GPU Model / Product Name</th>
                          <th className="p-2.5">Host Server Node</th>
                          <th className="p-2.5">BMC IP</th>
                          <th className="p-2.5">Location / Rack</th>
                          <th className="p-2.5">Quantity</th>
                          <th className="p-2.5">Health</th>
                          <th className="p-2.5 text-right">Inspect Node</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-zinc-800 font-mono text-[11px]">
                        {gpuDetailsList.map((gpu, idx) => (
                          <tr key={gpu.id} className="hover:bg-slate-50 dark:hover:bg-zinc-800/60 transition-colors">
                            <td className="p-2.5 font-bold text-slate-400">{idx + 1}</td>
                            <td className="p-2.5 font-bold text-slate-800 dark:text-white font-sans flex items-center gap-2">
                              <Cpu className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                              <span>{gpu.productName}</span>
                            </td>
                            <td className="p-2.5 font-sans font-medium text-slate-700 dark:text-zinc-300">{gpu.serverName}</td>
                            <td className="p-2.5 text-blue-600 dark:text-blue-400 font-bold">{gpu.bmcIp}</td>
                            <td className="p-2.5 text-slate-600 dark:text-zinc-400 font-sans">{gpu.rack}</td>
                            <td className="p-2.5 font-bold text-slate-800 dark:text-white">{gpu.count} GPU</td>
                            <td className="p-2.5 font-sans">
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                                {gpu.health}
                              </span>
                            </td>
                            <td className="p-2.5 text-right font-sans">
                              <button
                                onClick={() => {
                                  onSelectServer(gpu.id);
                                  setActiveCategoryFilter(null);
                                }}
                                className="px-3 py-1 bg-[#7a0c0c] hover:bg-[#520000] text-white rounded text-[11px] font-bold cursor-pointer transition-colors shadow-2xs"
                              >
                                Inspect Server
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : categoryServers.length === 0 ? (
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
                            {(() => {
                              const st = (serverStatuses[srv.id]?.status || serverStatuses[srv.bmcIp]?.status || "").toLowerCase();
                              const p = String((srv as any).powerState || (srv as any).power || "").toLowerCase();
                              if (st === "offline") {
                                return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300">OFFLINE</span>;
                              }
                              if (p === "off") {
                                return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">POWER OFF</span>;
                              }
                              if (st === "critical" || st === "warning") {
                                return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-800 border border-red-300 uppercase">{st}</span>;
                              }
                              return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">ONLINE</span>;
                            })()}
                          </td>
                          <td className="p-2.5 text-right">
                            <button
                              onClick={() => {
                                onSelectServer(srv.id);
                                setActiveCategoryFilter(null);
                              }}
                              className="px-3 py-1 bg-[#7a0c0c] hover:bg-[#520000] text-white rounded text-[11px] font-bold cursor-pointer transition-colors shadow-2xs"
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
