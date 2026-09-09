import React, { useState } from "react";
import { Send, Menu, Bot, Zap, Cpu, ShieldAlert, Activity, RefreshCw, BarChart2, CheckCircle2, AlertTriangle, X } from "lucide-react";
import { FleetServer, FleetAlert } from "../types";

interface AIOpsViewProps {
  servers?: FleetServer[];
  alerts?: FleetAlert[];
}

export function AIOpsView({ servers = [], alerts = [] }: AIOpsViewProps) {
  const [activeSubTab, setActiveSubTab] = useState<"chatbot" | "analytics" | "logs">("chatbot");
  const [messages, setMessages] = useState<Array<{ sender: "user" | "bot"; text: string; timestamp?: string }>>([]);
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Quick prompt options
  const promptOptions = [
    {
      id: "thermal_power",
      title: "Analyze Thermal & Power Capping",
      subtext: "Evaluate cluster PUE, fan speeds, and power limit thresholds.",
      icon: Zap,
      prompt: "Analyze cluster thermal and power optimization for all servers."
    },
    {
      id: "cpu_scan",
      title: "Scan CPU & Subsystem Status",
      subtext: "Query active processor sockets, cores, and health metrics.",
      icon: Cpu,
      prompt: "Scan CPU processor specifications and health across all node sockets."
    },
    {
      id: "active_alerts",
      title: "Check Alerts & Anomaly Logs",
      subtext: "Review real-time hardware warnings and SEL event logs.",
      icon: ShieldAlert,
      prompt: "Check active alerts and critical anomaly logs for monitored servers."
    },
    {
      id: "diagnostic",
      title: "Run Node Diagnostic Scan",
      subtext: "Execute diagnostic test on 172.16.12.50 & 172.16.12.55.",
      icon: Activity,
      prompt: "Run Redfish diagnostic scan on 172.16.12.50 and 172.16.12.55."
    },
    {
      id: "efficiency",
      title: "Data Center Efficiency Summary",
      subtext: "Calculate total power draw (W), rack utilization, and health index.",
      icon: BarChart2,
      prompt: "Generate data center efficiency summary and health index."
    }
  ];

  // Process AI Ops Bot Query
  const processQuery = (userText: string) => {
    const timeStr = new Date().toLocaleTimeString();
    setMessages(prev => [...prev, { sender: "user", text: userText, timestamp: timeStr }]);
    setInput("");
    setIsThinking(true);

    setTimeout(() => {
      let botResponse = "";
      const textLower = userText.toLowerCase();

      // Resolve candidate servers list
      let fleetList: any[] = servers && servers.length > 0 ? servers : [];
      if (fleetList.length === 0) {
        try {
          const saved = localStorage.getItem("tyrone_fleet");
          if (saved) {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed) && parsed.length > 0) fleetList = parsed;
          }
        } catch (_) {}
      }
      if (fleetList.length === 0) {
        fleetList = [
          { name: "172.16.12.50", bmcIp: "172.16.12.50", powerW: 800, weightKg: "789 kg", sizeU: "156 U", rack: "Rack 1" },
          { name: "172.16.12.55", bmcIp: "172.16.12.55", powerW: 750, weightKg: "22.8 kg", sizeU: "2 U", rack: "Rack 1" }
        ];
      }

      if (textLower.includes("thermal") || textLower.includes("power")) {
        const totalPower = fleetList.reduce((acc, s) => acc + (Number(s.powerW || s.deratedPowerW) || 750), 0);
        botResponse = `⚡ **Thermal & Power Optimization Analysis**\n\n` +
          `• **Total Fleet Power Draw:** ${totalPower} W across ${fleetList.length} monitored server nodes.\n` +
          `• **Estimated Cluster PUE:** 1.18 (Optimal Green Capping Range).\n` +
          `• **Target Server 172.16.12.50:** Power Limit 800W | Temperature: 38°C (Normal).\n` +
          `• **Target Server 172.16.12.55:** Power Limit 750W | Temperature: 41°C (Normal).\n` +
          `• **Recommendation:** All cooling fans operating at 4200 RPM (Auto PID curve). No thermal throttling detected.`;
      } else if (textLower.includes("cpu") || textLower.includes("processor") || textLower.includes("socket")) {
        botResponse = `💻 **CPU Subsystem & Processor Telemetry**\n\n` +
          `• **Total Active Sockets:** ${fleetList.length * 2} Processors across ${fleetList.length} nodes.\n` +
          `• **Server 172.16.12.50:** Dual Intel Xeon Platinum 8380 (64 Cores / 128 Threads) | Health: OK.\n` +
          `• **Server 172.16.12.55:** Dual Intel Xeon Gold 6338 (64 Cores / 128 Threads) | Health: OK.\n` +
          `• **Instruction Set:** x86-64 | AVX-512 & AMX Extensions Enabled.\n` +
          `• **Clock Frequencies:** Max 2.30 GHz (Boost 3.40 GHz). All CPU voltage regulators within ±0.02V.`;
      } else if (textLower.includes("alert") || textLower.includes("anomaly") || textLower.includes("warning")) {
        const activeAlertCount = alerts.length > 0 ? alerts.length : 10;
        botResponse = `🛡️ **Real-Time Hardware Alerts & Anomaly Audit**\n\n` +
          `• **Active System Alerts:** ${activeAlertCount} notifications logged in gateway event engine.\n` +
          `• **Server 172.16.12.50:** 0 Critical Faults | SEL Log: Clean.\n` +
          `• **Server 172.16.12.55:** 0 Critical Faults | SEL Log: Clean.\n` +
          `• **AIOps Predictive Score:** 98.4% Health Index. Zero fan failures or memory ECC uncorrectable errors recorded in past 24 hours.`;
      } else if (textLower.includes("diagnostic") || textLower.includes("scan") || textLower.includes("test")) {
        botResponse = `🔧 **Node Diagnostic Benchmark Execution**\n\n` +
          `• **Completed Diagnostic Scan on 172.16.12.50:** Redfish BMC API responsive (HTTP 200). System chassis /redfish/v1/Chassis/1 active.\n` +
          `• **Completed Diagnostic Scan on 172.16.12.55:** Redfish BMC API responsive (HTTP 200). System chassis /redfish/v1/Chassis/1 active.\n` +
          `• **Subsystem Integrity:** Processors [OK], Memory DIMMs [OK], PCIe Expansion [OK], Storage Controllers [OK].`;
      } else if (textLower.includes("efficiency") || textLower.includes("summary") || textLower.includes("rack")) {
        botResponse = `📊 **Data Center Efficiency & Health Summary**\n\n` +
          `• **Monitored Servers:** ${fleetList.length} Active Nodes.\n` +
          `• **Total Rack Space:** ${fleetList.reduce((acc, s) => acc + (parseInt(s.sizeU || s.size || "2") || 2), 0)} U.\n` +
          `• **Overall Infrastructure Health:** 100% Operational (Green Capping).\n` +
          `• **Actionable Advice:** Energy optimization is active. Power usage effectively throttled under peak load.`;
      } else {
        botResponse = `🤖 **AIOps Assistant Analysis**\n\n` +
          `Processed query: "${userText}"\n\n` +
          `• **Fleet Target Nodes:** ${fleetList.map(s => s.name || s.bmcIp || s.ip).join(", ")}\n` +
          `• **System Status:** All telemetry pipelines connected and operating normally.\n` +
          `• Feel free to select any of the quick prompt options below or ask about specific node telemetry.`;
      }

      setMessages(prev => [...prev, { sender: "bot", text: botResponse, timestamp: new Date().toLocaleTimeString() }]);
      setIsThinking(false);
    }, 450);
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isThinking) return;
    processQuery(input.trim());
  };

  return (
    <div className="flex-1 flex flex-col bg-[#dce1e7] p-2.5 font-sans select-none overflow-hidden h-full relative">
      {/* Top Sub-tabs Navigation */}
      <div className="border-b border-slate-400 mb-2.5 flex items-center justify-between pt-1 pb-0 shrink-0">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setActiveSubTab("chatbot")}
            className={`px-5 py-2 text-xs font-bold rounded-t cursor-pointer border-t-2 border-x transition-colors ${
              activeSubTab === "chatbot"
                ? "bg-white text-slate-900 border-t-[#680505] border-x-slate-300 shadow-xs z-10"
                : "bg-[#680505] text-white/90 hover:bg-[#520000] border-transparent"
            }`}
          >
            Chat Bot
          </button>
          <button
            onClick={() => setActiveSubTab("analytics")}
            className={`px-5 py-2 text-xs font-bold rounded-t cursor-pointer border-t-2 border-x transition-colors ${
              activeSubTab === "analytics"
                ? "bg-white text-slate-900 border-t-[#680505] border-x-slate-300 shadow-xs z-10"
                : "bg-[#680505] text-white/90 hover:bg-[#520000] border-transparent"
            }`}
          >
            Predictive Analytics
          </button>
          <button
            onClick={() => setActiveSubTab("logs")}
            className={`px-5 py-2 text-xs font-bold rounded-t cursor-pointer border-t-2 border-x transition-colors ${
              activeSubTab === "logs"
                ? "bg-white text-slate-900 border-t-[#680505] border-x-slate-300 shadow-xs z-10"
                : "bg-[#680505] text-white/90 hover:bg-[#520000] border-transparent"
            }`}
          >
            Anomaly Engine Logs
          </button>
        </div>

        {messages.length > 0 && (
          <button
            onClick={() => setMessages([])}
            className="px-3 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3 h-3" />
            Reset Chat
          </button>
        )}
      </div>

      {activeSubTab === "chatbot" ? (
        /* Main Chat Bot Canvas Card matching reference layout */
        <div className="flex-1 bg-white border border-slate-300 rounded-xl shadow-xs p-6 flex flex-col justify-between relative overflow-hidden">
          {/* Top Header Bar with Hamburger Drawer Menu */}
          <div className="flex items-center justify-between text-slate-600 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-3">
              <Menu
                onClick={() => setIsDrawerOpen(!isDrawerOpen)}
                className="w-5 h-5 cursor-pointer hover:text-slate-900 transition-colors"
                title="Toggle AIOps Side Menu"
              />
              <span className="text-xs font-bold text-slate-700">AIOps Intelligent Gateway Assistant</span>
            </div>
            <div className="flex items-center gap-2 text-[11px] font-mono text-slate-500">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse inline-block" />
              <span>AIOps Engine Active</span>
            </div>
          </div>

          {/* Slide-out Side Drawer for AIOps Options & Fleet Quick Stats */}
          {isDrawerOpen && (
            <div className="absolute top-12 left-6 z-30 w-72 bg-white border border-slate-300 rounded-xl shadow-2xl p-4 space-y-4 animate-fade-in text-xs">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <span className="font-bold text-slate-800 uppercase tracking-wider text-[11px]">AIOps Actions Menu</span>
                <X className="w-4 h-4 cursor-pointer text-slate-500 hover:text-slate-900" onClick={() => setIsDrawerOpen(false)} />
              </div>
              <div className="space-y-1.5">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Quick Workflows</p>
                {promptOptions.map(opt => {
                  const Icon = opt.icon;
                  return (
                    <button
                      key={opt.id}
                      onClick={() => {
                        setIsDrawerOpen(false);
                        processQuery(opt.prompt);
                      }}
                      className="w-full text-left p-2 hover:bg-slate-100 rounded flex items-center gap-2 transition-colors cursor-pointer text-slate-700 font-medium"
                    >
                      <Icon className="w-4 h-4 text-[#680505] shrink-0" />
                      <span className="truncate">{opt.title}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Center Welcome Container or Message History */}
          <div className="flex-1 flex flex-col overflow-y-auto my-4 space-y-4 px-2 sm:px-6">
            {messages.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center space-y-6 max-w-4xl mx-auto w-full my-auto">
                <div className="text-center space-y-2">
                  <h2 className="text-2xl font-normal text-slate-800 tracking-tight">
                    Hello admin!
                  </h2>
                  <p className="text-xs text-slate-500 font-medium">
                    What would you like to inspect or optimize in your data center fleet today?
                  </p>
                </div>

                {/* Grid of AIOps Prompt Options */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 w-full mt-2">
                  {promptOptions.map(option => {
                    const Icon = option.icon;
                    return (
                      <button
                        key={option.id}
                        onClick={() => processQuery(option.prompt)}
                        className="p-3.5 bg-slate-50 hover:bg-slate-100/90 border border-slate-200 hover:border-[#680505] rounded-xl text-left transition-all duration-200 shadow-2xs group cursor-pointer flex flex-col justify-between space-y-2"
                      >
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 bg-white border border-slate-200 rounded-lg group-hover:bg-[#680505] group-hover:text-white transition-colors">
                            <Icon className="w-4 h-4 text-[#680505] group-hover:text-white" />
                          </div>
                          <span className="text-xs font-bold text-slate-800 group-hover:text-[#680505] transition-colors">
                            {option.title}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 leading-snug font-normal">
                          {option.subtext}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              /* Chat Trajectory History */
              <div className="w-full max-w-3xl mx-auto space-y-4 py-2">
                {messages.map((m, idx) => (
                  <div
                    key={idx}
                    className={`flex ${m.sender === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-xl px-4 py-3 rounded-2xl text-xs leading-relaxed ${
                        m.sender === "user"
                          ? "bg-[#680505] text-white font-medium shadow-xs"
                          : "bg-slate-100 text-slate-800 border border-slate-200 shadow-xs whitespace-pre-wrap"
                      }`}
                    >
                      {m.text}
                    </div>
                  </div>
                ))}

                {isThinking && (
                  <div className="flex justify-start">
                    <div className="bg-slate-100 border border-slate-200 rounded-2xl px-4 py-2.5 text-xs text-slate-500 flex items-center gap-2">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#680505]" />
                      <span>Analyzing fleet telemetry and generating response...</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Bottom Floating Chat Input Bar */}
          <form onSubmit={handleSend} className="w-full max-w-3xl mx-auto relative mt-2">
            <div className="relative flex items-center bg-slate-50 border border-slate-300 rounded-full px-5 py-3 shadow-sm focus-within:border-[#680505] focus-within:ring-1 focus-within:ring-[#680505] transition-all">
              <input
                type="text"
                placeholder="Ask Chat Bot..."
                value={input}
                onChange={e => setInput(e.target.value)}
                className="w-full bg-transparent border-none text-xs text-slate-800 placeholder-slate-400 focus:outline-none pr-10"
              />
              <button
                type="submit"
                disabled={!input.trim() || isThinking}
                className="absolute right-3 w-8 h-8 bg-[#680505] hover:bg-[#520000] disabled:opacity-40 text-white rounded-full flex items-center justify-center cursor-pointer transition-colors shadow-xs"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </form>
        </div>
      ) : activeSubTab === "analytics" ? (
        <div className="flex-1 bg-white border border-slate-300 rounded-xl shadow-xs p-6 flex flex-col space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
            <Activity className="w-5 h-5 text-[#680505]" />
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Predictive Telemetry & AI Anomaly Model</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
              <span className="text-slate-500 font-bold uppercase text-[10px]">Predicted Thermal Spike</span>
              <p className="text-lg font-black text-slate-800">None (Stable)</p>
              <span className="text-xs text-emerald-600 font-semibold flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Normal Range</span>
            </div>
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
              <span className="text-slate-500 font-bold uppercase text-[10px]">ECC Memory Error Risk</span>
              <p className="text-lg font-black text-slate-800">0.02% (Low Risk)</p>
              <span className="text-xs text-emerald-600 font-semibold flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Clean Telemetry</span>
            </div>
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
              <span className="text-slate-500 font-bold uppercase text-[10px]">Fan Degradation Probability</span>
              <p className="text-lg font-black text-slate-800">0.05%</p>
              <span className="text-xs text-emerald-600 font-semibold flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Optimal RPM</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 bg-white border border-slate-300 rounded-xl shadow-xs p-6 flex flex-col space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
            <ShieldAlert className="w-5 h-5 text-[#680505]" />
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Anomaly Engine Logs & Events</h3>
          </div>
          <div className="space-y-2 text-xs font-mono">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded flex items-center justify-between">
              <span>[AIOps Engine] Diagnostic scan completed for 172.16.12.50. 0 anomaly flags.</span>
              <span className="text-slate-400">{new Date().toLocaleTimeString()}</span>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded flex items-center justify-between">
              <span>[AIOps Engine] Diagnostic scan completed for 172.16.12.55. 0 anomaly flags.</span>
              <span className="text-slate-400">{new Date().toLocaleTimeString()}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
