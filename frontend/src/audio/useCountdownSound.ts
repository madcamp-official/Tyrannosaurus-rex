import { useEffect, useRef } from "react";

let audioContext: AudioContext | null = null;

function playTone(remainingSec: number): void {
  const AudioContextClass = window.AudioContext;
  if (!AudioContextClass) return;
  audioContext ??= new AudioContextClass();
  const context = audioContext;

  void context.resume().then(() => {
    const startedAt = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const isStart = remainingSec === 0;

    oscillator.type = isStart ? "sine" : "square";
    oscillator.frequency.setValueAtTime(isStart ? 880 : remainingSec === 1 ? 760 : 560, startedAt);
    if (isStart) oscillator.frequency.exponentialRampToValueAtTime(1320, startedAt + 0.18);

    gain.gain.setValueAtTime(0.0001, startedAt);
    gain.gain.exponentialRampToValueAtTime(isStart ? 0.16 : 0.1, startedAt + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, startedAt + (isStart ? 0.28 : 0.12));

    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(startedAt);
    oscillator.stop(startedAt + (isStart ? 0.3 : 0.14));
  }).catch(() => {
    // 브라우저가 아직 사용자 제스처로 오디오를 허용하지 않은 경우 화면 카운트다운은 그대로 진행한다.
  });
}

export function useCountdownSound(remainingSec: number | null): void {
  const previousSecRef = useRef<number | null>(null);

  useEffect(() => {
    if (previousSecRef.current === remainingSec) return;
    const previousSec = previousSecRef.current;
    previousSecRef.current = remainingSec;
    if (remainingSec === null || (previousSec === null && remainingSec === 0)) return;
    playTone(remainingSec);
  }, [remainingSec]);
}
