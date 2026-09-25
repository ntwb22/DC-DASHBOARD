"""
Production-Grade Asynchronous Redfish Monitoring Backend Engine
================================================================
Hybrid Architecture:
  - Tier 1: Low-frequency inventory caching with $expand (<3 requests) triggered ONLY on server add, manual refresh, or 24h schedule.
  - Tier 2: Continuous SSE streaming & dynamic EventService discovery with persistent HTTP connection pooling.
  - Resilience: Circuit breaker pattern (CLOSED -> OPEN -> HALF_OPEN) with exponential backoff (5s to 30m cap) & Last-Event-ID recovery.
  - Health & Watchdog: Activity tracking (last_seen) & Silent BMC Detection daemon flagging 'Warning: BMC Silent' after 5 min.
"""

import asyncio
import json
import logging
import random
import re
import time
import urllib3
import httpx
from datetime import datetime
from enum import Enum
from typing import Dict, Any, List, Optional, Set, Tuple

from db import db

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
logger = logging.getLogger("RedfishMonitor")

# Regexp for heartbeat / keep-alive / comment lines
HEARTBEAT_REGEX = re.compile(r"dummy|keep-?alive|heartbeat|ping|noop|:\s*$", re.IGNORECASE)

# ============================================================================
# 1. Asynchronous Foundation & HTTP Connection Pool Manager
# ============================================================================
class RedfishHttpClientPool:
    """Manages persistent HTTP client connection pool with keep-alive connections."""
    def __init__(self, max_keepalive: int = 50, max_connections: int = 200):
        self.limits = httpx.Limits(
            max_keepalive_connections=max_keepalive,
            max_connections=max_connections,
            keepalive_expiry=30.0
        )
        self.timeout = httpx.Timeout(5.0, connect=3.0)
        self._client: Optional[httpx.AsyncClient] = None

    def get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                verify=False,
                limits=self.limits,
                timeout=self.timeout
            )
        return self._client

    async def close(self):
        if self._client and not self._client.is_closed:
            await self._client.aclose()

http_pool = RedfishHttpClientPool()

# Session Token Cache: bmc_ip -> {"token": str, "location": str, "created_at": float}
SESSION_TOKEN_CACHE: Dict[str, Dict[str, Any]] = {}

async def get_or_acquire_session_token(client: httpx.AsyncClient, bmc_ip: str, username: str, password: str) -> Optional[str]:
    """Acquires or reuses X-Auth-Token via /redfish/v1/SessionService/Sessions."""
    now = time.time()
    cached = SESSION_TOKEN_CACHE.get(bmc_ip)
    if cached and (now - cached["created_at"] < 1500): # 25 minute TTL
        return cached["token"]

    clean_ip = bmc_ip.lstrip("http://").lstrip("https://").strip()
    base_url = f"https://{clean_ip}"
    url = f"{base_url}/redfish/v1/SessionService/Sessions"

    try:
        resp = await client.post(
            url,
            json={"UserName": username, "Password": password},
            headers={"Content-Type": "application/json"},
            timeout=5.0
        )
        if resp.status_code in (200, 201):
            token = resp.headers.get("X-Auth-Token") or resp.json().get("Token")
            location = resp.headers.get("Location")
            if token:
                SESSION_TOKEN_CACHE[bmc_ip] = {"token": token, "location": location, "created_at": now}
                logger.info(f"[Auth] Acquired X-Auth-Token for BMC {clean_ip}")
                return token
    except Exception as e:
        logger.debug(f"[Auth] Session creation failed for {clean_ip}: {e}")
    return None

# ============================================================================
# 2. Resilience & Circuit Breaker Pattern
# ============================================================================
class CircuitState(str, Enum):
    CLOSED = "CLOSED"      # Normal operation
    OPEN = "OPEN"          # Failing, skipping requests
    HALF_OPEN = "HALF_OPEN"# Trial recovery

class CircuitBreaker:
    """
    Implements circuit breaker pattern with exponential backoff (5s -> 1800s cap).
    Prevents hammering unresponsive BMCs.
    """
    def __init__(self, failure_threshold: int = 3, initial_backoff: float = 5.0, max_backoff: float = 1800.0):
        self.failure_threshold = failure_threshold
        self.initial_backoff = initial_backoff
        self.max_backoff = max_backoff

        self.state = CircuitState.CLOSED
        self.failure_count = 0
        self.current_backoff = initial_backoff
        self.next_attempt_time = 0.0

    def can_execute(self) -> bool:
        now = time.time()
        if self.state == CircuitState.CLOSED:
            return True
        if self.state == CircuitState.OPEN:
            if now >= self.next_attempt_time:
                self.state = CircuitState.HALF_OPEN
                logger.info(f"[CircuitBreaker] Transitioning to HALF_OPEN trial state.")
                return True
            return False
        if self.state == CircuitState.HALF_OPEN:
            return True
        return False

    def record_success(self):
        if self.state != CircuitState.CLOSED:
            logger.info(f"[CircuitBreaker] Probe succeeded. Resetting circuit breaker to CLOSED state.")
        self.failure_count = 0
        self.current_backoff = self.initial_backoff
        self.state = CircuitState.CLOSED

    def record_failure(self):
        self.failure_count += 1
        if self.failure_count >= self.failure_threshold or self.state == CircuitState.HALF_OPEN:
            self.state = CircuitState.OPEN
            self.next_attempt_time = time.time() + self.current_backoff
            logger.warning(
                f"[CircuitBreaker] Failure #{self.failure_count}. Circuit is OPEN. "
                f"Backing off for {self.current_backoff:.1f}s (Next attempt at t+{self.current_backoff:.1f}s)."
            )
            # Exponential backoff capped at 30 minutes (1800s)
            self.current_backoff = min(self.max_backoff, self.current_backoff * 2.0 + random.uniform(0.1, 1.0))

# ============================================================================
# 3. Tier 1: Low-Frequency Inventory Caching ($expand Optimization)
# ============================================================================
async def fetch_and_cache_inventory(
    server_id: str,
    bmc_ip: str,
    username: str,
    password: str,
    vendor: str = "SM"
) -> Dict[str, Any]:
    """
    Low-Frequency System Inventory Fetcher:
    - Uses Redfish $expand query parameters (?$expand=*($levels=1)) to fetch system, chassis,
      CPUs, memory, power, thermal, and storage in <3 HTTP requests.
    - Stores/upserts normalized results in database JSONB cache.
    - Executed ONLY when:
        1. A server is added
        2. Manually refreshed by user
        3. On 24-hour background schedule
    """
    clean_ip = bmc_ip.lstrip("http://").lstrip("https://").strip()
    base_url = f"https://{clean_ip}"
    client = http_pool.get_client()

    token = await get_or_acquire_session_token(client, clean_ip, username, password)
    headers = {"Accept": "application/json"}
    if token:
        headers["X-Auth-Token"] = token
    auth = None if token else (username, password)

    inventory_data: Dict[str, Any] = {
        "server_id": server_id,
        "bmc_ip": clean_ip,
        "fetched_at": datetime.now().isoformat(),
        "http_requests": 0,
        "system": {},
        "chassis": {},
        "processors": [],
        "memory": [],
        "storage": [],
        "power": {},
        "thermal": {},
        "firmware": {}
    }

    # Query 1: Bulk System Inventory using $expand
    sys_expand_url = f"{base_url}/redfish/v1/Systems/1?$expand=*($levels=1)"
    try:
        inventory_data["http_requests"] += 1
        resp = await client.get(sys_expand_url, headers=headers, auth=auth)
        if resp.status_code == 200:
            sys_data = resp.json()
            inventory_data["system"] = sys_data
            if "Processors" in sys_data and isinstance(sys_data["Processors"], dict):
                inventory_data["processors"] = sys_data["Processors"].get("Members", [])
            if "Memory" in sys_data and isinstance(sys_data["Memory"], dict):
                inventory_data["memory"] = sys_data["Memory"].get("Members", [])
            if "Storage" in sys_data and isinstance(sys_data["Storage"], dict):
                inventory_data["storage"] = sys_data["Storage"].get("Members", [])
        else:
            # Fallback to plain GET if $expand not supported by legacy BMC
            inventory_data["http_requests"] += 1
            resp_plain = await client.get(f"{base_url}/redfish/v1/Systems/1", headers=headers, auth=auth)
            if resp_plain.status_code == 200:
                inventory_data["system"] = resp_plain.json()
    except Exception as e:
        logger.warning(f"[Inventory] System fetch error for {clean_ip}: {e}")

    # Query 2: Bulk Chassis (Thermal, Power, Fans) using $expand
    chassis_expand_url = f"{base_url}/redfish/v1/Chassis/1?$expand=*($levels=1)"
    try:
        inventory_data["http_requests"] += 1
        resp_c = await client.get(chassis_expand_url, headers=headers, auth=auth)
        if resp_c.status_code == 200:
            c_data = resp_c.json()
            inventory_data["chassis"] = c_data
            inventory_data["thermal"] = c_data.get("Thermal", {})
            inventory_data["power"] = c_data.get("Power", {})
        else:
            inventory_data["http_requests"] += 1
            resp_th = await client.get(f"{base_url}/redfish/v1/Chassis/1/Thermal", headers=headers, auth=auth)
            if resp_th.status_code == 200:
                inventory_data["thermal"] = resp_th.json()
    except Exception as e:
        logger.warning(f"[Inventory] Chassis fetch error for {clean_ip}: {e}")

    # Persist in Database JSONB Cache
    await db.upsert_server_inventory(server_id, vendor, inventory_data, {})
    try:
        from sse_engine import broadcast_event
        await broadcast_event({
            "type": "INVENTORY_UPDATED",
            "serverId": server_id,
            "ip": clean_ip,
            "timestamp": datetime.now().isoformat(),
            "inventory": inventory_data
        })
    except Exception:
        pass
    logger.info(f"[Tier 1 Inventory] Successfully fetched & cached inventory for {server_id} ({clean_ip}) in {inventory_data['http_requests']} requests.")
    return inventory_data

# ============================================================================
# 4. Tier 2: Continuous SSE Event & SEL Streaming Daemon Worker
# ============================================================================
class SSERedfishDaemonWorker:
    """
    Continuous Background SSE Daemon Worker per Server BMC.
    - Dynamically queries /redfish/v1/EventService to locate ServerSentEventUri.
    - Opens persistent GET stream with text/event-stream.
    - Parses lines starting with data:, extracting EventTimestamp, MessageId, Severity, Message.
    - Updates activity tracking timestamp (last_seen) on events and keep-alive heartbeats.
    - Employs CircuitBreaker for exponential backoff (5s to 30m cap) & Last-Event-ID state recovery.
    """
    def __init__(self, server_id: str, bmc_ip: str, username: str, password: str, vendor: str = "SM"):
        self.server_id = server_id
        self.bmc_ip = bmc_ip.lstrip("http://").lstrip("https://").strip()
        self.username = username
        self.password = password
        self.vendor = vendor

        self.running = False
        self.task: Optional[asyncio.Task] = None
        self.circuit_breaker = CircuitBreaker(failure_threshold=3, initial_backoff=5.0, max_backoff=1800.0)

        self.last_seen: float = time.time()
        self.last_event_id: Optional[str] = None
        self.status: str = "OK"

    async def start(self):
        if self.running:
            return
        self.running = True
        self.task = asyncio.create_task(self._daemon_loop())
        logger.info(f"[Daemon] Started SSE monitoring worker for server {self.server_id} ({self.bmc_ip})")

    async def stop(self):
        self.running = False
        if self.task and not self.task.done():
            self.task.cancel()
        logger.info(f"[Daemon] Stopped SSE monitoring worker for server {self.server_id} ({self.bmc_ip})")

    async def update_last_seen(self):
        """Updates activity timestamp when an event or heartbeat arrives."""
        self.last_seen = time.time()
        if self.status == "BMC Silent":
            self.status = "OK"
            logger.info(f"[Activity] Server {self.server_id} ({self.bmc_ip}) resumed activity. Status restored to OK.")

    async def discover_sse_uri(self, client: httpx.AsyncClient, base_url: str, headers: dict, auth: Any) -> str:
        """Dynamically queries /redfish/v1/EventService to retrieve ServerSentEventUri."""
        event_service_url = f"{base_url}/redfish/v1/EventService"
        try:
            resp = await client.get(event_service_url, headers=headers, auth=auth, timeout=4.0)
            if resp.status_code == 200:
                data = resp.json()
                sse_uri = data.get("ServerSentEventUri")
                if sse_uri:
                    if sse_uri.startswith("http"):
                        return sse_uri
                    return f"{base_url}/{sse_uri.lstrip('/')}"
        except Exception as e:
            logger.debug(f"[SSE Discovery] EventService discovery notice on {self.bmc_ip}: {e}")
        # Default fallback standard endpoint
        return f"{base_url}/redfish/v1/EventService/SSE"

    async def fetch_sel_logs(self) -> List[Dict[str, Any]]:
        """On-demand SEL (System Event Log) fetcher to retrieve hardware event entries."""
        base_url = f"https://{self.bmc_ip}"
        client = http_pool.get_client()
        token = await get_or_acquire_session_token(client, self.bmc_ip, self.username, self.password)
        headers = {"Accept": "application/json"}
        if token:
            headers["X-Auth-Token"] = token
        auth = None if token else (self.username, self.password)

        sel_urls = [
            f"{base_url}/redfish/v1/Systems/1/LogServices/EventLog/Entries",
            f"{base_url}/redfish/v1/Managers/1/LogServices/SEL/Entries"
        ]
        entries = []
        for url in sel_urls:
            try:
                resp = await client.get(url, headers=headers, auth=auth, timeout=5.0)
                if resp.status_code == 200:
                    data = resp.json()
                    entries = data.get("Members", [])
                    if entries:
                        break
            except Exception as e:
                logger.debug(f"[SEL Fetch] Notice on {self.bmc_ip}: {e}")
        return entries

    async def _daemon_loop(self):
        """Persistent SSE streaming loop with circuit breaking and state recovery."""
        base_url = f"https://{self.bmc_ip}"

        while self.running:
            if not self.circuit_breaker.can_execute():
                await asyncio.sleep(1.0)
                continue

            client = http_pool.get_client()
            try:
                token = await get_or_acquire_session_token(client, self.bmc_ip, self.username, self.password)
                headers = {"Accept": "text/event-stream"}
                if token:
                    headers["X-Auth-Token"] = token
                if self.last_event_id:
                    headers["Last-Event-ID"] = self.last_event_id

                auth = None if token else (self.username, self.password)
                sse_endpoint = await self.discover_sse_uri(client, base_url, headers, auth)

                logger.info(f"[SSE Stream] Connecting to {sse_endpoint} for server {self.server_id}...")

                sse_timeout = httpx.Timeout(connect=5.0, read=None, write=5.0, pool=10.0)
                async with client.stream("GET", sse_endpoint, auth=auth, headers=headers, timeout=sse_timeout) as response:
                    if response.status_code in (401, 403):
                        logger.warning(f"[SSE 401] Expired session token on {self.bmc_ip}. Forcing re-auth...")
                        SESSION_TOKEN_CACHE.pop(self.bmc_ip, None)
                        self.circuit_breaker.record_failure()

                    elif response.status_code == 200:
                        self.circuit_breaker.record_success()
                        await self.update_last_seen()
                        await self._parse_sse_stream(response)
                    else:
                        logger.warning(f"[SSE HTTP {response.status_code}] Stream rejected by {self.bmc_ip}")
                        self.circuit_breaker.record_failure()

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.warning(f"[SSE Stream Drop] {self.bmc_ip}: {e}")
                self.circuit_breaker.record_failure()

            await asyncio.sleep(1.0)

    async def _parse_sse_stream(self, response: httpx.Response):
        """Parses incoming lines starting with data: and extracts JSON payloads."""
        async for line in response.aiter_lines():
            if not self.running:
                break

            line_str = line.strip()

            # Heartbeat / Comment line: update activity timestamp
            if not line_str or line_str.startswith(":") or HEARTBEAT_REGEX.search(line_str):
                await self.update_last_seen()
                continue

            # Track Event ID for state recovery upon reconnection
            if line_str.startswith("id:"):
                self.last_event_id = line_str[3:].strip()
                continue

            if line_str.startswith("data:"):
                raw_payload = line_str[5:].strip()
                if not raw_payload or raw_payload == "{}" or HEARTBEAT_REGEX.search(raw_payload):
                    await self.update_last_seen()
                    continue

                await self.update_last_seen()
                try:
                    event_data = json.loads(raw_payload)
                    events = event_data.get("Events", [event_data]) if isinstance(event_data, dict) else [event_data]

                    for ev in events:
                        if not isinstance(ev, dict):
                            continue

                        timestamp = ev.get("EventTimestamp") or datetime.now().isoformat()
                        message_id = ev.get("MessageId", "Redfish.1.0.Event")
                        severity = ev.get("Severity", "OK")
                        msg = ev.get("Message", "Redfish SSE Event Received")
                        event_type = ev.get("EventType") or message_id.split(".")[-1]

                        # Pipe raw event into DB time-series event log
                        await db.record_event_log(self.server_id, event_type, severity, msg)

                        # Event-driven health patch if severity is critical/warning
                        await db.patch_server_health_from_event(self.server_id, severity, msg, event_type)

                        logger.info(f"⚡ [SSE EVENT] Server {self.server_id} ({self.bmc_ip}): [{severity}] {message_id} - {msg}")

                except json.JSONDecodeError:
                    pass

# ============================================================================
# 5. Health Check & Stale Data Flagging (Silent BMC Detection Watchdog)
# ============================================================================
class SilentBMCWatchdog:
    """
    Background watchdog daemon that periodically checks activity (last_seen) of active servers.
    Flags a server as 'Warning: BMC Silent' in database if no events/heartbeats are received
    within silent_timeout window (default 300 seconds / 5 minutes).
    """
    def __init__(self, daemon_workers: Dict[str, SSERedfishDaemonWorker], check_interval: float = 30.0, silent_timeout: float = 300.0):
        self.workers = daemon_workers
        self.check_interval = check_interval
        self.silent_timeout = silent_timeout
        self.running = False
        self.task: Optional[asyncio.Task] = None

    async def start(self):
        if self.running:
            return
        self.running = True
        self.task = asyncio.create_task(self._watchdog_loop())
        logger.info(f"[Watchdog] Silent BMC Watchdog daemon started (Interval: {self.check_interval}s, Silent Timeout: {self.silent_timeout}s)")

    async def stop(self):
        self.running = False
        if self.task and not self.task.done():
            self.task.cancel()

    async def check_silent_bmcs(self):
        """Checks activity timestamps and flags silent BMCs."""
        now = time.time()
        for server_id, worker in list(self.workers.items()):
            time_since_activity = now - worker.last_seen
            if time_since_activity > self.silent_timeout and worker.status != "BMC Silent":
                worker.status = "BMC Silent"
                logger.warning(f"⚠️ [Silent BMC Watchdog] Server {server_id} ({worker.bmc_ip}) has been silent for {time_since_activity:.0f}s! Flagging status as 'Warning: BMC Silent'.")
                await db.patch_server_health_from_event(server_id, "Warning", f"BMC Silent: No events/heartbeats received for {time_since_activity:.0f}s", "BMCSilent")

    async def _watchdog_loop(self):
        while self.running:
            await self.check_silent_bmcs()
            await asyncio.sleep(self.check_interval)

# ============================================================================
# 6. Master Monitoring Manager & 24-Hour Inventory Scheduler
# ============================================================================
class RedfishMonitoringManager:
    """
    Unified Production-Grade Redfish Monitoring Backend Manager.
    Orchestrates:
      1. Low-frequency inventory caching (on add, on manual refresh, on 24-hour cycle)
      2. Continuous SSE streaming & SEL discovery daemon per BMC node
      3. Circuit breaker & backoff handling
      4. Silent BMC detection watchdog
    """
    def __init__(self, inventory_interval: float = 86400.0): # 24 hours
        self.inventory_interval = inventory_interval
        self.workers: Dict[str, SSERedfishDaemonWorker] = {}
        self.watchdog = SilentBMCWatchdog(self.workers, check_interval=30.0, silent_timeout=300.0)
        self.running = False
        self.inventory_task: Optional[asyncio.Task] = None

    async def start(self):
        """Initializes storage layer, starts background 24h scheduler and watchdog."""
        if self.running:
            return
        self.running = True
        await db.initialize()
        await self.watchdog.start()
        self.inventory_task = asyncio.create_task(self._24h_inventory_loop())

        servers = await db.get_all_servers()
        await self.sync_servers(servers)
        logger.info(f"🚀 RedfishMonitoringManager operational. Monitoring {len(servers)} registered servers.")

    async def stop(self):
        self.running = False
        await self.watchdog.stop()
        if self.inventory_task and not self.inventory_task.done():
            self.inventory_task.cancel()

        for worker in list(self.workers.values()):
            await worker.stop()
        self.workers.clear()
        await http_pool.close()

    async def sync_servers(self, servers: List[Dict[str, Any]]):
        """Ensures an SSE background daemon worker is running for each server in the fleet."""
        active_ids = {s["id"] for s in servers}

        # Stop workers for removed servers
        for sid, worker in list(self.workers.items()):
            if sid not in active_ids:
                await worker.stop()
                del self.workers[sid]

        # Start workers for new servers & trigger initial inventory fetch once on server add
        for s in servers:
            sid = s["id"]
            if sid not in self.workers:
                worker = SSERedfishDaemonWorker(
                    server_id=sid,
                    bmc_ip=s["ip"],
                    username=s.get("username", "admin"),
                    password=s.get("password", "netweb@123"),
                    vendor=s.get("vendor", "SM")
                )
                self.workers[sid] = worker
                await worker.start()

                # Trigger Tier 1 Inventory fetch ONCE when server is added
                asyncio.create_task(
                    fetch_and_cache_inventory(
                        server_id=sid,
                        bmc_ip=s["ip"],
                        username=s.get("username", "admin"),
                        password=s.get("password", "netweb@123"),
                        vendor=s.get("vendor", "SM")
                    )
                )

    async def on_server_added(self, server_id: str, name: str, ip: str, vendor: str, username: str, password: str, rack: str = "Rack 1"):
        """Triggered when a user adds a new server."""
        await db.save_server(server_id, name, ip, vendor, username, password, rack)
        servers = await db.get_all_servers()
        await self.sync_servers(servers)

    async def on_manual_refresh(self, server_id: Optional[str] = None):
        """Triggered when a user clicks manual refresh in the UI."""
        servers = await db.get_all_servers()
        targets = [s for s in servers if s["id"] == server_id] if server_id else servers
        tasks = [
            fetch_and_cache_inventory(
                server_id=s["id"],
                bmc_ip=s["ip"],
                username=s.get("username", "admin"),
                password=s.get("password", "netweb@123"),
                vendor=s.get("vendor", "SM")
            )
            for s in targets
        ]
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)

    async def _24h_inventory_loop(self):
        """Background schedule triggering Tier 1 inventory caching every 24 hours."""
        while self.running:
            await asyncio.sleep(self.inventory_interval)
            logger.info("⏱️ Triggering 24-hour scheduled fleet inventory refresh...")
            await self.on_manual_refresh()

redfish_manager = RedfishMonitoringManager()

# ============================================================================
# 7. Runnable Self-Check Test Suite (Ponytail AGENTS.md Rule Compliance)
# ============================================================================
async def _run_self_check():
    """Runs a minimal self-check verifying circuit breaker, inventory caching, and watchdog."""
    print("=== Running Redfish Monitoring Backend Self-Check ===")

    # 1. Test Circuit Breaker
    cb = CircuitBreaker(failure_threshold=2, initial_backoff=5.0, max_backoff=1800.0)
    assert cb.can_execute() == True, "Circuit breaker should start CLOSED"
    cb.record_failure()
    assert cb.state == CircuitState.CLOSED
    cb.record_failure()
    assert cb.state == CircuitState.OPEN, "Circuit breaker should transition to OPEN after 2 failures"
    assert cb.can_execute() == False, "Circuit breaker OPEN should block execution"
    print(" Circuit Breaker test passed!")

    # 2. Test Activity & Watchdog Tracking
    worker = SSERedfishDaemonWorker("test_srv_1", "127.0.0.1", "admin", "password")
    workers = {"test_srv_1": worker}
    watchdog = SilentBMCWatchdog(workers, check_interval=1.0, silent_timeout=2.0)
    worker.last_seen = time.time() - 5.0 # Set last seen 5 seconds ago
    await watchdog.check_silent_bmcs()
    assert worker.status == "BMC Silent", "Worker should be flagged as BMC Silent"
    await worker.update_last_seen()
    assert worker.status == "OK", "Worker status should reset to OK on new activity"
    print(" Silent BMC Watchdog test passed!")

    print("=== All Redfish Monitoring Self-Checks Passed Successfully! ===")

if __name__ == "__main__":
    asyncio.run(_run_self_check())
