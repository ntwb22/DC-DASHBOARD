import React, { useState, useEffect } from "react";
import { ServerInventory } from "./components/ServerInventory";
import { RedfishService, validateBmcCredentials } from "./services/redfishService";
import { Dashboard } from "./components/Dashboard";
import { GlobalInventory } from "./components/GlobalInventory";
import { HierarchyView } from "./components/HierarchyView";
import { EventsView } from "./components/EventsView";
import { AIOpsView } from "./components/AIOpsView";
import { ReliabilityView } from "./components/ReliabilityView";
import { SustainabilityView } from "./components/SustainabilityView";
import { GpuView } from "./components/GpuView";
import { ReportsView } from "./components/ReportsView";
import { SettingsView } from "./components/SettingsView";
import { DashboardChatbot } from "./components/DashboardChatbot";
import { AboutModal } from "./components/AboutModal";
import { UserGuideModal } from "./components/UserGuideModal";
import { ReleaseNotesModal } from "./components/ReleaseNotesModal";
import { AddDeviceModal } from "./components/AddDeviceModal";


import {
  Database,
  ArrowLeft,
  Server,
  Network,
  RefreshCw,
  Info,
  Activity,
  Eye,
  EyeOff,
  Trash2,
  ShieldAlert,
  AlertTriangle,
  Play,
  Download,
  Copy,
  Check,
  Terminal,
  X,
  Plus,
  Pencil,
  LayoutGrid,
  Layers,
  Cpu,
  Zap,
  BarChart3,
  Bot,
  ChevronDown,
  ChevronRight,
  ChevronsRight,
  Search,
  User,
  LogOut,
  HelpCircle,
  HardDrive,
  Bell,
  AlertOctagon,
  CheckCircle2,
  SlidersHorizontal,
  Heart,
  FileText,
  Lock,
  Key,
  Settings,
  ClipboardList,
  FileBarChart,
  Smartphone
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface ServerProfile {
  id: string;
  name: string;
  bmcIp: string;
  bmcUsername?: string;
  bmcPassword?: string;
  osIp?: string;
  osUsername?: string;
  osPassword?: string;
  osSshPort?: number;
  isCustom?: boolean;
  rack?: string;
  weight?: string;
  weightKg?: string;
  size?: string;
  sizeU?: string;
  deratedPowerW?: number | string;
  powerW?: number | string;
  serialNumber?: string;
  model?: string;
  vendor?: string;
  memory?: string | number;
}

interface HardwareLog {
  id: string;
  type: "NIC" | "HBA" | "Power" | "Thermal";
  message: string;
  severity: "OK" | "Warning" | "Critical";
  timestamp: string;
  server: string;
}

const validateBmc = async (ip: string, user: string, pass: string): Promise<void> => {
  const cleanIp = ip.trim();
  if (!cleanIp || cleanIp.toLowerCase() === "demo" || cleanIp.toLowerCase() === "demo-server.local" || cleanIp === "DEMO_MODE") {
    throw new Error("Connection Failed: Unable to ping or reach server.");
  }
  let targetUrl = cleanIp.startsWith("http") ? cleanIp : `https://${cleanIp}`;

  if (targetUrl.endsWith("/")) {
    targetUrl = targetUrl.slice(0, -1);
  }

  const rootUrl = `${targetUrl}/redfish/v1/`;
  const systemsUrl = `${targetUrl}/redfish/v1/Systems`;

  let b64;
  try {
    b64 = btoa(`${user.trim()}:${pass}`);
  } catch (err) {
    throw new Error("Invalid username/password characters for encoding.");
  }

  try {
    const response1 = await fetch("/api/redfish/proxy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: rootUrl,
        method: "GET",
        headers: {
          "Authorization": `Basic ${b64}`
        }
      })
    });

    if (!response1.ok) {
      if (response1.status === 401 || response1.status === 403) {
        throw new Error("Authentication Failed: Incorrect BMC Username or Password.");
      }
      throw new Error(`Connection Failed: Unable to ping or reach server at ${cleanIp}.`);
    }

    const response2 = await fetch("/api/redfish/proxy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: systemsUrl,
        method: "GET",
        headers: {
          "Authorization": `Basic ${b64}`
        }
      })
    });

    if (!response2.ok) {
      if (response2.status === 401 || response2.status === 403) {
        throw new Error("Authentication Failed: Incorrect BMC Username or Password.");
      }
      throw new Error(`Connection Failed: Unable to ping or reach server at ${cleanIp}.`);
    }
  } catch (err: any) {
    if (err.message && (err.message.includes("Authentication Failed") || err.message.includes("Connection Failed") || err.message.includes("Incorrect"))) {
      throw err;
    }
    throw new Error(`Connection Failed: Target IP ${cleanIp} did not respond or ping failed.`);
  }
};

export default function App() {
  // Authentication State for Login / Logout
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(() => {
    try {
      return localStorage.getItem("tyrone_authenticated") === "true";
    } catch {
      return true;
    }
  });
  const [loginUsername, setLoginUsername] = useState<string>(() => {
    try {
      return localStorage.getItem("tyrone_user") || "admin";
    } catch {
      return "admin";
    }
  });
  const [loginPassword, setLoginPassword] = useState<string>("admin");
  const [showLoginPassword, setShowLoginPassword] = useState<boolean>(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // Default fallback servers - MUST BE EMPTY to prevent querying unadded or deleted servers
  const defaultServersList: ServerProfile[] = [];

  const [servers, setServers] = useState<ServerProfile[]>(() => {
    try {
      const saved = localStorage.getItem("tyrone_fleet");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const deletedKeys = (() => {
            try {
              const raw = localStorage.getItem("tyrone_deleted_keys");
              return raw ? new Set<string>(JSON.parse(raw)) : new Set<string>();
            } catch { return new Set<string>(); }
          })();

          const staleIPs = new Set(["172.16.12.142", "172.16.15.202", "172.16.15.237", "172.16.12.250"]);
          const filtered = parsed
            .filter((item: any) => {
              const k1 = String(item.id || "").toLowerCase();
              const k2 = String(item.bmcIp || item.ip || "").toLowerCase();
              const k3 = String(item.name || "").toLowerCase();
              return !deletedKeys.has(k1) && !deletedKeys.has(k2) && !deletedKeys.has(k3) && !staleIPs.has(item.bmcIp || item.ip);
            })
            .map((item: any) => ({
              id: item.id || `srv-${item.bmcIp || item.ip}`,
              name: item.name || `Server (${item.bmcIp || item.ip})`,
              bmcIp: item.bmcIp || item.ip,
              bmcUsername: item.bmcUsername || item.username || (item.bmcIp === "172.16.12.50" ? "ADMIN" : "admin"),
              bmcPassword: item.bmcPassword || item.password || (item.bmcIp === "172.16.12.50" ? "ADMIN" : (item.bmcIp === "172.16.12.55" ? "netweb@123" : "netweb@123")),
              osIp: item.osIp || item.bmcIp || item.ip,
              weight: item.weight || item.weightKg || "22.8 kg",
              weightKg: item.weightKg || item.weight || "22.8 kg",
              size: item.size || item.sizeU || "2U",
              sizeU: item.sizeU || item.size || "2U",
              deratedPowerW: item.deratedPowerW || item.powerW || 750,
              powerW: item.powerW || item.deratedPowerW || 750,
              isCustom: true,
              rack: item.rack || "Rack 1"
            }));
          try {
            localStorage.setItem("tyrone_fleet", JSON.stringify(filtered));
          } catch (_) { }
          return filtered;
        }
      }
      return [];
    } catch {
      return [];
    }
  });

  const [activeServerId, setActiveServerId] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Active Tab View State matching sidebar
  const [activeTab, setActiveTab] = useState<
    "dashboard" | "hierarchy" | "global_inventory" | "sustainability" | "reliability" | "events" | "gpu" | "aiops" | "reports" | "settings" | "inventory_details"
  >("dashboard");

  // Sidebar Devices Submenu Expansion State
  const [isDevicesExpanded, setIsDevicesExpanded] = useState<boolean>(true);

  const [copiedCommand, setCopiedCommand] = useState<boolean>(false);
  const [showChatbot, setShowChatbot] = useState<boolean>(false);

  // Add Node State
  const [showAddNodeModal, setShowAddNodeModal] = useState<boolean>(false);
  const [nodeName, setNodeName] = useState<string>("");
  const [nodeBmcIp, setNodeBmcIp] = useState<string>("");
  const [nodeBmcUsername, setNodeBmcUsername] = useState<string>("admin");
  const [nodeBmcPassword, setNodeBmcPassword] = useState<string>("netweb@123");
  const [nodeOsIp, setNodeOsIp] = useState<string>("");
  const [nodeOsUsername, setNodeOsUsername] = useState<string>("root");
  const [nodeOsPassword, setNodeOsPassword] = useState<string>("root");
  const [nodeOsSshPort, setNodeOsSshPort] = useState<number>(22);
  const [isSubmittingNode, setIsSubmittingNode] = useState<boolean>(false);
  const [nodeFormError, setNodeFormError] = useState<string | null>(null);

  // Edit Node State
  const [showEditNodeModal, setShowEditNodeModal] = useState<boolean>(false);
  const [editNodeId, setEditNodeId] = useState<string>("");
  const [editNodeName, setEditNodeName] = useState<string>("");
  const [editNodeBmcIp, setEditNodeBmcIp] = useState<string>("");
  const [editNodeBmcUsername, setEditNodeBmcUsername] = useState<string>("");
  const [editNodeBmcPassword, setEditNodeBmcPassword] = useState<string>("");
  const [editNodeWeight, setEditNodeWeight] = useState<string>("22.8 kg");
  const [editNodeSize, setEditNodeSize] = useState<string>("2U");
  const [editNodeDeratedPowerW, setEditNodeDeratedPowerW] = useState<string>("750");
  const [editNodeRack, setEditNodeRack] = useState<string>("Rack 1");
  const [showEditPassword, setShowEditPassword] = useState<boolean>(false);

  // Help Dropdown & Modals State
  const [isHelpDropdownOpen, setIsHelpDropdownOpen] = useState<boolean>(false);
  const [isAboutModalOpen, setIsAboutModalOpen] = useState<boolean>(false);
  const [isUserGuideModalOpen, setIsUserGuideModalOpen] = useState<boolean>(false);
  const [isReleaseNotesModalOpen, setIsReleaseNotesModalOpen] = useState<boolean>(false);
  const [editNodeOsIp, setEditNodeOsIp] = useState<string>("");
  const [editNodeOsUsername, setEditNodeOsUsername] = useState<string>("root");
  const [editNodeOsPassword, setEditNodeOsPassword] = useState<string>("root");
  const [editNodeOsSshPort, setEditNodeOsSshPort] = useState<number>(22);
  const [editNodeFormError, setEditNodeFormError] = useState<string | null>(null);

  // Server Statuses tracking state
  const [serverStatuses, setServerStatuses] = useState<
    Record<string, { status: "OK" | "Warning" | "Critical" | "Offline" | "Loading"; model?: string; manufacturer?: string; temperature?: number }>
  >({});

  // Alert & Log Tracking State
  const [alerts, setAlerts] = useState<HardwareLog[]>([]);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [lastScanTime, setLastScanTime] = useState<string>("");
  const [showErrorAlertsModal, setShowErrorAlertsModal] = useState<boolean>(false);
  const [refreshKey, setRefreshKey] = useState<number>(0);

  // Search filter
  const [searchQuery, setSearchQuery] = useState<string>("");

  useEffect(() => {
    if (!showAddNodeModal) {
      setNodeFormError(null);
    }
  }, [showAddNodeModal]);

  useEffect(() => {
    if (!showEditNodeModal) {
      setEditNodeFormError(null);
    }
  }, [showEditNodeModal]);

  const defaultServers = defaultServersList;

  // Fetch servers from environment & local fleet silently in background
  const fetchServers = async () => {
    if (servers.length === 0) setLoading(true);
    setError(null);
    try {
      let envServers: ServerProfile[] = [];
      let fleetServers: any[] = [];

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1500);
        const [envRes, fleetRes] = await Promise.allSettled([
          fetch("/api/local/env-servers", { signal: controller.signal }),
          fetch("/api/local/fleet", { signal: controller.signal })
        ]);
        clearTimeout(timeoutId);

        if (envRes.status === "fulfilled" && envRes.value.ok) {
          const content = await envRes.value.json().catch(() => []);
          if (Array.isArray(content) && content.length > 0) {
            envServers = content;
          }
        }
        if (fleetRes.status === "fulfilled" && fleetRes.value.ok) {
          const content = await fleetRes.value.json().catch(() => []);
          if (Array.isArray(content)) {
            fleetServers = content;
          }
        }
      } catch (err) {
        console.warn("Error fetching server lists:", err);
      }

      const savedFleet = (() => {
        try {
          const s = localStorage.getItem("tyrone_fleet");
          return s ? JSON.parse(s) : [];
        } catch { return []; }
      })();

      if (savedFleet.length > 0) {
        const seenKeys = new Set<string>();
        const mergedFleet: any[] = [];

        savedFleet.forEach((item: any) => {
          const k1 = String(item.id || "").toLowerCase();
          const k2 = String(item.bmcIp || item.ip || "").toLowerCase();
          if (k1) seenKeys.add(k1);
          if (k2) seenKeys.add(k2);
          mergedFleet.push(item);
        });

        fleetServers.forEach((item: any) => {
          const k1 = String(item.id || "").toLowerCase();
          const k2 = String(item.bmcIp || item.ip || "").toLowerCase();
          if ((!k1 || !seenKeys.has(k1)) && (!k2 || !seenKeys.has(k2))) {
            if (k1) seenKeys.add(k1);
            if (k2) seenKeys.add(k2);
            mergedFleet.push(item);
          }
        });

        fleetServers = mergedFleet;
      }

      const mappedFleet: ServerProfile[] = fleetServers.map((item: any) => {
        let cleanIp = item.bmcIp || item.ip || "";
        if (!cleanIp && item.url) {
          try {
            const cleanUrl = item.url.startsWith("http") ? item.url : `https://${item.url}`;
            cleanIp = new URL(cleanUrl).hostname;
          } catch (_) {
            cleanIp = item.url || "";
          }
        }
        return {
          id: item.id || `fleet-${cleanIp}`,
          name: item.name || `Server (${cleanIp})`,
          bmcIp: cleanIp,
          bmcUsername: item.bmcUsername || item.username || "admin",
          bmcPassword: item.bmcPassword || item.password || "",
          osIp: item.osIp !== undefined ? item.osIp : cleanIp,
          osUsername: item.osUsername !== undefined ? item.osUsername : "root",
          osPassword: item.osPassword !== undefined ? item.osPassword : "",
          osSshPort: item.osSshPort ? parseInt(item.osSshPort) || 22 : 22,
          weight: item.weight || item.weightKg || "22.8 kg",
          weightKg: item.weightKg || item.weight || "22.8 kg",
          size: item.size || item.sizeU || "2U",
          sizeU: item.sizeU || item.size || "2U",
          deratedPowerW: item.deratedPowerW || item.powerW || 750,
          powerW: item.powerW || item.deratedPowerW || 750,
          isCustom: true,
          rack: item.rack || "Rack 1"
        };
      });

      const deletedKeys = (() => {
        try {
          const raw = localStorage.getItem("tyrone_deleted_keys");
          return raw ? new Set<string>(JSON.parse(raw)) : new Set<string>();
        } catch { return new Set<string>(); }
      })();

      const isServerDeleted = (s: any) => {
        const k1 = String(s.id || "").toLowerCase();
        const k2 = String(s.bmcIp || s.ip || "").toLowerCase();
        const k3 = String(s.name || "").toLowerCase();
        return (k1 && deletedKeys.has(k1)) || (k2 && deletedKeys.has(k2)) || (k3 && deletedKeys.has(k3));
      };

      const merged: ServerProfile[] = [];
      envServers.forEach(env => {
        if (!isServerDeleted(env) && env.bmcIp && env.bmcIp.toLowerCase() !== "demo" && env.bmcIp.toLowerCase() !== "demo-server.local" && env.bmcIp !== "DEMO_MODE") {
          const customOverride = mappedFleet.find(f => f.id === env.id || f.bmcIp === env.bmcIp);
          if (customOverride && !isServerDeleted(customOverride)) {
            merged.push({
              ...customOverride,
              isCustom: true
            });
          } else if (!customOverride) {
            merged.push(env);
          }
        }
      });
      mappedFleet.forEach(f => {
        if (!isServerDeleted(f) && !f.id.startsWith("srv-env-") && f.bmcIp && f.bmcIp.toLowerCase() !== "demo" && f.bmcIp.toLowerCase() !== "demo-server.local" && f.bmcIp !== "DEMO_MODE") {
          if (!merged.some(m => m.id === f.id || m.bmcIp === f.bmcIp)) {
            merged.push(f);
          }
        }
      });

      const finalServers = merged;
      setServers(finalServers);

      const statuses: Record<string, any> = {};
      finalServers.forEach(s => {
        statuses[s.id] = { status: "OK", model: "Tyrone RH21XM", manufacturer: "Supermicro", temperature: 22.0 };
      });
      setServerStatuses(statuses);

      if (finalServers.length > 0) {
        const savedActive = localStorage.getItem("tyrone_active_server_id");
        const found = finalServers.find((s: ServerProfile) => s.id === savedActive);
        if (found) {
          setActiveServerId(found.id);
        } else {
          setActiveServerId(finalServers[0].id);
        }
      }
    } catch (err: any) {
      console.error("Error fetching servers:", err);
      setServers(defaultServers);
      const statuses: Record<string, any> = {};
      defaultServers.forEach(s => {
        statuses[s.id] = { status: "OK", model: "Tyrone RH21XM", manufacturer: "Supermicro", temperature: 22.0 };
      });
      setServerStatuses(statuses);
      setActiveServerId(defaultServers[0].id);
    } finally {
      setLoading(false);
    }
  };

  const fetchAlerts = async (limit = 10) => {
    try {
      const response = await fetch(`/api/local/logs?limit=${limit}`);
      if (response.ok) {
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const data = await response.json();
          const unique = data.filter((item: HardwareLog, index: number, self: HardwareLog[]) =>
            self.findIndex((t) => t.message === item.message && t.server === item.server && t.timestamp === item.timestamp) === index
          );
          setAlerts(unique.slice(0, limit));
        }
      }
    } catch (err) {
      console.error("Error pulling hardware event logs:", err);
    }
  };

  const runHardwareScan = async (showLoadingFeedback = false) => {
    if (isScanning || servers.length === 0) return;
    setIsScanning(true);
    try {
      const updatedStatuses: Record<string, any> = { ...serverStatuses };

      await Promise.all(
        servers.map(async (server) => {
          if (!server.bmcIp || server.id.includes("placeholder") || server.bmcIp.includes("192.168.10.12")) {
            return;
          }
          try {
            const svc = new RedfishService({
              url: server.bmcIp,
              username: server.bmcUsername || "admin",
              password: server.bmcPassword || "netweb@123"
            });

            const sysId = await svc.resolveSystemId().catch(() => null);
            if (sysId) {
              const details = await svc.getSystemDetails(sysId).catch(() => null);
              const powerRes = await svc.getPowerTelemetry("1").catch(() => null);
              const thermalRes = await svc.getThermal("1").catch(() => null);

              let powerConsumedWatts: number | undefined = undefined;
              if (powerRes?.PowerControl?.[0]?.PowerConsumedWatts) {
                powerConsumedWatts = Number(powerRes.PowerControl[0].PowerConsumedWatts);
              }

              let fetchedTemp: number | undefined = undefined;
              if (thermalRes?.Temperatures && Array.isArray(thermalRes.Temperatures) && thermalRes.Temperatures.length > 0) {
                const temps = thermalRes.Temperatures.map((t: any) => t.ReadingCelsius || 0).filter((t: number) => t > 0);
                if (temps.length > 0) {
                  fetchedTemp = Math.max(...temps);
                }
              }

              if (details) {
                updatedStatuses[server.id] = {
                  status: details.Status?.Health === "Critical" ? "Critical" : (details.Status?.Health === "Warning" ? "Warning" : "OK"),
                  model: details.Model || server.model || "N/A",
                  manufacturer: details.Manufacturer || "N/A",
                  serialNumber: details.SerialNumber || server.serialNumber || "N/A",
                  powerState: details.PowerState || "On",
                  biosVersion: details.BiosVersion || details.FirmwareVersion || "N/A",
                  health: details.Status?.Health || "OK",
                  powerConsumedWatts: powerConsumedWatts ?? 0,
                  temperature: fetchedTemp ?? 0
                };
              }
            }

            await svc.trackHardwareLinkStates().catch(() => { });
          } catch (e) {
            console.warn(`Continuous Redfish fleet tracker error for ${server.name} (${server.bmcIp}):`, e);
          }
        })
      );

      setServerStatuses(updatedStatuses);
    } catch (err) {
      console.error("Centralized fleet scan execution exception:", err);
    } finally {
      setIsScanning(false);
      setLastScanTime(new Date().toLocaleTimeString());
      fetchAlerts();
    }
  };

  const clearAlertHistory = async () => {
    if (!window.confirm("Are you sure you want to clear the local hardware event logfile?")) {
      return;
    }
    try {
      const response = await fetch("/api/local/clear-logs", { method: "POST" });
      if (response.ok) {
        setAlerts([]);
        fetchAlerts();
      }
    } catch (err) {
      console.error("Failed to empty logs archive:", err);
    }
  };

  useEffect(() => {
    fetchServers();

    const handleFleetUpdate = () => {
      fetchServers();
    };
    window.addEventListener("fleet-updated", handleFleetUpdate);

    const handleHardwareEvent = (e: any) => {
      const newLog = e.detail;
      setAlerts((prev) => {
        const exists = prev.some((item) =>
          item.message === newLog.message &&
          item.server === newLog.server &&
          item.timestamp === newLog.timestamp
        );
        if (exists) return prev;
        return [newLog, ...prev].slice(0, 50);
      });
    };
    window.addEventListener("hardware-event", handleHardwareEvent);

    return () => {
      window.removeEventListener("fleet-updated", handleFleetUpdate);
      window.removeEventListener("hardware-event", handleHardwareEvent);
    };
  }, []);

  useEffect(() => {
    if (servers.length > 0) {
      fetchAlerts();
      runHardwareScan(false);

      const scanTimer = setInterval(() => {
        runHardwareScan(false);
      }, 15000);

      const logsTimer = setInterval(() => {
        fetchAlerts();
      }, 10000);

      return () => {
        clearInterval(scanTimer);
        clearInterval(logsTimer);
      };
    }
  }, [servers]);

  useEffect(() => {
    if (activeServerId) {
      localStorage.setItem("tyrone_active_server_id", activeServerId);
    }
  }, [activeServerId]);

  const handleSelectServer = (id: string) => {
    setActiveServerId(id);
    setActiveTab("hierarchy");
  };

  const handleAddNodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nodeName.trim() || !nodeBmcIp.trim()) {
      alert("Name and BMC IP are required fields.");
      return;
    }

    setIsSubmittingNode(true);
    setNodeFormError(null);
    try {
      await validateBmc(nodeBmcIp, nodeBmcUsername, nodeBmcPassword);

      const newNode = {
        id: `fleet-${Date.now()}-${nodeBmcIp.replace(/[^a-zA-Z0-9]/g, "-")}`,
        name: nodeName.trim(),
        bmcIp: nodeBmcIp.trim(),
        bmcUsername: nodeBmcUsername.trim() || "admin",
        bmcPassword: nodeBmcPassword.trim(),
        osIp: nodeOsIp.trim(),
        osUsername: nodeOsIp.trim() ? nodeOsUsername.trim() : "",
        osPassword: nodeOsIp.trim() ? nodeOsPassword.trim() : "",
        osSshPort: nodeOsIp.trim() ? nodeOsSshPort || 22 : 22,
        isCustom: true,
        rack: "Rack 1"
      };

      let fleet: any[] = [];
      try {
        const res = await fetch("/api/local/fleet");
        if (res.ok) {
          const content = await res.json();
          if (Array.isArray(content)) {
            fleet = content;
          }
        }
      } catch (_) { }

      if (fleet.length === 0) {
        const saved = localStorage.getItem("tyrone_fleet");
        if (saved) {
          try { fleet = JSON.parse(saved); } catch (_) { }
        }
      }

      setServers(prev => [...prev.filter(s => s.id !== newNode.id), newNode]);
      setActiveServerId(newNode.id);

      window.dispatchEvent(new CustomEvent("fleet-updated", { detail: { newDevice: newNode } }));
      window.dispatchEvent(new CustomEvent("hierarchy-updated"));

      setNodeName("");
      setNodeBmcIp("");
      setNodeBmcUsername("admin");
      setNodeBmcPassword("netweb@123");
      setNodeOsIp("");
      setNodeOsUsername("root");
      setNodeOsPassword("root");
      setNodeOsSshPort(22);

      setShowAddNodeModal(false);
      fetchServers();
    } catch (err: any) {
      console.error("Error saving new node:", err);
      if (err.message === "Incorrect credentials") {
        setNodeFormError("Incorrect credentials");
      } else {
        setNodeFormError(err.message || "An error occurred while creating node.");
      }
    } finally {
      setIsSubmittingNode(false);
    }
  };

  const handleStartEditNode = (server: ServerProfile, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setEditNodeId(server.id);
    setEditNodeName(server.name);
    setEditNodeBmcIp(server.bmcIp);
    setEditNodeBmcUsername(server.bmcUsername || "admin");
    setEditNodeBmcPassword(server.bmcPassword || "");
    setEditNodeOsIp(server.osIp || "");
    setEditNodeOsUsername(server.osUsername || "");
    setEditNodeOsPassword(server.osPassword || "");
    setEditNodeOsSshPort(server.osSshPort || 22);
    setEditNodeWeight(server.weight || "22.8 kg");
    setEditNodeSize(server.size || "2U");
    setEditNodeDeratedPowerW(String(server.deratedPowerW || "750"));
    setEditNodeRack(server.rack || "Rack 1");
    setShowEditNodeModal(true);
  };

  const handleEditNodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editNodeName.trim() || !editNodeBmcIp.trim()) {
      alert("Name and BMC IP are required fields.");
      return;
    }

    setIsSubmittingNode(true);
    setEditNodeFormError(null);
    try {
      await validateBmcCredentials(editNodeBmcIp, editNodeBmcUsername, editNodeBmcPassword);

      let fleet: any[] = [];
      try {
        const res = await fetch("/api/local/fleet");
        if (res.ok) {
          const content = await res.json();
          if (Array.isArray(content)) {
            fleet = content;
          }
        }
      } catch (_) { }

      if (fleet.length === 0) {
        const saved = localStorage.getItem("tyrone_fleet");
        if (saved) {
          try { fleet = JSON.parse(saved); } catch (_) { }
        }
      }

      const editedNode: ServerProfile = {
        id: editNodeId,
        name: editNodeName.trim(),
        bmcIp: editNodeBmcIp.trim(),
        bmcUsername: editNodeBmcUsername.trim() || "admin",
        bmcPassword: editNodeBmcPassword.trim(),
        osIp: editNodeOsIp.trim(),
        osUsername: editNodeOsIp.trim() ? editNodeOsUsername.trim() : "",
        osPassword: editNodeOsIp.trim() ? editNodeOsPassword.trim() : "",
        osSshPort: editNodeOsIp.trim() ? editNodeOsSshPort || 22 : 22,
        weight: editNodeWeight.trim() || "22.8 kg",
        weightKg: editNodeWeight.trim() || "22.8 kg",
        size: editNodeSize.trim() || "2U",
        sizeU: editNodeSize.trim() || "2U",
        deratedPowerW: editNodeDeratedPowerW.trim() || "750",
        powerW: editNodeDeratedPowerW.trim() || "750",
        rack: editNodeRack || "Rack 1",
        isCustom: true
      };

      const exists = fleet.some((item: any) => item.id === editNodeId);
      let updated;
      if (exists) {
        updated = fleet.map((item: any) => item.id === editNodeId ? editedNode : item);
      } else {
        updated = [...fleet, editedNode];
      }

      localStorage.setItem("tyrone_fleet", JSON.stringify(updated));

      try {
        const savedRacks = localStorage.getItem("tyrone_server_racks");
        const racksObj = savedRacks ? JSON.parse(savedRacks) : {};
        racksObj[editedNode.id] = editNodeRack || "Rack 1";
        localStorage.setItem("tyrone_server_racks", JSON.stringify(racksObj));
      } catch (_) {}

      await fetch("/api/local/fleet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updated)
      });

      setServers(prev => prev.map(s => s.id === editNodeId ? editedNode : s));
      window.dispatchEvent(new CustomEvent("fleet-updated", { detail: { updatedDevice: editedNode } }));
      window.dispatchEvent(new CustomEvent("hierarchy-updated"));

      setShowEditNodeModal(false);
      fetchServers();
    } catch (err: any) {
      console.error("Error saving edited node:", err);
      setEditNodeFormError(err.message || "Authentication Failed: Incorrect BMC Username or Password.");
    } finally {
      setIsSubmittingNode(false);
    }
  };

  const handleDeleteNode = async (id: string, name?: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const target = servers.find(s => s.id === id);

    // 1. Add to tyrone_deleted_keys
    try {
      const raw = localStorage.getItem("tyrone_deleted_keys");
      const delSet = raw ? new Set<string>(JSON.parse(raw)) : new Set<string>();
      if (id) delSet.add(String(id).toLowerCase());
      if (target?.bmcIp) delSet.add(String(target.bmcIp).toLowerCase());
      if (target?.name) delSet.add(String(target.name).toLowerCase());
      localStorage.setItem("tyrone_deleted_keys", JSON.stringify(Array.from(delSet)));
    } catch (_) { }

    // 2. Update tyrone_fleet
    try {
      let fleet: any[] = [];
      const saved = localStorage.getItem("tyrone_fleet");
      if (saved) {
        try { fleet = JSON.parse(saved); } catch (_) { }
      }
      const updated = fleet.filter((item: any) =>
        item.id !== id &&
        String(item.bmcIp || "").toLowerCase() !== String(target?.bmcIp || "").toLowerCase() &&
        String(item.name || "").toLowerCase() !== String(target?.name || "").toLowerCase()
      );

      localStorage.setItem("tyrone_fleet", JSON.stringify(updated));
      await fetch("/api/local/fleet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updated)
      }).catch(() => null);
    } catch (err) {
      console.error("Error deleting node:", err);
    }

    // 3. Update serverRacks
    try {
      const savedRacks = localStorage.getItem("tyrone_server_racks");
      if (savedRacks) {
        const sRacks = JSON.parse(savedRacks);
        delete sRacks[id];
        localStorage.setItem("tyrone_server_racks", JSON.stringify(sRacks));
      }
    } catch (_) { }

    setServers(prev => prev.filter(s => s.id !== id));
    window.dispatchEvent(new CustomEvent("fleet-updated"));
    window.dispatchEvent(new CustomEvent("hierarchy-updated"));
    fetchServers();
  };

  const handleDeleteNodes = async (ids: string[]) => {
    if (ids.length === 0) return;
    const targets = servers.filter(s => ids.includes(s.id));
    const idSet = new Set(ids);

    // 1. Add to tyrone_deleted_keys
    try {
      const raw = localStorage.getItem("tyrone_deleted_keys");
      const delSet = raw ? new Set<string>(JSON.parse(raw)) : new Set<string>();
      targets.forEach(s => {
        if (s.id) delSet.add(String(s.id).toLowerCase());
        if (s.bmcIp) delSet.add(String(s.bmcIp).toLowerCase());
        if (s.name) delSet.add(String(s.name).toLowerCase());
      });
      ids.forEach(id => delSet.add(String(id).toLowerCase()));
      localStorage.setItem("tyrone_deleted_keys", JSON.stringify(Array.from(delSet)));
    } catch (_) { }

    // 2. Update tyrone_fleet
    try {
      let fleet: any[] = [];
      const saved = localStorage.getItem("tyrone_fleet");
      if (saved) {
        try { fleet = JSON.parse(saved); } catch (_) { }
      }
      const bmcIpSet = new Set(targets.map(s => String(s.bmcIp || "").toLowerCase()));
      const nameSet = new Set(targets.map(s => String(s.name || "").toLowerCase()));
      const updated = fleet.filter((item: any) =>
        !idSet.has(item.id) &&
        !bmcIpSet.has(String(item.bmcIp || "").toLowerCase()) &&
        !nameSet.has(String(item.name || "").toLowerCase())
      );

      localStorage.setItem("tyrone_fleet", JSON.stringify(updated));
      await fetch("/api/local/fleet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updated)
      }).catch(() => null);
    } catch (err) {
      console.error("Error deleting nodes:", err);
    }

    // 3. Update serverRacks
    try {
      const savedRacks = localStorage.getItem("tyrone_server_racks");
      if (savedRacks) {
        const sRacks = JSON.parse(savedRacks);
        ids.forEach(id => delete sRacks[id]);
        localStorage.setItem("tyrone_server_racks", JSON.stringify(sRacks));
      }
    } catch (_) { }

    setServers(prev => prev.filter(s => !idSet.has(s.id)));
    window.dispatchEvent(new CustomEvent("fleet-updated"));
    window.dispatchEvent(new CustomEvent("hierarchy-updated"));
    fetchServers();
  };

  const activeServer = servers.find(s => s.id === activeServerId) || servers[0] || null;
  const service = activeServer ? new RedfishService({
    url: activeServer.bmcIp,
    username: activeServer.bmcUsername,
    password: activeServer.bmcPassword || ""
  }) : null;

  const handleUpdateActiveServerCredentials = async (username: string, password?: string) => {
    if (!activeServer) return;

    setServers(prev => prev.map(s => {
      if (s.id === activeServer.id) {
        return {
          ...s,
          bmcUsername: username,
          bmcPassword: password !== undefined ? password : s.bmcPassword
        };
      }
      return s;
    }));

    try {
      let fleet: any[] = [];
      try {
        const res = await fetch("/api/local/fleet");
        if (res.ok) {
          const content = await res.json();
          if (Array.isArray(content)) {
            fleet = content;
          }
        }
      } catch (_) { }

      if (fleet.length === 0) {
        const saved = localStorage.getItem("tyrone_fleet");
        if (saved) {
          try { fleet = JSON.parse(saved); } catch (_) { }
        }
      }

      let foundMatching = false;
      const updatedFleet = fleet.map((item: any) => {
        if (item.id === activeServer.id || item.ip === activeServer.bmcIp) {
          foundMatching = true;
          return {
            ...item,
            username: username,
            password: password !== undefined ? password : item.password
          };
        }
        return item;
      });

      if (foundMatching) {
        localStorage.setItem("tyrone_fleet", JSON.stringify(updatedFleet));
        await fetch("/api/local/fleet", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updatedFleet)
        });
      }
    } catch (e) {
      console.error("Error persisting updated credentials:", e);
    }
  };

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const user = loginUsername.trim();
    const pass = loginPassword.trim();

    if (!user || !pass) {
      setLoginError("Username and password are required.");
      return;
    }

    // Authenticate credentials against persistent user accounts in localStorage
    const savedUsersJson = localStorage.getItem("tyrone_console_users");
    let consoleUsers: Array<{ username: string; password?: string }> = [];
    if (savedUsersJson) {
      try { consoleUsers = JSON.parse(savedUsersJson); } catch (_) { }
    }

    const matchedUser = consoleUsers.find(
      u => u.username.toLowerCase() === user.toLowerCase()
    );

    let isAuthenticated = false;
    if (matchedUser) {
      const storedPass = matchedUser.password || "admin";
      isAuthenticated = pass === storedPass ||
        (matchedUser.username.toLowerCase() === "admin" && (pass === "admin" || pass === "password"));
    } else {
      // Fallback for system defaults
      isAuthenticated = (
        (user.toLowerCase() === "admin" && (pass === "admin" || pass === "password")) ||
        (user.toLowerCase() === "root" && (pass === "root" || pass === "tyrone"))
      );
    }

    if (isAuthenticated) {
      setLoginError(null);
      setLoginUsername(user);
      try {
        localStorage.setItem("tyrone_authenticated", "true");
        localStorage.setItem("tyrone_user", user);
      } catch (_) { }
      setIsLoggedIn(true);
    } else {
      setLoginError("Authentication failed: Invalid username or password.");
    }
  };

  const handleLogout = () => {
    try {
      localStorage.removeItem("tyrone_authenticated");
    } catch (_) { }
    setIsLoggedIn(false);
  };

  const sidebarTabs = [
    { id: "dashboard", label: "Dashboard", icon: LayoutGrid },
    { id: "hierarchy", label: "Hierarchy", icon: Network },
    { id: "global_inventory", label: "Devices", icon: Smartphone },
    { id: "sustainability", label: "Sustainability", icon: Zap },
    { id: "reliability", label: "Reliability", icon: Activity },
    { id: "events", label: "Events", icon: ClipboardList },
    { id: "gpu", label: "GPUs", icon: Cpu },
    { id: "aiops", label: "AI Ops", icon: Bot },
    { id: "reports", label: "Reports", icon: FileBarChart },
    { id: "settings", label: "Settings", icon: Settings }
  ];

  if (!isLoggedIn) {
    return (
      <div 
        className="min-h-screen flex items-center justify-center p-4 font-sans relative bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url('/login-bg.png')` }}
      >
        {/* Ambient Dark Overlay (No Blur) */}
        <div className="absolute inset-0 bg-black/40"></div>

        <div className="relative z-10 bg-white/95 text-slate-800 rounded-xl shadow-2xl border-2 border-[#7a0c0c] max-w-md w-full p-8 space-y-6">
          <div className="text-center flex flex-col items-center justify-center -mt-2">
            <img src="/tyrone-logo.png" alt="Tyrone Logo" className="h-28 max-w-[260px] object-contain mx-auto -mb-2 scale-110" />
            <p className="text-[11px] text-slate-500 font-semibold uppercase tracking-wider">Data Center Manager Gateway Login</p>
          </div>

          <form onSubmit={handleLoginSubmit} className="space-y-4 font-sans text-xs">
            {loginError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-xs font-bold">
                {loginError}
              </div>
            )}

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block">Username</label>
              <div className="flex items-center bg-slate-50 border border-slate-300 rounded-lg overflow-hidden focus-within:border-[#7a0c0c] focus-within:ring-1 focus-within:ring-[#7a0c0c]">
                <div className="px-3 text-slate-400 bg-slate-100/70 border-r border-slate-200 py-2.5 flex items-center justify-center shrink-0">
                  <User className="w-4 h-4 text-slate-500" />
                </div>
                <input
                  type="text"
                  value={loginUsername}
                  onChange={(e) => setLoginUsername(e.target.value)}
                  placeholder="Enter Username"
                  className="w-full px-3 py-2.5 bg-transparent text-xs font-medium text-slate-800 focus:outline-none"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block">Password</label>
              <div className="flex items-center bg-slate-50 border border-slate-300 rounded-lg overflow-hidden focus-within:border-[#7a0c0c] focus-within:ring-1 focus-within:ring-[#7a0c0c] relative">
                <div className="px-3 text-slate-400 bg-slate-100/70 border-r border-slate-200 py-2.5 flex items-center justify-center shrink-0">
                  <Lock className="w-4 h-4 text-slate-500" />
                </div>
                <input
                  type={showLoginPassword ? "text" : "password"}
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3 py-2.5 pr-10 bg-transparent text-xs font-medium text-slate-800 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowLoginPassword(!showLoginPassword)}
                  className="absolute right-3 text-slate-400 hover:text-slate-700 cursor-pointer focus:outline-none"
                  title={showLoginPassword ? "Hide password" : "Show password"}
                >
                  {showLoginPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-2.5 bg-[#7a0c0c] hover:bg-[#590808] text-white font-extrabold uppercase text-xs rounded-lg tracking-wider transition-colors shadow-md cursor-pointer mt-2"
            >
              Sign In to Console
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#dce1e7] text-slate-800 flex flex-col font-sans relative">
      {/* Top Red Header Bar - Tyrone Data Center Manager Console */}
      <header className="relative bg-[#680505] text-white py-3 px-4 md:px-6 border-b border-[#4d0000] sticky top-0 z-50 flex items-center justify-between shadow-md select-none">
        {/* Subtle datacenter rack background overlay */}
        <div
          className="absolute inset-0 bg-cover bg-center opacity-20 mix-blend-overlay pointer-events-none overflow-hidden"
          style={{ backgroundImage: `url('/login-bg.png')` }}
        />

        <div className="relative z-10 flex items-center gap-4 md:gap-6">
          <img 
            src="/tyrone-logo.png" 
            alt="Tyrone Logo" 
            className="h-12 md:h-16 max-w-[260px] object-contain shrink-0 filter brightness-0 invert" 
          />
          <span className="text-lg sm:text-xl md:text-2xl font-extrabold text-white tracking-wide leading-none">Data Center Manager Console</span>
        </div>

        <div className="relative z-10 flex items-center gap-4 text-xs font-sans">
          {/* Rounded White Pill Search Box */}
          <div className="relative flex items-center">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-3 py-1 bg-white text-slate-800 rounded-full text-xs w-44 sm:w-64 border-0 focus:outline-none focus:ring-2 focus:ring-red-400/50 shadow-inner font-medium"
            />
          </div>

          <div className="flex items-center gap-2 text-white text-xs font-normal">
            {/* Error Alert System Quick Header Access Button */}
            <button
              onClick={() => setShowErrorAlertsModal(true)}
              className="px-2.5 py-1 bg-red-950/80 hover:bg-red-900 text-white rounded-md text-xs font-bold cursor-pointer flex items-center gap-1.5 transition-all border border-red-500/50 shadow-xs"
              title="Open Error Alert System"
            >
              <Bell className="w-3.5 h-3.5 text-red-300 animate-pulse" />
              <span>Alerts ({alerts.length})</span>
            </button>
            <span className="text-white/50">|</span>

            <div className="flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-white/90" />
              <span className="font-medium text-white">{loginUsername || "admin"}</span>
            </div>
            <span className="text-white/50">|</span>
            <button
              onClick={handleLogout}
              className="hover:text-white/80 cursor-pointer hover:underline font-normal text-white"
            >
              Logout
            </button>
            <span className="text-white/50">|</span>
            {/* Help Dropdown Menu */}
            <div className="relative">
              <button
                onClick={() => setIsHelpDropdownOpen(!isHelpDropdownOpen)}
                className="hover:text-white/80 cursor-pointer flex items-center gap-1 font-normal text-white focus:outline-none"
              >
                <span>Help</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isHelpDropdownOpen ? "rotate-180" : ""}`} />
              </button>

              {isHelpDropdownOpen && (
                <>
                  {/* Invisible backdrop to dismiss dropdown */}
                  <div
                    className="fixed inset-0 z-[55]"
                    onClick={() => setIsHelpDropdownOpen(false)}
                  />
                  <div className="absolute right-0 mt-2 w-44 bg-white rounded-md shadow-2xl border border-slate-200 py-1.5 z-[60] text-slate-800 animate-fade-in text-xs font-normal">
                    <button
                      onClick={() => {
                        setIsHelpDropdownOpen(false);
                        setIsUserGuideModalOpen(true);
                      }}
                      className="w-full text-left px-4 py-2 hover:bg-slate-100 hover:text-slate-900 transition-colors flex items-center justify-between cursor-pointer"
                    >
                      User Guide
                    </button>
                    <button
                      onClick={() => {
                        setIsHelpDropdownOpen(false);
                        setIsReleaseNotesModalOpen(true);
                      }}
                      className="w-full text-left px-4 py-2 hover:bg-slate-100 hover:text-slate-900 transition-colors flex items-center justify-between cursor-pointer"
                    >
                      Release Notes
                    </button>
                    <div className="border-t border-slate-200 my-1"></div>
                    <button
                      onClick={() => {
                        setIsHelpDropdownOpen(false);
                        setIsAboutModalOpen(true);
                      }}
                      className="w-full text-left px-4 py-2 hover:bg-slate-100 hover:text-slate-900 transition-colors flex items-center justify-between cursor-pointer font-medium"
                    >
                      About
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Container Layout with Left Navigation Sidebar */}
      <div className="flex-1 flex min-h-0 relative overflow-hidden">
        {/* Left Sidebar Menu Panel - Tyrone Red Theme */}
        <aside className="w-48 sm:w-52 bg-[#680505] text-white flex flex-col shrink-0 border-r border-[#4d0000] font-semibold select-none z-20 overflow-y-auto max-h-[calc(100vh-38px)]">
          <div className="py-1.5 space-y-0.5">
            {sidebarTabs.map((t) => {
              const Icon = t.icon;
              const isActive = activeTab === t.id || (t.id === "global_inventory" && activeTab === "inventory_details");
              return (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id as any)}
                  className={`w-full px-4 py-2.5 text-left flex items-center justify-between cursor-pointer transition-colors ${isActive
                      ? "bg-[#e3e7eb] text-[#680505] font-bold shadow-xs"
                      : "text-white hover:bg-[#520000]"
                    }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className={`w-4.5 h-4.5 shrink-0 ${isActive ? "text-[#680505]" : "text-white"}`} />
                    <span className="text-sm font-bold tracking-tight">{t.label}</span>
                  </div>
                  <ChevronsRight className={`w-4 h-4 shrink-0 ${isActive ? "text-[#680505]" : "text-white/80"}`} />
                </button>
              );
            })}
          </div>
        </aside>

        {/* Right Main Workplace Area - Scrollable */}
        <main className="flex-1 overflow-y-auto max-h-[calc(100vh-40px)] p-2 sm:p-3 bg-[#dce1e7] flex flex-col justify-start min-h-0">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-24 space-y-4">
              <RefreshCw className="w-8 h-8 text-[#7a0c0c] animate-spin" />
              <p className="text-xs font-black uppercase tracking-wider text-slate-600 font-mono">
                Querying Fleet Environment Configuration...
              </p>
            </div>
          ) : error ? (
            <div className="bg-rose-50 border border-rose-200 rounded p-6 text-center max-w-lg mx-auto my-12 space-y-4 shadow-sm">
              <Info className="w-10 h-10 text-rose-600 mx-auto" />
              <div className="space-y-1">
                <h4 className="text-xs font-black text-rose-950 uppercase tracking-wider font-mono">Gateway Communication Failed</h4>
                <p className="text-[11px] text-rose-700 leading-relaxed font-bold">{error}</p>
              </div>
              <button
                onClick={fetchServers}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded font-black uppercase text-[10px] tracking-wider transition-colors cursor-pointer font-mono"
              >
                Retry Connection
              </button>
            </div>
          ) : (
            <AnimatePresence mode="wait">
              {activeTab === "dashboard" && (
                <motion.div key="tab-dashboard" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full">
                  <Dashboard
                    servers={servers}
                    serverStatuses={serverStatuses}
                    alerts={alerts}
                    onSelectServer={handleSelectServer}
                  />
                </motion.div>
              )}

              {activeTab === "hierarchy" && (
                <motion.div key="tab-hierarchy" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full">
                  <HierarchyView
                    servers={servers}
                    serverStatuses={serverStatuses}
                    onSelectServer={handleSelectServer}
                    onOpenInventoryDetails={(id) => {
                      if (id) setActiveServerId(id);
                      setActiveTab("inventory_details");
                    }}
                    selectedServerId={activeServerId}
                    alerts={alerts}
                    onEditServer={(server) => handleStartEditNode(server)}
                  />
                </motion.div>
              )}

              {activeTab === "global_inventory" && (
                <motion.div key="tab-global_inventory" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full">
                  <GlobalInventory
                    servers={servers}
                    serverStatuses={serverStatuses}
                    onSelectServer={handleSelectServer}
                    onAddServer={() => setShowAddNodeModal(true)}
                    onEditServer={(server) => handleStartEditNode(server)}
                    onDeleteServer={(id) => handleDeleteNode(id)}
                    onDeleteServers={(ids) => handleDeleteNodes(ids)}
                  />
                </motion.div>
              )}

              {activeTab === "events" && (
                <motion.div key="tab-events" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full">
                  <EventsView
                    alerts={alerts}
                    onClearAlerts={clearAlertHistory}
                    onScan={() => runHardwareScan(true)}
                    isScanning={isScanning}
                    lastScanTime={lastScanTime}
                    onSelectServer={handleSelectServer}
                    servers={servers}
                  />
                </motion.div>
              )}

              {activeTab === "aiops" && (
                <motion.div key="tab-aiops" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full">
                  <AIOpsView servers={servers} alerts={alerts} />
                </motion.div>
              )}

              {activeTab === "reliability" && (
                <motion.div key="tab-reliability" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full">
                  <ReliabilityView servers={servers} serverStatuses={serverStatuses} onSelectServer={handleSelectServer} />
                </motion.div>
              )}

              {activeTab === "sustainability" && (
                <motion.div key="tab-sustainability" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full">
                  <SustainabilityView servers={servers} alerts={alerts} serverStatuses={serverStatuses} />
                </motion.div>
              )}

              {activeTab === "gpu" && (
                <motion.div key="tab-gpu" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full">
                  <GpuView servers={servers} />
                </motion.div>
              )}

              {activeTab === "reports" && (
                <motion.div key="tab-reports" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full">
                  <ReportsView servers={servers} alerts={alerts} />
                </motion.div>
              )}

              {activeTab === "settings" && (
                <motion.div key="tab-settings" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full">
                  <SettingsView
                    activeUsername={loginUsername || localStorage.getItem("tyrone_user") || "admin"}
                    onUpdateUsername={(newName) => {
                      setLoginUsername(newName);
                      try {
                        localStorage.setItem("tyrone_user", newName);
                      } catch (_) { }
                    }}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </main>
      </div>

      {/* Floating AI Chatbot overlay */}
      {showChatbot && (
        <div className="fixed bottom-4 right-4 z-50 w-96 max-w-full shadow-2xl">
          <DashboardChatbot servers={servers} alerts={alerts} onClose={() => setShowChatbot(false)} />
        </div>
      )}

      {/* Error Alert System Management Modal */}
      {showErrorAlertsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs select-none">
          <div className="bg-white border border-slate-300 rounded shadow-2xl max-w-3xl w-full overflow-hidden text-slate-800 text-xs flex flex-col max-h-[85vh]">
            
            {/* Header */}
            <div className="bg-[#7a0c0c] text-white px-5 py-3 flex items-center justify-between font-sans shrink-0">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-red-300 animate-pulse" />
                <span className="font-bold text-sm tracking-wide">Enterprise Error Alert System</span>
              </div>
              <button type="button" onClick={() => setShowErrorAlertsModal(false)} className="text-white/80 hover:text-white cursor-pointer p-0.5">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 font-sans overflow-y-auto flex-1 space-y-4">
              <div className="flex items-center justify-between bg-slate-50 p-3 border border-slate-200 rounded">
                <div className="space-y-0.5">
                  <span className="text-slate-800 font-bold text-xs">Active Real-Time Hardware & Redfish Error Stream</span>
                  <p className="text-slate-500 text-[11px]">System hardware faults, thermal warnings, and connection state logs across monitored servers.</p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      const newAlert: HardwareLog = {
                        id: `err-alert-${Date.now()}`,
                        type: "Thermal",
                        message: "CRITICAL: High Temperature alert (>85°C) triggered on CPU Package 0. Emergency throttling active.",
                        severity: "Critical",
                        timestamp: new Date().toLocaleTimeString(),
                        server: servers[0]?.bmcIp || "172.16.11.4"
                      };
                      setAlerts(prev => [newAlert, ...prev]);
                    }}
                    className="px-3 py-1.5 bg-red-700 hover:bg-red-800 text-white font-bold rounded text-[11px] cursor-pointer shadow-xs flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Test Error Alert</span>
                  </button>

                  <button
                    onClick={clearAlertHistory}
                    className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded text-[11px] cursor-pointer flex items-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Clear Alerts</span>
                  </button>
                </div>
              </div>

              {alerts.length === 0 ? (
                <div className="bg-emerald-50 border border-emerald-200 rounded p-8 text-center space-y-2">
                  <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
                  <h4 className="text-xs font-bold text-emerald-900">No Active System Errors or Warnings</h4>
                  <p className="text-[11px] text-emerald-700">All monitored data center endpoints and hardware sensors are operating normally.</p>
                </div>
              ) : (
                <div className="border border-slate-200 rounded overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100 text-slate-700 font-bold uppercase tracking-wider text-[10px]">
                      <tr>
                        <th className="p-2.5 pl-3">Severity</th>
                        <th className="p-2.5">Category</th>
                        <th className="p-2.5">Endpoint Server</th>
                        <th className="p-2.5">Error Log Description</th>
                        <th className="p-2.5 pr-3 text-right">Time</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 font-mono text-[11px]">
                      {alerts.map((al) => (
                        <tr key={al.id} className="hover:bg-slate-50">
                          <td className="p-2.5 pl-3">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              al.severity === "Critical"
                                ? "bg-red-100 text-red-700 border border-red-200"
                                : al.severity === "Warning"
                                ? "bg-amber-100 text-amber-800 border border-amber-200"
                                : "bg-emerald-100 text-emerald-800 border border-emerald-200"
                            }`}>
                              {al.severity}
                            </span>
                          </td>
                          <td className="p-2.5 font-sans font-medium text-slate-800">{al.type}</td>
                          <td className="p-2.5 text-blue-600 font-bold">{al.server}</td>
                          <td className="p-2.5 font-sans text-slate-600">{al.message}</td>
                          <td className="p-2.5 pr-3 text-right text-slate-400 text-[10px]">{al.timestamp}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-3 px-5 bg-slate-100 flex items-center justify-between border-t border-slate-200 shrink-0">
              <span className="text-[11px] text-slate-500 font-mono">Total System Log Entries: {alerts.length}</span>
              <button
                type="button"
                onClick={() => setShowErrorAlertsModal(false)}
                className="px-5 py-1.5 bg-[#7a0c0c] hover:bg-[#590808] text-white font-bold rounded cursor-pointer text-xs"
              >
                Close
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Add Server Node Profile Modal (unified AddDeviceModal with rich Device Capacities) */}
      <AddDeviceModal
        isOpen={showAddNodeModal}
        onClose={() => setShowAddNodeModal(false)}
        onAddDevice={() => {
          fetchServers();
          setShowAddNodeModal(false);
        }}
      />

      {/* Edit Server Node Modal Overlay */}
      <AnimatePresence>
        {showEditNodeModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.6 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowEditNodeModal(false)}
              className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
            />

            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 15 }}
              transition={{ type: "spring", duration: 0.3 }}
              className="bg-white border-2 border-[#7a0c0c] text-slate-850 rounded-lg max-w-xl w-full p-6 font-sans shadow-2xl relative z-10 text-left"
            >
              <button
                onClick={() => setShowEditNodeModal(false)}
                className="absolute top-4 right-4 text-slate-400 hover:text-red-700 transition-colors cursor-pointer p-1 rounded hover:bg-red-50"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-3 border-b border-slate-200 pb-3 mb-4">
                <div className="p-2 bg-red-50 border border-red-200 rounded text-[#7a0c0c]">
                  <Pencil className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-xs font-bold tracking-wider uppercase text-[#7a0c0c] font-mono">
                    Edit Server Node Profile
                  </h3>
                  <p className="text-[10px] text-slate-500 font-medium tracking-wide mt-0.5">
                    Update BMC IP & target connection credentials
                  </p>
                </div>
              </div>

              <form onSubmit={handleEditNodeSubmit} className="space-y-4 text-slate-700 font-sans">
                {editNodeFormError && (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded text-rose-700 text-xs font-bold flex items-start gap-2">
                    <div className="mt-0.5 p-0.5 bg-rose-600 text-white rounded font-bold text-[10px] leading-none">!</div>
                    <div>{editNodeFormError}</div>
                  </div>
                )}

                <div className="space-y-1">
                  <label className="text-[9px] font-bold uppercase tracking-wider text-slate-600 block">
                    Server Node Identifier Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={editNodeName}
                    onChange={(e) => setEditNodeName(e.target.value)}
                    className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded font-mono text-xs text-slate-800 focus:outline-none focus:border-[#7a0c0c]"
                  />
                </div>

                <div className="space-y-3 pt-1 border-t border-slate-200">
                  <span className="text-[10px] font-bold uppercase text-[#7a0c0c] tracking-wider font-mono">
                    1. Out-Of-Band Controller (BMC Redfish API)
                  </span>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="space-y-1 sm:col-span-2">
                      <label className="text-[9px] font-bold uppercase tracking-wider text-slate-600 block">
                        BMC IP / Hostname *
                      </label>
                      <input
                        type="text"
                        required
                        value={editNodeBmcIp}
                        onChange={(e) => setEditNodeBmcIp(e.target.value)}
                        className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded font-mono text-xs text-slate-800 focus:outline-none focus:border-[#7a0c0c]"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-bold uppercase tracking-wider text-slate-600 block">
                        BMC User
                      </label>
                      <input
                        type="text"
                        value={editNodeBmcUsername}
                        onChange={(e) => setEditNodeBmcUsername(e.target.value)}
                        className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded font-mono text-xs text-slate-800 focus:outline-none focus:border-[#7a0c0c]"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] font-bold uppercase tracking-wider text-slate-600 block">
                      BMC Password
                    </label>
                    <div className="relative">
                      <input
                        type={showEditPassword ? "text" : "password"}
                        value={editNodeBmcPassword}
                        onChange={(e) => setEditNodeBmcPassword(e.target.value)}
                        className="w-full px-3 py-1.5 pr-10 bg-slate-50 border border-slate-300 rounded font-mono text-xs text-slate-800 focus:outline-none focus:border-[#7a0c0c]"
                      />
                      <button
                        type="button"
                        onClick={() => setShowEditPassword(!showEditPassword)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-800 cursor-pointer p-1"
                        title={showEditPassword ? "Hide password" : "Show password"}
                      >
                        {showEditPassword ? <EyeOff className="w-4 h-4 text-slate-600" /> : <Eye className="w-4 h-4 text-slate-600" />}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="space-y-3 pt-2 border-t border-slate-200">
                  <span className="text-[10px] font-bold uppercase text-[#7a0c0c] tracking-wider font-mono">
                    2. Physical & Power Attributes
                  </span>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
                    <div className="flex flex-col justify-between h-full space-y-1">
                      <label className="text-[9px] font-bold uppercase tracking-wider text-slate-600 block leading-tight">
                        Assigned Rack
                      </label>
                      <select
                        value={editNodeRack}
                        onChange={(e) => setEditNodeRack(e.target.value)}
                        className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded font-mono text-xs text-slate-800 focus:outline-none focus:border-[#7a0c0c]"
                      >
                        {["Rack 1", "Rack 2", "Rack 3", "Rack 4"].map(rk => (
                          <option key={rk} value={rk}>{rk}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex flex-col justify-between h-full space-y-1">
                      <label className="text-[9px] font-bold uppercase tracking-wider text-slate-600 block leading-tight">
                        Weight (kg)
                      </label>
                      <input
                        type="text"
                        value={editNodeWeight}
                        onChange={(e) => setEditNodeWeight(e.target.value)}
                        placeholder="22.8 kg"
                        className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded font-mono text-xs text-slate-800 focus:outline-none focus:border-[#7a0c0c]"
                      />
                    </div>
                    <div className="flex flex-col justify-between h-full space-y-1">
                      <label className="text-[9px] font-bold uppercase tracking-wider text-slate-600 block leading-tight">
                        Form Factor / Size
                      </label>
                      <input
                        type="text"
                        value={editNodeSize}
                        onChange={(e) => setEditNodeSize(e.target.value)}
                        placeholder="2U"
                        className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded font-mono text-xs text-slate-800 focus:outline-none focus:border-[#7a0c0c]"
                      />
                    </div>
                    <div className="flex flex-col justify-between h-full space-y-1">
                      <label className="text-[9px] font-bold uppercase tracking-wider text-slate-600 block leading-tight">
                        Power Capacity (W)
                      </label>
                      <input
                        type="text"
                        value={editNodeDeratedPowerW}
                        onChange={(e) => setEditNodeDeratedPowerW(e.target.value)}
                        placeholder="750"
                        className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded font-mono text-xs text-slate-800 focus:outline-none focus:border-[#7a0c0c]"
                      />
                    </div>
                  </div>
                </div>

                <div className="border-t border-slate-200 pt-3 mt-4 flex items-center justify-end gap-2 font-mono">
                  <button
                    type="button"
                    onClick={() => setShowEditNodeModal(false)}
                    className="px-4 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded font-bold uppercase text-xs transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingNode}
                    className="px-5 py-1.5 bg-[#7a0c0c] hover:bg-[#590808] text-white rounded font-bold uppercase text-xs transition-all disabled:opacity-50 cursor-pointer shadow-sm flex items-center gap-1.5"
                  >
                    {isSubmittingNode && <RefreshCw className="w-3 h-3 animate-spin text-white" />}
                    <span>{isSubmittingNode ? "Validating & Saving..." : "Update Server Node"}</span>
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Help Modals */}
      <AboutModal
        isOpen={isAboutModalOpen}
        onClose={() => setIsAboutModalOpen(false)}
        serverCount={servers.length}
      />
      <UserGuideModal
        isOpen={isUserGuideModalOpen}
        onClose={() => setIsUserGuideModalOpen(false)}
      />
      <ReleaseNotesModal
        isOpen={isReleaseNotesModalOpen}
        onClose={() => setIsReleaseNotesModalOpen(false)}
      />
    </div>
  );
}
