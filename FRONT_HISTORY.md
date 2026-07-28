# Frontend 변경 이력

## 2026-07-27 - 티라노 게임 구현 및 협업 원칙 문서화

- 구현 목적: 티라노 게임 개발에서 공통으로 지켜야 할 실제 구현 원칙과 Frontend, Backend, Shared, Godot의 책임 및 협업 절차를 명확히 정의했다.
- 주요 변경 사항: mock·dummy·fake 성공 응답 금지, 서버 권위 상태 관리, 오류 처리, 브랜치 소유권, 기능 단위 commit·push, 담당자별 한국어 변경 이력 작성 및 완료 기준을 `implementation_rule.md`에 정리했다.
- API/Socket.IO/Shared 계약 변경: 실제 계약 코드는 변경하지 않았으며, 향후 계약 변경 시 기록하고 공동 검토해야 할 기준을 문서화했다.
- 환경 변수 변경: 실제 환경 변수 key는 변경하지 않았으며, `.env.example`에는 key 목록만 두고 필수 설정 누락 시 명확히 실패하도록 하는 원칙을 문서화했다.
- 검증 결과: 문서 형식과 Git diff whitespace 검사를 완료했다. 실행 코드 변경이 없어 typecheck, test, build는 실행하지 않았다.

## 2026-07-27 - 데스크탑 홈/로비 화면 UI 조정

- 구현 목적: 홈 화면과 로비 화면의 시각적 완성도를 높이기 위해 방 만들기 버튼 여백, 설정 아이콘, 입장 QR 카드 레이아웃을 조정했다.
- 주요 변경 사항:
  - 홈 화면 좌측 상단에 설정(⚙️) 아이콘 버튼을 추가했다(`home-screen__settings`). 아직 연결된 기능은 없는 시각 요소이며, 추후 설정 패널 연동 시 핸들러만 붙이면 된다.
  - 홈 화면의 "🦴 방 만들기" 버튼이 속한 코너 그룹(`home-screen__corner`)의 화면 가장자리 여백을 기존 32px에서 96px(3배)로 늘렸다.
  - 로비(LOBBY phase) 화면의 입장 카드에서 방 코드 숫자 표시를 제거하고 QR 코드만 보이도록 했다(`lobby-code-card--qr-only`), QR 이미지 크기를 150px→220px로 키웠다. 더 이상 쓰이지 않는 `lobby-code-card__code`/`__label`/`__value`/`__divider` CSS를 정리했다.
  - `.lobby-main`을 수직 중앙 정렬(`justify-content: center`)에서 상단 정렬(`flex-start`)로 바꿔 QR 카드가 헤더 바로 아래로 붙도록 했다.
- API/Socket.IO/Shared 계약 변경: 없음.
- 환경 변수 변경: 없음.
- 검증 결과: `npm run typecheck -w frontend` 통과. Playwright(headless Chromium)로 실제 dev 서버(`localhost:5173` 프론트 + `localhost:3001` 백엔드)에 대해 홈 화면 → 방 생성 → LOBBY 화면 진입까지 직접 구동해 스크린샷으로 확인함(설정 아이콘 위치, 방 만들기 버튼 여백, QR-only 카드가 헤더 아래로 이동한 것 확인).

## 2026-07-28 - 결과 화면 정리, 영점 조정 연습 UI, 로고 여백 축소

> 이 항목은 커밋 시점이 아니라 사후에 기록했다(§7.3 위반) — 작업 중 이력 문서 갱신을 누락했고, 이후 규칙을 다시 확인하며 뒤늦게 채워 넣었다.

- 구현 목적: CHARGING 진입 전 영점 조정 연습(10초) 백엔드 기능에 맞춰 모바일/데스크탑 UI를 추가하고, 결과 화면과 로고 여백을 다듬었다.
- 주요 변경 사항:
  - `AimControls`에 `practice` 모드 추가 — 연습 중엔 카운트다운 배너를 띄우고 발사 버튼을 비활성화하되 조준(자이로/터치패드)은 그대로 동작하게 했다. `PlayArea`/`MobileJoin`에 `CHARGING_PRACTICE` phase 분기를 추가했다.
  - `ResultView` 상단에 "{점수} {A팀} | {B팀} {점수}" 형식의 스코어 헤더를 추가하고, 승리/무승부 텍스트 옆의 "(사유)" 괄호 표시를 제거했다. 재경기 버튼을 기존 방 만들기/게임 시작과 같은 `lobby-start__button` 스타일로 통일했다.
  - 로고와 화면 상단 사이 여백을 기존 값의 80%로(20% 축소) 줄였다(`lobby-header` padding-top, `home-screen__logo-mark` top).
- API/Socket.IO/Shared 계약 변경: 없음(`CHARGING_PRACTICE` phase, `team:phaseChanged` 이벤트 등 계약 변경은 Backend 담당 작업이라 `BACK_HISTORY.md`에 기록되어야 한다 — 이 항목에서는 Frontend 소비 코드만 다룬다).
- 환경 변수 변경: 없음.
- 검증 결과: `npm run typecheck -w frontend`, `npm run build -w frontend` 통과. `npm run autoplay`로 로컬/배포 서버 양쪽에서 봇 게임을 돌려 `CHARGING_PRACTICE → CHARGING` 전환과 결과 화면을 확인했다.

## 2026-07-28 - 모바일 화면 확대, 확대/축소 방지

- 구현 목적: 실기기에서 모바일 조작 화면이 작게 느껴지고, 더블탭/핀치로 브라우저가 확대되는 문제를 해결했다.
- 주요 변경 사항:
  - `frontend/index.html` viewport meta에 `maximum-scale=1.0, user-scalable=no`를 추가해 더블탭/핀치 확대를 막았다.
  - 발굴 버튼, 조준 패드, 발사 버튼, 모드 전환·영점 잡기 버튼의 크기를 화면 대비 더 크게 키웠다(`clamp()` 상한을 전반적으로 상향).
  - 다이노런 화면(`dino-run__track`)을 고정 높이(`clamp(170px,26vh,220px)`)에서 `flex: 1`로 바꿔 세로 화면에서 남는 공간을 그대로 채우게 했다. 공룡/장애물 위치를 px 대신 트랙 높이 대비 %로 바꿔 트랙 크기가 달라져도 비율이 깨지지 않게 했다.
- API/Socket.IO/Shared 계약 변경: 없음.
- 환경 변수 변경: 없음.
- 검증 결과: `npm run build -w frontend` 통과. 실기기 확인은 못 했고(이 세션은 브라우저 자동화 도구가 없는 환경), 로컬 dev 서버 빌드 결과물만 확인했다 — 실기기 검증은 남은 위험으로 남긴다.

## 2026-07-28 - 팀 카드/QR 카드 세로 길이 통일, 잘난체 폰트, 알림 한국어화, 레이아웃 밀림 수정

- 구현 목적: 로비 화면 QR 카드와 팀 카드의 세로 길이가 인원수 설정에 따라 어긋나던 문제, 알림 배너가 뜰 때 옆 팀 카드가 밀리던 문제, 오류 알림이 영어로 뜨던 문제를 고치고, 팀 이름·팀원 명단·시작 버튼에 "여기어때 잘난체" 폰트를 적용했다.
- 주요 변경 사항:
  - `.lobby-team-card`와 `.lobby-code-card--qr-only`에 동일한 `min-height: 320px`를 줘서 팀 인원 설정과 무관하게 세로 길이가 맞도록 했다.
  - `.lobby-error-banner--inline`을 문서 흐름에서 빼서(`position: fixed`, 화면 하단 토스트) 알림이 뜨거나 사라져도 팀 카드·버튼 위치가 흔들리지 않게 했다.
  - `frontend/src/util/errorMessages.ts`를 새로 만들어 `shared`의 `ErrorCode` 17종을 전부 한국어 문구로 매핑했다. `DesktopLobby.tsx`(방 만들기/게임 시작)와 `MobileJoin.tsx`(방 입장)에서 서버가 보낸 영어 `error.message`를 직접 띄우던 걸 `describeAckError(error.code)` 결과로 바꿨다. 백엔드의 `code`(안정적인 계약값)는 그대로 두고, 표시 문구만 Frontend가 책임진다.
  - "여기어때 잘난체" 웹폰트(GC Company, 상업적 이용 무료 — 눈누 배포)를 `@font-face`로 추가하고 팀 이름, 팀원 명단, "게임 시작"/"방 만들기"/"재경기" 버튼(`lobby-start__button`)에 적용했다. 폰트에 굵은 글꼴이 없어 해당 요소들의 `font-weight`를 700~800에서 400으로 낮춰 브라우저가 가짜 볼드를 만들지 않게 했다.
  - `.lobby-main`이 좁은/세로 창에서 줄바꿈될 때 QR/버튼 열(`lobby-main__center`)이 팀 카드 사이에 끼지 않고 맨 위로 오도록 `@media (orientation: portrait)`에서 `order: -1`을 줬다.
  - "죽은 티라노, 정말 살려드립니다" 서브타이틀 폰트 굵기를 700 → 400으로 낮췄다.
- API/Socket.IO/Shared 계약 변경: 없음 — `ErrorCode`는 이미 `shared`에 있던 계약을 그대로 썼다.
- 환경 변수 변경: 없음.
- 검증 결과: `npm run typecheck -w frontend`, `npm run test -w frontend`, `npm run build -w frontend` 통과. 폰트 CDN URL은 curl로 200 응답을 직접 확인했다. 실기기/실제 화면 스크린샷 검증은 이 세션에 브라우저 자동화 도구가 없어 못 했다 — 남은 위험으로 남긴다.
