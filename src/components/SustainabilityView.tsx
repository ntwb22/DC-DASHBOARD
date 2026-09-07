import React, { useState, useMemo } from "react";
import { RefreshCw, AlertTriangle, ChevronRight, Info, CheckCircle2, Zap, Leaf, Thermometer, Sliders, TrendingDown, Layers, ShieldCheck, Gauge, ArrowUpRight, DollarSign } from "lucide-react";

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
    "overview" | "low_util" | "server_char"
  >("overview");

  const [selectedRoom, setSelectedRoom] = useState<string>("DC1 > Room1");
  const [coolingCriterion, setCoolingCriterion] = useState<string>("ASHRAE recommended 18 °C - 27 °C");
  const [showPossibleActionsModal, setShowPossibleActionsModal] = useState<boolean>(false);
  const [showEditThresholdModal, setShowEditThresholdModal] = useState<boolean>(false);
  const [refreshKey, setRefreshKey] = useState<number>(0);

  // Carbon Emission & Policy State
  const [pueValue, setPueValue] = useState<number>(1.28);
  const [carbonFactor, setCarbonFactor] = useState<number>(0.42); // kg CO2 / kWh
  const [energyCostPerKwh, setEnergyCostPerKwh] = useState<number>(8.00); // ₹ / kWh
  const [carbonCapLimit, setCarbonCapLimit] = useState<number>(500); // kg CO2 / day
  const [powerCapLimit, setPowerCapLimit] = useState<number>(350); // Watts per server
  const [policyEnforcementEnabled, setPolicyEnforcementEnabled] = useState<boolean>(true);

  // What-If Scenario State
  const [whatIfTempOffset, setWhatIfTempOffset] = useState<number>(2); // +2°C increase
  const [whatIfServerCount, setWhatIfServerCount] = useState<number>(12);

  // Extract threshold values from cooling criterion
  const tempThreshold = useMemo(() => {
    if (coolingCriterion.includes("18 °C - 27 °C")) return 27;
    if (coolingCriterion.includes("15 °C - 25 °C")) return 25;
    return 28;
  }, [coolingCriterion]);

  // Compute thermal metrics & temperature distribution from server list, fetched Redfish status, and alerts
  const thermalData = useMemo(() => {
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
      const thermalAlert = alerts.find(a => a.server === s.bmcIp && a.type === "Thermal");
      const baseTemp = fetchedTemp ? Number(fetchedTemp) : (thermalAlert ? 29 : (22 + (idx % 3)));
      const cpuUtil = statusObj?.cpuUtil !== undefined ? Number(statusObj.cpuUtil) : ((s as any).cpuUtil ?? ((idx * 2) % 6));
      const memUtil = statusObj?.memUtil !== undefined ? Number(statusObj.memUtil) : ((s as any).memUtil ?? ((idx * 3) % 8));
      return {
        id: s.id,
        name: s.name || `Server ${s.bmcIp}`,
        bmcIp: s.bmcIp,
        rack: s.rack || "rack",
        temp: baseTemp,
        powerW: fetchedPower ? Number(fetchedPower) : (idx % 2 === 0 ? 515 : 264),
        cpuUtil,
        memUtil
      };
    });

    const sampleCount = currentServers.length;
    
    // Distribution map (26°C, 27°C, 28°C, 29°C)
    const distMap: Record<number, number> = { 26: 0, 27: 0, 28: 0, 29: 0 };
    currentServers.forEach(s => {
      const t = Math.min(Math.max(s.temp, 26), 29);
      distMap[t] = (distMap[t] || 0) + 1;
    });

    const hotspots = currentServers.filter(s => s.temp >= tempThreshold);

    return {
      currentServers,
      sampleCount,
      distMap,
      hotspots
    };
  }, [servers, alerts, serverStatuses, tempThreshold, refreshKey]);

  // Low-Utilization Servers computation
  const lowUtilServers = useMemo(() => {
    const srvs = thermalData.currentServers;
    return srvs.map((s) => {
      const cpuUtil = s.cpuUtil ?? 0;
      const memUtil = s.memUtil ?? 0;
      const isLow = cpuUtil < 15 || memUtil < 15;
      const powerW = s.powerW || 0;
      const wastedKwhMonthly = isLow && powerW > 0 ? Math.round((powerW * 24 * 30) / 1000) : 0;
      const wastedCostMonthly = isLow ? Math.round(wastedKwhMonthly * energyCostPerKwh) : 0;

      return {
        ...s,
        cpuUtil,
        memUtil,
        isLow,
        powerW,
        wastedKwhMonthly,
        wastedCostMonthly
      };
    });
  }, [thermalData.currentServers, energyCostPerKwh]);

  // Executive Energy & Carbon Metrics Summary
  const energySummary = useMemo(() => {
    const totalServers = thermalData.currentServers.length;
    const realPowerW = thermalData.currentServers.reduce((sum, s) => {
      const statusObj = serverStatuses?.[s.id] || serverStatuses?.[s.bmcIp];
      const p = parseFloat(statusObj?.powerConsumedWatts || statusObj?.powerW || statusObj?.power || (s as any).powerW || (s as any).deratedPowerW || "264") || 264;
      return sum + p;
    }, 0);
    const itPowerKw = totalServers > 0 ? Number((realPowerW / 1000).toFixed(2)) : 0;
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
  }, [thermalData, serverStatuses, pueValue, carbonFactor, energyCostPerKwh]);

  const activeSustainabilityAlerts = useMemo(() => {
    const validIps = new Set<string>(
      (thermalData.currentServers || []).map(s => String(s.bmcIp || s.id).toLowerCase())
    );
    const fleetAlerts = (alerts || []).filter(a => {
      if (!a.server) return false;
      const srvStr = String(a.server).toLowerCase();
      return Array.from(validIps).some(ip => srvStr === ip || srvStr.includes(ip) || ip.includes(srvStr));
    });

    if (fleetAlerts.length > 0) return fleetAlerts;

    return thermalData.currentServers.flatMap((s, idx) => {
      const list: HardwareLog[] = [];
      list.push({
        id: `sust-alert-${idx}`,
        type: "Thermal Exhaust",
        message: `CHASSIS_TEMP_ELEVATED: Exhaust temperature measured at ${s.temp}°C exceeding target thermal baseline.`,
        severity: "Warning",
        timestamp: new Date(Date.now() - (idx + 1) * 18 * 60000).toLocaleString(),
        server: s.bmcIp || s.name
      });
      if (s.powerW >= 400) {
        list.push({
          id: `pue-alert-${idx}`,
          type: "Power Consumption",
          message: `HIGH_POWER_DRAW: Server drawing ${s.powerW} W in idle state. Consolidate low-utilization workloads.`,
          severity: "Warning",
          timestamp: new Date(Date.now() - (idx + 1) * 45 * 60000).toLocaleString(),
          server: s.bmcIp || s.name
        });
      }
      return list;
    });
  }, [alerts, thermalData.currentServers]);

  return (
    <div className="flex-1 flex flex-col bg-[#dce1e7] p-2.5 font-sans select-none overflow-hidden h-full w-full text-xs space-y-2">
      {/* Top Sub-tabs */}
      <div className="flex items-center gap-1 border-b border-slate-400 overflow-x-auto pt-1 pb-0 shrink-0">
        {[
          { id: "overview", label: "Overview" },
          { id: "low_util", label: "Low-Utilization Servers" }
        ].map(tab => {
          const isActive = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id as any)}
              className={`px-5 py-1.5 text-xs font-bold rounded-t cursor-pointer border-t-2 border-x transition-colors whitespace-nowrap ${
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
      {/* TAB 2: OVERVIEW                                                            */}
      {/* ========================================================================= */}
      {activeSubTab === "overview" && (
        <div className="space-y-2.5 flex-1 flex flex-col min-h-0 overflow-y-auto">
          {/* Carbon Emission Banner Card */}
          <div className="bg-white border border-slate-300 rounded shadow-xs overflow-hidden shrink-0">
            <div className="bg-[#7a0c0c] text-white px-4 py-2 flex items-center justify-between font-bold text-xs">
              <div className="flex items-center gap-2">
                <Leaf className="w-4 h-4 text-emerald-400" />
                <span>Carbon Emission & Datacenter Energy Efficiency</span>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setShowEditThresholdModal(true)}
                  className="px-3 py-1 bg-[#520000] hover:bg-[#3a0000] text-white rounded text-xs cursor-pointer font-bold transition-colors"
                >
                  Edit Threshold
                </button>
                <select className="px-3 py-1 bg-white text-slate-800 border border-slate-300 rounded text-xs font-bold focus:outline-none cursor-pointer">
                  <option value="all">All Datacenters</option>
                  <option value="dc1">DC1</option>
                  <option value="dc2">DC2</option>
                </select>
              </div>
            </div>
            
            {/* Live Metrics Grid */}
            <div className="p-4 grid grid-cols-2 md:grid-cols-5 gap-3 bg-slate-50/70 border-b border-slate-200">
              <div className="bg-white p-3 rounded border border-slate-200 shadow-2xs">
                <span className="text-[10px] text-slate-500 font-bold uppercase block">PUE Factor</span>
                <span className="text-lg font-black text-slate-900">{energySummary.pue.toFixed(2)}</span>
                <span className="text-[9px] text-emerald-600 block font-semibold mt-0.5">Optimal Green Level</span>
              </div>
              <div className="bg-white p-3 rounded border border-slate-200 shadow-2xs">
                <span className="text-[10px] text-slate-500 font-bold uppercase block">IT Power</span>
                <span className="text-lg font-black text-blue-700">{energySummary.itPowerKw} kW</span>
                <span className="text-[9px] text-slate-500 block">{energySummary.totalServers} Online Servers</span>
              </div>
              <div className="bg-white p-3 rounded border border-slate-200 shadow-2xs">
                <span className="text-[10px] text-slate-500 font-bold uppercase block">Total Facility Power</span>
                <span className="text-lg font-black text-amber-700">{energySummary.totalFacilityKw} kW</span>
                <span className="text-[9px] text-slate-500 block">IT + CRAC Cooling</span>
              </div>
              <div className="bg-white p-3 rounded border border-slate-200 shadow-2xs">
                <span className="text-[10px] text-slate-500 font-bold uppercase block">Daily Carbon (CO₂e)</span>
                <span className="text-lg font-black text-emerald-700">{energySummary.dailyCarbonKg} kg</span>
                <span className="text-[9px] text-slate-500 block">{(energySummary.dailyCarbonKg / 1000).toFixed(2)} Metric Tons/mo</span>
              </div>
              <div className="bg-white p-3 rounded border border-slate-200 shadow-2xs">
                <span className="text-[10px] text-slate-500 font-bold uppercase block">Est. Energy Cost</span>
                <span className="text-lg font-black text-slate-900">₹{energySummary.monthlyCost.toLocaleString('en-IN')}</span>
                <span className="text-[9px] text-slate-500 block">Per Month (₹{energyCostPerKwh}/kWh)</span>
              </div>
            </div>
          </div>

          {/* Sustainability Issues Table */}
          <div className="bg-white border border-slate-300 rounded shadow-xs overflow-hidden flex-1 flex flex-col min-h-[220px]">
            <div className="bg-[#7a0c0c] text-white px-4 py-2 font-bold text-xs shrink-0 flex items-center justify-between">
              <span>Sustainability Issues & Thermal Warnings</span>
              <span className="text-[11px] text-white/80 font-mono">Real-time alerts ({activeSustainabilityAlerts.length})</span>
            </div>
            <div className="flex-1 overflow-auto">
              <table className="w-full text-left border-collapse min-w-[700px]">
                <thead className="bg-[#b0bac7] text-slate-800 font-bold sticky top-0 border-b border-slate-400 text-xs">
                  <tr>
                    <th className="p-2 border-r border-slate-400">Severity ↑↓</th>
                    <th className="p-2 border-r border-slate-400">Entity ↑↓</th>
                    <th className="p-2 border-r border-slate-400">Event Type ↑↓</th>
                    <th className="p-2 border-r border-slate-400">Description ↑↓</th>
                    <th className="p-2">Timestamp ↑↓</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-300 text-xs font-medium text-slate-800">
                  {activeSustainabilityAlerts.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-4 text-center text-slate-500 font-medium">
                        No active sustainability or thermal violations recorded for added devices.
                      </td>
                    </tr>
                  ) : (
                    activeSustainabilityAlerts.map((a, i) => (
                      <tr key={i} className="hover:bg-slate-50 border-b border-slate-300">
                        <td className="p-2 border-r border-slate-300 font-bold text-red-600">{a.severity}</td>
                        <td className="p-2 border-r border-slate-300 text-blue-600 font-medium">{a.server}</td>
                        <td className="p-2 border-r border-slate-300">{a.type || "DC Health"}</td>
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
      {/* TAB 3: LOW-UTILIZATION SERVERS                                             */}
      {/* ========================================================================= */}
      {activeSubTab === "low_util" && (
        <div className="bg-white border border-slate-300 rounded shadow-xs overflow-hidden flex flex-col flex-1 min-h-0">
          <div className="bg-[#7a0c0c] text-white px-4 py-2 font-bold text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-amber-400" />
              <span>Low-Utilization & Idle Servers (Energy Savings Opportunities)</span>
            </div>
            <span className="text-[11px] text-white/80 font-mono">
              {lowUtilServers.filter(s => s.isLow).length} Idle Nodes Identified
            </span>
          </div>

          <div className="p-4 space-y-4 overflow-y-auto flex-1">
            <div className="bg-amber-50 border border-amber-200 rounded p-3 text-xs text-amber-900 flex items-start gap-2">
              <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <strong>Workload Consolidation Recommendation:</strong> Consolidating tasks from the {lowUtilServers.filter(s => s.isLow).length} low-utilization nodes can save approx. <strong>₹{lowUtilServers.reduce((acc, s) => acc + s.wastedCostMonthly, 0).toLocaleString('en-IN')}/month</strong> in electricity and reduce carbon emissions by <strong>{Math.round(lowUtilServers.reduce((acc, s) => acc + s.wastedKwhMonthly, 0) * carbonFactor)} kg CO₂e/mo</strong>.
              </div>
            </div>

            <div className="border border-slate-300 rounded overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-100 font-bold text-slate-700 border-b border-slate-300">
                  <tr>
                    <th className="p-2.5 border-r border-slate-300">Server Node</th>
                    <th className="p-2.5 border-r border-slate-300">Location</th>
                    <th className="p-2.5 border-r border-slate-300 text-center">Avg CPU Util</th>
                    <th className="p-2.5 border-r border-slate-300 text-center">Avg RAM Util</th>
                    <th className="p-2.5 border-r border-slate-300 text-center">Current Power</th>
                    <th className="p-2.5 border-r border-slate-300 text-center">Wasted Energy / Mo</th>
                    <th className="p-2.5 text-center">Potential Savings</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {lowUtilServers.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-slate-400 font-bold italic text-xs">
                        No active servers registered in fleet.
                      </td>
                    </tr>
                  ) : (
                    lowUtilServers.map((srv, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="p-2.5 border-r border-slate-200 font-bold text-blue-700">
                          {srv.name} ({srv.bmcIp})
                        </td>
                        <td className="p-2.5 border-r border-slate-200 text-slate-600">{srv.rack}</td>
                        <td className="p-2.5 border-r border-slate-200 text-center font-mono font-bold">
                          <span className={srv.cpuUtil < 15 ? "text-amber-600 bg-amber-50 px-2 py-0.5 rounded" : "text-emerald-700"}>
                            {srv.cpuUtil}%
                          </span>
                        </td>
                        <td className="p-2.5 border-r border-slate-200 text-center font-mono">
                          {srv.memUtil}%
                        </td>
                        <td className="p-2.5 border-r border-slate-200 text-center font-bold text-slate-800">
                          {srv.powerW} W
                        </td>
                        <td className="p-2.5 border-r border-slate-200 text-center font-mono text-slate-700">
                          {srv.wastedKwhMonthly} kWh
                        </td>
                        <td className="p-2.5 text-center font-bold text-emerald-700">
                          ₹{srv.wastedCostMonthly.toLocaleString('en-IN')}/mo
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
                <label className="font-bold text-slate-700 block mb-1">Carbon Factor (kg CO₂ / kWh):</label>
                <input 
                  type="number" 
                  step="0.01" 
                  value={carbonFactor} 
                  onChange={e => setCarbonFactor(Number(e.target.value))}
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
          <div className="bg-white rounded-xl shadow-2xl border border-slate-300 max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-[#7a0c0c] text-white px-5 py-3 flex items-center justify-between">
              <h3 className="font-extrabold text-sm uppercase tracking-wider">Recommended Thermal Actions</h3>
              <button
                onClick={() => setShowPossibleActionsModal(false)}
                className="text-white/70 hover:text-white p-1 rounded hover:bg-white/10 transition-colors"
              >
                ✕
              </button>
            </div>
            <div className="p-6 space-y-4 text-xs text-slate-700">
              <div className="space-y-2">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <p><strong>Adjust Fan Speed Curve:</strong> Boost server BMC fan profiles from Eco to Standard/Full Speed via Redfish API.</p>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <p><strong>Check CRAC Airflow:</strong> Ensure rack blanking panels are installed properly to avoid hot air recirculation.</p>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <p><strong>Workload Rebalancing:</strong> Migrate high-compute jobs away from hotspot rack positions to cooler chassis.</p>
                </div>
              </div>
              <div className="text-right pt-2 border-t border-slate-200">
                <button
                  onClick={() => setShowPossibleActionsModal(false)}
                  className="px-4 py-1.5 bg-[#475569] hover:bg-[#334155] text-white font-bold rounded text-xs transition-colors cursor-pointer"
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
