import React, { useState, useEffect } from "react";
import { X, ExternalLink, CheckCircle2, AlertCircle, RefreshCw, Key, ShieldCheck, Mail, Building2, Server, Download, Upload, Check } from "lucide-react";
import { licenseService, LicenseData } from "../services/licenseService";

export interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
  serverCount?: number;
}

export function AboutModal({ isOpen, onClose, serverCount = 12 }: AboutModalProps) {
  const [activeTab, setActiveTab] = useState<
    "about_tcm" | "license_info" | "license_request" | "license_types" | "contact_us"
  >("about_tcm");

  const [checkingRelease, setCheckingRelease] = useState(false);
  const [releaseStatus, setReleaseStatus] = useState<string | null>(null);

  // Live License State
  const [license, setLicense] = useState<LicenseData>(() => licenseService.getLicense());
  const [inputKey, setInputKey] = useState("");
  const [keyMessage, setKeyMessage] = useState<{ success: boolean; text: string } | null>(null);

  // License Request form state
  const [requestCompany, setRequestCompany] = useState("");
  const [requestEmail, setRequestEmail] = useState("");
  const [requestNodes, setRequestNodes] = useState("500");
  const [requestSubmitted, setRequestSubmitted] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setLicense(licenseService.getLicense());
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCheckReleases = (e: React.MouseEvent) => {
    e.preventDefault();
    setCheckingRelease(true);
    setReleaseStatus(null);
    setTimeout(() => {
      setCheckingRelease(false);
      setReleaseStatus("You are currently running the latest version of Tyrone Core Console (6.2.0.bc154458).");
    }, 1200);
  };

  const handleApplyKey = (keyOrEvent: string | React.FormEvent) => {
    let keyToApply = inputKey;
    if (typeof keyOrEvent === "string") {
      keyToApply = keyOrEvent;
    } else if (keyOrEvent && (keyOrEvent as React.FormEvent).preventDefault) {
      (keyOrEvent as React.FormEvent).preventDefault();
    }
    if (!keyToApply.trim()) return;
    const res = licenseService.applyKey(keyToApply);
    if (res.success && res.license) {
      setLicense(res.license);
      setKeyMessage({ success: true, text: `Successfully activated ${res.license.edition} Edition license!` });
      setInputKey("");
    } else {
      setKeyMessage({ success: false, text: res.message });
    }
  };

  const handleLicenseSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    licenseService.generateLicenseRequestFile(requestCompany, requestEmail, parseInt(requestNodes, 10));
    setRequestSubmitted(true);
  };

  const nodeUsagePct = Math.min(100, Math.round((serverCount / license.maxNodes) * 100));

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fade-in select-none font-sans">
      <div className="bg-white rounded-md shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col border border-slate-400 text-slate-800 max-h-[90vh]">
        {/* Top Header Bar - Tyrone Red */}
        <div className="bg-[#680505] text-white px-4 py-2.5 flex items-center justify-between relative select-none border-b border-[#4d0000]">
          <div className="w-6"></div>
          <h2 className="text-base font-bold tracking-wide text-center flex-1">About & Enterprise Licensing</h2>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white transition-colors cursor-pointer p-0.5 rounded hover:bg-[#520000]"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Main Body (Sidebar + Content) */}
        <div className="flex flex-1 min-h-[480px] overflow-hidden">
          {/* Left Sidebar Menu (Tyrone Red Theme) */}
          <div className="w-56 bg-[#680505] text-white flex flex-col justify-between p-0 shrink-0 select-none border-r border-[#4d0000]">
            <div className="py-2">
              <nav className="space-y-0">
                <button
                  onClick={() => setActiveTab("about_tcm")}
                  className={`w-full text-left px-5 py-2.5 text-xs font-semibold transition-colors flex items-center justify-between cursor-pointer ${
                    activeTab === "about_tcm"
                      ? "bg-white text-[#680505] font-bold shadow-xs"
                      : "text-white hover:bg-[#520000]"
                  }`}
                >
                  <span>About Core Console</span>
                </button>

                <button
                  onClick={() => setActiveTab("license_info")}
                  className={`w-full text-left px-5 py-2.5 text-xs font-semibold transition-colors flex items-center justify-between cursor-pointer ${
                    activeTab === "license_info"
                      ? "bg-white text-[#680505] font-bold shadow-xs"
                      : "text-white hover:bg-[#520000]"
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    License Information
                    {license.status === "Active" && (
                      <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block"></span>
                    )}
                  </span>
                </button>

                <button
                  onClick={() => setActiveTab("license_request")}
                  className={`w-full text-left px-5 py-2.5 text-xs font-semibold transition-colors flex items-center justify-between cursor-pointer ${
                    activeTab === "license_request"
                      ? "bg-white text-[#680505] font-bold shadow-xs"
                      : "text-white hover:bg-[#520000]"
                  }`}
                >
                  <span>License Request</span>
                </button>

                <button
                  onClick={() => setActiveTab("license_types")}
                  className={`w-full text-left px-5 py-2.5 text-xs font-semibold transition-colors flex items-center justify-between cursor-pointer ${
                    activeTab === "license_types"
                      ? "bg-white text-[#680505] font-bold shadow-xs"
                      : "text-white hover:bg-[#520000]"
                  }`}
                >
                  <span>License Types</span>
                </button>

                <button
                  onClick={() => setActiveTab("contact_us")}
                  className={`w-full text-left px-5 py-2.5 text-xs font-semibold transition-colors flex items-center justify-between cursor-pointer ${
                    activeTab === "contact_us"
                      ? "bg-white text-[#680505] font-bold shadow-xs"
                      : "text-white hover:bg-[#520000]"
                  }`}
                >
                  <span>Contact Us</span>
                </button>
              </nav>
            </div>

            {/* Bottom Tyrone Logo */}
            <div className="p-6">
              <span className="text-white font-extrabold text-2xl tracking-tighter uppercase font-sans">
                Tyrone
              </span>
            </div>
          </div>

          {/* Right Content Area */}
          <div className="flex-1 bg-white p-6 overflow-y-auto flex flex-col justify-between">
            <div>
              {/* TAB 1: About Core Console */}
              {activeTab === "about_tcm" && (
                <div className="space-y-6 animate-fade-in">
                  {/* Version Information Section */}
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 border-b border-slate-300 pb-1 mb-3">
                      Version Information
                    </h3>

                    <div className="border border-slate-300 text-xs">
                      <div className="grid grid-cols-12 border-b border-slate-200 py-1.5 px-3">
                        <div className="col-span-5 font-semibold text-slate-800 text-right pr-4">
                          Product Name
                        </div>
                        <div className="col-span-7 text-slate-700 font-medium">
                          Tyrone Core Console
                        </div>
                      </div>

                      <div className="grid grid-cols-12 border-b border-slate-200 py-1.5 px-3 bg-slate-50/50">
                        <div className="col-span-5 font-semibold text-slate-800 text-right pr-4">
                          Product Version
                        </div>
                        <div className="col-span-7 text-slate-700 font-mono">
                          6.2.0.bc154458
                        </div>
                      </div>

                      <div className="grid grid-cols-12 py-1.5 px-3">
                        <div className="col-span-5 font-semibold text-slate-800 text-right pr-4">
                          License Status
                        </div>
                        <div className="col-span-7 font-bold flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full ${license.status === "Active" ? "bg-emerald-500" : "bg-red-600"}`}></span>
                          <span className={license.status === "Active" ? "text-emerald-700" : "text-red-600"}>
                            {license.edition} Edition ({license.status})
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>


                  {/* Check for New Releases Section */}
                  <div>
                    <div className="flex items-center justify-between border-b border-slate-300 pb-1 mb-2">
                      <h3 className="text-sm font-bold text-slate-800">
                        Check for New Releases
                      </h3>
                      <a
                        href="#check-releases"
                        onClick={handleCheckReleases}
                        className="text-xs text-[#680505] hover:text-[#520000] underline font-normal flex items-center gap-1"
                      >
                        {checkingRelease && <RefreshCw className="w-3 h-3 animate-spin text-[#680505]" />}
                        Check for New Releases
                      </a>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Use the link to check if there is a new product release available. Internet connectivity required.
                    </p>
                    {releaseStatus && (
                      <div className="mt-2.5 p-2 bg-red-50 border border-red-200 rounded text-xs text-[#680505] flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-[#680505] shrink-0" />
                        <span>{releaseStatus}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 2: License Information */}
              {activeTab === "license_info" && (
                <div className="space-y-5 animate-fade-in">
                  <div>
                    <div className="flex items-center justify-between border-b border-slate-300 pb-1 mb-3">
                      <h3 className="text-sm font-bold text-slate-800">
                        Active Enterprise License
                      </h3>
                      <span className="bg-[#680505] text-white text-[10px] font-bold uppercase px-2 py-0.5 rounded">
                        {license.edition} Edition
                      </span>
                    </div>

                    <div className="border border-slate-300 text-xs rounded overflow-hidden">
                      <div className="grid grid-cols-12 border-b border-slate-200 py-1.5 px-3">
                        <div className="col-span-5 font-semibold text-slate-800 text-right pr-4">
                          License Serial Key
                        </div>
                        <div className="col-span-7 text-[#680505] font-mono font-bold">
                          {license.serialKey}
                        </div>
                      </div>
                      <div className="grid grid-cols-12 border-b border-slate-200 py-1.5 px-3 bg-slate-50/50">
                        <div className="col-span-5 font-semibold text-slate-800 text-right pr-4">
                          Licensed Organization
                        </div>
                        <div className="col-span-7 text-slate-800 font-medium">
                          {license.company}
                        </div>
                      </div>
                      <div className="grid grid-cols-12 border-b border-slate-200 py-1.5 px-3">
                        <div className="col-span-5 font-semibold text-slate-800 text-right pr-4">
                          Node Capacity Usage
                        </div>
                        <div className="col-span-7 space-y-1">
                          <div className="flex justify-between items-center text-slate-700 font-semibold">
                            <span>{serverCount} / {license.maxNodes} Nodes Managed</span>
                            <span>{nodeUsagePct}%</span>
                          </div>
                          <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                            <div
                              className="bg-[#680505] h-full transition-all duration-500"
                              style={{ width: `${nodeUsagePct}%` }}
                            ></div>
                          </div>
                        </div>
                      </div>
                      <div className="grid grid-cols-12 border-b border-slate-200 py-1.5 px-3 bg-slate-50/50">
                        <div className="col-span-5 font-semibold text-slate-800 text-right pr-4">
                          Expiration Date
                        </div>
                        <div className="col-span-7 text-slate-700 font-medium">
                          {license.expirationDate} ({license.status})
                        </div>
                      </div>
                      <div className="grid grid-cols-12 py-1.5 px-3">
                        <div className="col-span-5 font-semibold text-slate-800 text-right pr-4">
                          Active Entitlements
                        </div>
                        <div className="col-span-7 text-slate-600">
                          <ul className="list-disc pl-4 space-y-0.5">
                            {license.features.map((feat, idx) => (
                              <li key={idx}>{feat}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Activate / Upgrade Key Form */}
                  <div className="bg-slate-50 border border-slate-300 p-3.5 rounded space-y-2 text-xs">
                    <div className="font-bold text-slate-800 flex items-center gap-1.5">
                      <Key className="w-4 h-4 text-[#680505]" />
                      Activate / Upgrade Product License Key
                    </div>
                    <form onSubmit={handleApplyKey} className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="Enter Key (e.g. TYR-CORE-DC-2027-8899)"
                        value={inputKey}
                        onChange={(e) => setInputKey(e.target.value)}
                        className="flex-1 px-3 py-1.5 border border-slate-300 rounded font-mono text-xs focus:ring-1 focus:ring-[#680505] focus:outline-none bg-white uppercase"
                      />
                      <button
                        type="submit"
                        className="px-4 py-1.5 bg-[#680505] hover:bg-[#520000] text-white font-semibold text-xs rounded cursor-pointer transition-colors shadow-xs"
                      >
                        Apply Key
                      </button>
                    </form>
                    {keyMessage && (
                      <div className={`p-2 rounded text-xs flex items-center gap-2 ${keyMessage.success ? "bg-emerald-50 text-emerald-800 border border-emerald-200" : "bg-red-50 text-red-800 border border-red-200"}`}>
                        {keyMessage.success ? <Check className="w-4 h-4 text-emerald-600 shrink-0" /> : <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />}
                        <span>{keyMessage.text}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 3: License Request */}
              {activeTab === "license_request" && (
                <div className="space-y-4 animate-fade-in">
                  <h3 className="text-sm font-bold text-slate-800 border-b border-slate-300 pb-1 mb-3">
                    Generate License Request (.req File)
                  </h3>

                  {requestSubmitted ? (
                    <div className="bg-red-50 border border-red-200 p-4 rounded text-xs text-[#680505] space-y-2">
                      <div className="flex items-center gap-2 font-bold text-sm text-[#680505]">
                        <CheckCircle2 className="w-5 h-5 text-[#680505]" />
                        License Request File Downloaded
                      </div>
                      <p>
                        Your encrypted license request file has been downloaded for hardware MAC <code className="bg-red-100 px-1 py-0.5 rounded font-mono">00:15:5D:8A:12:34</code>.
                      </p>
                      <p className="text-slate-600">
                        Please email this request file to <strong className="text-slate-800">support@netwebindia.com</strong> or submit it to your Netweb account representative to receive your signed enterprise product key.
                      </p>
                      <button
                        onClick={() => setRequestSubmitted(false)}
                        className="mt-2 text-xs text-[#680505] hover:underline font-semibold cursor-pointer"
                      >
                        ← Back to request form
                      </button>
                    </div>
                  ) : (
                    <form onSubmit={handleLicenseSubmit} className="space-y-3 text-xs">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-slate-700 font-semibold mb-1">Hardware MAC Address</label>
                          <input
                            type="text"
                            readOnly
                            value="00:15:5D:8A:12:34"
                            className="w-full px-2.5 py-1.5 bg-slate-100 border border-slate-300 rounded font-mono text-slate-600 cursor-not-allowed"
                          />
                        </div>
                        <div>
                          <label className="block text-slate-700 font-semibold mb-1">Company / Organization</label>
                          <input
                            type="text"
                            required
                            placeholder="e.g. Netweb Tech Solutions"
                            value={requestCompany}
                            onChange={(e) => setRequestCompany(e.target.value)}
                            className="w-full px-2.5 py-1.5 border border-slate-300 rounded focus:ring-1 focus:ring-[#680505] focus:outline-none"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-slate-700 font-semibold mb-1">Contact Email</label>
                          <input
                            type="email"
                            required
                            placeholder="admin@example.com"
                            value={requestEmail}
                            onChange={(e) => setRequestEmail(e.target.value)}
                            className="w-full px-2.5 py-1.5 border border-slate-300 rounded focus:ring-1 focus:ring-[#680505] focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-slate-700 font-semibold mb-1">Requested Node Capacity</label>
                          <select
                            value={requestNodes}
                            onChange={(e) => setRequestNodes(e.target.value)}
                            className="w-full px-2.5 py-1.5 border border-slate-300 rounded focus:ring-1 focus:ring-[#680505] focus:outline-none bg-white"
                          >
                            <option value="100">100 Nodes (Standard)</option>
                            <option value="500">500 Nodes (Enterprise)</option>
                            <option value="10000">10000+ Nodes (Datacenter Cluster)</option>
                          </select>
                        </div>
                      </div>

                      <div className="pt-2">
                        <button
                          type="submit"
                          className="px-4 py-1.5 bg-[#680505] hover:bg-[#520000] text-white font-semibold text-xs rounded transition-colors shadow-xs cursor-pointer flex items-center gap-1.5"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Generate & Download Request File</span>
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              )}

              {/* TAB 4: License Types */}
              {activeTab === "license_types" && (
                <div className="space-y-4 animate-fade-in text-xs">
                  <h3 className="text-sm font-bold text-slate-800 border-b border-slate-300 pb-1 mb-3">
                    Available Tyrone Core Console Enterprise Editions
                  </h3>

                  {keyMessage && (
                    <div className={`p-2.5 rounded text-xs flex items-center gap-2 mb-2 ${keyMessage.success ? "bg-emerald-50 text-emerald-800 border border-emerald-200" : "bg-red-50 text-red-800 border border-red-200"}`}>
                      {keyMessage.success ? <Check className="w-4 h-4 text-emerald-600 shrink-0" /> : <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />}
                      <span>{keyMessage.text}</span>
                    </div>
                  )}

                  <div className="grid grid-cols-3 gap-3">
                    {/* Standard Edition Card */}
                    <div
                      onClick={() => handleApplyKey("TYR-CORE-STD-2027-1001")}
                      className={`border rounded-lg p-3 flex flex-col justify-between cursor-pointer transition-all duration-200 relative ${
                        license.edition === "Standard"
                          ? "border-2 border-[#680505] bg-red-50/30 shadow-md"
                          : "border-slate-300 bg-slate-50/50 hover:border-[#680505]/60 hover:bg-slate-100/80 hover:shadow-xs"
                      }`}
                    >
                      {license.edition === "Standard" && (
                        <span className="absolute -top-2.5 right-2 bg-[#680505] text-white text-[9px] font-bold uppercase px-1.5 py-0.5 rounded shadow-2xs">
                          Active Edition
                        </span>
                      )}
                      <div>
                        <div className="font-bold text-slate-800 text-sm border-b border-slate-200 pb-1 mb-2 flex justify-between items-center">
                          <span className={license.edition === "Standard" ? "text-[#680505]" : "text-slate-800"}>Standard</span>
                        </div>
                        <ul className="space-y-1 text-slate-600">
                          <li>• Up to 100 Server Nodes</li>
                          <li>• Basic Redfish Telemetry</li>
                          <li>• Thermal Monitoring</li>
                          <li>• Email Alerts</li>
                        </ul>
                      </div>
                      <div className="mt-3 pt-2 border-t border-slate-200/60 flex items-center justify-between">
                        <span className="text-[11px] text-[#680505] font-bold">
                          {license.edition === "Standard" ? "Currently Active" : "Switch to Standard →"}
                        </span>
                      </div>
                    </div>

                    {/* Enterprise Edition Card */}
                    <div
                      onClick={() => handleApplyKey("TYR-CORE-ENT-2028-9902")}
                      className={`border-2 rounded-lg p-3 flex flex-col justify-between cursor-pointer transition-all duration-200 relative ${
                        license.edition === "Enterprise"
                          ? "border-[#680505] bg-red-50/30 shadow-md"
                          : "border-slate-300 bg-slate-50/50 hover:border-[#680505]/60 hover:bg-slate-100/80 hover:shadow-xs"
                      }`}
                    >
                      {license.edition === "Enterprise" && (
                        <span className="absolute -top-2.5 right-2 bg-[#680505] text-white text-[9px] font-bold uppercase px-1.5 py-0.5 rounded shadow-2xs">
                          Active Edition
                        </span>
                      )}
                      <div>
                        <div className="font-bold text-[#680505] text-sm border-b border-red-200 pb-1 mb-2">
                          Enterprise
                        </div>
                        <ul className="space-y-1 text-slate-700">
                          <li>• Up to 500 Server Nodes</li>
                          <li>• Full Redfish & IPMI</li>
                          <li>• 3D Rack & Hierarchy View</li>
                          <li>• AIOps Anomaly Engine</li>
                          <li>• REST & SNMP Integration</li>
                        </ul>
                      </div>
                      <div className="mt-[#680505] mt-3 pt-2 border-t border-red-200/60 flex items-center justify-between">
                        <span className="text-[#680505] text-[11px] font-bold">
                          {license.edition === "Enterprise" ? "Currently Active" : "Activate Enterprise →"}
                        </span>
                      </div>
                    </div>

                    {/* Datacenter Edition Card */}
                    <div
                      onClick={() => handleApplyKey("TYR-CORE-DC-2030-9999")}
                      className={`border rounded-lg p-3 flex flex-col justify-between cursor-pointer transition-all duration-200 relative ${
                        license.edition === "Datacenter"
                          ? "border-2 border-[#680505] bg-red-50/30 shadow-md"
                          : "border-slate-300 bg-slate-50/50 hover:border-[#680505]/60 hover:bg-slate-100/80 hover:shadow-xs"
                      }`}
                    >
                      {license.edition === "Datacenter" && (
                        <span className="absolute -top-2.5 right-2 bg-[#680505] text-white text-[9px] font-bold uppercase px-1.5 py-0.5 rounded shadow-2xs">
                          Active Edition
                        </span>
                      )}
                      <div>
                        <div className="font-bold text-slate-800 text-sm border-b border-slate-200 pb-1 mb-2 flex justify-between items-center">
                          <span className={license.edition === "Datacenter" ? "text-[#680505]" : "text-slate-800"}>Datacenter</span>
                        </div>
                        <ul className="space-y-1 text-slate-600">
                          <li>• Unlimited Server Nodes</li>
                          <li>• High Availability Cluster</li>
                          <li>• Multi-tenant Hierarchy</li>
                          <li>• Custom GPU Diagnostics</li>
                          <li>• 24/7 Dedicated SLA</li>
                        </ul>
                      </div>
                      <div className="mt-3 pt-2 border-t border-slate-200/60 flex items-center justify-between">
                        <span className="text-[11px] text-[#680505] font-bold">
                          {license.edition === "Datacenter" ? "Currently Active" : "Upgrade to Datacenter →"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 5: Contact Us */}
              {activeTab === "contact_us" && (
                <div className="space-y-4 animate-fade-in text-xs">
                  <h3 className="text-sm font-bold text-slate-800 border-b border-slate-300 pb-1 mb-3">
                    Contact Netweb Technologies
                  </h3>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="border border-slate-200 rounded p-3 bg-slate-50">
                      <div className="flex items-center gap-2 font-bold text-slate-800 mb-2">
                        <Building2 className="w-4 h-4 text-[#680505]" />
                        Corporate Office
                      </div>
                      <p className="text-slate-600 leading-relaxed">
                        Netweb Technologies India Ltd.<br />
                        Plot No. 1, Sector 27B, Mathura Road,<br />
                        Faridabad, Haryana - 121003, India.
                      </p>
                    </div>

                    <div className="border border-slate-200 rounded p-3 bg-slate-50">
                      <div className="flex items-center gap-2 font-bold text-slate-800 mb-2">
                        <Mail className="w-4 h-4 text-[#680505]" />
                        Support & Inquiry
                      </div>
                      <div className="space-y-1.5 text-slate-600">
                        <div>
                          <strong className="text-slate-800">Support Helpline:</strong><br />
                          +91-129-2310400
                        </div>
                        <div>
                          <strong className="text-slate-800">Support Email:</strong><br />
                          <a href="mailto:support@netwebindia.com" className="text-[#680505] hover:underline font-semibold">
                            support@netwebindia.com
                          </a>
                        </div>
                        <div>
                          <strong className="text-slate-800">Website:</strong><br />
                          <a href="https://netwebindia.com" target="_blank" rel="noreferrer" className="text-[#680505] hover:underline font-semibold flex items-center gap-1">
                            www.netwebindia.com <ExternalLink className="w-3 h-3 inline" />
                          </a>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Copyright Notice */}
            <div className="pt-6 border-t border-slate-200 text-center">
              <p className="text-[11px] text-slate-400 font-normal">
                Copyright (C) 2026-2036 Netweb Technologies India Ltd. All rights reserved.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
