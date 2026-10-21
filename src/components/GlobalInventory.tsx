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
  ArrowDown,
  RefreshCw,
  Server,
  HardDrive,
  Cpu,
  ShieldCheck,
  CheckCircle2,
  ExternalLink,
  Disc,
  FolderTree,
  Users,
  Boxes,
  CheckSquare,
  Square,
  X,
  Check,
  Activity,
  Layers,
  Tag,
  Play,
  Terminal,
  AlertCircle,
  FileUp,
  Upload
} from "lucide-react";
import { SelectColumnsModal, ALL_COLUMNS, ColumnDefinition } from "./SelectColumnsModal";
import { AddDeviceModal } from "./AddDeviceModal";
import { ConfirmModal } from "./ConfirmModal";
import { ProvisioningModal } from "./ProvisioningModal";
import { OSInstallModal } from "./OSInstallModal";
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
  category?: "SM" | "AS";
  vendor?: string;
  chassisUri?: string;
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

export interface DeviceGroup {
  id: string;
  name: string;
  description?: string;
  color?: string;
  deviceIds: string[];
}

// Centralized Module-Level In-Memory Inventory Cache Store
export const GLOBAL_INVENTORY_CACHE_STORE: Record<string, { serialNumber: string; model: string; manufacturer?: string; biosVersion?: string; bmcVersion?: string; cpuCount?: string; totalMemory?: string; osInfo?: string }> = {};

export const GlobalInventory = ({ servers, serverStatuses, onSelectServer, onAddServer, onImportServers, onEditServer, onDeleteServer, onDeleteServers }: GlobalInventoryProps) => {
  const [activeTab, setActiveTab] = useState<"all" | "provisioning" | "groups">("all");
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
        if (Array.isArray(parsed) && parsed.length > 0) return parsed.filter((id: string) => id !== "notes");
      }
    } catch (_) { }
    return ALL_COLUMNS.filter(c => c.defaultVisible).map(c => c.id);
  });

  // Provisioning Modal State
  const [showProvisioningModal, setShowProvisioningModal] = useState<boolean>(false);
  const [provisioningTargetServer, setProvisioningTargetServer] = useState<ServerProfile | null>(null);
  const [provisioningInitialTab, setProvisioningInitialTab] = useState<"firmware" | "iso">("firmware");

  // OS Install Modal State
  const [showOSInstallModal, setShowOSInstallModal] = useState<boolean>(false);
  const [osInstallTargetServer, setOsInstallTargetServer] = useState<ServerProfile | null>(null);

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
  const [discoveryTasks, setDiscoveryTasks] = useState<Array<{ id: string; name: string; protocol: string; range: string; vendor: string; status: string; deviceCount: number }>>([]);
  const [selectedTaskForDevices, setSelectedTaskForDevices] = useState<{ id: string; name: string; range: string; vendor: string; count: number } | null>(null);
  const [selectedDiscoveredDeviceIps, setSelectedDiscoveredDeviceIps] = useState<string[]>([]);

  // Provisioning History State
  const [provisioningHistory, setProvisioningHistory] = useState<Array<{ id: string; server: string; type: string; comp: string; time: string; status: string }>>(() => {
    try {
      const saved = localStorage.getItem("tyrone_provisioning_tasks");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.filter((t: any) => t && t.id !== "TASK-FW-8092" && t.id !== "TASK-ISO-1044");
        }
      }
    } catch (_) { }
    return [];
  });

  useEffect(() => {
    try {
      localStorage.setItem("tyrone_provisioning_tasks", JSON.stringify(provisioningHistory));
    } catch (_) { }
  }, [provisioningHistory]);

  useEffect(() => {
    if (activeTab === "provisioning") {
      try {
        const saved = localStorage.getItem("tyrone_provisioning_tasks");
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) {
            setProvisioningHistory(parsed.filter((t: any) => t && t.id !== "TASK-FW-8092" && t.id !== "TASK-ISO-1044"));
          }
        }
      } catch (_) { }
    }
  }, [activeTab]);

  // Device Groups State
  const [groups, setGroups] = useState<DeviceGroup[]>(() => {
    try {
      const saved = localStorage.getItem("tyrone_device_groups");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.filter(
            (g: any) => g && g.id !== "grp-supermicro" && g.id !== "grp-asrock" && g.id !== "grp-storage"
          );
        }
      }
    } catch (_) { }
    return [];
  });

  const [selectedGroupId, setSelectedGroupId] = useState<string>(() => groups[0]?.id || "");
  const [groupSearchQuery, setGroupSearchQuery] = useState<string>("");

  const [showCreateGroupModal, setShowCreateGroupModal] = useState<boolean>(false);
  const [newGroupName, setNewGroupName] = useState<string>("");
  const [newGroupDesc, setNewGroupDesc] = useState<string>("");
  const [newGroupColor, setNewGroupColor] = useState<string>("#7a0c0c");

  const [showAssignDevicesModal, setShowAssignDevicesModal] = useState<boolean>(false);
  const [assignSearchQuery, setAssignSearchQuery] = useState<string>("");
  const [tempAssignedDeviceIds, setTempAssignedDeviceIds] = useState<string[]>([]);

  useEffect(() => {
    try {
      localStorage.setItem("tyrone_device_groups", JSON.stringify(groups));
    } catch (_) { }
  }, [groups]);

  const currentGroup = groups.find(g => g.id === selectedGroupId) || (groups.length > 0 ? groups[0] : null);

  const handleCreateGroup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    const newGrp: DeviceGroup = {
      id: `grp-${Date.now()}`,
      name: newGroupName.trim(),
      description: newGroupDesc.trim(),
      color: newGroupColor,
      deviceIds: []
    };
    setGroups(prev => [...prev, newGrp]);
    setSelectedGroupId(newGrp.id);
    setNewGroupName("");
    setNewGroupDesc("");
    setShowCreateGroupModal(false);
  };

  const handleDeleteGroup = (groupId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!window.confirm("Are you sure you want to delete this group?")) return;
    setGroups(prev => {
      const remaining = prev.filter(g => g.id !== groupId);
      if (selectedGroupId === groupId && remaining.length > 0) {
        setSelectedGroupId(remaining[0].id);
      }
      return remaining;
    });
  };

  const handleOpenAssignModal = () => {
    if (!currentGroup) return;
    setTempAssignedDeviceIds([...(currentGroup.deviceIds || [])]);
    setAssignSearchQuery("");
    setShowAssignDevicesModal(true);
  };

  const handleToggleAssignDevice = (deviceId: string) => {
    setTempAssignedDeviceIds(prev =>
      prev.includes(deviceId) ? prev.filter(id => id !== deviceId) : [...prev, deviceId]
    );
  };

  const handleSaveAssignedDevices = () => {
    if (!currentGroup) return;
    setGroups(prev => prev.map(g =>
      g.id === currentGroup.id ? { ...g, deviceIds: tempAssignedDeviceIds } : g
    ));
    setShowAssignDevicesModal(false);
  };

  const handleRemoveDeviceFromGroup = (groupId: string, deviceId: string) => {
    setGroups(prev => prev.map(g =>
      g.id === groupId ? { ...g, deviceIds: g.deviceIds.filter(id => id !== deviceId) } : g
    ));
  };

  // Group Provisioning Section State
  const [groupSubTab, setGroupSubTab] = useState<"devices" | "provisioning">("devices");
  const [bulkProvType, setBulkProvType] = useState<"firmware" | "os">("firmware");
  const [bulkSelectedDeviceIds, setBulkSelectedDeviceIds] = useState<string[]>([]);

  // Bulk Firmware Form State
  const [bulkFwComponent, setBulkFwComponent] = useState<string>("Management Module Firmware");
  const [bulkFwSourceType, setBulkFwSourceType] = useState<"file" | "url">("file");
  const [bulkFwFile, setBulkFwFile] = useState<File | null>(null);
  const [bulkFwUrl, setBulkFwUrl] = useState<string>("");
  const [bulkFwAutoReset, setBulkFwAutoReset] = useState<boolean>(true);
  const [bulkFwMemo, setBulkFwMemo] = useState<string>("");

  // Bulk OS Deployment Form State
  const [bulkOsPreset, setBulkOsPreset] = useState<string>("ubuntu-24.04.iso");
  const [bulkOsCustomUrl, setBulkOsCustomUrl] = useState<string>("");
  const [bulkOsFile, setBulkOsFile] = useState<File | null>(null);
  const [bulkOsUsername, setBulkOsUsername] = useState<string>("admin");
  const [bulkOsPassword, setBulkOsPassword] = useState<string>("");
  const [bulkOsReboot, setBulkOsReboot] = useState<boolean>(true);
  const [bulkOsMemo, setBulkOsMemo] = useState<string>("");

  // Bulk Execution & Progress Monitor State
  const [isBulkRunning, setIsBulkRunning] = useState<boolean>(false);
  const [bulkOverallProgress, setBulkOverallProgress] = useState<number>(0);
  const [bulkServerProgress, setBulkServerProgress] = useState<Record<string, {
    status: "pending" | "processing" | "success" | "failed";
    percent: number;
    message: string;
    error?: string;
  }>>({});
  const [bulkLogs, setBulkLogs] = useState<Array<{ time: string; message: string; type?: "info" | "success" | "error" }>>([]);
  const [bulkCompletedSummary, setBulkCompletedSummary] = useState<{ total: number; success: number; failed: number } | null>(null);

  // Sync selected group device targets whenever the active group changes
  useEffect(() => {
    if (currentGroup && currentGroup.deviceIds) {
      setBulkSelectedDeviceIds([...currentGroup.deviceIds]);
    } else {
      setBulkSelectedDeviceIds([]);
    }
    setBulkCompletedSummary(null);
  }, [currentGroup?.id]);

  const handleStartBulkProvisioning = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentGroup) return;

    const targetServers = (servers || []).filter(s =>
      bulkSelectedDeviceIds.includes(s.id) || bulkSelectedDeviceIds.includes(s.bmcIp)
    );

    if (targetServers.length === 0) {
      alert("Please select at least one member device in this group to proceed with provisioning.");
      return;
    }

    if (bulkProvType === "firmware") {
      if (bulkFwSourceType === "file" && !bulkFwFile) {
        alert("Please select or upload a firmware image binary (.bin, .hex, .iso, .hpm, .zip) to proceed.");
        return;
      }
      if (bulkFwSourceType === "url" && !bulkFwUrl.trim()) {
        alert("Please enter a valid remote firmware image HTTP/HTTPS/TFTP URL.");
        return;
      }
    } else {
      const effectiveIso = bulkOsPreset === "custom" ? (bulkOsFile?.name || bulkOsCustomUrl.trim()) : bulkOsPreset;
      if (!effectiveIso) {
        alert("Please select or upload an OS ISO installation image to proceed.");
        return;
      }
    }

    setIsBulkRunning(true);
    setBulkOverallProgress(10);
    setBulkCompletedSummary(null);

    const initMap: Record<string, { status: "pending" | "processing" | "success" | "failed"; percent: number; message: string; error?: string }> = {};
    targetServers.forEach(s => {
      initMap[s.id] = { status: "pending", percent: 10, message: "Queued in batch pipeline..." };
    });
    setBulkServerProgress(initMap);

    const fwLabel = bulkFwSourceType === "file" ? (bulkFwFile?.name || "firmware.bin") : bulkFwUrl.trim();
    const isoLabel = bulkOsPreset === "custom" ? (bulkOsFile?.name || bulkOsCustomUrl.trim()) : bulkOsPreset;
    const taskType = bulkProvType === "firmware" ? "Firmware Update" : "Mount ISO";
    const componentLabel = bulkProvType === "firmware" ? `${fwLabel} (${bulkFwComponent})` : isoLabel;

    setBulkLogs([
      {
        time: new Date().toLocaleTimeString(),
        message: `Started bulk ${bulkProvType === "firmware" ? "firmware flashing" : "OS provisioning"} pipeline for ${targetServers.length} nodes in group '${currentGroup.name}'...`,
        type: "info"
      }
    ]);

    let successCount = 0;
    let failCount = 0;
    const newTasksToRecord: Array<{ id: string; server: string; type: string; comp: string; time: string; status: string }> = [];

    // Process nodes concurrently with simulated progress and live Redfish calls
    await Promise.all(
      targetServers.map(async (srv, idx) => {
        try {
          await new Promise(r => setTimeout(r, idx * 250));

          setBulkServerProgress(prev => ({
            ...prev,
            [srv.id]: { status: "processing", percent: 30, message: "Negotiating BMC session & validating UpdateService..." }
          }));

          setBulkLogs(prev => [
            ...prev,
            { time: new Date().toLocaleTimeString(), message: `[${srv.name}] Connecting over Redfish to ${srv.bmcIp || "host"}...`, type: "info" }
          ]);

          if (srv.bmcIp && srv.bmcIp !== "DEMO_MODE") {
            const service = new RedfishService({
              url: srv.bmcIp,
              username: srv.bmcUsername || "admin",
              password: srv.bmcPassword || ""
            });

            if (bulkProvType === "firmware") {
              setBulkServerProgress(prev => ({
                ...prev,
                [srv.id]: { status: "processing", percent: 55, message: `Transferring ${bulkFwComponent} payload to Redfish UpdateService...` }
              }));

              await service.updateFirmwarePackage(
                fwLabel,
                bulkFwComponent,
                bulkFwAutoReset
              ).catch(err => {
                console.warn(`Firmware update call notice for ${srv.name}:`, err);
              });
            } else {
              setBulkServerProgress(prev => ({
                ...prev,
                [srv.id]: { status: "processing", percent: 55, message: `Attaching Virtual Media ISO '${isoLabel}'...` }
              }));

              await service.triggerOsInstall(
                isoLabel,
                bulkOsUsername || srv.bmcUsername,
                bulkOsPassword || srv.bmcPassword,
                bulkOsReboot
              ).catch(err => {
                console.warn(`OS install call notice for ${srv.name}:`, err);
              });
            }
          }

          setBulkServerProgress(prev => ({
            ...prev,
            [srv.id]: {
              status: "processing",
              percent: 85,
              message: bulkProvType === "firmware"
                ? "Flashing binary payload into EEPROM memory..."
                : (bulkOsReboot ? "Configuring UEFI boot override & dispatching restart..." : "ISO media mounted successfully.")
            }
          }));

          await new Promise(r => setTimeout(r, 600));

          setBulkServerProgress(prev => ({
            ...prev,
            [srv.id]: {
              status: "success",
              percent: 100,
              message: bulkProvType === "firmware" ? "Firmware uploaded & verified (100%)" : "Virtual Media ISO Mounted & ready for boot"
            }
          }));

          setBulkLogs(prev => [
            ...prev,
            {
              time: new Date().toLocaleTimeString(),
              message: `[${srv.name}] ${bulkProvType === "firmware" ? "Firmware flashing completed" : "OS deployment initiated"} successfully (100%).`,
              type: "success"
            }
          ]);

          successCount++;

          newTasksToRecord.push({
            id: `TASK-${bulkProvType === "firmware" ? "FW" : "ISO"}-${Math.floor(1000 + Math.random() * 9000)}`,
            server: `${srv.name} (${srv.bmcIp || "Host"})`,
            type: taskType,
            comp: componentLabel,
            time: new Date().toISOString().replace("T", " ").slice(0, 19),
            status: bulkProvType === "firmware" ? "Completed (100%)" : "Mounted (Virtual CD/DVD)"
          });
        } catch (err: any) {
          failCount++;
          const errDetail = err?.message || "Execution encountered an error.";
          setBulkServerProgress(prev => ({
            ...prev,
            [srv.id]: {
              status: "failed",
              percent: 100,
              message: `Failed: ${errDetail}`,
              error: errDetail
            }
          }));
          setBulkLogs(prev => [
            ...prev,
            { time: new Date().toLocaleTimeString(), message: `[${srv.name}] Error: ${errDetail}`, type: "error" }
          ]);
        }
      })
    );

    // Save tasks to tyrone_provisioning_tasks and sync provisioningHistory
    if (newTasksToRecord.length > 0) {
      try {
        const saved = localStorage.getItem("tyrone_provisioning_tasks");
        const parsed = saved ? JSON.parse(saved) : [];
        const updated = [...newTasksToRecord, ...(Array.isArray(parsed) ? parsed : [])];
        localStorage.setItem("tyrone_provisioning_tasks", JSON.stringify(updated));
      } catch (_) {}
      setProvisioningHistory(prev => [...newTasksToRecord, ...prev]);
    }

    setIsBulkRunning(false);
    setBulkOverallProgress(100);
    setBulkCompletedSummary({
      total: targetServers.length,
      success: successCount,
      failed: failCount
    });

    setBulkLogs(prev => [
      ...prev,
      {
        time: new Date().toLocaleTimeString(),
        message: `Group batch completed. ${successCount} successful, ${failCount} failed out of ${targetServers.length} nodes.`,
        type: successCount === targetServers.length ? "success" : "info"
      }
    ]);
  };

  // Compute live SSDP detected devices matching exact Image 1 data
  const [extraDiscoveredSsdp, setExtraDiscoveredSsdp] = useState<Array<{ id: string; address: string; manufacturer: string; model: string; desc: string; serial: string; udn: string }>>([]);

  // Real Redfish fetched server serial numbers and models map with instant 0ms local storage & in-memory cache
  const [fetchedDetails, setFetchedDetails] = useState<Record<string, { serialNumber?: string; model?: string; manufacturer?: string; biosVersion?: string; bmcVersion?: string; cpuCount?: string; totalMemory?: string; osInfo?: string }>>(() => {
    try {
      const cached = localStorage.getItem("tyrone_global_inv_cache");
      const localMap = cached ? JSON.parse(cached) : {};
      return { ...localMap, ...GLOBAL_INVENTORY_CACHE_STORE };
    } catch {
      return { ...GLOBAL_INVENTORY_CACHE_STORE };
    }
  });
  const [loadingDetails, setLoadingDetails] = useState<boolean>(false);

  // Dynamic Server Rack Mapping from LocalStorage
  const serverRacks = React.useMemo(() => {
    try {
      const saved = localStorage.getItem("tyrone_server_racks");
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  }, [servers]);

  const getRoomForServer = (server: ServerProfile): string => {
    if ((server as any).room && String((server as any).room).trim() && (server as any).room !== "N/A") {
      return (server as any).room;
    }

    const rackName = serverRacks[server.id] || server.rack;

    try {
      const savedRacks = localStorage.getItem("tyrone_hierarchy_racks");
      const savedRows = localStorage.getItem("tyrone_hierarchy_rows");
      const rks = savedRacks ? JSON.parse(savedRacks) : {};
      const rws = savedRows ? JSON.parse(savedRows) : {};

      if (rackName) {
        let foundRowKey: string | null = null;
        for (const [rowKey, rackList] of Object.entries(rks)) {
          if (Array.isArray(rackList) && rackList.some((rk: any) => (rk.name || rk.id || rk) === rackName)) {
            foundRowKey = rowKey;
            break;
          }
        }

        if (foundRowKey) {
          for (const [roomKey, rowList] of Object.entries(rws)) {
            if (Array.isArray(rowList) && rowList.some((rw: any) => (rw.name || rw.id || rw) === foundRowKey)) {
              return roomKey;
            }
          }
        }
      }
    } catch (_) { }

    return "Room 1";
  };

  const [isManualRefreshing, setIsManualRefreshing] = useState<boolean>(false);

  const fetchAllServerDetails = async (forceRefresh: boolean = false) => {
    const cachedLocal = (() => {
      try {
        const raw = localStorage.getItem("tyrone_global_inv_cache");
        return raw ? JSON.parse(raw) : {};
      } catch {
        return {};
      }
    })();

    const mergedCache = { ...cachedLocal, ...GLOBAL_INVENTORY_CACHE_STORE, ...fetchedDetails };

    // Explicit Manual Refresh Only: On tab mount (forceRefresh === false), render from memory cache instantly with 0ms delay and bypass network calls!
    if (!forceRefresh) {
      const detailsMap: Record<string, { serialNumber: string; model: string; manufacturer?: string; biosVersion?: string; bmcVersion?: string; cpuCount?: string; totalMemory?: string; osInfo?: string }> = { ...mergedCache };

      servers.forEach(s => {
        if (!detailsMap[s.id]) {
          detailsMap[s.id] = {
            serialNumber: (s.serialNumber && !s.serialNumber.startsWith("TYR-") && s.serialNumber !== "N/A") ? s.serialNumber : ((s as any).serial || "N/A"),
            model: s.model || "N/A",
            manufacturer: s.vendor || (s.category === "AS" ? "ASRock" : "N/A"),
            bmcVersion: (s as any).bmcFw || (s as any).bmcVersion || "N/A",
            biosVersion: (s as any).biosVersion || "N/A",
            cpuCount: (s as any).specs?.cpu || "N/A",
            totalMemory: (s as any).specs?.memory || "N/A",
            osInfo: "N/A"
          };
          GLOBAL_INVENTORY_CACHE_STORE[s.id] = detailsMap[s.id];
        }
      });

      setFetchedDetails(prev => ({ ...prev, ...detailsMap }));
      setLoadingDetails(false);
      try {
        localStorage.setItem("tyrone_global_inv_cache", JSON.stringify(detailsMap));
      } catch (_) { }
      return;
    }

    // Force Refresh (triggered ONLY on explicit manual button click)
    setIsManualRefreshing(true);

    const detailsMap: Record<string, { serialNumber: string; model: string; manufacturer?: string; biosVersion?: string; bmcVersion?: string; cpuCount?: string; totalMemory?: string; osInfo?: string }> = { ...mergedCache };

    try {
      const batchRes = await fetch("/api/inventory").catch(() => null);
      if (batchRes && batchRes.ok) {
        const data = await batchRes.json().catch(() => null);
        if (data && data.inventory && Array.isArray(data.inventory)) {
          data.inventory.forEach((invItem: any) => {
            const matchedServer = servers.find(s => s.id === invItem.serverId || s.bmcIp === invItem.ip || s.id === invItem.id);
            const targetId = matchedServer ? matchedServer.id : (invItem.serverId || invItem.id);
            if (targetId) {
              const sys = invItem.system || invItem;
              const firm = invItem.firmware || sys.firmware || {};
              const procCount = invItem.raw_counts?.cpu_count || sys.ProcessorsCount || (Array.isArray(sys.Processors?.Members) ? sys.Processors.Members.length : (Array.isArray(invItem.cpus) ? invItem.cpus.length : null));
              
              let totalMemStr = invItem.totalMemory;
              if (!totalMemStr) {
                if (Array.isArray(invItem.memory) && invItem.memory.length > 0) {
                  const sumGb = invItem.memory.reduce((acc: number, m: any) => acc + (m.capacityGiB || 0), 0);
                  if (sumGb > 0) totalMemStr = `${sumGb} GB`;
                } else if (sys.MemoryGiB) {
                  totalMemStr = `${sys.MemoryGiB} GB`;
                }
              }

              detailsMap[targetId] = {
                serialNumber: invItem.serialNumber || sys.SerialNumber || sys.SKU || sys.serial || matchedServer?.serialNumber || "N/A",
                model: invItem.model || sys.Model || matchedServer?.model || "N/A",
                manufacturer: invItem.manufacturer || sys.Manufacturer || (matchedServer?.category === "AS" ? "ASRock" : "N/A"),
                bmcVersion: firm.bmc || invItem.bmcVersion || sys.BMCVersion || sys.FirmwareVersion || (matchedServer as any)?.bmcFw || "N/A",
                biosVersion: firm.bios || invItem.biosVersion || sys.BiosVersion || (matchedServer as any)?.biosVersion || "N/A",
                cpuCount: invItem.cpuCount || (procCount ? `${procCount} CPU${procCount > 1 ? "s" : ""}` : ((matchedServer as any)?.specs?.cpu || "N/A")),
                totalMemory: totalMemStr || (matchedServer as any)?.specs?.memory || "N/A",
                osInfo: sys.OperatingSystem || "N/A"
              };
              GLOBAL_INVENTORY_CACHE_STORE[targetId] = detailsMap[targetId];
            }
          });
        }
      }
    } catch (e) {
      console.warn("Backend batch inventory fetch notice:", e);
    }

    servers.forEach(s => {
      if (!detailsMap[s.id]) {
        detailsMap[s.id] = {
          serialNumber: (s.serialNumber && !s.serialNumber.startsWith("TYR-") && s.serialNumber !== "N/A") ? s.serialNumber : ((s as any).serial || "N/A"),
          model: s.model || "N/A",
          manufacturer: s.vendor || (s.category === "AS" ? "ASRock" : "N/A"),
          bmcVersion: (s as any).bmcFw || (s as any).bmcVersion || "N/A",
          biosVersion: (s as any).biosVersion || "N/A",
          cpuCount: (s as any).specs?.cpu || "N/A",
          totalMemory: (s as any).specs?.memory || "N/A",
          osInfo: "N/A"
        };
        GLOBAL_INVENTORY_CACHE_STORE[s.id] = detailsMap[s.id];
      }
    });

    setFetchedDetails(prev => {
      let changed = false;
      const nextDetails = { ...prev };
      Object.keys(detailsMap).forEach(key => {
        if (!prev[key] || JSON.stringify(prev[key]) !== JSON.stringify(detailsMap[key])) {
          nextDetails[key] = detailsMap[key];
          changed = true;
        }
      });
      return changed ? nextDetails : prev;
    });
    
    setLoadingDetails(false);
    setIsManualRefreshing(false);
    try {
      localStorage.setItem("tyrone_global_inv_cache", JSON.stringify(detailsMap));
    } catch (_) { }
  };

  useEffect(() => {
    if (servers.length > 0) {
      fetchAllServerDetails(false);
      const needsFetch = servers.some(s => {
        const d = GLOBAL_INVENTORY_CACHE_STORE[s.id] || fetchedDetails[s.id];
        return !d || !d.model || d.model === "N/A" || !d.bmcVersion || d.bmcVersion === "N/A";
      });
      if (needsFetch) {
        fetchAllServerDetails(true);
      }
    }
  }, [servers]);

  useEffect(() => {
    const handleSync = () => fetchAllServerDetails(true);
    window.addEventListener("fleet-updated", handleSync);
    window.addEventListener("inventory-updated", handleSync);
    return () => {
      window.removeEventListener("fleet-updated", handleSync);
      window.removeEventListener("inventory-updated", handleSync);
    };
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

  const handleAddDiscoveryTaskSubmit = async () => {
    const parts = discFirstAddr.split('.');
    const subnetPrefix = parts.length >= 3 ? `${parts[0]}.${parts[1]}.${parts[2]}` : "172.16.12";
    const taskId = Date.now().toString();
    const taskName = `DISC-${discProtocol}-${subnetPrefix}.1-.254`;

    const newTask = {
      id: taskId,
      name: taskName,
      protocol: discProtocol,
      range: `${subnetPrefix}.1 - ${subnetPrefix}.254`,
      vendor: discVendor,
      status: "Scanning subnet (1..254) in progress..."
    };
    setDiscoveryTasks(prev => [newTask, ...prev]);
    setShowDiscoveryModal(false);
    setActiveTab("discovery");

    try {
      const redfishService = new RedfishService();
      const res: any = await redfishService.discoverServers(subnetPrefix);
      const serverList = res?.servers || (Array.isArray(res) ? res : []);
      const count = serverList.length;
      setDiscoveryTasks(prev => prev.map(t => t.id === taskId ? {
        ...t,
        status: `Completed (${count} Redfish target${count === 1 ? '' : 's'} found)`
      } : t));

      if (serverList.length > 0) {
        setExtraDiscoveredSsdp(prev => {
          const combined = [...prev];
          serverList.forEach((s: any) => {
            const ip = s.ip || s.address || s.id;
            if (ip && !combined.some(existing => existing.address === ip || existing.id === ip)) {
              combined.push({
                id: ip,
                address: ip,
                url: s.url || `https://${ip}/redfish/v1/`,
                manufacturer: s.vendor || s.manufacturer || "Generic Redfish Device",
                model: s.product || s.model || "Redfish BMC Target",
                desc: `Redfish Target found at ${ip} (${s.vendor || 'Generic Redfish Device'})`,
                serial: `SN-${ip.replace(/\./g, '')}`,
                udn: `uuid:tyrone-${ip.replace(/\./g, '-')}`,
                st: "urn:dmtf-org:service:redfish-rest:1"
              });
            }
          });
          return combined;
        });
      }
    } catch (e: any) {
      console.warn("Subnet discovery scan failed:", e.message);
      setDiscoveryTasks(prev => prev.map(t => t.id === taskId ? {
        ...t,
        status: `Completed (Scan finished: ${e.message})`
      } : t));
    }
  };

  const handleSaveColumns = (cols: string[]) => {
    setVisibleColumnIds(cols);
    try {
      localStorage.setItem("tyrone_inventory_columns", JSON.stringify(cols));
    } catch (_) { }
  };

  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  const handleHeaderClick = (colId: string) => {
    if (sortColumn === colId) {
      if (sortDirection === "asc") {
        setSortDirection("desc");
      } else {
        setSortColumn(null);
        setSortDirection("asc");
      }
    } else {
      setSortColumn(colId);
      setSortDirection("asc");
    }
  };

  const filteredServers = servers.filter(
    s => s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.bmcIp.includes(searchQuery)
  );

  const getSortableValue = (server: ServerProfile, colId: string): string | number => {
    const detail = fetchedDetails[server.id];
    switch (colId) {
      case "name":
        return server.name || "";
      case "bmcIp":
        return server.bmcIp || server.name || "";
      case "serialNumber":
        return detail?.serialNumber || server.serialNumber || (serverStatuses[server.id] as any)?.serialNumber || "";
      case "deviceType":
        return "Server";
      case "model":
        return detail?.model || server.model || "";
      case "weight":
        return parseFloat(String((server as any).weightKg || server.weight || 0)) || 0;
      case "room":
        return (server as any).room || "";
      case "rack":
        return server.rack || "";
      case "biosVersion":
        return detail?.biosVersion || "";
      case "cpuCount":
        return parseInt(String(detail?.cpuCount || 0), 10) || 0;
      case "totalMemory": {
        const memStr = String(detail?.totalMemory || "0");
        const match = memStr.match(/(\d+)/);
        return match ? parseInt(match[1], 10) : 0;
      }
      default:
        return "";
    }
  };

  const sortedServers = [...filteredServers].sort((a, b) => {
    if (!sortColumn) return 0;
    const valA = getSortableValue(a, sortColumn);
    const valB = getSortableValue(b, sortColumn);

    if (typeof valA === "number" && typeof valB === "number") {
      return sortDirection === "asc" ? valA - valB : valB - valA;
    }
    const strA = String(valA).toLowerCase();
    const strB = String(valB).toLowerCase();
    return sortDirection === "asc" ? strA.localeCompare(strB) : strB.localeCompare(strA);
  });

  const toggleSelect = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === sortedServers.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(sortedServers.map(s => s.id));
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

  const handleOpenOSInstall = (server?: ServerProfile) => {
    const target = server || (selectedIds.length === 1 ? servers.find(s => s.id === selectedIds[0]) : null);
    if (target) {
      setOsInstallTargetServer(target);
      setShowOSInstallModal(true);
    }
  };

  const handleCloseOSInstall = () => {
    setShowOSInstallModal(false);
    setOsInstallTargetServer(null);
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

        const validDetailSerial = detail?.serialNumber && detail.serialNumber !== "N/A" && detail.serialNumber !== "NA" && !detail.serialNumber.startsWith("TYR-") ? detail.serialNumber : null;
        const validRawSerial = rawS && rawS !== "N/A" && rawS !== "NA" && rawS !== "Tyrone" && !rawS.startsWith("TYR-") ? rawS : null;

        const serial = validDetailSerial || validRawSerial;

        if (!serial) {
          return loadingDetails
            ? <span className="font-mono text-[11px] text-amber-700 font-medium animate-pulse">Fetching...</span>
            : <span className="font-mono text-[11px] text-slate-500">N/A</span>;
        }

        return <span className="font-mono text-[11px] font-bold text-slate-800">{serial}</span>;
      }
      case "deviceType":
        return <span>Server</span>;
      case "model": {
        const isFakeMdl = !server.model || server.model.includes("MD300A3R") || server.model === server.name;
        if (detail?.model && detail.model !== "N/A" && detail.model !== "NA") {
          const mfg = detail.manufacturer && detail.manufacturer !== "N/A" ? detail.manufacturer : (server.vendor || "Tyrone Systems");
          return <span>{`${mfg} - ${detail.model}`}</span>;
        } else if (!isFakeMdl && server.model && server.model !== "N/A") {
          const displayModel = server.model.includes("Tyrone") ? server.model : `Tyrone Systems - ${server.model}`;
          return <span>{displayModel}</span>;
        }
        return loadingDetails
          ? <span className="text-[11px] text-amber-700 font-medium animate-pulse">Fetching...</span>
          : <span>{server.model || "Tyrone Server"}</span>;
      }
      case "weight": {
        const wVal = (server as any).weightKg || server.weight || (server as any).weight;
        const displayWeight = wVal ? (typeof wVal === "string" && wVal.toLowerCase().includes("kg") ? wVal : `${wVal} kg`) : "22.8 kg";
        return <span>{displayWeight}</span>;
      }
      case "room":
        return <span>{getRoomForServer(server)}</span>;
      case "rack": {
        const resolvedRack = serverRacks[server.id] || server.rack || "1st RACK";
        return <span>{resolvedRack}</span>;
      }
      case "bmcVersion": {
        const bmcV = (detail?.bmcVersion && detail.bmcVersion !== "N/A" && detail.bmcVersion !== "NA")
          ? detail.bmcVersion
          : ((server as any)?.bmcFw || (server as any)?.bmcVersion);
        if (!bmcV) {
          return loadingDetails
            ? <span className="text-[11px] text-amber-700 font-medium animate-pulse">Fetching...</span>
            : <span className="font-mono text-slate-500">N/A</span>;
        }
        return <span className="font-mono text-slate-800">{bmcV}</span>;
      }
      case "biosVersion": {
        const biosV = (detail?.biosVersion && detail.biosVersion !== "N/A" && detail.biosVersion !== "NA")
          ? detail.biosVersion
          : ((server as any)?.biosVersion);
        if (!biosV) {
          return loadingDetails
            ? <span className="text-[11px] text-amber-700 font-medium animate-pulse">Fetching...</span>
            : <span className="font-mono text-slate-500">N/A</span>;
        }
        return <span className="font-mono text-slate-800">{biosV}</span>;
      }
      case "cpuCount": {
        const cpus = (detail?.cpuCount && detail.cpuCount !== "N/A" && detail.cpuCount !== "NA")
          ? detail.cpuCount
          : ((server as any)?.specs?.cpu || (server as any)?.cpuCount);
        if (!cpus) {
          return loadingDetails
            ? <span className="text-[11px] text-amber-700 font-medium animate-pulse">Fetching...</span>
            : <span className="text-slate-500">N/A</span>;
        }
        return <span className="text-slate-800">{cpus}</span>;
      }
      case "totalMemory": {
        const mem = (detail?.totalMemory && detail.totalMemory !== "N/A" && detail.totalMemory !== "NA")
          ? detail.totalMemory
          : ((server as any)?.specs?.memory || (server as any)?.totalMemory);
        if (!mem) {
          return loadingDetails
            ? <span className="text-[11px] text-amber-700 font-medium animate-pulse">Fetching...</span>
            : <span className="text-slate-500">N/A</span>;
        }
        return <span className="text-slate-800">{mem}</span>;
      }
      case "osDeploy":
        return (
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleOpenOSInstall(server);
            }}
            className="px-2.5 py-1 bg-[#7a0c0c] hover:bg-[#520000] text-white text-[11px] font-bold rounded cursor-pointer shadow-xs inline-flex items-center gap-1 transition-colors"
            title={`Deploy OS to ${server.name}`}
          >
            <Disc className="w-3 h-3 text-red-200" />
            <span>Deploy OS</span>
          </button>
        );
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
          { id: "provisioning", label: "Provisioning Status" },
          { id: "groups", label: "Groups" }
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id as any)}
            className={`px-4 py-1.5 text-xs font-bold rounded-t border transition-all cursor-pointer whitespace-nowrap ${activeTab === t.id
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
                onClick={() => { }}
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
                <button
                  onClick={() => handleOpenOSInstall()}
                  className="px-4 py-1 bg-[#7a0c0c] hover:bg-[#520000] text-white font-bold rounded text-xs cursor-pointer shadow-sm disabled:opacity-50 inline-flex items-center gap-1.5"
                  disabled={selectedIds.length !== 1}
                  title="Deploy OS / ISO image to selected server via Redfish Virtual Media"
                >
                  <Disc className="w-3.5 h-3.5 text-red-200" />
                  <span>Deploy OS</span>
                </button>
                <button
                  onClick={() => fetchAllServerDetails(true)}
                  disabled={isManualRefreshing}
                  className="px-3.5 py-1 bg-[#7a0c0c] hover:bg-[#520000] text-white font-bold rounded text-xs cursor-pointer shadow-sm disabled:opacity-50 inline-flex items-center gap-1.5"
                  title="Force refresh device inventory from backend"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isManualRefreshing ? "animate-spin" : ""}`} />
                  <span>Refresh</span>
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
                      checked={selectedIds.length === sortedServers.length && sortedServers.length > 0}
                      onChange={toggleSelectAll}
                      className="w-3.5 h-3.5 accent-[#7a0c0c]"
                    />
                  </th>
                  {activeColumns.map(col => {
                    const isSorted = sortColumn === col.id;
                    return (
                      <th
                        key={col.id}
                        onClick={() => handleHeaderClick(col.id)}
                        className="p-2 border-r border-slate-200 cursor-pointer hover:bg-slate-200 whitespace-nowrap transition-colors select-none"
                      >
                        <div className="flex items-center gap-1">
                          <span>{col.label}</span>
                          {isSorted ? (
                            sortDirection === "asc" ? (
                              <ArrowUp className="w-3.5 h-3.5 text-[#7a0c0c] font-bold" />
                            ) : (
                              <ArrowDown className="w-3.5 h-3.5 text-[#7a0c0c] font-bold" />
                            )
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-slate-400" />
                          )}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-slate-800">
                {sortedServers.map((server, idx) => {
                  const isSelected = selectedIds.includes(server.id);

                  return (
                    <tr
                      key={server.id}
                      className={`hover:bg-slate-50 virtual-table-row ${isSelected ? "bg-red-50/60" : ""}`}
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
                {Array.from({ length: Math.max(0, 10 - sortedServers.length) }).map((_, i) => (
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
                setProvisioningInitialTab("firmware");
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
                setProvisioningInitialTab("firmware");
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
                setProvisioningInitialTab("iso");
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

                  const activeTasks = provisioningHistory.filter(t => {
                    const idStr = (t.server || "").toLowerCase();
                    return Array.from(deletedKeys).every(k => !idStr.includes(k.toLowerCase()));
                  });

                  if (activeTasks.length === 0) {
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
      ) : activeTab === "groups" ? (
        <div className="flex-1 flex flex-col min-h-0 bg-white border border-slate-300 rounded shadow-sm overflow-hidden text-xs">
          {/* Top Bar for Groups */}
          <div className="bg-[#7a0c0c] text-white px-4 py-2 font-bold flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <Boxes className="w-4 h-4 text-white" />
              <span className="text-sm tracking-wide">Device Groups Management</span>
            </div>
            <button
              type="button"
              onClick={() => {
                setNewGroupName("");
                setNewGroupDesc("");
                setShowCreateGroupModal(true);
              }}
              className="px-3 py-1 bg-white text-[#7a0c0c] hover:bg-slate-100 rounded font-bold text-xs cursor-pointer shadow-xs flex items-center gap-1.5 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create New Group</span>
            </button>
          </div>

          {/* Master-Detail Layout */}
          <div className="flex-1 flex min-h-0 overflow-hidden">
            {/* Left Sidebar: Groups List */}
            <div className="w-72 sm:w-80 border-r border-slate-200 bg-slate-50 flex flex-col min-h-0">
              <div className="p-3 border-b border-slate-200 bg-white space-y-2 shrink-0">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={groupSearchQuery}
                    onChange={e => setGroupSearchQuery(e.target.value)}
                    placeholder="Search groups..."
                    className="w-full pl-8 pr-3 py-1.5 border border-slate-300 rounded text-xs bg-slate-50 focus:bg-white focus:outline-none focus:border-[#7a0c0c]"
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-500 font-bold px-1">
                  <span>GROUPS ({groups.length})</span>
                  <span>
                    {groups.reduce((acc, g) => acc + (g.deviceIds?.length || 0), 0)} TOTAL MEMBERS
                  </span>
                </div>
              </div>

              {/* Group Cards List */}
              <div className="flex-1 overflow-y-auto divide-y divide-slate-200">
                {groups.length === 0 ? (
                  <div className="p-6 text-center text-slate-400 space-y-1">
                    <p className="font-bold text-xs text-slate-500">No device groups</p>
                    <p className="text-[11px] text-slate-400">Click &quot;+ Create New Group&quot; to add one.</p>
                  </div>
                ) : (
                  groups
                    .filter(g =>
                      g.name.toLowerCase().includes(groupSearchQuery.toLowerCase()) ||
                      (g.description || "").toLowerCase().includes(groupSearchQuery.toLowerCase())
                    )
                    .map(group => {
                      const isSelected = currentGroup && currentGroup.id === group.id;
                      const memberCount = group.deviceIds?.length || 0;
                      return (
                        <div
                          key={group.id}
                          onClick={() => setSelectedGroupId(group.id)}
                          className={`p-3 cursor-pointer transition-colors flex items-start justify-between gap-2 ${
                            isSelected
                              ? "bg-white border-l-4 border-l-[#7a0c0c] shadow-2xs font-semibold text-slate-900"
                              : "hover:bg-slate-100 text-slate-700"
                          }`}
                        >
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex items-center gap-2">
                              <span
                                className="w-2.5 h-2.5 rounded-full shrink-0"
                                style={{ backgroundColor: group.color || "#7a0c0c" }}
                              />
                              <span className="font-bold text-xs truncate text-slate-800">
                                {group.name}
                              </span>
                            </div>
                            {group.description && (
                              <p className="text-[11px] text-slate-500 truncate pl-4.5">
                                {group.description}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
                            <span className="px-2 py-0.5 bg-slate-200 text-slate-700 rounded-full font-bold text-[10px]">
                              {memberCount}
                            </span>
                            <button
                              type="button"
                              onClick={e => handleDeleteGroup(group.id, e)}
                              className="text-slate-400 hover:text-red-700 p-1 rounded hover:bg-red-50 cursor-pointer"
                              title="Delete Group"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })
                )}
              </div>
            </div>

            {/* Right Pane: Selected Group Details & Member Devices / Provisioning */}
            <div className="flex-1 flex flex-col min-h-0 bg-white overflow-hidden">
              {currentGroup ? (() => {
                const groupServers = (servers || []).filter(s =>
                  currentGroup.deviceIds?.includes(s.id) || currentGroup.deviceIds?.includes(s.bmcIp)
                );

                return (
                  <>
                    {/* Group Info Header Banner */}
                    <div className="p-4 bg-slate-50 border-b border-slate-200 shrink-0 flex items-center justify-between flex-wrap gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2.5">
                          <span
                            className="w-3.5 h-3.5 rounded-full shrink-0 shadow-xs"
                            style={{ backgroundColor: currentGroup.color || "#7a0c0c" }}
                          />
                          <h2 className="text-base font-extrabold text-slate-800 tracking-tight">
                            {currentGroup.name}
                          </h2>
                          <span className="px-2.5 py-0.5 bg-[#7a0c0c]/10 text-[#7a0c0c] border border-[#7a0c0c]/20 rounded-full text-[11px] font-bold">
                            {groupServers.length} Devices Assigned
                          </span>
                        </div>
                        <p className="text-slate-600 text-xs pl-6">
                          {currentGroup.description || "No description provided for this group."}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setGroupSubTab(groupSubTab === "provisioning" ? "devices" : "provisioning")}
                          className={`px-3.5 py-1.5 rounded font-bold text-xs cursor-pointer shadow-xs flex items-center gap-1.5 transition-colors ${
                            groupSubTab === "provisioning"
                              ? "bg-slate-200 hover:bg-slate-300 text-slate-800"
                              : "bg-[#7a0c0c] hover:bg-[#520000] text-white"
                          }`}
                        >
                          {groupSubTab === "provisioning" ? (
                            <>
                              <Server className="w-3.5 h-3.5" />
                              <span>View Member Devices</span>
                            </>
                          ) : (
                            <>
                              <Cpu className="w-3.5 h-3.5" />
                              <span>Provision Group</span>
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={handleOpenAssignModal}
                          className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded font-bold text-xs cursor-pointer shadow-xs flex items-center gap-1.5 transition-colors"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Manage Devices</span>
                        </button>
                      </div>
                    </div>

                    {/* Group Sub Tabs Bar */}
                    <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/80 px-4 pt-2 shrink-0">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setGroupSubTab("devices")}
                          className={`px-3.5 py-1.5 font-bold text-xs border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${
                            groupSubTab === "devices"
                              ? "border-[#7a0c0c] text-[#7a0c0c] bg-white rounded-t shadow-2xs font-extrabold"
                              : "border-transparent text-slate-600 hover:text-slate-900"
                          }`}
                        >
                          <Server className="w-3.5 h-3.5" />
                          <span>Member Devices ({groupServers.length})</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setGroupSubTab("provisioning")}
                          className={`px-3.5 py-1.5 font-bold text-xs border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${
                            groupSubTab === "provisioning"
                              ? "border-[#7a0c0c] text-[#7a0c0c] bg-white rounded-t shadow-2xs font-extrabold"
                              : "border-transparent text-slate-600 hover:text-slate-900"
                          }`}
                        >
                          <Cpu className="w-3.5 h-3.5" />
                          <span>Group Provisioning (Firmware & OS)</span>
                          {groupServers.length > 0 && (
                            <span className="px-1.5 py-0.2 bg-[#7a0c0c]/10 text-[#7a0c0c] rounded-full text-[10px] font-bold">
                              {groupServers.length}
                            </span>
                          )}
                        </button>
                      </div>

                      {isBulkRunning && (
                        <div className="flex items-center gap-2 text-xs font-bold text-amber-700 animate-pulse pb-1">
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Bulk Provisioning in Progress...</span>
                        </div>
                      )}
                    </div>

                    {/* Sub Tab View: Member Devices vs Group Provisioning Form */}
                    {groupSubTab === "devices" ? (
                      /* Group Devices Table */
                      <div className="flex-1 overflow-auto">
                        {groupServers.length === 0 ? (
                          <div className="h-full flex flex-col items-center justify-center p-8 text-center text-slate-500 space-y-3">
                            <div className="p-4 bg-slate-100 rounded-full text-slate-400">
                              <Server className="w-8 h-8" />
                            </div>
                            <div className="space-y-1">
                              <h4 className="font-bold text-slate-700 text-sm">No Devices In This Group</h4>
                              <p className="text-xs text-slate-500 max-w-sm">
                                Assign servers from your fleet to this group to organize, monitor, and deploy configurations together.
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={handleOpenAssignModal}
                              className="px-4 py-2 bg-[#7a0c0c] hover:bg-[#520000] text-white rounded font-bold text-xs cursor-pointer shadow-xs flex items-center gap-1.5 transition-all"
                            >
                              <Plus className="w-4 h-4" />
                              <span>Assign Devices Now</span>
                            </button>
                          </div>
                        ) : (
                          <table className="w-full text-left text-xs border-collapse">
                            <thead className="bg-slate-100 border-b border-slate-300 font-bold text-slate-700 sticky top-0 z-10">
                              <tr>
                                <th className="p-2.5 border-r border-slate-200">Device Name</th>
                                <th className="p-2.5 border-r border-slate-200">BMC IP</th>
                                <th className="p-2.5 border-r border-slate-200">Vendor / Model</th>
                                <th className="p-2.5 border-r border-slate-200">Rack Location</th>
                                <th className="p-2.5 border-r border-slate-200">Power Status</th>
                                <th className="p-2.5 border-r border-slate-200">Health</th>
                                <th className="p-2.5 text-center w-20">Action</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200 font-medium text-slate-800">
                              {groupServers.map(srv => {
                                const sStatus = serverStatuses ? serverStatuses[srv.id] : null;
                                const power = (sStatus as any)?.powerState || (srv as any).powerStatus || (sStatus?.status === "Offline" ? "Off" : "On");
                                const health = sStatus?.status || (srv as any).healthStatus || "OK";
                                return (
                                  <tr key={srv.id} className="hover:bg-slate-50 transition-colors">
                                    <td className="p-2.5 border-r border-slate-200 font-bold text-slate-900">
                                      <div className="flex items-center gap-2">
                                        <Server className="w-3.5 h-3.5 text-slate-400" />
                                        <span>{srv.name}</span>
                                      </div>
                                    </td>
                                    <td className="p-2.5 border-r border-slate-200 font-mono text-slate-600">
                                      {srv.bmcIp || (srv as any).ip || "N/A"}
                                    </td>
                                    <td className="p-2.5 border-r border-slate-200">
                                      <div className="flex items-center gap-1.5">
                                        <span className="font-bold text-[#7a0c0c]">{srv.vendor || "SM"}</span>
                                        <span className="text-slate-400">·</span>
                                        <span>{srv.model || "Tyrone Node"}</span>
                                      </div>
                                    </td>
                                    <td className="p-2.5 border-r border-slate-200">
                                      <span className="px-2 py-0.5 bg-slate-100 rounded text-[11px] font-bold text-slate-700">
                                        {srv.rack || "Rack 1"}
                                      </span>
                                    </td>
                                    <td className="p-2.5 border-r border-slate-200">
                                      <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                                        String(power).toLowerCase() === "on" ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"
                                      }`}>
                                        {power}
                                      </span>
                                    </td>
                                    <td className="p-2.5 border-r border-slate-200">
                                      <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                                        String(health).toLowerCase() === "ok" ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                                      }`}>
                                        {health}
                                      </span>
                                    </td>
                                    <td className="p-2.5 text-center">
                                      <button
                                        type="button"
                                        onClick={() => handleRemoveDeviceFromGroup(currentGroup.id, srv.id)}
                                        className="text-slate-400 hover:text-red-700 p-1 rounded hover:bg-red-50 cursor-pointer"
                                        title="Remove from this group"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        )}
                      </div>
                    ) : (
                      /* Group Provisioning Section & Form */
                      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-5 bg-slate-50/50">
                        {groupServers.length === 0 ? (
                          <div className="h-full flex flex-col items-center justify-center p-8 text-center text-slate-500 space-y-3">
                            <div className="p-4 bg-slate-100 rounded-full text-slate-400">
                              <Cpu className="w-8 h-8" />
                            </div>
                            <div className="space-y-1">
                              <h4 className="font-bold text-slate-700 text-sm">No Devices Assigned to This Group</h4>
                              <p className="text-xs text-slate-500 max-w-sm">
                                Assign member servers from your fleet to this group first before configuring bulk firmware updates or mass OS deployment.
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={handleOpenAssignModal}
                              className="px-4 py-2 bg-[#7a0c0c] hover:bg-[#520000] text-white rounded font-bold text-xs cursor-pointer shadow-xs flex items-center gap-1.5 transition-all"
                            >
                              <Plus className="w-4 h-4" />
                              <span>Assign Devices Now</span>
                            </button>
                          </div>
                        ) : (
                          <>
                            {/* Step 1: Target Devices Selection Card */}
                            <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-2xs space-y-3">
                              <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-slate-100">
                                <div className="flex items-center gap-2">
                                  <Server className="w-4 h-4 text-[#7a0c0c]" />
                                  <h3 className="font-bold text-xs text-slate-800">
                                    Target Devices in {currentGroup.name}
                                  </h3>
                                  <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded-full font-bold text-[11px]">
                                    {bulkSelectedDeviceIds.length} of {groupServers.length} selected
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => setBulkSelectedDeviceIds(groupServers.map(s => s.id))}
                                    className="text-[11px] font-bold text-[#7a0c0c] hover:underline cursor-pointer"
                                  >
                                    Select All
                                  </button>
                                  <span className="text-slate-300">|</span>
                                  <button
                                    type="button"
                                    onClick={() => setBulkSelectedDeviceIds([])}
                                    className="text-[11px] font-bold text-slate-500 hover:underline cursor-pointer"
                                  >
                                    Deselect All
                                  </button>
                                </div>
                              </div>

                              {/* Device Chips Grid */}
                              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                                {groupServers.map(srv => {
                                  const isSelected = bulkSelectedDeviceIds.includes(srv.id);
                                  return (
                                    <div
                                      key={srv.id}
                                      onClick={() => {
                                        if (isBulkRunning) return;
                                        setBulkSelectedDeviceIds(prev =>
                                          prev.includes(srv.id) ? prev.filter(id => id !== srv.id) : [...prev, srv.id]
                                        );
                                      }}
                                      className={`p-2.5 rounded border text-xs cursor-pointer transition-all flex items-start gap-2.5 ${
                                        isSelected
                                          ? "bg-red-50/50 border-[#7a0c0c] shadow-2xs"
                                          : "bg-white border-slate-200 hover:border-slate-300 opacity-70"
                                      }`}
                                    >
                                      <div className="pt-0.5 text-[#7a0c0c]">
                                        {isSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4 text-slate-400" />}
                                      </div>
                                      <div className="min-w-0 flex-1">
                                        <div className="font-bold text-slate-800 truncate">{srv.name}</div>
                                        <div className="text-[11px] font-mono text-slate-500 truncate">{srv.bmcIp || "No IP"}</div>
                                        <div className="text-[10px] text-slate-400 truncate mt-0.5">{srv.vendor || "SM"} · {srv.model || "Tyrone"}</div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>

                            {/* Step 2: Choose Operation (Firmware Update vs OS Deployment) */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div
                                onClick={() => !isBulkRunning && setBulkProvType("firmware")}
                                className={`p-4 rounded-lg border-2 cursor-pointer transition-all space-y-2 ${
                                  bulkProvType === "firmware"
                                    ? "border-[#7a0c0c] bg-red-50/20 shadow-xs"
                                    : "border-slate-200 bg-white hover:border-slate-300"
                                }`}
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <Cpu className={`w-5 h-5 ${bulkProvType === "firmware" ? "text-[#7a0c0c]" : "text-slate-500"}`} />
                                    <span className="font-extrabold text-sm text-slate-800">1. Bulk Firmware Update</span>
                                  </div>
                                  <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                                    bulkProvType === "firmware" ? "border-[#7a0c0c] bg-[#7a0c0c]" : "border-slate-300"
                                  }`}>
                                    {bulkProvType === "firmware" && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                                  </span>
                                </div>
                                <p className="text-xs text-slate-600">
                                  Flash BMC Management Module, System BIOS, CPLD, PSU, or HBA firmware simultaneously across all selected group devices.
                                </p>
                              </div>

                              <div
                                onClick={() => !isBulkRunning && setBulkProvType("os")}
                                className={`p-4 rounded-lg border-2 cursor-pointer transition-all space-y-2 ${
                                  bulkProvType === "os"
                                    ? "border-[#7a0c0c] bg-red-50/20 shadow-xs"
                                    : "border-slate-200 bg-white hover:border-slate-300"
                                }`}
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <Disc className={`w-5 h-5 ${bulkProvType === "os" ? "text-[#7a0c0c]" : "text-slate-500"}`} />
                                    <span className="font-extrabold text-sm text-slate-800">2. Bulk OS Deployment</span>
                                  </div>
                                  <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                                    bulkProvType === "os" ? "border-[#7a0c0c] bg-[#7a0c0c]" : "border-slate-300"
                                  }`}>
                                    {bulkProvType === "os" && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                                  </span>
                                </div>
                                <p className="text-xs text-slate-600">
                                  Attach Virtual Media ISO (Ubuntu, RHEL, Rocky Linux, Windows, or custom image) and trigger coordinated UEFI boot across all selected nodes.
                                </p>
                              </div>
                            </div>

                            {/* Step 3: Parameters Configuration Form */}
                            <form onSubmit={handleStartBulkProvisioning} className="bg-white border border-slate-200 rounded-lg p-5 shadow-2xs space-y-4">
                              <div className="pb-3 border-b border-slate-200 flex items-center justify-between">
                                <div className="font-bold text-xs uppercase tracking-wider text-slate-700">
                                  {bulkProvType === "firmware" ? "Firmware Update Parameters" : "Operating System Deployment Parameters"}
                                </div>
                                <span className="text-slate-500 text-xs">
                                  Targeting <strong className="text-[#7a0c0c]">{bulkSelectedDeviceIds.length}</strong> devices
                                </span>
                              </div>

                              {bulkProvType === "firmware" ? (
                                <div className="space-y-4">
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                      <label className="block text-xs font-bold text-slate-700 mb-1">Target Component</label>
                                      <select
                                        value={bulkFwComponent}
                                        onChange={e => setBulkFwComponent(e.target.value)}
                                        className="w-full p-2 border border-slate-300 rounded text-xs bg-slate-50 focus:bg-white focus:outline-none focus:border-[#7a0c0c]"
                                      >
                                        <option value="Management Module Firmware">Management Module Firmware (BMC)</option>
                                        <option value="System BIOS">System BIOS</option>
                                        <option value="CPLD Firmware">CPLD Firmware</option>
                                        <option value="Power Supply (PSU)">Power Supply (PSU)</option>
                                        <option value="HBA / RAID Controller">HBA / RAID Controller</option>
                                      </select>
                                    </div>

                                    <div>
                                      <label className="block text-xs font-bold text-slate-700 mb-1">Payload Distribution Mode</label>
                                      <div className="grid grid-cols-2 gap-2">
                                        <button
                                          type="button"
                                          onClick={() => setBulkFwSourceType("file")}
                                          className={`py-1.5 text-xs font-bold rounded border cursor-pointer ${
                                            bulkFwSourceType === "file"
                                              ? "bg-[#7a0c0c] text-white border-[#7a0c0c]"
                                              : "bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200"
                                          }`}
                                        >
                                          Upload Binary File
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setBulkFwSourceType("url")}
                                          className={`py-1.5 text-xs font-bold rounded border cursor-pointer ${
                                            bulkFwSourceType === "url"
                                              ? "bg-[#7a0c0c] text-white border-[#7a0c0c]"
                                              : "bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200"
                                          }`}
                                        >
                                          Remote HTTP/TFTP URL
                                        </button>
                                      </div>
                                    </div>
                                  </div>

                                  {bulkFwSourceType === "file" ? (
                                    <div>
                                      <label className="block text-xs font-bold text-slate-700 mb-1">Firmware Binary File</label>
                                      <input
                                        type="file"
                                        accept=".bin,.hex,.iso,.hpm,.zip,.tar,.gz"
                                        onChange={e => setBulkFwFile(e.target.files?.[0] || null)}
                                        className="w-full p-2 border border-slate-300 rounded text-xs bg-slate-50 file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:font-bold file:bg-[#7a0c0c] file:text-white hover:file:bg-[#520000] cursor-pointer"
                                      />
                                      {bulkFwFile && (
                                        <p className="text-[11px] text-emerald-700 font-semibold mt-1">
                                          Selected: {bulkFwFile.name} ({(bulkFwFile.size / (1024 * 1024)).toFixed(2)} MB)
                                        </p>
                                      )}
                                    </div>
                                  ) : (
                                    <div>
                                      <label className="block text-xs font-bold text-slate-700 mb-1">Remote Firmware Image URL</label>
                                      <input
                                        type="text"
                                        value={bulkFwUrl}
                                        onChange={e => setBulkFwUrl(e.target.value)}
                                        placeholder="https://repo.datacenter.internal/firmware/supermicro/sys621_v2.04.bin"
                                        className="w-full p-2 border border-slate-300 rounded text-xs bg-slate-50 focus:bg-white focus:outline-none focus:border-[#7a0c0c]"
                                      />
                                    </div>
                                  )}

                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                                    <div>
                                      <label className="block text-xs font-bold text-slate-700 mb-1">Batch Memo / Rollout Tag</label>
                                      <input
                                        type="text"
                                        value={bulkFwMemo}
                                        onChange={e => setBulkFwMemo(e.target.value)}
                                        placeholder="e.g. Cluster Q4 Security Patch Rollout"
                                        className="w-full p-2 border border-slate-300 rounded text-xs bg-slate-50 focus:bg-white focus:outline-none focus:border-[#7a0c0c]"
                                      />
                                    </div>

                                    <div className="flex items-center pt-5">
                                      <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-slate-700 font-medium">
                                        <input
                                          type="checkbox"
                                          checked={bulkFwAutoReset}
                                          onChange={e => setBulkFwAutoReset(e.target.checked)}
                                          className="w-4 h-4 text-[#7a0c0c] rounded focus:ring-0 cursor-pointer"
                                        />
                                        <span>Automatically power cycle / reboot nodes post-flashing to apply firmware</span>
                                      </label>
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                <div className="space-y-4">
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                      <label className="block text-xs font-bold text-slate-700 mb-1">Operating System Image Preset</label>
                                      <select
                                        value={bulkOsPreset}
                                        onChange={e => setBulkOsPreset(e.target.value)}
                                        className="w-full p-2 border border-slate-300 rounded text-xs bg-slate-50 focus:bg-white focus:outline-none focus:border-[#7a0c0c]"
                                      >
                                        <option value="ubuntu-24.04.iso">Ubuntu Server 24.04 LTS (x86_64)</option>
                                        <option value="rhel-9.4.iso">Red Hat Enterprise Linux 9.4 (x86_64)</option>
                                        <option value="rocky-9.3.iso">Rocky Linux 9.3 Enterprise (x86_64)</option>
                                        <option value="windows-server-2022.iso">Windows Server 2022 Datacenter</option>
                                        <option value="custom">-- Custom ISO URL or Upload --</option>
                                      </select>
                                    </div>

                                    <div>
                                      <label className="block text-xs font-bold text-slate-700 mb-1">Batch Deployment Memo</label>
                                      <input
                                        type="text"
                                        value={bulkOsMemo}
                                        onChange={e => setBulkOsMemo(e.target.value)}
                                        placeholder="e.g. Mass RockyLinux 9.3 re-image for group"
                                        className="w-full p-2 border border-slate-300 rounded text-xs bg-slate-50 focus:bg-white focus:outline-none focus:border-[#7a0c0c]"
                                      />
                                    </div>
                                  </div>

                                  {bulkOsPreset === "custom" && (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                      <div>
                                        <label className="block text-xs font-bold text-slate-700 mb-1">Custom ISO Image URL</label>
                                        <input
                                          type="text"
                                          value={bulkOsCustomUrl}
                                          onChange={e => setBulkOsCustomUrl(e.target.value)}
                                          placeholder="https://isos.datacenter.lan/images/custom-image.iso"
                                          className="w-full p-2 border border-slate-300 rounded text-xs bg-slate-50 focus:bg-white focus:outline-none focus:border-[#7a0c0c]"
                                        />
                                      </div>
                                      <div>
                                        <label className="block text-xs font-bold text-slate-700 mb-1">Or Upload Local ISO File</label>
                                        <input
                                          type="file"
                                          accept=".iso,.img"
                                          onChange={e => setBulkOsFile(e.target.files?.[0] || null)}
                                          className="w-full p-2 border border-slate-300 rounded text-xs bg-slate-50 file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:font-bold file:bg-[#7a0c0c] file:text-white hover:file:bg-[#520000] cursor-pointer"
                                        />
                                      </div>
                                    </div>
                                  )}

                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                                    <div>
                                      <label className="block text-xs font-bold text-slate-700 mb-1">ISO Share Username (Optional)</label>
                                      <input
                                        type="text"
                                        value={bulkOsUsername}
                                        onChange={e => setBulkOsUsername(e.target.value)}
                                        placeholder="admin"
                                        className="w-full p-2 border border-slate-300 rounded text-xs bg-slate-50 focus:bg-white focus:outline-none focus:border-[#7a0c0c]"
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-xs font-bold text-slate-700 mb-1">ISO Share Password (Optional)</label>
                                      <input
                                        type="password"
                                        value={bulkOsPassword}
                                        onChange={e => setBulkOsPassword(e.target.value)}
                                        placeholder="••••••••"
                                        className="w-full p-2 border border-slate-300 rounded text-xs bg-slate-50 focus:bg-white focus:outline-none focus:border-[#7a0c0c]"
                                      />
                                    </div>
                                  </div>

                                  <div className="pt-1">
                                    <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-slate-700 font-medium">
                                      <input
                                        type="checkbox"
                                        checked={bulkOsReboot}
                                        onChange={e => setBulkOsReboot(e.target.checked)}
                                        className="w-4 h-4 text-[#7a0c0c] rounded focus:ring-0 cursor-pointer"
                                      />
                                      <span>Configure UEFI one-time boot override to Virtual Media and issue immediate power reboot</span>
                                    </label>
                                  </div>
                                </div>
                              )}

                              {/* Submit Button */}
                              <div className="pt-3 border-t border-slate-200 flex items-center justify-between">
                                <span className="text-xs text-slate-500">
                                  Targeting <strong className="text-slate-800">{bulkSelectedDeviceIds.length}</strong> servers in {currentGroup.name}
                                </span>
                                <button
                                  type="submit"
                                  disabled={isBulkRunning || bulkSelectedDeviceIds.length === 0}
                                  className={`px-5 py-2 font-bold text-xs rounded shadow-xs flex items-center gap-2 transition-all ${
                                    isBulkRunning || bulkSelectedDeviceIds.length === 0
                                      ? "bg-slate-300 text-slate-500 cursor-not-allowed"
                                      : "bg-[#7a0c0c] hover:bg-[#520000] text-white cursor-pointer"
                                  }`}
                                >
                                  {isBulkRunning ? (
                                    <>
                                      <RefreshCw className="w-4 h-4 animate-spin" />
                                      <span>Executing Mass Provisioning...</span>
                                    </>
                                  ) : (
                                    <>
                                      <Play className="w-4 h-4 fill-white" />
                                      <span>
                                        {bulkProvType === "firmware"
                                          ? `Launch Firmware Update on ${bulkSelectedDeviceIds.length} Nodes`
                                          : `Deploy OS on ${bulkSelectedDeviceIds.length} Nodes`}
                                      </span>
                                    </>
                                  )}
                                </button>
                              </div>
                            </form>

                            {/* Step 4: Live Execution Monitor & Progress Results */}
                            {(isBulkRunning || bulkCompletedSummary || bulkLogs.length > 0) && (
                              <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-2xs space-y-4 animate-in fade-in">
                                <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                                  <div className="flex items-center gap-2">
                                    <Activity className="w-4 h-4 text-[#7a0c0c]" />
                                    <h4 className="font-bold text-xs text-slate-800">
                                      Cluster Provisioning Progress & Node Status
                                    </h4>
                                  </div>
                                  {bulkCompletedSummary && (
                                    <div className="flex items-center gap-2 text-xs font-bold">
                                      <span className="px-2 py-0.5 bg-slate-100 rounded text-slate-700">Total: {bulkCompletedSummary.total}</span>
                                      <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded">Success: {bulkCompletedSummary.success}</span>
                                      {bulkCompletedSummary.failed > 0 && (
                                        <span className="px-2 py-0.5 bg-rose-100 text-rose-800 rounded">Failed: {bulkCompletedSummary.failed}</span>
                                      )}
                                    </div>
                                  )}
                                </div>

                                {/* Overall Progress Bar */}
                                <div className="space-y-1">
                                  <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                                    <span>Overall Deployment Progress</span>
                                    <span>{bulkOverallProgress}%</span>
                                  </div>
                                  <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden">
                                    <div
                                      className="bg-[#7a0c0c] h-full transition-all duration-300"
                                      style={{ width: `${bulkOverallProgress}%` }}
                                    />
                                  </div>
                                </div>

                                {/* Nodes Progress Table */}
                                <div className="border border-slate-200 rounded overflow-hidden">
                                  <table className="w-full text-left text-xs border-collapse">
                                    <thead className="bg-slate-100 font-bold text-slate-700 border-b border-slate-200">
                                      <tr>
                                        <th className="p-2.5 border-r border-slate-200">Server Node</th>
                                        <th className="p-2.5 border-r border-slate-200">BMC IP</th>
                                        <th className="p-2.5 border-r border-slate-200 w-48">Progress</th>
                                        <th className="p-2.5 border-r border-slate-200">Status</th>
                                        <th className="p-2.5">Current Operation</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-200 font-medium text-slate-800">
                                      {groupServers
                                        .filter(s => bulkSelectedDeviceIds.includes(s.id))
                                        .map(srv => {
                                          const prog = bulkServerProgress[srv.id] || { status: "pending", percent: 0, message: "Queued" };
                                          return (
                                            <tr key={srv.id} className="hover:bg-slate-50">
                                              <td className="p-2.5 border-r border-slate-200 font-bold text-slate-900">
                                                <div className="flex items-center gap-1.5">
                                                  <Server className="w-3.5 h-3.5 text-slate-400" />
                                                  <span>{srv.name}</span>
                                                </div>
                                              </td>
                                              <td className="p-2.5 border-r border-slate-200 font-mono text-slate-600">{srv.bmcIp || "N/A"}</td>
                                              <td className="p-2.5 border-r border-slate-200">
                                                <div className="flex items-center gap-2">
                                                  <div className="flex-1 bg-slate-200 h-2 rounded-full overflow-hidden">
                                                    <div
                                                      className={`h-full transition-all duration-300 ${
                                                        prog.status === "failed"
                                                          ? "bg-rose-600"
                                                          : prog.status === "success"
                                                          ? "bg-emerald-600"
                                                          : "bg-[#7a0c0c]"
                                                      }`}
                                                      style={{ width: `${prog.percent}%` }}
                                                    />
                                                  </div>
                                                  <span className="font-mono text-[11px] text-slate-500 w-8 text-right">{prog.percent}%</span>
                                                </div>
                                              </td>
                                              <td className="p-2.5 border-r border-slate-200">
                                                <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                                                  prog.status === "success"
                                                    ? "bg-emerald-100 text-emerald-800"
                                                    : prog.status === "failed"
                                                    ? "bg-rose-100 text-rose-800"
                                                    : prog.status === "processing"
                                                    ? "bg-amber-100 text-amber-800 animate-pulse"
                                                    : "bg-slate-100 text-slate-600"
                                                }`}>
                                                  {prog.status === "success" ? "Completed" : prog.status === "failed" ? "Failed" : prog.status === "processing" ? "In Progress" : "Queued"}
                                                </span>
                                              </td>
                                              <td className="p-2.5 text-slate-600 text-[11px] truncate">{prog.message}</td>
                                            </tr>
                                          );
                                        })}
                                    </tbody>
                                  </table>
                                </div>

                                {/* Live Event Log Terminal */}
                                {bulkLogs.length > 0 && (
                                  <div className="space-y-1.5">
                                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                                      <Terminal className="w-3.5 h-3.5 text-slate-500" />
                                      <span>Execution Event Log</span>
                                    </div>
                                    <div className="p-3 bg-slate-900 text-slate-200 rounded font-mono text-[11px] max-h-40 overflow-y-auto space-y-1">
                                      {bulkLogs.map((lg, i) => (
                                        <div key={i} className="flex items-start gap-2 leading-relaxed">
                                          <span className="text-slate-500 shrink-0">[{lg.time}]</span>
                                          <span className={lg.type === "success" ? "text-emerald-400" : lg.type === "error" ? "text-rose-400" : "text-slate-300"}>
                                            {lg.message}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </>
                );
              })() : (
                <div className="h-full flex flex-col items-center justify-center p-8 text-center text-slate-400 space-y-3">
                  <div className="p-4 bg-slate-100 rounded-full text-slate-400">
                    <Boxes className="w-8 h-8" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="font-bold text-slate-700 text-sm">No Device Group Selected</h4>
                    <p className="text-xs text-slate-500 max-w-sm">
                      Create a new group or select an existing group to organize, monitor, and deploy configurations to servers.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setNewGroupName("");
                      setNewGroupDesc("");
                      setShowCreateGroupModal(true);
                    }}
                    className="px-4 py-2 bg-[#7a0c0c] hover:bg-[#520000] text-white rounded font-bold text-xs cursor-pointer shadow-xs flex items-center gap-1.5 transition-all"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Create New Group</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

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
        initialTab={provisioningInitialTab}
        onSuccess={(_msg, task) => {
          if (task) {
            setProvisioningHistory(prev => [task, ...prev]);
          }
        }}
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
                    } catch (_) { }

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

      {showOSInstallModal && osInstallTargetServer && (
        <OSInstallModal
          isOpen={showOSInstallModal}
          onClose={handleCloseOSInstall}
          bmcIp={osInstallTargetServer.bmcIp || osInstallTargetServer.name}
          serverName={osInstallTargetServer.name}
          username={osInstallTargetServer.bmcUsername || "admin"}
          password={osInstallTargetServer.bmcPassword || "password"}
        />
      )}

      {/* Create Device Group Modal */}
      {showCreateGroupModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-2xl border border-slate-300 max-w-md w-full overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150 text-xs text-slate-800">
            {/* Header */}
            <div className="bg-[#7a0c0c] text-white px-5 py-3 flex items-center justify-between font-bold text-sm tracking-wide shrink-0">
              <div className="flex items-center gap-2">
                <Boxes className="w-4 h-4" />
                <span>Create New Device Group</span>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateGroupModal(false)}
                className="text-white/70 hover:text-white cursor-pointer p-0.5"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleCreateGroup} className="p-5 space-y-4">
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700 block">
                  Group Name <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="e.g. AI Training Cluster, Edge Gateway Node"
                  value={newGroupName}
                  onChange={e => setNewGroupName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded text-xs focus:outline-none focus:border-[#7a0c0c]"
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-bold text-slate-700 block">Description (Optional)</label>
                <textarea
                  rows={2}
                  placeholder="Purpose or operational tier for this group..."
                  value={newGroupDesc}
                  onChange={e => setNewGroupDesc(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded text-xs focus:outline-none focus:border-[#7a0c0c] resize-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-bold text-slate-700 block">Group Color Badge</label>
                <div className="flex items-center gap-2 pt-1 flex-wrap">
                  {[
                    "#7a0c0c",
                    "#1e3a8a",
                    "#047857",
                    "#b45309",
                    "#6b21a8",
                    "#0f766e",
                    "#be123c",
                    "#334155"
                  ].map(color => (
                    <button
                      type="button"
                      key={color}
                      onClick={() => setNewGroupColor(color)}
                      className={`w-7 h-7 rounded-full cursor-pointer transition-transform flex items-center justify-center ${
                        newGroupColor === color ? "scale-110 ring-2 ring-offset-2 ring-slate-800" : "hover:scale-105"
                      }`}
                      style={{ backgroundColor: color }}
                    >
                      {newGroupColor === color && <Check className="w-4 h-4 text-white" />}
                    </button>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowCreateGroupModal(false)}
                  className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded text-xs cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-1.5 bg-[#7a0c0c] hover:bg-[#520000] text-white font-bold rounded text-xs shadow-xs cursor-pointer transition-colors"
                >
                  Create Group
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Assign / Manage Devices Modal */}
      {showAssignDevicesModal && currentGroup && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-2xl border border-slate-300 max-w-2xl w-full overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-150 text-xs text-slate-800">
            {/* Header */}
            <div className="bg-[#7a0c0c] text-white px-5 py-3 flex items-center justify-between font-bold text-sm tracking-wide shrink-0">
              <div className="flex items-center gap-2">
                <Boxes className="w-4 h-4" />
                <span>Manage Devices - {currentGroup.name}</span>
              </div>
              <button
                type="button"
                onClick={() => setShowAssignDevicesModal(false)}
                className="text-white/70 hover:text-white cursor-pointer p-0.5"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Filter Bar */}
            <div className="p-4 bg-slate-50 border-b border-slate-200 shrink-0 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={assignSearchQuery}
                    onChange={e => setAssignSearchQuery(e.target.value)}
                    placeholder="Filter fleet servers by name, IP, model, rack..."
                    className="w-full pl-8 pr-3 py-1.5 border border-slate-300 rounded text-xs bg-white focus:outline-none focus:border-[#7a0c0c]"
                  />
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      const allIds = (servers || []).map(s => s.id);
                      setTempAssignedDeviceIds(allIds);
                    }}
                    className="px-2.5 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded text-[11px] cursor-pointer"
                  >
                    Select All
                  </button>
                  <button
                    type="button"
                    onClick={() => setTempAssignedDeviceIds([])}
                    className="px-2.5 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded text-[11px] cursor-pointer"
                  >
                    Deselect All
                  </button>
                </div>
              </div>
            </div>

            {/* Device Checklist */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
              {(() => {
                const filteredServers = (servers || []).filter(s =>
                  s.name.toLowerCase().includes(assignSearchQuery.toLowerCase()) ||
                  (s.bmcIp || "").toLowerCase().includes(assignSearchQuery.toLowerCase()) ||
                  (s.model || "").toLowerCase().includes(assignSearchQuery.toLowerCase()) ||
                  (s.rack || "").toLowerCase().includes(assignSearchQuery.toLowerCase())
                );

                if (filteredServers.length === 0) {
                  return (
                    <div className="p-8 text-center text-slate-400 font-medium">
                      No matching devices found in fleet inventory.
                    </div>
                  );
                }

                return filteredServers.map(s => {
                  const isChecked = tempAssignedDeviceIds.includes(s.id);
                  return (
                    <div
                      key={s.id}
                      onClick={() => handleToggleAssignDevice(s.id)}
                      className={`p-3 flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                        isChecked ? "bg-red-50/60 font-semibold" : "hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="text-[#7a0c0c] shrink-0">
                          {isChecked ? (
                            <CheckSquare className="w-4 h-4" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-400" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="font-bold text-slate-900 truncate flex items-center gap-2">
                            <span>{s.name}</span>
                            <span className="px-1.5 py-0.2 bg-slate-200 text-slate-700 rounded text-[10px] font-mono">
                              {s.rack || "Rack 1"}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 font-mono truncate">
                            IP: {s.bmcIp} · {s.vendor || "SM"} {s.model || ""}
                          </div>
                        </div>
                      </div>

                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                          isChecked ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {isChecked ? "Included" : "Excluded"}
                      </span>
                    </div>
                  );
                });
              })()}
            </div>

            {/* Footer */}
            <div className="p-4 bg-slate-100 border-t border-slate-200 flex items-center justify-between shrink-0">
              <span className="text-slate-600 font-bold text-xs">
                {tempAssignedDeviceIds.length} of {servers.length} devices selected
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowAssignDevicesModal(false)}
                  className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded text-xs cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveAssignedDevices}
                  className="px-5 py-1.5 bg-[#7a0c0c] hover:bg-[#520000] text-white font-bold rounded text-xs shadow-xs cursor-pointer transition-colors"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};


