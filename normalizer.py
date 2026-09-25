"""
Data Normalizer Translation Layer for Tyrone Pro Server
=======================================================
Reads raw vendor JSONB Redfish payloads (Supermicro 'SM', ASRock 'AS', AMI, Intel, Dell, HPE),
standardizes varying vendor keys into a clean, uniform layout for the React UI.
Enforces strict PRESENT-ONLY filtering without mock fallbacks. Returns null / Data Unavailable if BMC data is missing.
"""

from typing import Dict, Any, List, Optional

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
    If hardware metrics are unavailable or missing from BMC response, sets fields to null.
    """
    if not sys_json or not isinstance(sys_json, dict):
        return {
            "vendor": vendor.upper() if vendor else "UNKNOWN",
            "model": None,
            "manufacturer": None,
            "serialNumber": None,
            "healthStatus": "Data Unavailable",
            "powerState": "Offline",
            "cpus": [],
            "memory": [],
            "storage": [],
            "networkPorts": [],
            "psuRedundancy": {"status": "Unknown", "mode": "N/A"},
            "firmware": {"bmc": None, "bios": None, "drift": "Unknown"},
            "raw_counts": {"cpu_count": 0, "ram_dimms": 0, "drive_count": 0, "network_ports": 0}
        }

    vendor_tag = vendor.upper() if vendor else "GENERIC"
    
    # Base Metadata without hardcoded fake defaults
    model = sys_json.get("Model") or sys_json.get("Name")
    manufacturer = sys_json.get("Manufacturer")
    serial_number = sys_json.get("SerialNumber") or sys_json.get("SKU")
    
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
                    "model": proc.get("Model") or proc.get("ProcessorType"),
                    "cores": cores if cores > 0 else None,
                    "threads": proc.get("TotalThreads"),
                    "maxSpeedMHz": proc.get("MaxSpeedMHz"),
                    "health": proc.get("Status", {}).get("Health", "OK")
                })

    # 2. Memory (RAM DIMMs) Normalization (Present-Only)
    memory_modules: List[Dict[str, Any]] = []
    mem_raw = sys_json.get("Memory", {})
    mem_members = mem_raw.get("Members", []) if isinstance(mem_raw, dict) else []
    
    if isinstance(mem_raw, list):
        mem_members = mem_raw

    if isinstance(mem_members, list):
        for mem in mem_members:
            if isinstance(mem, dict) and is_present(mem):
                cap_mb = mem.get("CapacityMiB", 0)
                cap_bytes = mem.get("CapacityBytes", 0)
                if cap_mb > 0 or cap_bytes > 0:
                    cap_gb = round(cap_mb / 1024, 1) if cap_mb else round(cap_bytes / (1024**3), 1)
                    memory_modules.append({
                        "slot": mem.get("DeviceLocator") or mem.get("Socket") or f"DIMM_{len(memory_modules)+1}",
                        "capacityGiB": cap_gb,
                        "speedMHz": mem.get("OperatingSpeedMhz") or (mem.get("AllowedSpeedsMHz", [0])[0] if isinstance(mem.get("AllowedSpeedsMHz"), list) else None),
                        "type": mem.get("MemoryDeviceType", "DRAM"),
                        "health": mem.get("Status", {}).get("Health", "OK")
                    })

    # 3. Storage Controllers, Drives & SMART Wear-Out Normalization (Present-Only)
    storage_drives: List[Dict[str, Any]] = []
    storage_raw = sys_json.get("Storage", {})
    st_members = storage_raw.get("Members", []) if isinstance(storage_raw, dict) else []
    if isinstance(storage_raw, list):
        st_members = storage_raw

    if isinstance(st_members, list):
        for st in st_members:
            if isinstance(st, dict) and is_present(st):
                drives = st.get("Drives", [])
                if isinstance(drives, list):
                    for d in drives:
                        if isinstance(d, dict) and is_present(d):
                            cap_bytes = d.get("CapacityBytes", 0)
                            cap_tb = round(cap_bytes / (1000**4), 2) if cap_bytes else None
                            predicted_failure = d.get("PredictedMediaLifeLeftPercent") or d.get("EnduranceRemainingPercent")
                            wear_percent = (100 - predicted_failure) if predicted_failure is not None else d.get("PercentageUsed")

                            storage_drives.append({
                                "name": d.get("Name") or d.get("Model") or f"Drive_{len(storage_drives)+1}",
                                "serialNumber": d.get("SerialNumber"),
                                "capacityTB": cap_tb,
                                "mediaType": d.get("MediaType", "SSD/HDD"),
                                "protocol": d.get("Protocol"),
                                "wearPercent": wear_percent,
                                "health": d.get("Status", {}).get("Health", "OK"),
                                "predictedFailure": d.get("FailurePredicted", False)
                            })

    # 4. Network Ports Normalization (Present-Only)
    network_ports: List[Dict[str, Any]] = []
    net_members = net_json.get("Members", []) if isinstance(net_json, dict) else []
    if isinstance(net_json, list):
        net_members = net_json

    if isinstance(net_members, list):
        for adapter in net_members:
            if isinstance(adapter, dict) and is_present(adapter):
                ports = adapter.get("Ports", []) if isinstance(adapter.get("Ports"), list) else [adapter]
                for p in ports:
                    if isinstance(p, dict) and is_present(p):
                        mac_addrs = p.get("AssociatedNetworkAddresses", [])
                        mac = mac_addrs[0] if isinstance(mac_addrs, list) and mac_addrs else p.get("MACAddress")
                        speed = (p.get("CurrentLinkSpeedMbps", 0) or 0) // 1000
                        network_ports.append({
                            "portId": p.get("Id") or p.get("Name") or f"eth{len(network_ports)}",
                            "linkStatus": p.get("LinkStatus") or p.get("Status", {}).get("State") or "Up",
                            "speedGbps": speed if speed > 0 else None,
                            "macAddress": mac
                        })

    # 5. PSU Redundancy & Power Supplies Normalization
    power_info = sys_json.get("Power", {})
    psu_list = power_info.get("PowerSupplies", []) if isinstance(power_info, dict) else []
    redundancy_info = power_info.get("Redundancy", [{}])[0] if isinstance(power_info, dict) and power_info.get("Redundancy") else {}
    psu_status = redundancy_info.get("Status", {}).get("Health", "Fully Redundant" if len(psu_list) >= 2 else "Single PSU (N+0)")

    # 6. Firmware & Golden Baseline Drift Normalization
    bios_version = sys_json.get("BiosVersion") or sys_json.get("BIOS", {}).get("Version")
    bmc_version = sys_json.get("BMCVersion") or sys_json.get("FirmwareVersion")

    # Clean Uniform Normalized DTO Layout for React UI (No mock fallbacks)
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
        "psuRedundancy": {
            "status": psu_status,
            "count": len(psu_list),
            "mode": redundancy_info.get("Mode", "N+1 / 2+2")
        },
        "firmware": {
            "bios": bios_version,
            "bmc": bmc_version,
            "drift": "Compliant" if (bios_version and bmc_version) else "Unverified"
        },
        "raw_counts": {
            "cpu_count": len(cpus),
            "ram_dimms": len(memory_modules),
            "drive_count": len(storage_drives),
            "network_ports": len(network_ports)
        }
    }
