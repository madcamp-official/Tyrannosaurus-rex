import { useEffect, useRef, useState, type ReactNode } from "react";

const MESSAGE_DURATION_MS = 2_600;
// 승리 팡파레(victory-fanfare.mp3, 320kbps CBR 기준 약 15.06초) 길이에 맞췄다 — 티라노
// 사진이 노래가 끝나기 전에 먼저 사라지지 않도록 살짝(0.1초) 여유를 둔다.
const IMAGE_DURATION_MS = 15_100;

export function EndingSequence({
  enabled,
  onDone,
  children,
}: {
  enabled: boolean;
  onDone?: () => void;
  children: ReactNode;
}): JSX.Element {
  const [stage, setStage] = useState<"MESSAGE" | "IMAGE" | "DONE">(() => (enabled ? "MESSAGE" : "DONE"));
  const fanfareRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    fanfareRef.current = new Audio("/audio/victory-fanfare.mp3");
    fanfareRef.current.preload = "auto";
    return () => {
      fanfareRef.current?.pause();
      fanfareRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!enabled) {
      setStage("DONE");
      onDone?.();
      return undefined;
    }

    setStage("MESSAGE");
    const imageTimer = window.setTimeout(() => {
      setStage("IMAGE");
      const fanfare = fanfareRef.current;
      if (fanfare) {
        fanfare.currentTime = 0;
        void fanfare.play().catch(() => undefined);
      }
    }, MESSAGE_DURATION_MS);
    const doneTimer = window.setTimeout(() => {
      setStage("DONE");
      onDone?.();
    }, MESSAGE_DURATION_MS + IMAGE_DURATION_MS);
    return () => {
      window.clearTimeout(imageTimer);
      window.clearTimeout(doneTimer);
      fanfareRef.current?.pause();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  if (stage === "DONE") return <>{children}</>;

  return (
    <section className={`ending-sequence ending-sequence--${stage.toLowerCase()}`} aria-live="polite">
      {stage === "MESSAGE" ? (
        <p className="ending-sequence__message">마침내 티라노사우루스는 부활에 성공했습니다</p>
      ) : (
        <img
          className="ending-sequence__image"
          src="/images/ending.png"
          alt="KAIST 정문에 부활한 티라노사우루스"
        />
      )}
    </section>
  );
}
