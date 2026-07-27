/** Plan.md §11.2, §11.5. Godot Web iframe을 임베드하고 GODOT_READY 실패 시 2D 안전 화면을 보여준다. */

import { useEffect, useRef, useState } from "react";
import { GodotBridge, type BridgeStatus } from "./GodotBridge";

const GODOT_ENTRY = import.meta.env.VITE_GODOT_ENTRY || "/godot/index.html";
// nginx가 .wasm/.pck를 1년 immutable로 캐싱하므로, 빌드마다 값이 바뀌는 __BUILD_TIME__을 써서
// 배포할 때마다 새 URL로 취급되게 한다 (고정 문자열이면 재배포해도 옛 빌드를 계속 캐시에서 씀).
const GODOT_ASSET_VERSION = String(__BUILD_TIME__);

// 앱에 Godot iframe은 하나뿐이다. 훅 호출마다 새 인스턴스를 만들면 iframe에 attach된
// 인스턴스(GodotStage)와 로비가 send하는 인스턴스가 갈라져 메시지가 허공으로 가므로 공유한다.
const sharedBridge = new GodotBridge();

export function useGodotBridge(): { bridge: GodotBridge } {
  return { bridge: sharedBridge };
}

export function GodotStage({ onReload }: { onReload?: () => void }): JSX.Element {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [status, setStatus] = useState<BridgeStatus>("LOADING");
  const [reloadKey, setReloadKey] = useState(0);

  // reloadKey가 바뀌면 key= 때문에 iframe DOM이 새로 만들어지므로, 브리지도 새 iframe에 다시 attach해야 한다.
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    sharedBridge.attach(iframe);
    setStatus("LOADING");
    const unsubscribe = sharedBridge.onStatusChange(setStatus);
    return () => {
      unsubscribe();
      sharedBridge.detach();
    };
  }, [reloadKey]);

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
