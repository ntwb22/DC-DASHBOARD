import React, { useState } from "react";
import { X, Plus, Server, ArrowLeft, RefreshCw, Eye, EyeOff } from "lucide-react";
import { validateBmcCredentials, fetchServerDetailsForAddition } from "../services/redfishService";

export interface AddDeviceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddDevice: (deviceData: any) => void;
  onBackToDevicesNotInHierarchy?: () => void;
}

export function AddDeviceModal({
  isOpen,
  onClose,
  onAddDevice,
  onBackToDevicesNotInHierarchy
}: AddDeviceModalProps) {
  // Required Device Info
  const [name, setName] = useState("");
  const [ipAddress, setIpAddress] = useState("");
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const trimmedName = name.trim();
    const trimmedIp = ipAddress.trim();

    if (!trimmedName && !trimmedIp) {
      setFormError("Please enter a Device Name or IP Address.");
      return;
    }

    const deviceIp = trimmedIp || `172.16.12.${Math.floor(Math.random() * 150) + 10}`;
    const deviceName = trimmedName || `Tyrone Node (${deviceIp})`;
    const userStr = ipmiUsername.trim() || "admin";
    const passStr = ipmiPassword.trim() || "netweb@123";

    setIsSubmitting(true);
    let fetchedInfo: any = null;
    try {
      await validateBmcCredentials(deviceIp, userStr, passStr, category);
      fetchedInfo = await fetchServerDetailsForAddition(deviceIp, userStr, passStr, category);
    } catch (err: any) {
      console.warn("BMC ping/connection returned warning, creating device profile:", err);
    }
    setIsSubmitting(false);

    const generatedSerial = serialNumber.trim() || fetchedInfo?.serialNumber || undefined;
    const modelName = fetchedInfo?.model || "RH21XM";
    const manufacturerName = vendor.trim() !== "Tyrone Systems" ? vendor.trim() : (fetchedInfo?.manufacturer || "Tyrone Systems");

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


    // Remove from deleted keys in localStorage
    try {
      const rawDel = localStorage.getItem("tyrone_deleted_keys");
      if (rawDel) {
        const delSet = new Set<string>(JSON.parse(rawDel));
        const toRemove: string[] = [];
        delSet.forEach(k => {
          const lk = String(k).toLowerCase();
          if (
            lk === newDevice.id.toLowerCase() ||
            lk === newDevice.bmcIp.toLowerCase() ||
            lk === newDevice.name.toLowerCase()
          ) {
            toRemove.push(k);
          }
        });
        toRemove.forEach(k => delSet.delete(k));
        localStorage.setItem("tyrone_deleted_keys", JSON.stringify(Array.from(delSet)));
      }
    } catch (_) {}

    // Update tyrone_fleet in localStorage
    try {
      const saved = localStorage.getItem("tyrone_fleet");
      const currentFleet = saved ? JSON.parse(saved) : [];
      const updatedFleet = [...currentFleet.filter((s: any) => s.id !== newDevice.id && s.bmcIp !== newDevice.bmcIp), newDevice];
      localStorage.setItem("tyrone_fleet", JSON.stringify(updatedFleet));

      const savedRacks = localStorage.getItem("tyrone_server_racks");
      const racksObj = savedRacks ? JSON.parse(savedRacks) : {};
      racksObj[newDevice.id] = rack || "Rack 1";
      localStorage.setItem("tyrone_server_racks", JSON.stringify(racksObj));

      // Update global inventory cache with real fetched hardware details
      try {
        const cachedRaw = localStorage.getItem("tyrone_global_inv_cache");
        const cacheObj = cachedRaw ? JSON.parse(cachedRaw) : {};
        cacheObj[newDevice.id] = {
          serialNumber: generatedSerial || "N/A",
          model: modelName,
          manufacturer: manufacturerName
        };
        localStorage.setItem("tyrone_global_inv_cache", JSON.stringify(cacheObj));
      } catch (_) {}

      // Post to backend database with explicit vendor tag ('SM' or 'AS')
      fetch("http://127.0.0.1:8000/api/servers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: newDevice.id,
          name: newDevice.name,
          ip: newDevice.bmcIp,
          vendor: category, // 'SM' for Supermicro, 'AS' for ASRock
          username: newDevice.bmcUsername,
          password: newDevice.bmcPassword,
          rack: newDevice.rack
        })
      }).catch(() => {
        // Fallback local express post if main backend server is starting up
        fetch("/api/local/fleet", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updatedFleet)
        }).catch(() => {});
      });

      window.dispatchEvent(new CustomEvent("fleet-updated", { detail: { newDevice } }));
      window.dispatchEvent(new CustomEvent("hierarchy-updated"));
    } catch (err) {
      console.warn("Error persisting device to localStorage:", err);
    }

    onAddDevice(newDevice);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-2 bg-slate-950/75 backdrop-blur-xs select-none font-sans">
      <div className="bg-white border border-slate-300 rounded-xl shadow-2xl max-w-3xl w-full my-auto overflow-hidden flex flex-col">
        
        {/* Header Bar - Tyrone Red */}
        <div className="bg-[#680505] text-white px-4 py-2.5 flex items-center justify-between font-sans shrink-0 border-b border-[#4d0000]">
          <div className="flex items-center gap-2">
            <Plus className="w-4 h-4 text-white" />
            <span className="font-bold text-xs tracking-wide">Add New Device</span>
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
        <form onSubmit={handleSubmit} className="p-4 space-y-2.5 flex-1">
          
          {/* Sub-Tabs & Back Navigation */}
          <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (onBackToDevicesNotInHierarchy) {
                    onBackToDevicesNotInHierarchy();
                  } else {
                    onClose();
                  }
                }}
                className="px-3 py-1 text-[11px] font-bold rounded cursor-pointer bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
              >
                Devices not in Hierarchy
              </button>
              <button
                type="button"
                className="px-3 py-1 text-[11px] font-bold rounded cursor-pointer bg-[#680505] text-white shadow-xs"
              >
                Add New Device
              </button>
            </div>

            {onBackToDevicesNotInHierarchy && (
              <button
                type="button"
                onClick={onBackToDevicesNotInHierarchy}
                className="text-[11px] font-bold text-[#680505] hover:text-[#520000] hover:underline cursor-pointer flex items-center gap-1"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Devices not in Hierarchy</span>
              </button>
            )}
          </div>

          {formError && (
            <div className="p-2 bg-rose-50 border border-rose-300 rounded text-rose-800 text-[11px] font-bold flex items-center gap-2">
              <span>⚠️</span>
              <span>{formError}</span>
            </div>
          )}

          {/* Device Form Container */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
            
            <div className="border-b border-[#680505]/20 pb-2 flex items-center justify-between">
              <h4 className="text-xs font-black uppercase text-[#680505] tracking-wider flex items-center gap-1.5">
                <Server className="w-4 h-4 text-[#680505]" />
                <span>Device Information</span>
              </h4>
              <span className="text-[10px] text-slate-500 font-bold">* Indicates Required Fields</span>
            </div>

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

            {/* IP Address */}
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

            {/* BMC Credentials */}
            <div className="grid grid-cols-12 items-center gap-4">
              <label className="col-span-4 text-xs font-bold text-slate-700 text-right">BMC Username & Password</label>
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
              <span>{isSubmitting ? "Validating BMC Credentials..." : "Save Device"}</span>
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}
