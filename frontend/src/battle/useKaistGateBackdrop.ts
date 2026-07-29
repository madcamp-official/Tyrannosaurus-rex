import { useEffect, useState } from "react";
import { getKaistGateBackdrops, type KaistGateBackdrop } from "./kaistGateStage";

/** 3D로 구운 KAIST 정문 배경(낮/노을)을 준비되는 대로 반환한다. 준비 전에는 null(호출부가 기존 사진 배경으로 대체). */
export function useKaistGateBackdrop(): KaistGateBackdrop | null {
  const [backdrop, setBackdrop] = useState<KaistGateBackdrop | null>(null);

  useEffect(() => {
    let cancelled = false;
    getKaistGateBackdrops().then((images) => {
      if (!cancelled) setBackdrop(images);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return backdrop;
}
