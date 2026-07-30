# 🦖 내 티라노사우루스 살려내!!!

> 휴대폰을 컨트롤러로 사용해 뼈를 발굴하고, 운석을 피하고, 티라노사우루스를 부활시키는 실시간 팀 대항 파티 게임

**몰입캠프 2026 Summer Week 4 · Web-based Cross-platform Team Party Game**

🔗 **Service**: [https://t-rex-revival.madcamp-kaist.org](https://t-rex-revival.madcamp-kaist.org)

---

## 팀원

| 소속 | 이름 | 역할 |
| --- | --- | --- |
| HYU 23 CSE | 김혜리 | 기획 · 백엔드 · 게임 로직 |
| EWHA 23 CSE | 김윤서 | 기획 · 프론트엔드 · UI/UX |

---

## 기획안

### 프로젝트 주제

`내 티라노사우루스 살려내!!!`는 하나의 데스크탑 공유 화면과 여러 대의 휴대폰을 연결해 즐기는 무가입 실시간 팀 게임이다. 참가자는 QR 코드로 방에 들어와 두 팀으로 나뉘며, 세 가지 협동 미니게임을 거쳐 뼈라노에게 생명을 불어넣는다.

### 이름과 콘셉트

플레이어가 직접 땅을 파고, 흩어진 생명을 모으고, 마지막 에너지를 주입해 6,600만 년 전 사라진 티라노사우루스를 현재에 되살린다는 이야기에서 출발했다. 부활 과정이 안정적이면 티라노사우루스, 불안정하면 예상하지 못한 모습의 `와이라노사우루스`가 탄생한다.

### 목적

- 별도 앱 설치와 회원가입 없이 QR 스캔만으로 함께 플레이한다.
- 개인 휴대폰의 흔들기, 터치, 자이로 센서를 팀 협동 입력으로 활용한다.
- 데스크탑의 큰 화면을 모두가 함께 보는 오프라인 파티 게임 경험을 만든다.
- 승패뿐 아니라 부활 결과와 엔딩 연출까지 하나의 이야기로 연결한다.

### 예상 사용자

- 짧은 시간에 여러 명이 함께 즐길 게임이 필요한 사용자
- 전시, 축제, MT, 해커톤 부스 등 공용 화면이 있는 오프라인 공간
- 휴대폰 센서를 활용한 새로운 웹 인터랙션을 경험하고 싶은 사용자

---

## 핵심 기능

### 무가입 QR 로비

- 데스크탑에서 방을 생성하고 4자리 코드와 QR을 표시한다.
- 플레이어는 휴대폰으로 QR을 스캔해 닉네임만 입력하고 참가한다.
- 인원은 두 팀에 자동 배정되며, 전원이 준비하면 호스트가 게임을 시작한다.
- 호스트 연결이 잠시 끊겨도 30초 동안 기존 방으로 재연결할 수 있다.

### Game 1 — 화석 발굴

**“휴대폰을 흔들거나 버튼을 눌러 뼈를 발굴하세요!”**

- 휴대폰 흔들기 입력으로 팀 발굴 게이지를 채운다.
- 팀 인원수에 따라 목표 뼈 개수가 자동 보정된다.
- 발굴 진행도와 발견한 뼈가 데스크탑 3D 화면에 실시간으로 나타난다.
- 황금 뼈와 화석 이벤트가 발생해 점수와 진행에 변화를 준다.
- 먼저 발굴을 마친 팀이 우위를 얻고, 양 팀 완료 후 다음 게임으로 이동한다.

### Game 2 — 운석 피하기

**“운석을 피하고 과일과 하트를 획득하세요!”**

- 플레이어는 휴대폰 화면을 좌우로 조작해 자신의 뼈라노를 움직인다.
- 각 플레이어는 독립적으로 하트 3개를 가진다.
- 운석에 맞으면 생명과 점수를 잃고, 하트 아이템으로 생명을 회복한다.
- 과일과 하트를 획득하면 추가 점수를 얻는다.
- 모든 판정은 서버가 수행하며, 탈락한 플레이어는 남은 팀원을 응원한다.

### Game 3 — 부활 에너지 사격

영점 조정 후 45초씩 세 개의 페이즈를 진행한다. 인당 목표 에너지는 120점이며, 목표를 먼저 채워도 세 페이즈를 모두 플레이하고 남은 시간 동안 추가 점수를 획득한다.

1. **Phase 1 — “뼈라노에게 에너지를 주세요!”**
   - 가까이 있는 뼈라노와 빛나는 코어를 조준한다.
   - 휴대폰 자이로 또는 터치패드로 조준하고 버튼으로 발사한다.

2. **Phase 2 — “도망치는 뼈라노를 붙잡으세요!”**
   - 도로 위를 빠르게 도망치는 뼈라노를 추적한다.
   - 원근감에 따라 뼈라노가 가까워지고 멀어지며, 배경 이동으로 속도감을 표현한다.

3. **Phase 3 — “뼈라노에게 마지막으로 생명을 불어넣어주세요!”**
   - 마지막 급소를 지키며 압도적으로 다가온 뼈라노와 대치한다.
   - 5초 안에 급소를 맞히지 못하면 상대 팀이 공격받는다.
   - 공격받은 팀 화면에는 붉은 오버레이가 나타나고 휴대폰이 진동하며, 2초간 발사할 수 없다.

레이저는 플레이어 고유 색상으로 총구에서 조준점까지 표시된다. 일반 명중, 코어 명중, 페이즈별 명중에 서로 다른 에너지와 점수를 부여한다.

### 결과와 엔딩

- 각 경기에서 얻은 개인 점수의 합이 팀 점수가 된다.
- 누적 팀 점수로 승리 팀을 결정하고 개인 기여도를 바탕으로 MVP를 표시한다.
- 부활 팀이 있으면 암전 화면에 아래 문구가 나타난다.

  > 마침내 티라노사우루스는<br>
  > 부활에 성공했습니다

- 이후 KAIST에 등장한 티라노사우루스 엔딩 이미지가 재생되고 승리 화면으로 전환된다.
- 정상 부활은 `티라노사우루스 살리기 성공!`, 불안정한 부활은 `와이라노... 사우루스?!`로 표시한다.
- 최종 화면에서 재경기를 선택하면 같은 방과 참가자를 유지한 채 로비로 돌아간다.

---

## 기능 명세

### 필수 기능

- [x] 무가입 방 생성 및 4자리 코드 발급
- [x] QR/코드 기반 모바일 참가
- [x] 자동 팀 배정과 준비 상태 관리
- [x] 휴대폰 흔들기 기반 발굴
- [x] 인원수 기반 발굴 목표 보정
- [x] 플레이어별 운석 회피, 3개 생명, 아이템 획득
- [x] 자이로 및 터치패드 조준
- [x] 플레이어 색상 조준점과 레이저
- [x] 서버 권위 명중·점수·승패 판정
- [x] 3단계 사격 페이즈와 페이즈별 배경/움직임
- [x] Phase 3 급소 제한 시간, 팀 생명, 피격·진동·발사 제한
- [x] 개인 점수 합산 기반 팀 점수
- [x] 티라노사우루스/와이라노 부활 결과
- [x] 시네마틱 엔딩과 승리 화면
- [x] 재경기
- [x] 호스트 재연결
- [x] 배경 음악과 전 화면 음소거

### 운영 기능

- [x] Health, readiness, version HTTP API
- [x] 요청 스키마 검증과 입력 빈도 제한
- [x] request ID 기반 중복 요청 방지
- [x] 자동 플레이 봇과 다중 클라이언트 시뮬레이터
- [x] EC2, Nginx, systemd 기반 운영 배포

---

## Information Architecture

### 주요 화면

| 경로 | 대상 | 설명 |
| --- | --- | --- |
| `/` | 데스크탑 | 홈, 방 생성, QR 로비, 전체 게임, 엔딩과 결과 |
| `/join/:code` | 모바일 | 닉네임 입력, 준비, 게임별 컨트롤러 |
| `/battle-demo` | 개발 | 사격 화면 단독 확인 |
| `/godot/index.html` | 내부 | Godot Web 3D 렌더러 |

### 사용자 흐름

```text
데스크탑에서 방 생성
  → QR/4자리 코드 표시
  → 플레이어가 휴대폰으로 입장
  → 자동 팀 배정 및 전원 준비
  → 약 6,600만 년 전 백악기 말...
  → Game 1: 화석 발굴
  → 2026년의 대한민국...
  → Game 2: 운석 피하기
  → 영점 조정
  → Game 3: 3단계 부활 에너지 사격
  → 부활 엔딩
  → 승리 팀·MVP·티라노 형태 확인
  → 재경기 또는 종료
```

---

## 시스템 아키텍처

```text
┌───────────────────┐        Socket.IO         ┌────────────────────┐
│ Mobile Controllers │ ───────────────────────→ │                    │
│ React + Sensors     │ ←─────────────────────── │  Node.js Server    │
└───────────────────┘                           │  Authoritative Game │
                                                │  State & Judgement │
┌───────────────────┐        Socket.IO         │                    │
│ Desktop React UI   │ ←──────────────────────→ └────────────────────┘
│  ├─ Three.js Battle│
│  └─ Godot iframe   │ ← postMessage Bridge
└───────────────────┘
```

### 책임 분리

| 영역 | 책임 |
| --- | --- |
| Backend | 방·팀·플레이어 상태, 입력 검증, 충돌·명중 판정, 점수, 승패, 페이즈 전환 |
| React | 데스크탑/모바일 UI, 센서 입력, Socket.IO 연결, 사격 장면과 결과 연출 |
| Godot | 발굴 및 골격 등 데스크탑 3D 시각화 |
| Shared | 도메인 타입, 상수, Zod 이벤트 스키마, React–Godot 브리지 규격 |

게임 결과에 영향을 주는 판정은 클라이언트가 아닌 Node.js 서버에서 수행한다. React와 Godot은 서버 상태를 표현하며, 양쪽에서 사용하는 계약은 `@trex/shared`를 단일 기준으로 삼는다.

---

## 기술 스택

| 분류 | 기술 |
| --- | --- |
| Language | TypeScript, GDScript |
| Frontend | React 18, Vite, Three.js |
| Realtime | Socket.IO |
| Backend | Node.js, Express |
| Validation | Zod |
| 3D | Godot 4 Web, Three.js |
| Test | Vitest |
| Infra | AWS EC2, Nginx, systemd, Cloudflare Tunnel |
| Package | npm workspaces |

---

## 저장소 구조

```text
Tyrannosaurus-rex/
├─ shared/            # 공통 도메인 타입, 상수, 이벤트 및 브리지 프로토콜
├─ backend/           # Socket.IO 권위 서버와 게임 판정
│  └─ src/
│     ├─ game/        # 발굴, 운석, 사격, 점수 계산
│     └─ rooms/       # 방 상태와 Socket.IO 핸들러
├─ frontend/          # React 데스크탑/모바일 클라이언트
│  ├─ src/battle/     # Three.js 사격 게임
│  ├─ src/desktop/    # 로비, 게임, 엔딩, 결과 화면
│  ├─ src/mobile/     # 센서 기반 모바일 컨트롤러
│  └─ public/         # 이미지, 음원, Godot Web 산출물
├─ desktop-godot/     # Godot 4 원본 프로젝트
├─ scripts/           # 운영 배포 스크립트
├─ PLAN.md            # 상세 기획·프로토콜 문서
└─ HISTORY.md         # 구현 변경 기록
```

---

## 실시간 통신 명세

### Client → Server

| Event | 설명 |
| --- | --- |
| `room:create` | 방 생성 |
| `room:hostReconnect` | 호스트 세션 복구 |
| `room:join` | 플레이어 참가 |
| `player:setReady` | 준비 상태 변경 |
| `game:start` | 게임 시작 |
| `excavate:input` | 발굴 흔들기 입력 |
| `dino:position` | 운석 게임 좌우 위치 |
| `aim:update` | 사격 조준 좌표 |
| `energy:fire` | 발사 및 명중 판정 요청 |
| `sensor:status` | 센서 지원·권한 상태 |
| `game:rematch` | 재경기 |
| `room:requestState` | 최신 전체 상태 복구 |

### Server → Client

| Event | 설명 |
| --- | --- |
| `room:state` | 권위 상태 스냅샷 |
| `team:phaseChanged` | 팀 게임 단계 전환 |
| `excavation:*` | 발굴 진행, 뼈 발견, 이벤트, 완료 |
| `dino:*` | 운석·아이템 판정, 플레이어 탈락, 결과 |
| `aim:playerMoved` | 플레이어별 조준점 |
| `trex:transform` | 티라노 위치·방향·코어 |
| `energy:shotResolved` | 발사 명중 결과 |
| `energy:coreChanged` | 활성 급소 변경 |
| `energy:finalDamaged` | Phase 3 팀 피해 |
| `revival:formChanged` | 최종 부활 형태 |
| `game:result` | 승리 팀, 점수, MVP |

모든 상태 변경 요청은 acknowledgement를 반환하며, 오류는 공통 `ApiError` 형식과 오류 코드로 전달한다.

---

## HTTP 운영 API

| Method | Endpoint | 설명 |
| --- | --- | --- |
| `GET` | `/api/health` | 프로세스 상태와 uptime |
| `GET` | `/api/ready` | 서비스 준비 상태 |
| `GET` | `/api/version` | 앱, API, Git, Godot asset 버전 |

이 프로젝트는 무가입 인메모리 파티 게임으로, 회원 계정이나 영구 저장용 DB를 사용하지 않는다. 방은 호스트 연결과 idle TTL을 기준으로 정리된다.

---

## 로컬 실행

### 요구 사항

- Node.js 22.5 이상
- npm
- 선택: Godot 4.3 이상
- 선택: `cloudflared` — 모바일 센서 실기기 HTTPS 테스트

### 설치

```bash
npm install
cp .env.example .env
```

Windows PowerShell에서는 다음 명령을 사용할 수 있다.

```powershell
Copy-Item .env.example .env
```

### 개발 서버

```bash
npm run dev
```

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:3001`

### 모바일 실기기 테스트

흔들기와 자이로 등 Sensor API는 보안 컨텍스트가 필요하다.

```bash
npm run dev:tunnel
```

발급된 HTTPS 주소를 `.env`의 `CLIENT_ORIGIN`, `PUBLIC_JOIN_ORIGIN`에 설정한 뒤 개발 서버를 다시 시작한다.

### Godot Web export

```bash
npm run build:godot
```

`desktop-godot/`이 원본이며 결과물은 `frontend/public/godot/`에 생성된다. React 또는 서버 코드만 변경했다면 Godot을 다시 export할 필요가 없다.

---

## 검증

```bash
npm run typecheck
npm test
npm run build
```

여러 실기기 없이 전체 흐름을 자동 검증할 수도 있다.

```bash
npm run simulate -- --players 6
npm run autoplay
```

---

## 환경 변수

| 이름 | 기본값 | 설명 |
| --- | --- | --- |
| `NODE_ENV` | `development` | 실행 환경 |
| `SERVER_PORT` | `3001` | 백엔드 포트 |
| `CLIENT_ORIGIN` | `http://localhost:5173` | Socket.IO 허용 origin |
| `PUBLIC_JOIN_ORIGIN` | `http://localhost:5173` | QR 참가 URL origin |
| `APP_VERSION` | `1.0.0` | 앱 버전 |
| `API_VERSION` | `1` | API 버전 |
| `GODOT_ASSET_VERSION` | `dev` | Godot asset 버전 |
| `LOG_LEVEL` | `info` | 로그 레벨 |
| `ROOM_IDLE_TTL_MS` | `1800000` | idle 방 만료 시간 |
| `ROUND_DURATION_MS` | `300000` | 라운드 안전 제한 시간 |

---

## 배포

운영 배포는 `origin/main`을 기준으로 EC2에서 의존성을 설치하고 전체 빌드한 뒤 `t-rex.service`를 재시작한다.

```bash
npm run deploy
```

Godot Web 산출물까지 함께 전송할 때:

```bash
npm run deploy -- --godot
```

배포 후 확인:

```bash
curl https://t-rex-revival.madcamp-kaist.org/api/health
curl https://t-rex-revival.madcamp-kaist.org/api/ready
curl https://t-rex-revival.madcamp-kaist.org/api/version
```

---

## 문서

- [PLAN.md](./PLAN.md) — 상세 게임 규칙, 상태 모델, Socket.IO 계약, 테스트 계획
- [HISTORY.md](./HISTORY.md) — 전체 구현 변경 기록
- [FRONT_HISTORY.md](./FRONT_HISTORY.md) — 프론트엔드 변경 기록
- [BACK_HISTORY.md](./BACK_HISTORY.md) — 백엔드 변경 기록
- [desktop-godot/README.md](./desktop-godot/README.md) — Godot 프로젝트 실행 및 export
