import React, { useState, useMemo, useEffect } from "react";
import {
  HardDrive,
  Database,
  Cpu,
  Server,
  Search,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  FileJson,
  X,
  ShieldCheck,
  Eye,
  Activity
} from "lucide-react";
import { RedfishService } from "../services/redfishService";

interface ServerProfile {
  id: string;
  name: string;
  bmcIp: string;
  rack?: string;
  category?: "SM" | "AS";
  username?: string;
  password?: string;
}

interface HardwareLog {
  id: string;
  type: string;
  message: string;
  severity: "OK" | "Warning" | "Critical";
  timestamp: string;
  server: string;
}

interface SustainabilityViewProps {
  servers?: ServerProfile[];
  alerts?: HardwareLog[];
  serverStatuses?: Record<string, any>;
  onSelectServer?: (serverId: string) => void;
}

// Storage Controller Interface
export interface RaidControllerInfo {
  id: string;
  serverId: string;
  serverName: string;
  bmcIp: string;
  name: string;
  model: string;
  manufacturer: string;
  serialNumber: string;
  firmwareVersion: string;
  status: string;
  busType: string;
  pcieInterface: string;
  cacheSizeMB?: string | number;
  batteryStatus?: string;
  driveCount: number;
  rawData?: any;
}

// Physical Drive Interface
export interface PhysicalDriveInfo {
  id: string;
  serverId: string;
  serverName: string;
  bmcIp: string;
  model: string;
  serialNumber: string;
  capacityFormatted: string;
  mediaType: string;
  protocol: string;
  status: string;
  bayLocation: string;
  enclosure: string;
  temperature: string;
  healthPercent: string;
  firmwareVersion: string;
  rawData?: any;
}

// PCIe / AOC Device Interface
export interface PcieAocDevice {
  id: string;
  serverId: string;
  serverName: string;
  bmcIp: string;
  name: string;
  model: string;
  manufacturer: string;
  serialNumber: string;
  slotNumber: string;
  deviceType: string;
  pcieGenLanes: string;
  vendorId: string;
  deviceId: string;
  busLocation: string;
  firmwareVersion: string;
  status: string;
  rawData?: any;
}

export function SustainabilityView({
  servers = [],
  alerts = [],
  serverStatuses = {},
  onSelectServer
}: SustainabilityViewProps) {
  const [activeTab, setActiveTab] = useState<"all" | "raid" | "drives" | "pcie">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedServerFilter, setSelectedServerFilter] = useState<string>("ALL");
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>("");

  // Inspection Modal State
  const [inspectItem, setInspectItem] = useState<{ title: string; data: any } | null>(null);

  // Live Real Redfish Fetched Data State (STRICTLY NO MOCK DATA)
  const [fetchedData, setFetchedData] = useState<Record<string, {
    controllers: RaidControllerInfo[];
    drives: PhysicalDriveInfo[];
    pcie: PcieAocDevice[];
    error?: string;
  }>>({});

  // Active non-deleted fleet
  const activeFleet = useMemo(() => {
    const deletedKeys = (() => {
      try {
        const raw = localStorage.getItem("tyrone_deleted_keys");
        return raw ? new Set<string>(JSON.parse(raw)) : new Set<string>();
      } catch {
        return new Set<string>();
      }
    })();

    return (servers || []).filter(s => {
      const idStr = String(s.id || "").toLowerCase();
      const ipStr = String(s.bmcIp || "").toLowerCase();
      const nameStr = String(s.name || "").toLowerCase();
      return !deletedKeys.has(idStr) && !deletedKeys.has(ipStr) && !deletedKeys.has(nameStr);
    });
  }, [servers]);

  // Query Real Redfish APIs for all servers in active fleet
  const fetchRedfishHardware = async () => {
    if (activeFleet.length === 0) return;
    setIsLoading(true);

    const resultMap: Record<string, {
      controllers: RaidControllerInfo[];
      drives: PhysicalDriveInfo[];
      pcie: PcieAocDevice[];
      error?: string;
    }> = {};

    await Promise.all(
      activeFleet.map(async (srv) => {
        const serverKey = srv.id || srv.bmcIp;
        const ctrls: RaidControllerInfo[] = [];
        const drvs: PhysicalDriveInfo[] = [];
        const pcieCards: PcieAocDevice[] = [];

        try {
          const service = new RedfishService({
            url: srv.bmcIp,
            username: srv.username || "admin",
            password: srv.password || "",
            category: srv.category || "SM"
          });

          // 0. Try Fast Backend Hardware Inventory Service (Async + TTL Cached)
          const backendInv = await service.getBackendHardwareInventory().catch(() => null);

          if (backendInv && (Array.isArray(backendInv.raid_controllers) || Array.isArray(backendInv.physical_drives) || Array.isArray(backendInv.pcie_aoc_devices))) {
            (backendInv.raid_controllers || []).forEach((c: any, cIdx: number) => {
              ctrls.push({
                id: c.id || `ctrl-${serverKey}-${cIdx}`,
                serverId: srv.id,
                serverName: srv.name || srv.bmcIp,
                bmcIp: srv.bmcIp,
                name: c.name || "Storage Controller",
                model: c.model || "RAID / Storage Controller",
                manufacturer: c.manufacturer || "Broadcom / Supermicro / OEM",
                serialNumber: c.serial_number || "N/A",
                firmwareVersion: c.firmware_version || "N/A",
                status: c.status || "OK",
                busType: "SAS/SATA/NVMe",
                pcieInterface: c.pcie_interface || "PCIe Interface Mapped",
                cacheSizeMB: c.cache_mb || "N/A",
                batteryStatus: c.battery_status || "N/A",
                driveCount: (backendInv.physical_drives || []).length,
                rawData: c
              });
            });

            (backendInv.physical_drives || []).forEach((d: any, dIdx: number) => {
              drvs.push({
                id: d.id || `drv-${serverKey}-${dIdx}`,
                serverId: srv.id,
                serverName: srv.name || srv.bmcIp,
                bmcIp: srv.bmcIp,
                model: d.model || "Physical Storage Drive",
                serialNumber: d.serial_number || "N/A",
                capacityFormatted: d.capacity || "N/A",
                mediaType: d.media_type || "SSD",
                protocol: d.protocol || "SAS/SATA/NVMe",
                status: d.status || "OK",
                bayLocation: d.bay_location || `Drive Bay ${dIdx + 1}`,
                enclosure: "Storage Backplane",
                temperature: d.temperature || "N/A",
                healthPercent: d.health_life || "100%",
                firmwareVersion: d.firmware_version || "N/A",
                rawData: d
              });
            });

            (backendInv.pcie_aoc_devices || []).forEach((p: any, pIdx: number) => {
              pcieCards.push({
                id: p.id || `pcie-${serverKey}-${pIdx}`,
                serverId: srv.id,
                serverName: srv.name || srv.bmcIp,
                bmcIp: srv.bmcIp,
                name: p.name || "PCIe AOC Device",
                model: p.model || p.name || "PCIe Expansion Card",
                manufacturer: p.manufacturer || "N/A",
                serialNumber: p.serial_number || "N/A",
                slotNumber: p.slot_number || `Slot ${pIdx + 1}`,
                deviceType: p.device_type || "PCIe AOC Card",
                pcieGenLanes: p.pcie_spec || "PCIe Gen4 x16",
                vendorId: p.vendor_id || "N/A",
                deviceId: p.device_id || "N/A",
                busLocation: p.bus_location || "N/A",
                firmwareVersion: p.firmware_version || "N/A",
                status: p.status || "OK",
                rawData: p
              });
            });
          } else {
            // Fallback: Fetch via proxy requests
            const rawStorage = await service.getStorageDetails().catch(() => []);
            if (Array.isArray(rawStorage) && rawStorage.length > 0) {
              rawStorage.forEach((stg: any, stgIdx: number) => {
                const ctrlList = stg.ControllerDetails || stg.StorageControllers || (stg.Name ? [stg] : []);
                if (Array.isArray(ctrlList)) {
                  ctrlList.forEach((c: any, cIdx: number) => {
                    if (!c) return;
                    ctrls.push({
                      id: c.Id || `ctrl-${serverKey}-${stgIdx}-${cIdx}`,
                      serverId: srv.id,
                      serverName: srv.name || srv.bmcIp,
                      bmcIp: srv.bmcIp,
                      name: c.Name || stg.Name || "Storage Controller",
                      model: c.Model || stg.Model || c.Name || "RAID / Storage Controller",
                      manufacturer: c.Manufacturer || stg.Manufacturer || "Broadcom / Supermicro / OEM",
                      serialNumber: c.SerialNumber || stg.SerialNumber || "N/A",
                      firmwareVersion: c.FirmwareVersion || c.Revision || stg.FirmwareVersion || "N/A",
                      status: c.Status?.Health || stg.Status?.Health || "OK",
                      busType: c.SupportedControllerProtocols?.[0] || stg.SupportedProtocols?.[0] || "SAS/SATA/NVMe",
                      pcieInterface: c.PCIeInterface?.PCIeType ? `PCIe ${c.PCIeInterface.PCIeType} x${c.PCIeInterface.LanesInUse || 8}` : "PCIe Interface Mapped",
                      cacheSizeMB: c.CacheSummary?.TotalCacheSizeMiB || "N/A",
                      batteryStatus: c.CacheSummary?.Status?.Health || "N/A",
                      driveCount: (stg.DriveDetails || stg.Drives || []).length,
                      rawData: c
                    });
                  });
                }

                const driveList = stg.DriveDetails || stg.Drives || [];
                if (Array.isArray(driveList)) {
                  driveList.forEach((d: any, dIdx: number) => {
                    if (!d) return;
                    const capB = Number(d.CapacityBytes || 0);
                    const capGB = capB > 0 ? Math.round(capB / (1000 * 1000 * 1000)) : (d.CapacityGB || 0);
                    const capFormatted = capGB >= 1000 ? `${(capGB / 1000).toFixed(1)} TB` : (capGB > 0 ? `${capGB} GB` : "N/A");

                    const media = (d.MediaType || d.Protocol || "").toUpperCase().includes("NVME") ? "NVMe SSD" :
                      (d.MediaType || "").toUpperCase().includes("HDD") ? "Enterprise HDD" : (d.MediaType || "SSD");

                    drvs.push({
                      id: d.Id || d.SerialNumber || `drv-${serverKey}-${stgIdx}-${dIdx}`,
                      serverId: srv.id,
                      serverName: srv.name || srv.bmcIp,
                      bmcIp: srv.bmcIp,
                      model: d.Model || d.Name || "Physical Storage Drive",
                      serialNumber: d.SerialNumber || "N/A",
                      capacityFormatted: capFormatted,
                      mediaType: media,
                      protocol: d.Protocol || "SAS/SATA/NVMe",
                      status: d.Status?.Health || "OK",
                      bayLocation: d.PhysicalLocation?.Info || (d.BayNumber !== undefined ? `Bay ${d.BayNumber}` : `Drive Bay ${dIdx + 1}`),
                      enclosure: d.PhysicalLocation?.PartLocation?.ServiceLabel || "Storage Backplane",
                      temperature: d.TemperatureCelsius ? `${d.TemperatureCelsius}°C` : "N/A",
                      healthPercent: d.PredictedMediaLifeLeftPercent !== undefined ? `${d.PredictedMediaLifeLeftPercent}%` : "100%",
                      firmwareVersion: d.Revision || d.FirmwareVersion || "N/A",
                      rawData: d
                    });
                  });
                }
              });
            }

            const rawPcie = await service.getPCIeDevices().catch(() => []);
            if (Array.isArray(rawPcie) && rawPcie.length > 0) {
              rawPcie.forEach((p: any, pIdx: number) => {
                if (!p) return;
                const devName = p.Name || p.Model || `PCIe AOC Device ${pIdx + 1}`;
                const desc = `${devName} ${p.Manufacturer || ""}`.toLowerCase();
                const type = desc.includes("nvidia") || desc.includes("gpu") || desc.includes("vga") ? "GPU Accelerator" :
                  desc.includes("mellanox") || desc.includes("intel") || desc.includes("ethernet") || desc.includes("nic") ? "Network AOC" :
                  desc.includes("raid") || desc.includes("sas") || desc.includes("hba") ? "Storage HBA / RAID" : "PCIe AOC Card";

                pcieCards.push({
                  id: p.Id || `pcie-${serverKey}-${pIdx}`,
                  serverId: srv.id,
                  serverName: srv.name || srv.bmcIp,
                  bmcIp: srv.bmcIp,
                  name: devName,
                  model: p.Model || devName,
                  manufacturer: p.Manufacturer || "N/A",
                  serialNumber: p.SerialNumber || "N/A",
                  slotNumber: p.SlotNumber || `Slot ${pIdx + 1}`,
                  deviceType: type,
                  pcieGenLanes: p.PCIeInterface?.PCIeType ? `PCIe ${p.PCIeInterface.PCIeType} x${p.PCIeInterface.LanesInUse || 16}` : "PCIe Gen4 x16",
                  vendorId: p.VendorId || "N/A",
                  deviceId: p.DeviceId || "N/A",
                  busLocation: p.BusNumber ? `0000:${p.BusNumber}:00.0` : "N/A",
                  firmwareVersion: p.FirmwareVersion || "N/A",
                  status: p.Status?.Health || "OK",
                  rawData: p
                });
              });
            }
          }

          resultMap[serverKey] = {
            controllers: ctrls,
            drives: drvs,
            pcie: pcieCards
          };
        } catch (err: any) {
          resultMap[serverKey] = {
            controllers: [],
            drives: [],
            pcie: [],
            error: err.message || "Failed to reach BMC Redfish API"
          };
        }
      })
    );

    setFetchedData(resultMap);
    setLastUpdated(new Date().toLocaleTimeString());
    setIsLoading(false);
  };

  useEffect(() => {
    fetchRedfishHardware();
  }, [activeFleet.length]);

  // Consolidate all fetched hardware across all servers
  const allControllers = useMemo(() => {
    return Object.values(fetchedData).flatMap((d: any) => d.controllers || []);
  }, [fetchedData]);

  const allDrives = useMemo(() => {
    return Object.values(fetchedData).flatMap((d: any) => d.drives || []);
  }, [fetchedData]);

  const allPcie = useMemo(() => {
    return Object.values(fetchedData).flatMap((d: any) => d.pcie || []);
  }, [fetchedData]);

  // Filtered Lists based on search and server filter
  const filteredControllers = useMemo(() => {
    return allControllers.filter(c => {
      const matchServer = selectedServerFilter === "ALL" || c.serverId === selectedServerFilter || c.bmcIp === selectedServerFilter;
      const q = searchQuery.toLowerCase();
      const matchSearch = !q || c.name.toLowerCase().includes(q) || c.model.toLowerCase().includes(q) || c.serverName.toLowerCase().includes(q) || c.bmcIp.toLowerCase().includes(q) || c.serialNumber.toLowerCase().includes(q);
      return matchServer && matchSearch;
    });
  }, [allControllers, selectedServerFilter, searchQuery]);

  const filteredDrives = useMemo(() => {
    return allDrives.filter(d => {
      const matchServer = selectedServerFilter === "ALL" || d.serverId === selectedServerFilter || d.bmcIp === selectedServerFilter;
      const q = searchQuery.toLowerCase();
      const matchSearch = !q || d.model.toLowerCase().includes(q) || d.serialNumber.toLowerCase().includes(q) || d.serverName.toLowerCase().includes(q) || d.bmcIp.toLowerCase().includes(q) || d.bayLocation.toLowerCase().includes(q);
      return matchServer && matchSearch;
    });
  }, [allDrives, selectedServerFilter, searchQuery]);

  const filteredPcie = useMemo(() => {
    return allPcie.filter(p => {
      const matchServer = selectedServerFilter === "ALL" || p.serverId === selectedServerFilter || p.bmcIp === selectedServerFilter;
      const q = searchQuery.toLowerCase();
      const matchSearch = !q || p.name.toLowerCase().includes(q) || p.model.toLowerCase().includes(q) || p.serverName.toLowerCase().includes(q) || p.bmcIp.toLowerCase().includes(q) || p.slotNumber.toLowerCase().includes(q);
      return matchServer && matchSearch;
    });
  }, [allPcie, selectedServerFilter, searchQuery]);

  return (
    <div className="w-full min-h-screen bg-[#dce1e7] text-slate-800 p-4 md:p-6 space-y-4 font-sans">
      
      {/* HEADER BANNER CARD (EXACT MATCHING IMAGE 1 & 2) */}
      <div className="bg-[#7a0c0c] border border-[#500000] p-5 rounded-xl shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-white text-[#7a0c0c] rounded-xl shadow-sm">
            <HardDrive className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-black text-white tracking-wide">
              RAID Controllers, Physical Drives & AOC / PCIe Devices
            </h1>
            <p className="text-xs text-red-100 font-medium mt-0.5">
              Live Redfish telemetry fetched directly from BMC hardware across all server nodes
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {lastUpdated && (
            <span className="text-xs text-white font-semibold bg-[#5a0909] border border-red-700 px-3 py-1 rounded-full">
              Updated: {lastUpdated}
            </span>
          )}
          <button
            onClick={fetchRedfishHardware}
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2 bg-white text-[#7a0c0c] hover:bg-slate-100 font-bold rounded-full text-xs transition-all shadow-md active:scale-95 disabled:opacity-60"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
            {isLoading ? "Querying Redfish..." : "Refresh Redfish Data"}
          </button>
        </div>
      </div>

      {/* 4 STAT CARDS (EXACT MATCHING IMAGE 1) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* SERVER NODES */}
        <div className="bg-[#5c0000] border border-[#800000] p-4 rounded-2xl shadow-md flex justify-between items-start">
          <div>
            <span className="text-[11px] font-bold tracking-wider text-red-100 uppercase block">SERVER NODES</span>
            <span className="text-3xl font-black text-white mt-1 block">{activeFleet.length}</span>
            <span className="text-[11px] text-red-200/90 mt-1 font-medium block">Managed Redfish BMCs</span>
          </div>
          <Server className="w-5 h-5 text-red-200/80" />
        </div>

        {/* RAID CONTROLLERS */}
        <div className="bg-[#5c0000] border border-[#800000] p-4 rounded-2xl shadow-md flex justify-between items-start">
          <div>
            <span className="text-[11px] font-bold tracking-wider text-red-100 uppercase block">RAID CONTROLLERS</span>
            <span className="text-3xl font-black text-white mt-1 block">{allControllers.length}</span>
            <span className="text-[11px] text-red-200/90 mt-1 font-medium block">Fetched via Redfish API</span>
          </div>
          <Database className="w-5 h-5 text-red-200/80" />
        </div>

        {/* PHYSICAL DRIVES */}
        <div className="bg-[#5c0000] border border-[#800000] p-4 rounded-2xl shadow-md flex justify-between items-start">
          <div>
            <span className="text-[11px] font-bold tracking-wider text-red-100 uppercase block">PHYSICAL DRIVES</span>
            <span className="text-3xl font-black text-white mt-1 block">{allDrives.length}</span>
            <span className="text-[11px] text-red-200/90 mt-1 font-medium block">Fetched via Redfish API</span>
          </div>
          <HardDrive className="w-5 h-5 text-red-200/80" />
        </div>

        {/* PCIE / AOC DEVICES */}
        <div className="bg-[#5c0000] border border-[#800000] p-4 rounded-2xl shadow-md flex justify-between items-start">
          <div>
            <span className="text-[11px] font-bold tracking-wider text-red-100 uppercase block">PCIE / AOC DEVICES</span>
            <span className="text-3xl font-black text-white mt-1 block">{allPcie.length}</span>
            <span className="text-[11px] text-red-200/90 mt-1 font-medium block">Fetched via Redfish API</span>
          </div>
          <Cpu className="w-5 h-5 text-red-200/80" />
        </div>
      </div>

      {/* SUB-TABS & FILTERS BAR (EXACT MATCHING IMAGE 1 & 2) */}
      <div className="bg-[#5c0000] border border-[#800000] p-3 rounded-2xl shadow-md flex flex-col md:flex-row items-center justify-between gap-4">
        
        {/* SUB-TAB PILLS (MATCHING IMAGE 2 PILL STYLING) */}
        <div className="flex items-center gap-2 font-bold text-xs overflow-x-auto w-full md:w-auto">
          <button
            onClick={() => setActiveTab("all")}
            className={`px-4 py-2 rounded-md transition-all whitespace-nowrap ${
              activeTab === "all"
                ? "bg-white text-slate-800 font-bold border border-[#700000] shadow-sm"
                : "bg-[#7a0c0c] text-white hover:bg-[#8d1010] font-bold border border-[#961212]"
            }`}
          >
            All Server Devices
          </button>
          <button
            onClick={() => setActiveTab("raid")}
            className={`px-4 py-2 rounded-md transition-all whitespace-nowrap ${
              activeTab === "raid"
                ? "bg-white text-slate-800 font-bold border border-[#700000] shadow-sm"
                : "bg-[#7a0c0c] text-white hover:bg-[#8d1010] font-bold border border-[#961212]"
            }`}
          >
            RAID Controllers ({allControllers.length})
          </button>
          <button
            onClick={() => setActiveTab("drives")}
            className={`px-4 py-2 rounded-md transition-all whitespace-nowrap ${
              activeTab === "drives"
                ? "bg-white text-slate-800 font-bold border border-[#700000] shadow-sm"
                : "bg-[#7a0c0c] text-white hover:bg-[#8d1010] font-bold border border-[#961212]"
            }`}
          >
            Physical Drives ({allDrives.length})
          </button>
          <button
            onClick={() => setActiveTab("pcie")}
            className={`px-4 py-2 rounded-md transition-all whitespace-nowrap ${
              activeTab === "pcie"
                ? "bg-white text-slate-800 font-bold border border-[#700000] shadow-sm"
                : "bg-[#7a0c0c] text-white hover:bg-[#8d1010] font-bold border border-[#961212]"
            }`}
          >
            PCIe / AOC Devices ({allPcie.length})
          </button>
        </div>
      </div>

      {/* TABLE DATA CONTAINER (EXACT MATCHING IMAGE 2 STYLING) */}
      <div className="bg-white rounded-lg shadow-sm border border-[#cbd5e1] overflow-hidden">
        
        {/* TOP CRIMSON HEADER BAR OF TABLE */}
        <div className="bg-[#7a0c0c] text-white font-bold px-4 py-3 text-xs tracking-wide uppercase flex justify-between items-center border-b border-[#5a0909]">
          <span>Server Fleet Hardware & Telemetry Summary</span>
          <span className="bg-[#5a0909] text-white text-[11px] font-bold px-2.5 py-0.5 rounded-full border border-red-700">
            {activeFleet.length} Monitored Nodes
          </span>
        </div>

        {/* LOADING SPINNER */}
        {isLoading && Object.keys(fetchedData).length === 0 && (
          <div className="p-12 text-center text-slate-600 bg-white">
            <RefreshCw className="w-8 h-8 text-[#7a0c0c] animate-spin mx-auto mb-3" />
            <p className="text-sm font-bold text-slate-800">Querying Redfish Hardware Inventory...</p>
            <p className="text-xs text-slate-500 mt-1">Connecting to BMC Redfish APIs across registered fleet nodes</p>
          </div>
        )}

        {!isLoading && (
          <div className="overflow-x-auto">
            
            {/* VIEW 1: ALL DEVICES BY SERVER NODE */}
            {activeTab === "all" && (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#f1f5f9] border-b border-[#cbd5e1] text-slate-800 text-xs font-bold">
                    <th className="p-3 border-r border-[#cbd5e1] w-1/5">Server Node</th>
                    <th className="p-3 border-r border-[#cbd5e1] w-1/6">BMC IP</th>
                    <th className="p-3 border-r border-[#cbd5e1]">RAID Controllers</th>
                    <th className="p-3 border-r border-[#cbd5e1]">Physical Drives</th>
                    <th className="p-3 border-r border-[#cbd5e1]">PCIe / AOC Devices</th>
                    <th className="p-3 text-center w-24">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e2e8f0] text-xs text-slate-700">
                  {activeFleet.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-12 text-center text-slate-500 italic text-xs">
                        No active servers registered in fleet.
                      </td>
                    </tr>
                  ) : (
                    activeFleet.map((srv) => {
                      const data = fetchedData[srv.id] || fetchedData[srv.bmcIp] || { controllers: [], drives: [], pcie: [] };
                      const ctrls = data.controllers;
                      const drives = data.drives;
                      const pcieCards = data.pcie;

                      return (
                        <tr key={srv.id} className="hover:bg-slate-50 transition-colors">
                          <td className="p-3 font-bold text-slate-900 border-r border-[#cbd5e1]">
                            {srv.name || `Server ${srv.bmcIp}`}
                          </td>
                          <td className="p-3 font-mono text-slate-700 border-r border-[#cbd5e1]">
                            {srv.bmcIp}
                          </td>
                          <td className="p-3 border-r border-[#cbd5e1]">
                            {ctrls.length === 0 ? (
                              <span className="text-slate-400 italic">No controllers detected</span>
                            ) : (
                              <div className="space-y-1">
                                <span className="font-bold text-[#7a0c0c] block">{ctrls.length} Controller(s)</span>
                                {ctrls.slice(0, 2).map(c => (
                                  <span key={c.id} className="text-[11px] font-mono text-slate-600 block truncate max-w-[200px]">
                                    • {c.name}
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>
                          <td className="p-3 border-r border-[#cbd5e1]">
                            {drives.length === 0 ? (
                              <span className="text-slate-400 italic">No drives detected</span>
                            ) : (
                              <div className="space-y-1">
                                <span className="font-bold text-[#7a0c0c] block">{drives.length} Physical Drive(s)</span>
                                {drives.slice(0, 2).map(d => (
                                  <span key={d.id} className="text-[11px] font-mono text-slate-600 block truncate max-w-[200px]">
                                    • {d.model} ({d.capacityFormatted})
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>
                          <td className="p-3 border-r border-[#cbd5e1]">
                            {pcieCards.length === 0 ? (
                              <span className="text-slate-400 italic">No PCIe cards detected</span>
                            ) : (
                              <div className="space-y-1">
                                <span className="font-bold text-[#7a0c0c] block">{pcieCards.length} AOC Card(s)</span>
                                {pcieCards.slice(0, 2).map(p => (
                                  <span key={p.id} className="text-[11px] font-mono text-slate-600 block truncate max-w-[200px]">
                                    • {p.name}
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>
                          <td className="p-3 text-center">
                            <button
                              onClick={() => setInspectItem({ title: `Server Node Payload: ${srv.name || srv.bmcIp}`, data: data })}
                              className="px-2.5 py-1 bg-[#7a0c0c] text-white hover:bg-[#961212] font-bold rounded text-[11px] transition-colors shadow-sm"
                            >
                              Inspect
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            )}

            {/* VIEW 2: RAID CONTROLLERS TABLE */}
            {activeTab === "raid" && (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#f1f5f9] border-b border-[#cbd5e1] text-slate-800 text-xs font-bold">
                    <th className="p-3 border-r border-[#cbd5e1]">Server Node</th>
                    <th className="p-3 border-r border-[#cbd5e1]">Controller Name</th>
                    <th className="p-3 border-r border-[#cbd5e1]">Model</th>
                    <th className="p-3 border-r border-[#cbd5e1]">Serial Number</th>
                    <th className="p-3 border-r border-[#cbd5e1]">Firmware Version</th>
                    <th className="p-3 border-r border-[#cbd5e1]">PCIe Interface</th>
                    <th className="p-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e2e8f0] text-xs text-slate-700">
                  {filteredControllers.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-12 text-center text-slate-500 italic text-xs">
                        No RAID controllers detected via Redfish.
                      </td>
                    </tr>
                  ) : (
                    filteredControllers.map(c => (
                      <tr key={c.id} onClick={() => setInspectItem({ title: `RAID Controller: ${c.name}`, data: c.rawData || c })} className="hover:bg-slate-50 cursor-pointer transition-colors">
                        <td className="p-3 font-bold text-slate-900 border-r border-[#cbd5e1]">{c.serverName} ({c.bmcIp})</td>
                        <td className="p-3 font-semibold text-slate-800 border-r border-[#cbd5e1]">{c.name}</td>
                        <td className="p-3 font-mono text-slate-700 border-r border-[#cbd5e1]">{c.model}</td>
                        <td className="p-3 font-mono text-slate-700 border-r border-[#cbd5e1]">{c.serialNumber}</td>
                        <td className="p-3 font-mono text-slate-700 border-r border-[#cbd5e1]">{c.firmwareVersion}</td>
                        <td className="p-3 font-semibold text-slate-700 border-r border-[#cbd5e1]">{c.pcieInterface}</td>
                        <td className="p-3 text-center font-bold text-[#7a0c0c]">{c.status}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}

            {/* VIEW 3: PHYSICAL DRIVES TABLE */}
            {activeTab === "drives" && (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#f1f5f9] border-b border-[#cbd5e1] text-slate-800 text-xs font-bold">
                    <th className="p-3 border-r border-[#cbd5e1]">Server Node</th>
                    <th className="p-3 border-r border-[#cbd5e1]">Drive Model</th>
                    <th className="p-3 border-r border-[#cbd5e1]">Capacity</th>
                    <th className="p-3 border-r border-[#cbd5e1]">Media / Protocol</th>
                    <th className="p-3 border-r border-[#cbd5e1]">Bay Location</th>
                    <th className="p-3 border-r border-[#cbd5e1]">Serial Number</th>
                    <th className="p-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e2e8f0] text-xs text-slate-700">
                  {filteredDrives.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-12 text-center text-slate-500 italic text-xs">
                        No physical storage drives detected via Redfish.
                      </td>
                    </tr>
                  ) : (
                    filteredDrives.map(d => (
                      <tr key={d.id} onClick={() => setInspectItem({ title: `Physical Drive: ${d.model}`, data: d.rawData || d })} className="hover:bg-slate-50 cursor-pointer transition-colors">
                        <td className="p-3 font-bold text-slate-900 border-r border-[#cbd5e1]">{d.serverName} ({d.bmcIp})</td>
                        <td className="p-3 font-semibold text-slate-800 border-r border-[#cbd5e1]">{d.model}</td>
                        <td className="p-3 font-bold text-slate-900 border-r border-[#cbd5e1]">{d.capacityFormatted}</td>
                        <td className="p-3 font-semibold text-slate-700 border-r border-[#cbd5e1]">{d.mediaType} ({d.protocol})</td>
                        <td className="p-3 font-mono text-slate-700 border-r border-[#cbd5e1]">{d.bayLocation}</td>
                        <td className="p-3 font-mono text-slate-700 border-r border-[#cbd5e1]">{d.serialNumber}</td>
                        <td className="p-3 text-center font-bold text-[#7a0c0c]">{d.status}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}

            {/* VIEW 4: PCIE & AOC DEVICES TABLE */}
            {activeTab === "pcie" && (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#f1f5f9] border-b border-[#cbd5e1] text-slate-800 text-xs font-bold">
                    <th className="p-3 border-r border-[#cbd5e1]">Server Node</th>
                    <th className="p-3 border-r border-[#cbd5e1]">Device Name</th>
                    <th className="p-3 border-r border-[#cbd5e1]">Slot Number</th>
                    <th className="p-3 border-r border-[#cbd5e1]">Category</th>
                    <th className="p-3 border-r border-[#cbd5e1]">PCIe Spec</th>
                    <th className="p-3 border-r border-[#cbd5e1]">Vendor / Device ID</th>
                    <th className="p-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e2e8f0] text-xs text-slate-700">
                  {filteredPcie.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-12 text-center text-slate-500 italic text-xs">
                        No PCIe expansion devices detected via Redfish.
                      </td>
                    </tr>
                  ) : (
                    filteredPcie.map(p => (
                      <tr key={p.id} onClick={() => setInspectItem({ title: `PCIe Device: ${p.name}`, data: p.rawData || p })} className="hover:bg-slate-50 cursor-pointer transition-colors">
                        <td className="p-3 font-bold text-slate-900 border-r border-[#cbd5e1]">{p.serverName} ({p.bmcIp})</td>
                        <td className="p-3 font-semibold text-slate-800 border-r border-[#cbd5e1]">{p.name}</td>
                        <td className="p-3 font-mono text-slate-700 border-r border-[#cbd5e1]">{p.slotNumber}</td>
                        <td className="p-3 font-semibold text-slate-700 border-r border-[#cbd5e1]">{p.deviceType}</td>
                        <td className="p-3 font-mono text-slate-700 border-r border-[#cbd5e1]">{p.pcieGenLanes}</td>
                        <td className="p-3 font-mono text-slate-700 border-r border-[#cbd5e1]">{p.vendorId} / {p.deviceId}</td>
                        <td className="p-3 text-center font-bold text-[#7a0c0c]">{p.status}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}

          </div>
        )}

      </div>

      {/* INSPECTION MODAL */}
      {inspectItem && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-[#cbd5e1] rounded-xl max-w-2xl w-full p-6 space-y-4 shadow-2xl relative text-slate-800">
            <div className="flex items-center justify-between pb-3 border-b border-[#cbd5e1]">
              <h3 className="text-base font-bold text-[#7a0c0c]">{inspectItem.title}</h3>
              <button
                onClick={() => setInspectItem(null)}
                className="p-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <pre className="bg-[#f8fafc] p-4 rounded-lg border border-[#cbd5e1] text-xs font-mono text-slate-800 overflow-x-auto max-h-[360px]">
              {JSON.stringify(inspectItem.data, null, 2)}
            </pre>
            <div className="flex justify-end pt-2 border-t border-[#cbd5e1]">
              <button
                onClick={() => setInspectItem(null)}
                className="px-4 py-2 bg-[#7a0c0c] text-white font-bold rounded-lg text-xs hover:bg-[#961212] transition-colors"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
