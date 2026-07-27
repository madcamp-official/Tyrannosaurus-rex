/** 1920x1080 고정 해상도를 뷰포트에 맞춰 레터박스 스케일링한다. */

import { useEffect, useState } from "react";
import { STAGE_H, STAGE_W } from "./battleLayout";

export function useLetterboxScale(): number {
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const recompute = () => {
      setScale(Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H));
    };
    recompute();
    window.addEventListener("resize", recompute);
    return () => window.removeEventListener("resize", recompute);
  }, []);

  return scale;
}
