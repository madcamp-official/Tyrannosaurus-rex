# HISTORY

실제 구현 진행 상황을 날짜별로 기록한다. 기획·규칙 자체는 [Plan.md](./Plan.md)를 따르고, 이 문서는 "무엇을 언제, 어떻게 검증했는지"만 남긴다.

## 2026-07-25 — Day 1 스캐폴딩

Plan.md §23 Day1 범위(모노레포, 실시간 연결, 로비, React-Godot 최소 브리지)를 구현했다.

### 변경 내역

- **workspace**: 루트 npm workspaces(`shared`/`server`/`client`), 공통 `.gitignore`, `.env.example` 추가.
- **shared**: 도메인 타입(`domain.ts`), 밸런스 상수(`constants.ts`), Zod 기반 Socket.IO 이벤트 계약(`events.ts`), React↔Godot 브리지 프로토콜(`render-protocol.ts`). 런타임 검증과 타입은 Zod 스키마에서 추론해 이중 정의를 피했다(Plan.md §20).
- **server**: Socket.IO 권위 서버. 핸드셰이크 role/클라이언트 버전 검증, `RoomManager`(방 생성·입장·A/B 팀 자동 균형 배정·준비 상태·게임 시작), requestId 멱등성 캐시, 이벤트별 token bucket rate limit, `/api/health`·`/api/ready`·`/api/version`, 실기기 없이 로비 흐름을 검증하는 `simulate` 스크립트.
- **client**: 데스크탑 로비(QR·방 코드·팀 리스트·시작 버튼), 모바일 입장/준비 화면, `GodotBridge`(GODOT_READY 핸드셰이크, 15초 타임아웃 시 2D 안전 화면, sequence 기반 메시지 무시), 브리지 진단 패널, `localStorage` 기반 박물관 스텁.
- **desktop-godot**: 기존 굴착 프로토타입(`DigSite.tscn` 등)은 그대로 유지(Plan.md §12.2 — 이미 구현된 것은 다시 만들지 않는다). Web export preset(`export_presets.cfg`, 싱글 스레드), 커스텀 HTML shell(`web/shell.html`, postMessage 릴레이 포함), 브리지 오토로드(`JsBridge.gd`, `RenderRouter.gd`)를 추가하고 렌더러를 `gl_compatibility`로 고정했다.
- **docs**: Plan.md의 핵심 뼈 개수 불일치(§2.4·§4는 9개, §6.1·§14.2는 12개로 서술)를 9개로 통일했다. 좌/우로 나뉘어 있던 `ARM_LEFT/ARM_RIGHT`, `LEG_LEFT/LEG_RIGHT`, `RIB_LEFT/RIB_RIGHT`를 `ARMS`/`LEGS`/`RIBS`로 병합.

### 검증

```bash
npm run typecheck                       # shared/server/client 전부 통과
npm test                                # shared 4, server 5, client 4 테스트 통과
npm run build                           # 전체 프로덕션 빌드 성공
npm run simulate -w server -- --players 6   # 호스트 1 + 플레이어 6 로비 흐름, 팀 A/B 3:3 배정 확인
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
  (`server/src/game/excavation.ts`, `server/src/game/seededRandom.ts`).
- 클라이언트: 모바일 흔들기(iOS 권한, 200ms 쿨다운)+탭 폴백, 데스크탑 발굴 게이지·발견
  뼈·기여도 HUD. 고빈도 이벤트를 `room:state`와 분리 구독해 로컬 합성하는
  `client/src/roomStateReducer.ts` 패턴을 여기서 확립해 이후 단계에서 재사용했다.

### Day3 — 골격 퍼즐

- 서버: `puzzle:claim/move/place`. 팀당 동시 조작권 2개, claimToken 소유권 검증, 5초
  무입력 자동 만료(요청 시점 지연 정리 + 1초 주기 배경 스윕), 이동 속도 상한 클램프,
  위치 12%·각도 15도 허용 오차, 오답 2초 잠금(`server/src/game/puzzle.ts`).
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
  (`server/src/game/charging.ts`, `server/src/game/energy.ts`).
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
npm test             # shared 4 + server 40 + client 4 = 48개 전부 통과
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
