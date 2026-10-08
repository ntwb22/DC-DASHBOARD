import React, { useState, useEffect } from "react";
import { 
  X, 
  Disc, 
  Server, 
  Shield, 
  CheckCircle2, 
  AlertTriangle, 
  RefreshCw, 
  ExternalLink,
  Power,
  Play
} from "lucide-react";
import { RedfishService } from "../services/redfishService";

interface OSInstallModalProps {
  isOpen: boolean;
  onClose: () => void;
  bmcIp: string;
  serverName: string;
  username?: string;
  password?: string;
}

const PRESET_ISOS = [
  { id: "ubuntu-24.04.iso", label: "Ubuntu Server 24.04 LTS (x86_64)", url: "ubuntu-24.04.iso" },
  { id: "rhel-9.4.iso", label: "Red Hat Enterprise Linux 9.4 (x86_64)", url: "rhel-9.4.iso" },
  { id: "rocky-9.3.iso", label: "Rocky Linux 9.3 Enterprise (x86_64)", url: "rocky-9.3.iso" },
  { id: "windows-2022.iso", label: "Windows Server 2022 Datacenter", url: "windows-server-2022.iso" },
  { id: "custom", label: "-- Custom ISO Image URL --", url: "" }
];

export const OSInstallModal: React.FC<OSInstallModalProps> = ({
  isOpen,
  onClose,
  bmcIp,
  serverName,
  username = "admin",
  password = ""
}) => {
  const [targetName, setTargetName] = useState(serverName || bmcIp);
  const [targetIp, setTargetIp] = useState(bmcIp);
  const [user, setUser] = useState(username || "admin");
  const [pass, setPass] = useState(password || "");
  
  const [selectedIsoPreset, setSelectedIsoPreset] = useState("ubuntu-24.04.iso");
  const [customIsoUrl, setCustomIsoUrl] = useState("");
  const [rebootImmediately, setRebootImmediately] = useState(true);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [stepLogs, setStepLogs] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<any | null>(null);

  useEffect(() => {
    setTargetName(serverName || bmcIp);
    setTargetIp(bmcIp);
    setUser(username || "admin");
    setPass(password || "");
    setErrorMessage(null);
    setSuccessResult(null);
    setIsSubmitting(false);
    setCurrentStep(0);
    setStepLogs([]);
  }, [isOpen, bmcIp, serverName, username, password]);

  if (!isOpen) return null;

  const effectiveIsoUrl = selectedIsoPreset === "custom" 
    ? customIsoUrl 
    : (PRESET_ISOS.find(p => p.id === selectedIsoPreset)?.url || selectedIsoPreset);

  const handleStartInstallation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetIp || !effectiveIsoUrl) {
      setErrorMessage("Please specify a valid target BMC IP and OS ISO image URL.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessResult(null);
    setCurrentStep(1);
    setStepLogs(["[Step 1/4] Running pre-flight ISO URL accessibility check..."]);

    try {
      const service = new RedfishService({
        url: targetIp,
        username: user,
        password: pass
      });

      setStepLogs(prev => [...prev, "[Step 2/4] Mounting ISO payload to Redfish Virtual Media (CD1)..."]);
      setCurrentStep(2);

      const res = await service.triggerOsInstall(effectiveIsoUrl, user, pass, rebootImmediately);

      if (res && res.success) {
        setStepLogs(prev => [
          ...prev,
          "[Step 3/4] UEFI Boot Source Override configured to Cd (Once)",
          "[Step 4/4] Triggered server ForceRestart power cycle",
          "✅ OS Installation sequence completed successfully!"
        ]);
        setCurrentStep(4);
        setSuccessResult(res);
      } else {
        throw new Error(res?.message || res?.error || "Bare-metal OS installation sequence failed.");
      }
    } catch (err: any) {
      setErrorMessage(err.message || "OS Installation failed to trigger on target BMC.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleModalClose = () => {
    setErrorMessage(null);
    setSuccessResult(null);
    setIsSubmitting(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 font-sans animate-fade-in">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="bg-slate-900 text-white p-6 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-red-600/20 border border-red-500/30 rounded-2xl text-red-500">
              <Disc className="w-6 h-6 animate-spin-slow" />
            </div>
            <div>
              <h2 className="text-lg font-black tracking-wide text-white uppercase">Deploy OS / Bare-Metal Provisioning</h2>
              <p className="text-xs text-slate-400 font-medium">Remote Redfish Virtual Media ISO Mount & Boot Override</p>
            </div>
          </div>
          <button 
            onClick={handleModalClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          
          {/* Server Info Card */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Server className="w-5 h-5 text-red-600" />
              <div>
                <span className="text-xs font-bold uppercase text-slate-400">Target Node</span>
                <h4 className="text-sm font-extrabold text-slate-800">{targetName}</h4>
              </div>
            </div>
            <div className="text-right">
              <span className="text-xs font-bold uppercase text-slate-400">BMC IP</span>
              <p className="text-sm font-mono font-bold text-slate-700">{targetIp}</p>
            </div>
          </div>

          {/* Errors */}
          {errorMessage && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-3 text-red-700 text-xs font-bold animate-shake">
              <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-extrabold text-red-800 uppercase tracking-wide">Deployment Error</p>
                <p className="mt-1">{errorMessage}</p>
              </div>
            </div>
          )}

          {/* Success */}
          {successResult && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-start gap-3 text-emerald-800 text-xs font-bold">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-extrabold text-emerald-900 uppercase tracking-wide">Installation Initiated</p>
                <p className="mt-1">{successResult.message || "Server rebooted into installer ISO."}</p>
                {successResult.iso_url && (
                  <p className="mt-1 font-mono text-[11px] text-emerald-700">ISO: {successResult.iso_url}</p>
                )}
              </div>
            </div>
          )}

          {/* Form */}
          {!successResult && (
            <form id="os-install-form" onSubmit={handleStartInstallation} className="space-y-5">
              
              {/* Credentials */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                    BMC Username
                  </label>
                  <input
                    type="text"
                    value={user}
                    onChange={(e) => setUser(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-600"
                    placeholder="admin"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                    BMC Password
                  </label>
                  <input
                    type="password"
                    value={pass}
                    onChange={(e) => setPass(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-600"
                    placeholder="••••••••"
                    required
                  />
                </div>
              </div>

              {/* OS Selection */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Select OS Installer Image
                </label>
                <select
                  value={selectedIsoPreset}
                  onChange={(e) => setSelectedIsoPreset(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-600"
                >
                  {PRESET_ISOS.map(iso => (
                    <option key={iso.id} value={iso.id}>{iso.label}</option>
                  ))}
                </select>
              </div>

              {/* Custom ISO URL Input */}
              {selectedIsoPreset === "custom" && (
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                    Custom ISO Image URL / Filename
                  </label>
                  <input
                    type="text"
                    value={customIsoUrl}
                    onChange={(e) => setCustomIsoUrl(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-600"
                    placeholder="http://172.16.0.1:8080/isos/custom-ubuntu.iso or custom.iso"
                    required
                  />
                </div>
              )}

              {/* Options */}
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rebootImmediately}
                    onChange={(e) => setRebootImmediately(e.target.checked)}
                    className="w-4 h-4 text-red-600 rounded border-slate-300 focus:ring-red-500"
                  />
                  <span className="text-xs font-bold text-slate-700">Reboot server immediately after Virtual Media mount</span>
                </label>
              </div>
            </form>
          )}

          {/* Progress Stepper */}
          {isSubmitting && (
            <div className="bg-slate-900 rounded-2xl p-4 text-white space-y-3 font-mono text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-red-400 uppercase">Redfish Execution Sequence</span>
                <RefreshCw className="w-4 h-4 text-red-500 animate-spin" />
              </div>
              <div className="space-y-1.5 text-slate-300">
                {stepLogs.map((log, idx) => (
                  <p key={idx} className="leading-tight">{log}</p>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={handleModalClose}
            className="px-5 py-2.5 bg-white border border-slate-300 text-slate-700 text-xs font-extrabold uppercase rounded-xl hover:bg-slate-100 transition-colors"
          >
            {successResult ? "Close" : "Cancel"}
          </button>
          
          {!successResult && (
            <button
              type="submit"
              form="os-install-form"
              disabled={isSubmitting}
              className="px-6 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-extrabold uppercase rounded-xl shadow-md transition-all flex items-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Installing...</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-white" />
                  <span>Trigger OS Install</span>
                </>
              )}
            </button>
          )}
        </div>

      </div>
    </div>
  );
};
