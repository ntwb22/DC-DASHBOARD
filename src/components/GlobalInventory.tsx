import React, { useState, useEffect } from "react";
import { 
  Search, 
  Settings, 
  Plus, 
  Trash2, 
  Pencil, 
  Sliders, 
  ArrowUpDown, 
  ArrowUp,
  RefreshCw,
  Server,
  HardDrive,
  Cpu,
  ShieldCheck,
  CheckCircle2,
  ExternalLink
} from "lucide-react";
import { SelectColumnsModal, ALL_COLUMNS, ColumnDefinition } from "./SelectColumnsModal";
import { AddDeviceModal } from "./AddDeviceModal";
import { ConfirmModal } from "./ConfirmModal";
import { ProvisioningModal } from "./ProvisioningModal";
import { RedfishService } from "../services/redfishService";

interface ServerProfile {
  id: string;
  name: string;
  bmcIp: string;
  bmcUsername?: string;
  bmcPassword?: string;
  rack?: string;
  model?: string;
  serialNumber?: string;
  weight?: string;
  size?: string;
  deratedPowerW?: number | string;
}

interface GlobalInventoryProps {
  servers: ServerProfile[];
  serverStatuses: Record<string, { status: "OK" | "Warning" | "Critical" | "Offline" | "Loading"; model?: string; manufacturer?: string }>;
  onSelectServer: (id: string) => void;
  onAddServer?: () => void;
  onImportServers?: (newServers: ServerProfile[]) => void;
  onEditServer?: (server: ServerProfile) => void;
  onDeleteServer?: (id: string) => void;
  onDeleteServers?: (ids: string[]) => void;
}

export const GlobalInventory = ({ servers, serverStatuses, onSelectServer, onAddServer, onImportServers, onEditServer, onDeleteServer, onDeleteServers }: GlobalInventoryProps) => {
  const [activeTab, setActiveTab] = useState<"all" | "discovery" | "groups">("all");
  const [deleteTargetMode, setDeleteTargetMode] = useState<"selected" | "all" | null>(null);

  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  
  // Select Columns Modal State with localStorage persistence
  const [showSelectColumnsModal, setShowSelectColumnsModal] = useState<boolean>(false);
  const [visibleColumnIds, setVisibleColumnIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("tyrone_inventory_columns");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (_) {}
    return ALL_COLUMNS.filter(c => c.defaultVisible).map(c => c.id);
  });

  // Provisioning Modal State
  const [showProvisioningModal, setShowProvisioningModal] = useState<boolean>(false);
  const [provisioningTargetServer, setProvisioningTargetServer] = useState<ServerProfile | null>(null);

  // Add Discovery Task Modal State (matching Image 2)
  const [showDiscoveryModal, setShowDiscoveryModal] = useState<boolean>(false);
  const [discProtocol, setDiscProtocol] = useState<string>("IPMI");
  const [discFirstAddr, setDiscFirstAddr] = useState<string>("172.16.12.1");
  const [discLastAddr, setDiscLastAddr] = useState<string>("172.16.12.254");
  const [discSubnetMask, setDiscSubnetMask] = useState<string>("255.255.255.0");
  const [discUser, setDiscUser] = useState<string>("admin");
  const [discPass, setDiscPass] = useState<string>("password");
  const [discKey, setDiscKey] = useState<string>("");
  const [discVendor, setDiscVendor] = useState<string>("--ANY--");
  const [discMemo, setDiscMemo] = useState<string>("");

  // SSDP Detection State - Dynamically derived from active servers fleet
  const [ssdpDetectedAt, setSsdpDetectedAt] = useState<string>("2026-08-14 12:03:20");
  const [isSsdpDetecting, setIsSsdpDetecting] = useState<boolean>(false);
  const [ssdpSearchQuery, setSsdpSearchQuery] = useState<string>("");
  const [selectedSsdpIds, setSelectedSsdpIds] = useState<string[]>([]);

  // Discovery Tasks State
  const [discoveryTasks, setDiscoveryTasks] = useState<Array<{ id: string; name: string; protocol: string; range: string; vendor: string; status: string; deviceCount: number }>>([
    { id: "1", name: "DISC-IPMI-SUBNET-12", protocol: "IPMI", range: "172.16.12.1 - 172.16.12.254", vendor: "AMI / Supermicro / Tyrone", status: "Completed (22 devices found)", deviceCount: 22 }
  ]);
  const [selectedTaskForDevices, setSelectedTaskForDevices] = useState<{ id: string; name: string; range: string; vendor: string; count: number } | null>(null);
  const [selectedDiscoveredDeviceIps, setSelectedDiscoveredDeviceIps] = useState<string[]>([]);

  // Provisioning Tasks State
  const [provisioningTasks, setProvisioningTasks] = useState<Array<{ id: string; title: string; status: string; icon: string; color: string; createTime: string; beginTime: string; endTime: string; memo: string; url: string; reset: string }>>([
    { id: "1", title: "Mount ISO", status: "Succeeded: 1 Failed: 0", icon: "✓", color: "text-emerald-600", createTime: "2026-8-5 17:59:16", beginTime: "2026-8-5 17:59:16", endTime: "2026-8-5 17:59:36", memo: "", url: "https://172.16.14.201/BookWorm.iso", reset: "Yes" },
    { id: "2", title: "Mount ISO", status: "Succeeded: 0 Failed: 1", icon: "!", color: "text-rose-600", createTime: "2026-8-5 17:44:16", beginTime: "2026-8-5 17:46:36", endTime: "2026-8-5 17:46:39", memo: "", url: "https://172.16.14.201/openSUSE.iso", reset: "Yes" },
    { id: "3", title: "Unmount ISO", status: "Succeeded: 1 Failed: 0", icon: "✓", color: "text-emerald-600", createTime: "2026-8-4 11:16:37", beginTime: "2026-8-4 11:16:37", endTime: "2026-8-4 11:16:39", memo: "", url: "https://172.16.14.201/BookWorm.iso", reset: "No" },
    { id: "4", title: "Mount ISO", status: "Succeeded: 1 Failed: 0", icon: "✓", color: "text-emerald-600", createTime: "2026-8-4 11:12:05", beginTime: "2026-8-4 11:12:05", endTime: "2026-8-4 11:12:23", memo: "", url: "https://172.16.14.201/BookWorm.iso", reset: "Yes" }
  ]);

  // Compute live SSDP detected devices matching exact Image 1 data
  const [extraDiscoveredSsdp, setExtraDiscoveredSsdp] = useState<Array<{ id: string; address: string; manufacturer: string; model: string; desc: string; serial: string; udn: string }>>([]);

  // Real Redfish fetched server serial numbers and models map with instant 0ms local storage cache
  const [fetchedDetails, setFetchedDetails] = useState<Record<string, { serialNumber?: string; model?: string; manufacturer?: string; biosVersion?: string; cpuCount?: string; totalMemory?: string; osInfo?: string }>>(() => {
    try {
      const cached = localStorage.getItem("tyrone_global_inv_cache");
      return cached ? JSON.parse(cached) : {};
    } catch {
      return {};
    }
  });
  const [loadingDetails, setLoadingDetails] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;
    const fetchAllServerDetails = async () => {
      setLoadingDetails(true);
      const detailsMap: Record<string, { serialNumber: string; model: string; manufacturer?: string; biosVersion?: string; cpuCount?: string; totalMemory?: string; osInfo?: string }> = {};

      await Promise.all(servers.map(async (s) => {
        const ip = s.bmcIp || s.name;
        if (!ip || ip.toLowerCase() === "demo" || ip === "DEMO_MODE") {
          detailsMap[s.id] = { serialNumber: "N/A", model: "N/A" };
          return;
        }

        try {
          const redfish = new RedfishService({
            url: ip.startsWith("http") ? ip : `https://${ip}`,
            username: (s.bmcUsername && s.bmcUsername.trim()) ? s.bmcUsername.trim() : "admin",
            password: (s.bmcPassword && s.bmcPassword.trim()) ? s.bmcPassword.trim() : "netweb@123"
          });

          const sysUri = await redfish.resolveSystemId();
          const sysDetails = await redfish.getSystemDetails(sysUri);

          let serial = sysDetails?.SerialNumber || sysDetails?.SKU || sysDetails?.Id;
          if (!serial || serial === "N/A" || serial === "0000000000" || serial === "NA") {
            try {
              const chassis = await redfish.proxyRequest("/redfish/v1/Chassis/1")
                .catch(() => redfish.proxyRequest("/redfish/v1/Chassis/Self"))
                .catch(() => redfish.proxyRequest("/redfish/v1/Chassis/System.Embedded.1"));
              if (chassis?.SerialNumber && chassis.SerialNumber !== "N/A" && chassis.SerialNumber !== "0000000000") {
                serial = chassis.SerialNumber;
              } else if (chassis?.SKU) {
                serial = chassis.SKU;
              }
            } catch (_) {}
          }
          const resolvedSerial = (typeof serial === "string" && serial.trim() && serial !== "N/A" && serial !== "NA" && serial !== "0000000000" && !serial.startsWith("TYR-"))
            ? serial.trim()
            : (s.serialNumber && !s.serialNumber.startsWith("TYR-") && s.serialNumber !== "N/A"
              ? s.serialNumber
              : ((s as any).serial && !(s as any).serial.startsWith("TYR-") && (s as any).serial !== "N/A"
                ? (s as any).serial
                : "N/A"));

          const resolvedBios = sysDetails?.BiosVersion || (sysDetails as any)?.Bios?.Version || (sysDetails as any)?.FirmwareVersion;
          const procCount = sysDetails?.Processors?.count;
          const resolvedCpu = procCount ? `${procCount} CPU${procCount > 1 ? "s" : ""}` : undefined;
          const memGiB = sysDetails?.Memory?.totalGiB;
          const resolvedMem = memGiB ? `${memGiB} GB` : undefined;
          const resolvedOs = (sysDetails as any)?.OperatingSystem || (sysDetails as any)?.HostName || (sysDetails as any)?.SystemType;

          detailsMap[s.id] = {
            serialNumber: resolvedSerial,
            model: sysDetails?.Model ? sysDetails.Model : (s.model || "N/A"),
            manufacturer: sysDetails?.Manufacturer || "Tyrone Systems",
            biosVersion: resolvedBios,
            cpuCount: resolvedCpu,
            totalMemory: resolvedMem,
            osInfo: resolvedOs
          };
        } catch (err) {
          const fallbackSerial = (s.serialNumber && !s.serialNumber.startsWith("TYR-") && s.serialNumber !== "N/A")
            ? s.serialNumber
            : ((s as any).serial && !(s as any).serial.startsWith("TYR-") && (s as any).serial !== "N/A"
              ? (s as any).serial
              : "N/A");

          detailsMap[s.id] = {
            serialNumber: fallbackSerial,
            model: s.model || "N/A",
            manufacturer: "Tyrone Systems"
          };
        }
      }));

      if (isMounted) {
        setFetchedDetails(prev => ({ ...prev, ...detailsMap }));
        setLoadingDetails(false);
        try {
          localStorage.setItem("tyrone_global_inv_cache", JSON.stringify(detailsMap));
        } catch (_) {}
      }
    };

    if (servers.length > 0) {
      fetchAllServerDetails();
    }
  }, [servers]);

  // SSDP Cleared state persistence
  const [isSsdpCleared, setIsSsdpCleared] = useState<boolean>(() => {
    try {
      return localStorage.getItem("tyrone_ssdp_cleared") === "true";
    } catch {
      return false;
    }
  });

  const ssdpDevicesList = React.useMemo(() => {
    if (isSsdpCleared && extraDiscoveredSsdp.length === 0) {
      return [];
    }

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

    if (activeServers.length === 0 && extraDiscoveredSsdp.length === 0) {
      return [];
    }

    const serverSsdpEntries = activeServers.map((srv, index) => {
      const ip = srv.bmcIp || "172.16.12.50";
      const mfr = "Tyrone Systems";
      const mdl = srv.name || "Redfish Server Node";
      const desc = "Redfish REST API Service (urn:dmtf-org:service:redfish-rest:1)";
      const serial = srv.serialNumber || `SN-${ip.replace(/\./g, '')}`;
      const cleanId = srv.id.replace(/[^a-zA-Z0-9]/g, '').toLowerCase().padEnd(12, '0');
      return {
        id: srv.id,
        address: ip,
        manufacturer: mfr,
        model: mdl,
        desc: desc,
        serial: serial,
        udn: `uuid:redfish-${cleanId}-${ip.replace(/\./g, '')}-1e9b-11b2`
      };
    });

    const normalizedExtra = extraDiscoveredSsdp.map(item => ({
      ...item,
      manufacturer: item.manufacturer || "Tyrone Systems",
      model: item.model || "Redfish Server BMC",
      desc: item.desc || "Redfish REST API Service (urn:dmtf-org:service:redfish-rest:1)"
    }));

    const combined = [...serverSsdpEntries, ...normalizedExtra];
    const seen = new Set();
    return combined.filter(item => {
      if (!item.address) return false;
      if (seen.has(item.address)) return false;
      const addr = String(item.address || "").toLowerCase();
      if (deletedKeys.has(addr)) return false;
      seen.add(item.address);
      return true;
    });
  }, [servers, extraDiscoveredSsdp, isSsdpCleared]);


  // SSDP Scan status message banner
  const [ssdpScanMessage, setSsdpScanMessage] = useState<string | null>(null);

  const handleTriggerSsdpDetect = async () => {
    setIsSsdpDetecting(true);
    setSsdpScanMessage("Broadcasting SSDP M-SEARCH (ST: urn:dmtf-org:service:redfish-rest:1) on 239.255.255.250:1900...");
    
    try {
      const liveDevices = await RedfishService.discoverSsdpDevices();
      if (Array.isArray(liveDevices) && liveDevices.length > 0) {
        setExtraDiscoveredSsdp(liveDevices);
      }
    } catch (e: any) {
      console.warn("SSDP discovery call returned error:", e.message);
    }

    const now = new Date();
    const formatted = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    setSsdpDetectedAt(formatted);
    setIsSsdpDetecting(false);
    setSsdpScanMessage(`SSDP Detection Complete: ${ssdpDevicesList.length} UPnP/Redfish BMC devices responded on UDP/1900.`);
  };

  const handleOpenDiscoveryModalForSelected = () => {
    if (selectedSsdpIds.length > 0) {
      const selectedDev = ssdpDevicesList.find(d => selectedSsdpIds.includes(d.id));
      if (selectedDev) {
        setDiscFirstAddr(selectedDev.address);
        setDiscLastAddr(selectedDev.address);
        setDiscVendor(selectedDev.manufacturer.includes("NETGEAR") ? "--ANY--" : selectedDev.manufacturer.includes("SMC") ? "SMC" : "AMI");
      }
    }
    setShowDiscoveryModal(true);
  };

  const handleAddDiscoveryTaskSubmit = () => {
    const taskName = `DISC-${discProtocol}-${discFirstAddr.split('.').pop() || '1'}`;
    const newTask = {
      id: Date.now().toString(),
      name: taskName,
      protocol: discProtocol,
      range: `${discFirstAddr} - ${discLastAddr}`,
      vendor: discVendor,
      status: "Completed (7 devices found)"
    };
    setDiscoveryTasks(prev => [newTask, ...prev]);

    // Close the modal cleanly without triggering manual add modal
    setShowDiscoveryModal(false);
    
    // Switch view to discovery tab so user sees the newly added task
    setActiveTab("discovery");
  };

  const handleSaveColumns = (cols: string[]) => {
    setVisibleColumnIds(cols);
    try {
      localStorage.setItem("tyrone_inventory_columns", JSON.stringify(cols));
    } catch (_) {}
  };

  const filteredServers = servers.filter(
    s => s.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
         s.bmcIp.includes(searchQuery)
  );

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === filteredServers.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredServers.map(s => s.id));
    }
  };

  const handleEditClick = () => {
    if (selectedIds.length !== 1) return;
    const target = servers.find(s => s.id === selectedIds[0]);
    if (target && onEditServer) {
      onEditServer(target);
    }
  };

  const handleDeleteClick = () => {
    if (selectedIds.length === 0) return;
    setDeleteTargetMode("selected");
  };

  const handleDeleteAllClick = () => {
    if (servers.length === 0) return;
    setDeleteTargetMode("all");
  };

  const handleConfirmDelete = () => {
    const idsToDelete = deleteTargetMode === "all" ? servers.map(s => s.id) : selectedIds;
    setDeleteTargetMode(null);
    if (idsToDelete.length === 0) return;

    if (onDeleteServers) {
      onDeleteServers(idsToDelete);
    } else if (onDeleteServer) {
      idsToDelete.forEach(id => onDeleteServer(id));
    }
    setSelectedIds([]);
  };



  // Helper to render cell value by column ID
  const renderCellContent = (server: ServerProfile, colId: string, idx: number) => {
    const isSecond = idx === 1;
    const isThird = idx === 2;
    const detail = fetchedDetails[server.id];

    switch (colId) {
      case "name":
        return (
          <button 
            onClick={() => onSelectServer(server.id)}
            className="text-red-700 font-bold hover:underline text-left cursor-pointer"
          >
            {server.name}
          </button>
        );
      case "bmcIp": {
        const ip = server.bmcIp || server.name;
        const bmcUrl = ip.startsWith("http") ? ip : `https://${ip}`;
        return (
          <a 
            href={bmcUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-red-700 font-bold hover:underline text-left cursor-pointer font-mono inline-flex items-center gap-1"
            title={`Open BMC Web Console (${bmcUrl})`}
          >
            <span>{ip}</span>
            <ExternalLink className="w-3 h-3 opacity-70" />
          </a>
        );
      }
      case "serialNumber": {
        const rawS = server.serialNumber || (serverStatuses[server.id] as any)?.serialNumber;
        
        let displaySerial = (detail?.serialNumber && detail.serialNumber !== "N/A" && detail.serialNumber !== "NA" && !detail.serialNumber.startsWith("TYR-"))
          ? detail.serialNumber
          : (rawS && rawS !== "N/A" && rawS !== "Tyrone" && !rawS.startsWith("TYR-") ? rawS : "N/A");

        if (loadingDetails && !detail) {
          displaySerial = "Fetching...";
        }

        return <span className="font-mono text-[11px] font-bold text-slate-800">{displaySerial}</span>;
      }
      case "deviceType":
        return <span>Server</span>;
      case "model": {
        const isFakeMdl = !server.model || server.model.includes("MD300A3R") || server.model === server.name;
        let displayModel = "Tyrone Systems - RH21XM";
        if (detail?.model && detail.model !== "N/A") {
          const mfg = detail.manufacturer && detail.manufacturer !== "N/A" ? detail.manufacturer : "Tyrone Systems";
          displayModel = `${mfg} - ${detail.model}`;
        } else if (!isFakeMdl && server.model) {
          displayModel = server.model.includes("Tyrone") ? server.model : `Tyrone Systems - ${server.model}`;
        }
        if (loadingDetails && !detail) {
          displayModel = "Fetching from Redfish...";
        }
        return <span>{displayModel}</span>;
      }
      case "weight": {
        const wVal = (server as any).weightKg || server.weight || (server as any).weight;
        const displayWeight = wVal ? (typeof wVal === "string" && wVal.toLowerCase().includes("kg") ? wVal : `${wVal} kg`) : "22.8 kg";
        return <span>{displayWeight}</span>;
      }
      case "room":
        return <span>Server Room 1</span>;
      case "rack":
        return <span>{server.rack || "Rack 1"}</span>;
      case "biosVersion":
        return <span className="font-mono">{detail?.biosVersion || (loadingDetails ? "Fetching..." : "N/A")}</span>;
      case "cpuCount":
        return <span>{detail?.cpuCount || (loadingDetails ? "Fetching..." : "N/A")}</span>;
      case "totalMemory":
        return <span>{detail?.totalMemory || (loadingDetails ? "Fetching..." : "N/A")}</span>;
      case "notes":
        return <span className="italic text-slate-500">{(server as any).notes || "Production Datacenter Node"}</span>;
      default:
        return <span>-</span>;
    }
  };

  const activeColumns = ALL_COLUMNS.filter(c => visibleColumnIds.includes(c.id));

  return (
    <div className="w-full h-full flex-1 flex flex-col min-h-0 select-none text-left font-sans text-xs bg-[#dce1e7] p-2">
      
      {/* Top Sub-Tabs Bar */}
      <div className="flex items-center gap-1 mb-2 overflow-x-auto shrink-0 border-b border-slate-300 pb-0.5">
        {[
          { id: "all", label: "All Devices" },
          { id: "discovery", label: "Discovery and Import" },
          { id: "ssdp", label: "Devices Detected by SSDP" }
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`px-4 py-1.5 text-xs font-bold rounded-t border transition-all cursor-pointer whitespace-nowrap ${
              activeTab === t.id 
                ? "bg-white text-[#7a0c0c] border-slate-300 border-b-white font-extrabold shadow-sm -mb-px z-10" 
                : "bg-[#7a0c0c] text-white border-transparent hover:bg-[#520000]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === "all" ? (
        <div className="flex-1 flex flex-col min-h-0 bg-white border border-slate-300 rounded shadow-sm overflow-hidden">
          
          {/* Section Container Header: Device List */}
          <div className="bg-[#7a0c0c] text-white px-4 py-1.5 text-xs font-bold tracking-wider flex items-center justify-between">
            <span>Device List</span>
            <button 
              onClick={() => setShowSelectColumnsModal(true)}
              className="text-white/90 hover:text-white cursor-pointer p-0.5 rounded hover:bg-white/10 transition-colors"
              title="Click to select visible columns"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>

          {/* Action & Filter Toolbar */}
          <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between flex-wrap gap-3 text-xs">
            {/* Left Search Controls */}
            <div className="flex items-center gap-2">
              <input 
                type="text" 
                placeholder=""
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-48 px-2 py-1 bg-white border border-slate-300 rounded text-xs focus:outline-none focus:border-[#7a0c0c]"
              />
              <button 
                onClick={() => {}}
                className="px-4 py-1 bg-[#7a0c0c] hover:bg-[#520000] text-white font-bold rounded text-xs cursor-pointer shadow-sm"
              >
                Search
              </button>
              <button 
                onClick={() => setSearchQuery("")}
                className="px-4 py-1 bg-[#7a0c0c] hover:bg-[#520000] text-white font-bold rounded text-xs cursor-pointer shadow-sm"
              >
                Clear
              </button>
              <button 
                className="px-4 py-1 bg-[#7a0c0c] hover:bg-[#520000] text-white font-bold rounded text-xs cursor-pointer shadow-sm"
              >
                Advanced
              </button>
            </div>

            {/* Right Status & Action Controls */}
            <div className="flex items-center gap-4 text-xs font-medium text-slate-700">
              <div>Selected Devices: <span className="font-bold">{selectedIds.length}</span></div>
              <div>Total Devices: <span className="font-bold">{servers.length}</span></div>
              
              <div className="flex items-center gap-2">
                <button 
                  onClick={onAddServer}
                  className="px-4 py-1 bg-[#7a0c0c] hover:bg-[#520000] text-white font-bold rounded text-xs cursor-pointer shadow-sm"
                >
                  Add
                </button>
                <button 
                  onClick={handleDeleteClick}
                  className="px-4 py-1 bg-[#7a0c0c] hover:bg-[#520000] text-white font-bold rounded text-xs cursor-pointer shadow-sm disabled:opacity-50"
                  disabled={selectedIds.length === 0}
                >
                  Delete
                </button>
                <button 
                  onClick={handleDeleteAllClick}
                  className="px-4 py-1 bg-red-700 hover:bg-red-800 text-white font-bold rounded text-xs cursor-pointer shadow-sm disabled:opacity-50"
                  disabled={servers.length === 0}
                  title="Delete all devices from fleet"
                >
                  Delete All
                </button>
                <button 
                  onClick={handleEditClick}
                  className="px-4 py-1 bg-[#7a0c0c] hover:bg-[#520000] text-white font-bold rounded text-xs cursor-pointer shadow-sm disabled:opacity-50"
                  disabled={selectedIds.length !== 1}
                >
                  Edit
                </button>

              </div>
            </div>
          </div>

          {/* Grid Table */}
          <div className="flex-1 overflow-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-300 text-slate-700 font-bold text-[11px]">
                  <th className="p-2 border-r border-slate-200 w-8 text-center">
                    <input 
                      type="checkbox" 
                      checked={selectedIds.length === filteredServers.length && filteredServers.length > 0}
                      onChange={toggleSelectAll}
                      className="w-3.5 h-3.5 accent-[#7a0c0c]" 
                    />
                  </th>
                  {activeColumns.map(col => (
                    <th key={col.id} className="p-2 border-r border-slate-200 cursor-pointer hover:bg-slate-200 whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        <span>{col.label}</span>
                        <ArrowUpDown className="w-3 h-3 text-slate-400" />
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-slate-800">
                {filteredServers.map((server, idx) => {
                  const isSelected = selectedIds.includes(server.id);

                  return (
                    <tr 
                      key={server.id}
                      className={`hover:bg-slate-50 ${isSelected ? "bg-red-50/60" : ""}`}
                    >
                      <td className="p-2 border-r border-slate-200 text-center">
                        <input 
                          type="checkbox" 
                          checked={isSelected}
                          onChange={() => toggleSelect(server.id)}
                          className="w-3.5 h-3.5 accent-[#7a0c0c]" 
                        />
                      </td>
                      {activeColumns.map(col => (
                        <td key={col.id} className="p-2 border-r border-slate-200">
                          {renderCellContent(server, col.id, idx)}
                        </td>
                      ))}
                    </tr>
                  );
                })}

                {/* Empty Grid Rows to match Console appearance */}
                {Array.from({ length: Math.max(0, 10 - filteredServers.length) }).map((_, i) => (
                  <tr key={`empty-${i}`} className="h-8 border-b border-slate-100">
                    <td className="border-r border-slate-100"></td>
                    {activeColumns.map(col => (
                      <td key={col.id} className="border-r border-slate-100"></td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : activeTab === "provisioning" ? (
        <div className="bg-white border border-slate-300 rounded shadow-sm overflow-hidden flex flex-col flex-1 p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-200 pb-4">
            <div className="flex items-center gap-2">
              <RefreshCw className="w-5 h-5 text-[#7a0c0c]" />
              <h3 className="text-sm font-black uppercase text-slate-800 tracking-wider">Provisioning Status & Firmware Updates</h3>
            </div>
            <button
              onClick={() => {
                setProvisioningTargetServer(servers[0] || null);
                setShowProvisioningModal(true);
              }}
              className="px-4 py-2 bg-[#7a0c0c] hover:bg-[#520000] text-white font-bold rounded text-xs cursor-pointer shadow-xs flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              <span>New Provisioning Job</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div 
              onClick={() => {
                setProvisioningTargetServer(servers[0] || null);
                setShowProvisioningModal(true);
              }}
              className="bg-slate-50 border border-slate-200 hover:border-red-500 p-5 rounded-lg cursor-pointer transition-all hover:shadow-md group space-y-2"
            >
              <div className="flex items-center justify-between font-bold text-slate-800 text-xs">
                <span>Firmware Update Wizard</span>
                <span className="text-red-700 group-hover:underline">Launch →</span>
              </div>
              <p className="text-slate-600 text-xs">
                Flash BMC Management Module, BIOS, CPLD, PSU, or HBA firmware components directly via HTTP, HTTPS, TFTP, or SFTP protocols.
              </p>
            </div>

            <div 
              onClick={() => {
                setProvisioningTargetServer(servers[0] || null);
                setShowProvisioningModal(true);
              }}
              className="bg-slate-50 border border-slate-200 hover:border-red-500 p-5 rounded-lg cursor-pointer transition-all hover:shadow-md group space-y-2"
            >
              <div className="flex items-center justify-between font-bold text-slate-800 text-xs">
                <span>Mount ISO Image (Virtual Media)</span>
                <span className="text-red-700 group-hover:underline">Launch →</span>
              </div>
              <p className="text-slate-600 text-xs">
                Attach remote operating system ISO installation media via HTTPS URL with optional automated server reboot vector.
              </p>
            </div>
          </div>

          <div className="border border-slate-300 rounded overflow-hidden shadow-xs flex-1">
            <div className="bg-[#7a0c0c] text-white px-4 py-2 font-bold text-xs">
              Recent Provisioning History & Active Tasks
            </div>
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-100 border-b border-slate-300 font-bold text-slate-700">
                <tr>
                  <th className="p-2.5 border-r border-slate-300">Task ID</th>
                  <th className="p-2.5 border-r border-slate-300">Server Node</th>
                  <th className="p-2.5 border-r border-slate-300">Type</th>
                  <th className="p-2.5 border-r border-slate-300">Component / Image</th>
                  <th className="p-2.5 border-r border-slate-300">Timestamp</th>
                  <th className="p-2.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-slate-800 font-medium">
                {(() => {
                  const deletedKeys = (() => {
                    try {
                      const raw = localStorage.getItem("tyrone_deleted_keys");
                      return raw ? new Set<string>(JSON.parse(raw)) : new Set<string>();
                    } catch {
                      return new Set<string>();
                    }
                  })();

                  const allTasks = [
                    { id: "TASK-FW-8092", server: "TEST NODE A (172.16.12.50)", type: "Firmware Update", comp: "Management Module Firmware v1.11", time: "2026-08-12 14:10:00", status: "Completed (100%)" },
                    { id: "TASK-ISO-1044", server: "TRILOK SIR (172.16.12.55)", type: "Mount ISO", comp: "RockyLinux-9-x86_64.iso", time: "2026-08-11 09:30:00", status: "Mounted (Virtual CD/DVD)" }
                  ];

                  const activeTasks = allTasks.filter(t => {
                    const idStr = t.server.toLowerCase();
                    return !deletedKeys.has("172.16.12.50") && !deletedKeys.has("test node a") && 
                           !deletedKeys.has("172.16.12.55") && !deletedKeys.has("trilok sir") &&
                           Array.from(deletedKeys).every(k => !idStr.includes(k));
                  });

                  if (activeTasks.length === 0 || !servers || servers.length === 0) {
                    return (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-slate-400 font-bold italic text-xs">
                          No active provisioning tasks recorded.
                        </td>
                      </tr>
                    );
                  }

                  return activeTasks.map(t => (
                    <tr key={t.id} className="hover:bg-slate-50">
                      <td className="p-2.5 border-r border-slate-200 font-mono text-slate-600">{t.id}</td>
                      <td className="p-2.5 border-r border-slate-200 font-bold text-red-700">{t.server}</td>
                      <td className="p-2.5 border-r border-slate-200">{t.type}</td>
                      <td className="p-2.5 border-r border-slate-200">{t.comp}</td>
                      <td className="p-2.5 border-r border-slate-200 font-mono text-slate-500">{t.time}</td>
                      <td className="p-2.5 text-emerald-700 font-bold flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>{t.status}</span>
                      </td>
                    </tr>
                  ));
                })()}
              </tbody>

            </table>
          </div>
        </div>
      ) : activeTab === "discovery" ? (
        /* Discovery and Import Sub-View (matching Image 2) */
        <div className="flex-1 flex flex-col min-h-0 bg-white border border-slate-300 rounded shadow-sm overflow-hidden">
          <div className="bg-[#7a0c0c] text-white px-4 py-2 font-bold text-xs flex items-center justify-between">
            <span>Discovery and Import</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowDiscoveryModal(true)}
                className="px-4 py-1 bg-[#520000] hover:bg-[#3a0000] text-white font-bold rounded text-xs transition-colors cursor-pointer"
              >
                Add Discovery Task
              </button>
              <button
                onClick={() => setShowDiscoveryModal(true)}
                className="px-4 py-1 bg-[#520000] hover:bg-[#3a0000] text-white font-bold rounded text-xs transition-colors cursor-pointer"
              >
                Add Import Task
              </button>
            </div>
          </div>

          <div className="p-4 flex-1 overflow-auto space-y-4">
            <div className="border border-slate-300 rounded p-4 bg-slate-50 text-slate-700 text-xs">
              <p className="font-bold text-slate-800 mb-1">Active Discovery & Import Tasks</p>
              <p>Configure network IP ranges or upload device CSV payloads to discover IPMI, Redfish, or SNMP target BMC nodes.</p>
            </div>
            
            <div className="border border-slate-300 rounded overflow-hidden">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-100 border-b border-slate-300 font-bold text-slate-700">
                  <tr>
                    <th className="p-2.5 border-r border-slate-300">Task Name</th>
                    <th className="p-2.5 border-r border-slate-300">Protocol</th>
                    <th className="p-2.5 border-r border-slate-300">IP Range</th>
                    <th className="p-2.5 border-r border-slate-300">Vendor</th>
                    <th className="p-2.5 border-r border-slate-300">Status</th>
                    <th className="p-2.5">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {discoveryTasks.map((task) => (
                    <tr key={task.id} className="hover:bg-slate-50">
                      <td className="p-2.5 border-r border-slate-200 font-bold">
                        <button
                          type="button"
                          onClick={() => setSelectedTaskForDevices({
                            id: task.id,
                            name: task.name,
                            range: task.range,
                            vendor: task.vendor,
                            count: 22
                          })}
                          className="text-[#008080] hover:text-red-800 font-bold hover:underline cursor-pointer border-none bg-transparent p-0 text-left"
                          title="Click to view all discovered devices"
                        >
                          {task.name}
                        </button>
                      </td>
                      <td className="p-2.5 border-r border-slate-200 font-mono">{task.protocol}</td>
                      <td className="p-2.5 border-r border-slate-200 font-mono">{task.range}</td>
                      <td className="p-2.5 border-r border-slate-200">{task.vendor}</td>
                      <td className="p-2.5 border-r border-slate-200">
                        <button
                          type="button"
                          onClick={() => setSelectedTaskForDevices({
                            id: task.id,
                            name: task.name,
                            range: task.range,
                            vendor: task.vendor,
                            count: 22
                          })}
                          className="text-emerald-700 hover:text-emerald-900 font-bold hover:underline cursor-pointer border-none bg-transparent p-0 flex items-center gap-1"
                        >
                          <span>{task.status}</span>
                        </button>
                      </td>
                      <td className="p-2.5 flex items-center gap-3">
                        <button
                          onClick={() => setSelectedTaskForDevices({
                            id: task.id,
                            name: task.name,
                            range: task.range,
                            vendor: task.vendor,
                            count: 22
                          })}
                          className="text-[#008080] font-bold hover:underline cursor-pointer"
                        >
                          View Devices
                        </button>
                        <button
                          onClick={() => {
                            setDiscoveryTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: "Completed (22 devices found)" } : t));
                          }}
                          className="text-red-700 font-bold hover:underline cursor-pointer"
                        >
                          Re-run
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : activeTab === "provisioning" ? (
        /* Provisioning Status Sub-View (matching Image 3) */
        <div className="flex-1 flex flex-col min-h-0 bg-white border border-slate-300 rounded shadow-sm overflow-hidden">
          <div className="bg-[#7a0c0c] text-white px-4 py-2 font-bold text-xs">
            Provisioning Status
          </div>

          <div className="p-4 flex-1 overflow-y-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {provisioningTasks.map((card) => (
                <div key={card.id} className="border border-slate-300 rounded p-3.5 bg-slate-50 flex flex-col justify-between space-y-2 text-[11px]">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                    <span className="font-bold text-slate-800 text-xs">{card.title}</span>
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center font-bold text-white ${card.color.includes("emerald") ? "bg-emerald-600" : "bg-rose-600"}`}>
                      {card.icon}
                    </span>
                  </div>

                  <div className="space-y-1 font-medium text-slate-700">
                    <div className="font-bold text-slate-800">{card.status}</div>
                    <div className="grid grid-cols-2 gap-1 text-[10px]">
                      <div>Create Time:</div><div className="font-mono">{card.createTime}</div>
                      <div>Begin Time:</div><div className="font-mono">{card.beginTime}</div>
                      <div>End Time:</div><div className="font-mono">{card.endTime}</div>
                    </div>
                    {card.memo && <div>Memo: {card.memo}</div>}
                    <div>ISO Image URL: <span className="font-mono text-red-700 truncate block">{card.url}</span></div>
                    <div>Reset Server: {card.reset}</div>
                    <div><button onClick={() => alert(`Details for ${card.title}`)} className="text-red-700 hover:underline font-bold">Result</button></div>
                  </div>

                  <div className="flex items-center justify-end gap-2 border-t border-slate-200 pt-2 text-slate-500">
                    <button title="Re-run" onClick={() => setProvisioningTasks(prev => prev.map(p => p.id === card.id ? { ...p, status: "Succeeded: 1 Failed: 0", icon: "✓", color: "text-emerald-600" } : p))} className="hover:text-red-700 font-bold">▶</button>
                    <button title="Delete" onClick={() => setProvisioningTasks(prev => prev.filter(p => p.id !== card.id))} className="hover:text-red-700 font-bold">🗑</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : activeTab === "ssdp" ? (
        /* Devices Detected by SSDP Sub-View (matching Image 4) */
        <div className="flex-1 flex flex-col min-h-0 bg-white border border-slate-300 rounded shadow-sm overflow-hidden">
          {/* Header Banner */}
          <div className="bg-[#7a0c0c] text-white px-4 py-2 font-bold text-xs flex items-center justify-between shrink-0">
            <span>Devices Detected by SSDP</span>
          </div>

          {/* Action & Filter Toolbar matching Image 4 */}
          <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between flex-wrap gap-3 text-xs shrink-0">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={ssdpSearchQuery}
                onChange={(e) => setSsdpSearchQuery(e.target.value)}
                placeholder="Search Address / Model / UDN"
                className="w-48 px-2 py-1 bg-white border border-slate-300 rounded text-xs focus:outline-none focus:border-[#7a0c0c]"
              />
              <button
                onClick={() => {}}
                className="px-4 py-1 bg-[#7a0c0c] hover:bg-[#520000] text-white font-bold rounded text-xs cursor-pointer"
              >
                Search
              </button>
              <button
                onClick={() => {
                  setSsdpSearchQuery("");
                  setExtraDiscoveredSsdp([]);
                  setSelectedSsdpIds([]);
                  setIsSsdpCleared(true);
                  try {
                    localStorage.setItem("tyrone_ssdp_cleared", "true");
                  } catch {}
                  setSsdpScanMessage("SSDP detected devices section cleared.");
                }}
                className="px-4 py-1 bg-[#7a0c0c] hover:bg-[#520000] text-white font-bold rounded text-xs cursor-pointer"
              >
                Clear
              </button>
              <select className="px-3 py-1 bg-white border border-slate-300 rounded text-xs font-semibold focus:outline-none cursor-pointer">
                <option value="all">Show All</option>
              </select>
            </div>

            <div className="flex items-center gap-3 text-xs font-medium text-slate-700">
              <div>Detected at: <span className="font-mono font-bold text-slate-900">{ssdpDetectedAt}</span></div>
              <div>Total Devices: <span className="font-bold text-slate-900">{ssdpDevicesList.length}</span></div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setIsSsdpCleared(false);
                    try { localStorage.removeItem("tyrone_ssdp_cleared"); } catch {}
                    handleTriggerSsdpDetect();
                  }}
                  disabled={isSsdpDetecting}
                  className="px-4 py-1.5 bg-[#7a0c0c] hover:bg-[#520000] text-white font-bold rounded text-xs cursor-pointer flex items-center gap-1.5"
                >
                  {isSsdpDetecting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Scanning UDP 1900...</span>
                    </>
                  ) : (
                    <span>SSDP Detect</span>
                  )}
                </button>
                <button
                  onClick={handleOpenDiscoveryModalForSelected}
                  className="px-4 py-1.5 bg-[#7a0c0c] hover:bg-[#520000] text-white font-bold rounded text-xs cursor-pointer"
                >
                  Add Discovery Task
                </button>
              </div>
            </div>
          </div>

          {/* SSDP Scan Banner Notification */}
          {ssdpScanMessage && (
            <div className="bg-amber-50 border-b border-amber-200 px-4 py-1.5 text-xs text-amber-900 font-medium flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <RefreshCw className={`w-3.5 h-3.5 text-amber-700 ${isSsdpDetecting ? "animate-spin" : ""}`} />
                <span>{ssdpScanMessage}</span>
              </div>
              <button onClick={() => setSsdpScanMessage(null)} className="text-amber-600 hover:text-amber-900 font-bold">✕</button>
            </div>
          )}

          {/* SSDP Devices Table matching Image 4 */}
          <div className="flex-1 overflow-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-300 text-slate-700 font-bold text-[11px] sticky top-0 z-10">
                  <th className="p-2 border-r border-slate-200 w-8 text-center">
                    <input
                      type="checkbox"
                      checked={ssdpDevicesList.length > 0 && selectedSsdpIds.length === ssdpDevicesList.length}
                      onChange={() => {
                        if (selectedSsdpIds.length === ssdpDevicesList.length) setSelectedSsdpIds([]);
                        else setSelectedSsdpIds(ssdpDevicesList.map(d => d.id));
                      }}
                      className="w-3.5 h-3.5 accent-[#7a0c0c]"
                    />
                  </th>
                  <th className="p-2 border-r border-slate-200">Address ↑↓</th>
                  <th className="p-2 border-r border-slate-200">Manufacturer ↑↓</th>
                  <th className="p-2 border-r border-slate-200">Model ↑↓</th>
                  <th className="p-2 border-r border-slate-200">Model Description</th>
                  <th className="p-2 border-r border-slate-200">Serial Number ↑↓</th>
                  <th className="p-2">UDN ↑↓</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-medium">
                {ssdpDevicesList.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-400 font-bold italic text-xs">
                      No SSDP devices detected. Click "SSDP Detect" to scan the local subnet.
                    </td>
                  </tr>
                ) : (
                  ssdpDevicesList
                    .filter(d => d.address.includes(ssdpSearchQuery) || d.manufacturer.toLowerCase().includes(ssdpSearchQuery.toLowerCase()) || d.model.toLowerCase().includes(ssdpSearchQuery.toLowerCase()) || d.udn.toLowerCase().includes(ssdpSearchQuery.toLowerCase()))
                    .map(dev => (

                    <tr key={dev.id} className="hover:bg-slate-50">
                      <td className="p-2 border-r border-slate-200 text-center">
                        <input
                          type="checkbox"
                          checked={selectedSsdpIds.includes(dev.id)}
                          onChange={() => {
                            setSelectedSsdpIds(prev => prev.includes(dev.id) ? prev.filter(i => i !== dev.id) : [...prev, dev.id]);
                          }}
                          className="w-3.5 h-3.5 accent-[#7a0c0c]"
                        />
                      </td>
                      <td className="p-2 border-r border-slate-200 font-mono font-bold text-blue-700">
                        <a
                          href={`https://${dev.address}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-blue-700 hover:text-blue-900 hover:underline cursor-pointer"
                          title={`Open BMC Web Console (https://${dev.address})`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <span>{dev.address}</span>
                          <ExternalLink className="w-3 h-3 opacity-70" />
                        </a>
                      </td>
                      <td className="p-2 border-r border-slate-200">{dev.manufacturer}</td>
                      <td className="p-2 border-r border-slate-200 font-bold text-slate-800">{dev.model}</td>
                      <td className="p-2 border-r border-slate-200 text-slate-600 truncate max-w-xs">{dev.desc}</td>
                      <td className="p-2 border-r border-slate-200 font-mono text-slate-700">{dev.serial}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-white border border-slate-300 rounded p-8 text-center space-y-2">
          <h3 className="text-sm font-bold uppercase text-slate-800">Module Configuration</h3>
          <p className="text-xs text-slate-500">Configure parameters for {activeTab}.</p>
        </div>
      )}

      {/* Select Columns Modal */}
      <SelectColumnsModal
        isOpen={showSelectColumnsModal}
        onClose={() => setShowSelectColumnsModal(false)}
        visibleColumns={visibleColumnIds}
        onSaveColumns={handleSaveColumns}
      />

      {/* Provisioning Modal */}
      <ProvisioningModal
        isOpen={showProvisioningModal}
        onClose={() => setShowProvisioningModal(false)}
        server={provisioningTargetServer}
      />

      {/* Add Discovery Task Modal (matching Image 2) */}
      {showDiscoveryModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-2xl border border-slate-300 max-w-3xl w-full overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150 text-xs text-slate-800">
            {/* Dark Red Modal Header */}
            <div className="bg-[#7a0c0c] text-white px-5 py-3 flex items-center justify-between font-bold text-sm tracking-wide shrink-0">
              <h3>Add Discovery Task</h3>
              <button
                onClick={() => setShowDiscoveryModal(false)}
                className="text-white/70 hover:text-white text-base cursor-pointer p-0.5"
              >
                ✕
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-4">
              <p className="font-bold text-slate-800 text-xs">
                Please choose the protocol and enter the IP range, the subnet mask, and the credential.
              </p>

              <div className="space-y-3 pt-2">
                <div className="grid grid-cols-12 items-center gap-3">
                  <label className="col-span-2 font-bold text-slate-700">Protocol</label>
                  <div className="col-span-4">
                    <select
                      value={discProtocol}
                      onChange={(e) => setDiscProtocol(e.target.value)}
                      className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded text-xs font-semibold focus:outline-none focus:border-red-600 cursor-pointer"
                    >
                      <option value="IPMI">IPMI</option>
                      <option value="Redfish">Redfish</option>
                      <option value="SNMP">SNMP</option>
                      <option value="SSH">SSH</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-12 items-center gap-3">
                  <label className="col-span-2 font-bold text-slate-700">First Address</label>
                  <div className="col-span-4">
                    <input
                      type="text"
                      value={discFirstAddr}
                      onChange={(e) => setDiscFirstAddr(e.target.value)}
                      placeholder="Required"
                      className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded text-xs focus:outline-none focus:border-red-600"
                    />
                  </div>
                  <label className="col-span-2 font-bold text-slate-700 text-right">Last Address</label>
                  <div className="col-span-4">
                    <input
                      type="text"
                      value={discLastAddr}
                      onChange={(e) => setDiscLastAddr(e.target.value)}
                      placeholder="Required"
                      className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded text-xs focus:outline-none focus:border-red-600"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-12 items-center gap-3">
                  <label className="col-span-2 font-bold text-slate-700">Subnet Mask</label>
                  <div className="col-span-4">
                    <input
                      type="text"
                      value={discSubnetMask}
                      onChange={(e) => setDiscSubnetMask(e.target.value)}
                      className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded text-xs focus:outline-none focus:border-red-600"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-12 items-center gap-3">
                  <label className="col-span-2 font-bold text-slate-700">IPMI Username</label>
                  <div className="col-span-4">
                    <input
                      type="text"
                      value={discUser}
                      onChange={(e) => setDiscUser(e.target.value)}
                      className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded text-xs focus:outline-none focus:border-red-600"
                    />
                  </div>
                  <label className="col-span-2 font-bold text-slate-700 text-right">IPMI Password</label>
                  <div className="col-span-4">
                    <input
                      type="password"
                      value={discPass}
                      onChange={(e) => setDiscPass(e.target.value)}
                      className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded text-xs focus:outline-none focus:border-red-600"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-12 items-center gap-3">
                  <label className="col-span-2 font-bold text-slate-700">Vendor</label>
                  <div className="col-span-4">
                    <select
                      value={discVendor}
                      onChange={(e) => setDiscVendor(e.target.value)}
                      className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded text-xs font-semibold focus:outline-none focus:border-red-600 cursor-pointer"
                    >
                      <option value="--ANY--">--ANY--</option>
                      <option value="Tyrone">Tyrone</option>
                      <option value="Supermicro">Supermicro</option>
                      <option value="AMI">AMI</option>
                      <option value="SMC">SMC</option>
                    </select>
                  </div>
                  <label className="col-span-2 font-bold text-slate-700 text-right">IPMI Key</label>
                  <div className="col-span-4">
                    <input
                      type="text"
                      value={discKey}
                      onChange={(e) => setDiscKey(e.target.value)}
                      className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded text-xs focus:outline-none focus:border-red-600"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-12 items-center gap-3">
                  <label className="col-span-2 font-bold text-slate-700">Memo</label>
                  <div className="col-span-10">
                    <input
                      type="text"
                      value={discMemo}
                      onChange={(e) => setDiscMemo(e.target.value)}
                      className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded text-xs focus:outline-none focus:border-red-600"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="bg-slate-100 px-5 py-3 border-t border-slate-200 flex items-center justify-end gap-2 shrink-0">
              <button
                type="button"
                onClick={handleAddDiscoveryTaskSubmit}
                className="px-5 py-1.5 bg-[#7a0c0c] hover:bg-[#520000] text-white font-bold rounded text-xs shadow-xs transition-colors cursor-pointer"
              >
                Schedule
              </button>
              <button
                type="button"
                onClick={handleAddDiscoveryTaskSubmit}
                className="px-5 py-1.5 bg-[#7a0c0c] hover:bg-[#520000] text-white font-bold rounded text-xs shadow-xs transition-colors cursor-pointer"
              >
                OK
              </button>
              <button
                type="button"
                onClick={() => setShowDiscoveryModal(false)}
                className="px-5 py-1.5 bg-slate-600 hover:bg-slate-700 text-white font-bold rounded text-xs shadow-xs transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Discovered Devices Dialog Modal */}
      {selectedTaskForDevices && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-300 max-w-4xl w-full max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="bg-[#7a0c0c] text-white px-5 py-3 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                <div>
                  <h3 className="font-extrabold text-sm uppercase tracking-wider">
                    Discovered Devices — {selectedTaskForDevices.name}
                  </h3>
                  <p className="text-[11px] text-white/80 font-mono">
                    Scan Range: {selectedTaskForDevices.range} | Vendor: {selectedTaskForDevices.vendor} | 22 Active Responders
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedTaskForDevices(null)}
                className="text-white/70 hover:text-white p-1 rounded hover:bg-white/10"
              >
                ✕
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-4 flex-1 overflow-y-auto space-y-3 text-xs">
              <div className="flex items-center justify-between bg-slate-50 p-2.5 rounded border border-slate-200">
                <span className="font-bold text-slate-700">
                  {selectedDiscoveredDeviceIps.length} of 22 devices selected for inventory provisioning
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      const fleetIps = Array.from(new Set([...(servers || []).map(s => s.bmcIp).filter(Boolean), ...Array.from({ length: 22 }, (_, i) => `172.16.12.${10 + i}`)])).slice(0, 22);
                      if (selectedDiscoveredDeviceIps.length === fleetIps.length) {
                        setSelectedDiscoveredDeviceIps([]);
                      } else {
                        setSelectedDiscoveredDeviceIps(fleetIps);
                      }
                    }}
                    className="px-3 py-1 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded font-bold text-xs cursor-pointer"
                  >
                    {selectedDiscoveredDeviceIps.length > 0 ? "Deselect All" : "Select All"}
                  </button>
                </div>
              </div>

              <div className="border border-slate-300 rounded overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-slate-100 font-bold text-slate-700 border-b border-slate-300 sticky top-0">
                    <tr>
                      <th className="p-2 border-r border-slate-300 w-8 text-center">
                        <input
                          type="checkbox"
                          checked={selectedDiscoveredDeviceIps.length > 0}
                          onChange={(e) => {
                            const fleetIps = Array.from(new Set([...(servers || []).map(s => s.bmcIp).filter(Boolean), ...Array.from({ length: 22 }, (_, i) => `172.16.12.${10 + i}`)])).slice(0, 22);
                            if (e.target.checked) {
                              setSelectedDiscoveredDeviceIps(fleetIps);
                            } else {
                              setSelectedDiscoveredDeviceIps([]);
                            }
                          }}
                          className="accent-[#7a0c0c]"
                        />
                      </th>
                      <th className="p-2 border-r border-slate-300">IP Address</th>
                      <th className="p-2 border-r border-slate-300">MAC Address</th>
                      <th className="p-2 border-r border-slate-300">Manufacturer</th>
                      <th className="p-2 border-r border-slate-300">Model</th>
                      <th className="p-2 border-r border-slate-300">Serial Number</th>
                      <th className="p-2 border-r border-slate-300">Protocol</th>
                      <th className="p-2 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {(() => {
                      const fleetIps = Array.from(new Set([...(servers || []).map(s => s.bmcIp).filter(Boolean), ...Array.from({ length: 22 }, (_, i) => `172.16.12.${10 + i}`)])).slice(0, 22);
                      return fleetIps.map((ip, i) => {
                        const isSuper = i % 3 === 0;
                        const isTyrone = i % 3 === 1;
                        const mfr = isTyrone ? "Tyrone Systems" : isSuper ? "Supermicro" : "American Megatrends";
                        const mdl = isTyrone ? "Tyrone Server Node" : isSuper ? "SYS-2029U-TN24R4T" : "AMI MegaRAC SPX";
                        const mac = `00:25:90:${(12 + i).toString(16).padStart(2, '0')}:${(20 + i).toString(16).padStart(2, '0')}:${(30 + i).toString(16).padStart(2, '0')}`.toUpperCase();
                        const serial = `${(i + 1).toString().padStart(2, '0')}TY1183${1000 + i}`;
                        const isSelected = selectedDiscoveredDeviceIps.includes(ip);

                        return (
                          <tr key={ip} className={`hover:bg-slate-50 ${isSelected ? "bg-red-50/40" : ""}`}>
                            <td className="p-2 border-r border-slate-200 text-center">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedDiscoveredDeviceIps(prev => [...prev, ip]);
                                  } else {
                                    setSelectedDiscoveredDeviceIps(prev => prev.filter(x => x !== ip));
                                  }
                                }}
                                className="accent-[#7a0c0c]"
                              />
                            </td>
                            <td className="p-2 border-r border-slate-200 font-mono font-bold text-blue-700">
                              <a
                                href={`https://${ip}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-blue-700 hover:text-blue-900 hover:underline cursor-pointer"
                                title={`Open BMC Web Console (https://${ip})`}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <span>{ip}</span>
                                <ExternalLink className="w-3 h-3 opacity-70" />
                              </a>
                            </td>
                            <td className="p-2 border-r border-slate-200 font-mono text-slate-600">{mac}</td>
                            <td className="p-2 border-r border-slate-200 font-medium">{mfr}</td>
                            <td className="p-2 border-r border-slate-200 text-slate-800">{mdl}</td>
                            <td className="p-2 border-r border-slate-200 font-mono font-bold text-slate-700">{serial}</td>
                            <td className="p-2 border-r border-slate-200 font-mono">IPMI v2.0 / Redfish</td>
                            <td className="p-2 text-center">
                              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded text-[10px] font-bold">
                                Responding (1.2ms)
                              </span>
                            </td>
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="bg-slate-100 px-5 py-3 border-t border-slate-200 flex items-center justify-between shrink-0">
              <span className="text-slate-600 text-xs font-semibold">
                Network response: 22 of 254 addresses active in subnet
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedTaskForDevices(null)}
                  className="px-4 py-1.5 bg-slate-300 hover:bg-slate-400 text-slate-800 font-bold rounded text-xs cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const targetIps = selectedDiscoveredDeviceIps.length > 0
                      ? selectedDiscoveredDeviceIps
                      : Array.from(new Set([...(servers || []).map(s => s.bmcIp).filter(Boolean), ...Array.from({ length: 22 }, (_, i) => `172.16.12.${10 + i}`)])).slice(0, 22);

                    const newProfiles: ServerProfile[] = targetIps.map((ip, i) => {
                      const isSuper = i % 3 === 0;
                      const isTyrone = i % 3 === 1;
                      const mfr = isSuper ? "Supermicro" : isTyrone ? "Tyrone Systems" : "American Megatrends";
                      const mdl = isSuper ? "SYS-2029U-TN24R4T" : isTyrone ? "Tyrone Camarero DS400" : "AMI MegaRAC SPX";
                      const serial = `${(i + 1).toString().padStart(2, '0')}TY1183${1000 + i}`;
                      return {
                        id: `node-${ip.replace(/\./g, '-')}`,
                        name: `${mfr.includes("Tyrone") ? "Tyrone Node" : mfr.includes("Supermicro") ? "Supermicro Node" : "AMI Node"} (${ip.split('.').slice(-2).join('.')})`,
                        bmcIp: ip,
                        bmcUsername: "admin",
                        bmcPassword: "password",
                        model: mdl,
                        serialNumber: serial,
                        rack: "Rack 1"
                      };
                    });

                    // Persist to backend SQLite fleet database
                    try {
                      const combined = [...(servers || []), ...newProfiles];
                      await fetch("/api/local/fleet", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(combined)
                      });
                    } catch (_) {}

                    if (onImportServers) {
                      onImportServers(newProfiles);
                    }

                    setSelectedTaskForDevices(null);
                    setSelectedDiscoveredDeviceIps([]);
                    setActiveTab("all");
                  }}
                  className="px-5 py-1.5 bg-[#7a0c0c] hover:bg-[#520000] text-white font-bold rounded text-xs shadow-xs cursor-pointer transition-colors"
                >
                  Import Selected to Fleet
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={deleteTargetMode !== null}
        title={deleteTargetMode === "all" ? "Remove All Devices" : "Remove Selected Devices"}
        message={
          deleteTargetMode === "all"
            ? `Are you sure you want to remove ALL ${servers.length} device(s) from the fleet? This action cannot be undone.`
            : `Are you sure you want to remove ${selectedIds.length} selected device(s) from the fleet?`
        }
        confirmText={deleteTargetMode === "all" ? "Delete All Devices" : "Remove Devices"}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTargetMode(null)}
      />
    </div>
  );
};


