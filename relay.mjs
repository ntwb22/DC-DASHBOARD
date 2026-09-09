/**
 * Tyrone Bridge v1.1 - The Final Orchestrator (Port 3000 Local Patch)
 * Usage: node relay.mjs
 */
import WebSocket from 'ws';
import axios from 'axios';
import https from 'https';
import http from 'http';
import dgram from 'dgram';

// --- CONFIGURATION ---
// Hardcoded fallback port directly from 3001 to 3000 to match running Docker layout
const CLOUD_APP_URL = process.env.CLOUD_APP_URL || 'ws://localhost:3000/ws';
const AGENT_ID = 'tyrone-' + Math.random().toString(36).substring(2, 8);

// Shared instances to ensure keep-alive and bypass self-signed certificate constraints
const sharedHttpsAgent = new https.Agent({
  rejectUnauthorized: false,
  keepAlive: true,
  maxSockets: 100,
  maxFreeSockets: 10,
  keepAliveMsecs: 10000
});

const sharedHttpAgent = new http.Agent({
  keepAlive: true,
  maxSockets: 100,
  maxFreeSockets: 10,
  keepAliveMsecs: 10000
});

console.log('\n------------------------------------------');
console.log('    TYRONE BRIDGE: LOCAL-TO-LOCAL HUB (3000)');
console.log('------------------------------------------');
console.log('Connecting to: ' + CLOUD_APP_URL);

function startBridge() {
  let heartbeat;
  let reconnectAttempts = 0;

  function connect() {
    const origin = CLOUD_APP_URL.replace('wss://', 'https://').replace('ws://', 'http://').replace('/ws', '');
    const ws = new WebSocket(CLOUD_APP_URL, {
      rejectUnauthorized: false,
      headers: {
        'User-Agent': 'TyroneRelay/1.1',
        'Origin': origin,
        'X-Tyrone-Agent': 'v1.1',
        'X-Agent-ID': AGENT_ID // Injected mandatory authentication identifier mapping context
      }
    });

    ws.on('open', () => {
      console.log('✅ [BRIDGE ESTABLISHED] Authentication Success.');
      console.log('🚀 Ready to monitor local hardware via Port 3000.');
      reconnectAttempts = 0; // Reset counter on successful connection

      clearInterval(heartbeat);
      heartbeat = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.ping();
      }, 20000);
    });

    ws.on('unexpected-response', (req, res) => {
      if (res.statusCode === 302 || res.statusCode === 401 || res.statusCode === 403) {
        console.log('\n❌ [AUTH ERROR] Connection Blocked (HTTP ' + res.statusCode + ')');
        console.log('👉 CAUSE: The Tyrone Dashboard environment is in PRIVATE mode or rejecting the connection payload.');
        process.exit(1);
      } else {
        console.log('❌ Connection failed: HTTP ' + res.statusCode);
        handleReconnect();
      }
    });

    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString());

        if (message.type === 'discovery') {
          const { requestId, payload } = message;
          const subnet = payload?.subnet || '172.16.12';
          console.log('[' + new Date().toLocaleTimeString() + '] Relay starting subnet scan (' + subnet + '.1 - .254)...');

          const found = [];
          const ips = [];
          for (let i = 1; i <= 254; i++) {
            ips.push(subnet + '.' + i);
          }

          const concurrencyLimit = 50;

          const scanIP = async (ip) => {
            for (const proto of ['https', 'http']) {
              const url = proto + '://' + ip + '/redfish/v1/';
              try {
                const res = await axios.get(url, {
                  httpsAgent: sharedHttpsAgent,
                  httpAgent: sharedHttpAgent,
                  timeout: 2500,
                  headers: { Accept: 'application/json' }
                });
                if (res.data) {
                  const data = res.data;
                  const vendor = data.Product || data.Vendor || data.Manufacturer || 'Generic Redfish Device';
                  console.log('   + [NEW SERVER DETECTED] Redfish Target found at ' + ip + ' (' + vendor + ')');
                  found.push({
                    id: ip,
                    ip,
                    address: ip,
                    url: proto + '://' + ip,
                    name: 'Tyrone Server (' + ip + ')',
                    vendor,
                    product: data.Product || vendor,
                    model: data.Model || data.Product || 'Redfish BMC',
                    status: 'Online'
                  });
                  break; // found, skip the other protocol
                }
              } catch (e) {
                // Quietly catch timeouts and non-Redfish endpoints
              }
            }
          };

          const queue = [...ips];
          const workers = Array(concurrencyLimit).fill(null).map(async () => {
            while (queue.length > 0) {
              const ip = queue.shift();
              if (ip) {
                await scanIP(ip);
              }
            }
          });
          await Promise.all(workers);
          ws.send(JSON.stringify({ type: 'discovery_result', requestId, payload: { servers: found } }));
        } else if (message.type === 'ssdp_discovery') {
          const { requestId } = message;
          console.log('[' + new Date().toLocaleTimeString() + '] Relay executing local SSDP multicast discovery...');
          const ssdpFound = [];
          try {
            const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
            socket.on('message', (msg, rinfo) => {
              ssdpFound.push({
                id: rinfo.address,
                address: rinfo.address,
                url: `https://${rinfo.address}/redfish/v1/`,
                manufacturer: 'Tyrone Systems',
                model: 'Tyrone Server BMC',
                desc: 'UPnP/SSDP Detected BMC',
                serial: `SN-${rinfo.address.replace(/\\./g, '')}`,
                udn: `uuid:tyrone-${rinfo.address.replace(/\\./g, '-')}`,
                st: 'urn:dmtf-org:service:redfish-rest:1'
              });
            });
            socket.bind(() => {
              try { socket.setMulticastTTL(4); socket.setBroadcast(true); } catch (_) {}
              const msg = Buffer.from('M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1900\r\nMAN: "ssdp:discover"\r\nMX: 2\r\nST: urn:dmtf-org:service:redfish-rest:1\r\n\r\n');
              socket.send(msg, 0, msg.length, 1900, '239.255.255.250');
              setTimeout(() => {
                try { socket.close(); } catch (_) {}
                ws.send(JSON.stringify({ type: 'discovery_result', requestId, payload: { servers: ssdpFound } }));
              }, 2500);
            });
          } catch (e) {
            ws.send(JSON.stringify({ type: 'discovery_result', requestId, payload: { servers: [] } }));
          }
        } else if (message.type === 'request') {
          const { requestId, payload } = message;
          console.log('[' + new Date().toLocaleTimeString() + '] Proxying ' + (payload.method || 'GET') + ' -> ' + payload.url);

          try {
            const isProbe = payload.url && (payload.url.endsWith('/redfish/v1/') || payload.url.endsWith('/redfish/v1'));
            const reqMethod = (payload.method || 'GET').toUpperCase();
            if ((reqMethod === 'PATCH' || reqMethod === 'PUT') && (!payload.headers || (!payload.headers['If-Match'] && !payload.headers['if-match']))) {
              try {
                console.log(`[Relay ETag Fetch] Fetching ETag for precondition to: ${payload.url}`);
                const getRes = await axios({
                  url: payload.url,
                  method: 'GET',
                  headers: {
                    ...payload.headers,
                    'Accept': 'application/json'
                  },
                  httpsAgent: sharedHttpsAgent,
                  httpAgent: sharedHttpAgent,
                  timeout: 10000
                });
                const etag = getRes.headers?.etag || getRes.headers?.['etag'] || getRes.headers?.ETag || getRes.headers?.['ETag'];
                if (etag) {
                  console.log(`[Relay ETag Found] ETag: ${etag}`);
                  payload.headers = payload.headers || {};
                  payload.headers['If-Match'] = etag;
                }
              } catch (etagErr) {
                console.warn(`[Relay ETag Fetch Failed] Could not fetch ETag: ${etagErr.message}`);
              }
            }

            const response = await axios({
              ...payload,
              httpsAgent: sharedHttpsAgent,
              httpAgent: sharedHttpAgent,
              timeout: isProbe ? 15000 : 45000
            });
            ws.send(JSON.stringify({ type: 'response', requestId, payload: { status: response.status, data: response.data } }));
          } catch (err) {
            const status = (err.response && err.response.status) || 500;
            const data = err.response && err.response.data;
            ws.send(JSON.stringify({
              type: 'response',
              requestId,
              payload: {
                status,
                error: err.message,
                data: data || null
              }
            }));
          }
        }
      } catch (err) {
        console.error('Error processing message:', err.message);
      }
    });

    ws.on('close', () => {
      clearInterval(heartbeat);
      handleReconnect();
    });

    ws.on('error', (err) => {
      console.error('WebSocket Error:', err.message);
    });
  }

  function handleReconnect() {
    reconnectAttempts++;
    const delay = Math.min(30000, Math.pow(2, reconnectAttempts) * 1000);
    const jitter = Math.random() * 1000;
    const finalDelay = delay + jitter;

    console.log(`❌ Connection Lost. Retrying in ${(finalDelay / 1000).toFixed(1)}s... (Attempt ${reconnectAttempts})`);
    setTimeout(connect, finalDelay);
  }

  connect();
}

startBridge();