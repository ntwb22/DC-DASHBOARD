"""
Tyrone Pro Server Decoupled Asynchronous State Machine Backend Service
========================================================================
High-performance, non-blocking Redfish monitoring microservice built using Python
(asyncio, httpx, asyncpg) and PostgreSQL JSONB.

Architecture Highlights:
  1. Multi-Tab Endpoint Coverage (24-Hour Cycle):
     Traverses System, Processors (with HGX GPU_0..GPU_7), Memory, BaseBoard/Chassis,
     Power, Thermal, PCIeDevices/PCIeFunctions, and Storage.
  2. Strict "Present-Only" Hardware Filtering:
     Strips out vacant slots, absent components (Status.State=="Absent"), zero-capacity items,
     and unpopulated sockets.
  3. Non-Blocking Startup & Instant UI Refresh (PostgreSQL Cache):
     Background tasks start immediately without blocking startup; GET /api/inventory serves
     strictly from PostgreSQL JSONB cache for zero lag and zero BMC socket exhaustion.
  4. Real-Time SSE Stream Ingestion & State Patching:
     Persistent GET streams to /redfish/v1/EventService/SSE with self-healing backoff.
     Critical events instantly patch server health in PostgreSQL JSONB.
  5. Concurrency & Asynchronous Persistence:
     asyncio.Semaphore(50), httpx.Timeout(5.0, connect=2.0), asyncpg connection pool (5..20),
     upsert queries (ON CONFLICT DO UPDATE).
"""

import asyncio
import logging
import urllib3
import httpx
import json
import random
import re
import os
import sys
from datetime import datetime
from typing import Dict, Any, List, Optional, Tuple, Set

from db import db
from normalizer import normalize_inventory

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# Configure logging format
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("RedfishDecoupledEngine")

# ============================================================================
# Module 1: Concurrency, Throttling & Network Optimization
# ============================================================================
MAX_CONCURRENT_REQUESTS: int = 50
GLOBAL_SEMAPHORE: asyncio.Semaphore = asyncio.Semaphore(MAX_CONCURRENT_REQUESTS)

# Tight httpx Timeout Configuration (5.0s read/write, 2.0s connect)
TIMEOUT_CONFIG: httpx.Timeout = httpx.Timeout(5.0, connect=2.0)

# Connection Pooling & Keep-Alive Limits
LIMITS_CONFIG: httpx.Limits = httpx.Limits(
    max_keepalive_connections=20,
    max_connections=MAX_CONCURRENT_REQUESTS,
    keepalive_expiry=30.0
)

# Global Session Token Cache: base_url -> token_str
SESSION_TOKEN_CACHE: Dict[str, str] = {}
HEARTBEAT_REGEX = re.compile(r"dummy|keep-?alive|heartbeat", re.IGNORECASE)

# Global Atomic UI Rendering Synchronization State Barrier
GLOBAL_SYNC_STATE: Dict[str, Any] = {
    "status": "SYNCING",
    "progress": 0,
    "completed_servers": 0,
    "total_servers": 0,
    "message": "Initial fleet inventory synchronization in progress across all servers"
}


def normalize_redfish_url(base_url: str, endpoint_or_path: str = "") -> str:
    """
    Guarantees a clean, single-domain Redfish URI without double-domain or duplicated scheme/host substrings.
    Fixes malformations like:
      - 'https://172.16.12.55https://172.16.12.55/redfish/v1/...' -> 'https://172.16.12.55/redfish/v1/...'
      - ('https://172.16.12.55', '/redfish/v1/SessionService/Sessions') -> 'https://172.16.12.55/redfish/v1/SessionService/Sessions'
    """
    from urllib.parse import urlparse
    if not base_url:
        base_url = "https://127.0.0.1"

    target = endpoint_or_path if (endpoint_or_path and endpoint_or_path.startswith("http")) else f"{base_url}/{endpoint_or_path.lstrip('/')}" if endpoint_or_path else base_url

    # Strip repeated http:// or https:// occurrences
    while "http://" in target[7:] or "https://" in target[8:]:
        last_http = target.rfind("http://")
        last_https = target.rfind("https://")
        last_idx = max(last_http, last_https)
        if last_idx > 0:
            target = target[last_idx:]
        else:
            break

    if not target.startswith(("http://", "https://")):
        target = f"https://{target.lstrip('/')}"

    parsed = urlparse(target)
    scheme = parsed.scheme or "https"
    netloc = parsed.netloc

    if not netloc and parsed.path:
        parts = parsed.path.lstrip("/").split("/", 1)
        netloc = parts[0]
        path = "/" + parts[1] if len(parts) > 1 else ""
    else:
        path = parsed.path

    path = "/" + path.lstrip("/") if path else ""
    query = f"?{parsed.query}" if parsed.query else ""
    fragment = f"#{parsed.fragment}" if parsed.fragment else ""

    return f"{scheme}://{netloc}{path}{query}{fragment}"


def build_clean_url(base_url: str, path: str) -> str:
    """Alias pointing to normalize_redfish_url for full backwards compatibility."""
    return normalize_redfish_url(base_url, path)


def rewrite_vendor_url(url: str, vendor: str) -> str:
    """Dynamically rewrites URL geometry for vendor-specific quirks."""
    if not url or vendor.upper() != "AS":
        return url
    rewritten = url
    rewritten = rewritten.replace("/Chassis/1/", "/Chassis/self/").replace("/chassis/1/", "/chassis/self/")
    rewritten = rewritten.replace("/Chassis/1", "/Chassis/self").replace("/chassis/1", "/chassis/self")
    rewritten = rewritten.replace("/Systems/1/", "/Systems/Self/").replace("/systems/1/", "/systems/self/")
    rewritten = rewritten.replace("/Systems/1", "/Systems/Self").replace("/systems/1", "/systems/self")
    return rewritten


async def fetch_with_401_retry(
    client: httpx.AsyncClient,
    base_url: str,
    path: str,
    username: str,
    password: str,
    vendor: str = "SM"
) -> Optional[httpx.Response]:
    """
    HTTP client execution wrapper that applies vendor URL rewriter, handles 401 Unauthorized,
    acquires a fresh X-Auth-Token via /redfish/v1/SessionService/Sessions, and retries the request.
    """
    target_path = rewrite_vendor_url(path, vendor)
    url = normalize_redfish_url(base_url, target_path)
    auth = (username, password)
    token = SESSION_TOKEN_CACHE.get(base_url)

    headers = {"Accept": "application/json"}
    if token:
        headers["X-Auth-Token"] = token

    try:
        auth_arg = None if token else auth
        resp = await client.get(url, auth=auth_arg, headers=headers, verify=False, timeout=TIMEOUT_CONFIG)

        if resp.status_code in (401, 403):
            logger.warning(f"[401/403] Intercepted on {url}. Refreshing Redfish session token...")
            session_endpoint = normalize_redfish_url(base_url, "/redfish/v1/SessionService/Sessions")
            payload = {"UserName": username, "Password": password}

            token_resp = await client.post(
                session_endpoint,
                json=payload,
                headers={"Content-Type": "application/json"},
                verify=False,
                timeout=TIMEOUT_CONFIG
            )
            if token_resp.status_code in (200, 201):
                new_token = token_resp.headers.get("X-Auth-Token") or token_resp.json().get("Token")
                if new_token:
                    SESSION_TOKEN_CACHE[base_url] = new_token
                    headers["X-Auth-Token"] = new_token
                    resp = await client.get(url, headers=headers, verify=False, timeout=TIMEOUT_CONFIG)

        return resp
    except Exception as e:
        logger.debug(f"HTTP query exception on {url}: {e}")
        return None


# ============================================================================
# Module 2: Multi-Tab Dynamic Discovery & Present-Only Ingestion
# ============================================================================
async def discover_system_uri(
    client: httpx.AsyncClient,
    base_url: str,
    username: str,
    password: str,
    vendor: str
) -> str:
    """
    Dynamically discovers System URIs from /redfish/v1/Systems.
    Supports standard layouts (/Systems/1, /Systems/Self) and HGX Baseboards (/Systems/HGX_Baseboard_0).
    """
    default_uri = "/redfish/v1/Systems/Self" if vendor == "AS" else "/redfish/v1/Systems/1"
    try:
        resp = await fetch_with_401_retry(client, base_url, "/redfish/v1/Systems", username, password, vendor)
        if resp and resp.status_code == 200:
            data = resp.json()
            members = data.get("Members", [])
            if isinstance(members, list) and len(members) > 0 and "@odata.id" in members[0]:
                discovered = members[0]["@odata.id"]
                logger.info(f"Discovered System URI: {discovered} for {base_url}")
                return discovered
    except Exception as e:
        logger.debug(f"Dynamic system discovery fallback on {base_url}: {e}")
    return default_uri


async def discover_chassis_uri(
    client: httpx.AsyncClient,
    base_url: str,
    username: str,
    password: str,
    vendor: str
) -> str:
    """Dynamically discovers Chassis URIs from /redfish/v1/Chassis."""
    default_uri = "/redfish/v1/Chassis/Self" if vendor == "AS" else "/redfish/v1/Chassis/1"
    try:
        resp = await fetch_with_401_retry(client, base_url, "/redfish/v1/Chassis", username, password, vendor)
        if resp and resp.status_code == 200:
            data = resp.json()
            members = data.get("Members", [])
            if isinstance(members, list) and len(members) > 0 and "@odata.id" in members[0]:
                discovered = members[0]["@odata.id"]
                logger.info(f"Discovered Chassis URI: {discovered} for {base_url}")
                return discovered
    except Exception as e:
        logger.debug(f"Dynamic chassis discovery fallback on {base_url}: {e}")
    return default_uri


async def fetch_multi_tab_inventory(client: httpx.AsyncClient, server: Dict[str, Any]) -> Dict[str, Any]:
    """
    Traverses and maps multi-tab Redfish endpoints concurrently:
      - System: /redfish/v1/Systems/{id}
      - Processors & HGX GPUs: /redfish/v1/Systems/{id}/Processors
      - Memory Controllers: /redfish/v1/Systems/{id}/Memory
      - Baseboard / Chassis: /redfish/v1/Chassis/{id}
      - Power: /redfish/v1/Chassis/{id}/Power
      - Thermal: /redfish/v1/Chassis/{id}/Thermal
      - PCIe Devices & Functions: /redfish/v1/Chassis/{id}/PCIeDevices
      - Storage: /redfish/v1/Systems/{id}/Storage
    Applies strict present-only filtering and persists into PostgreSQL JSONB.
    """
    server_id = server["id"]
    ip = server["ip"].lstrip("http://").lstrip("https://").strip()
    vendor = server.get("vendor", "SM").upper()
    username = server.get("username", "admin")
    password = server.get("password", "password")

    base_url = f"https://{ip}"

    try:
        sys_base_uri = await discover_system_uri(client, base_url, username, password, vendor)
        chassis_base_uri = await discover_chassis_uri(client, base_url, username, password, vendor)

        # Build Endpoints Map for Multi-Tab Coverage
        endpoints = {
            "sys_expand": f"{sys_base_uri}?$expand=.($levels=2)",
            "procs": f"{sys_base_uri}/Processors?$expand=.($levels=2)",
            "memory": f"{sys_base_uri}/Memory?$expand=.($levels=2)",
            "chassis": f"{chassis_base_uri}?$expand=.($levels=2)",
            "power": f"{chassis_base_uri}/Power",
            "thermal": f"{chassis_base_uri}/Thermal",
            "pcie": f"{chassis_base_uri}/PCIeDevices?$expand=.($levels=2)",
            "storage": f"{sys_base_uri}/Storage?$expand=.($levels=2)",
            "net": f"{chassis_base_uri}/NetworkAdapters?$expand=.($levels=3)"
        }

        # Query all requested multi-tab endpoints concurrently
        keys = list(endpoints.keys())
        req_coros = [fetch_with_401_retry(client, base_url, endpoints[k], username, password, vendor) for k in keys]
        responses = await asyncio.gather(*req_coros, return_exceptions=True)

        res_dict = {}
        for idx, k in enumerate(keys):
            r = responses[idx]
            if isinstance(r, httpx.Response) and r.status_code == 200:
                try: res_dict[k] = r.json()
                except Exception: res_dict[k] = {}
            else:
                res_dict[k] = {}

        # Fallback for primary System object if $expand query was rejected
        sys_json = res_dict.get("sys_expand") or {}
        if not sys_json:
            fallback_sys = await fetch_with_401_retry(client, base_url, sys_base_uri, username, password, vendor)
            if fallback_sys and fallback_sys.status_code == 200:
                sys_json = fallback_sys.json()

        # Merge Processors, Memory, Storage into System JSON structure
        if res_dict.get("procs") and isinstance(res_dict["procs"], dict):
            sys_json["Processors"] = res_dict["procs"]
        if res_dict.get("memory") and isinstance(res_dict["memory"], dict):
            sys_json["Memory"] = res_dict["memory"]
        if res_dict.get("storage") and isinstance(res_dict["storage"], dict):
            sys_json["Storage"] = res_dict["storage"]
        if res_dict.get("chassis") and isinstance(res_dict["chassis"], dict):
            sys_json["ChassisDetails"] = res_dict["chassis"]
        if res_dict.get("power") and isinstance(res_dict["power"], dict):
            sys_json["PowerDetails"] = res_dict["power"]
        if res_dict.get("thermal") and isinstance(res_dict["thermal"], dict):
            sys_json["ThermalDetails"] = res_dict["thermal"]
        if res_dict.get("pcie") and isinstance(res_dict["pcie"], dict):
            sys_json["PCIeDetails"] = res_dict["pcie"]

        net_json = res_dict.get("net") or {}

        # Save to PostgreSQL JSONB
        await db.save_server(
            server_id,
            server.get("name", f"Server-{ip}"),
            ip,
            vendor,
            username,
            password,
            server.get("rack", "Rack 1")
        )
        await db.save_raw_inventory(server_id, vendor, sys_json, net_json)

        # Extract explicit power state & reachability health
        p_state = sys_json.get("PowerState") or "On"
        h_status = sys_json.get("Status", {}).get("Health") or "OK"
        if p_state.lower() in ("off", "poweringoff"):
            p_state = "Off"

        await db.update_server_status(server_id, health=h_status, power_state=p_state)

        # Normalize with strict Present-Only filtering
        normalized = normalize_inventory(vendor, sys_json, net_json)
        normalized["id"] = server_id
        normalized["name"] = server.get("name", f"Tyrone Server ({ip})")
        normalized["ip"] = ip
        normalized["rack"] = server.get("rack", "Rack 1")
        normalized["healthStatus"] = h_status
        normalized["powerState"] = p_state
        normalized["is_online"] = p_state.lower() != "off" and h_status.lower() != "offline"
        normalized["status"] = "ONLINE" if normalized["is_online"] else ("POWER_OFF" if p_state == "Off" else "OFFLINE")
        normalized["last_seen"] = datetime.utcnow().isoformat() + "Z"

        logger.info(f" Successfully harvested multi-tab present inventory for {server_id} ({ip}) [Power: {p_state}]")
        return normalized
    except Exception as e:
        logger.error(f"Error harvesting inventory for server {server_id} ({ip}): {e}")
        await db.update_server_status(server_id, health="Offline", power_state="Unreachable")
        return {
            "id": server_id,
            "name": server.get("name", f"Tyrone Server ({ip})"),
            "ip": ip,
            "rack": server.get("rack", "Rack 1"),
            "error": str(e),
            "status": "OFFLINE",
            "healthStatus": "Offline",
            "powerState": "Unreachable",
            "is_online": False,
            "last_seen": datetime.utcnow().isoformat() + "Z",
            "cpus": [],
            "memory": [],
            "storage": [],
            "networkPorts": []
        }


async def fetch_server_inventory(client: httpx.AsyncClient, server: Dict[str, Any]) -> Dict[str, Any]:
    """Alias for multi-tab inventory collection compatible with redfish_backend.py."""
    return await fetch_multi_tab_inventory(client, server)


async def collect_datacenter_inventory(server_list: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Batch collection orchestrator compatible with redfish_backend.py."""
    if not server_list:
        return []
    limits = LIMITS_CONFIG
    async with httpx.AsyncClient(limits=limits, verify=False, timeout=TIMEOUT_CONFIG) as client:
        async def sem_fetch(s: Dict[str, Any]) -> Dict[str, Any]:
            async with GLOBAL_SEMAPHORE:
                return await fetch_server_inventory(client, s)

        tasks = [sem_fetch(s) for s in server_list]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        clean_results: List[Dict[str, Any]] = []
        for r in results:
            if isinstance(r, dict):
                clean_results.append(r)
        return clean_results


# ============================================================================
# Module 3: Non-Blocking Startup & 24-Hour Sync Scheduler
# ============================================================================
class Inventory24HourSyncScheduler:
    """Background scheduler executing static inventory crawl once every 24 hours."""

    def __init__(self, interval_seconds: int = 86400):
        self.interval_seconds = interval_seconds
        self.running = True

    async def run_loop(self):
        """Executes full fleet multi-tab inventory sync once every 24 hours."""
        logger.info(f"⏱️ Starting 24-Hour Static Inventory Scheduler (Interval: {self.interval_seconds}s)...")
        while self.running:
            try:
                servers = await db.get_all_servers()
                if not servers:
                    try:
                        async with httpx.AsyncClient(verify=False, timeout=5.0) as local_cli:
                            res = await local_cli.get("http://localhost:3000/api/local/fleet")
                            if res.status_code == 200:
                                servers = res.json()
                    except Exception:
                        servers = []

                if servers:
                    GLOBAL_SYNC_STATE["status"] = "SYNCING"
                    GLOBAL_SYNC_STATE["total_servers"] = len(servers)
                    GLOBAL_SYNC_STATE["completed_servers"] = 0
                    GLOBAL_SYNC_STATE["progress"] = 0
                    GLOBAL_SYNC_STATE["message"] = f"Multi-tab inventory sync in progress (0/{len(servers)})"

                    logger.info(f"🚀 Executing 24-Hour Static Multi-Tab Inventory Sync for {len(servers)} servers...")
                    async with httpx.AsyncClient(limits=LIMITS_CONFIG, verify=False, timeout=TIMEOUT_CONFIG) as client:
                        async def sem_fetch(s: Dict[str, Any]) -> Dict[str, Any]:
                            async with GLOBAL_SEMAPHORE:
                                res = await fetch_multi_tab_inventory(client, s)
                                GLOBAL_SYNC_STATE["completed_servers"] += 1
                                GLOBAL_SYNC_STATE["progress"] = int((GLOBAL_SYNC_STATE["completed_servers"] / len(servers)) * 100)
                                GLOBAL_SYNC_STATE["message"] = f"Multi-tab inventory sync in progress ({GLOBAL_SYNC_STATE['completed_servers']}/{len(servers)})"
                                return res

                        tasks = [sem_fetch(s) for s in servers]
                        await asyncio.gather(*tasks, return_exceptions=True)
                    
                    GLOBAL_SYNC_STATE["status"] = "READY"
                    GLOBAL_SYNC_STATE["progress"] = 100
                    GLOBAL_SYNC_STATE["message"] = "Fleet inventory multi-tab sync complete and saved to PostgreSQL"
                    logger.info(" 24-Hour Static Multi-Tab Inventory Sync Complete.")
                else:
                    GLOBAL_SYNC_STATE["status"] = "READY"
                    GLOBAL_SYNC_STATE["progress"] = 100
                    GLOBAL_SYNC_STATE["message"] = "No registered servers found."
                    logger.info("No registered servers found for 24-hour inventory sync.")
            except Exception as e:
                logger.error(f"Error during 24-hour inventory sync cycle: {e}")

            logger.info(f"⏳ Sleeping for {self.interval_seconds} seconds (24 hours) until next inventory cycle...")
            await asyncio.sleep(self.interval_seconds)


# ============================================================================
# Module 4: Continuous Real-Time SSE Stream Listener & Health Patching
# ============================================================================
class SSERedfishEventListener:
    """
    Maintains continuous SSE streaming connection per server BMC.
    When a critical event arrives, immediately patches PostgreSQL server health and JSONB record.
    """

    def __init__(self, server_id: str, bmc_ip: str, username: str, password: str):
        self.server_id = server_id
        self.bmc_ip = bmc_ip.lstrip("http://").lstrip("https://").strip()
        self.username = username
        self.password = password
        self.running = True
        self.backoff_seconds = 1.0

    async def run_listener_loop(self):
        """Self-healing continuous SSE stream listener with exponential backoff."""
        base_url = f"https://{self.bmc_ip}"
        sse_endpoint = build_clean_url(base_url, "/redfish/v1/EventService/SSE")

        while self.running:
            try:
                auth = (self.username, self.password)
                sse_timeout = httpx.Timeout(connect=2.0, read=None, write=5.0, pool=10.0)

                headers = {"Accept": "text/event-stream"}
                token = SESSION_TOKEN_CACHE.get(base_url)
                if token:
                    headers["X-Auth-Token"] = token

                async with httpx.AsyncClient(verify=False, timeout=sse_timeout) as client:
                    logger.info(f"⚡ [SSE Stream] Connecting to /redfish/v1/EventService/SSE on {self.bmc_ip}...")
                    
                    auth_arg = None if token else auth
                    async with client.stream("GET", sse_endpoint, auth=auth_arg, headers=headers) as response:
                        if response.status_code in (401, 403):
                            logger.warning(f"[SSE 401] Session token refresh required on {self.bmc_ip}...")
                            session_endpoint = build_clean_url(base_url, "/redfish/v1/SessionService/Sessions")
                            token_resp = await client.post(
                                session_endpoint,
                                json={"UserName": self.username, "Password": self.password},
                                headers={"Content-Type": "application/json"},
                                timeout=TIMEOUT_CONFIG
                            )
                            if token_resp.status_code in (200, 201):
                                new_token = token_resp.headers.get("X-Auth-Token") or token_resp.json().get("Token")
                                if new_token:
                                    SESSION_TOKEN_CACHE[base_url] = new_token
                                    headers["X-Auth-Token"] = new_token
                                    async with client.stream("GET", sse_endpoint, headers=headers) as resp2:
                                        if resp2.status_code == 200:
                                            self.backoff_seconds = 1.0
                                            await self._process_sse_stream(resp2)
                        elif response.status_code == 200:
                            self.backoff_seconds = 1.0
                            await self._process_sse_stream(response)
                        else:
                            logger.warning(f"[SSE Status {response.status_code}] Stream response on {self.bmc_ip}")

            except asyncio.CancelledError:
                logger.info(f"[SSE Closed] Stream listener stopped for {self.server_id} ({self.bmc_ip})")
                break
            except Exception as e:
                logger.warning(f"[SSE Reconnect] Connection dropped on {self.bmc_ip}: {e}. Retrying in {self.backoff_seconds:.1f}s...")

            await asyncio.sleep(self.backoff_seconds)
            self.backoff_seconds = min(60.0, self.backoff_seconds * 2 + random.uniform(0.1, 1.0))

    async def _process_sse_stream(self, response: httpx.Response):
        """Processes SSE events, records log entries, and immediately patches PostgreSQL health state."""
        async for line in response.aiter_lines():
            if not self.running:
                break
            if not line or line.startswith(":") or HEARTBEAT_REGEX.search(line):
                continue

            if line.startswith("data:"):
                raw_json = line[5:].strip()
                if not raw_json:
                    continue
                try:
                    payload = json.loads(raw_json)
                    events = payload.get("Events", [payload]) if isinstance(payload, dict) else [payload]
                    for evt in events:
                        if isinstance(evt, dict):
                            msg = evt.get("Message") or evt.get("Name") or "Redfish Real-Time Event"
                            sev = evt.get("Severity", "Warning")
                            e_type = evt.get("EventId") or evt.get("MemberId") or evt.get("MessageId", "").split(".")[0] or "RedfishEvent"
                            
                            # 1. Record time-series event log
                            await db.record_event_log(self.server_id, e_type, sev, msg)
                            # 2. Event-Driven State Patching into PostgreSQL JSONB
                            await db.patch_server_health_from_event(self.server_id, sev, msg, e_type)
                            logger.info(f"⚡ [SSE HEALTH PATCHED] Server {self.bmc_ip}: {sev} - {msg}")
                except Exception as parse_err:
                    logger.debug(f"[SSE Parse Error] {parse_err}")


# ============================================================================
# Module 5: Concurrent Orchestrator & Instant DB Cache API Helper
# ============================================================================
class DecoupledMonitoringOrchestrator:
    """
    Decoupled Asynchronous Orchestrator that initializes DB connections instantly
    and gathers background 24-hour static inventory crawler + SSE listeners concurrently.
    """

    def __init__(self):
        self.inventory_scheduler = Inventory24HourSyncScheduler(interval_seconds=86400)
        self.sse_listeners: List[SSERedfishEventListener] = []

    async def start_service(self):
        """Initializes database pool and spins up background tasks without blocking startup."""
        logger.info("===========================================================================")
        logger.info(" Starting Tyrone Decoupled Redfish Monitoring Backend Service")
        logger.info("===========================================================================")

        # 1. Non-Blocking Startup: Initialize PostgreSQL asyncpg Connection Pool
        await db.initialize()

        # 2. Retrieve Servers from PostgreSQL or Local API
        servers = await db.get_all_servers()
        if not servers:
            try:
                async with httpx.AsyncClient(verify=False, timeout=5.0) as local_cli:
                    res = await local_cli.get("http://localhost:3000/api/local/fleet")
                    if res.status_code == 200:
                        servers = res.json()
            except Exception:
                servers = []

        # 3. Create Continuous SSE Listeners for Each Active Server
        sse_tasks = []
        for srv in servers:
            s_id = srv.get("id", srv.get("ip"))
            ip = srv.get("ip", "")
            user = srv.get("username", "admin")
            pwd = srv.get("password", "netweb@123")
            if ip:
                listener = SSERedfishEventListener(s_id, ip, user, pwd)
                self.sse_listeners.append(listener)
                sse_tasks.append(asyncio.create_task(listener.run_listener_loop()))

        # 4. Launch Background 24-Hour Static Inventory Crawler
        inventory_task = asyncio.create_task(self.inventory_scheduler.run_loop())

        logger.info(f"🚀 Non-blocking service started: 24-Hour Inventory Sync + {len(sse_tasks)} SSE Streams running concurrently.")

        # 5. Concurrent Gather of Lifecycles
        await asyncio.gather(inventory_task, *sse_tasks, return_exceptions=True)


async def main():
    orchestrator = DecoupledMonitoringOrchestrator()
    await orchestrator.start_service()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Monitoring service stopped by user.")
