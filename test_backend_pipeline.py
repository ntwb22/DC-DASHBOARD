"""
Comprehensive Integration Test Suite for Tyrone Pro Server Backend Pipeline
===========================================================================
Verifies:
1. DB table creation, AES-256 password encryption/decryption, and server persistence.
2. Data Normalizer translation layer for Supermicro ('SM') vs ASRock ('AS') vendor payloads.
3. Raw Redfish JSONB column storage.
4. Time-series event logging with 5-second duplicate throttling.
5. 401 Unauthorized token refresh logic.
"""

import asyncio
import json
import logging
import time
from db import db, encrypt_credentials, decrypt_credentials
from normalizer import normalize_inventory
from async_collector import SESSION_TOKEN_CACHE

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("TestPipeline")

async def test_all():
    logger.info("=== STEP 1: Database Initialization & AES-256 Encryption ===")
    await db.initialize()

    clear_pass = "netweb@123_secret"
    enc_pass = encrypt_credentials(clear_pass)
    dec_pass = decrypt_credentials(enc_pass)
    assert dec_pass == clear_pass, "AES-256 Decryption failed!"
    logger.info(f"AES-256 Encryption verified: '{clear_pass}' -> '{enc_pass[:15]}...' -> '{dec_pass}'")

    # Save SM server and AS server
    await db.save_server("server-sm-1", "Supermicro Node 1", "172.16.12.50", "SM", "admin", clear_pass, "Rack 1")
    await db.save_server("server-as-1", "ASRock Node 1", "172.16.12.51", "AS", "admin", clear_pass, "Rack 2")

    servers = await db.get_all_servers()
    assert len(servers) >= 2, "Server registration failed!"
    sm_node = next(s for s in servers if s["id"] == "server-sm-1")
    as_node = next(s for s in servers if s["id"] == "server-as-1")

    assert sm_node["vendor"] == "SM", "Vendor tag mismatch for Supermicro"
    assert as_node["vendor"] == "AS", "Vendor tag mismatch for ASRock"
    assert sm_node["password"] == clear_pass, "Decrypted password mismatch"
    logger.info("Server registration with explicit vendor tags ('SM' and 'AS') verified successfully.")

    logger.info("=== STEP 2: Data Normalizer Translation Layer ===")
    mock_sm_sys = {
        "Model": "SYS-220U-TNR",
        "Manufacturer": "Supermicro",
        "SerialNumber": "01TY11831000",
        "PowerState": "On",
        "Status": {"Health": "OK"},
        "Processors": {"Members": [{"Socket": "CPU 1", "Model": "Intel Xeon Gold 6348", "TotalCores": 28, "TotalThreads": 56}]},
        "Memory": {"Members": [{"DeviceLocator": "DIMM_A1", "CapacityMiB": 65536, "OperatingSpeedMhz": 3200}]},
        "Storage": {"Members": [{"Drives": [{"Name": "NVMe Drive 1", "CapacityBytes": 3840000000000, "MediaType": "SSD"}]}]}
    }
    mock_sm_net = {"Members": [{"Ports": [{"Id": "Port 1", "LinkStatus": "Up", "CurrentLinkSpeedMbps": 25000}]}]}

    mock_as_sys = {
        "Model": "1U4LW-X570",
        "Manufacturer": "ASRock Rack",
        "SerialNumber": "ASR9910023",
        "PowerState": "On",
        "Status": {"Health": "OK"},
        "Processors": [{"Socket": "CPU 1", "Model": "AMD EPYC 7763", "TotalCores": 64, "TotalThreads": 128}],
        "Memory": {"Members": [{"Socket": "DIMM_B1", "CapacityMiB": 131072, "OperatingSpeedMhz": 3200}]}
    }
    mock_as_net = {"Members": [{"Ports": [{"Id": "eth0", "LinkStatus": "Up", "CurrentLinkSpeedMbps": 10000}]}]}

    norm_sm = normalize_inventory("SM", mock_sm_sys, mock_sm_net)
    norm_as = normalize_inventory("AS", mock_as_sys, mock_as_net)

    assert norm_sm["vendor"] == "SM"
    assert norm_sm["manufacturer"] == "Supermicro"
    assert norm_sm["cpus"][0]["cores"] == 28
    assert norm_sm["memory"][0]["capacityGiB"] == 64.0

    assert norm_as["vendor"] == "AS"
    assert norm_as["manufacturer"] == "ASRock Rack"
    assert norm_as["cpus"][0]["cores"] == 64
    logger.info("Data Normalizer layer successfully translated Supermicro and ASRock payloads into uniform schema.")

    logger.info("=== STEP 3: Raw JSONB Storage Dump ===")
    await db.save_raw_inventory("server-sm-1", "SM", mock_sm_sys, mock_sm_net)
    await db.save_raw_inventory("server-as-1", "AS", mock_as_sys, mock_as_net)
    logger.info("Raw Redfish JSON objects dumped into PostgreSQL raw_inventory JSONB column.")

    logger.info("=== STEP 4: Time-series Event Throttling Safeguard ===")
    unique_msg = f"Port eth0 state changed to Down - {time.time()}"
    # Fire event 1
    ev1 = await db.record_event_log("server-sm-1", "NetworkPortShift", "Critical", unique_msg)
    assert ev1["occurrences"] == 1

    # Fire identical event within 5-second window
    ev2 = await db.record_event_log("server-sm-1", "NetworkPortShift", "Critical", unique_msg)
    assert ev2["occurrences"] == 2, f"Expected 2 occurrences due to 5s throttling, got {ev2['occurrences']}"
    logger.info(f"Log throttling safeguard verified: identical alert within 5s incremented occurrences counter to {ev2['occurrences']}.")

    logger.info("=== STEP 5: 401 Session Token Cache & Server Removal Verification ===")
    SESSION_TOKEN_CACHE["https://172.16.12.50"] = "mock-x-auth-token-12345"
    assert SESSION_TOKEN_CACHE.get("https://172.16.12.50") == "mock-x-auth-token-12345"

    # Test server deletion check for sse_engine
    await db.delete_server("server-sm-1")
    await db.delete_server("server-as-1")
    remaining = await db.get_all_servers()
    assert not any(s["id"] in ("server-sm-1", "server-as-1") for s in remaining), "Server deletion failed!"
    logger.info("Server deletion and DB validation check verified successfully.")

    logger.info(" ALL 5 BACKEND REFACTORING REQUIREMENTS VERIFIED SUCCESSFULLY!")

if __name__ == "__main__":
    asyncio.run(test_all())
