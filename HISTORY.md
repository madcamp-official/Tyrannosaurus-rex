# HISTORY

실제 구현 진행 상황을 날짜별로 기록한다. 기획·규칙 자체는 [Plan.md](./Plan.md)를 따르고, 이 문서는 "무엇을 언제, 어떻게 검증했는지"만 남긴다.

## 2026-07-25 — Day 1 스캐폴딩

Plan.md §23 Day1 범위(모노레포, 실시간 연결, 로비, React-Godot 최소 브리지)를 구현했다.

### 변경 내역

- **workspace**: 루트 npm workspaces(`shared`/`backend`/`frontend`), 공통 `.gitignore`, `.env.example` 추가.
- **shared**: 도메인 타입(`domain.ts`), 밸런스 상수(`constants.ts`), Zod 기반 Socket.IO 이벤트 계약(`events.ts`), React↔Godot 브리지 프로토콜(`render-protocol.ts`). 런타임 검증과 타입은 Zod 스키마에서 추론해 이중 정의를 피했다(Plan.md §20).
- **server**: Socket.IO 권위 서버. 핸드셰이크 role/클라이언트 버전 검증, `RoomManager`(방 생성·입장·A/B 팀 자동 균형 배정·준비 상태·게임 시작), requestId 멱등성 캐시, 이벤트별 token bucket rate limit, `/api/health`·`/api/ready`·`/api/version`, 실기기 없이 로비 흐름을 검증하는 `simulate` 스크립트.
- **client**: 데스크탑 로비(QR·방 코드·팀 리스트·시작 버튼), 모바일 입장/준비 화면, `GodotBridge`(GODOT_READY 핸드셰이크, 15초 타임아웃 시 2D 안전 화면, sequence 기반 메시지 무시), 브리지 진단 패널, `localStorage` 기반 박물관 스텁.
- **desktop-godot**: 기존 굴착 프로토타입(`DigSite.tscn` 등)은 그대로 유지(Plan.md §12.2 — 이미 구현된 것은 다시 만들지 않는다). Web export preset(`export_presets.cfg`, 싱글 스레드), 커스텀 HTML shell(`web/shell.html`, postMessage 릴레이 포함), 브리지 오토로드(`JsBridge.gd`, `RenderRouter.gd`)를 추가하고 렌더러를 `gl_compatibility`로 고정했다.
- **docs**: Plan.md의 핵심 뼈 개수 불일치(§2.4·§4는 9개, §6.1·§14.2는 12개로 서술)를 9개로 통일했다. 좌/우로 나뉘어 있던 `ARM_LEFT/ARM_RIGHT`, `LEG_LEFT/LEG_RIGHT`, `RIB_LEFT/RIB_RIGHT`를 `ARMS`/`LEGS`/`RIBS`로 병합.

### 검증

```bash
npm run typecheck                       # shared/backend/frontend 전부 통과
npm test                                # shared 4, backend 5, frontend 4 테스트 통과
npm run build                           # 전체 프로덕션 빌드 성공
npm run simulate -w backend -- --players 6  # 호스트 1 + 플레이어 6 로비 흐름, 팀 A/B 3:3 배정 확인
curl /api/health /api/ready /api/version    # 로컬 서버 기동 후 200 응답 확인
```

### 미검증 / 알려진 한계

- **Godot 실제 Web export**: 이 환경에는 Godot 에디터와 export 템플릿이 없어 `export_presets.cfg`, `web/shell.html`을 문서 기준으로만 작성했다. 처음 실제로 `npm run build:godot`을 돌릴 때 `$GODOT_*` 셸 템플릿 변수나 preset 옵션 키가 실제 Godot 버전과 다르면 에디터가 자동 보정하거나 오류를 낼 수 있다.
- Day2 이후(발굴 판정, 퍼즐, 사격, 부활, 티꾸, 박물관 동기화 등) 게임 로직은 아직 구현하지 않았다. `RoomManager`는 로비까지만 다루고, `TeamState.puzzle.pieces`는 9개 뼈 슬롯만 초기화해 둔 상태다.

## 2026-07-25 — Day 2~6: 핵심 루프 전체 구현 (P0 완료)

Plan.md §26 P0 우선순위(QR 입장, 서버 상태 머신, 탭 발굴, 골격 퍼즐, 터치패드 조준·발사,
정상 부활과 결과, 재경기)를 전부 구현하고 실제 소켓으로 전체 루프를 검증했다.

### 뼈 개수 정정: 9개 → 13개

작업 도중 `model/`에 실제 라이선스가 붙은 Stan 골격 에셋(`trex_skeleton/scene.bin`,
`LICENSE.txt`)과 이를 13개 대형 해부학 조각(SKULL, JAW, NECK, SPINE, RIBCAGE, PELVIS,
ARM_LEFT/RIGHT, LEG_LEFT/RIGHT, TAIL_BASE/MIDDLE/TIP)으로 묶는 Godot 스크립트
(`TrexPuzzleModel.gd`)와 프리뷰 씬이 추가됐다. "9개가 맞다"던 이전 결정과 충돌해
사용자에게 확인 후 13개로 최종 통일했다 — `BoneId`, `PUZZLE_TARGET_TRANSFORMS`,
Plan.md §6.1/§14.2, 관련 서버 테스트를 모두 갱신했다.

### Day2 — 뼈 발굴

- 서버: `excavate:input` 판정. 플레이어별 1초 12회 상한(토큰 버킷), 팀 합산 초과분 50%
  효율 적용, 시드 기반 결정론적 뼈 발견 순서·발굴 이벤트(돌/화석/황금뼈)
  (`backend/src/game/excavation.ts`, `backend/src/game/seededRandom.ts`).
- 클라이언트: 모바일 흔들기(iOS 권한, 200ms 쿨다운)+탭 폴백, 데스크탑 발굴 게이지·발견
  뼈·기여도 HUD. 고빈도 이벤트를 `room:state`와 분리 구독해 로컬 합성하는
  `frontend/src/roomStateReducer.ts` 패턴을 여기서 확립해 이후 단계에서 재사용했다.

### Day3 — 골격 퍼즐

- 서버: `puzzle:claim/move/place`. 팀당 동시 조작권 2개, claimToken 소유권 검증, 5초
  무입력 자동 만료(요청 시점 지연 정리 + 1초 주기 배경 스윕), 이동 속도 상한 클램프,
  위치 12%·각도 15도 허용 오차, 오답 2초 잠금(`backend/src/game/puzzle.ts`).
- 목표 좌표(`PUZZLE_TARGET_TRANSFORMS`)는 실루엣 아트가 없어 MVP 기본 레이아웃으로 정의.
- 클라이언트: 모바일 뼈 선택→드래그 패드→회전→배치, 데스크탑 2D 실루엣 프리뷰.

### Day4 — 조준 파이프라인

- 서버: `aim:update`. CHARGING/PURIFICATION 중에만 인정, 소켓당 30Hz token bucket,
  플레이어별 최신 좌표·수신 시각 보관(Day5의 500ms 신선도 검사에 재사용).
- 클라이언트: 자이로(영점 캘리브레이션 + 저역 통과 필터)와 터치패드 공통 조준.

### Day5 — 사격 판정과 부활

- 서버: 단순 히트박스(정규화 좌표 반경) 기반 코어/일반 뼈/관절 바깥 판정. 코어는 5초마다
  HEART→SKULL→SPINE로 위치 이동. 티라노 이동은 방 시드 기반 사인 곡선(양 팀 동일 패턴
  시드). shotId 중복 방지, 350ms 쿨다운. 에너지 100 도달 시 정상 부활, CHARGING 90초
  초과 시 와이라노로 정화 단계 진입, 정화 10초 내 안정도 100 도달 시 정상, 실패 시 영구
  와이라노로 확정. 10Hz 배경 틱으로 `trex:transform`/`energy:coreChanged` 방송
  (`backend/src/game/charging.ts`, `backend/src/game/energy.ts`).
- 라운드 승패 확정: 정상 부활 즉시 승리, 양 팀 모두 와이라노면 DRAW, 300초 타임아웃 시 팀
  진행도 점수 비교(§3 "총합이 높은 팀"의 MVP 구현 — 정확한 공식이 Plan.md에 없어 직접
  정의했다).
- 클라이언트: 발사 버튼(쿨다운/명중 피드백), 데스크탑 크로스헤어·티라노 위치·피격
  플래시·에너지-안정도 게이지.

### Day6 — 결과, 티꾸, 박물관, 재경기

- 서버: `game:rematch`(팀·닉네임·색상 유지, 게임 데이터만 초기화), `decoration:vote`/
  `name:vote`(허용 목록 검증, 20초 투표 창, 배경 틱으로 마감 시 다수결 확정·동률은
  무작위). 브로드캐스트 스키마에 `teamId`가 빠져 있던 버그(두 팀이 같은 방 채널을
  공유하는데 구분자가 없었음)도 이번에 고쳤다.
- 클라이언트: 결과 화면(승자, 팀별 소요 시간, 실시간 투표 현황, 재경기 버튼), 모바일
  티꾸/이름 투표 UI. 팀별 투표가 확정되면 `localStorage` 박물관에 저장(승패 무관, 두
  팀 다 저장).

### Godot 브리지 보강

`BONE_DISCOVERED`, `TREX_TRANSFORM`, `ENERGY_HIT`, `REVIVAL_RESULT`를 해당 이벤트
발생 시 Godot iframe으로도 전송하도록 배관만 연결했다. 실제 Godot 장면이 이 메시지를
소비하는 로직(`RenderRouter.route()` 내부)은 아직 없다 — Plan.md §26이 Godot 3D 연출을
P1으로 명시하고 있어, 서버·React 루프를 먼저 완성하는 쪽을 택했다.

### 검증

```bash
npm run typecheck   # 전체 통과
npm test             # shared 4 + backend 40 + frontend 4 = 48개 전부 통과
npm run build        # 전체 프로덕션 빌드 성공
```

라이브 소켓 스모크 테스트(커밋에는 포함하지 않은 임시 스크립트로 실행 후 삭제)로
방 생성 → 2명 입장(각 팀 1명) → 게임 시작 → 발굴로 13개 뼈 전부 획득 → 퍼즐 13조각
전부 정확히 배치 → 조준+발사로 에너지 100 도달 → 정상 부활 → `game:result`
(승자 A, 사유 NORMAL_REVIVAL) 수신까지 전체 루프를 실제 Socket.IO로 확인했다.

### 미검증 / 알려진 한계

- **Godot 3D 장면**: 위 "Godot 브리지 보강"대로 전송은 되지만 아직 아무 장면도 그 데이터를
  그리지 않는다. Day2 굴착 프로토타입과 Day3 퍼즐 프리뷰(`TrexPuzzlePreview.tscn`)는
  브리지와 연결되지 않은 독립 데모 상태다.
- **실기기 테스트**: 자이로/흔들기/터치 이벤트는 브라우저 API 스펙대로 구현했지만 실제
  iOS/Android 기기에서 확인하지 못했다(Day7 범위, 이 환경에 기기가 없음).
- **동시 접속 6명 부하**: 2명 시나리오로 라이브 검증했고 6명 로비 합류는 Day1의
  `simulate` 스크립트로 확인했지만, 6명이 동시에 발굴·퍼즐·사격을 진행하는 부하 시나리오는
  아직 실측하지 않았다.
- **티꾸 아이템 3D 반영**: 모자/안경/목장식/배경 투표 결과가 `DECORATION_STATE` 브리지
  메시지로 아직 전송되지 않는다(§11.3에 정의는 있으나 이번 범위에서 빠짐).
- **`model/trex_major_parts.glb`(100MB)**: Web 다운로드 예산(30MB)의 3배가 넘어 실제
  export 전에 폴리곤 감소가 필요하다. 아직 git에 커밋하지 않았다(대용량 바이너리라 Git
  LFS 여부는 판단이 필요하다).

## 2026-07-25 — Godot 3D 장면이 브리지 데이터를 실제로 그리도록 연결

Day2~6에서는 브리지 "전송"만 배관해두고 받는 쪽 로직이 없었다. 이번에 `scenes/Main.tscn`
(`Main.gd`)을 새 메인 씬으로 만들어 `project.godot`의 `run/main_scene`을 바꾸고, 좌우
팀 무대(`TeamStage.gd`)가 실제로 `RenderRouter`의 메시지를 소비해 3D를 갱신하게 했다.

- `TeamStage`는 발굴·조립·충전을 팀당 `TrexPuzzleModel` 인스턴스 하나로 이어간다(97MB
  골격을 단계마다 다시 로드하지 않음): `BONE_DISCOVERED`로 조각을 하나씩 드러내고,
  `PUZZLE_STATE`에서 `fixed=true`가 오면 모델이 아는 실제 해부학적 위치로 스냅하고,
  `TREX_TRANSFORM`으로 조립된 모델 전체를 이동시킨다.
- `CrosshairOverlay.gd`(2D `CanvasLayer`)가 화면을 좌/우로 나눠 `CROSSHAIRS`를 그린다.
- React 쪽에 빠져 있던 `PUZZLE_STATE`·`CROSSHAIRS` 브리지 전송도 이번에 추가했다.

### 검증

```bash
npm run typecheck   # 전체 통과
npm test             # 48개 전부 통과
npm run build        # 성공
```

GDScript는 실행 검증 불가(Godot 에디터 없음) — 문법·API는 Godot 4.3 문서와 기존
`RenderRouter.gd`/`TrexPuzzleModel.gd` 패턴을 기준으로 맞췄다. 에디터에서 `Main.tscn`을
바로 실행하면 React 연결이 없어(`JsBridge`는 Web export에서만 동작) 두 팀 무대가 초기
상태로만 보이는 것이 정상이다 — 실제 확인은 `npm run build:godot` 후 `npm run dev`로
전체 스택을 띄워야 한다.

## 2026-07-25 — 정화(PURIFICATION) 메커닉 제거, 인원 상한 6→10 반영

Plan.md가 "와이라노는 되돌릴 수 없는 최종 결과"로 재정의되면서 정화 사격으로
역전하는 구간(`PURIFICATION` 팀 페이즈, 10초 정화 타이머)이 전부 삭제됐다.
또한 §0.1/§2.2의 인원 상한이 "전체 2~6명, 팀당 3명"에서 "전체 2~10명, 팀당
5명"으로 바뀌어 있었다. 두 변경 모두 Plan.md에만 반영되어 있고 구현이 못
따라간 상태라 이번에 코드 전체를 맞췄다.

### 정화 제거

- `shared`: `TeamPhase`에서 `"PURIFICATION"` 제거, `TeamState.charging`에서
  `purificationEndsAt` 필드 제거, `PURIFICATION_DURATION_MS` 상수 삭제,
  `revival:purificationStarted` 이벤트 타입 삭제.
- `backend/game/energy.ts`: `expireChargingIfNeeded`가 CHARGING 90초 타임아웃 시
  중간 단계 없이 바로 `REVIVED`/`YRANNO`로 확정하도록 변경(기존에는
  `PURIFICATION`을 거쳐 10초 뒤 재확정). `expirePurificationIfNeeded` 함수
  자체를 삭제하고, `applyEnergyFire`의 안정도 기반 역전 분기도 제거.
- `backend/rooms/RoomManager.ts`: `ChargingTickUpdate.transition`을
  `"TO_REVIVED_YRANNO" | null`로 단순화, `tickCharging`/`applyAim`의
  `PURIFICATION` 분기 제거, `teamProgressScore`의 `PURIFICATION` case 제거.
- `backend/rooms/energyHandlers.ts`: `emitTransitionEvents`가 `TO_PURIFICATION`
  분기 없이 `TO_REVIVED_YRANNO` 하나만 처리하도록 정리(`team:phaseChanged`의
  `from`도 `PURIFICATION`이 아닌 `CHARGING`으로 수정).
- `frontend`: `ChargingView`의 "정화 사격 중" 경고 배너 제거, `PlayArea`/
  `MobileJoin`의 `team.phase === "PURIFICATION"` 분기 제거.
- `desktop-godot/TeamStage.gd`: `apply_full_snapshot`의 `PURIFICATION` 체크 제거.
- `backend/test/energy.test.ts`, `backend/test/aim.test.ts`: `PURIFICATION`
  상태를 직접 세팅하던 테스트를 CHARGING 타임아웃이 바로 REVIVED/YRANNO로
  가는 흐름에 맞춰 다시 작성.

### 인원 상한 6→10, 팀당 3→5

- `shared/constants.ts`: `MAX_PLAYERS` 6→10, `MAX_PLAYERS_PER_TEAM` 3→5.
- `shared/events.ts`: `roomCreateRequestSchema.settings.maxPlayers` 리터럴
  유니언을 2~6에서 2~10으로 확장.
- `backend/rooms/colors.ts`: 플레이어 크로스헤어 색상 팔레트를 6색→10색으로
  확장. 6색인 채로 두면 5인 팀에서 짝수 인덱스(0·2·4·6·8)가 6으로 나눈
  나머지가 겹쳐(0↔6, 2↔8) 같은 팀 안에서 두 플레이어가 같은 색을 받는
  버그가 생겨서 함께 고쳤다.
- `backend/simulate.ts`, `frontend/DesktopLobby.tsx`: `room:create`에 보내는
  `maxPlayers` 예시값 6→10, `simulate --players` 상한도 6→10.
- Plan.md 안에서 남아있던 "6명/3명" 하드캡 서술(§2.3 대기열, ROOM_FULL 설명,
  `RoomCreateRequest.maxPlayers` 타입, Day1/Day4 완료 기준, 최종 체크리스트,
  §30 구현 가정)도 전부 10/5로 맞췄다. 단, "권장 인원 4~6명"과 실기기 테스트
  대수(§Day7의 "실기기 6대" 등)는 상한과 무관한 별개 값이라 그대로 뒀다.

### 검증

```bash
npm run typecheck   # shared/backend/frontend 전부 통과
npm test             # shared 4, backend 38, frontend 4 — 전부 통과
npm run build        # 전체 프로덕션 빌드 성공
```

## 2026-07-25 — Godot Web 실연동 첫 검증: export 성공, 브리지 버그 3건 수정

로컬에서 Godot 4.7.1 CLI(`Downloads/Godot_v4.7.1-stable_win64.exe/`)를 찾아
export template(1.28GB)을 설치하고, 이 저장소 최초로 **실제 Web export를
돌려 브라우저에서 연동을 검증**했다. 그 과정에서 "문서 기준으로만 작성하고
실행해본 적 없던" 경로의 버그가 연달아 드러났다.

### 고친 버그

1. **`web/shell.html` 템플릿 문법 오류** — `$GODOT_URL$`처럼 닫는 `$`를
   붙였는데 Godot 셸 템플릿은 닫는 기호 없이 `$GODOT_URL`로 치환된다.
   export 결과물에 `<script src="index.js$">`(404)와
   `GODOT_CONFIG = {...}$;`(문법 오류)가 나가 엔진이 아예 부팅되지 않았다.
2. **GODOT_READY 유실** — `JsBridge.gd`는 JSON *문자열*로 postMessage하는데
   React `GodotBridge`는 객체만 통과시켜 핸드셰이크가 항상 버려졌고,
   엔진이 정상 기동해도 15초 뒤 "3D 장면을 불러오지 못했습니다" 폴백이 떴다.
   문자열이면 JSON.parse 후 검증하게 수정.
3. **브리지 인스턴스 분리** — `useGodotBridge()`가 호출마다 새 인스턴스를
   만들어 로비의 send가 iframe에 attach되지 않은 인스턴스로 나갔다. 모듈
   싱글턴으로 공유. 덤으로 "다시 시도" 시 브리지가 옛 iframe에 붙어 있던
   문제도 attach 이펙트를 reloadKey에 걸어 수정.

### 홈 화면 재구성

Godot 무대를 `position:fixed` 전체 화면 배경으로 깔고 방 코드·QR·팀 리스트를
반투명 카드 오버레이로 올렸다. 소켓/방 생성 실패 시 "서버에 연결하는 중…" /
실패 사유를 표시해 빈 화면이 되지 않게 했다.

### 검증

- `--headless --export-release Web` 성공: `index.html/js/wasm(39.5MB)/pck` 생성
- 씬 로드 스모크: `--headless --quit-after 120`으로 `Main.tscn` 120프레임
  무오류 실행 (전역 클래스 등록, skeleton.gltf import 포함)
- `npm run simulate -- --players 2`: 방 생성→입장→시작 정상
- typecheck/테스트(46개) 통과. 브라우저 육안 확인은 사용자 진행 중.
- Godot이 처음 열리며 생성한 `.uid` 사이드카 7개도 커밋(4.4+ 권장).

## 2026-07-26 — 골격 조립을 30초 다이노런으로 교체

퍼즐 드래그 조립(claim/move/place)을 전면 제거하고, 발굴이 끝나면 팀원 전원이
동시에 개인 휴대폰에서 30초 다이노런을 달리는 방식으로 교체했다. 팀 클리어율로
조립 형태를 평가한다(Plan.md §2.3, §6.2 재작성).

- **서버 권위 판정**: 장애물 12개 스케줄을 라운드 시드로 생성해 양 팀 동일.
  `dino:jump`는 서버 수신 시각 기준 ±450ms 창 판정, 플레이어당 장애물 1회.
  30초 종료는 100ms 배경 틱이 처리하고 등급(완벽/양호/엉성/누더기)과
  충전 시작 안정도(40+60×클리어율)를 확정한 뒤 CHARGING으로 전환한다.
- **shared**: `TeamState.puzzle` → `dinoRun`, `PlayerStats.puzzleCorrect/Wrong` →
  `dinoCleared`, 퍼즐 이벤트 3종 → `dino:jump`/`dino:started`/`dino:progress`/
  `dino:finished`, PIECE_* 오류 코드 제거.
- **클라이언트**: 모바일 `DinoRunControls`(탭 점프 러너, 장애물 위치는 서버
  오프셋 역산 연출), 데스크탑 `DinoRunTeamPanel`(카운트다운·팀원별 클리어).
  `dino:finished` 때 Godot에 13조각 전부 fixed로 `PUZZLE_STATE`를 보내 완성
  스냅 연출 — TeamStage.gd는 수정 없이 호환된다.
- **검증**: 다이노런 단위 테스트 6종(스케줄 결정론, 창 판정, 중복 거부,
  30초 평가·안정도 스케일, 조기 종료 없음) 포함 전체 44개 통과. autoplay
  봇도 다이노런 점프로 교체해 headless 완주(발굴→12/12 클리어→PERFECT→
  정상 부활 승리) 확인.
- 미검증: 실기기 모바일에서의 러너 체감(연출은 클라 시계 기준이라 서버와
  수십 ms 어긋날 수 있음 — 판정은 서버 기준이라 공정성 문제는 없음).
## 2026-07-28 — 운석 종료 즉시 영점 전환 및 15초 연습 보장

- 양 팀 운석 결과 확정 직후 다음 100ms 배경 틱에서 영점 조정 페이즈로 전환해 이전 3D 화면이 다시 보이지 않게 했다.
- 전원이 일찍 영점을 맞춰도 준비 5초 이후 연습 15초가 끝나기 전에는 사격 페이즈로 넘어가지 않는다.
- Socket.IO 이벤트 형태와 환경 변수는 변경하지 않았다. 공유 영점 연습 시간 상수만 15초로 변경했다.
- 관련 다이노런 테스트와 `npm run typecheck`, 전체 72개 테스트, `npm run build` 통과.
