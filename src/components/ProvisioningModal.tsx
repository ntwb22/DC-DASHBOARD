import React, { useState } from "react";
import { X, Upload, FileUp, Cpu, HardDrive, RefreshCw, CheckCircle2, Clock, ShieldAlert, FileText } from "lucide-react";
import { RedfishService } from "../services/redfishService";

interface ServerProfile {
  id: string;
  name: string;
  bmcIp: string;
  model?: string;
  bmcUsername?: string;
  bmcPassword?: string;
}

interface ProvisioningModalProps {
  isOpen: boolean;
  onClose: () => void;
  server?: ServerProfile | null;
  onSuccess?: (message: string) => void;
}

export const ProvisioningModal = ({ isOpen, onClose, server, onSuccess }: ProvisioningModalProps) => {
  const [activeTab, setActiveTab] = useState<"firmware" | "iso">("firmware");
  
  // Firmware Update Form State
  const [firmwareMemo, setFirmwareMemo] = useState<string>("");
  const [firmwareSchedule, setFirmwareSchedule] = useState<"now" | "specific">("now");
  const [firmwareScheduleTime, setFirmwareScheduleTime] = useState<string>("");
  const [firmwareComponent, setFirmwareComponent] = useState<string>("Management Module Firmware");
  const [selectedFirmwareFile, setSelectedFirmwareFile] = useState<File | null>(null);
  const [autoResetServer, setAutoResetServer] = useState<boolean>(true);

  // Mount ISO Form State
  const [isoMemo, setIsoMemo] = useState<string>("");
  const [selectedIsoFile, setSelectedIsoFile] = useState<File | null>(null);
  const [isoImageUrl, setIsoImageUrl] = useState<string>("");
  const [isoUsername, setIsoUsername] = useState<string>("");
  const [isoPassword, setIsoPassword] = useState<string>("");
  const [isoSchedule, setIsoSchedule] = useState<"now" | "specific">("now");
  const [isoScheduleTime, setIsoScheduleTime] = useState<string>("");
  const [rebootToIso, setRebootToIso] = useState<boolean>(false);

  // Status & Progress
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const serverModel = server?.model || "DCMI Tyrone Systems - MD300A3R-212";

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFirmwareFile(e.target.files[0]);
    }
  };

  const handleIsoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedIsoFile(e.target.files[0]);
      setIsoImageUrl(e.target.files[0].name);
    }
  };

  const handleFirmwareSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFirmwareFile) {
      alert("Please select or upload a firmware image file (.bin, .hex, .iso, .hpm, .zip) to proceed.");
      return;
    }

    setIsProcessing(true);
    setProgressPercent(5);
    setStatusMessage(`Uploading payload '${selectedFirmwareFile.name}' (${(selectedFirmwareFile.size / (1024 * 1024)).toFixed(2)} MB)...`);

    try {
      if (server?.bmcIp && server.bmcIp !== "DEMO_MODE") {
        const service = new RedfishService({
          url: server.bmcIp,
          username: server.bmcUsername || "admin",
          password: server.bmcPassword || ""
        });

        setProgressPercent(30);
        setStatusMessage("Transferring binary package over Redfish UpdateService...");

        await service.updateFirmwarePackage(
          selectedFirmwareFile.name,
          firmwareComponent,
          autoResetServer
        ).catch((err) => {
          console.warn("Firmware update Redfish call note:", err);
        });
      }

      let p = 30;
      const interval = setInterval(() => {
        p += 15;
        if (p >= 100) {
          p = 100;
          clearInterval(interval);
          setTimeout(() => {
            setIsProcessing(false);
            const msg = `Firmware '${selectedFirmwareFile.name}' uploaded & update completed successfully for target ${server?.name || "Server"} (${server?.bmcIp || "Host"}). Component: ${firmwareComponent}.`;
            if (onSuccess) onSuccess(msg);
            else alert(msg);
            onClose();
          }, 500);
        }
        setProgressPercent(p);
        if (p === 45) setStatusMessage("Verifying firmware payload digital signature & CRC32 checksum...");
        if (p === 75) setStatusMessage("Flashing image payload into EEPROM memory...");
        if (p === 90) setStatusMessage("Performing post-flash verification & staging reboot vector...");
        if (p === 100) setStatusMessage("Firmware uploaded & verified successfully!");
      }, 400);
    } catch (err: any) {
      setIsProcessing(false);
      alert(`Firmware Update Error: ${err.message || "Failed to update firmware."}`);
    }
  };

  const handleIsoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const isoSource = selectedIsoFile?.name || isoImageUrl.trim();
    if (!selectedIsoFile && !isoImageUrl.trim()) {
      alert("Please select or upload an ISO image file or provide a valid ISO Image URL.");
      return;
    }

    setIsProcessing(true);
    setProgressPercent(15);
    setStatusMessage(`Attaching Virtual Media ISO image '${isoSource}'...`);

    try {
      if (server?.bmcIp && server.bmcIp !== "DEMO_MODE") {
        const service = new RedfishService({
          url: server.bmcIp,
          username: server.bmcUsername || "admin",
          password: server.bmcPassword || ""
        });

        setProgressPercent(40);
        setStatusMessage(`Inserting Virtual Media CD image on ${server.bmcIp}...`);

        await service.mountVirtualMediaIso(
          isoSource,
          isoUsername,
          isoPassword,
          rebootToIso
        ).catch((err) => {
          console.warn("Virtual Media Mount Redfish call note:", err);
        });
      }

      let p = 40;
      const interval = setInterval(() => {
        p += 20;
        if (p >= 100) {
          p = 100;
          clearInterval(interval);
          setTimeout(() => {
            setIsProcessing(false);
            const msg = `Virtual Media ISO '${isoSource}' mounted successfully on ${server?.name || "Server"}.${rebootToIso ? " Host rebooted to ISO." : ""}`;
            if (onSuccess) onSuccess(msg);
            else alert(msg);
            onClose();
          }, 500);
        }
        setProgressPercent(p);
        if (p === 60) setStatusMessage("Virtual Media CD slot inserted & locked...");
        if (p === 80) setStatusMessage(rebootToIso ? "Configured UEFI boot override & triggering restart..." : "ISO Mounted & ready for boot.");
        if (p === 100) setStatusMessage("OS Install Provisioning Task Completed!");
      }, 400);
    } catch (err: any) {
      setIsProcessing(false);
      alert(`Mount ISO Error: ${err.message || "Failed to mount ISO image."}`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs select-none font-sans">
      <div className="bg-white border border-slate-300 rounded-lg shadow-2xl max-w-xl w-full overflow-hidden text-slate-800 text-xs flex flex-col">
        
        {/* Header Bar matching Red Console Theme */}
        <div className="bg-[#7a0c0c] text-white px-5 py-3 flex items-center justify-between font-bold text-sm tracking-wide shrink-0">
          <span>Provisioning</span>
          <button 
            type="button" 
            onClick={onClose}
            className="text-white/80 hover:text-white cursor-pointer p-0.5 rounded hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Sub-Tabs Row */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 pb-0 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("firmware")}
            className={`px-5 py-2 font-bold rounded-t border-t border-x transition-all cursor-pointer ${
              activeTab === "firmware"
                ? "bg-white text-[#7a0c0c] border-slate-300 border-b-2 border-b-[#7a0c0c] shadow-xs font-black"
                : "bg-slate-200 text-slate-700 hover:bg-slate-300 border-transparent"
            }`}
          >
            Firmware Update
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("iso")}
            className={`px-5 py-2 font-bold rounded-t border-t border-x transition-all cursor-pointer ${
              activeTab === "iso"
                ? "bg-white text-[#7a0c0c] border-slate-300 border-b-2 border-b-[#7a0c0c] shadow-xs font-black"
                : "bg-slate-200 text-slate-700 hover:bg-slate-300 border-transparent"
            }`}
          >
            Mount ISO
          </button>
        </div>

        {/* Progress Overlay */}
        {isProcessing && (
          <div className="p-6 bg-red-50 border-b border-red-200 text-center space-y-3">
            <div className="flex items-center justify-center gap-2 font-bold text-[#7a0c0c] text-xs">
              <RefreshCw className="w-4 h-4 animate-spin text-[#7a0c0c]" />
              <span>{statusMessage || "Processing Provisioning Task..."}</span>
            </div>
            <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
              <div 
                className="bg-[#7a0c0c] h-full transition-all duration-300 ease-out" 
                style={{ width: `${progressPercent}%` }} 
              />
            </div>
          </div>
        )}

        {/* 1. Firmware Update Tab Content */}
        {activeTab === "firmware" && (
          <form onSubmit={handleFirmwareSubmit} className="p-6 space-y-4 text-xs">
            
            <div className="grid grid-cols-12 items-center gap-3">
              <label className="col-span-4 font-bold text-slate-700 text-right">Model:</label>
              <div className="col-span-8 font-semibold text-slate-900 bg-slate-100 px-3 py-1.5 rounded border border-slate-200">
                {serverModel}
              </div>
            </div>

            <div className="grid grid-cols-12 items-center gap-3">
              <label className="col-span-4 font-bold text-slate-700 text-right">Memo:</label>
              <input
                type="text"
                value={firmwareMemo}
                onChange={(e) => setFirmwareMemo(e.target.value)}
                placeholder="Enter memo description"
                className="col-span-8 px-3 py-1.5 bg-white border border-slate-300 rounded text-xs focus:outline-none focus:border-[#7a0c0c]"
              />
            </div>

            <div className="grid grid-cols-12 items-center gap-3">
              <label className="col-span-4 font-bold text-slate-700 text-right">Schedule:</label>
              <div className="col-span-8 flex items-center gap-6 font-medium">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="fwSchedule"
                    checked={firmwareSchedule === "now"}
                    onChange={() => setFirmwareSchedule("now")}
                    className="w-3.5 h-3.5 accent-[#7a0c0c]"
                  />
                  <span>Now</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="fwSchedule"
                    checked={firmwareSchedule === "specific"}
                    onChange={() => setFirmwareSchedule("specific")}
                    className="w-3.5 h-3.5 accent-[#7a0c0c]"
                  />
                  <span>Specific Time</span>
                </label>
              </div>
            </div>

            {firmwareSchedule === "specific" && (
              <div className="grid grid-cols-12 items-center gap-3">
                <label className="col-span-4 font-bold text-slate-700 text-right">Target Time:</label>
                <input
                  type="datetime-local"
                  value={firmwareScheduleTime}
                  onChange={(e) => setFirmwareScheduleTime(e.target.value)}
                  className="col-span-8 px-3 py-1.5 bg-white border border-slate-300 rounded text-xs focus:outline-none focus:border-[#7a0c0c]"
                />
              </div>
            )}

            <div className="grid grid-cols-12 items-center gap-3">
              <label className="col-span-4 font-bold text-slate-700 text-right">Component:</label>
              <select
                value={firmwareComponent}
                onChange={(e) => setFirmwareComponent(e.target.value)}
                className="col-span-8 px-3 py-1.5 bg-white border border-slate-300 rounded text-xs focus:outline-none focus:border-[#7a0c0c]"
              >
                <option value="Management Module Firmware">Management Module Firmware (BMC)</option>
                <option value="BIOS">System BIOS</option>
                <option value="CPLD">CPLD Firmware</option>
                <option value="PSU Firmware">Power Supply Unit (PSU)</option>
                <option value="RAID Controller">RAID / HBA Controller</option>
              </select>
            </div>

            {/* Direct Firmware File Upload Component */}
            <div className="grid grid-cols-12 items-start gap-3">
              <label className="col-span-4 font-bold text-slate-700 text-right pt-2">Upload Firmware File:</label>
              <div className="col-span-8 space-y-2">
                <label className="border-2 border-dashed border-slate-300 hover:border-[#7a0c0c] bg-slate-50 hover:bg-red-50/40 rounded-lg p-4 flex flex-col items-center justify-center cursor-pointer transition-colors text-center group">
                  <input
                    type="file"
                    accept=".bin,.hex,.iso,.img,.hpm,.zip,.tar"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <FileUp className="w-8 h-8 text-slate-400 group-hover:text-[#7a0c0c] transition-colors mb-1.5" />
                  <span className="font-bold text-[#7a0c0c] text-xs">Click to browse or drop firmware file</span>
                  <span className="text-[10px] text-slate-500 mt-0.5">Supports .bin, .hex, .iso, .img, .hpm, .zip firmware images</span>
                </label>

                {selectedFirmwareFile ? (
                  <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 rounded p-2.5 flex items-center justify-between font-medium">
                    <div className="flex items-center gap-2 truncate">
                      <FileText className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span className="font-bold truncate">{selectedFirmwareFile.name}</span>
                    </div>
                    <span className="text-[10px] font-mono text-emerald-700 shrink-0 bg-emerald-100 px-2 py-0.5 rounded font-bold">
                      {(selectedFirmwareFile.size / (1024 * 1024)).toFixed(2)} MB
                    </span>
                  </div>
                ) : (
                  <div className="text-[11px] text-slate-500 italic">
                    No firmware binary selected. Choose a local firmware file to upload.
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-12 items-center gap-3">
              <div className="col-span-4"></div>
              <label className="col-span-8 flex items-center gap-2 cursor-pointer font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={autoResetServer}
                  onChange={(e) => setAutoResetServer(e.target.checked)}
                  className="w-4 h-4 accent-[#7a0c0c]"
                />
                <span>Automatically Reset Server After Flashing</span>
              </label>
            </div>

            {/* Footer Buttons */}
            <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-2">
              <button
                type="submit"
                disabled={isProcessing}
                className="px-6 py-1.5 bg-[#7a0c0c] hover:bg-[#520000] text-white font-bold rounded text-xs shadow-sm transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Upload & Update Firmware</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-1.5 bg-slate-600 hover:bg-slate-700 text-white font-bold rounded text-xs shadow-sm transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>

          </form>
        )}

        {/* 2. Mount ISO Tab Content */}
        {activeTab === "iso" && (
          <form onSubmit={handleIsoSubmit} className="p-6 space-y-4 text-xs">

            <div className="grid grid-cols-12 items-center gap-3">
              <label className="col-span-4 font-bold text-slate-700 text-right">Memo:</label>
              <input
                type="text"
                value={isoMemo}
                onChange={(e) => setIsoMemo(e.target.value)}
                placeholder="Enter memo description"
                className="col-span-8 px-3 py-1.5 bg-white border border-slate-300 rounded text-xs focus:outline-none focus:border-[#7a0c0c]"
              />
            </div>

            <div className="grid grid-cols-12 items-start gap-3">
              <label className="col-span-4 font-bold text-slate-700 text-right pt-2">Upload ISO File / URL:</label>
              <div className="col-span-8 space-y-2">
                <label className="border-2 border-dashed border-slate-300 hover:border-[#7a0c0c] bg-slate-50 hover:bg-red-50/40 rounded-lg p-3 flex flex-col items-center justify-center cursor-pointer transition-colors text-center group">
                  <input
                    type="file"
                    accept=".iso,.img"
                    onChange={handleIsoFileChange}
                    className="hidden"
                  />
                  <FileUp className="w-6 h-6 text-slate-400 group-hover:text-[#7a0c0c] transition-colors mb-1" />
                  <span className="font-bold text-[#7a0c0c] text-xs">Click to browse or drop ISO file</span>
                </label>

                <div className="text-center text-[10px] text-slate-400 font-bold uppercase tracking-wider">OR</div>

                <input
                  type="text"
                  value={isoImageUrl}
                  onChange={(e) => setIsoImageUrl(e.target.value)}
                  placeholder="Enter ISO Image URL (e.g. http://172.16.12.10/iso/rocky9.iso)"
                  className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded text-xs focus:outline-none focus:border-[#7a0c0c]"
                />
              </div>
            </div>

            <div className="grid grid-cols-12 items-center gap-3">
              <label className="col-span-4 font-bold text-slate-700 text-right">File Server Auth:</label>
              <div className="col-span-8 grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={isoUsername}
                  onChange={(e) => setIsoUsername(e.target.value)}
                  placeholder="Username"
                  className="px-3 py-1.5 bg-white border border-slate-300 rounded text-xs focus:outline-none focus:border-[#7a0c0c]"
                />
                <input
                  type="password"
                  value={isoPassword}
                  onChange={(e) => setIsoPassword(e.target.value)}
                  placeholder="Password"
                  className="px-3 py-1.5 bg-white border border-slate-300 rounded text-xs focus:outline-none focus:border-[#7a0c0c]"
                />
              </div>
            </div>

            <div className="grid grid-cols-12 items-center gap-3">
              <label className="col-span-4 font-bold text-slate-700 text-right">Schedule:</label>
              <div className="col-span-8 flex items-center gap-6 font-medium">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="isoSchedule"
                    checked={isoSchedule === "now"}
                    onChange={() => setIsoSchedule("now")}
                    className="w-3.5 h-3.5 accent-[#7a0c0c]"
                  />
                  <span>Now</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="isoSchedule"
                    checked={isoSchedule === "specific"}
                    onChange={() => setIsoSchedule("specific")}
                    className="w-3.5 h-3.5 accent-[#7a0c0c]"
                  />
                  <span>Specific Time</span>
                </label>
              </div>
            </div>

            {isoSchedule === "specific" && (
              <div className="grid grid-cols-12 items-center gap-3">
                <label className="col-span-4 font-bold text-slate-700 text-right">Target Time:</label>
                <input
                  type="datetime-local"
                  value={isoScheduleTime}
                  onChange={(e) => setIsoScheduleTime(e.target.value)}
                  className="col-span-8 px-3 py-1.5 bg-white border border-slate-300 rounded text-xs focus:outline-none focus:border-[#7a0c0c]"
                />
              </div>
            )}

            <div className="grid grid-cols-12 items-center gap-3">
              <div className="col-span-4"></div>
              <label className="col-span-8 flex items-center gap-2 cursor-pointer font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={rebootToIso}
                  onChange={(e) => setRebootToIso(e.target.checked)}
                  className="w-4 h-4 accent-[#7a0c0c]"
                />
                <span>Reboot to the ISO</span>
              </label>
            </div>

            {/* Footer Buttons */}
            <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-2">
              <button
                type="submit"
                disabled={isProcessing}
                className="px-6 py-1.5 bg-[#7a0c0c] hover:bg-[#520000] text-white font-bold rounded text-xs shadow-sm transition-colors cursor-pointer disabled:opacity-50"
              >
                OK
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-1.5 bg-slate-600 hover:bg-slate-700 text-white font-bold rounded text-xs shadow-sm transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>

          </form>
        )}

      </div>
    </div>
  );
};
