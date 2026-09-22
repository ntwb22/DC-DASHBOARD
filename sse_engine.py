"""
Permanent Background SSE Engine & Self-Healing Event Receiver
============================================================
Establishes a persistent /redfish/v1/EventService/SSE stream per server BMC.
Provides auto-reconnection with exponential backoff, log-throttling (5s window),
and WebSocket broadcast integration for live React UI state mutations.
"""

import asyncio
import json
import logging
import random
import re
import time
import httpx
import urllib3
from typing import Dict, Any, Set, Optional, List, Tuple
from db import db

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
logger = logging.getLogger("TyroneSSE")

# Active WebSocket & SSE Stream subscribers
ws_clients: Set[Any] = set()
sse_queues: Set[asyncio.Queue] = set()

async def broadcast_event(event_data: Dict[str, Any]):
    """Broadcasts localized state mutations to all active React UI WebSocket & SSE subscribers."""
    message_str = json.dumps(event_data)
    
    # 1. Send to WebSockets
    if ws_clients:
        disconnected = set()
        for ws in ws_clients:
            try:
                await ws.send_text(message_str)
            except Exception:
                disconnected.add(ws)
        for dead in disconnected:
            ws_clients.discard(dead)

    # 2. Send to SSE Queues
    if sse_queues:
        for q in list(sse_queues):
            try:
                q.put_nowait(event_data)
            except Exception:
                pass

HEARTBEAT_REGEX = re.compile(r"dummy|keep-?alive|heartbeat|ping|noop|:\s*$", re.IGNORECASE)

class SSERedfishReceiver:
    """Manages background SSE connection loop for a target server BMC."""

    def __init__(self, server_id: str, bmc_ip: str, username: str, password: str):
        self.server_id = server_id
        self.bmc_ip = bmc_ip.lstrip("http://").lstrip("https://")
        self.username = username
        self.password = password
        self.running = False
        self.backoff_seconds = 1.0
        self.task: Optional[asyncio.Task] = None
        self.recent_events_cache: Dict[str, float] = {}
        self.DEDUP_WINDOW_SECONDS: float = 5.0

    async def start(self):
        """Launches the background SSE streaming task."""
        if self.running:
            return
        self.running = True
        self.task = asyncio.create_task(self._sse_loop())

    async def stop(self):
        """Cleanly cancels the SSE streaming task."""
        self.running = False
        if self.task and not self.task.done():
            self.task.cancel()

    async def _sse_loop(self):
        """Self-healing SSE loop with exponential backoff and 401 token handling."""
        base_url = f"https://{self.bmc_ip}"
        sse_endpoint = f"{base_url}/redfish/v1/EventService/SSE"

        while self.running:
            # Validation check: verify server IP / ID is still present in database
            servers = await db.get_all_servers()
            server_exists = any(
                s.get("id") == self.server_id or s.get("ip", "").lstrip("http://").lstrip("https://").strip() == self.bmc_ip
                for s in servers
            )
            if not server_exists:
                logger.info(f"[SSE] Server {self.server_id} ({self.bmc_ip}) was removed from configuration database. Gracefully terminating background SSE loop.")
                self.running = False
                break

            try:
                auth = (self.username, self.password)
                timeout = httpx.Timeout(connect=5.0, read=None, write=5.0, pool=10.0)

                async with httpx.AsyncClient(verify=False, timeout=timeout) as client:
                    logger.info(f"[SSE] Subscribing to live event stream on {self.bmc_ip}...")
                    
                    async with client.stream("GET", sse_endpoint, auth=auth) as response:
                        if response.status_code in (401, 403):
                            logger.warning(f"[SSE] 401 Unauthorized on {self.bmc_ip}. Requesting session token refresh...")
                            # Attempt session token acquisition
                            token = await self._acquire_token(client, base_url)
                            if token:
                                headers = {"X-Auth-Token": token}
                                async with client.stream("GET", sse_endpoint, headers=headers) as resp_token:
                                    if resp_token.status_code == 200:
                                        self.backoff_seconds = 1.0
                                        await self._process_stream(resp_token)
                            
                        elif response.status_code == 200:
                            self.backoff_seconds = 1.0 # Reset backoff on successful connection
                            await self._process_stream(response)
                        else:
                            logger.warning(f"[SSE] Unexpected HTTP {response.status_code} from {self.bmc_ip}")

            except asyncio.CancelledError:
                logger.info(f"[SSE] Stream stopped for server {self.server_id} ({self.bmc_ip})")
                break
            except Exception as e:
                logger.warning(f"[SSE] Connection drop on {self.bmc_ip}: {e}. Retrying in {self.backoff_seconds:.1f}s...")

            # Exponential backoff safeguard with jitter (max 60s)
            await asyncio.sleep(self.backoff_seconds)
            self.backoff_seconds = min(60.0, self.backoff_seconds * 2 + random.uniform(0.1, 1.0))

    async def _acquire_token(self, client: httpx.AsyncClient, base_url: str) -> Optional[str]:
        """Requests fresh X-Auth-Token from SessionService."""
        try:
            resp = await client.post(
                f"{base_url}/redfish/v1/SessionService/Sessions",
                json={"UserName": self.username, "Password": self.password},
                headers={"Content-Type": "application/json"},
                timeout=5.0
            )
            if resp.status_code in (200, 201):
                return resp.headers.get("X-Auth-Token") or resp.json().get("Token")
        except Exception as e:
            logger.error(f"[SSE Token] Acquisition failed for {self.bmc_ip}: {e}")
        return None

    async def _process_stream(self, response: httpx.Response):
        """Processes raw SSE stream data lines and pipes events to storage & WebSocket."""
        async for line in response.aiter_lines():
            if not self.running:
                break

            stripped_line = line.strip()
            # Keep-Alive & Comment Filter: silently ignore comment lines (:), empty lines, and heartbeat/ping strings
            if not stripped_line or stripped_line.startswith(":") or HEARTBEAT_REGEX.search(stripped_line):
                continue

            if stripped_line.startswith("data:"):
                raw_payload = stripped_line[5:].strip()
                if not raw_payload or raw_payload == "{}" or HEARTBEAT_REGEX.search(raw_payload):
                    continue

                try:
                    event_data = json.loads(raw_payload)
                    events = event_data.get("Events", [event_data])
                    if not isinstance(events, list) or len(events) == 0:
                        continue

                    for ev in events:
                        if not isinstance(ev, dict):
                            continue

                        event_type = ev.get("EventType") or (ev.get("MessageId", "").split(".")[-1] if ev.get("MessageId") else "Alert")
                        severity = ev.get("Severity", "OK")
                        msg = ev.get("Message", "System Event Triggered")
                        origin = str(ev.get("OriginOfCondition", {}).get("@odata.id", "") or ev.get("OriginOfCondition", ""))
                        msg_id = str(ev.get("MessageId", ""))

                        # 1. Session Event Noise Filtering:
                        # Suppress repetitive ResourceAdded / ResourceRemoved events tied to SessionService/Sessions
                        is_session_path = (
                            "/redfish/v1/sessionservice/sessions" in origin.lower() or
                            "/sessionservice/sessions" in origin.lower() or
                            "sessionservice" in msg_id.lower() or
                            ("session" in origin.lower() and "session" in msg_id.lower())
                        )
                        is_routine_resource_change = str(event_type).lower() in (
                            "resourceadded", "resourceremoved", "resourcecreated", "resourcedeleted", "uriforresourcechanged"
                        )

                        if is_session_path and is_routine_resource_change:
                            logger.debug(f"[SSE Noise Filter] Suppressed routine session churn event from {self.bmc_ip}: {event_type} on {origin}")
                            continue

                        # Handle Network Port status shift (Up/Down)
                        if any(k in str(event_type).lower() for k in ["link", "port"]) or "network" in msg.lower():
                            event_type = "NetworkPortShift"

                        # 2. Sliding Window Deduplication & Rate Limiting (5-second window):
                        now = time.time()
                        event_key = f"{self.server_id}:{event_type}:{severity}:{msg}"
                        last_seen = self.recent_events_cache.get(event_key, 0.0)

                        if len(self.recent_events_cache) > 100:
                            self.recent_events_cache = {
                                k: t for k, t in self.recent_events_cache.items() if now - t < 60.0
                            }

                        if now - last_seen < self.DEDUP_WINDOW_SECONDS:
                            logger.debug(f"[SSE Dedup] Squashed duplicate rapid-fire event from {self.bmc_ip}: {event_type}")
                            continue

                        self.recent_events_cache[event_key] = now

                        # Pipe raw event into time-series event_logs with 5s duplicate throttling
                        log_rec = await db.record_event_log(self.server_id, event_type, severity, msg)

                        # Broadcast live state mutation to React UI WebSocket & SSE clients
                        mutation = {
                            "type": "REDFISH_EVENT",
                            "serverId": self.server_id,
                            "ip": self.bmc_ip,
                            "eventType": event_type,
                            "severity": severity,
                            "message": msg,
                            "occurrences": log_rec.get("occurrences", 1),
                            "timestamp": log_rec.get("last_seen"),
                            "rawPayload": event_data
                        }
                        await broadcast_event(mutation)
                except json.JSONDecodeError:
                    pass

class SSEEngineManager:
    """Manages active SSE receiver instances across all registered server nodes."""

    def __init__(self):
        self.receivers: Dict[str, SSERedfishReceiver] = {}

    async def sync_servers(self, servers: list):
        """Ensures an SSE background task is running for each server in the fleet."""
        active_ids = {s["id"] for s in servers}

        # Stop removed servers
        for sid, rec in list(self.receivers.items()):
            if sid not in active_ids:
                await rec.stop()
                del self.receivers[sid]

        # Start new server workers
        for s in servers:
            sid = s["id"]
            if sid not in self.receivers:
                rec = SSERedfishReceiver(sid, s["ip"], s["username"], s["password"])
                self.receivers[sid] = rec
                await rec.start()

sse_manager = SSEEngineManager()
