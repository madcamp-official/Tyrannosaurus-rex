# 티라노 게임 구현 원칙

## 1. 문서 목적

이 문서는 티라노사우루스 협동·대전 게임을 개발할 때 적용하는 공통 구현 원칙과 Frontend, Backend, Shared, Godot 영역의 책임 및 협업 규칙을 정의한다.

현재 프로젝트는 하나의 저장소에서 다음 영역을 함께 관리하는 monorepo 구조를 유지한다.

```text
shared/          # Frontend와 Backend가 공유하는 타입, 상수, Zod 스키마, 이벤트 계약
backend/         # Node.js + Socket.IO 권위 서버와 게임 로직
frontend/        # React + Vite 기반 데스크톱/모바일 UI와 Socket.IO 클라이언트
desktop-godot/   # Godot 기반 데스크톱 3D 렌더링
```

기본 소유권은 다음과 같다.

```text
Frontend는 사용자가 보고 조작하는 화면과 클라이언트 경험을 책임진다.
Backend는 방, 플레이어, 게임 상태, 판정, 검증과 운영 설정을 책임진다.
Godot은 서버 상태를 표현하는 3D 렌더링을 책임진다.
영역 간 접점은 shared의 타입·스키마·Socket.IO 이벤트 계약으로 관리한다.
```

---

## 2. 모든 구현에 적용하는 원칙

### 2.1 실제 구현 원칙

1. mock 파일을 만들지 않는다.
2. dummy 데이터를 만들지 않는다.
3. fake API provider 또는 fake 성공 응답을 만들지 않는다.
4. seed 데이터는 MVP 구현 범위에서 제외한다.
5. 외부 연동 및 실행 환경에 필요한 값은 코드에 하드코딩하지 않고 환경 변수로만 주입한다.
6. `.env.example`과 각 workspace의 `.env.example`에는 실제 값, 가짜 값, 예시 토큰, 예시 도메인을 넣지 않고 필요한 key 목록만 제공한다.
7. 필수 환경 변수가 없거나 형식이 잘못되면 서버 시작 시 변수명을 포함한 명확한 오류를 발생시키고 시작을 중단한다.
8. 실제 provider 정보가 없는 기능은 성공한 것처럼 처리하지 않는다. `PROVIDER_NOT_CONFIGURED`와 같이 명확한 설정 누락 오류 또는 UI의 미설정 상태로 표현한다.
9. 개발 편의를 이유로 네트워크 실패, 권한 실패, 센서 미지원, Godot 로드 실패를 성공 상태로 변환하지 않는다.
10. 아직 구현되지 않은 기능은 비활성화하거나 `NOT_IMPLEMENTED` 상태로 드러내며, 임시 성공 분기를 추가하지 않는다.

위 원칙은 Socket.IO 연결, 공개 접속 도메인, 데이터베이스, 인증/JWT/Cookie, AI API, 이메일·SMS·알림톡, 배포 도메인, reverse proxy 및 향후 추가되는 모든 외부 provider에 동일하게 적용한다.

게임에서 사용하는 `seed`는 초기 데이터를 채우는 seed data와 구분한다. 서버가 한 경기의 결정적 난수 재현을 위해 생성·전달하는 game seed는 허용하지만, 고정된 결과를 성공처럼 보여 주기 위한 하드코딩 seed는 사용하지 않는다.

### 2.2 서버 권위와 상태 일관성

- Backend를 게임 상태의 유일한 권위(authoritative source)로 둔다.
- 승패, 점수, 에너지, 안정성, 발굴 결과, 장애물 통과, 투표 결과, phase 전환과 제한 시간은 서버가 판정한다.
- Frontend와 Godot은 서버 판정을 예측하거나 연출할 수 있지만, 예측값을 확정 상태로 저장하거나 서버 결과보다 우선하지 않는다.
- 클라이언트가 보낸 플레이어 ID, 팀, 점수, 시간, 좌표 및 결과를 신뢰하지 않고 서버의 socket/session 상태와 validation schema를 기준으로 검증한다.
- 상태 변경 요청에는 필요한 경우 `requestId`, `seq`, idempotency 검증과 rate limit을 적용한다.
- 재접속 시 클라이언트 로컬 상태로 경기를 복원하지 않고 `room:requestState` 또는 최신 `room:state`로 서버 상태를 다시 동기화한다.
- 서버 시간과 revision을 기준으로 오래되거나 중복된 이벤트가 최신 상태를 덮어쓰지 않게 한다.

### 2.3 실패와 오류 처리

- 오류를 삼키거나 콘솔 출력만 한 뒤 정상 흐름을 계속하지 않는다.
- Socket.IO ack는 성공과 실패를 명확히 구분하고, 실패에는 안정적인 error code와 사용자에게 노출 가능한 message를 제공한다.
- Frontend는 loading, disconnected, permission denied, unsupported, empty, retry 가능 오류와 복구 불가 오류를 구분해 표시한다.
- 센서 권한 거부나 미지원은 임의 입력값으로 대체하지 않는다. 제품에서 공식 지원하는 실제 대체 조작 방식이 있을 때만 해당 모드로 전환한다.
- Godot iframe 또는 asset version이 준비되지 않았으면 React UI가 성공적으로 로드된 것처럼 경기 진행을 시작하지 않는다.
- 로그에는 방 코드, event/request ID 등 진단에 필요한 문맥을 남기되 secret, token, cookie, 개인정보는 기록하지 않는다.

### 2.4 보안과 환경 변수

- `.env`, `.env.local`, `.env.*.local`, 운영 secret은 commit하지 않는다.
- 브라우저에 포함되는 `VITE_*` 값은 공개 정보로 간주한다. API key, JWT secret, provider secret을 `VITE_*`에 넣지 않는다.
- Backend는 모든 필수 환경 변수를 한 곳에서 schema validation하고, 기능 사용 시점이 아니라 가능하면 시작 시점에 설정 누락을 발견한다.
- 환경 변수 key를 추가·변경·삭제할 때는 관련 `.env.example`, 환경 변수 validation, 실행 문서를 같은 변경에서 함께 수정한다.
- CORS origin, 공개 참여 URL, Socket.IO path, API/Godot asset version, 포트와 timeout을 코드에 환경별 값으로 하드코딩하지 않는다.
- 운영과 개발의 차이는 환경 변수 및 명시적인 설정으로 표현하며, `NODE_ENV`만 보고 외부 연동을 가짜 구현으로 바꾸지 않는다.

---

## 3. Frontend 구현 원칙

### 3.1 담당 영역

Frontend 담당자는 주로 다음 경로를 관리한다.

```text
frontend/src/**
frontend/public/**              # 원본이 아닌 정적 배포 자산
frontend/index.html
frontend/vite.config.ts
frontend/.env.example
```

주요 책임은 다음과 같다.

- 데스크톱 로비, 플레이 화면, 결과 화면과 모바일 참여·조작 화면 구현
- Socket.IO 연결, 재연결, ack 오류 및 서버 상태 구독
- 사용자 입력 validation과 loading/error/disconnected/permission 상태 표시
- 화면 크기, 모바일 브라우저, safe area 및 접근성 대응
- Godot iframe과 React 사이의 bridge 연결
- 서버 상태를 화면용 view state로 변환하되 게임 판정은 수행하지 않음

### 3.2 구현 규칙

- `shared`에 정의된 이벤트 이름, payload 타입과 Zod schema를 사용한다. 같은 타입을 Frontend에 다시 선언하지 않는다.
- 임의의 room, player, score, team, progress 데이터를 넣어 화면을 완성하지 않는다.
- Socket.IO 연결 없이 버튼을 눌렀을 때 성공 화면으로 이동시키지 않는다.
- ack 성공을 받기 전에 방 생성, 입장, 준비, 발사, 투표가 확정된 것으로 표시하지 않는다.
- 낙관적 UI가 필요한 경우 임시 상태임을 분리하고, 서버 거절 또는 timeout 시 반드시 되돌린다.
- server push event의 `revision`, `eventId`, `serverTime`을 고려해 중복 및 역순 수신을 안전하게 처리한다.
- 컴포넌트가 커지면 화면, 입력 제어, socket orchestration, 상태 변환을 분리한다.
- browser API와 sensor API는 지원 여부 및 권한을 실제로 확인한다.
- `frontend/public/godot/`의 Web export 산출물은 직접 수정하지 않는다. 변경은 `desktop-godot/` 원본에서 수행한 뒤 export한다.
- 디버그 패널은 실제 상태를 관찰하기 위한 용도로만 사용하며 상태·응답을 조작해 성공을 만드는 도구로 사용하지 않는다. 운영 빌드 노출 여부는 명시적 환경 설정으로 제어한다.

### 3.3 Frontend가 단독으로 수정하지 않는 영역

```text
backend/**
shared/**의 공개 계약
desktop-godot/**의 원본 scene/script
서버 secret 및 운영 환경 설정
```

화면에 새 데이터나 이벤트가 필요하면 Backend와 먼저 계약을 합의하고 `shared`를 함께 변경한다.

---

## 4. Backend 구현 원칙

### 4.1 담당 영역

Backend 담당자는 주로 다음 경로를 관리한다.

```text
backend/src/**
backend/test/**
backend/package.json
backend/tsconfig.json
```

주요 책임은 다음과 같다.

- 방 생성·입장·퇴장·재접속 및 수명 주기 관리
- 팀 배정, 준비 상태, phase 전환, 제한 시간과 재경기 처리
- 발굴, 달리기, 조준, 충전, 발사, 투표와 승패의 권위 판정
- 입력 schema validation, rate limit, idempotency와 중복/역순 입력 방지
- Socket.IO room broadcast와 ack/error 계약 준수
- health/readiness/version endpoint와 구조화된 운영 로그
- 환경 변수 validation, 외부 provider 및 영속 저장소 연동

### 4.2 구현 규칙

- 모든 Client → Server payload는 처리 전에 `shared`의 schema로 검증한다.
- socket에 연결된 실제 플레이어와 방 정보를 기준으로 권한을 확인한다.
- 클라이언트가 보낸 `clientTime`은 관측·보정 정보로만 사용하고 서버 판정 시간을 대체하지 않는다.
- 상태 변경과 broadcast는 일관된 순서로 실행해 ack와 push event가 서로 다른 결과를 말하지 않게 한다.
- 게임 규칙과 수치는 `shared`의 명시적 상수 또는 Backend domain module에 둔다. handler 곳곳에 magic number를 복제하지 않는다.
- 실제 시간과 난수가 필요한 로직은 테스트 가능하게 경계를 분리하되, 운영 코드에 fake clock/provider를 기본 구현으로 연결하지 않는다.
- 프로세스 메모리 기반 room 상태의 한계와 재시작 시 소실 여부를 명시한다. 영속성이 요구되면 실제 저장소를 연동하기 전까지 저장 성공으로 응답하지 않는다.
- provider, 데이터베이스, 인증 기능을 추가하면 연결 실패와 설정 누락이 readiness 또는 명시적 기능 오류에 반영되어야 한다.
- `.env` 값에 fallback secret, 공유 비밀번호, 예시 API key를 두지 않는다.
- 오류 응답의 code는 안정적으로 유지하고 내부 stack trace나 secret을 클라이언트에 노출하지 않는다.

### 4.3 테스트 데이터 원칙

- 운영 경로, 개발 서버, 자동 실행 스크립트에 dummy player, dummy room, 가짜 결과를 주입하지 않는다.
- 단위 테스트는 검증 대상의 입력을 테스트 파일 내부에서 명시적으로 구성할 수 있으나, 제품 기능에서 불러 쓰는 공용 mock/dummy 모듈이나 가짜 provider 파일을 만들지 않는다.
- `simulate`와 `autoplay`는 실제 서버 프로토콜을 검증하는 개발 도구로만 사용하고, 운영 서비스 데이터 또는 사용자 흐름의 대체 구현으로 사용하지 않는다.
- 테스트가 통과하도록 validation, rate limit, 권한 검사를 우회하는 운영 분기를 추가하지 않는다.

---

## 5. Shared 계약 구현 원칙

`shared/**`는 Frontend와 Backend가 함께 소유하고 함께 검토한다.

- Socket.IO event 이름, request/response payload, server push payload, error type, enum, 공통 상수와 Zod schema를 관리한다.
- DB 내부 모델이나 React 전용 UI state, Godot 전용 렌더링 객체를 공개 계약에 섞지 않는다.
- Backend가 response 또는 event payload를 변경하면 `shared` 계약을 같은 변경에서 먼저 또는 함께 수정한다.
- Frontend와 Backend는 `shared` 타입을 직접 import하며 구조가 같은 별도 타입을 복제하지 않는다.
- 필드 rename/removal 같은 breaking change는 양쪽 반영이 끝나기 전에 기존 필드를 즉시 삭제하지 않는다. 필요하면 deprecated 기간 또는 명시적인 V2 계약을 둔다.
- 계약 변경 시 최소한 다음 내용을 기록한다.

```text
Event 또는 Method/Path:
Direction:
Auth/socket state:
Request payload:
Ack/Response payload:
Push event:
Error code:
Frontend 사용 화면:
Backward compatibility:
```

다음 변경은 Frontend와 Backend의 공동 검토가 필요하다.

- 이벤트 추가·삭제 또는 이름 변경
- payload 필드, 타입, 필수 여부 변경
- ack 성공·실패 shape 또는 error code 변경
- room/team phase, enum, 공통 상수 변경
- revision, idempotency, reconnect 정책 변경
- 환경 변수 key 추가·삭제

---

## 6. Godot 구현 원칙

Godot 담당 영역은 다음과 같다.

```text
desktop-godot/scenes/**
desktop-godot/scripts/**
desktop-godot/shaders/**
desktop-godot/assets/**
desktop-godot/project.godot
desktop-godot/export_presets.cfg
```

- Godot은 `shared/src/render-protocol.ts`와 Frontend의 bridge를 통해 전달받은 확정 상태를 시각화한다.
- Godot 내부에서 별도의 승패, 점수, phase 또는 충돌 결과를 최종 판정하지 않는다.
- bridge message의 version과 payload를 검증하고 알 수 없는 message는 명확히 거부·기록한다.
- asset 누락이나 로딩 실패를 placeholder 성공 상태로 숨기지 않는다.
- 원본 모델·텍스처의 출처와 라이선스를 보존한다.
- export 결과는 `npm run build:godot`으로 생성하고 `frontend/public/godot/` 산출물을 손으로 수정하지 않는다.
- render protocol 변경은 Frontend/Godot 공동 변경으로 취급하고 양쪽 호환성을 확인한다.

---

## 7. 작업 및 협업 절차

### 7.1 기능 개발 전 합의

기능을 시작하기 전에 다음을 확인한다.

1. Frontend-only, Backend-only, Godot-only, full-stack 중 어느 범위인지 정한다.
2. Socket.IO/HTTP/render protocol 변경 여부를 확인한다.
3. room state 또는 게임 규칙 변경 여부를 확인한다.
4. 필요한 환경 변수와 실제 provider 준비 여부를 확인한다.
5. `shared` 계약 및 backward compatibility를 합의한다.
6. 각 영역의 구현자와 reviewer를 정한다.

### 7.2 권장 branch 이름

```text
frontend/mobile-aim-controls
frontend/desktop-result-polish
backend/room-reconnect-policy
backend/energy-fire-validation
godot/trex-animation
contract/energy-shot-response
```

브랜치 작업에는 다음 규칙을 적용한다.

- 모든 구현은 담당 영역과 기능이 드러나는 별도 작업 브랜치에서 진행한다.
- Frontend 작업은 `frontend/*`, Backend 작업은 `backend/*`, Godot 작업은 `godot/*`, 공통 계약 작업은 `contract/*` 형식을 사용한다.
- 하나의 브랜치에는 원칙적으로 하나의 기능 또는 하나의 수정 목적만 포함한다.
- 서로 관련 없는 Frontend, Backend, 문서, 리팩터링 작업을 같은 브랜치에 섞지 않는다.
- full-stack 기능은 계약을 먼저 합의한 뒤 각 영역의 변경 범위를 명확히 나눈다. 한 브랜치에서 함께 작업해야 한다면 브랜치 이름과 PR 설명에 full-stack 범위를 명시한다.
- 작업 시작 전 현재 브랜치와 `git status`를 확인하고, 다른 작업자의 미완료 변경을 자신의 커밋에 포함하지 않는다.
- 작업 브랜치를 최신 기준 브랜치와 동기화한 뒤 개발하며, 충돌을 해결하지 않은 상태로 기능 구현을 계속하지 않는다.
- 기준 브랜치에 직접 구현 commit을 만들거나 직접 push하지 않는다.
- 작업 완료 전 typecheck, test, build 등 변경 범위에 해당하는 최소 검증을 수행한다.

### 7.3 변경 이력 작성

모든 기능 구현과 수정이 끝나면 commit 전에 담당자가 변경 사항을 한국어로 기록한다.

```text
FRONT_HISTORY.md    # Frontend 및 Frontend가 담당한 Godot/UI 변경 이력
BACK_HISTORY.md     # Backend 및 Backend가 담당한 서버/게임 로직 변경 이력
```

이력 작성에는 다음 규칙을 적용한다.

- Frontend 담당자는 작업을 마칠 때마다 저장소 루트의 `FRONT_HISTORY.md`에 기록한다.
- Backend 담당자는 작업을 마칠 때마다 저장소 루트의 `BACK_HISTORY.md`에 기록한다.
- Shared 계약 변경은 해당 변경을 주도한 담당자의 이력에 기록하고, 양쪽에 영향이 있으면 두 문서에 각각 영향을 기록한다.
- Godot 변경은 Godot 작업 담당자가 Frontend에 속하면 `FRONT_HISTORY.md`, Backend에 속하면 `BACK_HISTORY.md`에 기록한다.
- 단순히 파일명만 나열하지 말고 구현 목적, 주요 변경 내용, 계약·환경 변수 변경, 검증 결과를 한국어로 작성한다.
- 실패한 검증이나 실행하지 못한 검증이 있으면 숨기지 않고 사유와 남은 위험을 함께 기록한다.
- 이력 문서 갱신은 해당 기능 commit에 반드시 포함하며, 나중에 여러 기능을 모아 한꺼번에 작성하지 않는다.

권장 기록 형식은 다음과 같다.

```md
## YYYY-MM-DD - 기능명

- 구현 목적:
- 주요 변경 사항:
- API/Socket.IO/Shared 계약 변경:
- 환경 변수 변경:
- 검증 결과:
```

### 7.4 Commit과 push 규칙

commit과 push는 기능 단위로 수행한다.

- 하나의 commit은 하나의 기능, 버그 수정 또는 명확한 리팩터링 목적만 포함한다.
- 기능 구현과 무관한 포맷 변경, 다른 영역 수정, 개인 작업 파일을 같은 commit에 포함하지 않는다.
- Frontend와 Backend 변경을 하나의 commit에 섞지 않는다. 단, 분리하면 빌드가 깨지는 동일한 shared 계약 변경은 관련 소비 코드와 함께 포함할 수 있으며 commit 설명에 범위를 명시한다.
- 기능이 완료되고 관련 이력 문서가 작성되며 최소 검증이 끝난 뒤 commit한다.
- 미완성 기능, 임시 우회, fake 성공 처리 또는 검증 실패 상태를 완료 commit으로 만들지 않는다.
- 큰 기능은 독립적으로 검증 가능한 하위 기능으로 나누어 commit한다. 파일별 또는 작업 시간별로 의미 없이 쪼개지 않는다.
- commit이 완성될 때마다 해당 작업 브랜치에 push한다. 여러 기능을 로컬에 쌓아 둔 뒤 한 번에 묶어 push하지 않는다.
- push 전에 commit 대상과 이력 문서 포함 여부를 확인하고, 다른 작업자의 변경이 섞이지 않았는지 검토한다.
- 이미 공유된 브랜치의 commit history를 임의로 force-push하거나 다시 작성하지 않는다.
- 기능별 commit과 push가 끝난 뒤에 다음 기능 작업을 시작한다.

권장 commit 형식:

```text
feat(frontend): add mobile aim permission state
fix(backend): reject duplicate energy fire request
feat(godot): render team phase transition
contract(shared): add shot rejection code
test(backend): cover room reconnect revision
docs(team): define implementation rules
chore(env): add public join origin key
```

### 7.5 충돌 방지

- 작업 시작 전에 `git status`로 사용자 또는 다른 작업자의 변경을 확인한다.
- `shared`, `frontend/src/socket.ts`, room manager, render bridge처럼 접점이 큰 파일은 변경 범위를 먼저 공유한다.
- 다른 영역의 파일을 수정해야 하면 변경 이유와 계약 영향을 PR에 명시한다.
- 생성된 Godot export 파일과 원본 Godot 파일을 한 변경에서 혼동하지 않는다.
- API/event 계약 변경과 소비 코드 변경은 가능한 한 같은 PR에서 검증한다.

---

## 8. 최소 검증 기준

### Frontend 변경

```bash
npm run typecheck -w frontend
npm run test -w frontend
npm run build -w frontend
```

### Backend 변경

```bash
npm run typecheck -w backend
npm run test -w backend
npm run build -w backend
```

### Shared 계약 변경

```bash
npm run typecheck
npm test
npm run build
```

### Godot 변경

```bash
npm run build:godot
npm run build -w frontend
```

Godot CLI가 없는 환경에서는 검증을 통과한 것처럼 기록하지 않고, 실행하지 못한 명령과 사유를 PR에 명시한다.

게임 흐름에 영향을 주는 변경은 정적 검증 외에도 실제 Backend와 Frontend를 연결해 다음을 확인한다.

- 방 생성과 QR/URL 입장
- 여러 실제 클라이언트의 팀 배정과 준비
- phase 전환 및 제한 시간
- 재접속과 최신 revision 복구
- 센서 권한 거부·미지원 및 공식 대체 조작
- 발굴 → 달리기 → 조준/충전 → 결과 → 투표/재경기 흐름
- Backend 재시작 또는 연결 단절 시 명확한 실패 상태

---

## 9. 완료 기준

기능은 다음 조건을 모두 만족해야 완료로 본다.

1. mock, dummy, fake provider, fake 성공 응답에 의존하지 않는다.
2. 서버 권위 원칙을 지키며 클라이언트 입력을 검증한다.
3. `shared` 계약과 실제 Frontend/Backend 구현이 일치한다.
4. 필수 환경 변수 누락 시 명확하게 실패한다.
5. 미설정 provider와 미구현 기능이 성공 상태로 보이지 않는다.
6. loading, error, disconnected, permission, retry 상태가 UI에 반영된다.
7. 관련 typecheck, test, build가 통과한다.
8. 실행하지 못한 검증이 있다면 사유와 위험을 명시한다.
9. secret과 실제 환경 값이 저장소, 로그, 브라우저 bundle에 포함되지 않는다.
10. 문서와 `.env.example`의 key 목록이 실제 코드와 일치한다.
11. Frontend 변경은 `FRONT_HISTORY.md`, Backend 변경은 `BACK_HISTORY.md`에 한국어로 기록되어 있다.
12. 변경 사항이 하나의 기능 단위로 commit되고 해당 작업 브랜치에 push되어 있다.
