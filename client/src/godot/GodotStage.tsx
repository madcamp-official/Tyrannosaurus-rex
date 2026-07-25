/** Plan.md §11.2, §11.5. Godot Web iframe을 임베드하고 GODOT_READY 실패 시 2D 안전 화면을 보여준다. */

import { useEffect, useRef, useState, type RefObject } from "react";
import { GodotBridge, type BridgeStatus } from "./GodotBridge";

const GODOT_ENTRY = import.meta.env.VITE_GODOT_ENTRY || "/godot/index.html";
const GODOT_ASSET_VERSION = import.meta.env.VITE_GODOT_ASSET_VERSION || "dev";

export function useGodotBridge(): { bridge: GodotBridge; status: BridgeStatus; iframeRef: RefObject<HTMLIFrameElement> } {
  const bridgeRef = useRef<GodotBridge>();
  if (!bridgeRef.current) bridgeRef.current = new GodotBridge();
  const bridge = bridgeRef.current;

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [status, setStatus] = useState<BridgeStatus>("LOADING");

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    bridge.attach(iframe);
    const unsubscribe = bridge.onStatusChange(setStatus);
    return () => {
      unsubscribe();
      bridge.detach();
    };
  }, [bridge]);

  return { bridge, status, iframeRef };
}

export function GodotStage({ onReload }: { onReload?: () => void }): JSX.Element {
  const { status, iframeRef } = useGodotBridge();
  const [reloadKey, setReloadKey] = useState(0);

  const retry = () => {
    setReloadKey((key) => key + 1);
    onReload?.();
  };

  return (
    <div className="godot-stage">
      <iframe
        key={reloadKey}
        ref={iframeRef}
        title="Godot 3D 무대"
        src={`${GODOT_ENTRY}?v=${GODOT_ASSET_VERSION}`}
        className="godot-stage__frame"
        allow="autoplay"
      />
      {status !== "READY" && (
        <div className="godot-stage__fallback" role="status">
          {status === "LOADING" && <p>3D 장면을 불러오는 중입니다…</p>}
          {status === "TIMED_OUT" && (
            <>
              <p>3D 장면을 불러오지 못했습니다. 게임은 계속 진행할 수 있습니다.</p>
              <button type="button" onClick={retry}>
                다시 시도
              </button>
            </>
          )}
          {status === "ERROR" && (
            <>
              <p>3D 렌더러 오류가 발생했습니다.</p>
              <button type="button" onClick={retry}>
                다시 시도
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
