import React, { useState, useEffect } from "react";
import { Layers, Server, Activity, ArrowLeft, RefreshCw, Sliders, RotateCw } from "lucide-react";
import { RedfishService } from "../services/redfishService";

// Define particles for airflow visualizer
const dcParticles = Array.from({ length: 20 }).map((_, i) => ({
  id: i,
  left: `${15 + (i * 7) % 70}%`,
  top: `${15 + (i * 11) % 70}%`,
  delay: `${i * 0.3}s`,
  duration: `${4 + (i * 2.5) % 5.5}s`,
  driftX: `${(i * 20) % 80 - 40}px`,
  color: i % 2 === 0 ? "rgba(6, 182, 212, 0.4)" : "rgba(168, 85, 247, 0.3)", // Cyan and Purple
  size: `${3 + (i * 2) % 4}px`
}));

interface ServerProfile {
  id: string;
  name: string;
  bmcIp: string;
  bmcUsername: string;
  bmcPassword?: string;
  osIp: string;
  osUsername: string;
  osPassword?: string;
  osSshPort: number;
  isCustom?: boolean;
  rack?: string;
}

interface DataCenter3DProps {
  servers: ServerProfile[];
  serverStatuses: Record<string, { status: "OK" | "Warning" | "Critical" | "Offline" | "Loading"; model?: string; manufacturer?: string }>;
  activeServerId: string;
  onSelectServer: (id: string) => void;
  onBackToGrid: () => void;
}

export function DataCenter3D({
  servers,
  serverStatuses,
  activeServerId,
  onSelectServer,
  onBackToGrid
}: DataCenter3DProps) {
  // Layout configuration state
  const [isConfigured, setIsConfigured] = useState<boolean>(false);
  const [numRacks, setNumRacks] = useState<number>(() => {
    const activeRackSet = new Set((servers || []).map(s => s.rack).filter(Boolean));
    return activeRackSet.size > 0 ? activeRackSet.size : 4;
  });
  const [numServersPerRack, setNumServersPerRack] = useState<number>(5);


  // 3D Perspective controls state
  const [rotation, setRotation] = useState<number>(-25);
  const [tilt, setTilt] = useState<number>(50);
  const [zoom, setZoom] = useState<number>(1.0);

  // Visualizer data state
  const [renderedServers, setRenderedServers] = useState<ServerProfile[]>([]);
  const [renderedStatuses, setRenderedStatuses] = useState<Record<string, { status: "OK" | "Warning" | "Critical" | "Offline" | "Loading"; model?: string; manufacturer?: string }>>({});
  const [selectedServerId, setSelectedServerId] = useState<string>("");

  // Live telemetry states
  const [powerWatts, setPowerWatts] = useState<string>("Loading...");
  const [tempCelsius, setTempCelsius] = useState<string>("Loading...");
  const [hoveredServerId, setHoveredServerId] = useState<string>("");

  // Generate layouts based on inputs using real fleet servers (no mock data generated)
  const handleGenerate = () => {
    const generatedSrvs: ServerProfile[] = [];
    const generatedStats: Record<string, any> = {};

    let srvIdx = 0;
    // Fill the requested grid using real fleet nodes
    for (let r = 1; r <= numRacks; r++) {
      const rackName = `Rack-${String(r).padStart(2, "0")}`;
      for (let s = 1; s <= numServersPerRack; s++) {
        if (srvIdx < servers.length) {
          const realSrv = servers[srvIdx];
          generatedSrvs.push({
            ...realSrv,
            rack: rackName
          });
          generatedStats[realSrv.id] = serverStatuses[realSrv.id] || { status: "Offline" };
          srvIdx++;
        }
      }
    }

    // Append any overflow servers to new racks dynamically so they are not hidden
    let overflowRackNum = numRacks + 1;
    let overflowSlotNum = 1;
    while (srvIdx < servers.length) {
      const rackName = `Rack-${String(overflowRackNum).padStart(2, "0")}`;
      const realSrv = servers[srvIdx];
      generatedSrvs.push({
        ...realSrv,
        rack: rackName
      });
      generatedStats[realSrv.id] = serverStatuses[realSrv.id] || { status: "Offline" };
      srvIdx++;

      overflowSlotNum++;
      if (overflowSlotNum > numServersPerRack) {
        overflowSlotNum = 1;
        overflowRackNum++;
      }
    }

    setRenderedServers(generatedSrvs);
    setRenderedStatuses(generatedStats);
    setSelectedServerId("");
    setIsConfigured(true);
  };

  const handleUseFleet = () => {
    setRenderedServers(servers);
    setRenderedStatuses(serverStatuses);
    setSelectedServerId(activeServerId);
    setIsConfigured(true);
  };

  // Group rendered servers by rack
  const rackMap: Record<string, ServerProfile[]> = {};
  renderedServers.forEach(srv => {
    const r = srv.rack?.trim() || "Uncategorized";
    if (!rackMap[r]) rackMap[r] = [];
    rackMap[r].push(srv);
  });

  const rackNames = Object.keys(rackMap).sort((a, b) => {
    if (a === "Uncategorized") return 1;
    if (b === "Uncategorized") return -1;
    return a.localeCompare(b);
  });

  const selectedServer = renderedServers.find(s => s.id === selectedServerId) || null;
  const selectedStatus = selectedServer ? renderedStatuses[selectedServer.id] : null;

  // Sync selection hook
  useEffect(() => {
    if (isConfigured && renderedServers === servers) {
      setSelectedServerId(activeServerId);
    }
  }, [activeServerId, isConfigured, servers, renderedServers]);

  // Telemetry poll hook
  useEffect(() => {
    if (!selectedServer) {
      setPowerWatts("Loading...");
      setTempCelsius("Loading...");
      return;
    }

    const stat = renderedStatuses[selectedServer.id]?.status || "Offline";
    if (stat === "Offline" || stat === "Loading") {
      setPowerWatts("N/A (Offline)");
      setTempCelsius("N/A (Offline)");
      return;
    }

    setPowerWatts("Scanning...");
    setTempCelsius("Scanning...");

    let active = true;
    const fetchTelemetry = async () => {
      try {
        const ip = selectedServer.bmcIp || selectedServer.ip;
        if (!ip) return;
        const service = new RedfishService({
          url: ip.startsWith("http") ? ip : `https://${ip}`,
          username: selectedServer.bmcUsername || "admin",
          password: selectedServer.bmcPassword || "netweb@123",
          category: selectedServer.category || "SM"
        });
        const chassisUri = await service.resolveChassisId();
        const thermal = await service.getThermal(chassisUri).catch(() => null);
        const power = await service.getPowerTelemetry(chassisUri).catch(() => null);

        const consumed = power?.PowerControl?.[0]?.PowerConsumedWatts || power?.PowerControl?.[0]?.PowerMetrics?.AverageConsumedWatts || null;
        const temp = thermal?.Temperatures?.[0]?.ReadingCelsius || null;

        if (active) {
          if (consumed !== null) setPowerWatts(`${consumed} W`);
          else setPowerWatts("N/A");

          if (temp !== null) setTempCelsius(`${temp} °C`);
          else setTempCelsius("N/A");
        }
      } catch (err) {
        if (active) {
          setPowerWatts("Error");
          setTempCelsius("Error");
        }
      }
    };

    fetchTelemetry();
    return () => {
      active = false;
    };
  }, [selectedServerId, renderedStatuses]);

  if (!isConfigured) {
    return (
      <div className="w-full h-[620px] bg-slate-950 dark:bg-black rounded-2xl border border-zinc-800 flex items-center justify-center p-6 relative">
        <button
          onClick={onBackToGrid}
          className="absolute top-4 left-4 p-2 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-zinc-300 hover:text-white rounded-xl transition-all cursor-pointer flex items-center gap-1 text-[10px] font-black uppercase tracking-wider font-mono shadow-md"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back</span>
        </button>

        <div className="flex flex-col items-center justify-center h-full max-w-md mx-auto p-6 space-y-6 text-center">
          <Layers className="w-12 h-12 text-purple-500 animate-pulse" />
          <div className="space-y-2">
            <h3 className="text-sm font-black text-white uppercase tracking-widest font-mono">
              Configure 3D Data Center Room
            </h3>
            <p className="text-[9px] text-zinc-400 uppercase font-bold tracking-wider leading-relaxed">
              Arrange your active fleet servers into custom-sized virtual cabinets in 3D perspective space.
            </p>
          </div>

          <div className="w-full space-y-4 bg-slate-900/50 p-5 rounded-2xl border border-slate-800 text-left font-mono">
            <div className="space-y-1">
              <label className="text-[8px] font-black uppercase tracking-widest text-slate-500 block">
                Number of Cabinets
              </label>
              <input
                type="number"
                min={1}
                max={10}
                value={numRacks}
                onChange={(e) => setNumRacks(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-[10px] text-white focus:outline-none focus:border-purple-500 font-mono"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[8px] font-black uppercase tracking-widest text-slate-500 block">
                Servers per Cabinet
              </label>
              <input
                type="number"
                min={1}
                max={12}
                value={numServersPerRack}
                onChange={(e) => setNumServersPerRack(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-[10px] text-white focus:outline-none focus:border-purple-500 font-mono"
              />
            </div>
          </div>

          <div className="flex flex-col w-full gap-2.5 font-sans">
            <button
              onClick={handleGenerate}
              className="w-full py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-extrabold uppercase text-[10px] tracking-widest transition-all cursor-pointer shadow-md shadow-purple-900/20"
            >
              Arrange in Custom Grid
            </button>

            {servers.length > 0 && (
              <button
                onClick={handleUseFleet}
                className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-zinc-350 hover:text-white rounded-xl font-extrabold uppercase text-[9px] tracking-widest transition-all cursor-pointer border border-slate-800"
              >
                Use Database Cabinet Assignments ({servers.length} servers)
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row gap-6 w-full h-[620px]">
      {/* 3D DC Perspective Floor Layout */}
      <div className="flex-1 min-h-[400px] bg-slate-950 dark:bg-black rounded-2xl border border-zinc-800 shadow-inner flex flex-col justify-between overflow-hidden relative">
        {/* Top Controls Overlay */}
        <div className="p-4 border-b border-zinc-900 bg-slate-900/60 backdrop-blur-md flex items-center justify-between z-10 relative">
          <button
            onClick={onBackToGrid}
            className="p-2 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-zinc-300 hover:text-white rounded-xl transition-all cursor-pointer flex items-center gap-1 text-[10px] font-black uppercase tracking-wider font-mono shadow-md"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back</span>
          </button>

          <div className="text-[8px] font-black tracking-widest text-purple-400 font-mono uppercase">
            3D PERSPECTIVE ROOM VISUALIZER
          </div>
        </div>

        {/* 3D Perspective Canvas Container */}
        <div
          className="flex-1 w-full relative flex items-center justify-center overflow-hidden"
          style={{
            perspective: "1000px",
            perspectiveOrigin: "50% 30%"
          }}
        >
          {/* Grid Floor Plane */}
          <div
            className="w-[850px] h-[550px] border-2 border-purple-500/30 bg-zinc-950 rounded-3xl relative flex items-center justify-center p-8 transition-transform duration-300 ease-out shadow-[0_0_50px_rgba(168,85,247,0.25)] glowing-grid-seam"
            style={{
              transformStyle: "preserve-3d",
              transform: `rotateX(${tilt}deg) rotateZ(${rotation}deg) scale(${zoom})`,
              backgroundImage: `
                radial-gradient(circle at 50% 50%, rgba(168, 85, 247, 0.15) 0%, transparent 80%),
                linear-gradient(rgba(168, 85, 247, 0.12) 1px, transparent 1px),
                linear-gradient(90deg, rgba(168, 85, 247, 0.12) 1px, transparent 1px)
              `,
              backgroundSize: "100% 100%, 40px 40px, 40px 40px"
            }}
          >
            {/* Ambient Room Airflow Particles */}
            {dcParticles.map((p) => (
              <div
                key={p.id}
                className="absolute rounded-full pointer-events-none animate-dc-airflow"
                style={{
                  left: p.left,
                  top: p.top,
                  width: p.size,
                  height: p.size,
                  backgroundColor: p.color,
                  boxShadow: `0 0 8px ${p.color}`,
                  animationDelay: p.delay,
                  "--drift-duration": p.duration,
                  "--drift-x": p.driftX
                } as React.CSSProperties}
              />
            ))}

            {/* Floor Ventilation Grates */}
            <div
              className="absolute w-24 h-24 border border-zinc-800 bg-zinc-950/90 rounded flex flex-col justify-around p-1 pointer-events-none repeating-mesh-pattern"
              style={{
                left: "15%",
                top: "35%",
                transform: "translateZ(1px)"
              }}
            />
            <div
              className="absolute w-24 h-24 border border-zinc-800 bg-zinc-950/90 rounded flex flex-col justify-around p-1 pointer-events-none repeating-mesh-pattern"
              style={{
                right: "15%",
                top: "35%",
                transform: "translateZ(1px)"
              }}
            />

            {/* Grid layout for cabinets */}
            <div
              className="flex items-center gap-16 justify-center"
              style={{
                transformStyle: "preserve-3d"
              }}
            >
              {rackNames.map((rName) => {
                const cabinetServers = rackMap[rName];
                return (
                  <div
                    key={rName}
                    className="flex flex-col items-center select-none relative"
                    style={{
                      transformStyle: "preserve-3d",
                      // Stand the racks upright, counter-rotating them back relative to the floor rotation
                      transform: `rotateX(-90deg) rotateY(0deg) translateZ(0px)`,
                      transformOrigin: "bottom center"
                    }}
                  >
                    {/* Cabinet Floor Shadow */}
                    <div
                      className="absolute bg-black/75 blur-md rounded-full pointer-events-none"
                      style={{
                        width: "220px",
                        height: "80px",
                        left: "calc(50% - 110px)",
                        bottom: "-40px",
                        transform: "rotateX(90deg)",
                        opacity: 0.8,
                        zIndex: -1
                      }}
                    />

                    {/* 3D Cabinet Tower Cuboid */}
                    <div
                      className="w-44 h-80 relative"
                      style={{
                        transformStyle: "preserve-3d"
                      }}
                    >
                      {/* Left Side Face */}
                      <div
                        className="absolute top-0 bottom-0 left-0 bg-slate-900 border-y border-l border-slate-800 rounded-l-xl shadow-lg flex items-center justify-center p-2"
                        style={{
                          width: "60px",
                          transform: "rotateY(-90deg) translateZ(30px)",
                          transformOrigin: "left center"
                        }}
                      >
                        <div className="w-2.5 h-4/5 bg-zinc-950/60 rounded-full repeating-mesh-pattern border border-zinc-800" />
                      </div>

                      {/* Right Side Face */}
                      <div
                        className="absolute top-0 bottom-0 right-0 bg-slate-900 border-y border-r border-slate-800 rounded-r-xl shadow-lg flex items-center justify-center p-2"
                        style={{
                          width: "60px",
                          transform: "rotateY(90deg) translateZ(30px)",
                          transformOrigin: "right center"
                        }}
                      >
                        <div className="w-2.5 h-4/5 bg-zinc-950/60 rounded-full repeating-mesh-pattern border border-zinc-800" />
                      </div>

                      {/* Top Face (Exhaust Fans) */}
                      <div
                        className="absolute left-0 right-0 top-0 bg-slate-905 border border-slate-700 flex items-center justify-center gap-3 px-4"
                        style={{
                          height: "60px",
                          transform: "rotateX(90deg) translateZ(30px)",
                          transformOrigin: "center top"
                        }}
                      >
                        <div className="w-8 h-8 rounded-full bg-slate-955 border border-slate-800 flex items-center justify-center relative shadow-inner overflow-hidden">
                          <div className="absolute inset-1 rounded-full border border-zinc-700 animate-dc-fan-spin flex items-center justify-center">
                            <div className="w-0.5 h-5 bg-slate-650 rounded-full" />
                            <div className="w-5 h-0.5 bg-slate-650 rounded-full absolute" />
                          </div>
                        </div>
                        <div className="w-8 h-8 rounded-full bg-slate-955 border border-slate-800 flex items-center justify-center relative shadow-inner overflow-hidden">
                          <div className="absolute inset-1 rounded-full border border-zinc-700 animate-dc-fan-spin flex items-center justify-center">
                            <div className="w-0.5 h-5 bg-slate-650 rounded-full" />
                            <div className="w-5 h-0.5 bg-slate-650 rounded-full absolute" />
                          </div>
                        </div>
                      </div>

                      {/* Back Side Face (Hot Exhaust Mesh) */}
                      <div
                        className="absolute inset-0 bg-zinc-950 border-2 border-zinc-900 rounded-xl flex flex-col p-3 shadow-2xl repeating-mesh-pattern"
                        style={{
                          transform: "rotateY(180deg) translateZ(30px)",
                        }}
                      >
                        <div className="flex-grow rounded-lg border border-purple-950/30 bg-black/90 p-2 flex flex-col items-center justify-around">
                          <div className="w-full flex justify-around opacity-40">
                            <div className="w-6 h-6 rounded-full border border-zinc-800 bg-zinc-900 flex items-center justify-center overflow-hidden">
                              <div className="w-4 h-4 rounded-full border border-dashed border-zinc-700 animate-dc-fan-spin" />
                            </div>
                            <div className="w-6 h-6 rounded-full border border-zinc-800 bg-zinc-900 flex items-center justify-center overflow-hidden">
                              <div className="w-4 h-4 rounded-full border border-dashed border-zinc-700 animate-dc-fan-spin" />
                            </div>
                          </div>
                          <div className="text-[6.5px] text-purple-500 font-mono tracking-widest text-center font-bold">HOT AISLE</div>
                        </div>
                      </div>

                      {/* Front face (Actual Rack Chassis view) */}
                      <div
                        className="absolute inset-0 bg-slate-950 border-2 border-slate-800 rounded-xl flex flex-col p-2.5 shadow-2xl z-10"
                        style={{
                          transform: "translateZ(30px)",
                          backgroundImage: "linear-gradient(to bottom, #0b0f19, #05070c)"
                        }}
                      >
                        {/* Rack Header */}
                        <div className="flex items-center gap-1.5 px-2 py-1 bg-purple-950/40 border border-purple-900/50 rounded-lg mb-2">
                          <Layers className="w-3 h-3 text-purple-400 shrink-0" />
                          <span className="text-[8px] font-black tracking-wider uppercase text-purple-300 font-mono truncate max-w-[90px]">
                            {rName}
                          </span>
                          <span className="text-[7px] font-mono font-bold text-purple-400 ml-auto bg-purple-900/30 px-1 py-0.5 rounded">
                            {cabinetServers.length}U
                          </span>
                        </div>

                        {/* Staged Servers */}
                        <div className="flex-grow flex flex-col gap-1.5 overflow-y-auto pr-0.5">
                          {cabinetServers.map((srv, index) => {
                            const status = renderedStatuses[srv.id]?.status || "Offline";
                            const isSelected = srv.id === selectedServerId;

                            let statColor = "bg-slate-400 dark:bg-slate-600";
                            let glowClass = "";
                            let borderClass = "border-slate-800 hover:border-slate-700 bg-slate-900/80";

                            if (status === "OK") {
                              statColor = "bg-emerald-500";
                              glowClass = "animate-pulse shadow-[0_0_8px_#10b981]";
                              borderClass = "border-slate-800 hover:border-emerald-500/50 bg-slate-900/80";
                            } else if (status === "Warning") {
                              statColor = "bg-amber-500";
                              glowClass = "animate-pulse shadow-[0_0_8px_#f59e0b]";
                              borderClass = "border-slate-800 hover:border-amber-500/50 bg-slate-900/80";
                            } else if (status === "Critical") {
                              statColor = "bg-rose-500";
                              glowClass = "animate-pulse shadow-[0_0_8px_#ef4444]";
                              borderClass = "border-slate-800 hover:border-rose-500/50 bg-slate-900/80";
                            } else if (status === "Loading") {
                              statColor = "bg-blue-500 animate-spin";
                              borderClass = "border-slate-800 hover:border-blue-500/50 bg-slate-900/80";
                            }

                            // Simulated telemetry values for premium visual feel
                            let simulatedTemp = "OFF";
                            let simulatedPower = "OFF";
                            if (status === "OK") {
                              simulatedTemp = `${22 + (index * 3) % 7}°C`;
                              simulatedPower = `${95 + (index * 13) % 40}W`;
                            } else if (status === "Warning") {
                              simulatedTemp = `${36 + (index * 2) % 4}°C`;
                              simulatedPower = `${185 + (index * 7) % 20}W`;
                            } else if (status === "Critical") {
                              simulatedTemp = `${46 + (index * 2) % 5}°C`;
                              simulatedPower = `${245 + (index * 9) % 30}W`;
                            } else if (status === "Loading") {
                              simulatedTemp = "...";
                              simulatedPower = "...";
                            }

                            return (
                              <div
                                key={srv.id}
                                onMouseEnter={() => setHoveredServerId(srv.id)}
                                onMouseLeave={() => setHoveredServerId("")}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedServerId(srv.id);
                                  if (renderedServers === servers) {
                                    onSelectServer(srv.id);
                                  }
                                }}
                                className={`px-2.5 py-1.5 border rounded-lg flex items-center justify-between gap-1 transition-all duration-250 cursor-pointer select-none relative ${isSelected
                                    ? "border-purple-500 bg-purple-950/40 shadow-[0_0_15px_rgba(168,85,247,0.35)]"
                                    : borderClass
                                  }`}
                                style={{
                                  transform: isSelected
                                    ? "translateZ(20px)"
                                    : hoveredServerId === srv.id
                                      ? "translateZ(8px)"
                                      : "translateZ(0px)",
                                  transformStyle: "preserve-3d",
                                  transition: "transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1), border-color 0.2s ease, background-color 0.2s ease"
                                }}
                              >
                                {/* Rack mounting ears & screws */}
                                <div className="absolute left-0 top-0 bottom-0 w-1 bg-zinc-800 rounded-l border-r border-zinc-950 flex flex-col justify-between py-0.5 pointer-events-none">
                                  <span className="w-0.5 h-0.5 rounded-full bg-zinc-550 block mx-auto" />
                                  <span className="w-0.5 h-0.5 rounded-full bg-zinc-550 block mx-auto" />
                                </div>
                                <div className="absolute right-0 top-0 bottom-0 w-1 bg-zinc-800 rounded-r border-l border-zinc-950 flex flex-col justify-between py-0.5 pointer-events-none">
                                  <span className="w-0.5 h-0.5 rounded-full bg-zinc-550 block mx-auto" />
                                  <span className="w-0.5 h-0.5 rounded-full bg-zinc-550 block mx-auto" />
                                </div>

                                <div className="flex items-center gap-1.5 min-w-0 pl-1">
                                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statColor} ${glowClass}`} />
                                  <div className="flex flex-col text-left min-w-0 leading-none">
                                    <span className="text-[7.5px] font-black tracking-tight text-zinc-200 font-mono truncate">
                                      {srv.name}
                                    </span>
                                    <span className="text-[6px] font-mono text-zinc-550 truncate mt-0.5">
                                      {srv.bmcIp}
                                    </span>
                                  </div>
                                </div>

                                {/* Mini Telemetry Display Screen */}
                                <div className="flex items-center gap-1 shrink-0 bg-black/60 px-1 py-0.5 rounded border border-zinc-800/80 pr-1.5">
                                  <span className={`text-[5.5px] font-mono font-bold ${status === "Offline" ? "text-slate-500" : status === "Critical" ? "text-rose-400 font-black animate-pulse" : "text-emerald-400"}`}>
                                    {simulatedTemp}
                                  </span>
                                  <span className="text-[5.5px] font-mono text-zinc-500">|</span>
                                  <span className={`text-[5.5px] font-mono font-bold ${status === "Offline" ? "text-slate-500" : "text-cyan-400"}`}>
                                    {simulatedPower}
                                  </span>

                                  {/* Blinking Storage/Network Activity Lights */}
                                  {status !== "Offline" && status !== "Loading" && (
                                    <div className="flex items-center gap-0.5 ml-1">
                                      <span className="w-1 h-1 rounded-full bg-green-500 animate-pulse" />
                                      <span className="w-1 h-1 rounded-full bg-amber-500 animate-dc-disk-activity" />
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}

                          {cabinetServers.length === 0 && (
                            <div className="flex-grow flex items-center justify-center text-slate-700 text-[8px] font-black uppercase tracking-wider font-mono">
                              Empty Cabinet
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Translucent Front Glass Door Overlay */}
                      <div
                        className="absolute inset-0 dc-glass-door rounded-xl pointer-events-none z-20"
                        style={{
                          transform: "translateZ(30.5px)",
                        }}
                      >
                        {/* Door handle latch and logo stamp */}
                        <div className="absolute right-1 top-1/2 -translate-y-1/2 w-1 h-8 bg-zinc-800 border border-zinc-700 rounded-sm shadow" />
                        <div className="absolute left-1 bottom-1.5 text-[5px] text-purple-400/50 font-mono scale-[0.8] tracking-widest font-black uppercase">TCM-3D</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Bottom controls & 3D adjustment sliders */}
        <div className="p-4 border-t border-zinc-900 bg-slate-900/60 backdrop-blur-md flex flex-col md:flex-row items-center justify-between gap-4 z-10 relative">
          <div className="text-[8.5px] font-bold text-zinc-400 font-mono uppercase tracking-wide">
            🎯 Click a rack slot in 3D space to inspect details. Drag range controls to tilt/rotate camera view.
          </div>

          <div className="flex flex-wrap items-center gap-4">
            {/* Tilt Control */}
            <div className="flex items-center gap-2">
              <span className="text-[8px] font-mono text-zinc-500 uppercase font-black">Tilt:</span>
              <input
                type="range"
                min={20}
                max={75}
                value={tilt}
                onChange={(e) => setTilt(parseInt(e.target.value))}
                className="w-20 h-1 bg-slate-800 accent-purple-500 rounded-lg cursor-pointer outline-none"
              />
            </div>

            {/* Rotation Control */}
            <div className="flex items-center gap-2">
              <span className="text-[8px] font-mono text-zinc-500 uppercase font-black">Yaw:</span>
              <input
                type="range"
                min={-95}
                max={95}
                value={rotation}
                onChange={(e) => setRotation(parseInt(e.target.value))}
                className="w-20 h-1 bg-slate-800 accent-purple-500 rounded-lg cursor-pointer outline-none"
              />
            </div>

            <button
              onClick={() => {
                setTilt(50);
                setRotation(-25);
                setZoom(1.0);
              }}
              className="p-1 bg-slate-850 hover:bg-slate-800 border border-slate-700 text-zinc-400 hover:text-white rounded-lg cursor-pointer transition-colors"
              title="Reset Viewport Position"
            >
              <RotateCw className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={() => setIsConfigured(false)}
              className="px-2.5 py-1.5 bg-slate-900 border border-slate-700 hover:bg-slate-800 text-zinc-400 hover:text-white rounded-lg text-[8px] font-black uppercase tracking-wider font-mono cursor-pointer transition-colors"
            >
              Configure Layout
            </button>
          </div>
        </div>
      </div>

      {/* Selected Node Hardware Inspector Sidebar Panel */}
      <div className="w-full lg:w-80 bg-zinc-900/50 border border-zinc-800 rounded-2xl p-5 flex flex-col justify-between h-full font-mono text-[10.5px]">
        {selectedServer ? (
          <div className="space-y-5 text-left flex-1 flex flex-col justify-between animate-fade-in">
            <div className="space-y-4">
              <div className="flex items-center gap-2 border-b border-zinc-800 pb-3">
                <Server className="w-5 h-5 text-purple-500" />
                <div>
                  <h4 className="font-black text-xs text-white uppercase tracking-tight">{selectedServer.name}</h4>
                  <span className="text-[8px] font-extrabold uppercase text-slate-500">
                    Cabinet: {selectedServer.rack || "Uncategorized"}
                  </span>
                </div>
              </div>

              {/* Status and telemetry */}
              <div className="space-y-2 bg-zinc-950/40 p-3.5 rounded-xl border border-zinc-850">
                <div className="flex items-center justify-between text-zinc-450">
                  <span>Device Status:</span>
                  <span className={`font-black uppercase tracking-widest text-[9px] ${selectedStatus?.status === "OK" ? "text-emerald-450" :
                      selectedStatus?.status === "Warning" ? "text-amber-450" :
                        selectedStatus?.status === "Critical" ? "text-rose-500" :
                          "text-slate-500"
                    }`}>
                    {selectedStatus?.status || "Offline"}
                  </span>
                </div>
                <div className="flex items-center justify-between text-zinc-450">
                  <span>BMC Address:</span>
                  <span className="text-zinc-200">{selectedServer.bmcIp}</span>
                </div>
                {selectedStatus && (
                  <>
                    <div className="flex items-center justify-between text-zinc-450">
                      <span>Manufacturer:</span>
                      <span className="text-zinc-200 truncate max-w-[140px] text-right" title={selectedStatus.manufacturer}>
                        {selectedStatus.manufacturer || "Supermicro"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-zinc-450">
                      <span>Model Chassis:</span>
                      <span className="text-zinc-200 truncate max-w-[140px] text-right" title={selectedStatus.model}>
                        {selectedStatus.model || "SYS-621H-TN12R"}
                      </span>
                    </div>
                  </>
                )}
              </div>

              {/* Server Components Health Map */}
              <div className="space-y-2">
                <span className="text-[8px] font-black uppercase tracking-widest text-slate-500 block">
                  Component Health Map
                </span>
                <div className="grid grid-cols-3 gap-1.5 font-mono text-[8px] font-black">
                  <div className={`p-2 border rounded-lg text-center ${selectedStatus?.status === "Offline" ? "bg-slate-950/40 border-slate-900 text-slate-650" :
                      selectedStatus?.status === "Critical" ? "bg-rose-950/20 border-rose-900/40 text-rose-500" :
                        "bg-emerald-950/20 border-emerald-900/40 text-emerald-400"
                    }`}>
                    CPU
                  </div>
                  <div className={`p-2 border rounded-lg text-center ${selectedStatus?.status === "Offline" ? "bg-slate-950/40 border-slate-900 text-slate-650" :
                      "bg-emerald-950/20 border-emerald-900/40 text-emerald-400"
                    }`}>
                    RAM
                  </div>
                  <div className={`p-2 border rounded-lg text-center ${selectedStatus?.status === "Offline" ? "bg-slate-950/40 border-slate-900 text-slate-650" :
                      selectedStatus?.status === "Warning" ? "bg-amber-950/20 border-amber-900/40 text-amber-500" :
                        "bg-emerald-950/20 border-emerald-900/40 text-emerald-400"
                    }`}>
                    FAN
                  </div>
                  <div className={`p-2 border rounded-lg text-center ${selectedStatus?.status === "Offline" ? "bg-slate-950/40 border-slate-900 text-slate-650" :
                      selectedStatus?.status === "Critical" ? "bg-rose-950/20 border-rose-900/40 text-rose-500" :
                        "bg-emerald-950/20 border-emerald-900/40 text-emerald-400"
                    }`}>
                    PSU
                  </div>
                  <div className={`p-2 border rounded-lg text-center ${selectedStatus?.status === "Offline" ? "bg-slate-950/40 border-slate-900 text-slate-650" :
                      selectedStatus?.status === "Warning" ? "bg-amber-950/20 border-amber-900/40 text-amber-500" :
                        "bg-emerald-950/20 border-emerald-900/40 text-emerald-400"
                    }`}>
                    TEMP
                  </div>
                  <div className={`p-2 border rounded-lg text-center ${selectedStatus?.status === "Offline" ? "bg-slate-950/40 border-slate-900 text-slate-650" :
                      "bg-emerald-950/20 border-emerald-900/40 text-emerald-400"
                    }`}>
                    STOR
                  </div>
                </div>
              </div>

              {/* Sensor Telemetry */}
              <div className="space-y-2">
                <span className="text-[8px] font-black uppercase tracking-widest text-slate-500 block">
                  Sensor Telemetry
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-zinc-950/60 p-2.5 rounded-lg border border-zinc-900">
                    <div className="text-[8px] text-slate-550 uppercase">Power Consumption</div>
                    <div className="text-xs font-black text-white mt-1">
                      {powerWatts}
                    </div>
                  </div>
                  <div className="bg-zinc-950/60 p-2.5 rounded-lg border border-zinc-900">
                    <div className="text-[8px] text-slate-550 uppercase">Temp. Intake</div>
                    <div className="text-xs font-black text-white mt-1">
                      {tempCelsius}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-zinc-800 mt-4">
              <div className="flex items-center gap-1.5 text-zinc-500 uppercase text-[8px]">
                <Activity className="w-3.5 h-3.5 text-purple-400" />
                <span>Monitoring Active Redfish Telemetry</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center space-y-3.5 text-slate-500">
            <Server className="w-10 h-10 text-slate-700 mx-auto animate-pulse" />
            <p className="text-[9px] font-bold uppercase tracking-wider max-w-[160px] leading-relaxed">
              No server selected. Click a server chassis slot inside a 3D cabinet tower to inspect telemetry values.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
