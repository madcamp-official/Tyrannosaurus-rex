/** Plan.md §11.5. 개발 모드 브리지 메시지 진단 패널. */

import { useEffect, useState } from "react";
import type { GodotBridge, BridgeLogEntry } from "./godot/GodotBridge";

const ENABLED = import.meta.env.VITE_ENABLE_DEBUG_PANEL === "true";

export function DebugPanel({ bridge }: { bridge: GodotBridge }): JSX.Element | null {
  const [log, setLog] = useState<readonly BridgeLogEntry[]>([]);

  useEffect(() => {
    if (!ENABLED) return;
    const unsubscribe = bridge.onMessage(() => setLog([...bridge.getLog()]));
    return unsubscribe;
  }, [bridge]);

  if (!ENABLED) return null;

  return (
    <details className="debug-panel" open={false}>
      <summary>브리지 메시지 ({log.length})</summary>
      <ul>
        {log
          .slice()
          .reverse()
          .map((entry, index) => (
            <li key={index}>
              [{entry.direction}] {entry.message.type} #{entry.message.sequence}
            </li>
          ))}
      </ul>
    </details>
  );
}
