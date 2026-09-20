import type { CallStatus } from "@/types/call";
import type { SessionInfo, SessionState } from "@/types/session";
import type { ChatEvent, ChatMessage, ChatMeta } from "@/types/chat";
import { apiUrl } from "@/lib/api-base";

type CallListRow = {
  sessionId: string;
  callId: string;
  owner: string | null;
  direction: "outbound" | "inbound";
  peer: string;
  startedAt: number;
  status: CallStatus;
  endedAt?: number;
  endReason?: string;
};

export type BrokerEvent =
  | { type: "session-list"; sessions: SessionInfo[] }
  | { type: "session-qr"; sessionId: string; qr: string }
  | { type: "auth-state"; sessionId: string; paired: boolean; state: SessionState; qr?: string }
  | { type: "call-list"; calls: CallListRow[] }
  | { type: "call-status"; sessionId: string; id: string; owner: string | null; status: CallStatus; peer: string; startedAt: number }
  | { type: "call-ended"; sessionId: string; id: string; owner: string | null; reason: string; endedAt: number }
  | { type: "incoming"; sessionId: string; id: string; peer: string; peerName?: string; video: boolean; offeredAt: number }
  | { type: "incoming-claimed"; sessionId: string; id: string; owner: string }
  | { type: "ura-auto-attend"; sessionId: string; id: string; peer: string; peerName?: string; video: boolean; ts: number }
  | { type: "message"; sessionId: string; chatJid: string; message: ChatMessage }
  | { type: "chat-meta"; meta: ChatMeta }
  | { type: "chat-event"; event: ChatEvent }
  | { type: "flow-skip"; sessionId: string; callId: string; flowId: string; reason: string; detail: string; traceId?: string; ts: number }
  | { type: "billing-update"; userId: string; status: string; planId: string; currentPeriodEnd: number; ts: number }
  | { type: "call-hold"; sessionId: string; id: string; on: boolean; ts: number }
  | { type: "call-transfer-request"; sessionId: string; callId: string; peer: string; fromUserId: string; fromName: string; targetType: "user" | "queue"; targetId: string; note?: string; ts: number };

type Listener = (ev: BrokerEvent) => void;

class EventStream {
  #es: EventSource | null = null;
  #listeners = new Set<Listener>();
  #clientId: string | null = null;
  #reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  #reconnectAttempts = 0;
  #isExplicitlyClosed = false;

  constructor() {
    if (typeof window !== "undefined") {
      window.addEventListener("online", () => {
        if (!this.#isExplicitlyClosed && this.#clientId && (!this.#es || this.#es.readyState === EventSource.CLOSED)) {
          this.reconnect();
        }
      });
    }
  }

  connect(clientId: string): void {
    this.#clientId = clientId;
    this.#isExplicitlyClosed = false;

    // Se já está conectado e saudável, não recria
    if (this.#es && this.#es.readyState === EventSource.OPEN) {
      return;
    }
    // Se está em processo de conexão, aguarda
    if (this.#es && this.#es.readyState === EventSource.CONNECTING) {
      return;
    }

    if (this.#es) {
      try {
        this.#es.close();
      } catch {}
      this.#es = null;
    }

    if (this.#reconnectTimer) {
      clearTimeout(this.#reconnectTimer);
      this.#reconnectTimer = null;
    }

    try {
      const url = apiUrl(`/api/events?clientId=${encodeURIComponent(clientId)}`);
      const es = new EventSource(url, { withCredentials: true });
      this.#es = es;

      es.onopen = () => {
        this.#reconnectAttempts = 0;
      };

      es.onmessage = (ev) => {
        try {
          const parsed: BrokerEvent = JSON.parse(ev.data);
          for (const l of this.#listeners) l(parsed);
        } catch {}
      };

      es.onerror = () => {
        // Se a conexão foi fechada (ex.: perda de rede, suspensão do SO)
        if (es.readyState === EventSource.CLOSED) {
          try {
            es.close();
          } catch {}
          if (this.#es === es) {
            this.#es = null;
          }
          if (!this.#isExplicitlyClosed) {
            this.#scheduleReconnect();
          }
        }
      };
    } catch {
      this.#scheduleReconnect();
    }
  }

  #scheduleReconnect(): void {
    if (this.#isExplicitlyClosed || !this.#clientId) return;
    if (this.#reconnectTimer) return;

    this.#reconnectAttempts++;
    // Backoff exponencial com teto de 10s: 1s, 2s, 4s, 8s, 10s...
    const delay = Math.min(1000 * Math.pow(2, this.#reconnectAttempts - 1), 10000);
    this.#reconnectTimer = setTimeout(() => {
      this.#reconnectTimer = null;
      if (!this.#isExplicitlyClosed && this.#clientId) {
        this.connect(this.#clientId);
      }
    }, delay);
  }

  reconnect(): void {
    if (this.#reconnectTimer) {
      clearTimeout(this.#reconnectTimer);
      this.#reconnectTimer = null;
    }
    this.#reconnectAttempts = 0;
    if (this.#clientId) {
      this.connect(this.#clientId);
    }
  }

  on(l: Listener): () => void {
    this.#listeners.add(l);
    return () => this.#listeners.delete(l);
  }

  close(): void {
    this.#isExplicitlyClosed = true;
    if (this.#reconnectTimer) {
      clearTimeout(this.#reconnectTimer);
      this.#reconnectTimer = null;
    }
    if (this.#es) {
      try {
        this.#es.close();
      } catch {}
      this.#es = null;
    }
  }
}

export const eventStream = new EventStream();
