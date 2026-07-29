/** Plan.md §4, §6 권장 초기 수치. 실기기 테스트 중 조정하는 유일한 밸런스 원천. */

// Plan.md §2.2, §5.1: 팀 내부 식별자(TeamId)는 A/B를 그대로 쓰고, 화면 표시 이름만 다르게 한다.
export const TEAM_DISPLAY_NAMES: Record<"A" | "B", string> = {
  A: "T라노 팀",
  B: "F라노 팀",
};

// 팀 phase가 바뀔 때마다(발굴→조립→영점연습→사격) 이만큼은 모바일 화면에 "준비 중" 안내만
// 보여주고 실제 조작 화면은 그 뒤에 드러낸다 — 처음엔 iOS 센서 권한 요청이 탭(제스처) 안에서만
// 되므로 그 시간을 벌어주려고 넣었지만, 매 전환마다 숨 고를 시간을 주는 용도로도 쓴다.
// 봇(autoplay.ts)도 같은 시간만큼 기다렸다가 조작을 시작해 사람과 동일한 조건으로 플레이한다.
export const PHASE_START_GRACE_MS = 5_000;
// 팀 발굴 목표 뼈 개수는 고정값이 아니라 팀 인원수 × BONES_PER_PLAYER로 정해진다(boneCountForTeam 참고).
export const BONES_PER_PLAYER = 4;
export const EXCAVATION_POINTS_PER_BONE = 60;
export const EXCAVATION_SHAKE_COOLDOWN_MS = 200;
export const MOBILE_INPUT_FLUSH_MS = 100;
export const EXCAVATION_MAX_INPUTS_PER_SECOND = 12;
export const EXCAVATION_GOLD_BONE_POINT_DISCOUNT = 20;
// 발굴→다이노런, 다이노런→사격 두 전환 모두 같은 패턴을 쓴다: 먼저 끝난 팀은 상대가 끝날 때까지
// 기다렸다가, 승/패(무승부)가 갈리면 이 시간만큼 결과를 보여준 뒤 두 팀이 동시에 다음 단계로 넘어간다.
export const ROUND_TRANSITION_MS = 3_000;
// 발굴은 다이노런과 달리 "먼저 끝낸 팀이 WIN"인 경쟁 구조라 원칙적으로 무승부가 없다. 다만 모바일
// 입력이 100ms(MOBILE_INPUT_FLUSH_MS) 단위로 배치 전송되다 보니 실력이 비슷하면 두 팀이 거의 동시에
// 끝나는 일이 실제로 있다 — 그 체감을 살려 이 시간 안에 이어서 끝나면 둘 다 DRAW로 정정한다.
export const EXCAVATION_DRAW_WINDOW_MS = 300;
// 사격도 발굴과 같은 패턴 — 부활 에너지를 먼저 채운 팀이 WIN이지만, 배경 틱(10Hz, 100ms)
// 단위로 판정되다 보니 실력이 비슷하면 두 팀이 거의 동시에 채우는 일이 있다 — 이 시간 안에
// 이어서 채우면 둘 다 DRAW로 정정한다.
export const CHARGING_DRAW_WINDOW_MS = 300;
// Plan.md §4는 "완만한 효율 감소"라고만 서술하고 정확한 수치는 주지 않는다. 팀 합산 초당 입력이
// EXCAVATION_MAX_INPUTS_PER_SECOND(1인분 최대치)를 넘는 초과분에 이 배율을 곱해 점수로 인정한다.
export const EXCAVATION_TEAM_OVERFLOW_EFFICIENCY = 0.5;
// 발굴 이벤트 확률도 Plan.md에 수치가 없어 MVP 기본값으로 정했다. 돌 이벤트(효율 감소)는 제거됨.
export const EXCAVATION_EVENT_FOSSIL_CHANCE = 0.1;
export const EXCAVATION_EVENT_GOLD_BONE_CHANCE = 0.05;

// Plan.md §6.2 골격 조립 단계 — 다이노런(장애물 점프) 대신 하늘에서 떨어지는 운석을
// 피하는 미니게임으로 바뀌었다. phase 이름(ASSEMBLY)·타입 이름(DinoRunState 등)은
// 리네임 범위를 줄이기 위해 그대로 두고 내부 메커닉만 교체했다.
export const DINO_RUN_DURATION_MS = 60_000; // 1분
export const METEOR_DODGE_LIVES = 3; // 운석에 3번 맞으면 탈락
export const METEOR_HIT_SCORE_PENALTY = 15; // 운석에 맞을 때마다 깎이는 점수
export const METEOR_FRUIT_SCORE_REWARD = 20; // 과일을 잡으면 얻는 점수
export const METEOR_HEART_SCORE_REWARD = 10; // 하트를 잡으면 얻는 점수(생명 회복과 별개로 조금 더 준다)
export const METEOR_HEART_LIVES_RESTORED = 1; // 하트 하나당 회복되는 목숨 수(METEOR_DODGE_LIVES 초과로는 안 찬다)
// 좌우 위치(0~1) 기준 충돌 판정 반경 — 이 안에 있으면 맞은(또는 잡은) 것으로 인정한다.
export const SKY_OBJECT_COLLISION_RADIUS = 0.09;
// 모바일 위치 전송·네트워크·서버 100ms 판정 틱의 지연을 흡수한다. 화면 착지 직후 이 시간만큼
// 최신 위치를 더 받아 판정해, 이미 피한 공룡의 이전 좌표로 맞았다고 처리되는 일을 막는다.
export const SKY_OBJECT_COLLISION_GRACE_MS = 150;
export const SKY_OBJECT_COUNT = 88; // 1분 동안 떨어지는 운석+아이템 총 개수 (전체 양을 0.8배로 조정)
export const SKY_OBJECT_FRUIT_CHANCE = 0.15; // 이 중 과일일 확률
export const SKY_OBJECT_HEART_CHANCE = 0.05; // 이 중 하트일 확률(나머지는 운석)
// PHASE_START_GRACE_MS(5초) 동안은 모바일 화면이 "준비 중"이라 플레이어가 아직 좌우 위치를
// 한 번도 보고하지 못한 상태다 — 그보다 먼저 운석이 떨어지면 플레이어 위치가 항상 기본값
// (화면 중앙)이라 스폰 고정과 판정이 똑같은 자리를 가리켜 무조건 맞는 사고가 났다. 그래서
// 준비 시간 + 여유를 두고 그 뒤부터 떨어지기 시작한다.
export const SKY_OBJECT_MIN_OFFSET_MS = 6_000;
export const SKY_OBJECT_MAX_OFFSET_MS = 54_000;
// 낙하 시간(800ms)보다 충분히 짧게 두어 후반에는 운석 여러 개가 동시에 화면에 나타난다.
export const SKY_OBJECT_MIN_GAP_MS = 300;
// 1보다 작을수록 초반엔 간격이 넓다가(뜸하게) 시간이 지날수록 간격이 좁아진다(점점 빽빽하게).
// 0.55는 후반 6초 구간에 전체의 20%가 넘게 몰려(초반 대비 8배) 후반부가 너무 정신없다는
// 피드백이 있어 0.85로 완만하게 조정했었다. 이후 총 개수를 88개(0.8배)로 줄이면서 0.85로는
// "동시에 최소 3개" 보장(§규정)이 깨져 0.75로 다시 낮췄다 — 여전히 초반 대비 후반 밀도
// 차이는 원래(8배)보다 훨씬 완만한 2.5배 수준을 유지한다.
export const SKY_OBJECT_DENSITY_CURVE_EXPONENT = 0.75;
// 오브젝트가 화면 위에서 판정 지점까지 떨어지는 데 걸리는 시간(연출용) — 짧을수록 빠르게
// 떨어진다. 너무 빠르다는 피드백에 따라 속도를 0.85배로 늦췄다 — 시간은 속도의 역수이므로
// 800 / 0.85 ≈ 941로 늘렸다.
export const SKY_OBJECT_FALL_MS = 941;
// 좌우 위치 보고 빈도 상한(자이로 기울임 → 서버 전송).
export const DINO_POSITION_UPDATE_MAX_HZ = 20;
// 팀 성능(0~1) 정규화 기준 — 팀원 1인이 이 점수를 내면 만점으로 친다. 과일·하트를 거의 다
// 잡았을 때 나오는 점수 근처로 잡아, 만점 난이도가 그대로 유지되도록 맞췄다.
export const METEOR_DODGE_REFERENCE_SCORE_PER_PLAYER = 190;
// 조립 평가 등급 경계 (팀 성능 0~1 기준)
export const DINO_GRADE_PERFECT = 0.85;
export const DINO_GRADE_GOOD = 0.6;
export const DINO_GRADE_CLUMSY = 0.3;
// 충전 시작 안정도 = BASE + RANGE × 성능
export const CHARGING_START_STABILITY_BASE = 40;
export const CHARGING_START_STABILITY_RANGE = 60;

/** ASSEMBLY 종료 직후 실제 CHARGING 시작 전 자이로/터치패드 영점을 맞춰볼 수 있는 연습 시간. */
export const CHARGING_PRACTICE_DURATION_MS = 30_000;
export const CHARGING_DURATION_MS = 90_000;
export const CHARGING_TREX_TRANSFORM_HZ = 10;
export const SHOT_COOLDOWN_MS = 350;
// 여러 플레이어의 조준 이벤트가 데스크톱 사격 장면을 과도하게 재렌더링하지 않도록 제한한다.
export const AIM_UPDATE_MAX_HZ = 15;
export const AIM_STALE_MS = 500;
// 명중당 부활 에너지를 더 낮췄다 — 목표(ENERGY_TARGET)까지 천천히, 훨씬 더 많이 쏴야
// 채워지게 난이도를 올렸다.
export const ENERGY_HIT_BONE = 1;
export const ENERGY_HIT_CORE = 3;
export const STABILITY_HIT_CORE = 2;
// 명중당 에너지는 이미 낮춰뒀는데도, 인원이 여럿이 동시에 쏘면 팀 합산 속도가 빨라 목표에
// 금방 도달해 사격 단계가 너무 빨리 끝난다는 피드백에 따라 목표치 자체를 크게 올렸다.
export const ENERGY_TARGET = 240;
export const STABILITY_TARGET = 100;
// Plan.md §6.3은 "단순 히트박스"만 요구하고 정확한 반경/이동 공식은 없다. 정규화 좌표 기준
// MVP 기본값이며, 실제 3D 히트박스가 생기면 Godot 쪽과 맞춰 조정한다.
export const CORE_HIT_RADIUS = 0.05;
export const BONE_HIT_RADIUS = 0.18;
export const TREX_MOVE_AMPLITUDE = 0.36; // 중심(0.5)에서 좌우로 흔들리는 폭 — 더 넓게 돌아다니도록 확대
export const TREX_MOVE_PERIOD_MS = 10_000; // 웨이포인트 사이 이동 시간 — 짧을수록 더 빠르게 움직인다

// Plan.md §2.3, §3 3경기 누적 점수제. 구체적 계수가 문서에 없어 MVP 기본값으로 정한다.
export const GAME_SCORE_MAX = 100;
// 경기 3 점수 = 명중률 비중 + 활성 코어 명중 비중(코어 히트 수를 기준치로 정규화).
export const SHOOTING_SCORE_ACCURACY_WEIGHT = 60;
export const SHOOTING_SCORE_CORE_WEIGHT = 40;
export const SHOOTING_SCORE_CORE_HITS_FOR_FULL_MARKS = 8;
// 개인 MVP 가중치. coreHits는 hits의 부분집합이지만, 핵심 부위 명중을 더 우대하기 위해 별도로 더한다.
export const MVP_WEIGHT_EXCAVATION_INPUT = 1;
export const MVP_WEIGHT_DINO_CLEARED = 3;
export const MVP_WEIGHT_HIT = 2;
export const MVP_WEIGHT_CORE_HIT = 3;
export const MVP_TOP_COUNT = 3;

export const ROUND_DURATION_MS = 300_000;
export const DECORATION_VOTE_DURATION_MS = 20_000;

export const MIN_PLAYERS = 2;
// Plan.md §2.2: 방 생성 시 호스트가 팀별 최대 인원을 지정한다. 시스템 상한 10명, 폼 기본값 5명.
export const MAX_PLAYERS_PER_TEAM_CAP = 10;
export const DEFAULT_MAX_PLAYERS_PER_TEAM = 5;
export const ROOM_NAME_MAX_LENGTH = 20;
export const TEAM_NAME_MAX_LENGTH = 12;
export const NICKNAME_MIN_LENGTH = 1;
export const NICKNAME_MAX_LENGTH = 8;
export const ROOM_CODE_LENGTH = 4;
export const ROOM_CODE_MAX_GENERATION_ATTEMPTS = 20;

export const REQUEST_ID_CACHE_MAX_ENTRIES = 100;
export const REQUEST_ID_CACHE_TTL_MS = 5 * 60_000;

export const MUSEUM_MAX_ENTRIES = 20;

export const BRIDGE_PROTOCOL_VERSION = 1 as const;
export const BRIDGE_FULL_SNAPSHOT_INTERVAL_MS = 5_000;
export const GODOT_READY_TIMEOUT_MS = 15_000;

export const API_VERSION = 1 as const;
