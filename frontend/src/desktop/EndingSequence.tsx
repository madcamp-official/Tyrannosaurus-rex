import { useEffect, useState, type ReactNode } from "react";

const MESSAGE_DURATION_MS = 2_600;
const IMAGE_DURATION_MS = 4_000;

export function EndingSequence({
  enabled,
  children,
}: {
  enabled: boolean;
  children: ReactNode;
}): JSX.Element {
  const [stage, setStage] = useState<"MESSAGE" | "IMAGE" | "DONE">(() => enabled ? "MESSAGE" : "DONE");

  useEffect(() => {
    if (!enabled) {
      setStage("DONE");
      return undefined;
    }

    setStage("MESSAGE");
    const imageTimer = window.setTimeout(() => setStage("IMAGE"), MESSAGE_DURATION_MS);
    const doneTimer = window.setTimeout(() => setStage("DONE"), MESSAGE_DURATION_MS + IMAGE_DURATION_MS);
    return () => {
      window.clearTimeout(imageTimer);
      window.clearTimeout(doneTimer);
    };
  }, [enabled]);

  if (stage === "DONE") return <>{children}</>;

  return (
    <section className={`ending-sequence ending-sequence--${stage.toLowerCase()}`} aria-live="polite">
      {stage === "MESSAGE" ? (
        <p className="ending-sequence__message">
          마침내 티라노사우루스는
          <br />
          부활에 성공했습니다
        </p>
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
