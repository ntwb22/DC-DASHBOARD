import React, { useEffect, useState } from 'react';

export interface TelemetryNode {
  ip: string;
  vendor: string;
  power_state: string;
  cpu_temp_celsius: number;
  ambient_temp_celsius: number;
  fan_speed_rpm: number;
}

export default function ServerDashboard() {
  const [servers, setServers] = useState<Record<string, TelemetryNode>>({});
  const [connectionStatus, setConnectionStatus] = useState<string>('Connecting...');

  useEffect(() => {
    // 1. Initial REST fetch for current fleet state
    fetch('http://127.0.0.1:8000/api/telemetry')
      .then((res) => res.json())
      .then((data: TelemetryNode[]) => {
        const initialMap: Record<string, TelemetryNode> = {};
        if (Array.isArray(data)) {
          data.forEach((item) => {
            if (item && item.ip) {
              initialMap[item.ip] = item;
            }
          });
        }
        setServers(initialMap);
      })
      .catch((err) => console.error('Failed to load initial telemetry:', err));

    // 2. Real-time WebSocket connection for live pushes
    const ws = new WebSocket('ws://127.0.0.1:8000/ws');

    ws.onopen = () => setConnectionStatus('Connected (Live Stream)');
    ws.onclose = () => setConnectionStatus('Disconnected');
    ws.onerror = () => setConnectionStatus('Connection Error');

    ws.onmessage = (event) => {
      try {
        const payload: TelemetryNode = JSON.parse(event.data);
        if (payload && payload.ip) {
          setServers((prev) => ({
            ...prev,
            [payload.ip]: payload,
          }));
        }
      } catch (err) {
        console.error('Error parsing WebSocket telemetry payload:', err);
      }
    };

    return () => ws.close();
  }, []);

  return (
    <div style={{ padding: '24px', fontFamily: 'Segoe UI, Tahoma, sans-serif', background: '#0f172a', color: '#f8fafc', minHeight: '100vh' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 'bold' }}>Tyrone Core Console - Fleet Telemetry</h2>
        <span style={{ padding: '6px 12px', borderRadius: '4px', background: connectionStatus.includes('Connected') ? '#166534' : '#991b1b', fontSize: '14px', fontWeight: 600 }}>
          {connectionStatus}
        </span>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', background: '#1e293b', borderRadius: '8px', overflow: 'hidden' }}>
          <thead>
            <tr style={{ background: '#334155', textAlign: 'left', color: '#cbd5e1', fontSize: '13px' }}>
              <th style={{ padding: '12px' }}>IP Address</th>
              <th style={{ padding: '12px' }}>Vendor</th>
              <th style={{ padding: '12px' }}>Power</th>
              <th style={{ padding: '12px' }}>CPU Temp</th>
              <th style={{ padding: '12px' }}>Ambient Temp</th>
              <th style={{ padding: '12px' }}>Fan Speed</th>
            </tr>
          </thead>
          <tbody>
            {Object.values(servers).length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: '20px', textAlign: 'center', color: '#94a3b8' }}>
                  Waiting for telemetry data... (Run your load test script)
                </td>
              </tr>
            ) : (
              (Object.values(servers) as TelemetryNode[]).map((server: TelemetryNode) => (
                <tr key={server.ip} style={{ borderBottom: '1px solid #334155' }}>
                  <td style={{ padding: '12px', fontFamily: 'monospace', fontWeight: 600 }}>{server.ip}</td>
                  <td style={{ padding: '12px' }}>{server.vendor}</td>
                  <td style={{ padding: '12px' }}>
                    <span style={{ color: server.power_state === 'On' ? '#4ade80' : '#f87171' }}>●</span> {server.power_state}
                  </td>
                  <td style={{ padding: '12px', color: server.cpu_temp_celsius > 80 ? '#f87171' : '#f8fafc', fontWeight: server.cpu_temp_celsius > 80 ? 'bold' : 'normal' }}>
                    {server.cpu_temp_celsius}°C
                  </td>
                  <td style={{ padding: '12px' }}>{server.ambient_temp_celsius}°C</td>
                  <td style={{ padding: '12px' }}>{server.fan_speed_rpm} RPM</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
