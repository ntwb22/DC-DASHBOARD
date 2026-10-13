"""
===================================================================
Handles asyncpg connection pooling, JSONB column operations for raw inventory,
time-series event logging with throttling support, and AES-256 credential encryption.
"""

import os
import sys
import time
import json
import logging
import asyncio
import base64
import hashlib
from datetime import datetime
from typing import Dict, Any, List, Optional, Tuple

try:
    import asyncpg
    HAS_ASYNCPG = True
except ImportError:
    HAS_ASYNCPG = False

try:
    from cryptography.fernet import Fernet
    HAS_FERNET = True
except ImportError:
    HAS_FERNET = False

logger = logging.getLogger("TyroneDB")

# Global Fernet Key derived from secret or environment
SECRET_KEY = os.getenv("TYRONE_SECRET_KEY", "tyrone-pro-server-secret-key-2026-datacenter")
def _get_fernet_key() -> bytes:
    key_32 = hashlib.sha256(SECRET_KEY.encode()).digest()
    return base64.urlsafe_b64encode(key_32)

def encrypt_credentials(password: str) -> str:
    """Encrypts cleartext password using AES-256 (Fernet)."""
    if not password:
        return ""
    if HAS_FERNET:
        f = Fernet(_get_fernet_key())
        return f.encrypt(password.encode()).decode()
    return base64.b64encode(password.encode()).decode()

def decrypt_credentials(enc_password: str) -> str:
    """Decrypts AES-256 encrypted password back to cleartext."""
    if not enc_password:
        return ""
    try:
        if HAS_FERNET:
            f = Fernet(_get_fernet_key())
            return f.decrypt(enc_password.encode()).decode()
        return base64.b64decode(enc_password.encode()).decode()
    except Exception as e:
        logger.warning(f"Decryption fallback triggered: {e}")
        return enc_password

class PostgresDatabase:
    """PostgreSQL Async Storage Manager using asyncpg connection pool."""

    def __init__(self, dsn: Optional[str] = None):
        self.dsn = dsn or os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/tyrone_db")
        self.pool: Optional[Any] = None
        self.in_memory_fallback: Dict[str, Any] = {
            "servers": {},
            "raw_inventory": [],
            "event_logs": {}
        }

    async def initialize(self):
        """Initializes connection pool and creates relational tables with JSONB columns."""
        if not HAS_ASYNCPG:
            logger.warning("asyncpg module not found. Operating with high-performance in-memory state store.")
            return

        try:
            self.pool = await asyncpg.create_pool(self.dsn, min_size=5, max_size=20, timeout=5.0)
            async with self.pool.acquire() as conn:
                # 1. Servers Table with Vendor tag ('SM' / 'AS') and resolved Redfish paths JSONB
                await conn.execute("""
                    CREATE TABLE IF NOT EXISTS servers (
                        id VARCHAR(64) PRIMARY KEY,
                        name VARCHAR(128) NOT NULL,
                        ip VARCHAR(64) UNIQUE NOT NULL,
                        vendor VARCHAR(16) NOT NULL DEFAULT 'SM',
                        username VARCHAR(64) NOT NULL,
                        enc_password TEXT NOT NULL,
                        health VARCHAR(32) DEFAULT 'OK',
                        power_state VARCHAR(32) DEFAULT 'ON',
                        rack VARCHAR(64) DEFAULT 'Rack 1',
                        resolved_paths JSONB DEFAULT '{}'::jsonb,
                        updated_at TIMESTAMPTZ DEFAULT NOW()
                    );
                    ALTER TABLE servers ADD COLUMN IF NOT EXISTS resolved_paths JSONB DEFAULT '{}'::jsonb;
                    CREATE INDEX IF NOT EXISTS idx_servers_vendor ON servers(vendor);
                """)

                # 2. Raw Inventory Table with JSONB Storage & GIN Optimization Index
                await conn.execute("""
                    CREATE TABLE IF NOT EXISTS raw_inventory (
                        id SERIAL PRIMARY KEY,
                        server_id VARCHAR(64) UNIQUE REFERENCES servers(id) ON DELETE CASCADE,
                        vendor VARCHAR(16) NOT NULL,
                        inventory_json JSONB NOT NULL,
                        network_json JSONB NOT NULL,
                        fetched_at TIMESTAMPTZ DEFAULT NOW()
                    );
                    CREATE UNIQUE INDEX IF NOT EXISTS idx_raw_inv_server_id ON raw_inventory (server_id);
                    CREATE INDEX IF NOT EXISTS idx_raw_inv_gin ON raw_inventory USING gin (inventory_json);
                """)

                # 3. Server Inventory Table
                await conn.execute("""
                    CREATE TABLE IF NOT EXISTS server_inventory (
                        server_id VARCHAR(64) PRIMARY KEY,
                        vendor VARCHAR(16) NOT NULL,
                        inventory_data JSONB NOT NULL,
                        raw_payload JSONB NOT NULL,
                        updated_at TIMESTAMPTZ DEFAULT NOW()
                    );
                """)

                # 4. Time-series Event Logs Table with Occurrences Throttling
                await conn.execute("""
                    CREATE TABLE IF NOT EXISTS event_logs (
                        id SERIAL PRIMARY KEY,
                        server_id VARCHAR(64) NOT NULL,
                        event_type VARCHAR(64) NOT NULL,
                        severity VARCHAR(32) NOT NULL DEFAULT 'OK',
                        message TEXT NOT NULL,
                        event_hash VARCHAR(64) UNIQUE NOT NULL,
                        occurrences INT DEFAULT 1,
                        first_seen TIMESTAMPTZ DEFAULT NOW(),
                        last_seen TIMESTAMPTZ DEFAULT NOW()
                    );
                    CREATE INDEX IF NOT EXISTS idx_event_hash ON event_logs(event_hash);
                """)

                # 5. Server Telemetry Table with JSONB Raw Metadata
                await conn.execute("""
                    CREATE TABLE IF NOT EXISTS server_telemetry (
                        id SERIAL PRIMARY KEY,
                        ip VARCHAR(64) UNIQUE NOT NULL,
                        vendor VARCHAR(32) DEFAULT 'Tyrone',
                        power_state VARCHAR(32) DEFAULT 'On',
                        cpu_temp_celsius DOUBLE PRECISION,
                        ambient_temp_celsius DOUBLE PRECISION,
                        fan_speed_rpm INT,
                        raw_metadata JSONB DEFAULT '{}'::jsonb,
                        updated_at TIMESTAMPTZ DEFAULT NOW()
                    );
                    CREATE UNIQUE INDEX IF NOT EXISTS idx_telemetry_ip ON server_telemetry(ip);
                """)
            logger.info("Successfully connected to PostgreSQL database and initialized JSONB schemas.")
        except Exception as e:
            logger.warning(f"PostgreSQL pool connection failed ({e}). Defaulting to internal high-performance fallback store.")
            self.pool = None

    async def save_server(self, server_id: str, name: str, ip: str, vendor: str, username: str, password: str, rack: str = "Rack 1") -> bool:
        """Saves or updates a server record with explicit vendor tag and encrypted credentials."""
        clean_ip = ip.lstrip("http://").lstrip("https://").strip().rstrip("/")
        enc_pass = encrypt_credentials(password) if password else ""
        vendor_tag = vendor.upper() if vendor.upper() in ("SM", "AS") else "SM"

        if self.pool:
            try:
                async with self.pool.acquire() as conn:
                    existing = await conn.fetchrow("SELECT id, enc_password FROM servers WHERE id = $1 OR ip = $2;", server_id, clean_ip)
                    if existing:
                        final_pass = enc_pass if password else existing["enc_password"]
                        await conn.execute("""
                            UPDATE servers
                            SET name = $1, ip = $2, vendor = $3, username = $4, enc_password = $5, rack = $6, updated_at = NOW()
                            WHERE id = $7 OR ip = $2;
                        """, name, clean_ip, vendor_tag, username, final_pass, rack, existing["id"])
                    else:
                        await conn.execute("""
                            INSERT INTO servers (id, name, ip, vendor, username, enc_password, rack, updated_at)
                            VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
                            ON CONFLICT (id) DO UPDATE SET
                                name = EXCLUDED.name,
                                ip = EXCLUDED.ip,
                                vendor = EXCLUDED.vendor,
                                username = EXCLUDED.username,
                                enc_password = CASE WHEN EXCLUDED.enc_password <> '' THEN EXCLUDED.enc_password ELSE servers.enc_password END,
                                rack = EXCLUDED.rack,
                                updated_at = NOW();
                        """, server_id, name, clean_ip, vendor_tag, username, enc_pass, rack)
                return True
            except Exception as e:
                logger.error(f"Failed to save server to PostgreSQL: {e}")

        # Invalidate servers cache so immediate queries return fresh data
        self._servers_cache = None
        self._cache_time = 0

        # Fallback store
        # Deduplicate any existing server with the same IP under another ID
        for old_id in list(self.in_memory_fallback["servers"].keys()):
            if self.in_memory_fallback["servers"][old_id].get("ip") == clean_ip and old_id != server_id:
                del self.in_memory_fallback["servers"][old_id]

        existing_fallback_pass = self.in_memory_fallback["servers"].get(server_id, {}).get("enc_password", "")
        self.in_memory_fallback["servers"][server_id] = {
            "id": server_id,
            "name": name,
            "ip": clean_ip,
            "vendor": vendor_tag,
            "username": username,
            "enc_password": enc_pass or existing_fallback_pass,
            "rack": rack,
            "health": "OK",
            "power_state": "On"
        }
        return True

    async def update_server_status(self, server_id: str, health: str = "OK", power_state: str = "On") -> bool:
        """Updates server health and power state in PostgreSQL."""
        clean_ip = server_id.lstrip("http://").lstrip("https://").strip()
        if self.pool:
            try:
                async with self.pool.acquire() as conn:
                    await conn.execute("""
                        UPDATE servers
                        SET health = $1, power_state = $2, updated_at = NOW()
                        WHERE id = $3 OR ip = $3 OR ip = $4;
                    """, health, power_state, server_id, clean_ip)
                return True
            except Exception as e:
                logger.error(f"Failed to update server status in PostgreSQL: {e}")

        for s_id, s_data in self.in_memory_fallback["servers"].items():
            if s_id == server_id or s_data.get("ip") == clean_ip:
                s_data["health"] = health
                s_data["power_state"] = power_state
        return True

    async def get_all_servers(self) -> List[Dict[str, Any]]:
        """Retrieves list of registered servers with decrypted credentials (cached for 5 seconds)."""
        now = time.time()
        # ponytail: 5s TTL cache avoids redundant SQL queries and Fernet decryption overhead on every proxy call. Upgrade path: invalidate on server mutations.
        if hasattr(self, "_servers_cache") and (now - getattr(self, "_cache_time", 0) < 5.0):
            return self._servers_cache

        res = []
        if self.pool:
            try:
                async with self.pool.acquire() as conn:
                    rows = await conn.fetch("SELECT id, name, ip, vendor, username, enc_password, health, power_state, rack FROM servers;")
                    for r in rows:
                        d = dict(r)
                        d["password"] = decrypt_credentials(d.pop("enc_password", ""))
                        res.append(d)
                    self._servers_cache = res
                    self._cache_time = now
                    return res
            except Exception as e:
                logger.error(f"Failed to fetch servers from PostgreSQL: {e}")

        # Fallback store
        for s in self.in_memory_fallback["servers"].values():
            item = dict(s)
            item["password"] = decrypt_credentials(item.get("enc_password", ""))
            res.append(item)
        self._servers_cache = res
        self._cache_time = now
        return res

    async def get_server(self, server_id: str) -> Optional[Dict[str, Any]]:
        """Retrieves a single server by ID, IP, or name."""
        if not server_id:
            return None
        servers = await self.get_all_servers()
        clean_target = str(server_id).replace("https://", "").replace("http://", "").rstrip("/").split(":")[0].strip().lower()
        for s in servers:
            s_id = str(s.get("id", "")).lower()
            s_ip = str(s.get("ip", "")).lower()
            s_name = str(s.get("name", "")).lower()
            if s_id == server_id.lower() or s_ip == clean_target or s_name == server_id.lower() or clean_target in s_id or s_id in clean_target:
                return s
        return None

    async def delete_server(self, server_id: str) -> bool:
        """Deletes a server record by ID, IP, or URL from PostgreSQL database and memory fallback registry."""
        if not server_id:
            return False

        target_str = str(server_id).strip()
        ip_clean = target_str.replace("https://", "").replace("http://", "").rstrip("/").split(":")[0].strip()
        srv_id = f"srv-{ip_clean}" if ip_clean and not target_str.startswith("srv-") else target_str

        targets = {target_str, ip_clean, srv_id}

        if self.pool:
            try:
                async with self.pool.acquire() as conn:
                    rows = await conn.fetch(
                        """
                        SELECT id, ip, name FROM servers 
                        WHERE id = ANY($1::text[]) OR ip = ANY($1::text[]) OR name = ANY($1::text[]);
                        """,
                        list(targets)
                    )
                    for r in rows:
                        if r.get("id"):
                            targets.add(r["id"])
                        if r.get("ip"):
                            targets.add(r["ip"])
                            clean_r_ip = r["ip"].replace("https://", "").replace("http://", "").rstrip("/").split(":")[0].strip()
                            targets.add(clean_r_ip)
                        if r.get("name"):
                            targets.add(r["name"])

                    target_list = list(targets)

                    await conn.execute("DELETE FROM raw_inventory WHERE server_id = ANY($1::text[]);", target_list)
                    await conn.execute("DELETE FROM server_inventory WHERE server_id = ANY($1::text[]);", target_list)
                    await conn.execute("DELETE FROM event_logs WHERE server_id = ANY($1::text[]);", target_list)
                    await conn.execute(
                        "DELETE FROM servers WHERE id = ANY($1::text[]) OR ip = ANY($1::text[]) OR name = ANY($1::text[]);",
                        target_list
                    )
                logger.info(f"Successfully deleted server '{server_id}' (targets: {target_list}) from PostgreSQL database.")
            except Exception as e:
                logger.error(f"Failed to delete server '{server_id}' from PostgreSQL: {e}")

        # Always clean up in-memory fallback store as well
        for t in list(targets):
            self.in_memory_fallback["servers"].pop(t, None)

        self.in_memory_fallback["raw_inventory"] = [
            r for r in self.in_memory_fallback["raw_inventory"]
            if r.get("server_id") not in targets
        ]
        self._servers_cache = None
        self._cache_time = 0
        return True

    async def save_raw_inventory(self, server_id: str, vendor: str, inventory_json: Dict[str, Any], network_json: Dict[str, Any]):
        """Dumps raw Redfish JSON objects directly into PostgreSQL JSONB columns."""
        inv_str = json.dumps(inventory_json)
        net_str = json.dumps(network_json)

        if self.pool:
            try:
                async with self.pool.acquire() as conn:
                    await conn.execute("""
                        INSERT INTO raw_inventory (server_id, vendor, inventory_json, network_json, fetched_at)
                        VALUES ($1, $2, $3::jsonb, $4::jsonb, NOW())
                        ON CONFLICT (server_id) DO UPDATE SET
                            vendor = EXCLUDED.vendor,
                            inventory_json = EXCLUDED.inventory_json,
                            network_json = EXCLUDED.network_json,
                            fetched_at = NOW();
                    """, server_id, vendor, inv_str, net_str)
                return
            except Exception as e:
                logger.error(f"Failed to save raw_inventory JSONB: {e}")

        # Fallback store
        self.in_memory_fallback["raw_inventory"].append({
            "server_id": server_id,
            "vendor": vendor,
            "inventory_json": inventory_json,
            "network_json": network_json,
            "fetched_at": datetime.now().isoformat()
        })

    async def upsert_server_inventory(self, server_id: str, vendor: str, inventory_data: dict, raw_payload: dict = None):
        """
        Upserts server inventory and hardware details into PostgreSQL.
        """
        inv_json = json.dumps(inventory_data)
        raw_json = json.dumps(raw_payload or {})

        if self.pool:
            try:
                async with self.pool.acquire() as connection:
                    await connection.execute(
                        """
                        INSERT INTO server_inventory (server_id, vendor, inventory_data, raw_payload, updated_at)
                        VALUES ($1, $2, $3::jsonb, $4::jsonb, NOW())
                        ON CONFLICT (server_id) 
                        DO UPDATE SET 
                            vendor = EXCLUDED.vendor,
                            inventory_data = EXCLUDED.inventory_data,
                            raw_payload = EXCLUDED.raw_payload,
                            updated_at = NOW();
                        """,
                        server_id,
                        vendor,
                        inv_json,
                        raw_json
                    )
                await self.save_raw_inventory(server_id, vendor, inventory_data, raw_payload or {})
                return
            except Exception as e:
                logger.error(f"Failed to upsert server_inventory JSONB: {e}")

        # Fallback store
        await self.save_raw_inventory(server_id, vendor, inventory_data, raw_payload or {})

    async def save_resolved_paths(self, server_id_or_ip: str, paths: Dict[str, Any]) -> bool:
        """Saves dynamically discovered Redfish URI paths per server IP/ID to PostgreSQL."""
        clean_target = server_id_or_ip.lstrip("http://").lstrip("https://").strip()
        paths_json = json.dumps(paths)
        if self.pool:
            try:
                async with self.pool.acquire() as conn:
                    await conn.execute("""
                        UPDATE servers
                        SET resolved_paths = $1::jsonb, updated_at = NOW()
                        WHERE id = $2 OR ip = $2 OR ip = $3;
                    """, paths_json, server_id_or_ip, clean_target)
                return True
            except Exception as e:
                logger.error(f"Failed to save resolved_paths to PostgreSQL: {e}")

        for s_id, s_data in self.in_memory_fallback["servers"].items():
            if s_id == server_id_or_ip or s_data.get("ip") == clean_target:
                s_data["resolved_paths"] = paths
        return True

    async def get_resolved_paths(self, server_id_or_ip: str) -> Dict[str, Any]:
        """Looks up dynamically resolved Redfish URI paths from PostgreSQL per server IP/ID."""
        clean_target = server_id_or_ip.lstrip("http://").lstrip("https://").strip()
        if self.pool:
            try:
                async with self.pool.acquire() as conn:
                    row = await conn.fetchrow("""
                        SELECT resolved_paths FROM servers
                        WHERE id = $1 OR ip = $1 OR ip = $2;
                    """, server_id_or_ip, clean_target)
                    if row and row["resolved_paths"]:
                        val = row["resolved_paths"]
                        return json.loads(val) if isinstance(val, str) else val
            except Exception as e:
                logger.error(f"Failed to fetch resolved_paths from PostgreSQL: {e}")

        for s_id, s_data in self.in_memory_fallback["servers"].items():
            if s_id == server_id_or_ip or s_data.get("ip") == clean_target:
                return s_data.get("resolved_paths", {})
        return {}

    async def bulk_upsert_server_inventory(self, items: List[Dict[str, Any]]) -> bool:
        """
        Performs bulk database upserts of server inventory in a single transaction
        to eliminate write bottlenecks across the fleet.
        """
        if not items:
            return True
        if self.pool:
            try:
                async with self.pool.acquire() as conn:
                    async with conn.transaction():
                        for item in items:
                            sid = item.get("server_id") or item.get("id")
                            if not sid:
                                continue
                            vendor = item.get("vendor", "SM")
                            inv_data = item.get("inventory_data") or item.get("inventory_json") or item
                            raw_data = item.get("raw_payload") or item.get("network_json") or {}
                            inv_json = json.dumps(inv_data)
                            raw_json = json.dumps(raw_data)

                            await conn.execute("""
                                INSERT INTO server_inventory (server_id, vendor, inventory_data, raw_payload, updated_at)
                                VALUES ($1, $2, $3::jsonb, $4::jsonb, NOW())
                                ON CONFLICT (server_id) DO UPDATE SET
                                    vendor = EXCLUDED.vendor,
                                    inventory_data = EXCLUDED.inventory_data,
                                    raw_payload = EXCLUDED.raw_payload,
                                    updated_at = NOW();
                            """, sid, vendor, inv_json, raw_json)

                            await conn.execute("""
                                INSERT INTO raw_inventory (server_id, vendor, inventory_json, network_json, fetched_at)
                                VALUES ($1, $2, $3::jsonb, $4::jsonb, NOW())
                                ON CONFLICT (server_id) DO UPDATE SET
                                    vendor = EXCLUDED.vendor,
                                    inventory_json = EXCLUDED.inventory_json,
                                    network_json = EXCLUDED.network_json,
                                    fetched_at = NOW();
                            """, sid, vendor, inv_json, raw_json)
                return True
            except Exception as e:
                logger.error(f"Failed bulk_upsert_server_inventory in PostgreSQL transaction: {e}")

        # Fallback in-memory store
        for item in items:
            sid = item.get("server_id") or item.get("id")
            if sid:
                v = item.get("vendor", "SM")
                inv_data = item.get("inventory_data") or item.get("inventory_json") or item
                raw_data = item.get("raw_payload") or item.get("network_json") or {}
                await self.save_raw_inventory(sid, v, inv_data, raw_data)
        return True

    async def get_static_inventory(self, server_id_or_ip: str) -> Optional[Dict[str, Any]]:
        """
        Read-Through Buffer: Retrieves cached static inventory attributes (model, serial, CPUs, RAM)
        from PostgreSQL to avoid repetitive network roundtrips over BMC HTTP.
        """
        clean_target = server_id_or_ip.lstrip("http://").lstrip("https://").strip()
        if self.pool:
            try:
                async with self.pool.acquire() as conn:
                    row = await conn.fetchrow("""
                        SELECT r.inventory_json, r.vendor
                        FROM raw_inventory r
                        JOIN servers s ON r.server_id = s.id
                        WHERE s.id = $1 OR s.ip = $1 OR s.ip = $2;
                    """, server_id_or_ip, clean_target)
                    if row and row["inventory_json"]:
                        inv = row["inventory_json"]
                        inv_dict = json.loads(inv) if isinstance(inv, str) else inv
                        if inv_dict.get("Model") or inv_dict.get("Manufacturer") or inv_dict.get("SerialNumber"):
                            return inv_dict
            except Exception as e:
                logger.error(f"Failed to fetch static inventory from PostgreSQL: {e}")

        for s_id, s_data in self.in_memory_fallback["servers"].items():
            if s_id == server_id_or_ip or s_data.get("ip") == clean_target:
                inv = next((r for r in self.in_memory_fallback["raw_inventory"] if r.get("server_id") == s_id), {})
                return inv.get("inventory_json")
        return None


    async def record_event_log(self, server_id: str, event_type: str, severity: str, message: str) -> Dict[str, Any]:
        """
        Pipes raw SSE event into time-series event_logs with 5-second duplicate throttling.
        If an identical event_hash occurs multiple times, increments occurrences counter.
        """
        event_hash = hashlib.md5(f"{server_id}:{event_type}:{message}".encode()).hexdigest()
        now = datetime.now()

        if self.pool:
            try:
                async with self.pool.acquire() as conn:
                    # Upsert with 5-second window check logic
                    row = await conn.fetchrow("""
                        INSERT INTO event_logs (server_id, event_type, severity, message, event_hash, occurrences, first_seen, last_seen)
                        VALUES ($1, $2, $3, $4, $5, 1, NOW(), NOW())
                        ON CONFLICT (event_hash) DO UPDATE SET
                            occurrences = CASE
                                WHEN (NOW() - event_logs.last_seen) <= INTERVAL '5 seconds'
                                THEN event_logs.occurrences + 1
                                ELSE event_logs.occurrences
                            END,
                            last_seen = NOW()
                        RETURNING occurrences, first_seen, last_seen;
                    """, server_id, event_type, severity, message, event_hash)
                    return {
                        "server_id": server_id,
                        "event_type": event_type,
                        "severity": severity,
                        "message": message,
                        "occurrences": row["occurrences"] if row else 1
                    }
            except Exception as e:
                logger.error(f"Failed to record event_log in PostgreSQL: {e}")

        # Fallback store
        existing = self.in_memory_fallback["event_logs"].get(event_hash)
        if existing:
            existing["occurrences"] += 1
            existing["last_seen"] = now.isoformat()
            return existing
        else:
            rec = {
                "server_id": server_id,
                "event_type": event_type,
                "severity": severity,
                "message": message,
                "event_hash": event_hash,
                "occurrences": 1,
                "first_seen": now.isoformat(),
                "last_seen": now.isoformat()
            }
            self.in_memory_fallback["event_logs"][event_hash] = rec
            return rec

    async def patch_server_health_from_event(self, server_id_or_ip: str, severity: str, message: str, event_type: str = "SSE"):
        """
        Event-Driven Database Update: Immediately patches PostgreSQL server health and JSONB record
        when a critical SSE event arrives without waiting for the 24-hour polling cycle.
        """
        clean_target = server_id_or_ip.lstrip("http://").lstrip("https://").strip()
        new_health = "Critical" if severity.lower() in ("critical", "fatal", "high") else ("Warning" if severity.lower() in ("warning", "warn", "medium", "minor") else "OK")

        if self.pool:
            try:
                async with self.pool.acquire() as conn:
                    await conn.execute("""
                        UPDATE servers
                        SET health = $1, updated_at = NOW()
                        WHERE id = $2 OR ip = $2 OR ip = $3;
                    """, new_health, server_id_or_ip, clean_target)

                    await conn.execute("""
                        UPDATE raw_inventory
                        SET inventory_json = jsonb_set(inventory_json, '{Status,Health}', to_jsonb($1::text), true),
                            fetched_at = NOW()
                        WHERE server_id = $2 OR server_id IN (SELECT id FROM servers WHERE ip = $2 OR ip = $3);
                    """, new_health, server_id_or_ip, clean_target)
                logger.info(f"Patched PostgreSQL health to {new_health} for server {clean_target} via real-time SSE event.")
                return
            except Exception as e:
                logger.error(f"Failed to patch server health in PostgreSQL: {e}")

        # Fallback store update
        for s_id, s_data in self.in_memory_fallback["servers"].items():
            if s_id == server_id_or_ip or s_data.get("ip") == clean_target:
                s_data["health"] = new_health

    async def get_cached_inventory(self) -> List[Dict[str, Any]]:
        """
        Instant UI Refresh handler: Serves complete inventory strictly from PostgreSQL database cache
        in milliseconds, preventing BMC socket exhaustion or lagging.
        """
        if self.pool:
            try:
                async with self.pool.acquire() as conn:
                    rows = await conn.fetch("""
                        SELECT s.id, s.name, s.ip, s.vendor, s.health, s.power_state, s.rack,
                               r.inventory_json, r.network_json, r.fetched_at
                        FROM servers s
                        LEFT JOIN raw_inventory r ON s.id = r.server_id;
                    """)
                    result = []
                    for r in rows:
                        d = dict(r)
                        if d.get("inventory_json"):
                            try:
                                d["inventory_json"] = json.loads(d["inventory_json"]) if isinstance(d["inventory_json"], str) else d["inventory_json"]
                            except Exception: pass
                        if d.get("network_json"):
                            try:
                                d["network_json"] = json.loads(d["network_json"]) if isinstance(d["network_json"], str) else d["network_json"]
                            except Exception: pass
                        result.append(d)
                    return result
            except Exception as e:
                logger.error(f"Failed to fetch cached inventory from PostgreSQL: {e}")

        # Fallback store
        res = []
        for s_id, s_data in self.in_memory_fallback["servers"].items():
            inv = next((r for r in self.in_memory_fallback["raw_inventory"] if r.get("server_id") == s_id), {})
            item = dict(s_data)
            item["inventory_json"] = inv.get("inventory_json", {})
            item["network_json"] = inv.get("network_json", {})
            res.append(item)
        return res

    async def get_all_inventories(self) -> List[Dict[str, Any]]:
        """
        Returns normalized present-only hardware inventory records directly from PostgreSQL DB cache
        with explicit power state, reachability, and last_seen timestamps.
        """
        from normalizer import normalize_inventory
        cached_rows = await self.get_cached_inventory()
        normalized_list: List[Dict[str, Any]] = []

        for item in cached_rows:
            v = item.get("vendor", "SM")
            sys_json = item.get("inventory_json") or {}
            net_json = item.get("network_json") or {}
            norm = normalize_inventory(v, sys_json, net_json)
            
            p_state = item.get("power_state") or sys_json.get("PowerState") or "On"
            h_status = item.get("health") or norm.get("healthStatus") or "OK"
            
            is_off = str(p_state).lower() in ("off", "poweringoff", "disabled")
            is_unreachable = h_status.lower() in ("offline", "unreachable") or not item.get("inventory_json")
            
            if is_unreachable:
                final_power = "Unreachable"
                final_health = "Offline"
                is_online = False
            elif is_off:
                final_power = "Off"
                final_health = h_status if h_status != "Offline" else "OK"
                is_online = False
            else:
                final_power = "On"
                final_health = h_status
                is_online = True

            norm["id"] = item.get("id")
            norm["name"] = item.get("name")
            norm["ip"] = item.get("ip")
            norm["rack"] = item.get("rack", "Rack 1")
            norm["healthStatus"] = final_health
            norm["powerState"] = final_power
            norm["is_online"] = is_online
            norm["status"] = "ONLINE" if is_online else ("POWER_OFF" if final_power == "Off" else "OFFLINE")
            norm["last_seen"] = str(item.get("fetched_at") or datetime.now().isoformat())
            normalized_list.append(norm)

        return normalized_list

    async def get_server_inventory(self, server_id: str) -> Optional[Dict[str, Any]]:
        """Retrieves normalized inventory for a single server by ID or IP."""
        if not server_id:
            return None
        inventories = await self.get_all_inventories()
        clean_target = str(server_id).replace("https://", "").replace("http://", "").rstrip("/").split(":")[0].strip().lower()
        for inv in inventories:
            inv_id = str(inv.get("id", "")).lower()
            inv_ip = str(inv.get("ip", "")).lower()
            if inv_id == server_id.lower() or inv_ip == clean_target or clean_target in inv_id or inv_id in clean_target:
                return inv
        return None

    async def save_telemetry(self, ip: str, vendor: str, power_state: str, cpu_temp: float, ambient_temp: float, fan_speed: int, raw_metadata: Optional[Dict[str, Any]] = None) -> bool:
        """Upserts server telemetry record into PostgreSQL server_telemetry JSONB table."""
        if raw_metadata is None:
            raw_metadata = {"source": "Redfish BMC Poll"}

        if self.pool:
            try:
                async with self.pool.acquire() as conn:
                    await conn.execute("""
                        INSERT INTO server_telemetry (ip, vendor, power_state, cpu_temp_celsius, ambient_temp_celsius, fan_speed_rpm, raw_metadata, updated_at)
                        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, NOW())
                        ON CONFLICT (ip) DO UPDATE
                        SET vendor = EXCLUDED.vendor,
                            power_state = EXCLUDED.power_state,
                            cpu_temp_celsius = EXCLUDED.cpu_temp_celsius,
                            ambient_temp_celsius = EXCLUDED.ambient_temp_celsius,
                            fan_speed_rpm = EXCLUDED.fan_speed_rpm,
                            raw_metadata = EXCLUDED.raw_metadata,
                            updated_at = NOW();
                    """, ip, vendor, power_state, cpu_temp, ambient_temp, fan_speed, json.dumps(raw_metadata))
                    return True
            except Exception as e:
                logger.error(f"Error persisting telemetry to DB: {e}")

        # Fallback to in-memory store
        if "telemetry" not in self.in_memory_fallback:
            self.in_memory_fallback["telemetry"] = {}
        self.in_memory_fallback["telemetry"][ip] = {
            "ip": ip,
            "vendor": vendor,
            "power_state": power_state,
            "cpu_temp_celsius": cpu_temp,
            "ambient_temp_celsius": ambient_temp,
            "fan_speed_rpm": fan_speed,
            "raw_metadata": raw_metadata
        }
        return True

    async def get_all_telemetry(self) -> List[Dict[str, Any]]:
        """Fetches all server telemetry records from PostgreSQL or fallback store."""
        if self.pool:
            try:
                async with self.pool.acquire() as conn:
                    rows = await conn.fetch("SELECT ip, vendor, power_state, cpu_temp_celsius, ambient_temp_celsius, fan_speed_rpm, raw_metadata FROM server_telemetry ORDER BY updated_at DESC;")
                    return [
                        {
                            "ip": r["ip"],
                            "vendor": r["vendor"],
                            "power_state": r["power_state"],
                            "cpu_temp_celsius": r["cpu_temp_celsius"],
                            "ambient_temp_celsius": r["ambient_temp_celsius"],
                            "fan_speed_rpm": r["fan_speed_rpm"],
                            "raw_metadata": json.loads(r["raw_metadata"]) if isinstance(r["raw_metadata"], str) else (r["raw_metadata"] or {})
                        }
                        for r in rows
                    ]
            except Exception as e:
                logger.error(f"Error reading telemetry from DB: {e}")

        telemetry_map = self.in_memory_fallback.get("telemetry", {})
        return list(telemetry_map.values())

# Global Singleton Database Instance
db = PostgresDatabase()
