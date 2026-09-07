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

  const availableServers = (servers || []).filter(s => {
    const idStr = String(s.id || "").toLowerCase();
    const ipStr = String(s.bmcIp || s.ip || "").toLowerCase();
    const nameStr = String(s.name || "").toLowerCase();
    return !deletedKeys.has(idStr) && !deletedKeys.has(ipStr) && !deletedKeys.has(nameStr);
  });

  const filteredServers = availableServers.filter(s =>
    (s.name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
    (s.bmcIp || s.ip || "").toLowerCase().includes(searchTerm.toLowerCase())
  );


  const isAllSelected = filteredServers.length > 0 && filteredServers.every(s => selectedServerIds.includes(s.id));

  const handleSelectAll = () => {
    if (isAllSelected) {
      setSelectedServerIds(prev => prev.filter(id => !filteredServers.some(s => s.id === id)));
    } else {
      const allFilteredIds = filteredServers.map(s => s.id);
      setSelectedServerIds(prev => Array.from(new Set([...prev, ...allFilteredIds])));
    }
  };

  const handleToggleServer = (id: string) => {
    setSelectedServerIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleOK = () => {
    if (tab === "existing") {
      if (selectedServerIds.length === 0) {
        setError("Please select at least one device from the list first.");
        return;
      }
      const selectedServers = availableServers.filter(srv => selectedServerIds.includes(srv.id));
      if (selectedServers.length > 0) {
        onSelectExistingDevice(selectedServers[0], selectedServers);
      }
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
              <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Name or Address"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 border border-slate-300 rounded font-sans text-xs focus:outline-none focus:border-[#680505] focus:ring-1 focus:ring-[#680505]"
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
                  <th className="p-2.5 bg-slate-100">Name ↑↓</th>
                  <th className="p-2.5 bg-slate-100">Address ↑↓</th>
                  <th className="p-2.5 bg-slate-100">Model ↑↓</th>
                  <th className="p-2.5 bg-slate-100">Serial Number ↑↓</th>
                  <th className="p-2.5 bg-slate-100">Device Type ↑↓</th>
                  <th className="p-2.5 bg-slate-100">Derated Power (W) ↑↓</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredServers.length > 0 ? (
                  filteredServers.map(s => (
                    <tr
                      key={s.id}
                      onClick={() => handleToggleServer(s.id)}
                      className={`hover:bg-slate-50 cursor-pointer transition-colors ${selectedServerIds.includes(s.id) ? "bg-slate-100 font-bold text-slate-900" : ""
                        }`}
                    >
                      <td className="p-2.5 text-center" onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedServerIds.includes(s.id)}
                          onChange={() => handleToggleServer(s.id)}
                          className="accent-[#680505] cursor-pointer"
                        />
                      </td>
                      <td className="p-2.5 text-[#680505] font-bold">{s.name}</td>
                      <td className="p-2.5 font-mono">{s.bmcIp}</td>
                      <td className="p-2.5">Tyrone Server</td>
                      <td className="p-2.5 font-mono">{(s as any).serialNumber || s.bmcIp || s.id}</td>
                      <td className="p-2.5">Server</td>
                      <td className="p-2.5">400</td>
                    </tr>
                  ))
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
