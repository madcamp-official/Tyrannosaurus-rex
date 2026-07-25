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
