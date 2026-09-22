import React, { useState, useEffect } from "react";
import { X, Search, Info, Plus, Pencil, Eye, EyeOff } from "lucide-react";

// 1. Add Data Center Modal
export interface AddDataCenterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddDC: (dc: { name: string }) => void;
}

export function AddDataCenterModal({ isOpen, onClose, onAddDC }: AddDataCenterModalProps) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    onAddDC({ name: name.trim() });
    setName("");
    setError("");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs font-sans select-none">
      <div className="bg-white border border-slate-300 rounded shadow-2xl max-w-md w-full overflow-hidden text-slate-800 text-xs flex flex-col">

        {/* Header Bar */}
        <div className="bg-[#7a0c0c] text-white px-5 py-3 flex items-center justify-between font-sans shrink-0">
          <span className="font-bold text-sm tracking-wide">Add Data Center</span>
          <button type="button" onClick={onClose} className="text-white/80 hover:text-white cursor-pointer p-0.5">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 font-sans overflow-y-auto">
          {error && <div className="p-2 bg-rose-50 text-rose-700 text-xs font-bold rounded">{error}</div>}

          <div className="grid grid-cols-12 items-center gap-4">
            <label className="col-span-4 text-slate-700 font-bold uppercase tracking-wider text-[11px] text-right">NAME</label>
            <div className="col-span-8">
              <input
                type="text"
                required
                autoFocus
                placeholder="Required"
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded font-sans focus:outline-none focus:border-[#7a0c0c] text-xs"
              />
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-4 flex justify-end gap-2 border-t border-slate-100">
            <button
              type="submit"
              className="px-6 py-2 bg-[#7a0c0c] text-white rounded font-bold hover:bg-[#590808] cursor-pointer text-xs shadow-xs"
            >
              OK
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 bg-slate-600 text-white rounded font-bold hover:bg-slate-700 cursor-pointer text-xs shadow-xs"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// 2. Add Room Modal
export interface AddRoomModalProps {
  isOpen: boolean;
  dcName: string;
  onClose: () => void;
  onAddRoom: (room: { name: string; description?: string; powerCapacityW?: string; spaceCapacityU?: string; weightCapacityKg?: string }) => void;
}

export function AddRoomModal({ isOpen, dcName, onClose, onAddRoom }: AddRoomModalProps) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    onAddRoom({
      name: name.trim(),
      description: "",
      powerCapacityW: "6000",
      spaceCapacityU: "42",
      weightCapacityKg: "1200"
    });
    setName("");
    setError("");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs font-sans select-none">
      <div className="bg-white border border-slate-300 rounded shadow-2xl max-w-md w-full overflow-hidden text-slate-800 text-xs flex flex-col">

        {/* Header Bar */}
        <div className="bg-[#7a0c0c] text-white px-5 py-3 flex items-center justify-between font-sans shrink-0">
          <span className="font-bold text-sm tracking-wide">Add Room</span>
          <button type="button" onClick={onClose} className="text-white/80 hover:text-white cursor-pointer p-0.5">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 font-sans overflow-y-auto">
          {error && <div className="p-2 bg-rose-50 text-rose-700 text-xs font-bold rounded">{error}</div>}

          <div className="grid grid-cols-12 items-center gap-4">
            <label className="col-span-4 text-slate-700 font-bold uppercase tracking-wider text-[11px] text-right">NAME</label>
            <div className="col-span-8">
              <input
                type="text"
                required
                autoFocus
                placeholder="Required"
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded font-sans focus:outline-none focus:border-[#7a0c0c] text-xs"
              />
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-4 flex justify-end gap-2 border-t border-slate-100">
            <button
              type="submit"
              className="px-6 py-2 bg-[#7a0c0c] text-white rounded font-bold hover:bg-[#590808] cursor-pointer text-xs shadow-xs"
            >
              OK
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 bg-slate-600 text-white rounded font-bold hover:bg-slate-700 cursor-pointer text-xs shadow-xs"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export interface EditRoomModalProps {
  isOpen: boolean;
  initialRoom: { id: string; name: string; description?: string; powerCapacityW?: string; spaceCapacityU?: string; weightCapacityKg?: string } | null;
  onClose: () => void;
  onEditRoom: (room: { id: string; name: string; description?: string; powerCapacityW?: string; spaceCapacityU?: string; weightCapacityKg?: string }) => void;
}

export function EditRoomModal({ isOpen, initialRoom, onClose, onEditRoom }: EditRoomModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [powerCapacityW, setPowerCapacityW] = useState("6000");
  const [spaceCapacityU, setSpaceCapacityU] = useState("42");
  const [weightCapacityKg, setWeightCapacityKg] = useState("1200");
  const [error, setError] = useState("");

  useEffect(() => {
    if (initialRoom) {
      setName(initialRoom.name || "");
      setDescription(initialRoom.description || "");
      setPowerCapacityW(initialRoom.powerCapacityW || "6000");
      setSpaceCapacityU(initialRoom.spaceCapacityU || "42");
      setWeightCapacityKg(initialRoom.weightCapacityKg || "1200");
    }
  }, [initialRoom]);

  if (!isOpen || !initialRoom) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    onEditRoom({
      id: initialRoom.id,
      name: name.trim(),
      description,
      powerCapacityW: powerCapacityW || "6000",
      spaceCapacityU: spaceCapacityU || "42",
      weightCapacityKg: weightCapacityKg || "1200"
    });
    setError("");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs font-sans select-none">
      <div className="bg-white border border-slate-300 rounded shadow-2xl max-w-md w-full overflow-hidden text-slate-800 text-xs flex flex-col">
        {/* Header Bar */}
        <div className="bg-[#7a0c0c] text-white px-5 py-3 flex items-center justify-between font-sans shrink-0">
          <span className="font-bold text-sm tracking-wide">Edit Room Properties</span>
          <button type="button" onClick={onClose} className="text-white/80 hover:text-white cursor-pointer p-0.5">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 font-sans overflow-y-auto">
          {error && <div className="p-2 bg-rose-50 text-rose-700 text-xs font-bold rounded">{error}</div>}

          <div className="grid grid-cols-12 items-center gap-4">
            <label className="col-span-5 text-slate-700 font-bold uppercase tracking-wider text-[11px] text-right">ROOM NAME</label>
            <div className="col-span-7">
              <input
                type="text"
                required
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded font-sans focus:outline-none focus:border-[#7a0c0c] text-xs"
              />
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-4 flex justify-end gap-2 border-t border-slate-100">
            <button
              type="submit"
              className="px-6 py-2 bg-[#7a0c0c] text-white rounded font-bold hover:bg-[#590808] cursor-pointer text-xs shadow-xs"
            >
              Save Changes
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 bg-slate-200 text-slate-700 hover:bg-slate-300 rounded font-bold cursor-pointer text-xs"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// 3. Add Row Modal
export interface AddRowModalProps {
  isOpen: boolean;
  roomName: string;
  onClose: () => void;
  onAddRow: (row: { name: string; description?: string }) => void;
}

export function AddRowModal({ isOpen, roomName, onClose, onAddRow }: AddRowModalProps) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    onAddRow({ name: name.trim(), description: "" });
    setName("");
    setError("");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs font-sans select-none">
      <div className="bg-white border border-slate-300 rounded shadow-2xl max-w-md w-full overflow-hidden text-slate-800 text-xs flex flex-col">

        {/* Header Bar */}
        <div className="bg-[#7a0c0c] text-white px-5 py-3 flex items-center justify-between font-sans shrink-0">
          <span className="font-bold text-sm tracking-wide">Add Row</span>
          <button type="button" onClick={onClose} className="text-white/80 hover:text-white cursor-pointer p-0.5">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 font-sans overflow-y-auto">
          {error && <div className="p-2 bg-rose-50 text-rose-700 text-xs font-bold rounded">{error}</div>}

          <div className="grid grid-cols-12 items-center gap-4">
            <label className="col-span-4 text-slate-700 font-bold uppercase tracking-wider text-[11px] text-right">NAME</label>
            <div className="col-span-8">
              <input
                type="text"
                required
                autoFocus
                placeholder="Required"
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded font-sans focus:outline-none focus:border-[#7a0c0c] text-xs"
              />
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-4 flex justify-end gap-2 border-t border-slate-100">
            <button
              type="submit"
              className="px-6 py-2 bg-[#7a0c0c] text-white rounded font-bold hover:bg-[#590808] cursor-pointer text-xs shadow-xs"
            >
              OK
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 bg-slate-600 text-white rounded font-bold hover:bg-slate-700 cursor-pointer text-xs shadow-xs"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// 4. Add Rack or Cabinet PDU Modal
export interface AddRackModalProps {
  isOpen: boolean;
  rowName: string;
  onClose: () => void;
  onAddRack: (rack: { name: string; description?: string; powerCapacityW?: string; spaceCapacityU?: string; weightCapacityKg?: string }) => void;
}

export function AddRackModal({ isOpen, rowName, onClose, onAddRack }: AddRackModalProps) {
  const [name, setName] = useState("");
  const [powerCapacityW, setPowerCapacityW] = useState("");
  const [spaceCapacityU, setSpaceCapacityU] = useState("42");
  const [weightCapacityKg, setWeightCapacityKg] = useState("1200");
  const [error, setError] = useState("");

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    onAddRack({
      name: name.trim(),
      description: "",
      powerCapacityW: powerCapacityW || "6000",
      spaceCapacityU: spaceCapacityU || "42",
      weightCapacityKg: weightCapacityKg || "1200"
    });
    setName("");
    setPowerCapacityW("");
    setSpaceCapacityU("42");
    setWeightCapacityKg("1200");
    setError("");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs font-sans select-none">
      <div className="bg-white border border-slate-300 rounded shadow-2xl max-w-lg w-full overflow-hidden text-slate-800 text-xs flex flex-col">

        {/* Header Bar */}
        <div className="bg-[#7a0c0c] text-white px-5 py-3 flex items-center justify-between font-sans shrink-0">
          <span className="font-bold text-sm tracking-wide">Add Rack or Cabinet PDU</span>
          <button type="button" onClick={onClose} className="text-white/80 hover:text-white cursor-pointer p-0.5">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 font-sans overflow-y-auto">
          {error && <div className="p-2 bg-rose-50 text-rose-700 text-xs font-bold rounded">{error}</div>}

          <div className="grid grid-cols-12 items-center gap-4">
            <label className="col-span-5 text-slate-700 font-bold uppercase tracking-wider text-[11px] text-right">NAME</label>
            <div className="col-span-7">
              <input
                type="text"
                required
                autoFocus
                placeholder="Required"
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded font-sans focus:outline-none focus:border-[#7a0c0c] text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-12 items-center gap-4">
            <label className="col-span-5 text-slate-700 font-bold uppercase tracking-wider text-[11px] text-right">TOTAL POWER CAPACITY (W)</label>
            <div className="col-span-7">
              <input
                type="text"
                placeholder="e.g. 6000"
                value={powerCapacityW}
                onChange={e => setPowerCapacityW(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded font-sans focus:outline-none focus:border-[#7a0c0c] text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-12 items-center gap-4">
            <label className="col-span-5 text-slate-700 font-bold uppercase tracking-wider text-[11px] text-right">SPACE CAPACITY (U)</label>
            <div className="col-span-7">
              <input
                type="text"
                placeholder="e.g. 42"
                value={spaceCapacityU}
                onChange={e => setSpaceCapacityU(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded font-sans focus:outline-none focus:border-[#7a0c0c] text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-12 items-center gap-4">
            <label className="col-span-5 text-slate-700 font-bold uppercase tracking-wider text-[11px] text-right">WEIGHT CAPACITY (KG)</label>
            <div className="col-span-7">
              <input
                type="text"
                placeholder="e.g. 1200"
                value={weightCapacityKg}
                onChange={e => setWeightCapacityKg(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded font-sans focus:outline-none focus:border-[#7a0c0c] text-xs"
              />
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-4 flex justify-end gap-2 border-t border-slate-100">
            <button
              type="submit"
              className="px-6 py-2 bg-[#7a0c0c] text-white rounded font-bold hover:bg-[#590808] cursor-pointer text-xs shadow-xs"
            >
              OK
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 bg-slate-600 text-white rounded font-bold hover:bg-slate-700 cursor-pointer text-xs shadow-xs"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// 5. Add Device Hierarchy Choice Modal (Image 5)
export interface AddDeviceHierarchyModalProps {
  isOpen: boolean;
  rackName: string;
  servers: any[];
  onClose: () => void;
  onSelectExistingDevice: (server: any, allSelected?: any[]) => void;
  onOpenAddNewDeviceModal: () => void;
}

export function AddDeviceHierarchyModal({
  isOpen,
  rackName,
  servers,
  onClose,
  onSelectExistingDevice,
  onOpenAddNewDeviceModal
}: AddDeviceHierarchyModalProps) {
  const [tab, setTab] = useState<"existing" | "new">("existing");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedServerIds, setSelectedServerIds] = useState<string[]>([]);
  const [error, setError] = useState<string>("");

  if (!isOpen) return null;

  // Retrieve deleted server keys to strictly filter out deleted devices
  const deletedKeys = (() => {
    try {
      const raw = localStorage.getItem("tyrone_deleted_keys");
      return raw ? new Set<string>(JSON.parse(raw)) : new Set<string>();
    } catch {
      return new Set<string>();
    }
  })();

  // Retrieve active hierarchy rack names
  const activeHierarchyRackNames = (() => {
    const rackSet = new Set<string>();
    try {
      const savedRacks = localStorage.getItem("tyrone_hierarchy_racks");
      if (savedRacks) {
        const parsed = JSON.parse(savedRacks);
        if (parsed && typeof parsed === "object") {
          Object.values(parsed).forEach((rackList: any) => {
            if (Array.isArray(rackList)) {
              rackList.forEach((r: any) => {
                if (r && typeof r === "object") {
                  if (r.name) rackSet.add(String(r.name).trim().toLowerCase());
                  if (r.id) rackSet.add(String(r.id).trim().toLowerCase());
                } else if (r && typeof r === "string") {
                  rackSet.add(r.trim().toLowerCase());
                }
              });
            }
          });
        }
      }
    } catch (_) {}
    return rackSet;
  })();

  // Retrieve server to rack mappings
  const serverRacksMap = (() => {
    try {
      const saved = localStorage.getItem("tyrone_server_racks");
      const parsed = saved ? JSON.parse(saved) : {};
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch { return {}; }
  })();

  // Gather all servers from props and localStorage fleet
  const allKnownServers = (() => {
    const mergedMap = new Map<string, any>();
    (servers || []).forEach(s => {
      if (s && (s.id || s.bmcIp || s.ip)) {
        const idVal = String(s.id || s.bmcIp || s.ip);
        const key = idVal.toLowerCase();
        if (!deletedKeys.has(key) && !deletedKeys.has(String(s.bmcIp || "").toLowerCase()) && !deletedKeys.has(String(s.name || "").toLowerCase())) {
          mergedMap.set(key, { ...s, id: s.id || idVal });
        }
      }
    });
    try {
      const savedFleet = localStorage.getItem("tyrone_fleet");
      if (savedFleet) {
        const parsed = JSON.parse(savedFleet);
        if (Array.isArray(parsed)) {
          parsed.forEach((f: any) => {
            if (f && (f.id || f.bmcIp || f.ip)) {
              const idVal = String(f.id || f.bmcIp || f.ip);
              const key = idVal.toLowerCase();
              if (key && !deletedKeys.has(key) && !deletedKeys.has(String(f.bmcIp || "").toLowerCase()) && !deletedKeys.has(String(f.name || "").toLowerCase())) {
                if (!mergedMap.has(key)) {
                  mergedMap.set(key, { ...f, id: f.id || idVal });
                }
              }
            }
          });
        }
      }
    } catch (_) {}
    return Array.from(mergedMap.values());
  })();

  // Filter for devices that are NOT currently in the selected target rack, prioritizing unassigned devices
  const availableServers = (() => {
    const unassignedList = allKnownServers.filter(s => {
      if (!s) return false;
      const rawCurrentRack = (s.id && serverRacksMap[s.id]) || (s.bmcIp && serverRacksMap[s.bmcIp]) || s.rack || "";
      const currentRack = String(rawCurrentRack).trim().toLowerCase();
      return !currentRack || currentRack === "unassigned" || currentRack === "not in hierarchy" || currentRack === "none";
    });

    if (unassignedList.length > 0) return unassignedList;

    const list = allKnownServers.filter(s => {
      if (!s) return false;
      const rawCurrentRack = (s.id && serverRacksMap[s.id]) || (s.bmcIp && serverRacksMap[s.bmcIp]) || s.rack || "";
      const currentRack = String(rawCurrentRack).trim().toLowerCase();
      const targetRack = String(rackName || "").trim().toLowerCase();

      if (!currentRack || currentRack !== targetRack) {
        return true;
      }
      return false;
    });

    if (list.length > 0) return list;
    return allKnownServers;
  })();

  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const handleHeaderSort = (colKey: string) => {
    if (sortCol === colKey) {
      if (sortDir === "asc") setSortDir("desc");
      else {
        setSortCol(null);
        setSortDir("asc");
      }
    } else {
      setSortCol(colKey);
      setSortDir("asc");
    }
  };

  const filteredServers = availableServers.filter(s => {
    if (!s) return false;
    const term = searchTerm.toLowerCase();
    const currentRack = String((s.id && serverRacksMap[s.id]) || (s.bmcIp && serverRacksMap[s.bmcIp]) || s.rack || "").toLowerCase();
    return (
      String(s.name || "").toLowerCase().includes(term) ||
      String(s.bmcIp || s.ip || "").toLowerCase().includes(term) ||
      String(s.model || "").toLowerCase().includes(term) ||
      String(s.serialNumber || s.serial || "").toLowerCase().includes(term) ||
      currentRack.includes(term)
    );
  });

  const sortedServers = [...filteredServers].sort((a, b) => {
    if (!sortCol || !a || !b) return 0;
    let valA: any = "";
    let valB: any = "";
    if (sortCol === "name") { valA = String(a.name || a.bmcIp || a.id || ""); valB = String(b.name || b.bmcIp || b.id || ""); }
    else if (sortCol === "bmcIp") { valA = String(a.bmcIp || a.ip || ""); valB = String(b.bmcIp || b.ip || ""); }
    else if (sortCol === "rack") { valA = String((a.id && serverRacksMap[a.id]) || (a.bmcIp && serverRacksMap[a.bmcIp]) || a.rack || "Unassigned"); valB = String((b.id && serverRacksMap[b.id]) || (b.bmcIp && serverRacksMap[b.bmcIp]) || b.rack || "Unassigned"); }
    else if (sortCol === "model") { valA = String(a.model || a.manufacturer || ""); valB = String(b.model || b.manufacturer || ""); }
    else if (sortCol === "serialNumber") { valA = String(a.serialNumber || a.serial || ""); valB = String(b.serialNumber || b.serial || ""); }
    else if (sortCol === "deviceType") { valA = String(a.deviceType || "Server"); valB = String(b.deviceType || "Server"); }
    else if (sortCol === "deratedPowerW") { valA = parseFloat(String(a.deratedPowerW || a.powerW || 0)); valB = parseFloat(String(b.deratedPowerW || b.powerW || 0)); }

    if (typeof valA === "number" && typeof valB === "number") {
      return sortDir === "asc" ? valA - valB : valB - valA;
    }
    return sortDir === "asc" ? String(valA).localeCompare(String(valB)) : String(valB).localeCompare(String(valA));
  });

  const isSelected = (srv: any) => {
    if (!srv) return false;
    return (
      (srv.id && selectedServerIds.includes(String(srv.id))) ||
      (srv.bmcIp && selectedServerIds.includes(String(srv.bmcIp))) ||
      (srv.ip && selectedServerIds.includes(String(srv.ip)))
    );
  };

  const isAllSelected = sortedServers.length > 0 && sortedServers.every(s => isSelected(s));

  const handleSelectAll = () => {
    if (isAllSelected) {
      setSelectedServerIds([]);
    } else {
      const allKeys: string[] = [];
      sortedServers.forEach(s => {
        if (s.id) allKeys.push(String(s.id));
        if (s.bmcIp) allKeys.push(String(s.bmcIp));
        if (s.ip) allKeys.push(String(s.ip));
      });
      setSelectedServerIds(Array.from(new Set(allKeys)));
    }
  };

  const handleToggleServer = (srv: any) => {
    if (!srv) return;
    const keys = [srv.id, srv.bmcIp, srv.ip].filter(Boolean).map(k => String(k));
    if (keys.length === 0) return;
    const currentlySel = isSelected(srv);
    if (currentlySel) {
      setSelectedServerIds(prev => prev.filter(k => !keys.includes(k)));
    } else {
      setSelectedServerIds(prev => Array.from(new Set([...prev, ...keys])));
    }
  };

  const handleOK = () => {
    if (tab === "existing") {
      const selectedServers = availableServers.filter(srv => isSelected(srv));
      if (selectedServers.length === 0) {
        if (availableServers.length === 0) {
          onOpenAddNewDeviceModal();
          onClose();
          return;
        }
        setError("Please select at least one device from the list first.");
        return;
      }
      onSelectExistingDevice(selectedServers[0], selectedServers);
    } else if (tab === "new") {
      onOpenAddNewDeviceModal();
    }
    setError("");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 pt-16 bg-slate-950/75 backdrop-blur-xs font-sans select-none overflow-y-auto">
      <div className="bg-white border border-slate-300 rounded-xl shadow-2xl max-w-4xl w-full text-slate-800 text-xs flex flex-col max-h-[85vh] my-auto overflow-hidden">

        {/* Header Bar - Tyrone Red */}
        <div className="bg-[#680505] text-white px-5 py-3.5 flex items-center justify-between font-sans shrink-0 border-b border-[#4d0000]">
          <span className="font-bold text-sm tracking-wide">Add Device</span>
          <button type="button" onClick={onClose} className="text-white/80 hover:text-white cursor-pointer p-0.5">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Sub-Tabs & Body */}
        <div className="p-5 space-y-4 font-sans overflow-y-auto flex-1 min-h-0">
          <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
            <button
              onClick={() => setTab("existing")}
              className={`px-4 py-1.5 text-xs font-bold rounded cursor-pointer ${tab === "existing"
                ? "bg-[#680505] text-white shadow-xs"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
            >
              Devices not in Hierarchy
            </button>
            <button
              onClick={() => {
                onOpenAddNewDeviceModal();
                onClose();
              }}
              className={`px-4 py-1.5 text-xs font-bold rounded cursor-pointer ${tab === "new"
                ? "bg-[#680505] text-white shadow-xs"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
            >
              Add New Device
            </button>
          </div>

          {error && (
            <div className="p-2 bg-amber-50 border border-amber-200 text-amber-800 rounded font-bold text-xs">
              {error}
            </div>
          )}

          <p className="text-slate-500 font-medium text-xs">Please choose the device from the list.</p>

          {/* Search bar */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1 max-w-xs">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10" />
              <input
                type="text"
                placeholder="Name or Address"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-3 py-1.5 border border-slate-300 rounded font-sans text-xs focus:outline-none focus:border-[#680505] focus:ring-1 focus:ring-[#680505]"
              />
            </div>
            <button
              onClick={() => setSearchTerm(searchTerm)}
              className="px-4 py-1.5 bg-[#680505] text-white rounded font-bold hover:bg-[#520000] cursor-pointer text-xs transition-colors"
            >
              Search
            </button>
            <button
              onClick={() => setSearchTerm("")}
              className="px-4 py-1.5 bg-[#680505] text-white rounded font-bold hover:bg-[#520000] cursor-pointer text-xs transition-colors"
            >
              Clear
            </button>
          </div>

          {/* Devices Table */}
          <div className="border border-slate-300 rounded overflow-x-auto max-h-[360px] overflow-y-auto shadow-xs">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-300 sticky top-0 z-10 shadow-2xs">
                <tr>
                  <th className="p-2.5 w-10 text-center bg-slate-100">
                    <input
                      type="checkbox"
                      checked={isAllSelected}
                      onChange={handleSelectAll}
                      className="accent-[#680505] cursor-pointer"
                      title="Select All Devices"
                    />
                  </th>
                  <th onClick={() => handleHeaderSort("name")} className="p-2.5 bg-slate-100 hover:bg-slate-200 cursor-pointer select-none">
                    Name {sortCol === "name" ? (sortDir === "asc" ? "↑" : "↓") : "↑↓"}
                  </th>
                  <th onClick={() => handleHeaderSort("bmcIp")} className="p-2.5 bg-slate-100 hover:bg-slate-200 cursor-pointer select-none">
                    Address {sortCol === "bmcIp" ? (sortDir === "asc" ? "↑" : "↓") : "↑↓"}
                  </th>
                  <th onClick={() => handleHeaderSort("rack")} className="p-2.5 bg-slate-100 hover:bg-slate-200 cursor-pointer select-none">
                    Current Location {sortCol === "rack" ? (sortDir === "asc" ? "↑" : "↓") : "↑↓"}
                  </th>
                  <th onClick={() => handleHeaderSort("model")} className="p-2.5 bg-slate-100 hover:bg-slate-200 cursor-pointer select-none">
                    Model {sortCol === "model" ? (sortDir === "asc" ? "↑" : "↓") : "↑↓"}
                  </th>
                  <th onClick={() => handleHeaderSort("serialNumber")} className="p-2.5 bg-slate-100 hover:bg-slate-200 cursor-pointer select-none">
                    Serial Number {sortCol === "serialNumber" ? (sortDir === "asc" ? "↑" : "↓") : "↑↓"}
                  </th>
                  <th onClick={() => handleHeaderSort("deviceType")} className="p-2.5 bg-slate-100 hover:bg-slate-200 cursor-pointer select-none">
                    Device Type {sortCol === "deviceType" ? (sortDir === "asc" ? "↑" : "↓") : "↑↓"}
                  </th>
                  <th onClick={() => handleHeaderSort("deratedPowerW")} className="p-2.5 bg-slate-100 hover:bg-slate-200 cursor-pointer select-none">
                    Derated Power (W) {sortCol === "deratedPowerW" ? (sortDir === "asc" ? "↑" : "↓") : "↑↓"}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {sortedServers.length > 0 ? (
                  sortedServers.map(s => {
                    const currentRackVal = (s.id && serverRacksMap[s.id]) || (s.bmcIp && serverRacksMap[s.bmcIp]) || s.rack;
                    const displayRack = currentRackVal ? String(currentRackVal) : "Unassigned";
                    return (
                      <tr
                        key={s.id || s.bmcIp || s.ip}
                        onClick={() => handleToggleServer(s)}
                        onDoubleClick={() => {
                          onSelectExistingDevice(s, [s]);
                          onClose();
                        }}
                        className={`hover:bg-slate-50 cursor-pointer transition-colors ${isSelected(s) ? "bg-slate-100 font-bold text-slate-900" : ""}`}
                      >
                        <td className="p-2.5 text-center" onClick={e => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isSelected(s)}
                            onChange={() => handleToggleServer(s)}
                            className="accent-[#680505] cursor-pointer"
                          />
                        </td>
                        <td className="p-2.5 text-[#680505] font-bold">{s.name || s.bmcIp || s.id}</td>
                        <td className="p-2.5 font-mono">{s.bmcIp || s.ip || "N/A"}</td>
                        <td className="p-2.5">
                          <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${displayRack === "Unassigned" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-700"}`}>
                            {displayRack}
                          </span>
                        </td>
                        <td className="p-2.5">{s.model || s.manufacturer || "Tyrone Server"}</td>
                        <td className="p-2.5 font-mono">{s.serialNumber || s.serial || s.bmcIp || s.id}</td>
                        <td className="p-2.5">{s.deviceType || "Server"}</td>
                        <td className="p-2.5">{s.deratedPowerW || s.powerW || "400"}</td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-slate-500 font-medium">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <span>No existing devices found to add to hierarchy.</span>
                        <button
                          type="button"
                          onClick={() => {
                            onOpenAddNewDeviceModal();
                            onClose();
                          }}
                          className="px-4 py-1.5 bg-[#680505] hover:bg-[#520000] text-white font-bold rounded text-xs cursor-pointer shadow-xs transition-all flex items-center gap-1.5"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Add New Device</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

        </div>

        {/* Footer Actions - Fixed at Bottom */}
        <div className="shrink-0 bg-slate-50 border-t border-slate-200 px-5 py-3 flex justify-end gap-2.5">
          <button
            onClick={handleOK}
            className="px-6 py-2 bg-[#680505] text-white rounded font-bold hover:bg-[#520000] cursor-pointer text-xs shadow-xs transition-colors"
          >
            OK
          </button>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-200 text-slate-700 hover:bg-slate-300 rounded font-bold cursor-pointer text-xs transition-colors"
          >
            Cancel
          </button>
        </div>

      </div>
    </div>
  );
}

// 6. Edit Rack Modal
export interface EditRackModalProps {
  isOpen: boolean;
  initialRack: { id: string; name: string; description?: string; powerCapacityW?: string; spaceCapacityU?: string; weightCapacityKg?: string } | null;
  onClose: () => void;
  onEditRack: (rack: { id: string; name: string; description?: string; powerCapacityW?: string; spaceCapacityU?: string; weightCapacityKg?: string }) => void;
}

export function EditRackModal({ isOpen, initialRack, onClose, onEditRack }: EditRackModalProps) {
  const [name, setName] = useState("");
  const [powerCapacityW, setPowerCapacityW] = useState("6000");
  const [spaceCapacityU, setSpaceCapacityU] = useState("42");
  const [weightCapacityKg, setWeightCapacityKg] = useState("1200");
  const [error, setError] = useState("");

  useEffect(() => {
    if (initialRack) {
      setName(initialRack.name || "");
      setPowerCapacityW(initialRack.powerCapacityW || "6000");
      setSpaceCapacityU(initialRack.spaceCapacityU || "42");
      setWeightCapacityKg(initialRack.weightCapacityKg || "1200");
    }
  }, [initialRack]);

  if (!isOpen || !initialRack) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    onEditRack({
      id: initialRack.id,
      name: name.trim(),
      description: "",
      powerCapacityW: powerCapacityW || "6000",
      spaceCapacityU: spaceCapacityU || "42",
      weightCapacityKg: weightCapacityKg || "1200"
    });
    setError("");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs font-sans select-none">
      <div className="bg-white border border-slate-300 rounded shadow-2xl max-w-lg w-full overflow-hidden text-slate-800 text-xs flex flex-col">
        {/* Header Bar */}
        <div className="bg-[#7a0c0c] text-white px-5 py-3 flex items-center justify-between font-sans shrink-0">
          <span className="font-bold text-sm tracking-wide">Edit Rack Properties</span>
          <button type="button" onClick={onClose} className="text-white/80 hover:text-white cursor-pointer p-0.5">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 font-sans overflow-y-auto">
          {error && <div className="p-2 bg-rose-50 text-rose-700 text-xs font-bold rounded">{error}</div>}

          <div className="grid grid-cols-12 items-center gap-4">
            <label className="col-span-5 text-slate-700 font-bold uppercase tracking-wider text-[11px] text-right">RACK NAME</label>
            <div className="col-span-7">
              <input
                type="text"
                required
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded font-sans focus:outline-none focus:border-[#7a0c0c] text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-12 items-center gap-4">
            <label className="col-span-5 text-slate-700 font-bold uppercase tracking-wider text-[11px] text-right">TOTAL POWER CAPACITY (W)</label>
            <div className="col-span-7">
              <input
                type="text"
                placeholder="e.g. 6000"
                value={powerCapacityW}
                onChange={e => setPowerCapacityW(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded font-sans focus:outline-none focus:border-[#7a0c0c] text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-12 items-center gap-4">
            <label className="col-span-5 text-slate-700 font-bold uppercase tracking-wider text-[11px] text-right">SPACE CAPACITY (U)</label>
            <div className="col-span-7">
              <input
                type="text"
                placeholder="e.g. 42"
                value={spaceCapacityU}
                onChange={e => setSpaceCapacityU(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded font-sans focus:outline-none focus:border-[#7a0c0c] text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-12 items-center gap-4">
            <label className="col-span-5 text-slate-700 font-bold uppercase tracking-wider text-[11px] text-right">WEIGHT CAPACITY (KG)</label>
            <div className="col-span-7">
              <input
                type="text"
                placeholder="e.g. 1200"
                value={weightCapacityKg}
                onChange={e => setWeightCapacityKg(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded font-sans focus:outline-none focus:border-[#7a0c0c] text-xs"
              />
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-4 flex justify-end gap-2 border-t border-slate-100">
            <button
              type="submit"
              className="px-6 py-2 bg-[#7a0c0c] text-white rounded font-bold hover:bg-[#590808] cursor-pointer text-xs shadow-xs"
            >
              Save Changes
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 bg-slate-200 text-slate-700 hover:bg-slate-300 rounded font-bold cursor-pointer text-xs"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// 7. Edit Device Modal
export interface EditDeviceModalProps {
  isOpen: boolean;
  initialDevice: any;
  availableRacks: string[];
  onClose: () => void;
  onEditDevice: (updatedDevice: any) => void;
}

export function EditDeviceModal({
  isOpen,
  initialDevice,
  availableRacks,
  onClose,
  onEditDevice
}: EditDeviceModalProps) {
  const [name, setName] = useState("");
  const [bmcIp, setBmcIp] = useState("");
  const [rack, setRack] = useState("");
  const [deratedPowerW, setDeratedPowerW] = useState("350");
  const [sizeU, setSizeU] = useState("1");
  const [weightKg, setWeightKg] = useState("15");
  const [bmcUsername, setBmcUsername] = useState("admin");
  const [bmcPassword, setBmcPassword] = useState("admin");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (initialDevice) {
      setName(initialDevice.name || "");
      setBmcIp(initialDevice.bmcIp || initialDevice.ip || "");
      setRack(initialDevice.rack || (availableRacks.length > 0 ? availableRacks[0] : "Rack 1"));
      setDeratedPowerW(String(initialDevice.deratedPowerW || initialDevice.powerW || "350"));
      setSizeU(String(initialDevice.sizeU || initialDevice.size || "1"));
      setWeightKg(String(initialDevice.weightKg || initialDevice.weight || "15"));
      setBmcUsername(initialDevice.bmcUsername || "admin");
      setBmcPassword(initialDevice.bmcPassword || "admin");
    }
  }, [initialDevice, availableRacks]);

  if (!isOpen || !initialDevice) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Device Name is required.");
      return;
    }
    onEditDevice({
      ...initialDevice,
      name: name.trim(),
      bmcIp: bmcIp.trim(),
      rack: rack || "Rack 1",
      deratedPowerW,
      powerW: parseFloat(deratedPowerW) || 350,
      sizeU,
      size: parseFloat(sizeU) || 1,
      weightKg,
      weight: parseFloat(weightKg) || 15,
      bmcUsername: bmcUsername.trim(),
      bmcPassword: bmcPassword.trim()
    });
    setError("");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm font-sans select-none">
      <div className="bg-white border-2 border-[#7a0c0c] text-slate-850 rounded-lg max-w-xl w-full p-6 font-sans shadow-2xl relative z-10 text-left">
        <button
          type="button"
          onClick={onClose}
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
              Edit Device Profile
            </h3>
            <p className="text-[10px] text-slate-500 font-medium tracking-wide mt-0.5">
              Update BMC IP & physical rack assignment details
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-slate-700 font-sans">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded text-rose-700 text-xs font-bold flex items-start gap-2">
              <div className="mt-0.5 p-0.5 bg-rose-600 text-white rounded font-bold text-[10px] leading-none">!</div>
              <div>{error}</div>
            </div>
          )}

          <div className="space-y-1">
            <label className="text-[9px] font-bold uppercase tracking-wider text-slate-600 block">
              Server Node Identifier Name *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={e => setName(e.target.value)}
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
                  value={bmcIp}
                  onChange={e => setBmcIp(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded font-mono text-xs text-slate-800 focus:outline-none focus:border-[#7a0c0c]"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-bold uppercase tracking-wider text-slate-600 block">
                  BMC User
                </label>
                <input
                  type="text"
                  value={bmcUsername}
                  onChange={e => setBmcUsername(e.target.value)}
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
                  type={showPassword ? "text" : "password"}
                  value={bmcPassword}
                  onChange={e => setBmcPassword(e.target.value)}
                  className="w-full px-3 py-1.5 pr-10 bg-slate-50 border border-slate-300 rounded font-mono text-xs text-slate-800 focus:outline-none focus:border-[#7a0c0c]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-800 cursor-pointer p-1"
                  title={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="w-4 h-4 text-slate-600" /> : <Eye className="w-4 h-4 text-slate-600" />}
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
                  value={rack}
                  onChange={e => setRack(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded font-mono text-xs text-slate-800 focus:outline-none focus:border-[#7a0c0c]"
                >
                  {availableRacks.map(rk => (
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
                  value={weightKg}
                  onChange={e => setWeightKg(e.target.value)}
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
                  value={sizeU}
                  onChange={e => setSizeU(e.target.value)}
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
                  value={deratedPowerW}
                  onChange={e => setDeratedPowerW(e.target.value)}
                  placeholder="750"
                  className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded font-mono text-xs text-slate-800 focus:outline-none focus:border-[#7a0c0c]"
                />
              </div>
            </div>
          </div>

          <div className="border-t border-slate-200 pt-3 mt-4 flex items-center justify-end gap-2 font-mono">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded font-bold uppercase text-xs transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-1.5 bg-[#7a0c0c] hover:bg-[#590808] text-white rounded font-bold uppercase text-xs transition-all cursor-pointer shadow-sm flex items-center gap-1.5"
            >
              <span>Save Device Details</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
