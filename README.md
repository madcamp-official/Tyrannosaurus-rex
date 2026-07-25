# 🦖 내 티라노사우루스 살려내!!!

> 죽은 티라노, 정말 살려드립니다.
>
> 몰입캠프 26s-w4-c3-01 · 웹 기반 무가입 크로스플랫폼 팀 파티 게임

전체 기획, 규칙, 아키텍처, API 명세, 개발 일정은 [Plan.md](./Plan.md)가 유일한 기준 문서다. 실제 구현이 그 계획과 어떻게, 언제 맞춰졌는지는 [HISTORY.md](./HISTORY.md)에 날짜별로 남긴다. 이 README는 "지금 이 저장소를 어떻게 실행하는지"만 다룬다.

## 저장소 구조

```text
Tyrannosaurus-rex/
├─ shared/          # 공유 타입, 상수, Zod 이벤트 스키마, 브리지 프로토콜 (@trex/shared)
├─ server/          # Node.js + Socket.IO 권위 서버 (@trex/server)
├─ client/          # React + Vite 데스크탑/모바일 클라이언트 (@trex/client)
└─ desktop-godot/   # Godot 4 프로젝트. Web export 결과물은 client/public/godot/에 복사된다
```

`shared`가 서버·클라이언트가 공유하는 유일한 타입/검증 소스다. `server`가 게임 결과에 영향을 주는 모든 판정을 수행하고, `client`는 Socket.IO 연결과 UI, Godot iframe 브리지를 담당하며, `desktop-godot`은 데스크탑 3D 표현만 담당한다 (Plan.md §10.2).

## 요구 사항

- Node.js 20 이상, npm 10 이상
- (선택) Godot 4.3+ 에디터 — `desktop-godot/`를 열거나 Web export를 만들 때만 필요
- (선택) `cloudflared` — 실기기(특히 iOS 센서)로 테스트할 때 HTTPS 터널용

## 처음 설정

```bash
npm install
cp .env.example .env      # 필요하면 값을 수정한다
```

`.env`는 `server/` 워크스페이스가 저장소 루트에서 읽는다 (Plan.md §22.6). 비밀값은 없고, 로컬 포트/오리진 설정만 있다.

## 개발 서버 실행

```bash
npm run dev
```

Node/Socket.IO 서버(`:3001`)와 Vite(`:5173`)가 동시에 뜬다. 브라우저에서 `http://localhost:5173`을 열면 데스크탑 로비가 보인다.

- `/` — 데스크탑 공유 화면 (방 생성·QR·팀 배정)
- `/join/:code` — 모바일 입장 및 컨트롤러
- `/museum` — 티라노박물관 (로컬 저장)
- `/godot/index.html` — Godot Web 빌드 (아래 "Godot Web export" 참고)

## 실기기(모바일)로 테스트

센서 API(흔들기·자이로)는 HTTPS와 같은 오리진을 요구한다. `npm run dev`로 서버를 띄운 상태에서:

```bash
npm run dev:tunnel
```

터널 URL이 나오면 `.env.development.local`의 `CLIENT_ORIGIN`, `PUBLIC_JOIN_ORIGIN`을 그 주소로 맞추고 서버를 다시 시작한다 (Plan.md §22.6).

## Godot Web export

`desktop-godot/`가 원본 프로젝트이고 `client/public/godot/`는 빌드 산출물이다. 후자는 직접 수정하지 않는다.

```bash
npm run build:godot
```

Godot CLI(`godot --headless ...`)가 있어야 하며, 결과물은 `client/public/godot/index.{html,js,wasm,pck}`로 생성된다. React/서버 코드만 바꿨다면 다시 export할 필요 없다.

## 타입체크·테스트·빌드

```bash
npm run typecheck   # shared → server → client 순서로 tsc
npm test             # 각 워크스페이스의 vitest
npm run build        # 전체 프로덕션 빌드 (Godot 제외)
```

## 다중 클라이언트 시뮬레이션

실기기 여러 대 없이 로비 흐름(방 생성 → N명 입장 → 팀 배정 → 준비 → 시작)을 검증한다.

```bash
npm run dev -w server        # 다른 터미널에서 서버만 띄워도 된다
npm run simulate -- --players 6
```

## 운영 상태 확인

```bash
curl http://localhost:3001/api/health
curl http://localhost:3001/api/ready
curl http://localhost:3001/api/version
```

## 커밋 컨벤션

`type: 설명` 형식을 쓴다 (`feat`, `fix`, `docs`, `chore`, `test` 등). 기능 단위로 나눠 커밋한다.
