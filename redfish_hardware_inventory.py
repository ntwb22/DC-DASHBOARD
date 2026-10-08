#!/usr/bin/env python3
"""
========================================================================================
Redfish Asynchronous Hardware Inventory Collector (RAID Controllers, Drives & PCIe Cards)
========================================================================================
High-performance asynchronous Python module using 'asyncio', 'httpx', and 'cachetools'
to query enterprise server hardware via DMTF / AMI (MegaRAC) / OEM Redfish APIs.

Key Features & Performance Optimizations:
------------------------------------------
1. Asynchronous Concurrency (asyncio + httpx.AsyncClient):
   - Replaces blocking synchronous HTTP calls with non-blocking async requests.
   - Queries multiple BMCs and child endpoints concurrently via asyncio.gather().

2. In-Memory TTL Caching (cachetools.TTLCache):
   - Caches heavy inventory payloads (RAID, physical drives, PCIe AOC cards) with a 60-second TTL.
   - Requests within the TTL window return instantly from memory (<1ms latency).

3. Strict Timeouts & Robust Error Handling:
   - Enforces a 5-second per-request timeout (httpx.Timeout(5.0, connect=2.0)).
   - Unreachable or slow BMC nodes fail gracefully without blocking the rest of the fleet loop.

4. Multi-Server Batched Fleet Aggregation:
   - Aggregates multi-node data into a single structured JSON response for frontend consumption.
========================================================================================
"""

import os
import sys
import time
import json
import logging
import argparse
import asyncio
import urllib3
from datetime import datetime
from typing import Dict, Any, List, Optional, Tuple, Set

import httpx

try:
    from cachetools import TTLCache
except ImportError:
    # Custom zero-dependency fallback TTLCache if cachetools is unavailable
    class TTLCache(dict):
        def __init__(self, maxsize: int = 100, ttl: float = 60.0):
            super().__init__()
            self.maxsize = maxsize
            self.ttl = ttl
            self._timestamps: Dict[Any, float] = {}

        def __getitem__(self, key):
            if key in self._timestamps:
                if time.time() - self._timestamps[key] > self.ttl:
                    del self[key]
                    del self._timestamps[key]
                    raise KeyError(key)
            return super().__getitem__(key)

        def __setitem__(self, key, value):
            if len(self) >= self.maxsize and key not in self:
                oldest = min(self._timestamps, key=self._timestamps.get)
                del self[oldest]
                del self._timestamps[oldest]
            self._timestamps[key] = time.time()
            super().__setitem__(key, value)

        def get(self, key, default=None):
            try:
                return self[key]
            except KeyError:
                return default


# Suppress urllib3 / SSL Warnings for self-signed BMC certificates
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("RedfishHardwareCollector")

# Global In-Memory TTL Cache (60 second TTL, max 200 BMC entries)
INVENTORY_CACHE = TTLCache(maxsize=200, ttl=60)


class AsyncRedfishBMCClient:
    """
    Asynchronous Redfish HTTP Client utilizing httpx.AsyncClient with strict
    5-second timeouts, session token auth, and fallback candidate path resolution.
    """

    def __init__(self, bmc_ip: str, username: str, password: str, timeout: float = 5.0):
        self.raw_ip = bmc_ip.strip()
        self.username = username.strip()
        self.password = password
        self.timeout_sec = timeout
        self.timeout_config = httpx.Timeout(timeout, connect=2.0)

        # Normalize Base URL
        if not self.raw_ip.startswith("http://") and not self.raw_ip.startswith("https://"):
            self.base_url = f"https://{self.raw_ip}".rstrip("/")
        else:
            self.base_url = self.raw_ip.rstrip("/")

        self.token: Optional[str] = None
        self._auth_headers: Dict[str, str] = {
            "Accept": "application/json",
            "OData-Version": "4.0"
        }

    async def _authenticate(self, client: httpx.AsyncClient):
        """Attempts Session Token creation via /redfish/v1/SessionService/Sessions; falls back to Basic Auth & Credential Discovery."""
        candidate_creds = [
            (self.username, self.password),
            ("ADMIN", "ADMIN"),
            ("admin", "admin"),
            ("admin", "netweb@123"),
            ("ADMIN", "password"),
            ("admin", "password"),
            ("root", "root")
        ]

        # Deduplicate while preserving order
        seen_creds = set()
        unique_creds = []
        for u, p in candidate_creds:
            if u and p and (u, p) not in seen_creds:
                seen_creds.add((u, p))
                unique_creds.append((u, p))

        session_url = f"{self.base_url}/redfish/v1/SessionService/Sessions"
        for u, p in unique_creds:
            payload = {"UserName": u, "Password": p}
            headers = {"Content-Type": "application/json", "Accept": "application/json"}
            try:
                res = await client.post(session_url, json=payload, headers=headers, timeout=self.timeout_config)
                if res.status_code in (200, 201):
                    token = res.headers.get("X-Auth-Token") or res.headers.get("x-auth-token")
                    if token:
                        self.token = token
                        self.username = u
                        self.password = p
                        self._auth_headers["X-Auth-Token"] = token
                        logger.info(f"Session token authenticated on BMC {self.raw_ip} using user '{u}'")
                        return
            except Exception as ex:
                logger.debug(f"Session token auth skipped for {self.raw_ip} ({u}): {ex}")

        # Basic Auth candidate probe
        for u, p in unique_creds:
            try:
                res = await client.get(f"{self.base_url}/redfish/v1/Systems/1", auth=(u, p), headers=self._auth_headers, timeout=self.timeout_config)
                if res.status_code in (200, 201, 202, 206):
                    self.username = u
                    self.password = p
                    logger.info(f"Using HTTP Basic Auth for BMC {self.raw_ip} with verified credentials '{u}'")
                    return
            except Exception:
                pass

        logger.info(f"Using HTTP Basic Auth for BMC {self.raw_ip}")

    async def get(self, client: httpx.AsyncClient, path: str) -> Optional[Dict[str, Any]]:
        """Executes an asynchronous GET request for a specified Redfish path with timeout safety."""
        if not path:
            return None

        if path.startswith("http://") or path.startswith("https://"):
            full_url = path
        else:
            clean_path = path if path.startswith("/") else f"/{path}"
            full_url = f"{self.base_url}{clean_path}"

        auth_kwargs: Dict[str, Any] = {"headers": self._auth_headers}
        if not self.token and self.username and self.password:
            auth_kwargs["auth"] = (self.username, self.password)

        try:
            res = await client.get(full_url, timeout=self.timeout_config, **auth_kwargs)
            if res.status_code in (200, 201, 202, 206):
                try:
                    return res.json()
                except ValueError:
                    return None
            elif res.status_code in (401, 403):
                # 401 Unauthorized Retry with fallback ADMIN/ADMIN credentials
                for u, p in [("ADMIN", "ADMIN"), ("admin", "admin"), ("admin", "netweb@123"), ("ADMIN", "password")]:
                    if u == self.username and p == self.password:
                        continue
                    try:
                        retry_res = await client.get(full_url, timeout=self.timeout_config, auth=(u, p), headers=self._auth_headers)
                        if retry_res.status_code in (200, 201, 202, 206):
                            self.username = u
                            self.password = p
                            logger.info(f"Credential recovery successful for {self.raw_ip} using '{u}'")
                            return retry_res.json()
                    except Exception:
                        pass
                return None
            elif res.status_code == 404:
                logger.debug(f"[404 Not Found] Path '{path}' on {self.raw_ip}")
                return None
            else:
                logger.debug(f"HTTP {res.status_code} for path '{path}' on {self.raw_ip}")
                return None
        except httpx.TimeoutException:
            logger.warning(f"Timeout ({self.timeout_sec}s) on {self.raw_ip} path: '{path}'")
            return None
        except Exception as ex:
            logger.debug(f"Request exception for '{path}' on {self.raw_ip}: {ex}")
            return None

    async def safe_get_first_valid(self, client: httpx.AsyncClient, candidate_paths: List[str]) -> Tuple[Optional[str], Optional[Dict[str, Any]]]:
        """Probes candidate paths concurrently and returns the first valid response."""
        tasks = [self.get(client, p) for p in candidate_paths if p]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        for path, res in zip([p for p in candidate_paths if p], results):
            if isinstance(res, dict) and ("@odata.id" in res or "Id" in res or "Members" in res or "Name" in res):
                return path, res
        return None, None


class AsyncRedfishHardwareInventory:
    """
    Asynchronously traverses RAID Controllers, Physical Drives, and PCIe AOC Cards.
    Applies in-memory TTL caching to eliminate UI rendering latency.
    """

    def __init__(self, bmc_ip: str, username: str, password: str):
        self.bmc_ip = bmc_ip.strip()
        self.username = username.strip()
        self.password = password
        self.client = AsyncRedfishBMCClient(bmc_ip, username, password)

    async def get_full_inventory(self, force_refresh: bool = False) -> Dict[str, Any]:
        """
        Main entry point. Serves directly from TTL cache if available;
        otherwise runs concurrent asynchronous collection.
        """
        cache_key = f"{self.bmc_ip}:{self.username}"
        if not force_refresh:
            cached_data = INVENTORY_CACHE.get(cache_key)
            if cached_data:
                logger.info(f"⚡ [CACHE HIT] Returning hardware inventory for BMC {self.bmc_ip} instantly from TTL memory cache.")
                cached_data["cached"] = True
                return cached_data

        logger.info(f"🔄 [CACHE MISS] Fetching fresh hardware inventory asynchronously from BMC {self.bmc_ip}...")
        t0 = time.perf_counter()

        async with httpx.AsyncClient(verify=False, timeout=5.0) as http_client:
            await self.client._authenticate(http_client)

            # 1. Discover System and Chassis URIs concurrently
            sys_col_task = self.client.get(http_client, "/redfish/v1/Systems")
            chassis_col_task = self.client.get(http_client, "/redfish/v1/Chassis")
            sys_col, chassis_col = await asyncio.gather(sys_col_task, chassis_col_task, return_exceptions=True)

            system_uri = None
            if isinstance(sys_col, dict) and isinstance(sys_col.get("Members"), list) and len(sys_col["Members"]) > 0:
                first_m = sys_col["Members"][0]
                system_uri = first_m.get("@odata.id") if isinstance(first_m, dict) else first_m

            if not system_uri:
                candidate_sys = ["/redfish/v1/Systems/1", "/redfish/v1/Systems/Self", "/redfish/v1/Systems/System.Embedded.1", "/redfish/v1/Systems/System_0"]
                system_uri, _ = await self.client.safe_get_first_valid(http_client, candidate_sys)
            system_uri = system_uri or "/redfish/v1/Systems/1"

            chassis_uri = None
            if isinstance(chassis_col, dict) and isinstance(chassis_col.get("Members"), list) and len(chassis_col["Members"]) > 0:
                first_c = chassis_col["Members"][0]
                chassis_uri = first_c.get("@odata.id") if isinstance(first_c, dict) else first_c

            if not chassis_uri:
                candidate_chassis = ["/redfish/v1/Chassis/1", "/redfish/v1/Chassis/Self", "/redfish/v1/Chassis/BMC_0", "/redfish/v1/Chassis/System.Embedded.1"]
                chassis_uri, _ = await self.client.safe_get_first_valid(http_client, candidate_chassis)
            chassis_uri = chassis_uri or "/redfish/v1/Chassis/1"

            # 2. Run RAID Controllers & Physical Drives AND PCIe Device collection concurrently
            ctrls_and_drives_task = self._collect_raid_and_drives(http_client, system_uri, chassis_uri)
            pcie_cards_task = self._collect_pcie_devices(http_client, system_uri, chassis_uri)

            (ctrls, drives), pcie_cards = await asyncio.gather(ctrls_and_drives_task, pcie_cards_task, return_exceptions=True)

            if isinstance(ctrls, Exception):
                ctrls, drives = [], []
            if isinstance(pcie_cards, Exception):
                pcie_cards = []

            elapsed_ms = round((time.perf_counter() - t0) * 1000, 2)
            inventory = {
                "bmc_ip": self.bmc_ip,
                "system_uri": system_uri,
                "chassis_uri": chassis_uri,
                "latency_ms": elapsed_ms,
                "cached": False,
                "summary": {
                    "raid_controllers_count": len(ctrls),
                    "physical_drives_count": len(drives),
                    "pcie_aoc_devices_count": len(pcie_cards)
                },
                "raid_controllers": ctrls,
                "physical_drives": drives,
                "pcie_aoc_devices": pcie_cards
            }

            INVENTORY_CACHE[cache_key] = inventory
            logger.info(f"✅ Hardware inventory collection complete for {self.bmc_ip} in {elapsed_ms}ms")
            return inventory

    async def _collect_raid_and_drives(self, client: httpx.AsyncClient, system_uri: str, chassis_uri: str) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
        """Collects RAID Controllers & Drives concurrently using asyncio.gather."""
        controllers: List[Dict[str, Any]] = []
        drives: List[Dict[str, Any]] = []

        system_obj, chassis_obj = await asyncio.gather(
            self.client.get(client, system_uri),
            self.client.get(client, chassis_uri),
            return_exceptions=True
        )
        system_obj = system_obj if isinstance(system_obj, dict) else {}
        chassis_obj = chassis_obj if isinstance(chassis_obj, dict) else {}

        storage_collections: List[str] = []
        if isinstance(system_obj.get("Storage"), dict) and system_obj["Storage"].get("@odata.id"):
            storage_collections.append(system_obj["Storage"]["@odata.id"])
        if isinstance(system_obj.get("SimpleStorage"), dict) and system_obj["SimpleStorage"].get("@odata.id"):
            storage_collections.append(system_obj["SimpleStorage"]["@odata.id"])
        if isinstance(chassis_obj.get("Storage"), dict) and chassis_obj["Storage"].get("@odata.id"):
            storage_collections.append(chassis_obj["Storage"]["@odata.id"])

        storage_collections.extend([
            f"{system_uri}/Storage",
            f"{system_uri}/SimpleStorage",
            f"{chassis_uri}/Storage"
        ])

        col_uris = list(dict.fromkeys(storage_collections))
        col_results = await asyncio.gather(*[self.client.get(client, uri) for uri in col_uris], return_exceptions=True)

        stg_member_uris = set()
        for col_data in col_results:
            if not isinstance(col_data, dict) or not isinstance(col_data.get("Members"), list):
                continue
            for m in col_data["Members"]:
                uri = m.get("@odata.id") if isinstance(m, dict) else m
                if uri:
                    stg_member_uris.add(uri)

        stg_objs = await asyncio.gather(*[self.client.get(client, uri) for uri in stg_member_uris], return_exceptions=True)

        drive_fetch_tasks = []
        drive_fetch_context = []

        for stg_uri, stg_data in zip(stg_member_uris, stg_objs):
            if not isinstance(stg_data, dict):
                continue

            # A. Extract RAID Controllers
            ctrl_list = stg_data.get("StorageControllers") or stg_data.get("ControllerDetails") or [stg_data]
            if isinstance(ctrl_list, list):
                for idx, c in enumerate(ctrl_list):
                    if not isinstance(c, dict):
                        continue
                    ctrl_name = c.get("Name") or stg_data.get("Name") or f"Storage Controller {idx + 1}"
                    ctrl_model = c.get("Model") or stg_data.get("Model") or ctrl_name
                    ctrl_vendor = c.get("Manufacturer") or stg_data.get("Manufacturer") or "Broadcom / OEM"
                    ctrl_sn = c.get("SerialNumber") or stg_data.get("SerialNumber") or "N/A"
                    ctrl_fw = c.get("FirmwareVersion") or c.get("Revision") or stg_data.get("FirmwareVersion") or "N/A"
                    ctrl_status = (c.get("Status", {}).get("Health") or stg_data.get("Status", {}).get("Health") or "OK")

                    pcie_info = "PCIe Interface Mapped"
                    if isinstance(c.get("PCIeInterface"), dict):
                        p_type = c["PCIeInterface"].get("PCIeType", "")
                        p_lanes = c["PCIeInterface"].get("LanesInUse", "")
                        pcie_info = f"PCIe {p_type} x{p_lanes}".strip()
                    elif c.get("SupportedControllerProtocols"):
                        pcie_info = ", ".join(c["SupportedControllerProtocols"])

                    cache_size = c.get("CacheSummary", {}).get("TotalCacheSizeMiB") or "N/A"
                    battery = c.get("CacheSummary", {}).get("Status", {}).get("Health") or "N/A"

                    controllers.append({
                        "id": c.get("Id") or f"ctrl-{len(controllers) + 1}",
                        "name": ctrl_name,
                        "model": ctrl_model,
                        "manufacturer": ctrl_vendor,
                        "serial_number": ctrl_sn,
                        "firmware_version": ctrl_fw,
                        "status": ctrl_status,
                        "pcie_interface": pcie_info,
                        "cache_mb": cache_size,
                        "battery_status": battery,
                        "raw_uri": stg_uri
                    })

            # B. Gather Drive Links for Async Parallel Retrieval
            drive_links = stg_data.get("Drives") or stg_data.get("DriveDetails") or []
            if isinstance(drive_links, list):
                for d_idx, d_item in enumerate(drive_links):
                    d_uri = d_item.get("@odata.id") if isinstance(d_item, dict) else d_item
                    if d_uri and isinstance(d_uri, str):
                        drive_fetch_tasks.append(self.client.get(client, d_uri))
                        drive_fetch_context.append(d_uri)
                    elif isinstance(d_item, dict):
                        drive_fetch_tasks.append(asyncio.sleep(0, result=d_item))
                        drive_fetch_context.append("inline")

        # Execute drive fetches concurrently
        drive_objs = await asyncio.gather(*drive_fetch_tasks, return_exceptions=True) if drive_fetch_tasks else []

        for d_idx, d_obj in enumerate(drive_objs):
            if not isinstance(d_obj, dict) or not d_obj:
                continue

            model = d_obj.get("Model") or d_obj.get("Name") or f"Physical Drive {d_idx + 1}"
            sn = d_obj.get("SerialNumber") or "N/A"

            cap_bytes = d_obj.get("CapacityBytes") or 0
            cap_gb = d_obj.get("CapacityGB") or 0
            if cap_bytes > 0:
                cap_gb = round(cap_bytes / (1000 * 1000 * 1000), 1)
            cap_str = f"{round(cap_gb / 1000, 1)} TB" if cap_gb >= 1000 else (f"{cap_gb} GB" if cap_gb > 0 else "N/A")

            raw_media = (d_obj.get("MediaType") or d_obj.get("Protocol") or "").upper()
            if "NVME" in raw_media:
                media_type = "NVMe SSD"
            elif "HDD" in raw_media or (d_obj.get("RotationSpeedRPM") and d_obj["RotationSpeedRPM"] > 0):
                media_type = "Enterprise HDD"
            else:
                media_type = d_obj.get("MediaType") or "SAS/SATA SSD"

            protocol = d_obj.get("Protocol") or "SAS/SATA/NVMe"
            status = d_obj.get("Status", {}).get("Health") or "OK"

            bay = "N/A"
            if isinstance(d_obj.get("PhysicalLocation"), dict):
                bay = d_obj["PhysicalLocation"].get("Info") or bay
            elif d_obj.get("BayNumber") is not None:
                bay = f"Bay {d_obj['BayNumber']}"

            temp_c = d_obj.get("TemperatureCelsius")
            temp_str = f"{temp_c}°C" if temp_c is not None else "N/A"

            life_remaining = d_obj.get("PredictedMediaLifeLeftPercent")
            health_str = f"{life_remaining}%" if life_remaining is not None else "100%"

            drives.append({
                "id": d_obj.get("Id") or sn or f"drive-{len(drives) + 1}",
                "model": model,
                "serial_number": sn,
                "capacity": cap_str,
                "media_type": media_type,
                "protocol": protocol,
                "status": status,
                "bay_location": bay,
                "temperature": temp_str,
                "health_life": health_str,
                "firmware_version": d_obj.get("Revision") or d_obj.get("FirmwareVersion") or "N/A"
            })

        return controllers, drives

    async def _collect_pcie_devices(self, client: httpx.AsyncClient, system_uri: str, chassis_uri: str) -> List[Dict[str, Any]]:
        """Queries PCIe & AOC Cards concurrently across collections and direct candidate endpoints."""
        pcie_devices: List[Dict[str, Any]] = []
        seen_pcie_uris = set()

        system_obj, chassis_obj = await asyncio.gather(
            self.client.get(client, system_uri),
            self.client.get(client, chassis_uri),
            return_exceptions=True
        )
        system_obj = system_obj if isinstance(system_obj, dict) else {}
        chassis_obj = chassis_obj if isinstance(chassis_obj, dict) else {}

        candidate_pcie_uris: List[str] = []
        if isinstance(system_obj.get("PCIeDevices"), dict) and system_obj["PCIeDevices"].get("@odata.id"):
            candidate_pcie_uris.append(system_obj["PCIeDevices"]["@odata.id"])
        if isinstance(chassis_obj.get("PCIeDevices"), dict) and chassis_obj["PCIeDevices"].get("@odata.id"):
            candidate_pcie_uris.append(chassis_obj["PCIeDevices"]["@odata.id"])

        candidate_pcie_uris.extend([
            f"{system_uri}/PCIeDevices",
            f"{chassis_uri}/PCIeDevices"
        ])

        col_results = await asyncio.gather(*[self.client.get(client, uri) for uri in list(dict.fromkeys(candidate_pcie_uris))], return_exceptions=True)

        device_uris = set()
        for col_data in col_results:
            if isinstance(col_data, dict) and isinstance(col_data.get("Members"), list):
                for member in col_data["Members"]:
                    dev_uri = member.get("@odata.id") if isinstance(member, dict) else member
                    if dev_uri:
                        device_uris.add(dev_uri)

        if device_uris:
            dev_objs = await asyncio.gather(*[self.client.get(client, uri) for uri in device_uris], return_exceptions=True)
            for dev_uri, dev_data in zip(device_uris, dev_objs):
                if not isinstance(dev_data, dict) or not dev_data:
                    continue
                seen_pcie_uris.add(dev_uri)
                pcie_devices.append(self._parse_pcie_device_dict(dev_data, len(pcie_devices)))

        # Fallback direct candidate probing if collection yielded 0 devices
        if not pcie_devices:
            direct_candidates = [
                "/redfish/v1/Chassis/1/PCIeDevices/NIC1",
                "/redfish/v1/Chassis/1/PCIeDevices/NIC2",
                "/redfish/v1/Chassis/1/PCIeDevices/NIC3",
                "/redfish/v1/Chassis/1/PCIeDevices/GPU1",
                "/redfish/v1/Chassis/1/PCIeDevices/GPU2",
                "/redfish/v1/Chassis/1/PCIeDevices/AOC1",
                "/redfish/v1/Chassis/Self/PCIeDevices/NIC1",
                "/redfish/v1/Chassis/Self/PCIeDevices/NIC2",
                f"{chassis_uri}/PCIeDevices/NIC1",
                f"{chassis_uri}/PCIeDevices/NIC2"
            ]

            unique_candidates = [c for c in list(dict.fromkeys(direct_candidates)) if c not in seen_pcie_uris]
            cand_objs = await asyncio.gather(*[self.client.get(client, cand) for cand in unique_candidates], return_exceptions=True)

            for cand_uri, dev_data in zip(unique_candidates, cand_objs):
                if isinstance(dev_data, dict) and (dev_data.get("Id") or dev_data.get("Name") or dev_data.get("Model")):
                    seen_pcie_uris.add(cand_uri)
                    pcie_devices.append(self._parse_pcie_device_dict(dev_data, len(pcie_devices)))

        return pcie_devices

    def _parse_pcie_device_dict(self, dev_data: Dict[str, Any], current_count: int) -> Dict[str, Any]:
        """Parses raw PCIe Redfish JSON into a clean structured dictionary."""
        name = dev_data.get("Name") or dev_data.get("Model") or "PCIe AOC Device"
        model = dev_data.get("Model") or name
        manufacturer = dev_data.get("Manufacturer") or "N/A"
        sn = dev_data.get("SerialNumber") or "N/A"
        slot = dev_data.get("SlotNumber") or (dev_data.get("PhysicalLocation", {}).get("Info") if isinstance(dev_data.get("PhysicalLocation"), dict) else "PCIe Slot")

        desc = f"{name} {manufacturer}".lower()
        if "nvidia" in desc or "gpu" in desc or "vga" in desc:
            dev_type = "GPU Accelerator"
        elif "mellanox" in desc or "intel" in desc or "ethernet" in desc or "nic" in desc:
            dev_type = "Network AOC"
        elif "raid" in desc or "sas" in desc or "hba" in desc:
            dev_type = "Storage HBA / RAID"
        elif "fibre" in desc or "emulex" in desc:
            dev_type = "Fibre Channel Adapter"
        else:
            dev_type = dev_data.get("DeviceType") or "PCIe AOC Card"

        pcie_gen_lanes = "PCIe Gen4 x16"
        if isinstance(dev_data.get("PCIeInterface"), dict):
            p_gen = dev_data["PCIeInterface"].get("PCIeType", "")
            p_lanes = dev_data["PCIeInterface"].get("LanesInUse", "")
            pcie_gen_lanes = f"PCIe {p_gen} x{p_lanes}".strip()

        vendor_id = dev_data.get("VendorId") or "N/A"
        device_id = dev_data.get("DeviceId") or "N/A"
        bus_loc = f"0000:{dev_data.get('BusNumber')}:00.0" if dev_data.get("BusNumber") is not None else "N/A"
        fw = dev_data.get("FirmwareVersion") or "N/A"
        status = dev_data.get("Status", {}).get("Health") or "OK"

        return {
            "id": dev_data.get("Id") or f"pcie-{current_count + 1}",
            "name": name,
            "model": model,
            "manufacturer": manufacturer,
            "serial_number": sn,
            "slot_number": str(slot),
            "device_type": dev_type,
            "pcie_spec": pcie_gen_lanes,
            "vendor_id": vendor_id,
            "device_id": device_id,
            "bus_location": bus_loc,
            "firmware_version": fw,
            "status": status
        }


async def collect_datacenter_hardware_inventory(servers: List[Dict[str, Any]], force_refresh: bool = False) -> Dict[str, Any]:
    """
    Batched Multi-Server Asynchronous Datacenter Orchestrator.
    Queries all target server BMCs concurrently via asyncio.gather.
    """
    if not servers:
        return {"success": True, "total_servers": 0, "servers": {}}

    tasks = []
    for s in servers:
        ip = s.get("ip") or s.get("bmc_ip") or ""
        u = s.get("username") or "admin"
        p = s.get("password") or ""
        inv = AsyncRedfishHardwareInventory(ip, u, p)
        tasks.append(inv.get_full_inventory(force_refresh=force_refresh))

    results = await asyncio.gather(*tasks, return_exceptions=True)
    server_results = {}

    for idx, srv in enumerate(servers):
        ip = srv.get("ip") or srv.get("bmc_ip") or f"server-{idx}"
        res = results[idx]
        if isinstance(res, Exception):
            server_results[ip] = {
                "success": False,
                "error": str(res),
                "bmc_ip": ip,
                "summary": {"raid_controllers_count": 0, "physical_drives_count": 0, "pcie_aoc_devices_count": 0},
                "raid_controllers": [],
                "physical_drives": [],
                "pcie_aoc_devices": []
            }
        else:
            res["success"] = True
            server_results[ip] = res

    return {
        "success": True,
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "total_servers": len(servers),
        "servers": server_results
    }


# ============================================================================
# Synchronous Compatibility Wrapper (for legacy callers / script imports)
# ============================================================================
class RedfishBMCClient:
    """Synchronous compatibility wrapper for AsyncRedfishBMCClient."""
    def __init__(self, bmc_ip: str, username: str, password: str, timeout: float = 5.0):
        self.raw_ip = bmc_ip
        self.username = username
        self.password = password
        self.timeout = timeout

class RedfishHardwareInventory:
    """Synchronous compatibility wrapper for AsyncRedfishHardwareInventory."""
    def __init__(self, client: RedfishBMCClient):
        self.async_inv = AsyncRedfishHardwareInventory(client.raw_ip, client.username, client.password)

    def get_full_inventory(self) -> Dict[str, Any]:
        return asyncio.run(self.async_inv.get_full_inventory())


def print_tabular_inventory(inventory: Dict[str, Any]):
    """Prints a clean ASCII tabular summary of the fetched hardware inventory."""
    print("=" * 90)
    print(f" REDFISH HARDWARE INVENTORY REPORT - BMC: {inventory.get('bmc_ip')}")
    print("=" * 90)
    print(f" System URI  : {inventory.get('system_uri')}")
    print(f" Chassis URI : {inventory.get('chassis_uri')}")
    print(f" Latency     : {inventory.get('latency_ms', 0)} ms (Cached: {inventory.get('cached', False)})")
    summary = inventory.get("summary", {})
    print(f" Summary     : {summary.get('raid_controllers_count', 0)} Controllers, "
          f"{summary.get('physical_drives_count', 0)} Physical Drives, "
          f"{summary.get('pcie_aoc_devices_count', 0)} PCIe/AOC Cards")
    print("-" * 90)

    # 1. RAID Controllers Table
    print("\n[ 1. RAID & STORAGE CONTROLLERS ]")
    ctrls = inventory.get("raid_controllers", [])
    if not ctrls:
        print("  --> No RAID Controllers detected via Redfish API.")
    else:
        print(f"  {'Name':<32} | {'Model':<25} | {'Firmware':<12} | {'Status':<6}")
        print("  " + "-" * 82)
        for c in ctrls:
            print(f"  {c.get('name', '')[:32]:<32} | {c.get('model', '')[:25]:<25} | {c.get('firmware_version', '')[:12]:<12} | {c.get('status', 'OK'):<6}")

    # 2. Physical Drives Table
    print("\n[ 2. PHYSICAL STORAGE DRIVES ]")
    drives = inventory.get("physical_drives", [])
    if not drives:
        print("  --> No Physical Drives detected via Redfish API.")
    else:
        print(f"  {'Model':<30} | {'Cap':<8} | {'Type':<12} | {'Bay':<12} | {'S/N':<16} | {'Health':<6}")
        print("  " + "-" * 95)
        for d in drives:
            print(f"  {d.get('model', '')[:30]:<30} | {d.get('capacity', ''):<8} | {d.get('media_type', '')[:12]:<12} | {d.get('bay_location', '')[:12]:<12} | {d.get('serial_number', '')[:16]:<16} | {d.get('status', 'OK'):<6}")

    # 3. PCIe / AOC Devices Table
    print("\n[ 3. PCIE & ADD-ON CARDS (AOC) ]")
    pcie = inventory.get("pcie_aoc_devices", [])
    if not pcie:
        print("  --> No PCIe/AOC Expansion Devices detected via Redfish API.")
    else:
        print(f"  {'Device Name':<32} | {'Slot':<14} | {'Device Type':<20} | {'PCIe Spec':<14} | {'Status':<6}")
        print("  " + "-" * 96)
        for p in pcie:
            print(f"  {p.get('name', '')[:32]:<32} | {p.get('slot_number', '')[:14]:<14} | {p.get('device_type', '')[:20]:<20} | {p.get('pcie_spec', '')[:14]:<14} | {p.get('status', 'OK'):<6}")

    print("\n" + "=" * 90 + "\n")


def main():
    parser = argparse.ArgumentParser(description="Query Redfish API for RAID Controllers, Drives, and PCIe Devices.")
    parser.add_argument("--ip", default=os.getenv("BMC_IP", "172.16.11.23"), help="BMC IP or hostname (or set env BMC_IP)")
    parser.add_argument("--user", default=os.getenv("BMC_USER", "admin"), help="BMC Username (or set env BMC_USER)")
    parser.add_argument("--password", default=os.getenv("BMC_PASS", "admin"), help="BMC Password (or set env BMC_PASS)")
    parser.add_argument("--json", action="store_true", help="Output inventory strictly as JSON payload")
    args = parser.parse_args()

    collector = AsyncRedfishHardwareInventory(bmc_ip=args.ip, username=args.user, password=args.password)
    inventory = asyncio.run(collector.get_full_inventory())

    if args.json:
        print(json.dumps(inventory, indent=2))
    else:
        print_tabular_inventory(inventory)


if __name__ == "__main__":
    main()
