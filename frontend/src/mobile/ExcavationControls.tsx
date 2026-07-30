/** Plan.md §5.2, §6.1. 흔들기 센서 전용 발굴 컨트롤. */

import { useEffect, useRef, useState } from "react";
import {
  BONE_IDS,
  EXCAVATION_DUST_ATTACK_CHARGE,
  EXCAVATION_SHAKE_COOLDOWN_MS,
  MOBILE_INPUT_FLUSH_MS,
  type BoneId,
  type SensorPermission,
  type ServerEvent,
  type TeamId,
} from "@trex/shared";
import type { AppSocket } from "../socket";
import { newRequestId } from "../util/requestId";

// Godot의 TrexPuzzleModel.gd PIECE_LABELS와 맞춘 한글 이름 — 발굴 화면에서 어떤 뼈를
// 찾았는지 보여줄 때 쓴다.
const BONE_LABELS: Record<BoneId, string> = {
  SKULL: "머리뼈",
  JAW: "아래턱",
  NECK: "목뼈",
  SPINE: "등뼈",
  RIBCAGE: "갈비뼈",
  PELVIS: "골반",
  ARM_LEFT: "왼팔",
  ARM_RIGHT: "오른팔",
  LEG_LEFT: "왼다리",
  LEG_RIGHT: "오른다리",
  TAIL_BASE: "꼬리 시작",
  TAIL_MIDDLE: "꼬리 중간",
  TAIL_TIP: "꼬리 끝",
};
const BONE_FOUND_FLASH_MS = 1_400;

// 흔드는 방향 — 세로로 든 폰 기준 y=위아래(파는 동작에 가장 자연스러움), x=좌우, z=앞뒤.
const SHAKE_AXIS: "x" | "y" | "z" = "y";
// 방향을 구분할 땐 중력을 뺀 event.acceleration 기준(그래야 폰을 어떻게 들어도 기준이 같다).
const SHAKE_AXIS_THRESHOLD = 10;
// event.acceleration을 못 주는 기기용 폴백 — 중력 포함 벡터 크기(accelerationIncludingGravity) 기준이라 방향 구분은 없다.
const SHAKE_MAGNITUDE_THRESHOLD = 14;
const MAX_COUNT_PER_PACKET = 5;
// 파기 효과음은 내 폰에서, 내가 실제로 흔들 때만 난다(팀 전체 진행이 아니라 내 동작
// 기준) — 이벤트마다 새로 트는 게 아니라 계속 반복 재생하다가, 마지막 동작 후 일정 시간
// 동안 새 동작이 없으면(=내가 멈췄으면) 페이드아웃하고 정지한다.
const DIG_LOOP_VOLUME = 0.5;
const DIG_LOOP_FADE_MS = 250;
// 흔들기는 EXCAVATION_SHAKE_COOLDOWN_MS(200ms)마다 최대 한 번만 인정되므로, 연속으로
// 흔드는 중에도 그 텀만으로 소리가 끊기지 않도록 넉넉히 잡는다.
const DIG_LOOP_IDLE_TIMEOUT_MS = 450;

type MotionPermissionApi = { requestPermission?: () => Promise<"granted" | "denied"> };

/** 데스크탑 발굴 BGM·운석 BGM과 같은 페이드아웃(볼륨 서서히 0으로 → 일시정지 → 볼륨 복원). */
function fadeOutAndPause(audio: HTMLAudioElement, fadeRef: { current: number | null }, fadeMs: number, restoreVolume: number): void {
  if (audio.paused) return;
  const startVolume = audio.volume;
  const startedAt = performance.now();
  fadeRef.current = window.setInterval(() => {
    const ratio = Math.min(1, (performance.now() - startedAt) / fadeMs);
    audio.volume = startVolume * (1 - ratio);
    if (ratio >= 1) {
      if (fadeRef.current !== null) window.clearInterval(fadeRef.current);
      fadeRef.current = null;
      audio.pause();
      audio.currentTime = 0;
      audio.volume = restoreVolume;
    }
  }, 50);
}

export function ExcavationControls({
  socket,
  teamId,
  result,
  initialCharge,
  initialCooldownUntil,
  initialDisruptedUntil,
}: {
  socket: AppSocket;
  teamId: TeamId;
  result: "WIN" | "LOSE" | "DRAW" | null;
  initialCharge: number;
  initialCooldownUntil: number | null;
  initialDisruptedUntil: number | null;
}): JSX.Element {
  const [motionPermission, setMotionPermission] = useState<SensorPermission>("UNKNOWN");
  const [shakeFlash, setShakeFlash] = useState(false);
  const [collectedBones, setCollectedBones] = useState<BoneId[]>([]);
  const [recentBone, setRecentBone] = useState<BoneId | null>(null);
  const [dustCharge, setDustCharge] = useState(initialCharge);
  const [dustCooldownUntil, setDustCooldownUntil] = useState(initialCooldownUntil ?? 0);
  const [disruptedUntil, setDisruptedUntil] = useState(initialDisruptedUntil ?? 0);
  const [nowMs, setNowMs] = useState(Date.now());
  const [attackPending, setAttackPending] = useState(false);
  const motionCountRef = useRef(0);
  const seqRef = useRef(0);
  const lastShakeAtRef = useRef(0);
  const digLoopAudioRef = useRef<HTMLAudioElement | null>(null);
  const digLoopFadeRef = useRef<number | null>(null);
  const digLoopStopTimerRef = useRef<number | null>(null);
  const disruptedUntilRef = useRef(disruptedUntil);
  disruptedUntilRef.current = disruptedUntil;

  useEffect(() => {
    setDustCharge(initialCharge);
    setDustCooldownUntil(initialCooldownUntil ?? 0);
    setDisruptedUntil(initialDisruptedUntil ?? 0);
  }, [initialCharge, initialCooldownUntil, initialDisruptedUntil]);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 200);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const audio = new Audio("/audio/excavation-dig-loop.mp3");
    audio.loop = true;
    audio.preload = "auto";
    audio.volume = DIG_LOOP_VOLUME;
    digLoopAudioRef.current = audio;
    return () => {
      if (digLoopFadeRef.current !== null) window.clearInterval(digLoopFadeRef.current);
      if (digLoopStopTimerRef.current !== null) window.clearTimeout(digLoopStopTimerRef.current);
      audio.pause();
      digLoopAudioRef.current = null;
    };
  }, []);

  useEffect(() => {
    // 모바일 브라우저(특히 iOS Safari)는 사용자 제스처 밖에서 처음 트는 audio.play()를
    // 조용히 거부한다 — 화면 첫 터치에서 짧게 틀었다 멈춰 미리 잠금 해제해둔다.
    const unlockOnce = () => {
      const audio = digLoopAudioRef.current;
      if (!audio) return;
      void audio
        .play()
        .then(() => {
          audio.pause();
          audio.currentTime = 0;
        })
        .catch(() => undefined);
    };
    window.addEventListener("pointerdown", unlockOnce, { once: true });
    return () => window.removeEventListener("pointerdown", unlockOnce);
  }, []);

  /** 흔들 때마다 호출한다 — 안 재생 중이면 시작하고, "멈춤" 타이머를 계속 미룬다. */
  const pingDigLoop = () => {
    const audio = digLoopAudioRef.current;
    if (!audio) return;
    if (digLoopStopTimerRef.current !== null) {
      window.clearTimeout(digLoopStopTimerRef.current);
      digLoopStopTimerRef.current = null;
    }
    if (audio.paused) {
      if (digLoopFadeRef.current !== null) {
        window.clearInterval(digLoopFadeRef.current);
        digLoopFadeRef.current = null;
      }
      audio.volume = DIG_LOOP_VOLUME;
      void audio.play().catch(() => undefined);
    }
    digLoopStopTimerRef.current = window.setTimeout(() => {
      digLoopStopTimerRef.current = null;
      const current = digLoopAudioRef.current;
      if (current) fadeOutAndPause(current, digLoopFadeRef, DIG_LOOP_FADE_MS, DIG_LOOP_VOLUME);
    }, DIG_LOOP_IDLE_TIMEOUT_MS);
  };

  useEffect(() => {
    if (typeof window.DeviceMotionEvent === "undefined") {
      setMotionPermission("UNSUPPORTED");
      return;
    }
    // 버튼 없이 바로 요청한다 — 입장 폼 제출 시 이미 한 번 요청해둬서(§sensorPermissions),
    // 대부분 여기서는 팝업 없이 캐시된 결과가 즉시 돌아온다.
    const api = window.DeviceMotionEvent as unknown as MotionPermissionApi;
    if (typeof api.requestPermission !== "function") {
      setMotionPermission("GRANTED");
      return;
    }
    api
      .requestPermission()
      .then((result) => setMotionPermission(result === "granted" ? "GRANTED" : "DENIED"))
      .catch(() => setMotionPermission("DENIED"));
  }, []);

  useEffect(() => {
    if (motionPermission !== "GRANTED") return undefined;
    const handleMotion = (event: DeviceMotionEvent) => {
      const now = Date.now();
      if (now < disruptedUntilRef.current) return;
      if (now - lastShakeAtRef.current < EXCAVATION_SHAKE_COOLDOWN_MS) return;

      let triggered: boolean;
      const pureAcc = event.acceleration;
      if (pureAcc && pureAcc[SHAKE_AXIS] !== null) {
        // 중력을 뺀 값이라 폰을 어느 각도로 들고 있든 SHAKE_AXIS 방향 흔들림만 잡아낸다.
        triggered = Math.abs(pureAcc[SHAKE_AXIS]!) >= SHAKE_AXIS_THRESHOLD;
      } else {
        const acc = event.accelerationIncludingGravity;
        if (!acc) return;
        const magnitude = Math.sqrt((acc.x ?? 0) ** 2 + (acc.y ?? 0) ** 2 + (acc.z ?? 0) ** 2);
        triggered = magnitude >= SHAKE_MAGNITUDE_THRESHOLD;
      }
      if (!triggered) return;

      lastShakeAtRef.current = now;
      motionCountRef.current += 1;
      setShakeFlash(true);
      pingDigLoop();
      window.setTimeout(() => setShakeFlash(false), 150);
    };
    window.addEventListener("devicemotion", handleMotion);
    return () => window.removeEventListener("devicemotion", handleMotion);
  }, [motionPermission]);

  useEffect(() => {
    const onCharge = (evt: ServerEvent<{ teamId: TeamId; charge: number; cooldownUntil: number | null }>) => {
      if (evt.data.teamId !== teamId) return;
      setDustCharge(evt.data.charge);
      setDustCooldownUntil(evt.data.cooldownUntil ?? 0);
    };
    const onAttacked = (evt: ServerEvent<{
      attackerTeamId: TeamId;
      targetTeamId: TeamId;
      attackerPlayerId: string;
      attackerNickname: string;
      disruptedUntil: number;
    }>) => {
      if (evt.data.targetTeamId !== teamId) return;
      motionCountRef.current = 0;
      setDisruptedUntil(evt.data.disruptedUntil);
      try {
        navigator.vibrate?.([120, 50, 180]);
      } catch {
        // 진동을 지원하지 않는 기기에서는 시각 안내만 사용한다.
      }
    };
    socket.on("excavation:dustCharge", onCharge);
    socket.on("excavation:dustAttacked", onAttacked);
    return () => {
      socket.off("excavation:dustCharge", onCharge);
      socket.off("excavation:dustAttacked", onAttacked);
    };
  }, [socket, teamId]);

  useEffect(() => {
    // 우리 팀이 뼈를 찾았을 때만 진동 — excavation:boneFound는 방 전체(양 팀)로 브로드캐스트되니
    // teamId로 걸러야 상대 팀이 찾았을 때까지 울리지 않는다.
    const onBoneFound = (evt: ServerEvent<{ teamId: TeamId; boneId: BoneId; index: number }>) => {
      if (evt.data.teamId !== teamId) return;
      // 배열(패턴) 대신 단일 지속시간이 기기별 구현체 차이에 덜 민감해서 더 안정적으로 동작한다.
      // iOS Safari는 Vibration API 자체가 없어(navigator.vibrate가 undefined) 조용히 무시된다.
      try {
        navigator.vibrate?.(200);
      } catch {
        // 정책상 막힌 기기 등 — 무시.
      }
      setCollectedBones((prev) => (prev.includes(evt.data.boneId) ? prev : [...prev, evt.data.boneId]));
      setRecentBone(evt.data.boneId);
      window.setTimeout(() => setRecentBone((current) => (current === evt.data.boneId ? null : current)), BONE_FOUND_FLASH_MS);
    };
    socket.on("excavation:boneFound", onBoneFound);
    return () => {
      socket.off("excavation:boneFound", onBoneFound);
    };
  }, [socket, teamId]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      const motion = Math.min(MAX_COUNT_PER_PACKET, motionCountRef.current);
      motionCountRef.current = 0;
      if (Date.now() < disruptedUntilRef.current) return;
      if (motion === 0) return;
      seqRef.current += 1;
      socket.emit("excavate:input", {
        seq: seqRef.current,
        count: motion,
        sourceCounts: { motion, tap: 0 },
        clientTime: Date.now(),
      });
    }, MOBILE_INPUT_FLUSH_MS);
    return () => window.clearInterval(interval);
  }, [socket]);

  const useDustAttack = () => {
    if (attackPending || dustCharge < EXCAVATION_DUST_ATTACK_CHARGE || dustCooldownUntil > Date.now()) return;
    setAttackPending(true);
    socket.emit("excavation:dustAttack", { requestId: newRequestId() }, (ack) => {
      setAttackPending(false);
      if (!ack.ok) return;
      setDustCharge(0);
    });
  };

  const isDisrupted = disruptedUntil > nowMs;
  const attackReady =
    dustCharge >= EXCAVATION_DUST_ATTACK_CHARGE &&
    dustCooldownUntil <= nowMs &&
    !isDisrupted;

  if (result) {
    const label = result === "WIN" ? "🏆 발굴 완료!" : result === "DRAW" ? "무승부" : "발굴 완료";
    return (
      <div className="excavation-controls">
        <p className="excavation-controls__result">{label}</p>
        {result === "WIN" && <p className="hint">상대 팀을 기다리는 중…</p>}
      </div>
    );
  }

  return (
    <div
      className={`excavation-controls${shakeFlash ? " excavation-controls--shake-flash" : ""}${recentBone ? " excavation-controls--bone-flash" : ""}${isDisrupted ? " excavation-controls--disrupted" : ""}`}
    >
      {isDisrupted && (
        <div className="excavation-controls__disrupted">
          <strong>흙먼지가 덮쳤습니다!</strong>
          <span>잠시 후 다시 발굴할 수 있어요.</span>
        </div>
      )}
      <p className="mobile-game__title">흔들어서 뼈를 발굴하세요!</p>
      {motionPermission === "DENIED" && <p className="mobile-game__hint">센서 권한이 꺼져 있어요. 설정에서 동작 센서 권한을 켜주세요.</p>}
      {motionPermission === "UNSUPPORTED" && <p className="mobile-game__hint">이 기기는 흔들기를 지원하지 않아요.</p>}
      {motionPermission === "GRANTED" && <p className="mobile-game__hint">흔드는 대로 자동으로 인식돼요.</p>}
      {recentBone && <p className="excavation-controls__found-toast">🦴 {BONE_LABELS[recentBone]} 발견!</p>}
      <ul className="excavation-controls__bone-list">
        {BONE_IDS.map((boneId) => {
          const found = collectedBones.includes(boneId);
          return (
            <li
              key={boneId}
              className={`excavation-controls__bone${found ? " excavation-controls__bone--found" : ""}`}
            >
              {found ? BONE_LABELS[boneId] : "??"}
            </li>
          );
        })}
      </ul>
      <div className="excavation-controls__dust-attack">
        <div className="excavation-controls__dust-meter">
          <span style={{ width: `${Math.min(100, (dustCharge / EXCAVATION_DUST_ATTACK_CHARGE) * 100)}%` }} />
        </div>
        <button type="button" disabled={!attackReady || attackPending} onClick={useDustAttack}>
          {attackPending ? "공격 중..." : attackReady ? "상대 팀에 흙먼지 날리기!" : `흙먼지 충전 ${Math.floor(dustCharge)}/${EXCAVATION_DUST_ATTACK_CHARGE}`}
        </button>
      </div>
    </div>
  );
}
