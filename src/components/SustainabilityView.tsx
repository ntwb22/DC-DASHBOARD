import React, { useState, useMemo } from "react";
import { RefreshCw, AlertTriangle, ChevronRight, Info, CheckCircle2, Zap, Leaf, Thermometer, Sliders, TrendingDown, Layers, ShieldCheck, Gauge, ArrowUpRight, DollarSign, Activity } from "lucide-react";

interface ServerProfile {
  id: string;
  name: string;
  bmcIp: string;
  rack?: string;
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

export function SustainabilityView({ servers = [], alerts = [], serverStatuses = {}, onSelectServer }: SustainabilityViewProps) {
  const [activeSubTab, setActiveSubTab] = useState<
    "overview" | "idle_waste" | "rack_efficiency" | "thermal_margin"
  >("overview");

  const [coolingCriterion, setCoolingCriterion] = useState<string>("ASHRAE recommended 18 °C - 27 °C");
  const [showEditThresholdModal, setShowEditThresholdModal] = useState<boolean>(false);
  const [showPossibleActionsModal, setShowPossibleActionsModal] = useState<boolean>(false);

  // Carbon Emission & Policy State
  const [pueValue, setPueValue] = useState<number>(1.28);
  const [carbonFactor, setCarbonFactor] = useState<number>(0.42); // kg CO2 / kWh
  const [energyCostPerKwh, setEnergyCostPerKwh] = useState<number>(8.00); // ₹ or $ / kWh

  // Safe Operating Thermal Thresholds
  const MAX_SAFE_CPU_TEMP = 85; // °C
  const MAX_SAFE_AMBIENT_TEMP = 35; // °C

  // Compute active fleet & telemetry
  const fleetData = useMemo(() => {
    const deletedKeys = (() => {
      try {
        const raw = localStorage.getItem("tyrone_deleted_keys");
        return raw ? new Set<string>(JSON.parse(raw)) : new Set<string>();
      } catch {
        return new Set<string>();
      }
    })();

    const activeFleet = (servers || []).filter(s => {
      const idStr = String(s.id || "").toLowerCase();
      const ipStr = String(s.bmcIp || "").toLowerCase();
      const nameStr = String(s.name || "").toLowerCase();
      return !deletedKeys.has(idStr) && !deletedKeys.has(ipStr) && !deletedKeys.has(nameStr);
    });

    const currentServers = activeFleet.map((s, idx) => {
      const statusObj = serverStatuses?.[s.id] || serverStatuses?.[s.bmcIp];
      const fetchedTemp = statusObj?.temperature || statusObj?.temp;
      const fetchedPower = statusObj?.powerConsumedWatts || statusObj?.powerW || statusObj?.power;
      const cpuUtil = statusObj?.cpuUtil !== undefined ? Number(statusObj.cpuUtil) : ((idx * 2) % 12);
      const memUtil = statusObj?.memUtil !== undefined ? Number(statusObj.memUtil) : ((idx * 3) % 15);
      const fanSpeedPercent = statusObj?.fanSpeed || (50 + (idx * 5) % 40);
      const cores = statusObj?.cpus?.[0]?.cores || 28;

      const baseTemp = fetchedTemp ? Number(fetchedTemp) : (24 + (idx % 8));
      const powerW = fetchedPower ? Number(fetchedPower) : (idx % 2 === 0 ? 320 : 210);

      // Thermal margin = Max safe temp - Current temp
      const cpuThermalMargin = Math.max(0, MAX_SAFE_CPU_TEMP - baseTemp);
      const ambientThermalMargin = Math.max(0, MAX_SAFE_AMBIENT_TEMP - Math.min(baseTemp, 30));

      return {
        id: s.id,
        name: s.name || `Server ${s.bmcIp}`,
        bmcIp: s.bmcIp,
        rack: s.rack || `Rack ${(idx % 3) + 1}`,
        temp: baseTemp,
        powerW,
        cpuUtil,
        memUtil,
        cores,
        fanSpeedPercent,
        cpuThermalMargin,
        ambientThermalMargin,
        isIdle: cpuUtil < 5
      };
    });

    return currentServers;
  }, [servers, serverStatuses]);

  // Idle Power Waste & Financial Cost Analysis (sub-5% utilization)
  const idleAnalysis = useMemo(() => {
    const idleNodes = fleetData.filter(s => s.isIdle || s.cpuUtil < 5);
    const totalIdleCount = idleNodes.length;

    let totalIdlePowerW = 0;
    let totalWastedKwhMonthly = 0;
    let totalWastedCostMonthly = 0;

    const idleList = idleNodes.map(s => {
      const power = s.powerW || 250;
      totalIdlePowerW += power;

      // kWh per month = (Power in W * 24 hrs * 30 days) / 1000
      const wastedKwh = Math.round((power * 24 * 30) / 1000);
      const wastedCost = Math.round(wastedKwh * energyCostPerKwh);

      totalWastedKwhMonthly += wastedKwh;
      totalWastedCostMonthly += wastedCost;

      return {
        ...s,
        wastedKwh,
        wastedCost,
        wastedCostAnnual: wastedCost * 12
      };
    });

    return {
      totalIdleCount,
      totalIdlePowerW,
      totalWastedKwhMonthly,
      totalWastedCostMonthly,
      totalWastedCostAnnual: totalWastedCostMonthly * 12,
      idleList
    };
  }, [fleetData, energyCostPerKwh]);

  // Performance-per-Watt / Energy Efficiency Ratio tracking per rack
  const rackEfficiencyData = useMemo(() => {
    const rackMap: Record<string, { totalPowerW: number; totalCores: number; nodeCount: number; idleCount: number }> = {};

    fleetData.forEach(s => {
      const r = s.rack || "Rack 1";
      if (!rackMap[r]) {
        rackMap[r] = { totalPowerW: 0, totalCores: 0, nodeCount: 0, idleCount: 0 };
      }
      rackMap[r].totalPowerW += s.powerW;
      rackMap[r].totalCores += s.cores;
      rackMap[r].nodeCount += 1;
      if (s.isIdle) rackMap[r].idleCount += 1;
    });

    return Object.entries(rackMap).map(([rackName, data]) => {
      const powerKw = data.totalPowerW / 1000;
      // Performance per Watt (Cores per kW)
      const efficiencyRatio = powerKw > 0 ? Number((data.totalCores / powerKw).toFixed(1)) : 0;
      // Estimated GFLOPS per Watt (2.5 GHz * cores * 16 FLOPs / Watt)
      const gflopsPerWatt = powerKw > 0 ? Number(((data.totalCores * 2.5 * 16) / data.totalPowerW).toFixed(2)) : 0;

      return {
        rackName,
        totalPowerW: data.totalPowerW,
        totalCores: data.totalCores,
        nodeCount: data.nodeCount,
        idleCount: data.idleCount,
        efficiencyRatio,
        gflopsPerWatt
      };
    });
  }, [fleetData]);

  // Executive Summary Metrics
  const energySummary = useMemo(() => {
    const totalServers = fleetData.length;
    const totalPowerW = fleetData.reduce((sum, s) => sum + s.powerW, 0);
    const itPowerKw = totalServers > 0 ? Number((totalPowerW / 1000).toFixed(2)) : 0;
    const totalFacilityKw = totalServers > 0 ? Number((itPowerKw * pueValue).toFixed(2)) : 0;
    const dailyKwh = Number((totalFacilityKw * 24).toFixed(1));
    const dailyCarbonKg = Number((dailyKwh * carbonFactor).toFixed(1));
    const monthlyCost = Number((dailyKwh * 30 * energyCostPerKwh).toFixed(2));

    return {
      totalServers,
      itPowerKw,
      totalFacilityKw,
      dailyKwh,
      dailyCarbonKg,
      monthlyCost,
      pue: totalServers > 0 ? pueValue : 1.00
    };
  }, [fleetData, pueValue, carbonFactor, energyCostPerKwh]);

  return (
    <div className="flex-1 flex flex-col bg-[#dce1e7] p-2.5 font-sans select-none overflow-hidden h-full w-full text-xs space-y-2">
      {/* Top Sub-tabs */}
      <div className="flex items-center gap-1 border-b border-slate-400 overflow-x-auto pt-1 pb-0 shrink-0">
        {[
          { id: "overview", label: "Overview & PUE" },
          { id: "idle_waste", label: `Idle Power Waste & Cost (${idleAnalysis.totalIdleCount})` },
          { id: "rack_efficiency", label: "Performance-per-Watt (Per Rack)" },
          { id: "thermal_margin", label: "Thermal Margin & Cooling" }
        ].map(tab => {
          const isActive = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id as any)}
              className={`px-4 py-1.5 text-xs font-bold rounded-t cursor-pointer border-t-2 border-x transition-colors whitespace-nowrap ${
                isActive
                  ? "bg-white text-slate-900 border-t-[#7a0c0c] border-x-slate-300 shadow-xs z-10"
                  : "bg-[#7a0c0c] text-white/90 hover:bg-[#520000] border-transparent"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ========================================================================= */}
      {/* SUBTAB 1: OVERVIEW & PUE                                                   */}
      {/* ========================================================================= */}
      {activeSubTab === "overview" && (
        <div className="space-y-2.5 flex-1 flex flex-col min-h-0 overflow-y-auto">
          <div className="bg-white border border-slate-300 rounded shadow-xs overflow-hidden shrink-0">
            <div className="bg-[#7a0c0c] text-white px-4 py-2 flex items-center justify-between font-bold text-xs">
              <div className="flex items-center gap-2">
                <Leaf className="w-4 h-4 text-emerald-400" />
                <span>Carbon Emission & Datacenter Energy Efficiency</span>
              </div>
              <button 
                onClick={() => setShowEditThresholdModal(true)}
                className="px-3 py-1 bg-[#520000] hover:bg-[#3a0000] text-white rounded text-xs cursor-pointer font-bold transition-colors"
              >
                Edit Parameters
              </button>
            </div>
            
            <div className="p-4 grid grid-cols-2 md:grid-cols-5 gap-3 bg-slate-50/70 border-b border-slate-200">
              <div className="bg-white p-3 rounded border border-slate-200 shadow-2xs">
                <span className="text-[10px] text-slate-500 font-bold uppercase block">PUE Factor</span>
                <span className="text-lg font-black text-slate-900">{energySummary.pue.toFixed(2)}</span>
                <span className="text-[9px] text-emerald-600 block font-semibold mt-0.5">Optimal Green Level</span>
              </div>
              <div className="bg-white p-3 rounded border border-slate-200 shadow-2xs">
                <span className="text-[10px] text-slate-500 font-bold uppercase block">IT Power Draw</span>
                <span className="text-lg font-black text-blue-700">{energySummary.itPowerKw} kW</span>
                <span className="text-[9px] text-slate-500 block">{energySummary.totalServers} Active Servers</span>
              </div>
              <div className="bg-white p-3 rounded border border-slate-200 shadow-2xs">
                <span className="text-[10px] text-slate-500 font-bold uppercase block">Total Facility Power</span>
                <span className="text-lg font-black text-amber-700">{energySummary.totalFacilityKw} kW</span>
                <span className="text-[9px] text-slate-500 block">IT + CRAC Cooling</span>
              </div>
              <div className="bg-white p-3 rounded border border-slate-200 shadow-2xs">
                <span className="text-[10px] text-slate-500 font-bold uppercase block">Daily Carbon (CO₂e)</span>
                <span className="text-lg font-black text-emerald-700">{energySummary.dailyCarbonKg} kg</span>
                <span className="text-[9px] text-slate-500 block font-mono">{(energySummary.dailyCarbonKg / 1000).toFixed(2)} Tons/mo</span>
              </div>
              <div className="bg-white p-3 rounded border border-slate-200 shadow-2xs">
                <span className="text-[10px] text-slate-500 font-bold uppercase block">Est. Monthly Cost</span>
                <span className="text-lg font-black text-slate-900">₹{energySummary.monthlyCost.toLocaleString('en-IN')}</span>
                <span className="text-[9px] text-slate-500 block font-mono">Rate: ₹{energyCostPerKwh}/kWh</span>
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-300 rounded shadow-xs overflow-hidden flex-1 flex flex-col min-h-[220px]">
            <div className="bg-[#7a0c0c] text-white px-4 py-2 font-bold text-xs shrink-0 flex items-center justify-between">
              <span>Sustainability Issues & Thermal Alerts</span>
              <span className="text-[11px] text-white/80 font-mono">Active Telemetry Logs ({alerts.length})</span>
            </div>
            <div className="flex-1 overflow-auto">
              <table className="w-full text-left border-collapse min-w-[700px]">
                <thead className="bg-[#b0bac7] text-slate-800 font-bold sticky top-0 border-b border-slate-400 text-xs">
                  <tr>
                    <th className="p-2 border-r border-slate-400">Severity</th>
                    <th className="p-2 border-r border-slate-400">Server Node</th>
                    <th className="p-2 border-r border-slate-400">Subsystem</th>
                    <th className="p-2 border-r border-slate-400">Telemetry Message</th>
                    <th className="p-2">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-300 text-xs font-medium text-slate-800">
                  {alerts.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-4 text-center text-slate-500 font-medium">
                        No active thermal or power violations recorded.
                      </td>
                    </tr>
                  ) : (
                    alerts.map((a, i) => (
                      <tr key={i} className="hover:bg-slate-50 border-b border-slate-300 virtual-log-row">
                        <td className="p-2 border-r border-slate-300 font-bold text-red-600">{a.severity}</td>
                        <td className="p-2 border-r border-slate-300 text-blue-600 font-medium">{a.server}</td>
                        <td className="p-2 border-r border-slate-300">{a.type || "Telemetry"}</td>
                        <td className="p-2 border-r border-slate-300">{a.message}</td>
                        <td className="p-2 font-mono">{a.timestamp}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUBTAB 2: IDLE POWER WASTE & FINANCIAL COST ANALYSIS                       */}
      {/* ========================================================================= */}
      {activeSubTab === "idle_waste" && (
        <div className="bg-white border border-slate-300 rounded shadow-xs overflow-hidden flex flex-col flex-1 min-h-0">
          <div className="bg-[#7a0c0c] text-white px-4 py-2 font-bold text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-amber-400" />
              <span>Idle Power Waste & Cost Analysis (Sub-5% CPU Utilization)</span>
            </div>
            <span className="text-[11px] text-white/80 font-mono">
              {idleAnalysis.totalIdleCount} Sub-5% Idle Nodes Detected
            </span>
          </div>

          <div className="p-4 space-y-4 overflow-y-auto flex-1">
            {/* Executive Cost Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="bg-amber-50 border border-amber-300 rounded p-3 text-amber-950">
                <span className="text-[10px] uppercase font-bold text-amber-700 block">Idle Servers Count</span>
                <span className="text-xl font-black text-amber-900">{idleAnalysis.totalIdleCount} Nodes</span>
                <span className="text-[9px] block text-amber-700 mt-1">CPU Load &lt; 5%</span>
              </div>
              <div className="bg-red-50 border border-red-300 rounded p-3 text-red-950">
                <span className="text-[10px] uppercase font-bold text-red-700 block">Wasted Idle Power</span>
                <span className="text-xl font-black text-red-900">{idleAnalysis.totalIdlePowerW} W</span>
                <span className="text-[9px] block text-red-700 mt-1">{(idleAnalysis.totalIdlePowerW / 1000).toFixed(2)} kW Baseline Waste</span>
              </div>
              <div className="bg-amber-50 border border-amber-300 rounded p-3 text-amber-950">
                <span className="text-[10px] uppercase font-bold text-amber-700 block">Monthly Financial Waste</span>
                <span className="text-xl font-black text-amber-900">₹{idleAnalysis.totalWastedCostMonthly.toLocaleString('en-IN')}</span>
                <span className="text-[9px] block text-amber-700 mt-1">{idleAnalysis.totalWastedKwhMonthly} kWh / month</span>
              </div>
              <div className="bg-red-50 border border-red-300 rounded p-3 text-red-950">
                <span className="text-[10px] uppercase font-bold text-red-700 block">Annual Financial Waste</span>
                <span className="text-xl font-black text-red-900">₹{idleAnalysis.totalWastedCostAnnual.toLocaleString('en-IN')}</span>
                <span className="text-[9px] block text-red-700 mt-1">Est. 12-Month Idle Cost</span>
              </div>
            </div>

            {/* Recommendation Box */}
            <div className="bg-slate-50 border border-slate-300 rounded p-3 text-xs text-slate-800 flex items-start gap-2">
              <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <div>
                <strong>Optimization Recommendation:</strong> Powering down or consolidating workloads from the {idleAnalysis.totalIdleCount} idle nodes will eliminate <strong>₹{idleAnalysis.totalWastedCostMonthly.toLocaleString('en-IN')}/mo</strong> in wasted electricity costs and reduce carbon emissions by <strong>{Math.round(idleAnalysis.totalWastedKwhMonthly * carbonFactor)} kg CO₂e/month</strong>.
              </div>
            </div>

            {/* Idle Nodes Table */}
            <div className="border border-slate-300 rounded overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-100 font-bold text-slate-700 border-b border-slate-300">
                  <tr>
                    <th className="p-2.5 border-r border-slate-300">Server Node</th>
                    <th className="p-2.5 border-r border-slate-300">Location / Rack</th>
                    <th className="p-2.5 border-r border-slate-300 text-center">CPU Load</th>
                    <th className="p-2.5 border-r border-slate-300 text-center">RAM Load</th>
                    <th className="p-2.5 border-r border-slate-300 text-center">Idle Power Draw</th>
                    <th className="p-2.5 border-r border-slate-300 text-center">Monthly Wasted kWh</th>
                    <th className="p-2.5 border-r border-slate-300 text-center">Monthly Financial Waste</th>
                    <th className="p-2.5 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {idleAnalysis.idleList.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-slate-500 font-bold italic">
                        No sub-5% idle servers currently detected. All active servers are operating efficiently.
                      </td>
                    </tr>
                  ) : (
                    idleAnalysis.idleList.map((srv, idx) => (
                      <tr key={idx} className="hover:bg-slate-50 virtual-table-row">
                        <td className="p-2.5 border-r border-slate-200 font-bold text-blue-700">
                          {srv.name} ({srv.bmcIp})
                        </td>
                        <td className="p-2.5 border-r border-slate-200 text-slate-600">{srv.rack}</td>
                        <td className="p-2.5 border-r border-slate-200 text-center font-mono font-bold">
                          <span className="text-red-600 bg-red-50 px-2 py-0.5 rounded border border-red-200">
                            {srv.cpuUtil}%
                          </span>
                        </td>
                        <td className="p-2.5 border-r border-slate-200 text-center font-mono">
                          {srv.memUtil}%
                        </td>
                        <td className="p-2.5 border-r border-slate-200 text-center font-bold text-slate-800 font-mono">
                          {srv.powerW} W
                        </td>
                        <td className="p-2.5 border-r border-slate-200 text-center font-mono text-slate-700">
                          {srv.wastedKwh} kWh
                        </td>
                        <td className="p-2.5 border-r border-slate-200 text-center font-bold text-red-700 font-mono">
                          ₹{srv.wastedCost.toLocaleString('en-IN')}/mo
                        </td>
                        <td className="p-2.5 text-center space-x-1">
                          <button className="px-2 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded text-[10px] font-bold cursor-pointer transition-colors">
                            Consolidate
                          </button>
                          <button className="px-2 py-1 bg-red-700 hover:bg-red-800 text-white rounded text-[10px] font-bold cursor-pointer transition-colors">
                            Power Off
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUBTAB 3: PERFORMANCE-PER-WATT / ENERGY EFFICIENCY RATIO                 */}
      {/* ========================================================================= */}
      {activeSubTab === "rack_efficiency" && (
        <div className="bg-white border border-slate-300 rounded shadow-xs overflow-hidden flex flex-col flex-1 min-h-0">
          <div className="bg-[#7a0c0c] text-white px-4 py-2 font-bold text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400" />
              <span>Performance-per-Watt / Energy Efficiency Ratio Tracking Per Rack</span>
            </div>
            <span className="text-[11px] text-white/80 font-mono">Rack Efficiency Breakdown</span>
          </div>

          <div className="p-4 space-y-4 overflow-y-auto flex-1">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {rackEfficiencyData.map((rack, idx) => (
                <div key={idx} className="bg-slate-50 border border-slate-300 rounded p-4 shadow-2xs space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                    <span className="font-extrabold text-sm text-slate-800">{rack.rackName}</span>
                    <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded font-mono font-bold text-xs">
                      {rack.nodeCount} Servers
                    </span>
                  </div>

                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-600 font-medium">Total Power Consumption:</span>
                      <span className="font-bold font-mono text-slate-900">{rack.totalPowerW} W</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-600 font-medium">Total Compute Cores:</span>
                      <span className="font-bold font-mono text-slate-900">{rack.totalCores} Cores</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-600 font-medium">Efficiency Ratio (Cores/kW):</span>
                      <span className="font-extrabold font-mono text-blue-700">{rack.efficiencyRatio} Cores/kW</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-600 font-medium">Est. Performance/Watt:</span>
                      <span className="font-extrabold font-mono text-emerald-700">{rack.gflopsPerWatt} GFLOPS/W</span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-200">
                    <div className="flex justify-between text-[10px] text-slate-500 font-bold mb-1">
                      <span>Energy Efficiency Index</span>
                      <span>{Math.min(100, Math.round(rack.gflopsPerWatt * 15))}%</span>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                      <div 
                        className="bg-emerald-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${Math.min(100, Math.round(rack.gflopsPerWatt * 15))}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUBTAB 4: THERMAL MARGIN TRACKING & COOLING HEADROOM                      */}
      {/* ========================================================================= */}
      {activeSubTab === "thermal_margin" && (
        <div className="bg-white border border-slate-300 rounded shadow-xs overflow-hidden flex flex-col flex-1 min-h-0">
          <div className="bg-[#7a0c0c] text-white px-4 py-2 font-bold text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Thermometer className="w-4 h-4 text-red-400" />
              <span>Thermal Margin & Component Thermal Headroom Tracking</span>
            </div>
            <button
              onClick={() => setShowPossibleActionsModal(true)}
              className="px-3 py-1 bg-[#520000] hover:bg-[#3a0000] text-white rounded text-xs font-bold cursor-pointer transition-colors"
            >
              Recommended Actions
            </button>
          </div>

          <div className="p-4 space-y-4 overflow-y-auto flex-1">
            <div className="border border-slate-300 rounded overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-100 font-bold text-slate-700 border-b border-slate-300">
                  <tr>
                    <th className="p-2.5 border-r border-slate-300">Server Node</th>
                    <th className="p-2.5 border-r border-slate-300 text-center">Current Temp</th>
                    <th className="p-2.5 border-r border-slate-300 text-center">Safe Max Limit</th>
                    <th className="p-2.5 border-r border-slate-300 text-center">CPU Thermal Margin</th>
                    <th className="p-2.5 border-r border-slate-300 text-center">Active Fan Speed</th>
                    <th className="p-2.5 text-center">Thermal State</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {fleetData.map((srv, idx) => (
                    <tr key={idx} className="hover:bg-slate-50 virtual-table-row">
                      <td className="p-2.5 border-r border-slate-200 font-bold text-blue-700">
                        {srv.name} ({srv.bmcIp})
                      </td>
                      <td className="p-2.5 border-r border-slate-200 text-center font-mono font-bold">
                        {srv.temp} °C
                      </td>
                      <td className="p-2.5 border-r border-slate-200 text-center font-mono text-slate-600">
                        {MAX_SAFE_CPU_TEMP} °C
                      </td>
                      <td className="p-2.5 border-r border-slate-200 text-center font-mono font-bold">
                        <span className={srv.cpuThermalMargin < 20 ? "text-red-700 bg-red-50 px-2 py-0.5 rounded font-bold" : "text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded"}>
                          +{srv.cpuThermalMargin} °C Headroom
                        </span>
                      </td>
                      <td className="p-2.5 border-r border-slate-200 text-center font-mono font-bold text-slate-800">
                        {srv.fanSpeedPercent}% RPM
                      </td>
                      <td className="p-2.5 text-center font-bold">
                        {srv.cpuThermalMargin >= 25 ? (
                          <span className="text-emerald-700 flex items-center justify-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Optimal
                          </span>
                        ) : (
                          <span className="text-amber-700 flex items-center justify-center gap-1">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" /> Elevated
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Edit Threshold Modal */}
      {showEditThresholdModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-300 max-w-sm w-full overflow-hidden animate-in fade-in duration-150">
            <div className="bg-[#7a0c0c] text-white px-5 py-3 flex items-center justify-between">
              <h3 className="font-extrabold text-sm uppercase">Edit Carbon & PUE Parameters</h3>
              <button onClick={() => setShowEditThresholdModal(false)} className="text-white/70 hover:text-white">✕</button>
            </div>
            <div className="p-5 space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Datacenter PUE Rating:</label>
                <input 
                  type="number" 
                  step="0.01" 
                  value={pueValue} 
                  onChange={e => setPueValue(Number(e.target.value))}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded font-mono"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">Energy Cost per kWh:</label>
                <input 
                  type="number" 
                  step="0.5" 
                  value={energyCostPerKwh} 
                  onChange={e => setEnergyCostPerKwh(Number(e.target.value))}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded font-mono"
                />
              </div>
              <div className="text-right pt-2 border-t border-slate-200">
                <button
                  onClick={() => setShowEditThresholdModal(false)}
                  className="px-4 py-1.5 bg-[#7a0c0c] hover:bg-[#520000] text-white font-bold rounded cursor-pointer transition-colors"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Possible Actions Modal */}
      {showPossibleActionsModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-300 max-w-md w-full overflow-hidden">
            <div className="bg-[#7a0c0c] text-white px-5 py-3 flex items-center justify-between">
              <h3 className="font-extrabold text-sm uppercase">Recommended Thermal Actions</h3>
              <button onClick={() => setShowPossibleActionsModal(false)} className="text-white/70 hover:text-white">✕</button>
            </div>
            <div className="p-6 space-y-3 text-xs text-slate-700">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <p><strong>Boost Fan Speed Curve:</strong> Increase fan profiles from Eco to Performance via Redfish API.</p>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <p><strong>Consolidate Idle Servers:</strong> Power off sub-5% idle nodes to lower rack thermal load.</p>
              </div>
              <div className="text-right pt-2 border-t border-slate-200">
                <button
                  onClick={() => setShowPossibleActionsModal(false)}
                  className="px-4 py-1.5 bg-[#475569] text-white font-bold rounded cursor-pointer"
                >
                  Got It
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
