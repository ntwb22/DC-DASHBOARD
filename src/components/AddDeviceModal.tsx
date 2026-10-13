import React, { useState } from "react";
import { X, Plus, Server, ArrowLeft, RefreshCw, Eye, EyeOff, Layers, CheckCircle2 } from "lucide-react";
import { validateBmcCredentials, fetchServerDetailsForAddition } from "../services/redfishService";

export interface AddDeviceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddDevice: (deviceData: any) => void;
  onBackToDevicesNotInHierarchy?: () => void;
}

export function parseIpList(raw: string): string[] {
  if (!raw || !raw.trim()) return [];
  const results: string[] = [];

  // Match IP ranges like 172.16.12.50-60 or 172.16.12.50-172.16.12.60 or range: 172.16.12.50-60
  const rangeRegex = /(\d{1,3}\.\d{1,3}\.\d{1,3}\.)(\d{1,3})\s*(?:-|to)\s*(?:(\d{1,3}\.\d{1,3}\.\d{1,3}\.)?(\d{1,3}))/gi;

  const processedStr = raw.replace(rangeRegex, (fullMatch, prefix, startStr, endPrefix, endStr) => {
    const start = parseInt(startStr, 10);
    const end = parseInt(endStr, 10);
    if (!isNaN(start) && !isNaN(end) && start <= end && end - start <= 255) {
      for (let i = start; i <= end; i++) {
        results.push(`${prefix}${i}`);
      }
    }
    return " ";
  });

  // Extract all remaining standalone IPv4 addresses
  const ipRegex = /\b(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g;
  const singleIps = processedStr.match(ipRegex) || [];
  for (const ip of singleIps) {
    results.push(ip);
  }

  return Array.from(new Set(results));
}

export function AddDeviceModal({
  isOpen,
  onClose,
  onAddDevice,
  onBackToDevicesNotInHierarchy
}: AddDeviceModalProps) {
  // Mode selection: 'single' | 'bulk'
  const [mode, setMode] = useState<"single" | "bulk">("single");

  // Required Device Info
  const [name, setName] = useState("");
  const [ipAddress, setIpAddress] = useState("");
  const [bulkIps, setBulkIps] = useState("172.16.12.50\n172.16.12.51\n172.16.12.52");
  const [category, setCategory] = useState<"SM" | "AS">("SM");
  const [deviceType, setDeviceType] = useState("Server");
  const [rack, setRack] = useState("");

  // Protocol Info
  const [protocol, setProtocol] = useState<"IPMI" | "SSH" | "WMI" | "HTTPS" | "SSH BMC">("IPMI");
  const [ipmiUsername, setIpmiUsername] = useState("admin");
  const [ipmiPassword, setIpmiPassword] = useState("netweb@123");
  const [showIpmiPassword, setShowIpmiPassword] = useState(false);
  const [ipmiKey, setIpmiKey] = useState("");
  const [operatingSystem, setOperatingSystem] = useState("Linux");

  // Device Specs Info
  const [serialNumber, setSerialNumber] = useState("");
  const [sizeU, setSizeU] = useState("1");
  const [deratedPowerW, setDeratedPowerW] = useState("400");
  const [weightKg, setWeightKg] = useState("15");
  const [vendor, setVendor] = useState("Tyrone Systems");
  const [owner, setOwner] = useState("IT Operations");
  const [description, setDescription] = useState("");

  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  if (!isOpen) return null;

  const parsedBulkIps = parseIpList(bulkIps);

  const handleSwitchMode = (newMode: "single" | "bulk") => {
    setMode(newMode);
    if (newMode === "bulk" && !bulkIps.trim()) {
      setBulkIps("172.16.12.50\n172.16.12.51\n172.16.12.52");
    }
  };


  const quickValidateAndFetch = async (ip: string, u: string, p: string, cat: any) => {
    const timeoutMs = 2000;
    const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve(null), timeoutMs));
    const validatePromise = (async () => {
      try {
        await validateBmcCredentials(ip, u, p, cat);
        return await fetchServerDetailsForAddition(ip, u, p, cat);
      } catch (err) {
        console.warn("BMC ping/connection returned warning:", err);
        return null;
      }
    })();
    return (await Promise.race([validatePromise, timeoutPromise])) as any;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const userStr = ipmiUsername.trim() || "admin";
    const passStr = ipmiPassword.trim() || "netweb@123";

    if (mode === "single") {
      const trimmedName = name.trim();
      const trimmedIp = ipAddress.trim();

      if (!trimmedName && !trimmedIp) {
        setFormError("Please enter a Device Name or IP Address.");
        return;
      }

      const deviceIp = trimmedIp || `172.16.12.${Math.floor(Math.random() * 150) + 10}`;
      const deviceName = trimmedName || `Tyrone Node (${deviceIp})`;

      setIsSubmitting(true);
      const fetchedInfo = await quickValidateAndFetch(deviceIp, userStr, passStr, category);
      setIsSubmitting(false);

      const generatedSerial = serialNumber.trim() || fetchedInfo?.serialNumber || undefined;
      const modelName = fetchedInfo?.model || "RH21XM";
      const manufacturerName = vendor.trim() !== "Tyrone Systems" ? vendor.trim() : (fetchedInfo?.manufacturer || (category === "AS" ? "ASRock" : "Tyrone Systems"));

      const newDevice = {
        id: `server-${Date.now()}`,
        name: deviceName,
        bmcIp: deviceIp,
        bmcUsername: userStr,
        bmcPassword: passStr,
        category,
        chassisUri: category === "AS" ? "/redfish/v1/Chassis/Self" : "/redfish/v1/Chassis/1",
        model: modelName,
        manufacturer: manufacturerName,
        serialNumber: generatedSerial,
        serial: generatedSerial,
        powerStatus: fetchedInfo?.powerState === "Off" ? "OFF" : "ON",
        healthStatus: fetchedInfo?.healthStatus || "OK",
        health: fetchedInfo?.healthStatus || "OK",
        rack: rack || "Rack 1",
        deviceType,
        protocol,
        ipmiKey,
        operatingSystem,
        sizeU: sizeU.trim() || "1",
        size: sizeU.trim() || "1",
        deratedPowerW: deratedPowerW.trim() || "400",
        powerW: deratedPowerW.trim() || "400",
        weightKg: weightKg.trim() || "15",
        weight: weightKg.trim() || "15",
        vendor: manufacturerName,
        owner,
        description,
        specs: {
          cpu: fetchedInfo?.processorsCount ? `${fetchedInfo.processorsCount} CPUs` : "Multi-Core Processor",
          cores: fetchedInfo?.processorsCount || 2,
          memory: fetchedInfo?.memoryGiB ? `${fetchedInfo.memoryGiB} GB` : "N/A",
          storage: fetchedInfo?.storageCount ? `${fetchedInfo.storageCount} Drives` : "N/A"
        }
      };

      persistDevicesBatch([newDevice]);
      onAddDevice(newDevice);
      onClose();
    } else {
      // BULK MODE
      if (parsedBulkIps.length === 0) {
        setFormError("Please enter at least one valid IP address or IP range (e.g. 172.16.12.50-60 or 172.16.12.50, 172.16.12.51).");
        return;
      }

      setIsSubmitting(true);
      const namePrefix = name.trim();
      const createdDevices: any[] = [];
      const timestamp = Date.now();

      // Probe first IP to see if credentials work with fast timeout
      const firstIp = parsedBulkIps[0];
      const firstFetchedInfo = await quickValidateAndFetch(firstIp, userStr, passStr, category);
      setIsSubmitting(false);

      parsedBulkIps.forEach((ip, idx) => {
        const deviceName = namePrefix
          ? (parsedBulkIps.length > 1 ? `${namePrefix} (${ip})` : namePrefix)
          : `Tyrone Node (${ip})`;

        const devId = `server-${timestamp}-${idx}-${Math.floor(Math.random() * 1000)}`;

        const dev = {
          id: devId,
          name: deviceName,
          bmcIp: ip,
          bmcUsername: userStr,
          bmcPassword: passStr,
          category,
          chassisUri: category === "AS" ? "/redfish/v1/Chassis/Self" : "/redfish/v1/Chassis/1",
          model: (idx === 0 && firstFetchedInfo?.model) || "RH21XM",
          manufacturer: vendor.trim() !== "Tyrone Systems" ? vendor.trim() : ((idx === 0 && firstFetchedInfo?.manufacturer) || (category === "AS" ? "ASRock" : "Tyrone Systems")),
          serialNumber: idx === 0 ? (serialNumber.trim() || firstFetchedInfo?.serialNumber) : undefined,
          serial: idx === 0 ? (serialNumber.trim() || firstFetchedInfo?.serialNumber) : undefined,
          powerStatus: (idx === 0 && firstFetchedInfo?.powerState === "Off") ? "OFF" : "ON",
          healthStatus: "OK",
          health: "OK",
          rack: rack || "Rack 1",
          deviceType,
          protocol,
          ipmiKey,
          operatingSystem,
          sizeU: sizeU.trim() || "1",
          size: sizeU.trim() || "1",
          deratedPowerW: deratedPowerW.trim() || "400",
          powerW: deratedPowerW.trim() || "400",
          weightKg: weightKg.trim() || "15",
          weight: weightKg.trim() || "15",
          vendor: category === "AS" ? "ASRock" : "Tyrone Systems",
          owner,
          description,
          specs: {
            cpu: (idx === 0 && firstFetchedInfo?.processorsCount) ? `${firstFetchedInfo.processorsCount} CPUs` : "Multi-Core Processor",
            cores: (idx === 0 && firstFetchedInfo?.processorsCount) || 2,
            memory: (idx === 0 && firstFetchedInfo?.memoryGiB) ? `${firstFetchedInfo.memoryGiB} GB` : "N/A",
            storage: (idx === 0 && firstFetchedInfo?.storageCount) ? `${firstFetchedInfo.storageCount} Drives` : "N/A"
          }
        };

        createdDevices.push(dev);
      });

      persistDevicesBatch(createdDevices);

      // Invoke callback for created devices
      createdDevices.forEach(dev => onAddDevice(dev));
      onClose();
    }
  };

  const persistDevicesBatch = (devices: any[]) => {
    // 1. Remove from deleted keys in localStorage
    try {
      const rawDel = localStorage.getItem("tyrone_deleted_keys");
      if (rawDel) {
        const delSet = new Set<string>(JSON.parse(rawDel));
        devices.forEach(dev => {
          delSet.delete(dev.id.toLowerCase());
          delSet.delete(dev.bmcIp.toLowerCase());
          delSet.delete(dev.name.toLowerCase());
        });
        localStorage.setItem("tyrone_deleted_keys", JSON.stringify(Array.from(delSet)));
      }
    } catch (_) {}

    // 2. Update tyrone_fleet & tyrone_server_racks in localStorage
    try {
      const saved = localStorage.getItem("tyrone_fleet");
      const currentFleet = saved ? JSON.parse(saved) : [];
      const newIps = new Set(devices.map(d => d.bmcIp));
      const newIds = new Set(devices.map(d => d.id));

      const updatedFleet = [
        ...currentFleet.filter((s: any) => !newIds.has(s.id) && !newIps.has(s.bmcIp)),
        ...devices
      ];
      localStorage.setItem("tyrone_fleet", JSON.stringify(updatedFleet));

      const savedRacks = localStorage.getItem("tyrone_server_racks");
      const racksObj = savedRacks ? JSON.parse(savedRacks) : {};
      devices.forEach(dev => {
        racksObj[dev.id] = dev.rack || "Rack 1";
        racksObj[dev.bmcIp] = dev.rack || "Rack 1";
      });
      localStorage.setItem("tyrone_server_racks", JSON.stringify(racksObj));

      // 3. Backend persistence for each server
      devices.forEach(dev => {
        fetch("http://127.0.0.1:8000/api/servers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: dev.id,
            name: dev.name,
            ip: dev.bmcIp,
            vendor: dev.category,
            username: dev.bmcUsername,
            password: dev.bmcPassword,
            rack: dev.rack
          })
        }).catch(() => {
          fetch("/api/local/fleet", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(updatedFleet)
          }).catch(() => {});
        });
      });

      // 4. Dispatch events for instant UI update
      window.dispatchEvent(new CustomEvent("fleet-updated", { detail: { devices } }));
      window.dispatchEvent(new CustomEvent("inventory-updated", { detail: { devices } }));
      window.dispatchEvent(new CustomEvent("hierarchy-updated"));
    } catch (err) {
      console.warn("Error persisting batch devices to localStorage:", err);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-2 bg-slate-950/75 backdrop-blur-xs select-none font-sans">
      <div className="bg-white border border-slate-300 rounded-xl shadow-2xl max-w-3xl w-full my-auto overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* Header Bar - Tyrone Red */}
        <div className="bg-[#680505] text-white px-4 py-2.5 flex items-center justify-between font-sans shrink-0 border-b border-[#4d0000]">
          <div className="flex items-center gap-2">
            <Plus className="w-4 h-4 text-white" />
            <span className="font-bold text-xs tracking-wide">Add New Device(s)</span>
          </div>
          <button 
            type="button"
            onClick={onClose} 
            className="text-white/80 hover:text-white p-1 rounded hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Form Body */}
        <form onSubmit={handleSubmit} className="p-4 space-y-2.5 flex-1 overflow-y-auto">
          
          {/* Sub-Tabs: Single Device vs Bulk IPs Mode */}
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleSwitchMode("single")}
                className={`px-3 py-1 text-[11px] font-bold rounded cursor-pointer transition-all flex items-center gap-1.5 ${
                  mode === "single"
                    ? "bg-[#680505] text-white shadow-xs"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                <Server className="w-3.5 h-3.5" />
                <span>Single Device</span>
              </button>

              <button
                type="button"
                onClick={() => handleSwitchMode("bulk")}
                className={`px-3 py-1 text-[11px] font-bold rounded cursor-pointer transition-all flex items-center gap-1.5 ${
                  mode === "bulk"
                    ? "bg-[#680505] text-white shadow-xs"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Multiple Devices (Bulk IPs)</span>
              </button>
            </div>

            {mode === "bulk" && (
              <div className="flex items-center gap-1.5 bg-[#680505]/10 border border-[#680505]/30 px-2.5 py-0.5 rounded-full">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#680505]" />
                <span className="text-[11px] font-extrabold text-[#680505]">
                  {parsedBulkIps.length} {parsedBulkIps.length === 1 ? "IP Detected" : "IPs Detected"}
                </span>
              </div>
            )}
          </div>

          {formError && (
            <div className="p-2 bg-rose-50 border border-rose-300 rounded text-rose-800 text-[11px] font-bold flex items-center gap-2">
              <span>⚠️</span>
              <span>{formError}</span>
            </div>
          )}

          {/* Device Form Container */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2.5">
            
            <div className="border-b border-[#680505]/20 pb-2 flex items-center justify-between">
              <h4 className="text-xs font-black uppercase text-[#680505] tracking-wider flex items-center gap-1.5">
                <Server className="w-4 h-4 text-[#680505]" />
                <span>{mode === "single" ? "Device Information" : "Bulk Device Configuration"}</span>
              </h4>
              <span className="text-[10px] text-slate-500 font-bold">* Indicates Required Fields</span>
            </div>

            {/* SINGLE MODE IP vs BULK MODE IP TEXTAREA */}
            {mode === "single" ? (
              <>
                {/* Device Name */}
                <div className="grid grid-cols-12 items-center gap-4">
                  <label className="col-span-4 text-xs font-bold text-slate-700 text-right">Name *</label>
                  <div className="col-span-8">
                    <input
                      type="text"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder="e.g. Tyrone Primary Node"
                      className="w-full px-3 py-2 border border-slate-300 rounded text-xs font-medium focus:outline-none focus:border-[#680505] focus:ring-1 focus:ring-[#680505]"
                    />
                  </div>
                </div>

                {/* Single IP Address */}
                <div className="grid grid-cols-12 items-center gap-4">
                  <label className="col-span-4 text-xs font-bold text-slate-700 text-right">IP Address for IPMI / BMC *</label>
                  <div className="col-span-8">
                    <input
                      type="text"
                      value={ipAddress}
                      onChange={e => setIpAddress(e.target.value)}
                      placeholder="e.g. 172.16.12.50"
                      className="w-full px-3 py-2 border border-slate-300 rounded text-xs font-mono focus:outline-none focus:border-[#680505] focus:ring-1 focus:ring-[#680505]"
                    />
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* Bulk IP Input */}
                <div className="grid grid-cols-12 items-start gap-4">
                  <div className="col-span-4 text-right pt-1">
                    <label className="text-xs font-bold text-[#680505] block">Server IPs list *</label>
                    <span className="text-[10px] text-slate-500 font-medium block leading-tight mt-0.5">
                      Enter IPs separated by newlines, commas, or IP range (e.g. 172.16.12.50-60)
                    </span>
                  </div>
                  <div className="col-span-8 space-y-1">
                    <textarea
                      rows={4}
                      value={bulkIps}
                      onChange={e => setBulkIps(e.target.value)}
                      placeholder={`172.16.12.50
172.16.12.51
172.16.12.52
or range: 172.16.12.50-60`}
                      className="w-full px-3 py-2 border border-slate-300 rounded text-xs font-mono focus:outline-none focus:border-[#680505] focus:ring-1 focus:ring-[#680505] bg-white resize-y"
                    />
                  </div>
                </div>

                {/* Optional Name Prefix */}
                <div className="grid grid-cols-12 items-center gap-4">
                  <label className="col-span-4 text-xs font-bold text-slate-700 text-right">Name Pattern / Prefix</label>
                  <div className="col-span-8">
                    <input
                      type="text"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder="e.g. Tyrone Node (Optional - defaults to 'Tyrone Node (IP)')"
                      className="w-full px-3 py-2 border border-slate-300 rounded text-xs font-medium focus:outline-none focus:border-[#680505] focus:ring-1 focus:ring-[#680505]"
                    />
                  </div>
                </div>
              </>
            )}

            {/* Server Category (SM vs AS) */}
            <div className="grid grid-cols-12 items-center gap-4 bg-slate-100/80 p-2 rounded border border-slate-200">
              <label className="col-span-4 text-xs font-bold text-[#680505] text-right">Server Category *</label>
              <div className="col-span-8 flex items-center gap-6 text-xs">
                <label className="flex items-center gap-2 cursor-pointer text-slate-800 font-bold">
                  <input
                    type="radio"
                    name="serverCategory"
                    value="SM"
                    checked={category === "SM"}
                    onChange={() => setCategory("SM")}
                    className="accent-[#680505] w-4 h-4 cursor-pointer"
                  />
                  <div className="flex flex-col">
                    <span className="text-slate-900">SM</span>
                    <span className="text-[10px] text-slate-500 font-mono font-semibold">Endpoint: /redfish/v1/chassis/1</span>
                  </div>
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-slate-800 font-bold">
                  <input
                    type="radio"
                    name="serverCategory"
                    value="AS"
                    checked={category === "AS"}
                    onChange={() => setCategory("AS")}
                    className="accent-[#680505] w-4 h-4 cursor-pointer"
                  />
                  <div className="flex flex-col">
                    <span className="text-slate-900">AS</span>
                    <span className="text-[10px] text-slate-500 font-mono font-semibold">Endpoint: /redfish/v1/chassis/self</span>
                  </div>
                </label>
              </div>
            </div>

            {/* Device Type & Rack Location */}
            <div className="grid grid-cols-12 items-center gap-4">
              <label className="col-span-4 text-xs font-bold text-slate-700 text-right">Device Type & Rack</label>
              <div className="col-span-8 grid grid-cols-2 gap-2">
                <select
                  value={deviceType}
                  onChange={e => setDeviceType(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded text-xs font-medium focus:outline-none focus:border-[#680505] bg-white"
                >
                  <option value="Server">Server</option>
                  <option value="Switch">Switch</option>
                  <option value="Storage">Storage</option>
                  <option value="PDU">PDU</option>
                </select>

                <select
                  value={rack}
                  onChange={e => setRack(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded text-xs font-medium focus:outline-none focus:border-[#680505] bg-white"
                >
                  {(() => {
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
                          if (!dc) return;
                          const dcKey = typeof dc === "object" ? (dc.id || dc.name) : String(dc);
                          const roomList = (dcKey && rms[dcKey]) || (typeof dc === "object" && dc.name && rms[dc.name]) || [];
                          if (Array.isArray(roomList)) {
                            roomList.forEach((rm: any) => {
                              if (!rm) return;
                              const rKey = typeof rm === "object" ? (rm.id || rm.name) : String(rm);
                              const rowList = (rKey && rws[rKey]) || [];
                              if (Array.isArray(rowList)) {
                                rowList.forEach((rw: any) => {
                                  if (!rw) return;
                                  const rwKey = typeof rw === "object" ? (rw.id || rw.name) : String(rw);
                                  const rackList = (rwKey && rks[rwKey]) || [];
                                  if (Array.isArray(rackList)) {
                                    rackList.forEach((rk: any) => {
                                      if (!rk) return;
                                      const rkName = typeof rk === "string" ? rk : (rk.name || rk.id);
                                      if (rkName) rackSet.add(String(rkName));
                                    });
                                  }
                                });
                              }
                            });
                          }
                        });
                      }

                      if (rks && typeof rks === "object") {
                        Object.values(rks).forEach((rackList: any) => {
                          if (Array.isArray(rackList)) {
                            rackList.forEach((rk: any) => {
                              if (!rk) return;
                              const rkName = typeof rk === "string" ? rk : (rk.name || rk.id);
                              if (rkName) rackSet.add(String(rkName));
                            });
                          }
                        });
                      }
                    } catch (_) {}

                    if (rackSet.size === 0) {
                      rackSet.add("Rack 1");
                      rackSet.add("Rack 2");
                    }

                    return Array.from(rackSet).map(rkName => (
                      <option key={rkName} value={rkName}>{rkName}</option>
                    ));
                  })()}
                </select>
              </div>
            </div>

            {/* Shared BMC Credentials */}
            <div className="grid grid-cols-12 items-center gap-4">
              <label className="col-span-4 text-xs font-bold text-slate-700 text-right">
                BMC Username & Password *
              </label>
              <div className="col-span-8 grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={ipmiUsername}
                  onChange={e => setIpmiUsername(e.target.value)}
                  placeholder="Username (e.g. admin)"
                  className="w-full px-3 py-2 border border-slate-300 rounded text-xs font-medium focus:outline-none focus:border-[#680505]"
                />
                <div className="relative flex items-center">
                  <input
                    type={showIpmiPassword ? "text" : "password"}
                    value={ipmiPassword}
                    onChange={e => setIpmiPassword(e.target.value)}
                    placeholder="Password"
                    className="w-full px-3 py-2 pr-9 border border-slate-300 rounded text-xs font-medium focus:outline-none focus:border-[#680505]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowIpmiPassword(!showIpmiPassword)}
                    className="absolute right-2 text-slate-400 hover:text-slate-600 focus:outline-none cursor-pointer"
                    title={showIpmiPassword ? "Hide password" : "Show password"}
                  >
                    {showIpmiPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>

            {/* Device Capacities */}
            <div className="grid grid-cols-12 items-center gap-4 pt-2 border-t border-slate-200">
              <label className="col-span-4 text-xs font-bold text-[#680505] text-right">Device Capacities *</label>
              <div className="col-span-8 grid grid-cols-3 gap-2">
                <div>
                  <span className="text-[10px] text-slate-500 font-bold block mb-0.5">Power (W)</span>
                  <input
                    type="number"
                    value={deratedPowerW}
                    onChange={e => setDeratedPowerW(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs font-medium focus:outline-none focus:border-[#680505]"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 font-bold block mb-0.5">Space (U)</span>
                  <input
                    type="number"
                    value={sizeU}
                    onChange={e => setSizeU(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs font-medium focus:outline-none focus:border-[#680505]"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 font-bold block mb-0.5">Weight (kg)</span>
                  <input
                    type="number"
                    value={weightKg}
                    onChange={e => setWeightKg(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs font-medium focus:outline-none focus:border-[#680505]"
                  />
                </div>
              </div>
            </div>

          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
            {onBackToDevicesNotInHierarchy && (
              <button
                type="button"
                onClick={onBackToDevicesNotInHierarchy}
                className="mr-auto text-xs font-bold text-[#680505] hover:underline cursor-pointer flex items-center gap-1"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Devices list</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded font-bold cursor-pointer text-xs transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2 bg-[#680505] hover:bg-[#520000] text-white rounded font-bold cursor-pointer text-xs shadow-xs flex items-center gap-1.5 transition-all disabled:opacity-50"
            >
              {isSubmitting ? (
                <RefreshCw className="w-4 h-4 text-white animate-spin" />
              ) : (
                <Plus className="w-4 h-4 text-white" />
              )}
              <span>
                {isSubmitting
                  ? "Validating BMC Credentials..."
                  : mode === "single"
                  ? "Save Device"
                  : `Save ${parsedBulkIps.length || 0} ${parsedBulkIps.length === 1 ? "Device" : "Devices"}`}
              </span>
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}

