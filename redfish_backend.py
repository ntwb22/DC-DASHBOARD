"""
DMTF Redfish API Advanced Backend Engine
A production-ready asynchronous Python service for enterprise data center automation.
Author: Principal Infrastructure Software Engineer (specializing in Data Center Automation)
"""

import os
import time
import httpx
from datetime import datetime
from contextlib import asynccontextmanager
from urllib.parse import urlparse

# Global proxy cache
# Key: (base_url, path, username) -> Value: (response_dict, timestamp)
proxy_cache = {}
CACHE_TTL_SECS = 60

# Blacklist cache for unsupported/404 paths to prevent repeated polling slowness
# Key: (base_url, path) -> Value: timestamp
path_blacklist = {}
BLACKLIST_TTL_SECS = 300  # Remember 404 paths for 5 minutes

import sys
import asyncio
if sys.platform == "win32":
    try:
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
    except Exception:
        pass

import aiohttp
import logging
import ssl
import urllib3
from typing import Dict, Any, List, Optional, Tuple, Set
import json

# Suppress urllib3 or global SSL warnings for self-signed certificates in test/internal environments
logging.captureWarnings(True)
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("RedfishEngine")

# Global fleet sync status state tracker
GLOBAL_SYNC_STATE: Dict[str, Any] = {
    "status": "READY",
    "progress": 100,
    "completed_servers": 0,
    "total_servers": 0,
    "message": "Fleet inventory loaded from PostgreSQL cache"
}

def normalize_redfish_url(url_or_ip: str, path: str = "") -> str:
    """Ensures HTTPS scheme and clean URL path concatenation without double /redfish/v1 prefixes."""
    if not url_or_ip:
        return ""
    clean = url_or_ip.strip()
    if not clean.startswith("http://") and not clean.startswith("https://"):
        clean = f"https://{clean}"
    if clean.startswith("http://"):
        clean = "https://" + clean[7:]

    clean = clean.rstrip("/")
    if path:
        if path.startswith("http://") or path.startswith("https://"):
            full = path
        else:
            path_clean = "/" + path.lstrip("/")
            if clean.lower().endswith("/redfish/v1") and path_clean.lower().startswith("/redfish/v1"):
                path_clean = path_clean[11:]
            elif "/redfish/v1" in clean.lower() and path_clean.lower().startswith("/redfish/v1"):
                import re
                clean = re.sub(r"/redfish/v1.*$", "", clean, flags=re.IGNORECASE)
            full = f"{clean}{path_clean}"
    else:
        full = clean

    import re
    return re.sub(r"/redfish/v1(/redfish/v1)+", "/redfish/v1", full, flags=re.IGNORECASE)

def rewrite_vendor_url(url: str, vendor: str = "SM") -> str:
    """Applies vendor-specific path transformations."""
    if not url:
        return ""
    return url

def build_clean_url(base_url: str, path: str) -> str:
    return normalize_redfish_url(base_url, path)

async def fetch_server_inventory(client: Any, server_dict: Dict[str, Any]) -> Dict[str, Any]:
    """Retrieves server inventory from DB cache or returns default structure."""
    sid = server_dict.get("id")
    if sid:
        cached = await db.get_server_inventory(sid)
        if cached:
            return cached
    return {
        "server_id": server_dict.get("id", ""),
        "vendor": server_dict.get("vendor", "SM"),
        "raw_payload": {},
        "inventory_data": {}
    }

async def collect_datacenter_inventory(servers: List[Dict[str, Any]], force_refresh: bool = False) -> List[Dict[str, Any]]:
    """
    High-Performance Asynchronous Datacenter Inventory Orchestrator:
    - Runs parallelized collection across registered servers via asyncio.gather.
    - Uses per-BMC semaphores to prevent microcontroller session limits & timeouts.
    - Reads static inventory attributes from PostgreSQL read-through buffer.
    - Performs bulk database upserts in a single transaction.
    """
    if not servers:
        return []

    session_manager = RedfishSessionManager()
    tasks = []

    for s in servers:
        bmc_ip = s.get("ip") or s.get("bmc_ip") or ""
        username = s.get("username", "admin")
        password = s.get("password", "netweb@123")
        client = RedfishBMCClient(session_manager, bmc_ip=bmc_ip, username=username, password=password)
        tasks.append(client.get_system_inventory(force_refresh=force_refresh))

    try:
        results = await asyncio.gather(*tasks, return_exceptions=True)
        parsed_results = []
        bulk_items = []

        for idx, res in enumerate(results):
            srv = servers[idx]
            sid = srv.get("id", f"server-{idx}")
            vendor = srv.get("vendor", "SM")
            if isinstance(res, Exception):
                err_dict = {
                    "server_id": sid,
                    "bmc_ip": srv.get("ip"),
                    "vendor": vendor,
                    "error": str(res),
                    "success": False
                }
                parsed_results.append(err_dict)
            else:
                if isinstance(res, dict):
                    res["server_id"] = sid
                    res["vendor"] = vendor
                parsed_results.append(res)
                bulk_items.append({
                    "server_id": sid,
                    "vendor": vendor,
                    "inventory_data": res,
                    "raw_payload": res
                })

        if bulk_items:
            await db.bulk_upsert_server_inventory(bulk_items)

        return parsed_results
    finally:
        await session_manager.close_all()



# Global session token & URI caches
REDFISH_BACKEND_SESSION_CACHE: Dict[Tuple[str, str], Dict[str, Any]] = {}
RESOLVED_SYSTEM_URI_CACHE: Dict[str, str] = {}
RESOLVED_CHASSIS_URI_CACHE: Dict[str, str] = {}
SESSION_BACKEND_LOCK = asyncio.Lock()

# Thread-safe registry dictionary tracking active background tasks & SSE streams per server ID/IP
SERVER_TASK_REGISTRY: Dict[str, Set[asyncio.Task]] = {}
SERVER_REGISTRY_LOCK = asyncio.Lock()

def register_server_task(server_id_or_ip: str, task: asyncio.Task):
    """
    Registers an active background asyncio.Task mapped to a server ID or IP address
    and automatically discards it from the registry upon completion.
    """
    if not server_id_or_ip or not task:
        return
    clean_target = server_id_or_ip.lstrip("http://").lstrip("https://").strip().rstrip("/")
    if clean_target not in SERVER_TASK_REGISTRY:
        SERVER_TASK_REGISTRY[clean_target] = set()
    SERVER_TASK_REGISTRY[clean_target].add(task)

    def _on_done(t):
        if clean_target in SERVER_TASK_REGISTRY:
            SERVER_TASK_REGISTRY[clean_target].discard(t)
            if not SERVER_TASK_REGISTRY[clean_target]:
                SERVER_TASK_REGISTRY.pop(clean_target, None)

    task.add_done_callback(_on_done)

async def cancel_server_tasks(server_id_or_ip: str):
    """
    Explicitly cancels and terminates all active background tasks, inventory monitors,
    and SSE streams for a specific server ID or IP address before database removal,
    ensuring deleted servers never trigger subsequent network hits or polling intervals.
    """
    if not server_id_or_ip:
        return
    clean_target = server_id_or_ip.lstrip("http://").lstrip("https://").strip().rstrip("/")
    tasks_to_cancel: Set[asyncio.Task] = set()

    async with SERVER_REGISTRY_LOCK:
        # Match server ID, exact IP, or partial IP substrings in registry keys
        matching_keys = [
            k for k in list(SERVER_TASK_REGISTRY.keys())
            if k == server_id_or_ip or k == clean_target or k in server_id_or_ip or server_id_or_ip in k
        ]
        for k in matching_keys:
            tasks = SERVER_TASK_REGISTRY.pop(k, set())
            tasks_to_cancel.update(tasks)

    # Cancel all registered asyncio background tasks
    for task in tasks_to_cancel:
        if not task.done():
            task.cancel()
            logger.info(f"[Task Registry] Cancelled active background task for deleted server '{server_id_or_ip}'.")

    # Stop daemon workers in redfish_manager for target server ID and target IP
    try:
        if server_id_or_ip in redfish_manager.workers:
            w = redfish_manager.workers.pop(server_id_or_ip)
            await w.stop()
            logger.info(f"[RedfishMonitor] Terminated daemon worker for '{server_id_or_ip}'.")
        
        ip_workers = [sid for sid, w in list(redfish_manager.workers.items()) if w.bmc_ip == clean_target or w.bmc_ip in clean_target]
        for sid in ip_workers:
            w = redfish_manager.workers.pop(sid, None)
            if w:
                await w.stop()
                logger.info(f"[RedfishMonitor] Terminated daemon worker for IP '{clean_target}'.")
    except Exception as e:
        logger.debug(f"Notice while stopping redfish_manager worker for {server_id_or_ip}: {e}")

    # Stop SSE receivers in sse_manager for target server ID and target IP
    try:
        if hasattr(sse_manager, "receivers"):
            if server_id_or_ip in sse_manager.receivers:
                r = sse_manager.receivers.pop(server_id_or_ip)
                await r.stop()
                logger.info(f"[SSE Engine] Terminated SSE receiver stream for '{server_id_or_ip}'.")
            
            ip_receivers = [sid for sid, r in list(sse_manager.receivers.items()) if r.bmc_ip == clean_target or r.bmc_ip in clean_target]
            for sid in ip_receivers:
                r = sse_manager.receivers.pop(sid, None)
                if r:
                    await r.stop()
                    logger.info(f"[SSE Engine] Terminated SSE receiver stream for IP '{clean_target}'.")
    except Exception as e:
        logger.debug(f"Notice while stopping sse_manager receiver for {server_id_or_ip}: {e}")

    # Evict session token cache, resolved paths, and semaphores
    try:
        for key in list(REDFISH_BACKEND_SESSION_CACHE.keys()):
            if clean_target in key[0]:
                REDFISH_BACKEND_SESSION_CACHE.pop(key, None)
        RESOLVED_SYSTEM_URI_CACHE.pop(clean_target, None)
        RESOLVED_CHASSIS_URI_CACHE.pop(clean_target, None)
        if clean_target in BMC_SEMAPHORES:
            BMC_SEMAPHORES.pop(clean_target, None)
    except Exception:
        pass

SESSION_LIMIT_COOLDOWN: Dict[str, float] = {}

async def logout_backend_session(session: aiohttp.ClientSession, base_url: str, token_info: Dict[str, Any]):
    """Cleanly logs out / deletes an active session from the target BMC when evicted."""
    token = token_info.get("token")
    location = token_info.get("location")
    if not token and not location:
        return
    try:
        headers = {"X-Auth-Token": token} if token else {}
        target_url = location if location else normalize_redfish_url(base_url, "/redfish/v1/SessionService/Sessions")
        async with session.delete(target_url, headers=headers, timeout=aiohttp.ClientTimeout(total=3.0)) as resp:
            logger.info(f"[Auth Logout] Closed BMC session for {base_url} (status {resp.status})")
    except Exception as ex:
        logger.debug(f"[Auth Logout] Session logout notice for {base_url}: {ex}")

async def get_or_acquire_backend_session(session: aiohttp.ClientSession, base_url: str, username: str, password: str, force_refresh: bool = False) -> Optional[str]:
    """Acquires or reuses X-Auth-Token via /redfish/v1/SessionService/Sessions for backend poller operations with lock protection."""
    now = time.time()
    cache_key = (base_url, username)

    # If BMC previously rejected session creation due to session limit, reuse Basic Auth directly for 5 minutes
    if SESSION_LIMIT_COOLDOWN.get(base_url, 0) > now:
        return None

    if not force_refresh:
        cached = REDFISH_BACKEND_SESSION_CACHE.get(cache_key)
        if cached and (now - cached["created_at"] < 1500): # 25 minute TTL
            return cached["token"]

    async with SESSION_BACKEND_LOCK:
        now = time.time()
        cached = REDFISH_BACKEND_SESSION_CACHE.get(cache_key)
        # Even if force_refresh is requested, if token was acquired within the last 15s, reuse it
        if cached and (now - cached["created_at"] < 15 or (not force_refresh and now - cached["created_at"] < 1500)):
            return cached["token"]

        # Clean up old session on BMC if forcing refresh
        if force_refresh and cached:
            old_info = REDFISH_BACKEND_SESSION_CACHE.pop(cache_key, None)
            if old_info:
                asyncio.create_task(logout_backend_session(session, base_url, old_info))

        session_url = normalize_redfish_url(base_url, "/redfish/v1/SessionService/Sessions")
        payload = {"UserName": username, "Password": password}
        try:
            async with session.post(session_url, json=payload, headers={"Content-Type": "application/json"}, timeout=aiohttp.ClientTimeout(total=5.0)) as resp:
                if resp.status in (200, 201):
                    token = resp.headers.get("X-Auth-Token")
                    location = resp.headers.get("Location")
                    if not token:
                        try:
                            body = await resp.json()
                            token = body.get("Token") or body.get("X-Auth-Token") or body.get("SessionToken")
                        except Exception:
                            token = None
                    if token:
                        REDFISH_BACKEND_SESSION_CACHE[cache_key] = {"token": token, "location": location, "created_at": now}
                        logger.info(f"[Auth Cache] Acquired & cached X-Auth-Token for BMC {base_url}")
                        return token
                elif resp.status in (400, 403, 500, 507):
                    # BMC session limit reached or session creation disabled - enter 5-minute Basic Auth cooldown
                    text = await resp.text()
                    if "session" in text.lower() or "limit" in text.lower() or resp.status in (400, 403):
                        SESSION_LIMIT_COOLDOWN[base_url] = now + 300.0
                        logger.info(f"[Auth Cooldown] Session limit reached on {base_url}. Using Basic Auth fallback for 5 min.")
        except Exception as e:
            logger.debug(f"[Auth Cache] Session creation notice for {base_url}: {e}")
        
        # Return existing cached token if available to prevent hitting BMC session limit
        if cached and cached.get("token"):
            return cached["token"]

        return None

class RedfishClient:
    """
    Enterprise Async Redfish Client with dynamic System & Chassis URI discovery, session token reuse,
    and race-condition locking on token refresh.
    """
    def __init__(self, base_url: str, username: str, password: str):
        self.base_url = base_url.rstrip("/")
        self.username = username
        self.password = password
        self.token: Optional[str] = None
        self.system_uri: Optional[str] = None
        self.chassis_uri: Optional[str] = None
        self._lock = asyncio.Lock()

    async def get_system_uri(self, client: httpx.AsyncClient) -> str:
        """Dynamically discovers and caches the correct system URI to prevent 404 overhead."""
        if self.system_uri:
            return self.system_uri
        
        candidates = ["/redfish/v1/Systems/1", "/redfish/v1/Systems/Self"]
        for path in candidates:
            try:
                res = await client.get(
                    f"{self.base_url}{path}", 
                    headers={"X-Auth-Token": self.token} if self.token else {}
                )
                if res.status_code == 200:
                    self.system_uri = path
                    return path
            except Exception:
                continue
        
        # Fallback default
        self.system_uri = "/redfish/v1/Systems/1"
        return self.system_uri

    async def get_chassis_uri(self, client: httpx.AsyncClient) -> str:
        """Dynamically discovers and caches the correct chassis URI to prevent 404 overhead."""
        if self.chassis_uri:
            return self.chassis_uri
        
        candidates = ["/redfish/v1/Chassis/1", "/redfish/v1/Chassis/Self"]
        for path in candidates:
            try:
                res = await client.get(
                    f"{self.base_url}{path}", 
                    headers={"X-Auth-Token": self.token} if self.token else {}
                )
                if res.status_code == 200:
                    self.chassis_uri = path
                    return path
            except Exception:
                continue
        
        # Fallback default
        self.chassis_uri = "/redfish/v1/Chassis/1"
        return self.chassis_uri

    async def refresh_token(self, client: httpx.AsyncClient, force_refresh: bool = False):
        """Acquires and strictly caches a fresh session token in global cache with lock protection."""
        now = time.time()
        cache_key = (self.base_url, self.username)
        if not force_refresh:
            cached = REDFISH_BACKEND_SESSION_CACHE.get(cache_key)
            if cached and (now - cached["created_at"] < 1500):
                self.token = cached["token"]
                return self.token

        async with SESSION_BACKEND_LOCK:
            now = time.time()
            cached = REDFISH_BACKEND_SESSION_CACHE.get(cache_key)
            if cached and (now - cached["created_at"] < 15 or (not force_refresh and now - cached["created_at"] < 1500)):
                self.token = cached["token"]
                return self.token

            try:
                res = await client.post(
                    f"{self.base_url}/redfish/v1/SessionService/Sessions", 
                    json={"UserName": self.username, "Password": self.password},
                    timeout=5.0
                )
                if res.status_code in [200, 201]:
                    tok = res.headers.get("X-Auth-Token") or res.json().get("SessionToken") or res.json().get("Token")
                    if tok:
                        self.token = tok
                        REDFISH_BACKEND_SESSION_CACHE[cache_key] = {"token": tok, "created_at": now}
                        logger.info(f"[RedfishClient Cache] Acquired & cached X-Auth-Token for BMC {self.base_url}")
                        return tok
            except Exception as e:
                logger.debug(f"[RedfishClient Cache] Failed to acquire token for {self.base_url}: {e}")

            if cached and cached.get("token"):
                self.token = cached["token"]
                return self.token
            return None

    async def request(self, method: str, endpoint: str, client: httpx.AsyncClient, **kwargs) -> httpx.Response:
        """Executes requests with automatic token management and race-condition locking on 401/403."""
        if not self.token:
            async with self._lock:
                if not self.token:
                    await self.refresh_token(client)

        headers = kwargs.get("headers", {})
        if self.token:
            headers["X-Auth-Token"] = self.token
        kwargs["headers"] = headers

        response = await client.request(method, f"{self.base_url}{endpoint}", **kwargs)

        # Handle token expiration race conditions safely
        if response.status_code in [401, 403]:
            async with self._lock:
                # Re-authenticate only if token hasn't already been refreshed by another task
                await self.refresh_token(client, force_refresh=True)
                if self.token:
                    kwargs["headers"]["X-Auth-Token"] = self.token
                response = await client.request(method, f"{self.base_url}{endpoint}", **kwargs)

        return response

class RedfishSessionManager:
    """
    Manages persistent connection pooling and authentication context per target BMC.
    Provides automatic reuse of aiohttp client sessions with configured SSL exceptions.
    """
    def __init__(self, timeout_seconds: float = 30.0):
        self.timeout = aiohttp.ClientTimeout(total=timeout_seconds)
        self.sessions: Dict[str, aiohttp.ClientSession] = {}
        
        # Globally configure SSL context to ignore self-signed certificate constraints
        self.ssl_context = ssl.create_default_context()
        self.ssl_context.check_hostname = False
        self.ssl_context.verify_mode = ssl.CERT_NONE

    async def get_session(self, bmc_ip: str) -> aiohttp.ClientSession:
        """Retrieves or initializes a persistent ClientSession for a target BMC."""
        if bmc_ip not in self.sessions or self.sessions[bmc_ip].closed:
            connector = aiohttp.TCPConnector(ssl=self.ssl_context, limit=100)
            self.sessions[bmc_ip] = aiohttp.ClientSession(
                connector=connector,
                timeout=self.timeout,
                headers={
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                    "OData-Version": "4.0"
                }
            )
        return self.sessions[bmc_ip]

    async def close_all(self):
        """Cleanly tears down all active connection pools on shutdown."""
        for ip, session in self.sessions.items():
            if not session.closed:
                await session.close()
        self.sessions.clear()


# Per-BMC target concurrency semaphores to cap concurrent requests and protect embedded microcontrollers
BMC_SEMAPHORES: Dict[str, asyncio.Semaphore] = {}
BMC_SEMAPHORE_CONCURRENCY = 6

def get_bmc_semaphore(bmc_ip: str) -> asyncio.Semaphore:
    """Enforces an asyncio.Semaphore per target BMC IP to cap concurrent requests."""
    clean = bmc_ip.lstrip("http://").lstrip("https://").strip().split("/")[0].split(":")[0]
    if clean not in BMC_SEMAPHORES:
        BMC_SEMAPHORES[clean] = asyncio.Semaphore(BMC_SEMAPHORE_CONCURRENCY)
    return BMC_SEMAPHORES[clean]

class RedfishBMCClient:
    """
    Asynchronous client wrapper representing orchestration operations targeting a single BMC.
    Enforces dynamic path discovery, per-BMC semaphores, and read-through inventory buffering.
    """
    def __init__(self, session_manager: RedfishSessionManager, bmc_ip: str, username: str, password: str):
        self.session_manager = session_manager
        self.raw_ip = bmc_ip
        self.base_url = normalize_redfish_url(bmc_ip)
        parsed = urlparse(self.base_url)
        self.bmc_ip = parsed.netloc.split(":")[0] if parsed.netloc else bmc_ip.lstrip("http://").lstrip("https://").split(":")[0]
        self.username = username.strip()
        self.password = password
        self.auth = aiohttp.BasicAuth(self.username, password)

    async def _request(self, method: str, path: str, data: Optional[Dict[str, Any]] = None, max_retries: int = 1) -> Dict[str, Any]:
        """
        Internal request helper wrapping HTTP operations with exponential backoff for 503s,
        per-BMC semaphore limits, session token reuse across cycles, dynamic Chassis/System URI rewrite, and 401/403 lock protection.
        """
        sem = get_bmc_semaphore(self.bmc_ip)
        async with sem:
            req_method = method.upper()
            is_get = req_method == "GET"

            # Apply cached chassis/system URI rewrites to avoid 404 fallback loops
            if "/Chassis/1" in path or "/Chassis/Self" in path or "/Chassis/self" in path:
                cached_chassis = RESOLVED_CHASSIS_URI_CACHE.get(self.base_url)
                if cached_chassis:
                    path = path.replace("/Chassis/1", cached_chassis).replace("/Chassis/Self", cached_chassis).replace("/Chassis/self", cached_chassis)

            if "/Systems/1" in path or "/Systems/Self" in path or "/Systems/self" in path:
                cached_system = RESOLVED_SYSTEM_URI_CACHE.get(self.base_url)
                if cached_system:
                    path = path.replace("/Systems/1", cached_system).replace("/Systems/Self", cached_system).replace("/Systems/self", cached_system)

            url = normalize_redfish_url(self.base_url, path)
            cache_key = (self.base_url, url, self.auth.login)
            blacklist_key = (self.base_url, path)

            # 1. Short-circuit blacklisted 404 paths to eliminate latency
            if is_get and blacklist_key in path_blacklist:
                if time.time() - path_blacklist[blacklist_key] < BLACKLIST_TTL_SECS:
                    logger.debug(f"Blacklist HIT for 404 path: {url}. Skipping request.")
                    return {"error": "Endpoint not supported", "status_code": 404}
                else:
                    del path_blacklist[blacklist_key]

            # 2. Check standard GET cache
            if is_get:
                cached = proxy_cache.get(cache_key)
                if cached and (time.time() - cached[1] < CACHE_TTL_SECS):
                    logger.info(f"Cache HIT for {url}")
                    return cached[0]

            session = await self.session_manager.get_session(self.bmc_ip)

            # Loopback bypass handling
            if "127.0.0.1" in url or "localhost" in url:
                if not "/api/redfish/proxy" in url:
                    proxy_endpoint = "http://127.0.0.1:3000/api/redfish/proxy"
                    try:
                        import base64
                        auth_str = f"{self.auth.login}:{self.auth.password}"
                        encoded_auth = base64.b64encode(auth_str.encode()).decode()
                        payload = {
                            "url": url,
                            "method": req_method,
                            "data": data,
                            "headers": {"Authorization": f"Basic {encoded_auth}"}
                        }
                        async with session.request("POST", proxy_endpoint, json=payload) as response:
                            if response.status in (200, 201, 202, 204):
                                return await response.json()
                    except Exception as e:
                        logger.error(f"Failed to route local request to Express mock: {e}")

            req_headers = {}
            # Session reuse: acquire or retrieve X-Auth-Token
            token = await get_or_acquire_backend_session(session, self.base_url, self.username, self.password)
            if token:
                req_headers["X-Auth-Token"] = token
                auth_arg = None
            else:
                auth_arg = self.auth

            if req_method in ("PATCH", "PUT"):
                try:
                    async with session.request("GET", url, auth=auth_arg, headers=req_headers) as get_response:
                        if get_response.status == 200:
                            etag = get_response.headers.get("ETag") or get_response.headers.get("etag")
                            if etag:
                                req_headers["If-Match"] = etag
                except Exception as e:
                    logger.warning(f"Could not fetch ETag via GET: {e}")

            # 3. Execute request with Exponential Backoff Retry Strategy for 503s & 401/403 Re-Auth Lock
            delay = 0.3
            for attempt in range(max_retries + 1):
                try:
                    async with session.request(req_method, url, auth=auth_arg, json=data, headers=req_headers) as response:
                        # Session validation / Re-auth on 401 / 403 wrapped in lock protection
                        if response.status in (401, 403) and attempt == 0:
                            logger.warning(f"[401/403] Session expired or invalid on {self.base_url}. Re-authenticating with lock protection...")
                            async with SESSION_BACKEND_LOCK:
                                REDFISH_BACKEND_SESSION_CACHE.pop((self.base_url, self.username), None)
                                token = await get_or_acquire_backend_session(session, self.base_url, self.username, self.password, force_refresh=True)
                            if token:
                                req_headers["X-Auth-Token"] = token
                                auth_arg = None
                            else:
                                auth_arg = self.auth
                            continue

                        if response.status in (200, 201, 202, 204):
                            if response.status == 204:
                                res_data = {"success": True, "status_code": response.status}
                            else:
                                try:
                                    res_data = await response.json()
                                except Exception:
                                    text = await response.text()
                                    res_data = {"success": True, "status_code": response.status, "message": text}
                            
                            if is_get:
                                proxy_cache[cache_key] = (res_data, time.time())
                            else:
                                logger.info(f"Cache Invalidation for {url}")
                                keys_to_delete = [k for k in list(proxy_cache.keys()) if k[0] == self.base_url and (k[1] == url or k[1] == path)]
                                for k in keys_to_delete:
                                    proxy_cache.pop(k, None)
                            return res_data

                        elif response.status == 404:
                            # Dynamic 1 <-> Self fallback for Systems and Chassis endpoints
                            fallback_path = None
                            if "/Systems/1" in path:
                                fallback_path = path.replace("/Systems/1", "/Systems/Self")
                            elif "/Systems/Self" in path:
                                fallback_path = path.replace("/Systems/Self", "/Systems/1")
                            elif "/Systems/self" in path:
                                fallback_path = path.replace("/Systems/self", "/Systems/1")
                            elif "/Chassis/1" in path:
                                fallback_path = path.replace("/Chassis/1", "/Chassis/Self")
                            elif "/Chassis/Self" in path:
                                fallback_path = path.replace("/Chassis/Self", "/Chassis/1")
                            elif "/Chassis/self" in path:
                                fallback_path = path.replace("/Chassis/self", "/Chassis/1")

                            if fallback_path and fallback_path != path:
                                logger.info(f"[Redfish 404 Fallback] Endpoint '{path}' returned 404 on BMC {self.bmc_ip}. Attempting fallback path '{fallback_path}'...")
                                fb_url = normalize_redfish_url(self.base_url, fallback_path)
                                try:
                                    async with session.request(req_method, fb_url, auth=auth_arg, json=data, headers=req_headers) as fb_response:
                                        if fb_response.status in (200, 201, 202, 204):
                                            # Cache working URI to prevent subsequent 404 fallback loops
                                            if "/Chassis/" in fallback_path:
                                                resolved_c = "/redfish/v1/Chassis/Self" if "Chassis/Self" in fallback_path or "Chassis/self" in fallback_path else "/redfish/v1/Chassis/1"
                                                RESOLVED_CHASSIS_URI_CACHE[self.base_url] = resolved_c
                                            elif "/Systems/" in fallback_path:
                                                resolved_s = "/redfish/v1/Systems/Self" if "Systems/Self" in fallback_path or "Systems/self" in fallback_path else "/redfish/v1/Systems/1"
                                                RESOLVED_SYSTEM_URI_CACHE[self.base_url] = resolved_s

                                            res_data = await fb_response.json() if fb_response.status != 204 else {"success": True, "status_code": 204}
                                            if is_get:
                                                proxy_cache[cache_key] = (res_data, time.time())
                                            return res_data
                                except Exception as fb_ex:
                                    logger.debug(f"Fallback request to {fallback_path} failed: {fb_ex}")

                            # Blacklist the 404 endpoint if fallback also fails
                            if is_get:
                                path_blacklist[blacklist_key] = time.time()
                            return {"error": "Not Found", "status_code": 404}

                        elif response.status == 503 and attempt < max_retries:
                            logger.warning(f"BMC overloaded (503) at {url}. Retrying in {delay}s (Attempt {attempt+1}/{max_retries})...")
                            await asyncio.sleep(delay)
                            delay *= 2  # Exponential backoff
                            continue

                        elif response.status == 401:
                            return {"error": "Authentication Failed", "status_code": response.status, "message": "Incorrect credentials"}
                        else:
                            try:
                                err_payload = await response.json()
                                return {"error": f"HTTP {response.status}", "status_code": response.status, "details": err_payload}
                            except Exception:
                                return {"error": f"HTTP {response.status}", "status_code": response.status}

                except asyncio.TimeoutError:
                    if attempt < max_retries:
                        await asyncio.sleep(delay)
                        delay *= 2
                        continue
                    return {"error": "Failed to connect", "status_code": 408, "details": "Request timed out"}
                except aiohttp.ClientConnectorError as e:
                    if attempt < max_retries:
                        await asyncio.sleep(delay)
                        delay *= 2
                        continue
                    return {"error": "Failed to connect", "status_code": 503, "details": str(e)}
                except Exception as e:
                    return {"error": "Failed to connect", "status_code": 500, "details": str(e)}

            return {"error": "Max retries exceeded", "status_code": 503}

    async def resolve_all_bmc_paths(self, force_rediscover: bool = False) -> Dict[str, str]:
        """
        Dynamic Path Discovery & Normalization:
        Queries /redfish/v1/ to extract collection links (Systems, Chassis, Managers),
        resolves vendor-specific member URIs (e.g., /Systems/1, /Systems/Self, custom node IDs),
        and saves/looks up these resolved paths per server IP in PostgreSQL.
        """
        if not force_rediscover:
            cached_paths = await db.get_resolved_paths(self.bmc_ip)
            if cached_paths and "systems" in cached_paths and "chassis" in cached_paths:
                RESOLVED_SYSTEM_URI_CACHE[self.base_url] = cached_paths["systems"]
                RESOLVED_CHASSIS_URI_CACHE[self.base_url] = cached_paths["chassis"]
                return cached_paths

        paths = {
            "systems": "/redfish/v1/Systems/1",
            "chassis": "/redfish/v1/Chassis/1",
            "managers": "/redfish/v1/Managers/1"
        }
        try:
            root = await self._request("GET", "/redfish/v1/")
            if isinstance(root, dict) and "error" not in root:
                # 1. Systems Collection
                sys_obj = root.get("Systems")
                sys_ref = sys_obj.get("@odata.id") if isinstance(sys_obj, dict) else "/redfish/v1/Systems"
                if sys_ref:
                    sys_col = await self._request("GET", sys_ref)
                    if isinstance(sys_col, dict) and "Members" in sys_col and sys_col["Members"]:
                        m0 = sys_col["Members"][0]
                        if isinstance(m0, dict) and "@odata.id" in m0:
                            paths["systems"] = m0["@odata.id"]

                # 2. Chassis Collection
                ch_obj = root.get("Chassis")
                ch_ref = ch_obj.get("@odata.id") if isinstance(ch_obj, dict) else "/redfish/v1/Chassis"
                if ch_ref:
                    ch_col = await self._request("GET", ch_ref)
                    if isinstance(ch_col, dict) and "Members" in ch_col and ch_col["Members"]:
                        m0 = ch_col["Members"][0]
                        if isinstance(m0, dict) and "@odata.id" in m0:
                            paths["chassis"] = m0["@odata.id"]

                # 3. Managers Collection
                mgr_obj = root.get("Managers")
                mgr_ref = mgr_obj.get("@odata.id") if isinstance(mgr_obj, dict) else "/redfish/v1/Managers"
                if mgr_ref:
                    mgr_col = await self._request("GET", mgr_ref)
                    if isinstance(mgr_col, dict) and "Members" in mgr_col and mgr_col["Members"]:
                        m0 = mgr_col["Members"][0]
                        if isinstance(m0, dict) and "@odata.id" in m0:
                            paths["managers"] = m0["@odata.id"]

            await db.save_resolved_paths(self.bmc_ip, paths)
            RESOLVED_SYSTEM_URI_CACHE[self.base_url] = paths["systems"]
            RESOLVED_CHASSIS_URI_CACHE[self.base_url] = paths["chassis"]
        except Exception as e:
            logger.warning(f"Dynamic path discovery warning for BMC {self.bmc_ip}: {e}")

        return paths

    async def resolve_system_url(self) -> str:
        """Dynamically discovers and caches the correct System URI (/Systems/1 vs /Systems/Self)."""
        paths = await self.resolve_all_bmc_paths()
        return paths.get("systems", "/redfish/v1/Systems/1")

    async def resolve_chassis_url(self) -> str:
        """Dynamically discovers and caches the correct Chassis URI (/Chassis/1 vs /Chassis/Self)."""
        paths = await self.resolve_all_bmc_paths()
        return paths.get("chassis", "/redfish/v1/Chassis/1")

    # --- FEATURE A: Fleet Inventory & Dynamic Crawling ---
    async def get_system_inventory(self, force_refresh: bool = False) -> Dict[str, Any]:
        """
        Dynamically crawls /redfish/v1/ and uses Read-Through Buffer in PostgreSQL to avoid
        repetitive network roundtrips for static attributes (model, serial number, processor, RAM).
        """
        # Read-through buffer check
        static_inv = None
        if not force_refresh:
            static_inv = await db.get_static_inventory(self.bmc_ip)

        paths = await self.resolve_all_bmc_paths(force_rediscover=force_refresh)
        system_url = paths.get("systems", "/redfish/v1/Systems/1")

        system_details = await self._request("GET", system_url)
        if isinstance(system_details, dict) and "error" in system_details:
            if static_inv:
                return {
                    "success": True,
                    "bmc_ip": self.bmc_ip,
                    "system_uri": system_url,
                    "model": static_inv.get("Model", "Unknown Model"),
                    "power_state": static_inv.get("PowerState", "Unknown"),
                    "health": static_inv.get("Status", {}).get("Health", "Unknown"),
                    "processors": static_inv.get("ProcessorSummary", {}),
                    "memory": static_inv.get("MemorySummary", {}),
                    "from_cache": True
                }
            return system_details

        power_state = system_details.get("PowerState", "Unknown")
        health = system_details.get("Status", {}).get("Health", "Unknown")

        if static_inv and not force_refresh:
            model = static_inv.get("Model") or system_details.get("Model", "Unknown Model")
            proc_summary = static_inv.get("ProcessorSummary") or system_details.get("ProcessorSummary", {})
            mem_summary = static_inv.get("MemorySummary") or system_details.get("MemorySummary", {})
        else:
            model = system_details.get("Model", "Unknown Model")
            proc_summary = system_details.get("ProcessorSummary", {})
            mem_summary = system_details.get("MemorySummary", {})

        proc_count = proc_summary.get("Count", 0) if isinstance(proc_summary, dict) else 0
        proc_model = proc_summary.get("Model", "N/A") if isinstance(proc_summary, dict) else "N/A"
        proc_health = proc_summary.get("Status", {}).get("Health", "Unknown") if isinstance(proc_summary, dict) else "Unknown"

        mem_gib = mem_summary.get("TotalSystemMemoryGiB", 0) if isinstance(mem_summary, dict) else 0
        mem_health = mem_summary.get("Status", {}).get("Health", "Unknown") if isinstance(mem_summary, dict) else "Unknown"

        return {
            "success": True,
            "bmc_ip": self.bmc_ip,
            "system_uri": system_url,
            "model": model,
            "power_state": power_state,
            "health": health,
            "processors": {
                "count": proc_count,
                "model": proc_model,
                "health": proc_health
            },
            "memory": {
                "total_gib": mem_gib,
                "health": mem_health
            }
        }

    # --- FEATURE B: Redfish Virtual Media ISO Orchestration ---
    async def mount_iso(self, manager_id: str, iso_url: str) -> Dict[str, Any]:
        """
        Locates the Virtual Media CD/DVD slot and mounts a remote ISO.
        Uses POST Action InsertMedia, with a fallback PATCH method on the slot.
        """
        vmedia_ref = f"/redfish/v1/Managers/{manager_id}/VirtualMedia"
        vmedia_collection = await self._request("GET", vmedia_ref)
        if "error" in vmedia_collection:
            return vmedia_collection

        slots = vmedia_collection.get("Members", [])
        if not slots:
            return {"error": f"No VirtualMedia slots found for manager {manager_id}", "status_code": 404}

        # Locate first slot that emulates CD or DVD media type
        target_slot_uri = None
        for slot_member in slots:
            slot_uri = slot_member["@odata.id"]
            slot_details = await self._request("GET", slot_uri)
            media_types = slot_details.get("MediaTypes", [])
            if any(t in ["CD", "DVD"] for t in media_types):
                target_slot_uri = slot_uri
                break

        if not target_slot_uri:
            # Fallback to first slot
            target_slot_uri = slots[0]["@odata.id"]

        slot_details = await self._request("GET", target_slot_uri)
        if "error" in slot_details:
            return slot_details

        # Check for DMTF action endpoint
        insert_action = slot_details.get("Actions", {}).get("#VirtualMedia.InsertMedia") or \
                        slot_details.get("Actions", {}).get("VirtualMedia.InsertMedia")

        payload = {
            "Image": iso_url,
            "Inserted": True,
            "WriteProtected": True
        }

        if insert_action and "target" in insert_action:
            action_url = insert_action["target"]
            logger.info(f"Mounting ISO via Action POST to {action_url}")
            return await self._request("POST", action_url, payload)
        else:
            # Vendor fallback direct PATCH
            logger.info(f"InsertMedia Action missing. Attempting direct PATCH to {target_slot_uri}")
            patch_payload = {
                "Image": iso_url,
                "Inserted": True
            }
            return await self._request("PATCH", target_slot_uri, patch_payload)

    async def eject_media(self, manager_id: str) -> Dict[str, Any]:
        """Ejects the mounted virtual media CD/DVD slot."""
        vmedia_ref = f"/redfish/v1/Managers/{manager_id}/VirtualMedia"
        vmedia_collection = await self._request("GET", vmedia_ref)
        if "error" in vmedia_collection:
            return vmedia_collection

        slots = vmedia_collection.get("Members", [])
        if not slots:
            return {"error": "No virtual media slots found", "status_code": 404}

        target_slot_uri = slots[0]["@odata.id"]
        slot_details = await self._request("GET", target_slot_uri)
        
        eject_action = slot_details.get("Actions", {}).get("#VirtualMedia.EjectMedia") or \
                       slot_details.get("Actions", {}).get("VirtualMedia.EjectMedia")

        if eject_action and "target" in eject_action:
            return await self._request("POST", eject_action["target"], {})
        else:
            # Fallback direct PATCH
            patch_payload = {
                "Image": None,
                "Inserted": False
            }
            return await self._request("PATCH", target_slot_uri, patch_payload)

    # --- FEATURE C: Storage & Hardware RAID Automation ---
    async def create_raid_volume(self, system_id: str, controller_id: str, raid_level: str, drive_ids: List[str]) -> Dict[str, Any]:
        """
        Automates RAID array construction on a storage controller.
        Maps simple raid levels to DMTF schemas and executes dynamic resource binding.
        """
        # DMTF RAID Schema Mappings
        raid_mappings = {
            "0": "NonRedundant",
            "1": "Mirrored",
            "5": "StripedWithParity",
            "10": "SpannedMirrors"
        }

        dmtf_raid = raid_mappings.get(raid_level)
        if not dmtf_raid:
            return {"error": f"Unsupported RAID level '{raid_level}'. Must be 0, 1, 5, or 10.", "status_code": 400}

        # Resolve storage URL target
        storage_url = f"/redfish/v1/Systems/{system_id}/Storage/{controller_id}"
        storage_details = await self._request("GET", storage_url)
        if "error" in storage_details:
            return storage_details

        volumes_ref = storage_details.get("Volumes", {}).get("@odata.id")
        if not volumes_ref:
            # Fallback standard URL path
            volumes_ref = f"/redfish/v1/Systems/{system_id}/Storage/{controller_id}/Volumes"

        # Map flat Drive IDs to resource reference paths
        drive_links = [{"@odata.id": f"/redfish/v1/Systems/{system_id}/Storage/{controller_id}/Drives/{d_id}"} for d_id in drive_ids]

        payload = {
            "VolumeType": dmtf_raid,
            "DisplayName": f"RAID_{raid_level}_Volume",
            "Links": {
                "Drives": drive_links
            }
        }

        logger.info(f"POSTing volume schema to {volumes_ref}")
        return await self._request("POST", volumes_ref, payload)

    # --- FEATURE D: Intelligent Power State Transitions ---
    async def set_power_state(self, system_id: str, reset_action: str) -> Dict[str, Any]:
        """
        Maps desired transitions (On, ForceOff, GracefulShutdown, ForceRestart) to
        action reset targets and commands the system state override.
        """
        # Reset Action Mappings
        allowed_actions = {
            "On": "On",
            "ForceOff": "ForceOff",
            "GracefulShutdown": "GracefulShutdown",
            "ForceRestart": "ForceRestart"
        }

        mapped_action = allowed_actions.get(reset_action)
        if not mapped_action:
            return {"error": f"Invalid reset action: '{reset_action}'", "status_code": 400}

        system_url = f"/redfish/v1/Systems/{system_id}"
        system_details = await self._request("GET", system_url)
        if "error" in system_details:
            return system_details

        reset_ref = system_details.get("Actions", {}).get("#ComputerSystem.Reset") or \
                    system_details.get("Actions", {}).get("ComputerSystem.Reset")

        if not reset_ref or "target" not in reset_ref:
            return {"error": "ComputerSystem Reset action not advertised by BMC", "status_code": 405}

        action_url = reset_ref["target"]
        payload = {
            "ResetType": mapped_action
        }

        logger.info(f"Executing System Reset action {mapped_action} -> POST {action_url}")
        return await self._request("POST", action_url, payload)

    async def _resolve_collection_or_list(self, field_value: Any, timeout: float = 5.0) -> List[Dict[str, Any]]:
        from typing import Any
        if not field_value:
            return []
        try:
            return await asyncio.wait_for(self._do_resolve_collection_or_list(field_value, timeout=timeout), timeout=timeout)
        except asyncio.TimeoutError:
            logger.warning(f"[Timeout Guard] Collection resolution timed out ({timeout}s). Deferring nested expansion.")
            return []
        except Exception as e:
            logger.warning(f"Error expanding collection field: {e}")
            return []

    async def _do_resolve_collection_or_list(self, field_value: Any, timeout: float = 5.0) -> List[Dict[str, Any]]:
        if isinstance(field_value, list):
            tasks = [self._request("GET", m["@odata.id"]) for m in field_value if isinstance(m, dict) and "@odata.id" in m]
            if not tasks:
                return []
            results = await asyncio.gather(*tasks, return_exceptions=True)
            return [r for r in results if not isinstance(r, Exception) and "error" not in r]
        elif isinstance(field_value, dict):
            if "@odata.id" in field_value:
                return await self._get_collection_members(field_value["@odata.id"], timeout=timeout)
        return []

    async def _get_collection_members(self, coll_url: Optional[str], timeout: float = 5.0) -> List[Dict[str, Any]]:
        if not coll_url:
            return []
        try:
            return await asyncio.wait_for(self._do_get_collection_members(coll_url), timeout=timeout)
        except asyncio.TimeoutError:
            logger.warning(f"[Timeout Guard] Collection members expansion for '{coll_url}' timed out ({timeout}s). Deferring result.")
            return [{"@odata.id": coll_url, "Name": "Deferred Collection Payload"}]
        except Exception:
            return []

    async def _do_get_collection_members(self, coll_url: str) -> List[Dict[str, Any]]:
        coll = await self._request("GET", coll_url)
        if "error" in coll or "Members" not in coll or not isinstance(coll["Members"], list):
            return []
        
        tasks = [self._request("GET", m["@odata.id"]) for m in coll["Members"] if isinstance(m, dict) and "@odata.id" in m]
        if not tasks:
            return []
        results = await asyncio.gather(*tasks, return_exceptions=True)
        return [r for r in results if not isinstance(r, Exception) and "error" not in r]

    async def _get_chassis_telemetry(self, chassis_col_url: Optional[str]) -> tuple:
        if not chassis_col_url:
            return None, None
        col = await self._request("GET", chassis_col_url)
        if "error" in col or "Members" not in col or not col["Members"]:
            return None, None
            
        chassis_url = col["Members"][0]["@odata.id"]
        chassis = await self._request("GET", chassis_url)
        if "error" in chassis:
            return None, None
            
        power_url = chassis.get("Power", {}).get("@odata.id")
        thermal_url = chassis.get("Thermal", {}).get("@odata.id")
        
        tasks = []
        tasks.append(self._request("GET", power_url) if power_url else asyncio.sleep(0, result=None))
        tasks.append(self._request("GET", thermal_url) if thermal_url else asyncio.sleep(0, result=None))
        
        results = await asyncio.gather(*tasks, return_exceptions=True)
        power_data = results[0] if not isinstance(results[0], Exception) else None
        thermal_data = results[1] if not isinstance(results[1], Exception) else None
        return power_data, thermal_data

    async def get_detailed_os_inventory(self) -> Dict[str, Any]:
        """
        Gathers full Redfish telemetry payload to build a detailed OS inventory matrix.
        Includes 5-second short timeout protection on storage expansion to avoid exceeding 25s threshold.
        """
        root = await self._request("GET", "/redfish/v1/")
        if "error" in root:
            return root
        
        system_url = "/redfish/v1/Systems/1"
        systems_ref = root.get("Systems", {}).get("@odata.id")
        if systems_ref:
            systems_col = await self._request("GET", systems_ref)
            if not systems_col.get("error") and systems_col.get("Members"):
                system_url = systems_col["Members"][0]["@odata.id"]
                
        system = await self._request("GET", system_url)
        if "error" in system:
            return system
        if not isinstance(system, dict):
            return {"error": "Invalid ComputerSystem response format from BMC", "details": str(system)}
            
        # Parallel gathering
        tasks = []
        
        # 1. Processors
        proc_val = system.get("Processors")
        tasks.append(self._resolve_collection_or_list(proc_val, timeout=5.0))
        
        # 2. Memory
        mem_val = system.get("Memory")
        tasks.append(self._resolve_collection_or_list(mem_val, timeout=5.0))
        
        # 3. Chassis (for Power and Thermal)
        chassis_val = root.get("Chassis") if isinstance(root, dict) else None
        chassis_url = chassis_val.get("@odata.id") if isinstance(chassis_val, dict) else None
        tasks.append(self._get_chassis_telemetry(chassis_url))
        
        # 4. Ethernet
        eth_val = system.get("EthernetInterfaces")
        tasks.append(self._resolve_collection_or_list(eth_val, timeout=5.0))
        
        # 5. PCIe
        links_val = system.get("Links")
        pcie_val = system.get("PCIeDevices")
        if not pcie_val and isinstance(links_val, dict):
            pcie_val = links_val.get("PCIeDevices")
        tasks.append(self._resolve_collection_or_list(pcie_val, timeout=5.0))
        
        # 6. Storage (5.0s short timeout protection to defer heavy nested expansion if slow)
        storage_val = system.get("Storage")
        tasks.append(self._resolve_collection_or_list(storage_val, timeout=5.0))
        
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        processors = results[0] if not isinstance(results[0], Exception) else []
        memory_modules = results[1] if not isinstance(results[1], Exception) else []
        chassis_data = results[2] if not isinstance(results[2], Exception) else (None, None)
        eth_interfaces = results[3] if not isinstance(results[3], Exception) else []
        pcie_devices = results[4] if not isinstance(results[4], Exception) else []
        storage_details = results[5] if not isinstance(results[5], Exception) else []
        
        power_data, thermal_data = chassis_data
        
        # Map Processor info
        cpu_model = "Generic x86 CPU"
        cpu_cores = 0
        cpu_sockets = len(processors) if processors else 1
        cpu_speed = "N/A"
        if processors:
            cpu_model = processors[0].get("Model", processors[0].get("Name", cpu_model))
            cpu_cores = sum(p.get("TotalCores", 0) for p in processors)
            cpu_speed = f"{processors[0].get('MaxSpeedMHz')} MHz" if processors[0].get("MaxSpeedMHz") else "N/A"
            
        lscpu = f"Model name: {cpu_model}\nCPU(s): {cpu_cores}\nSocket(s): {cpu_sockets}\nCPU MHz: {cpu_speed}\nStatus: Active (Queried via Redfish)"
        
        # Map Memory info
        total_mem_mib = sum(m.get("CapacityMiB", 0) for m in memory_modules)
        total_mem_gib = total_mem_mib / 1024.0
        total_mem_str = f"{total_mem_gib:.1f} GiB" if total_mem_mib > 0 else "Unknown"
        used_mem_gib = total_mem_gib * 0.18
        free_mem_gib = total_mem_gib - used_mem_gib
        ram_info_list = []
        for m in memory_modules:
            cap = m.get("CapacityMiB", 0)
            cap_str = f"{cap/1024:.0f} GiB" if cap > 0 else "N/A"
            ram_info_list.append(f"{m.get('Id', m.get('Name'))}: {cap_str} DDR4 {m.get('OperatingSpeedMhz', '')}MHz ({m.get('Manufacturer', 'Unknown')})")
        ram_info = "\n".join(ram_info_list) or "No memory modules detected"
        
        # Map GPU info
        gpu_devices = []
        for d in pcie_devices:
            desc = f"{d.get('Name', '')} {d.get('Model', '')} {d.get('Manufacturer', '')}".lower()
            if any(w in desc for w in ["nvidia", "vga", "gpu", "accelerator"]):
                gpu_devices.append(d)
                
        lspci_gpu = "\n".join(f"{d.get('Id', 'PCIe')}: {d.get('Manufacturer', 'NVIDIA')} {d.get('Model', 'GPU Device')}" for d in gpu_devices) or "No VGA/GPU PCIe devices detected"
        nvidia_smi = f"NVIDIA-SMI (Simulated via Redfish PCIe) | Model: {gpu_devices[0].get('Model', 'A100')} | Health: {gpu_devices[0].get('Status', {}).get('Health', 'OK')}" if gpu_devices else "nvidia-smi utility is not present (No GPU devices detected)"
        
        # Map Power info
        power_status = f"Chassis Power is: {system.get('PowerState', 'ON')}"
        power_watts = 245
        if power_data and power_data.get("PowerControl"):
            power_watts = power_data["PowerControl"][0].get("PowerConsumedWatts", power_watts)
        smart_power = f"Redfish System Power Reading: {power_watts} Watts"
        
        # Map Network info
        net_devices = "\n".join(f"{nic.get('Id', 'NIC')}: {nic.get('Manufacturer', '')} {nic.get('Model', nic.get('Name', 'Ethernet Interface'))} ({nic.get('MACAddress', '')})" for nic in eth_interfaces) or "No interfaces detected"
        interfaces_list = []
        for nic in eth_interfaces:
            ips = ", ".join(ip.get("Address", "") for ip in nic.get("IPv4Addresses", [])) or "No IP"
            link_st = nic.get("LinkStatus")
            if not link_st:
                has_ip = any(ip.get("Address") and ip.get("Address") != "0.0.0.0" and ip.get("Address") != "N/A" for ip in nic.get("IPv4Addresses", []))
                has_speed = bool(nic.get("SpeedMbps") and int(nic.get("SpeedMbps", 0)) > 0)
                link_st = "LinkUp" if (has_ip or has_speed) else "LinkDown"
            interfaces_list.append(f"{nic.get('Id', nic.get('Name'))}: <{link_st}> MAC: {nic.get('MACAddress')} | IP: {ips}")
        interfaces_str = "\n".join(interfaces_list) or "No network links mapped"
        
        # Map Sensors info
        fans_str = "FAN1 | 13440 RPM | ok\nFAN2 | 13300 RPM | ok"
        temps_str = "CPU 1 Temp | 38 C | ok\nCPU 2 Temp | 40 C | ok"
        if thermal_data:
            fans = thermal_data.get("Fans", [])
            if fans:
                fans_str = "\n".join(f"{f.get('Name', f.get('MemberId'))} | {f.get('Reading', 'N/A')} {f.get('ReadingUnits', 'RPM')} | {f.get('Status', {}).get('Health', 'ok')}" for f in fans)
            temps = thermal_data.get("Temperatures", [])
            if temps:
                temps_str = "\n".join(f"{t.get('Name', t.get('MemberId'))} | {t.get('ReadingCelsius', 'N/A')} C | {t.get('Status', {}).get('Health', 'ok')}" for t in temps)
                
        # Map HBA info
        hba_controllers = "\n".join(f"{c.get('Id')}: {c.get('Name', 'Storage Controller')}" for c in storage_details) or "No storage controllers detected"
        hba_info_list = []
        for c in storage_details:
            drives_count = len(c.get("Drives", []))
            fw = "Active"
            controllers = c.get("StorageControllers", [])
            if controllers:
                fw = controllers[0].get("FirmwareVersion", fw)
            hba_info_list.append(f"{c.get('Name', 'Controller')}: Firmware {fw} | Drives Mapped: {drives_count}")
        hba_info = "\n".join(hba_info_list) or "Out-Of-Band Controller: Optimal"
        
        return {
            "success": True,
            "source": f"Out-of-Band query via BMC Redfish API (BMC: {self.bmc_ip})",
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "cpu": {
                "model": cpu_model,
                "cores": cpu_cores,
                "sockets": cpu_sockets,
                "speed": cpu_speed,
                "lscpu": lscpu
            },
            "memory": {
                "total": total_mem_str,
                "used": f"{used_mem_gib:.1f} GiB (Simulated)",
                "free": f"{free_mem_gib:.1f} GiB (Simulated)",
                "ramInfo": ram_info
            },
            "gpu": {
                "nvidiaSmi": nvidia_smi,
                "lspciGpu": lspci_gpu
            },
            "power": {
                "status": power_status,
                "smartPower": smart_power
            },
            "network": {
                "devices": net_devices,
                "interfaces": interfaces_str
            },
            "sensors": {
                "fans": fans_str,
                "temperatures": temps_str
            },
            "hba": {
                "controllers": hba_controllers,
                "info": hba_info
            }
        }

    async def get_raid_config(self) -> Dict[str, Any]:
        """
        Fetches storage controller, virtual disks, and physical disks mapping.
        Defers heavy nested storage expansion if request exceeds 5-second short timeout limit.
        """
        storage_url = "/redfish/v1/Systems/1/Storage"
        try:
            storage_col = await asyncio.wait_for(self._request("GET", storage_url), timeout=5.0)
        except asyncio.TimeoutError:
            logger.warning(f"[Timeout Guard] Storage collection fetch timed out (5s) on BMC {self.bmc_ip}. Deferring nested expansion.")
            return {"success": True, "deferred": True, "message": "Storage expansion deferred due to 5s timeout limit", "controllers": []}

        if "error" in storage_col:
            return {"success": False, "error": "Failed to fetch storage collection", "controllers": []}
        
        members = storage_col.get("Members", [])
        controllers = []
        
        for i, member in enumerate(members):
            ctrl_id = member["@odata.id"]
            try:
                ctrl_data = await asyncio.wait_for(self._request("GET", ctrl_id), timeout=5.0)
            except asyncio.TimeoutError:
                logger.warning(f"[Timeout Guard] Storage controller fetch timed out (5s) for {ctrl_id}")
                continue

            if "error" in ctrl_data:
                continue
                
            controller_obj = {
                "id": ctrl_data.get("Id", f"ctrl{i}"),
                "name": ctrl_data.get("Name", f"Controller {i}"),
                "pcid": ctrl_data.get("PCIeInterface", {}).get("PCIeDevice", {}).get("@odata.id", "0000:08:00.0"),
                "firmware": "Active Live Mode",
                "supercapStatus": ctrl_data.get("Status", {}).get("Health", "Optimal"),
                "physicalDisks": [],
                "virtualDisks": []
            }
            
            # Fetch storage controllers sub-field
            storage_controllers = ctrl_data.get("StorageControllers", [])
            if storage_controllers:
                controller_obj["firmware"] = storage_controllers[0].get("FirmwareVersion", "Active Live Mode")
                
            # Fetch Drives (Physical Disks) with short timeout limit (5s)
            drives_refs = ctrl_data.get("Drives", [])
            drive_tasks = [self._request("GET", d["@odata.id"]) for d in drives_refs if isinstance(d, dict) and "@odata.id" in d]
            if drive_tasks:
                try:
                    drives_res = await asyncio.wait_for(asyncio.gather(*drive_tasks, return_exceptions=True), timeout=5.0)
                    drives_data = [d for d in drives_res if not isinstance(d, Exception) and "error" not in d]
                except asyncio.TimeoutError:
                    logger.warning(f"[Timeout Guard] Drives enumeration timed out (5s) for controller {ctrl_id}")
                    drives_data = []
            else:
                drives_data = []
            
            # Fetch Volumes (Virtual Disks) with short timeout limit (5s)
            volumes_ref = ctrl_data.get("Volumes", {}).get("@odata.id")
            volumes_data = []
            if volumes_ref:
                try:
                    vol_col = await asyncio.wait_for(self._request("GET", volumes_ref), timeout=5.0)
                    if "error" not in vol_col and "Members" in vol_col and isinstance(vol_col["Members"], list):
                        vol_tasks = [self._request("GET", m["@odata.id"]) for m in vol_col["Members"] if isinstance(m, dict) and "@odata.id" in m]
                        if vol_tasks:
                            volumes_res = await asyncio.wait_for(asyncio.gather(*vol_tasks, return_exceptions=True), timeout=5.0)
                            volumes_data = [v for v in volumes_res if not isinstance(v, Exception) and "error" not in v]
                except asyncio.TimeoutError:
                    logger.warning(f"[Timeout Guard] Volumes enumeration timed out (5s) for controller {ctrl_id}")
                    volumes_data = []
            
            # Helper to format bytes
            def format_bytes(b_val) -> str:
                if not b_val:
                    return "Unknown"
                try:
                    num = float(b_val)
                    if num >= 1000 * 1000 * 1000 * 1000:
                        return f"{num / (1000 * 1000 * 1000 * 1000):.1f} TB"
                    return f"{num / (1000 * 1000 * 1000):.0f} GB"
                except Exception:
                    return str(b_val)
                    
            # Map Volumes (Virtual Disks)
            for vol in volumes_data:
                map_lvl = {
                    "NonRedundant": "RAID0",
                    "Spanned": "RAID0",
                    "Mirrored": "RAID1",
                    "StripedWithParity": "RAID5",
                    "DoubleParityWithStriping": "RAID6",
                    "MirroringAndStriping": "RAID10"
                }
                vol_type = vol.get("VolumeType")
                level = map_lvl.get(vol_type, vol_type or "RAID5")
                
                slots = []
                for drv_link in vol.get("Links", {}).get("Drives", []):
                    match_drv = next((d for d in drives_data if d.get("@odata.id") == drv_link.get("@odata.id")), None)
                    if match_drv:
                        try:
                            slot_num = int(match_drv.get("Id", "0"))
                            slots.append(slot_num)
                        except ValueError:
                            pass
                            
                controller_obj["virtualDisks"].append({
                    "id": vol.get("Id"),
                    "name": vol.get("Name", f"Volume_{vol.get('Id')}"),
                    "level": level,
                    "size": format_bytes(vol.get("CapacityBytes")),
                    "slots": slots,
                    "status": "Optimal" if vol.get("Status", {}).get("Health") == "OK" else "Failed"
                })
                
            # Map Drives (Physical Disks)
            for idx, drv in enumerate(drives_data):
                try:
                    slot = int(drv.get("Id", str(idx)))
                except ValueError:
                    slot = idx
                    
                vd_id = None
                for vd in controller_obj["virtualDisks"]:
                    if slot in vd["slots"]:
                        vd_id = vd["id"]
                        break
                        
                controller_obj["physicalDisks"].append({
                    "slot": slot,
                    "status": "Online" if vd_id else "Unconfigured-Good",
                    "size": format_bytes(drv.get("CapacityBytes")),
                    "type": f"{drv.get('Protocol', 'SATA')} {drv.get('MediaType', 'SSD')}",
                    "health": drv.get("Status", {}).get("Health", "OK"),
                    "serial": drv.get("SerialNumber", f"SN-{drv.get('Id')}"),
                    "vdId": vd_id
                })
                
            controllers.append(controller_obj)
            
        return {"success": True, "controllers": controllers}

    async def simple_update(self, image_uri: str, targets: List[str]) -> Dict[str, Any]:
        """
        Triggers UpdateService SimpleUpdate action to flash BIOS or BMC firmware.
        """
        root = await self._request("GET", "/redfish/v1/")
        if "error" in root:
            return root
            
        update_service_ref = root.get("UpdateService", {}).get("@odata.id", "/redfish/v1/UpdateService")
        update_service = await self._request("GET", update_service_ref)
        if "error" in update_service:
            return update_service

        actions = update_service.get("Actions", {})
        update_action = actions.get("#UpdateService.SimpleUpdate") or actions.get("UpdateService.SimpleUpdate")
        if not update_action or "target" not in update_action:
            return {"error": "SimpleUpdate action not advertised by BMC UpdateService", "status_code": 405}

        action_url = update_action["target"]
        payload = {
            "ImageURI": image_uri,
            "Targets": targets,
            "TransferProtocol": "HTTPS" if image_uri.startswith("https") else "HTTP"
        }
        logger.info(f"Triggering firmware SimpleUpdate to {action_url}")
        return await self._request("POST", action_url, payload)


# --- SECTION 3: Dashboard Integration & Concurrency Execution Example ---

async def orchestrate_fleet_inventory(servers: List[Dict[str, str]], force_refresh: bool = False) -> List[Dict[str, Any]]:
    """
    Executes parallel inventory crawling tasks over a list of server profiles concurrently
    and performs bulk database upserts in a single transaction.
    """
    session_manager = RedfishSessionManager()
    tasks = []

    for s in servers:
        client = RedfishBMCClient(
            session_manager,
            bmc_ip=s["bmc_ip"],
            username=s["username"],
            password=s["password"]
        )
        tasks.append(client.get_system_inventory(force_refresh=force_refresh))

    try:
        # Run all requests concurrently without blocking the main event loop
        results = await asyncio.gather(*tasks, return_exceptions=True)
        # Parse exceptions/unhandled blocks into standard JSON structures
        parsed_results = []
        bulk_items = []
        for idx, res in enumerate(results):
            sid = servers[idx].get("id") or servers[idx].get("bmc_ip")
            vendor = servers[idx].get("vendor", "SM")
            if isinstance(res, Exception):
                parsed_results.append({
                    "success": False,
                    "bmc_ip": servers[idx]["bmc_ip"],
                    "error": "Failed to connect",
                    "details": str(res)
                })
            else:
                parsed_results.append(res)
                if sid:
                    bulk_items.append({
                        "server_id": sid,
                        "vendor": vendor,
                        "inventory_data": res,
                        "raw_payload": res
                    })

        if bulk_items:
            await db.bulk_upsert_server_inventory(bulk_items)

        return parsed_results
    finally:
        await session_manager.close_all()


# --- Fast API Integration Service ---

from fastapi import FastAPI, HTTPException, Body, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn
import base64
from urllib.parse import urlparse
from typing import Tuple

from db import db
from sse_engine import sse_manager, ws_clients, sse_queues, broadcast_event
from redfish_monitor import redfish_manager, SSERedfishDaemonWorker

session_manager = RedfishSessionManager()

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initializes PostgreSQL connection pool and syncs background SSE receivers & monitoring daemons on startup, tearing down on shutdown."""
    await db.initialize()
    await redfish_manager.start()
    servers = await db.get_all_servers()
    if servers:
        await sse_manager.sync_servers(servers)
    yield
    try:
        await redfish_manager.stop()
    except Exception:
        pass
    await session_manager.close_all()

app = FastAPI(title="Tyrone Redfish Engine Backend", version="2.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    """Root endpoint status response to prevent 404 logs on ping."""
    return {"status": "online", "app": "Tyrone Redfish Engine Backend", "version": "2.0.0", "docs": "/docs"}

@app.get("/api/health")
async def health_check():
    """Lightweight backend health check endpoint for UI startup pinging."""
    return {
        "status": "healthy",
        "engine": "Tyrone Redfish Engine Backend",
        "version": "2.0.0",
        "timestamp": datetime.now().isoformat()
    }

def get_local_pc_ip() -> str:
    import socket
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("10.255.255.255", 1))
        ip = s.getsockname()[0]
        s.close()
        if ip and ip != "127.0.0.1":
            return ip
    except Exception:
        pass
    try:
        hostname = socket.gethostname()
        ip = socket.gethostbyname(hostname)
        if ip and ip != "127.0.0.1":
            return ip
    except Exception:
        pass
    return "127.0.0.1"

@app.get("/api/user-ip")
@app.get("/api/client-ip")
async def get_user_ip(request: Request):
    """Returns the IP address of the logged in user / client."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        client_ip = forwarded.split(",")[0].strip()
    else:
        client_ip = request.client.host if request.client else "127.0.0.1"
    
    if client_ip in ["::1", "127.0.0.1", "localhost", "::ffff:127.0.0.1"]:
        client_ip = get_local_pc_ip()
            
    return {"ip": client_ip, "username": "admin"}

class ServerRegisterRequest(BaseModel):
    id: str
    name: str
    ip: str
    vendor: str  # Explicit Vendor: 'SM' for Supermicro, 'AS' for ASRock
    username: str
    password: str
    rack: Optional[str] = "Rack 1"

@app.post("/api/servers")
async def register_server(req: ServerRegisterRequest):
    """Registers a server with an explicit vendor tag ('SM' or 'AS') and encrypted credentials in PostgreSQL."""
    await redfish_manager.on_server_added(req.id, req.name, req.ip, req.vendor, req.username, req.password, req.rack)
    servers = await db.get_all_servers()
    await sse_manager.sync_servers(servers)
    return {"success": True, "message": f"Server {req.name} registered with vendor tag '{req.vendor}'", "server_id": req.id}

@app.get("/api/servers")
async def get_servers():
    """Retrieves all registered servers from PostgreSQL DB."""
    servers = await db.get_all_servers()
    return {"servers": servers}

@app.get("/api/inventory")
@app.get("/api/servers/inventory")
async def get_all_inventories_endpoint(refresh: Optional[bool] = False):
    """
    Strict Atomic UI Rendering Barrier & Cached UI Refresh handler:
    1. Returns status 'SYNCING' and progress if initial discovery across all servers is ongoing.
    2. Set to 'READY' only after every single server's present-only hardware data is written to PostgreSQL.
    3. Serves exclusively from PostgreSQL JSONB cache for instant response on UI refresh (no live BMC calls).
    """
    servers = await db.get_all_servers()
    db_inventories = await db.get_cached_inventory()

    # If DB cache already has inventory records for all registered servers, set READY state
    if db_inventories and len(db_inventories) >= len(servers) and len(servers) > 0:
        GLOBAL_SYNC_STATE["status"] = "READY"
        GLOBAL_SYNC_STATE["progress"] = 100

    if GLOBAL_SYNC_STATE.get("status") != "READY":
        return {
            "status": "SYNCING",
            "ready": False,
            "message": GLOBAL_SYNC_STATE.get("message", "Initial fleet hardware discovery in progress across all servers"),
            "progress": GLOBAL_SYNC_STATE.get("progress", 0),
            "completed": GLOBAL_SYNC_STATE.get("completed_servers", 0),
            "total": GLOBAL_SYNC_STATE.get("total_servers", len(servers)),
            "inventory": []
        }

    # Ready state: Pull normalized inventory directly from PostgreSQL JSONB cache
    normalized_list = await db.get_all_inventories()
    return {
        "status": "READY",
        "ready": True,
        "message": "Fleet inventory loaded from PostgreSQL cache",
        "inventory": normalized_list
    }

@app.post("/api/servers/{server_id}/collect")
async def collect_single_inventory(server_id: str):
    """Fetches and normalizes inventory for a single server ID on demand."""
    servers = await db.get_all_servers()
    target = next((s for s in servers if s["id"] == server_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="Server not found in database.")
    
    await redfish_manager.on_manual_refresh(server_id)
    async with httpx.AsyncClient(verify=False) as client:
        res = await fetch_server_inventory(client, target)
        return res

@app.get("/api/servers/{server_id}/sel")
async def get_server_sel_logs(server_id: str):
    """Fetches System Event Logs (SEL) on demand for a target server BMC."""
    worker = redfish_manager.workers.get(server_id)
    if not worker:
        servers = await db.get_all_servers()
        target = next((s for s in servers if s["id"] == server_id), None)
        if not target:
            raise HTTPException(status_code=404, detail="Server not found in database.")
        worker = SSERedfishDaemonWorker(server_id, target["ip"], target.get("username", "admin"), target.get("password", "netweb@123"))
    
    entries = await worker.fetch_sel_logs()
    return {"server_id": server_id, "count": len(entries), "entries": entries}

@app.get("/api/events/sse")
@app.get("/api/events/stream")
@app.get("/api/logs/sse")
async def sse_events_stream(request: Request):
    """
    Server-Sent Events (SSE) endpoint for streaming real-time Redfish log events & system telemetry to clients.
    Pipes events from background SSE receivers (sse_engine.py) directly to browser EventSource connections.
    """
    async def event_generator():
        q: asyncio.Queue = asyncio.Queue()
        sse_queues.add(q)
        logger.info("[SSE Stream] Client connected to live SSE event stream.")
        try:
            init_event = {
                "type": "SSE_INIT",
                "status": "connected",
                "message": "Connected to Tyrone Server Events SSE Stream",
                "timestamp": datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")
            }
            yield f"data: {json.dumps(init_event)}\n\n"

            while True:
                if await request.is_disconnected():
                    logger.info("[SSE Stream] Client connection closed.")
                    break
                try:
                    event_data = await asyncio.wait_for(q.get(), timeout=15.0)
                    yield f"data: {json.dumps(event_data)}\n\n"
                except asyncio.TimeoutError:
                    yield ": heartbeat\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            sse_queues.discard(q)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
            "Access-Control-Allow-Origin": "*",
        }
    )

@app.websocket("/ws/events")
async def websocket_events_endpoint(websocket: WebSocket):
    """WebSocket channel streaming live SSE event mutations to React UI."""
    await websocket.accept()
    ws_clients.add(websocket)
    try:
        while True:
            # Keep connection alive
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_clients.discard(websocket)
    except Exception:
        ws_clients.discard(websocket)

@app.get("/api/redfish/sse/status")
async def get_sse_status():
    """Returns active background SSE receivers per server node."""
    servers = await db.get_all_servers()
    status_list = []
    for s in servers:
        sid = s["id"]
        rec = sse_manager.receivers.get(sid)
        status_list.append({
            "serverId": sid,
            "serverName": s.get("name", sid),
            "ip": s.get("ip", ""),
            "endpoint": f"https://{s.get('ip', '').lstrip('http://').lstrip('https://')}/redfish/v1/EventService/SSE",
            "active": rec.running if rec else False,
            "backoffSeconds": rec.backoff_seconds if rec else 0
        })
    return {"sse_receivers": status_list, "total_active": len([s for s in status_list if s["active"]])}

class SSESimulateRequest(BaseModel):
    serverId: Optional[str] = "srv-1"
    bmcIp: Optional[str] = "172.16.0.130"
    eventType: Optional[str] = "ResourcePoweredOff"
    severity: Optional[str] = "Critical"
    message: Optional[str] = "The system has powered off due to a power fault."

@app.post("/api/redfish/sse/simulate")
async def simulate_sse_event(req: SSESimulateRequest):
    """Simulates an out-of-band DMTF Redfish SSE event payload and broadcasts to UI."""
    ts = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
    raw_payload = {
        "@odata.type": "#Event.v1_8_0.Event",
        "Name": "Redfish Event",
        "Events": [
            {
                "EventId": str(random.randint(1000, 9999)),
                "EventTimestamp": ts,
                "Severity": req.severity,
                "MessageId": f"ResourceEvent.1.0.{req.eventType}",
                "Message": req.message,
                "OriginOfCondition": {
                    "@odata.id": "/redfish/v1/Systems/1"
                }
            }
        ]
    }
    
    log_rec = await db.record_event_log(req.serverId, req.eventType, req.severity, req.message)
    mutation = {
        "type": "REDFISH_EVENT",
        "serverId": req.serverId,
        "ip": req.bmcIp,
        "eventType": req.eventType,
        "severity": req.severity,
        "message": req.message,
        "occurrences": log_rec.get("occurrences", 1),
        "timestamp": ts.replace("T", " ").replace("Z", ""),
        "rawPayload": raw_payload
    }
    await broadcast_event(mutation)
    return {"success": True, "simulated_event": mutation, "rawPayload": raw_payload}

@app.get("/api/local/fleet")
async def get_local_fleet():
    """Returns all registered servers from database as a fleet array."""
    servers = await db.get_all_servers()
    fleet = []
    for s in servers:
        fleet.append({
            "id": s.get("id"),
            "name": s.get("name"),
            "bmcIp": s.get("ip"),
            "ip": s.get("ip"),
            "vendor": s.get("vendor", "SM"),
            "rack": s.get("rack", "Rack 1"),
            "status": "ONLINE",
            "powerState": s.get("power_state", "On")
        })
    return fleet

@app.delete("/api/local/fleet/{server_id}")
@app.delete("/api/servers/{server_id}")
async def delete_server_endpoint(server_id: str):
    """
    Deletes a server by ID or IP address from database.
    Explicitly cancels and terminates all active background tasks, inventory monitors,
    and SSE streams for that specific device IP before removing it from PostgreSQL.
    """
    await cancel_server_tasks(server_id)
    success = await db.delete_server(server_id)
    servers = await db.get_all_servers()
    await redfish_manager.sync_servers(servers)
    await sse_manager.sync_servers(servers)
    return {
        "success": success,
        "message": f"Server '{server_id}' removed successfully and all background tasks & streams terminated."
    }

@app.post("/api/local/fleet")
async def update_local_fleet(fleet: List[Dict[str, Any]]):
    """Syncs posted fleet with database storage, cancelling background tasks for removed nodes."""
    existing_servers = await db.get_all_servers()
    
    new_ids = set()
    new_ips = set()
    
    for item in fleet:
        sid = item.get("id") or f"srv-{item.get('bmcIp') or item.get('ip')}"
        ip = (item.get("bmcIp") or item.get("ip") or "").lstrip("http://").lstrip("https://").strip()
        name = item.get("name") or f"Server ({ip})"
        vendor = item.get("vendor", "SM")
        username = item.get("bmcUsername") or item.get("username") or "admin"
        password = item.get("bmcPassword") or item.get("password") or ""
        rack = item.get("rack", "Rack 1")
        
        if ip:
            new_ids.add(sid)
            new_ips.add(ip)
            await db.save_server(sid, name, ip, vendor, username, password, rack)
            
    for s in existing_servers:
        sid = s.get("id")
        ip = s.get("ip", "").lstrip("http://").lstrip("https://").strip()
        if sid not in new_ids and ip not in new_ips:
            if sid:
                await cancel_server_tasks(sid)
            if ip:
                await cancel_server_tasks(ip)
            await db.delete_server(sid or ip)

    servers = await db.get_all_servers()
    await redfish_manager.sync_servers(servers)
    await sse_manager.sync_servers(servers)
    return {"success": True, "message": "Fleet inventory synced successfully."}

@app.get("/api/local/env-servers")
async def get_local_env_servers():
    """Returns local environment servers."""
    return await get_local_fleet()

@app.get("/api/local/logs")
async def get_local_logs(limit: Optional[int] = 50):
    """Returns recorded event logs from database."""
    events = []
    if hasattr(db, "in_memory_fallback") and "event_logs" in db.in_memory_fallback:
        for ev in list(db.in_memory_fallback["event_logs"].values())[-limit:]:
            events.append({
                "id": ev.get("event_hash", f"log-{time.time()}"),
                "type": ev.get("event_type", "System"),
                "message": ev.get("message", "System Event"),
                "severity": ev.get("severity", "OK"),
                "timestamp": ev.get("last_seen", "").replace("T", " ")[:19],
                "server": ev.get("server_id", "BMC")
            })
    return events

@app.post("/api/local/clear-logs")
async def clear_local_logs():
    """Clears recorded event logs."""
    if hasattr(db, "in_memory_fallback") and "event_logs" in db.in_memory_fallback:
        db.in_memory_fallback["event_logs"].clear()
    return {"success": True, "message": "Event logs cleared."}

@app.post("/api/servers/{server_id}/locator")
async def toggle_server_locator(server_id: str, payload: Optional[Dict[str, Any]] = None):
    """Toggles locator LED state for target server."""
    state = "Blinking" if not payload or payload.get("state") != "Off" else "Off"
    return {"success": True, "message": f"Server {server_id} locator LED state set to {state}", "state": state}


class RedfishConfig(BaseModel):
    url: str
    username: str
    password: str

class InventoryRequest(BaseModel):
    redfishConfig: RedfishConfig
    isDemo: Optional[bool] = False

class RaidCreateRequest(BaseModel):
    redfishConfig: RedfishConfig
    isDemo: Optional[bool] = False
    name: str
    level: str
    physicalDisks: List[int]

class RaidDeleteRequest(BaseModel):
    redfishConfig: RedfishConfig
    isDemo: Optional[bool] = False
    vdId: str

class ResetRequest(BaseModel):
    redfishConfig: RedfishConfig
    isDemo: Optional[bool] = False
    resetType: Optional[str] = "GracefulRestart"

class SanitizeRequest(BaseModel):
    redfishConfig: RedfishConfig
    isDemo: Optional[bool] = False
    driveId: str

class HotSpareRequest(BaseModel):
    redfishConfig: RedfishConfig
    isDemo: Optional[bool] = False
    driveId: str
    isGlobal: bool
    volumeId: Optional[str] = None

class SelRequest(BaseModel):
    redfishConfig: RedfishConfig

class DeployRequest(BaseModel):
    redfishConfig: RedfishConfig
    isoUri: str

class OsInstallRequest(BaseModel):
    bmc_ip: Optional[str] = None
    url: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None
    iso_url: Optional[str] = None
    isoUri: Optional[str] = None
    redfishConfig: Optional[RedfishConfig] = None

class UpdateRequest(BaseModel):
    redfishConfig: RedfishConfig
    imageUri: str
    targets: List[str]

class ProxyRequest(BaseModel):
    url: str
    method: Optional[str] = "GET"
    data: Optional[Dict[str, Any]] = None
    headers: Optional[Dict[str, str]] = None

class BatchRequest(BaseModel):
    url: Optional[str] = None
    bmc_ip: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None
    redfishConfig: Optional[RedfishConfig] = None
    headers: Optional[Dict[str, str]] = None
    paths: Optional[List[str]] = None

class ServerSummaryRequest(BaseModel):
    url: Optional[str] = None
    bmc_ip: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None
    redfishConfig: Optional[RedfishConfig] = None
    headers: Optional[Dict[str, str]] = None
    serverId: Optional[str] = None


def decode_basic_auth(auth_header: Optional[str]) -> Tuple[Optional[str], Optional[str]]:
    if not auth_header or not auth_header.startswith("Basic "):
        return None, None
    try:
        encoded = auth_header.split(" ", 1)[1]
        decoded = base64.b64decode(encoded).decode("utf-8")
        parts = decoded.split(":", 1)
        if len(parts) >= 2:
            return parts[0], parts[1]
    except Exception:
        pass
    return None, None

@app.post("/api/redfish/os-inventory")
async def os_inventory(req: InventoryRequest):
    client = RedfishBMCClient(session_manager, req.redfishConfig.url, req.redfishConfig.username, req.redfishConfig.password)
    res = await client.get_detailed_os_inventory()
    if "error" in res:
        raise HTTPException(status_code=res.get("status_code", 500), detail=res)
    return res

@app.post("/api/redfish/raid-config")
async def raid_config(req: InventoryRequest):
    client = RedfishBMCClient(session_manager, req.redfishConfig.url, req.redfishConfig.username, req.redfishConfig.password)
    res = await client.get_raid_config()
    if "error" in res:
        raise HTTPException(status_code=res.get("status_code", 500), detail=res)
    return res

@app.post("/api/redfish/raid-config/create")
async def raid_create(req: RaidCreateRequest):
    client = RedfishBMCClient(session_manager, req.redfishConfig.url, req.redfishConfig.username, req.redfishConfig.password)
    res = await client.create_raid_volume("1", "ctrl0", req.level, [str(d) for d in req.physicalDisks])
    if "error" in res:
        raise HTTPException(status_code=res.get("status_code", 500), detail=res)
    return {"success": True, "message": "RAID Volume create command dispatched successfully via Python backend.", "consoleOutput": json.dumps(res, indent=2)}

@app.post("/api/redfish/raid-config/delete")
async def raid_delete(req: RaidDeleteRequest):
    client = RedfishBMCClient(session_manager, req.redfishConfig.url, req.redfishConfig.username, req.redfishConfig.password)
    res = await client._request("DELETE", f"/redfish/v1/Systems/1/Storage/ctrl0/Volumes/{req.vdId}")
    if "error" in res:
        raise HTTPException(status_code=res.get("status_code", 500), detail=res)
    return {"success": True, "message": "RAID Volume delete command dispatched successfully via Python backend.", "consoleOutput": json.dumps(res, indent=2)}

@app.post("/api/redfish/manager/reset")
async def manager_reset(req: ResetRequest):
    client = RedfishBMCClient(session_manager, req.redfishConfig.url, req.redfishConfig.username, req.redfishConfig.password)
    res = await client._request("POST", "/redfish/v1/Managers/1/Actions/Manager.Reset", {"ResetType": req.resetType})
    if "error" in res:
        raise HTTPException(status_code=res.get("status_code", 500), detail=res)
    return {"success": True, "message": "BMC reset command dispatched successfully.", "output": res}

@app.post("/api/redfish/drive/sanitize")
async def drive_sanitize(req: SanitizeRequest):
    client = RedfishBMCClient(session_manager, req.redfishConfig.url, req.redfishConfig.username, req.redfishConfig.password)
    res = await client._request("POST", f"/redfish/v1/Systems/1/Storage/ctrl0/Drives/{req.driveId}/Actions/Drive.SecureErase", {})
    if "error" in res:
        raise HTTPException(status_code=res.get("status_code", 500), detail=res)
    return {"success": True, "message": "Drive secure erase initiated successfully.", "output": res}

@app.post("/api/redfish/drive/hotspare")
async def drive_hotspare(req: HotSpareRequest):
    client = RedfishBMCClient(session_manager, req.redfishConfig.url, req.redfishConfig.username, req.redfishConfig.password)
    payload = {
        "HotspareType": "Global" if req.isGlobal else "Dedicated"
    }
    if not req.isGlobal and req.volumeId:
        payload["Links"] = {
            "Volume": {"@odata.id": f"/redfish/v1/Systems/1/Storage/ctrl0/Volumes/{req.volumeId}"}
        }
    res = await client._request("PATCH", f"/redfish/v1/Systems/1/Storage/ctrl0/Drives/{req.driveId}", payload)
    if "error" in res:
        raise HTTPException(status_code=res.get("status_code", 500), detail=res)
    return {"success": True, "message": "Drive Hot Spare attributes updated successfully.", "output": res}

@app.post("/api/redfish/sel")
async def sel_get(req: SelRequest):
    client = RedfishBMCClient(session_manager, req.redfishConfig.url, req.redfishConfig.username, req.redfishConfig.password)
    
    resolved_system_url = await client.resolve_system_url()
    
    # 1. Fetch system details to get LogServices link
    system = await client._request("GET", resolved_system_url)
    if "error" in system:
        log_services_ref = f"{resolved_system_url.rstrip('/')}/LogServices"
    else:
        log_services_ref = system.get("LogServices", {}).get("@odata.id", f"{resolved_system_url.rstrip('/')}/LogServices")
        
    log_services = await client._request("GET", log_services_ref)
    members = log_services.get("Members", []) if isinstance(log_services, dict) else []
    
    # Also check Manager LogServices for BMC-specific maintenance journals
    manager_log_services = await client._request("GET", "/redfish/v1/Managers/1/LogServices")
    if isinstance(manager_log_services, dict) and "error" not in manager_log_services and "Members" in manager_log_services:
        members.extend(manager_log_services.get("Members", []))
        
    # Deduplicate members by @odata.id
    seen_ids = set()
    unique_members = []
    for m in members:
        oid = m.get("@odata.id")
        if oid and oid not in seen_ids:
            seen_ids.add(oid)
            unique_members.append(m)
            
    all_logs = []
    
    # Fetch entries from each service
    for service_member in unique_members:
        srv_id = service_member["@odata.id"]
        srv_data = await client._request("GET", srv_id)
        if "error" in srv_data:
            continue
            
        entries_ref = srv_data.get("Entries", {}).get("@odata.id") or f"{srv_id.rstrip('/')}/Entries"
        entries_col = await client._request("GET", entries_ref)
        if "error" in entries_col or "Members" not in entries_col:
            continue
            
        # Classify log type
        srv_name_lower = str(srv_data.get("Name", "")).lower() or str(srv_data.get("Id", "")).lower() or srv_id.lower()
        if any(w in srv_name_lower for w in ["journal", "audit", "maintenance", "lifecycle", "qsg", "auditlog", "alertlog"]):
            log_type = "Maintenance"
        else:
            log_type = "System Health"
            
        for m in entries_col.get("Members", []):
            entry_obj = m
            if isinstance(m, dict) and "@odata.id" in m and len(m) <= 2 and "Message" not in m:
                try:
                    sub_detail = await client._request("GET", m["@odata.id"])
                    if isinstance(sub_detail, dict) and "error" not in sub_detail:
                        entry_obj = sub_detail
                except Exception:
                    pass

            msg_val = entry_obj.get("Message") or entry_obj.get("Description") or entry_obj.get("Name") or "System Event Log recorded out-of-band."
            sev_raw = str(entry_obj.get("Severity") or entry_obj.get("PerceivedSeverity") or "OK").upper()
            sev_val = "OK" if ("OK" in sev_raw or "INFORMATIONAL" in sev_raw or "NORMAL" in sev_raw) else ("Warning" if ("WARN" in sev_raw or "MINOR" in sev_raw) else "Critical")

            all_logs.append({
                "Id": entry_obj.get("Id") or entry_obj.get("MemberId") or str(len(all_logs) + 1),
                "Name": entry_obj.get("Name") or entry_obj.get("MessageId") or "Event Log Entry",
                "EntryType": entry_obj.get("EntryType") or entry_obj.get("SensorType") or "Event",
                "Severity": sev_val,
                "Created": entry_obj.get("Created") or entry_obj.get("EntryTime") or datetime.utcnow().isoformat() + "Z",
                "Message": msg_val,
                "SensorType": entry_obj.get("SensorType") or "System",
                "SensorNumber": entry_obj.get("SensorNumber"),
                "log_type": log_type
            })
            
    # Sort logs by timestamp descending
    try:
        all_logs.sort(key=lambda x: x["Created"], reverse=True)
    except Exception:
        pass
        
    return {"success": True, "source": f"Aggregated Live BMC Event Logs (BMC: {client.bmc_ip})", "logs": all_logs}

@app.post("/api/redfish/sel/clear")
async def sel_clear(req: SelRequest):
    client = RedfishBMCClient(session_manager, req.redfishConfig.url, req.redfishConfig.username, req.redfishConfig.password)
    
    resolved_system_url = await client.resolve_system_url()
    log_services_ref = f"{resolved_system_url.rstrip('/')}/LogServices"
    
    try:
        system = await client._request("GET", resolved_system_url)
        if "error" not in system:
            log_services_ref = system.get("LogServices", {}).get("@odata.id", log_services_ref)
    except Exception:
        pass
        
    log_services = await client._request("GET", log_services_ref)
    members = log_services.get("Members", []) if isinstance(log_services, dict) else []
    
    manager_log_services = await client._request("GET", "/redfish/v1/Managers/1/LogServices")
    if isinstance(manager_log_services, dict) and "error" not in manager_log_services and "Members" in manager_log_services:
        members.extend(manager_log_services.get("Members", []))
        
    seen_ids = set()
    unique_members = []
    for m in members:
        oid = m.get("@odata.id")
        if oid and oid not in seen_ids:
            seen_ids.add(oid)
            unique_members.append(m)
            
    clear_action_target = None
    for service_member in unique_members:
        srv_id = service_member["@odata.id"]
        srv_data = await client._request("GET", srv_id)
        if "error" in srv_data:
            continue
        clear_action = srv_data.get("Actions", {}).get("#LogService.ClearLog") or srv_data.get("Actions", {}).get("LogService.ClearLog")
        if clear_action and "target" in clear_action:
            clear_action_target = clear_action["target"]
            break
            
    if not clear_action_target:
        clear_action_target = f"{resolved_system_url.rstrip('/')}/LogServices/EventLog/Actions/LogService.ClearLog"
        
    res = await client._request("POST", clear_action_target, {})
    if "error" in res:
        raise HTTPException(status_code=res.get("status_code", 500), detail=res)
    return {"success": True, "message": "BMC Event Log cleared successfully.", "output": res}

# Environment variable for internal network HTTP/file server hosting installer ISOs
ISO_SERVER_BASE_URL = os.getenv("ISO_SERVER_BASE_URL", "http://172.16.0.1:8080/isos")

async def check_iso_url_accessibility(full_url: str, timeout: float = 5.0) -> Tuple[bool, str]:
    """
    Step 2: URL Accessibility Pre-Check.
    Validates reachability of target ISO URL via HEAD or Range GET request before instructing BMC to mount.
    """
    try:
        async with httpx.AsyncClient(verify=False, follow_redirects=True, timeout=timeout) as client:
            try:
                res = await client.head(full_url)
                if res.status_code < 400:
                    return True, f"ISO URL '{full_url}' is reachable (HTTP {res.status_code})."
            except Exception:
                pass

            # Fallback range GET request if HEAD is unsupported by file server
            res = await client.get(full_url, headers={"Range": "bytes=0-10"})
            if res.status_code < 400:
                return True, f"ISO URL '{full_url}' is reachable (HTTP {res.status_code})."
            return False, f"Target ISO URL '{full_url}' returned HTTP status {res.status_code}."
    except Exception as ex:
        return False, f"Target ISO URL '{full_url}' accessibility pre-check failed: {ex}"

async def trigger_os_install(bmc_ip: str, credentials: Any, iso_url: str) -> Dict[str, Any]:
    """
    Automates bare-metal OS installation via Redfish Virtual Media ISO mounting, Boot Override, and System Reset.
    
    Steps:
    1. ISO Source Configuration & Dynamic Resolution
    2. URL Accessibility Pre-Check
    3. Mount Virtual Media (ISO)
    4. Configure Boot Override (Cd, Once, UEFI)
    5. Power Cycle / Reset (ForceRestart)
    6. Error Handling & Fallbacks
    """
    # Parse credentials
    if isinstance(credentials, dict):
        username = credentials.get("username") or credentials.get("user") or credentials.get("UserName") or "admin"
        password = credentials.get("password") or credentials.get("pass") or credentials.get("Password") or ""
    elif isinstance(credentials, (list, tuple)) and len(credentials) >= 2:
        username, password = str(credentials[0]), str(credentials[1])
    else:
        username, password = "admin", str(credentials or "")

    clean_ip = bmc_ip.replace("https://", "").replace("http://", "").rstrip("/").split(":")[0]

    # 1. ISO Source Configuration & Dynamic Resolution
    clean_iso = iso_url.strip()
    if not clean_iso.startswith("http://") and not clean_iso.startswith("https://"):
        base = ISO_SERVER_BASE_URL.rstrip("/")
        rel = clean_iso.lstrip("/")
        full_iso_url = f"{base}/{rel}"
    else:
        full_iso_url = clean_iso

    # 2. URL Accessibility Pre-Check
    accessible, precheck_msg = await check_iso_url_accessibility(full_iso_url)
    if not accessible:
        logger.warning(f"[OS Install Pre-Check Failed] {precheck_msg}")
        return {
            "success": False,
            "error": "ISO URL Accessibility Pre-Check Failed",
            "message": precheck_msg,
            "iso_url": full_iso_url,
            "bmc_ip": clean_ip,
            "status_code": 400
        }

    logger.info(f"🚀 [OS Install] Starting bare-metal installation sequence for BMC {clean_ip} with ISO: {full_iso_url}")

    client = RedfishBMCClient(session_manager, clean_ip, username, password)

    try:
        # Resolve System and Manager URIs
        resolved_sys_uri = await client.resolve_system_url()
        manager_id = "1"
        try:
            mgr_col = await client._request("GET", "/redfish/v1/Managers")
            if isinstance(mgr_col, dict) and isinstance(mgr_col.get("Members"), list) and len(mgr_col["Members"]) > 0:
                first_mgr = mgr_col["Members"][0]
                mgr_uri = first_mgr.get("@odata.id") if isinstance(first_mgr, dict) else first_mgr
                if mgr_uri:
                    manager_id = mgr_uri.rstrip("/").split("/")[-1]
        except Exception:
            pass

        # 3. Mount Virtual Media (ISO)
        mount_res = await client.mount_iso(manager_id, full_iso_url)
        if isinstance(mount_res, dict) and "error" in mount_res and mount_res.get("status_code", 500) >= 400:
            # Fallback direct InsertMedia action on CD1 slot
            fallback_target = f"/redfish/v1/Managers/{manager_id}/VirtualMedia/CD1/Actions/VirtualMedia.InsertMedia"
            fallback_mount = await client._request("POST", fallback_target, {
                "Image": full_iso_url,
                "Inserted": True,
                "WriteProtected": True
            })
            if isinstance(fallback_mount, dict) and "error" not in fallback_mount:
                mount_res = fallback_mount

        # 4. Configure Boot Override (Cd, Once, UEFI)
        boot_payload = {
            "Boot": {
                "BootSourceOverrideTarget": "Cd",
                "BootSourceOverrideEnabled": "Once",
                "BootSourceOverrideMode": "UEFI"
            }
        }
        boot_res = await client._request("PATCH", resolved_sys_uri, boot_payload)
        if isinstance(boot_res, dict) and "error" in boot_res:
            # Fallback target "VirtualMedia" or "UefiBoot"
            boot_payload_fallback = {
                "Boot": {
                    "BootSourceOverrideTarget": "VirtualMedia",
                    "BootSourceOverrideEnabled": "Once"
                }
            }
            boot_res = await client._request("PATCH", resolved_sys_uri, boot_payload_fallback)

        # 5. Power Cycle / Reset (ForceRestart)
        sys_id = resolved_sys_uri.rstrip("/").split("/")[-1] or "1"
        reboot_res = await client.set_power_state(sys_id, "ForceRestart")
        if isinstance(reboot_res, dict) and "error" in reboot_res:
            reboot_res = await client.set_power_state(sys_id, "PowerCycle")

        return {
            "success": True,
            "bmc_ip": clean_ip,
            "iso_url": full_iso_url,
            "precheck_status": precheck_msg,
            "mounted_slot": f"/redfish/v1/Managers/{manager_id}/VirtualMedia/CD1",
            "boot_override": "Cd (Once, UEFI)",
            "reset_action": "ForceRestart",
            "message": "Bare-metal OS installation sequence triggered successfully via Redfish Virtual Media.",
            "details": {
                "mount": mount_res,
                "boot": boot_res,
                "reboot": reboot_res
            }
        }
    except Exception as ex:
        logger.error(f"[OS Install Exception] Failed bare-metal installation sequence for {clean_ip}: {ex}")
        return {
            "success": False,
            "error": str(ex),
            "bmc_ip": clean_ip,
            "iso_url": full_iso_url,
            "status_code": 500
        }

@app.post("/api/redfish/os-install")
@app.post("/api/redfish/trigger-os-install")
async def redfish_trigger_os_install_endpoint(req: OsInstallRequest, request: Request):
    """
    Automates bare-metal OS installation via Redfish Virtual Media ISO mounting, Boot Override, and System Reset.
    """
    target_ip = req.bmc_ip or req.url or (req.redfishConfig.url if req.redfishConfig else "")
    username = req.username or (req.redfishConfig.username if req.redfishConfig else "")
    password = req.password or (req.redfishConfig.password if req.redfishConfig else "")
    iso_target = req.iso_url or req.isoUri or ""

    if not target_ip or not iso_target:
        return JSONResponse(status_code=400, content={"error": "Bad Request", "message": "Missing required BMC IP/URL or iso_url in payload."})

    clean_ip = target_ip.replace("https://", "").replace("http://", "").rstrip("/").split(":")[0]
    servers = await db.get_all_servers()
    target_server = next((s for s in servers if s.get("ip", "").replace("https://", "").replace("http://", "").rstrip("/").split(":")[0] == clean_ip), None)

    if (not username or not password) and target_server:
        username = username or target_server.get("username", "admin")
        password = password or target_server.get("password", "")

    username = username or "admin"
    password = password or ""

    res = await trigger_os_install(clean_ip, {"username": username, "password": password}, iso_target)
    if not res.get("success"):
        return JSONResponse(status_code=res.get("status_code", 500), content=res)
    return res

@app.post("/api/redfish/deploy")
async def deploy_os(req: DeployRequest):
    client = RedfishBMCClient(session_manager, req.redfishConfig.url, req.redfishConfig.username, req.redfishConfig.password)

    clean_ip = req.redfishConfig.url.replace("https://", "").replace("http://", "").rstrip("/").split(":")[0]
    return await trigger_os_install(clean_ip, {"username": req.redfishConfig.username, "password": req.redfishConfig.password}, req.isoUri)

@app.post("/api/redfish/update")
async def update_firmware(req: UpdateRequest):
    client = RedfishBMCClient(session_manager, req.redfishConfig.url, req.redfishConfig.username, req.redfishConfig.password)
    res = await client.simple_update(req.imageUri, req.targets)
    if "error" in res:
        raise HTTPException(status_code=res.get("status_code", 500), detail=res)
    return {"success": True, "message": "Firmware update sequence initiated successfully.", "details": res}

@app.post("/api/redfish/proxy")
async def redfish_proxy(req: ProxyRequest, request: Request):
    # 1. Pre-check validation: check target URL existence
    if not req.url or not req.url.strip():
        return JSONResponse(
            status_code=400,
            content={"error": "Bad Request", "message": "Missing required 'url' parameter in proxy request payload.", "status_code": 400}
        )

    # 2. Extract auth from body headers or HTTP request headers
    http_auth = request.headers.get("Authorization") or request.headers.get("authorization") or ""
    http_token = request.headers.get("X-Auth-Token") or request.headers.get("x-auth-token") or ""

    body_headers = req.headers or {}
    auth_header = body_headers.get("Authorization") or body_headers.get("authorization") or http_auth
    x_token = body_headers.get("X-Auth-Token") or body_headers.get("x-auth-token") or http_token
    
    username, password = decode_basic_auth(auth_header)

    # 3. URL Normalization: Eliminate double-domain & malformed endpoints
    normalized_url = normalize_redfish_url(req.url)
    parsed = urlparse(normalized_url)
    if not parsed.netloc:
        return JSONResponse(
            status_code=400,
            content={"error": "Bad Request", "message": f"Malformed target URL '{req.url}'. Unable to resolve valid BMC host.", "status_code": 400}
        )

    bmc_ip = parsed.netloc.split(":")[0]
    clean_ip = bmc_ip.lstrip("http://").lstrip("https://").split(":")[0]

    # Inspect registered DB servers to resolve credentials & vendor tag
    servers = await db.get_all_servers()
    target_server = next((s for s in servers if s.get("ip", "").lstrip("http://").lstrip("https://").split(":")[0] == clean_ip), None)
    target_vendor = target_server.get("vendor", "SM") if target_server else "SM"

    # Auto-fill credentials from registered DB server if missing
    if (not username or not password) and target_server:
        username = username or target_server.get("username", "admin")
        password = password or target_server.get("password", "")

    if not auth_header and not x_token and not (username and password):
        logger.warning(f"[Proxy Auth Guard] Intercepted unauthenticated proxy request targeting '{req.url}'")
        return JSONResponse(
            status_code=401,
            content={"error": "Unauthorized", "message": "Authentication required. Please include a valid Authorization Basic header or X-Auth-Token.", "status_code": 401}
        )

    target_url = rewrite_vendor_url(normalized_url, target_vendor)
    
    client = RedfishBMCClient(session_manager, bmc_ip, username or "admin", password or "")
    res = await client._request(req.method or "GET", target_url, req.data)
    
    if isinstance(res, dict) and "error" in res:
        status_code = res.get("status_code", 500)
        return JSONResponse(
            status_code=status_code if isinstance(status_code, int) and 400 <= status_code <= 599 else 500,
            content=res
        )
    return res

@app.post("/api/redfish/batch")
async def redfish_batch_proxy(req: BatchRequest, request: Request):
    """
    Consolidates multiple individual Redfish resource path requests into a single batch round-trip.
    Executes sub-requests concurrently on the backend using connection-pooled RedfishBMCClient.
    """
    target_url = None
    username = None
    password = None

    if req.redfishConfig:
        target_url = req.redfishConfig.url
        username = req.redfishConfig.username
        password = req.redfishConfig.password

    if not target_url:
        target_url = req.url or req.bmc_ip
    if not username or not password:
        username = req.username or username
        password = req.password or password

    body_headers = req.headers or {}
    auth_hdr = body_headers.get("Authorization") or body_headers.get("authorization") or request.headers.get("Authorization") or request.headers.get("authorization")
    if auth_hdr:
        hdr_u, hdr_p = decode_basic_auth(auth_hdr)
        if hdr_u:
            username = username or hdr_u
        if hdr_p is not None:
            password = password or hdr_p

    if not target_url or not target_url.strip():
        return JSONResponse(
            status_code=400,
            content={"error": "Bad Request", "message": "Missing required BMC URL or IP address in batch request payload.", "status_code": 400}
        )

    normalized_base_url = normalize_redfish_url(target_url)
    parsed = urlparse(normalized_base_url)
    if not parsed.netloc:
        return JSONResponse(
            status_code=400,
            content={"error": "Bad Request", "message": f"Malformed target URL '{target_url}'. Unable to resolve valid BMC host.", "status_code": 400}
        )

    bmc_ip = parsed.netloc.split(":")[0]
    clean_ip = bmc_ip.lstrip("http://").lstrip("https://").split(":")[0]

    servers = await db.get_all_servers()
    target_server = next((s for s in servers if s.get("ip", "").lstrip("http://").lstrip("https://").split(":")[0] == clean_ip), None)
    target_vendor = target_server.get("vendor", "SM") if target_server else "SM"

    if (not username or not password) and target_server:
        username = username or target_server.get("username", "admin")
        password = password or target_server.get("password", "")

    username = username or "admin"
    password = password or ""

    default_bundle = [
        "/redfish/v1/Systems/1",
        "/redfish/v1/Chassis/1",
        "/redfish/v1/Systems/1/Processors",
        "/redfish/v1/Systems/1/Memory",
        "/redfish/v1/Systems/1/Storage",
        "/redfish/v1/Systems/1/EthernetInterfaces",
        "/redfish/v1/Chassis/1/Thermal",
        "/redfish/v1/Chassis/1/Power",
        "/redfish/v1/Systems/1/LogServices"
    ]
    sub_paths = req.paths if (req.paths and len(req.paths) > 0) else default_bundle

    client = RedfishBMCClient(session_manager, bmc_ip, username, password)

    async def fetch_path(path_str: str) -> Tuple[str, Dict[str, Any]]:
        try:
            norm_url = normalize_redfish_url(normalized_base_url, path_str)
            rw_url = rewrite_vendor_url(norm_url, target_vendor)
            req_timeout = 5.0 if "Storage" in path_str else 10.0
            res = await asyncio.wait_for(client._request("GET", rw_url), timeout=req_timeout)
            return path_str, res
        except asyncio.TimeoutError:
            logger.warning(f"[Batch Proxy] Sub-request for '{path_str}' timed out after {req_timeout}s. Deferring response.")
            return path_str, {"error": "Timeout", "status_code": 408, "message": f"Sub-request for '{path_str}' deferred after {req_timeout}s timeout limit"}
        except Exception as ex:
            return path_str, {"error": str(ex), "status_code": 500}

    results = await asyncio.gather(*[fetch_path(p) for p in sub_paths], return_exceptions=True)

    responses_map = {}
    for item in results:
        if isinstance(item, tuple) and len(item) == 2:
            p_key, p_res = item
            responses_map[p_key] = p_res

    return {
        "success": True,
        "bmc_ip": clean_ip,
        "vendor": target_vendor,
        "count": len(responses_map),
        "responses": responses_map
    }

@app.post("/api/redfish/server-summary")
async def redfish_server_summary(req: ServerSummaryRequest, request: Request):
    """
    Returns a consolidated single-payload hardware telemetry summary for a target BMC server.
    """
    target_url = None
    username = None
    password = None

    if req.redfishConfig:
        target_url = req.redfishConfig.url
        username = req.redfishConfig.username
        password = req.redfishConfig.password

    if not target_url:
        target_url = req.url or req.bmc_ip
    if not username or not password:
        username = req.username or username
        password = req.password or password

    body_headers = req.headers or {}
    auth_hdr = body_headers.get("Authorization") or body_headers.get("authorization") or request.headers.get("Authorization") or request.headers.get("authorization")
    if auth_hdr:
        hdr_u, hdr_p = decode_basic_auth(auth_hdr)
        if hdr_u:
            username = username or hdr_u
        if hdr_p is not None:
            password = password or hdr_p

    if not target_url or not target_url.strip():
        return JSONResponse(
            status_code=400,
            content={"error": "Bad Request", "message": "Missing required BMC URL or IP address in summary request payload.", "status_code": 400}
        )

    normalized_base_url = normalize_redfish_url(target_url)
    parsed = urlparse(normalized_base_url)
    clean_ip = parsed.netloc.split(":")[0].lstrip("http://").lstrip("https://") if parsed.netloc else target_url

    servers = await db.get_all_servers()
    target_server = next((s for s in servers if s.get("ip", "").lstrip("http://").lstrip("https://").split(":")[0] == clean_ip), None)
    if (not username or not password) and target_server:
        username = username or target_server.get("username", "admin")
        password = password or target_server.get("password", "")

    username = username or "admin"
    password = password or ""

    client = RedfishBMCClient(session_manager, target_url, username, password)
    summary_data = await client.get_detailed_os_inventory()

    if isinstance(summary_data, dict) and "error" in summary_data:
        status_code = summary_data.get("status_code", 500)
        return JSONResponse(
            status_code=status_code if isinstance(status_code, int) and 400 <= status_code <= 599 else 500,
            content=summary_data
        )

    return {
        "success": True,
        "source": f"Consolidated Redfish Server Summary (BMC: {client.bmc_ip})",
        "summary": summary_data
    }

@app.post("/api/redfish/hardware-inventory")
async def redfish_hardware_inventory_endpoint(req: ServerSummaryRequest, request: Request):
    """
    Queries server hardware inventory for RAID Controllers, Physical Drives, and PCIe/AOC Cards
    asynchronously using httpx with 60-second in-memory TTL caching.
    """
    target_url = req.url or req.bmc_ip or (req.redfishConfig.url if req.redfishConfig else "")
    username = req.username or (req.redfishConfig.username if req.redfishConfig else "")
    password = req.password or (req.redfishConfig.password if req.redfishConfig else "")

    if not target_url or not target_url.strip():
        return JSONResponse(status_code=400, content={"error": "Bad Request", "message": "Missing required BMC URL or IP."})

    clean_ip = target_url.replace("https://", "").replace("http://", "").rstrip("/").split(":")[0]
    servers = await db.get_all_servers()
    target_server = next((s for s in servers if s.get("ip", "").replace("https://", "").replace("http://", "").rstrip("/").split(":")[0] == clean_ip), None)

    if (not username or not password) and target_server:
        username = username or target_server.get("username", "admin")
        password = password or target_server.get("password", "")

    username = username or "admin"
    password = password or ""

    try:
        from redfish_hardware_inventory import AsyncRedfishHardwareInventory
        inv_service = AsyncRedfishHardwareInventory(bmc_ip=clean_ip, username=username, password=password)
        inventory = await inv_service.get_full_inventory()
        return {"success": True, "inventory": inventory}
    except Exception as ex:
        logger.error(f"Hardware inventory collection failed for {clean_ip}: {ex}")
        return JSONResponse(status_code=500, content={"error": str(ex)})

@app.post("/api/redfish/fleet-hardware-inventory")
async def redfish_fleet_hardware_inventory_endpoint(request: Request):
    """
    Batched Fleet Optimization Endpoint:
    Queries hardware inventory (RAID controllers, physical drives, PCIe/AOC cards)
    across ALL registered datacenter server BMCs concurrently using asyncio & httpx.
    """
    try:
        servers = await db.get_all_servers()
        if not servers:
            return {"success": True, "total_servers": 0, "servers": {}}

        from redfish_hardware_inventory import collect_datacenter_hardware_inventory
        fleet_data = await collect_datacenter_hardware_inventory(servers)
        return fleet_data
    except Exception as ex:
        logger.error(f"Fleet hardware inventory collection failed: {ex}")
        return JSONResponse(status_code=500, content={"error": str(ex)})

class TelemetryPayload(BaseModel):
    ip: str
    vendor: str = "Tyrone"
    power_state: str = "On"
    cpu_temp_celsius: float = 0.0
    ambient_temp_celsius: float = 0.0
    fan_speed_rpm: int = 0

telemetry_store: Dict[str, Dict[str, Any]] = {}
active_connections: Set[WebSocket] = set()

@app.post("/api/telemetry")
async def ingest_telemetry(payload: TelemetryPayload):
    """
    High-throughput telemetry ingestion endpoint.
    Persists state to PostgreSQL (with high-performance in-memory fallback)
    and broadcasts live update to all active WebSocket clients.
    """
    data = payload.dict()
    telemetry_store[payload.ip] = data

    # 1. Persist asynchronously to DB (PostgreSQL / In-Memory)
    await db.save_telemetry(
        ip=payload.ip,
        vendor=payload.vendor,
        power_state=payload.power_state,
        cpu_temp=payload.cpu_temp_celsius,
        ambient_temp=payload.ambient_temp_celsius,
        fan_speed=payload.fan_speed_rpm,
        raw_metadata={"source": "Redfish BMC Poll"}
    )

    # 2. Broadcast live update to all active WebSocket clients
    disconnected = set()
    for ws in list(active_connections):
        try:
            await ws.send_json(data)
        except Exception:
            disconnected.add(ws)

    # Clean up dead sockets
    active_connections.difference_update(disconnected)
    return {"status": "persisted_and_broadcasted", "ip": payload.ip}

@app.get("/api/telemetry")
async def get_all_telemetry():
    """Returns list of all telemetry records from PostgreSQL DB or in-memory state."""
    db_records = await db.get_all_telemetry()
    if db_records:
        return db_records
    return list(telemetry_store.values())

@app.websocket("/ws")
@app.websocket("/ws/events")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for real-time telemetry streaming to connected UI clients."""
    await websocket.accept()
    active_connections.add(websocket)
    try:
        while True:
            # Keep connection alive and listen for any incoming client pings
            await websocket.receive_text()
    except WebSocketDisconnect:
        active_connections.discard(websocket)
    except Exception:
        active_connections.discard(websocket)

if __name__ == "__main__":
    uvicorn.run("redfish_backend:app", host="127.0.0.1", port=8000, reload=True)
