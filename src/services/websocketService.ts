/**
 * Tyrone Pro Server Real-Time WebSocket Service
 * ============================================
 * Connects to the local Python backend WebSocket endpoint (ws://127.0.0.1:8000/ws/events).
 * Listens for incoming normalized telemetry metrics, alerts, and state mutations,
 * dispatching events to update status dots and health indicators instantly without polling.
 */

class TelemetryWebSocketService {
  private socket: WebSocket | null = null;
  private url: string = "ws://127.0.0.1:8000/ws/events";
  private isConnected: boolean = false;
  private reconnectIntervalMs: number = 3000;
  private reconnectTimer: any = null;

  public connect() {
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    try {
      this.socket = new WebSocket(this.url);

      this.socket.onopen = () => {
        this.isConnected = true;
        console.log("⚡ [WebSocket] Connected to Tyrone Python Backend (ws://127.0.0.1:8000/ws/events)");
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }
      };

      this.socket.onmessage = (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === "REDFISH_EVENT") {
            // Dispatch live hardware event to window listeners for instant UI updates
            window.dispatchEvent(new CustomEvent("hardware-event", { detail: data }));
            window.dispatchEvent(new CustomEvent("redfish-event", { detail: data }));
            
            // Dispatch fleet state mutation if port status or health shifted
            if (data.eventType === "NetworkPortShift" || data.severity === "Critical" || data.severity === "Warning") {
              window.dispatchEvent(new CustomEvent("fleet-updated", { detail: data }));
            }
          }
        } catch (err) {
          console.warn("[WebSocket] Error parsing message:", err);
        }
      };

      this.socket.onerror = (error) => {
        console.warn("[WebSocket] Error connecting to Python backend:", error);
      };

      this.socket.onclose = () => {
        this.isConnected = false;
        console.log("[WebSocket] Connection closed. Retrying connection in 3s...");
        this.scheduleReconnect();
      };
    } catch (e) {
      console.warn("[WebSocket] Connection attempt failed:", e);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (!this.reconnectTimer) {
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        this.connect();
      }, this.reconnectIntervalMs);
    }
  }

  public disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.isConnected = false;
  }
}

export const telemetryWsService = new TelemetryWebSocketService();
