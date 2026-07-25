/** Plan.md §11. React ↔ Godot iframe postMessage 브리지. */

import {
  BRIDGE_PROTOCOL_VERSION,
  GODOT_READY_TIMEOUT_MS,
  isBridgeEnvelope,
  type FullSnapshotPayload,
  type GodotToReactMessage,
  type ReactToGodotMessage,
} from "@trex/shared";

export type BridgeStatus = "LOADING" | "READY" | "TIMED_OUT" | "ERROR";

export type BridgeLogEntry = {
  direction: "OUT" | "IN";
  message: ReactToGodotMessage | GodotToReactMessage;
  at: number;
};

const MAX_LOG_ENTRIES = 100;

export class GodotBridge {
  private iframe: HTMLIFrameElement | null = null;
  private sequence = 0;
  private status: BridgeStatus = "LOADING";
  private readonly log: BridgeLogEntry[] = [];
  private readyTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingSnapshot: FullSnapshotPayload | null = null;
  private readonly statusListeners = new Set<(status: BridgeStatus) => void>();
  private readonly messageListeners = new Set<(msg: GodotToReactMessage) => void>();
  private readonly onWindowMessage = (event: MessageEvent) => {
    if (event.origin !== window.location.origin) return;
    if (event.source !== this.iframe?.contentWindow) return;
    if (!isBridgeEnvelope(event.data) || event.data.source !== "trex-godot") return;
    const message = event.data as GodotToReactMessage;
    this.recordLog("IN", message);

    if (message.type === "GODOT_READY") {
      this.setStatus("READY");
      if (this.readyTimer) {
        clearTimeout(this.readyTimer);
        this.readyTimer = null;
      }
      if (this.pendingSnapshot) {
        this.send("FULL_SNAPSHOT", this.pendingSnapshot);
        this.pendingSnapshot = null;
      }
    } else if (message.type === "GODOT_ERROR") {
      this.setStatus("ERROR");
    }
    for (const listener of this.messageListeners) listener(message);
  };

  attach(iframe: HTMLIFrameElement): void {
    this.detach();
    this.iframe = iframe;
    this.status = "LOADING";
    window.addEventListener("message", this.onWindowMessage);
    this.readyTimer = setTimeout(() => {
      if (this.status === "LOADING") this.setStatus("TIMED_OUT");
    }, GODOT_READY_TIMEOUT_MS);
  }

  detach(): void {
    window.removeEventListener("message", this.onWindowMessage);
    if (this.readyTimer) clearTimeout(this.readyTimer);
    this.readyTimer = null;
    this.iframe = null;
  }

  onStatusChange(listener: (status: BridgeStatus) => void): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  onMessage(listener: (msg: GodotToReactMessage) => void): () => void {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  getLog(): readonly BridgeLogEntry[] {
    return this.log;
  }

  /** GODOT_READY 이전 스냅샷은 최신 하나만 보관하고, 준비 완료 시 한 번 전송한다. */
  sendFullSnapshot(payload: FullSnapshotPayload): void {
    if (this.status !== "READY") {
      this.pendingSnapshot = payload;
      return;
    }
    this.send("FULL_SNAPSHOT", payload);
  }

  send<TType extends ReactToGodotMessage["type"]>(
    type: TType,
    payload: Extract<ReactToGodotMessage, { type: TType }>["payload"],
    roomCode?: string,
  ): void {
    const message = {
      source: "trex-react",
      version: BRIDGE_PROTOCOL_VERSION,
      type,
      roomCode,
      sequence: this.nextSequence(),
      payload,
    } as ReactToGodotMessage;
    this.recordLog("OUT", message);
    this.iframe?.contentWindow?.postMessage(message, window.location.origin);
  }

  private nextSequence(): number {
    this.sequence += 1;
    return this.sequence;
  }

  private setStatus(status: BridgeStatus): void {
    this.status = status;
    for (const listener of this.statusListeners) listener(status);
  }

  private recordLog(direction: "OUT" | "IN", message: ReactToGodotMessage | GodotToReactMessage): void {
    this.log.push({ direction, message, at: Date.now() });
    while (this.log.length > MAX_LOG_ENTRIES) this.log.shift();
  }
}
