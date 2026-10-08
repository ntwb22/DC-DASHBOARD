/**
 * Tyrone Pro Server Real-Time WebSocket & SSE Service
 * ==================================================
 * Connects to the local Python backend WebSocket endpoint (ws://127.0.0.1:8000/ws/events).
 * Batches incoming high-frequency SSE/WS packets into a buffer and flushes state updates to the
 * React UI main thread on a 300ms throttled window (requestAnimationFrame) to prevent UI stuttering.
 */

class TelemetryWebSocketService {
  private socket: WebSocket | null = null;
  private isConnected: boolean = false;
  private reconnectIntervalMs: number = 2000;
  private maxReconnectIntervalMs: number = 10000;
  private reconnectTimer: any = null;

  // Throttled SSE Event Buffer (300ms window)
  private eventBuffer: Array<any> = [];
  private throttleTimer: any = null;
  private THROTTLE_INTERVAL_MS: number = 300;

  private getWebSocketUrl(): string {
    try {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const hostname = window.location.hostname || "127.0.0.1";
      return `${protocol}//${hostname}:8000/ws/events`;
    } catch (_) {}
    return "ws://127.0.0.1:8000/ws/events";
  }

  public connect() {
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const wsUrl = this.getWebSocketUrl();

    try {
      this.socket = new WebSocket(wsUrl);

      this.socket.onopen = () => {
        this.isConnected = true;
        this.reconnectIntervalMs = 2000; // Reset backoff interval on successful connection
        console.log(`⚡ [WebSocket] Connected to Tyrone Engine (${wsUrl})`);
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }
      };

      this.socket.onmessage = (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "REDFISH_EVENT" || data.type === "INVENTORY_UPDATED") {
            this.bufferEvent(data);
          }
        } catch (err) {
          console.warn("[WebSocket] Error parsing message:", err);
        }
      };

      this.socket.onerror = (error) => {
        // Quiet warning on initial startup or reconnect
        console.debug("[WebSocket] Socket connection notice:", error);
      };

      this.socket.onclose = () => {
        this.isConnected = false;
        this.scheduleReconnect();
      };
    } catch (e) {
      this.scheduleReconnect();
    }
  }

  private bufferEvent(data: any) {
    this.eventBuffer.push(data);

    if (!this.throttleTimer) {
      this.throttleTimer = setTimeout(() => {
        this.flushEvents();
      }, this.THROTTLE_INTERVAL_MS);
    }
  }

  private flushEvents() {
    this.throttleTimer = null;
    if (this.eventBuffer.length === 0) return;

    const eventsToFlush = [...this.eventBuffer];
    this.eventBuffer = [];

    // Dispatch batched events on animation frame to keep React main thread smooth & lag-free
    requestAnimationFrame(() => {
      eventsToFlush.forEach(data => {
        window.dispatchEvent(new CustomEvent("hardware-event", { detail: data }));
        window.dispatchEvent(new CustomEvent("redfish-event", { detail: data }));
        
        if (data.type === "INVENTORY_UPDATED" || data.eventType === "NetworkPortShift" || data.severity === "Critical" || data.severity === "Warning") {
          window.dispatchEvent(new CustomEvent("fleet-updated", { detail: data }));
          window.dispatchEvent(new CustomEvent("inventory-updated", { detail: data }));
        }
      });
    });
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
    if (this.throttleTimer) {
      clearTimeout(this.throttleTimer);
      this.throttleTimer = null;
    }
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.isConnected = false;
  }
}

export const telemetryWsService = new TelemetryWebSocketService();
