"""
Data Normalizer Translation Layer for Tyrone Pro Server
=======================================================
Reads raw vendor JSONB Redfish payloads (Supermicro 'SM' vs ASRock 'AS' vs NVIDIA HGX),
standardizes varying vendor keys into a clean, uniform layout for the React UI.
Enforces strict PRESENT-ONLY filtering without mock fallbacks.
"""

from typing import Dict, Any, List

def is_present(item: Dict[str, Any]) -> bool:
    """Helper to check if a component is actively present and not vacant/absent."""
    if not isinstance(item, dict):
        return False
    status = item.get("Status", {})
    if isinstance(status, dict):
        state = str(status.get("State", "")).lower()
        health = str(status.get("Health", "")).lower()
        if state in ("absent", "disabled", "offline", "vacant", "notinstalled") or health == "absent":
            return False

    name = str(item.get("Name", "")).lower()
    model = str(item.get("Model", "")).lower()
    if name in ("unpopulated", "absent", "empty", "none", "not installed", "vacant") or \
       model in ("unpopulated", "absent", "empty", "none", "not installed", "vacant"):
        return False

    return True

def normalize_inventory(vendor: str, sys_json: Dict[str, Any], net_json: Dict[str, Any]) -> Dict[str, Any]:
    """
    Translates raw Redfish responses into uniform hardware metrics schema.
    Applies strict present-only filtering and omits vacant/unpopulated slots.
    """
    vendor_tag = vendor.upper()
    
    # Base Metadata
    model = sys_json.get("Model") or sys_json.get("Name") or ("Supermicro Server" if vendor_tag == "SM" else "ASRock Rack Server")
    manufacturer = sys_json.get("Manufacturer") or ("Supermicro" if vendor_tag == "SM" else "ASRock Rack")
    serial_number = sys_json.get("SerialNumber") or sys_json.get("SKU") or "N/A"
    
    status_obj = sys_json.get("Status", {})
    health = status_obj.get("Health") or status_obj.get("State") or "OK"
    power_state = sys_json.get("PowerState") or "On"

    # 1. Processors (CPUs) Normalization (Present-Only)
    cpus: List[Dict[str, Any]] = []
    processors_raw = sys_json.get("Processors", {})
    members = processors_raw.get("Members", []) if isinstance(processors_raw, dict) else []
    
    if isinstance(processors_raw, list):
        members = processors_raw
        
    for proc in members:
        if isinstance(proc, dict) and is_present(proc):
            cores = proc.get("TotalCores", 0)
            if cores > 0 or proc.get("Model") or proc.get("MaxSpeedMHz"):
                cpus.append({
                    "socket": proc.get("Socket") or proc.get("Id") or f"CPU {len(cpus)+1}",
                    "model": proc.get("Model") or proc.get("ProcessorType") or "Processor",
                    "cores": cores,
                    "threads": proc.get("TotalThreads", cores * 2 if cores else 0),
                    "maxSpeedMHz": proc.get("MaxSpeedMHz", 0),
                    "health": proc.get("Status", {}).get("Health", "OK")
                })

    # 2. Memory (RAM DIMMs) Normalization (Present-Only)
    memory_modules: List[Dict[str, Any]] = []
    mem_raw = sys_json.get("Memory", {})
    mem_members = mem_raw.get("Members", []) if isinstance(mem_raw, dict) else []
    
    if isinstance(mem_members, list):
        for mem in mem_members:
            if isinstance(mem, dict) and is_present(mem):
                cap_mb = mem.get("CapacityMiB", 0)
                if cap_mb > 0 or mem.get("CapacityBytes", 0) > 0:
                    cap_gb = round(cap_mb / 1024, 1) if cap_mb else round(mem.get("CapacityBytes", 0) / (1024**3), 1)
                    memory_modules.append({
                        "slot": mem.get("DeviceLocator") or mem.get("Socket") or f"DIMM_{len(memory_modules)+1}",
                        "capacityGiB": cap_gb,
                        "speedMHz": mem.get("OperatingSpeedMhz") or (mem.get("AllowedSpeedsMHz", [0])[0] if isinstance(mem.get("AllowedSpeedsMHz"), list) else 0),
                        "type": mem.get("MemoryDeviceType", "DRAM"),
                        "health": mem.get("Status", {}).get("Health", "OK")
                    })

    # 3. Storage Controllers & Drives Normalization (Present-Only)
    storage_drives: List[Dict[str, Any]] = []
    storage_raw = sys_json.get("Storage", {})
    st_members = storage_raw.get("Members", []) if isinstance(storage_raw, dict) else []

    if isinstance(st_members, list):
        for st in st_members:
            if isinstance(st, dict) and is_present(st):
                drives = st.get("Drives", [])
                if isinstance(drives, list):
                    for d in drives:
                        if isinstance(d, dict) and is_present(d):
                            cap_bytes = d.get("CapacityBytes", 0)
                            cap_tb = round(cap_bytes / (1000**4), 2) if cap_bytes else 0
                            storage_drives.append({
                                "name": d.get("Name") or d.get("Model") or f"Drive_{len(storage_drives)+1}",
                                "capacityTB": cap_tb,
                                "mediaType": d.get("MediaType", "Storage Drive"),
                                "protocol": d.get("Protocol", "N/A"),
                                "health": d.get("Status", {}).get("Health", "OK")
                            })

    # 4. Network Ports Normalization (Present-Only)
    network_ports: List[Dict[str, Any]] = []
    net_members = net_json.get("Members", []) if isinstance(net_json, dict) else []

    if isinstance(net_members, list):
        for adapter in net_members:
            if isinstance(adapter, dict) and is_present(adapter):
                ports = adapter.get("Ports", []) if isinstance(adapter.get("Ports"), list) else [adapter]
                for p in ports:
                    if isinstance(p, dict) and is_present(p):
                        mac_addrs = p.get("AssociatedNetworkAddresses", [])
                        mac = mac_addrs[0] if isinstance(mac_addrs, list) and mac_addrs else p.get("MACAddress", "N/A")
                        network_ports.append({
                            "portId": p.get("Id") or p.get("Name") or f"eth{len(network_ports)}",
                            "linkStatus": p.get("LinkStatus") or p.get("Status", {}).get("State") or "Up",
                            "speedGbps": (p.get("CurrentLinkSpeedMbps", 0) or 0) // 1000,
                            "macAddress": mac
                        })

    # Clean Uniform Normalized Output Layout for React UI (No mock fallbacks)
    return {
        "vendor": vendor_tag,
        "model": model,
        "manufacturer": manufacturer,
        "serialNumber": serial_number,
        "healthStatus": health,
        "powerState": power_state,
        "cpus": cpus,
        "memory": memory_modules,
        "storage": storage_drives,
        "networkPorts": network_ports,
        "raw_counts": {
            "cpu_count": len(cpus),
            "ram_dimms": len(memory_modules),
            "drive_count": len(storage_drives),
            "network_ports": len(network_ports)
        }
    }
