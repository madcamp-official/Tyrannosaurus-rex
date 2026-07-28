# Frontend 변경 이력

## 2026-07-29 - 발굴 씬 밝기 보강

- 구현 목적: 밤하늘 환경광과 깊은 흙 감광이 겹쳐 발굴 무대와 구덩이 내부가 지나치게 어둡게 보이는 문제를 완화했다.
- 주요 변경 사항: 배경 하늘은 유지하면서 지면에 따뜻한 중성 환경광을 별도로 적용하고 방향광의 밝기와 색온도를 조정했다. 지면 셰이더의 깊은 흙 색과 감광 폭을 밝히고 약한 자체광을 추가해 그림자와 입체감은 유지하면서 구덩이 벽의 암부가 검게 뭉개지지 않도록 했다.
- 후속 조정: 환경광과 지면 자체광이 그림자까지 들어 올려 구덩이가 평평해 보이는 문제를 수정했다. 환경광·자체광을 낮추고 방향광과 노출을 높여 화면 밝기를 유지했으며, 깊이와 경사 기반 감광을 파인 영역에만 집중시켜 구덩이 윤곽을 강화했다.
- 추가 조정: 방향광 고도를 낮은 대각선 각도로 바꿔 구덩이 벽 그림자를 길게 만들고, 환경광과 자체광을 더 낮추되 노출로 전체 화면 밝기를 보존했다. 흙 셰이더에는 크기가 다른 두 종류의 저주파 색상 변화를 추가하고 깊이·경사 감광 폭을 확대해 흙의 층과 파인 깊이가 더 분명하게 보이도록 했다.
- API/Socket.IO/Shared 계약 변경: 없음.
- 환경 변수 변경: 없음.
- 검증 결과: Godot 4.7.1 Web export와 `npm run build -w frontend` 성공. 운영 배포 및 공개 헬스체크 예정.

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

## 2026-07-28 - 결과 화면 레이아웃 재구성 (`frontend/result-screen-redesign` 브랜치)

- 구현 목적: 결과 화면 로고가 너무 크고 아래에 치우쳐 있고, 팀별 정보 칸이 좁아 글자가 겹치고, 점수 산출 방식이 직관적이지 않다는 피드백에 따라 결과 화면을 다시 짰다.
- 주요 변경 사항:
  - 레이아웃을 [팀A 패널 | 로고 | 팀B 패널] 헤더 행 → 전체 점수판(기존 "{점수} {팀} | {팀} {점수}" 줄 유지) → 개인 MVP 2열 그리드 → 재경기 버튼 순으로 재구성했다(`ResultView.tsx`).
  - 팀 패널에 팀별 색상(A=주황 `#ffb27a`, B=하늘 `#8ecdf0`, 로비 팀 카드와 동일 팔레트)을 적용해 로비에서 보던 색이 결과 화면까지 이어지게 했다.
  - 점수(점) 대신 `game:result`가 이미 내려주는 `players[].stats`(excavationInputs/shots/hits)를 팀별로 합산해 "흔든 횟수 N회 · 명중 H/S + 시간 보너스!"로 표시했다. 서버/계약 변경 없이 기존 payload만 프론트에서 재가공했다.
  - `.result-view` 최대 폭을 960px → `min(1400px, 96vw)`로 넓히고 팀 패널을 `flex: 1 1 360px`로 키워 긴 팀 이름·통계 텍스트가 겹치지 않게 했다.
  - `.lobby-header__logo--big`(대기/방 개설 화면 공용 로고)을 280px → 224px(80%)로 한 번 더 줄이고, 결과 화면은 별도의 더 작은 `.result-view__logo`(clamp 96~150px)를 새로 둬 헤더 행 안에 맞게 했다.
- API/Socket.IO/Shared 계약 변경: 없음 — `GameResultEvent.players[].stats` 등 기존 계약 필드만 사용했다.
- 환경 변수 변경: 없음.
- 검증 결과: `npm run typecheck -w frontend`, `npm run test -w frontend`, `npm run build -w frontend` 통과. `npm run autoplay`로 로컬 서버에서 4인 봇 게임을 끝까지 돌려 `game:result` 수신과 결과 화면 렌더링 경로에 런타임 예외가 없는지 확인했다. 실제 화면 스크린샷 검증은 이 세션에 브라우저 자동화 도구가 없어 못 했다 — 남은 위험으로 남긴다.

## 2026-07-28 - 로비 방 이름을 QR 카드 안으로 이동 (`frontend/lobby-room-name-in-qr-card` 브랜치)

- 구현 목적: 방 이름이 QR 카드 바깥, 게임 시작 버튼 위쪽에 작게 떠 있어 눈에 잘 안 띄던 것을 QR 카드 안 QR 이미지 바로 위로 옮기고, 팀 이름과 같은 스타일로 통일했다.
- 주요 변경 사항:
  - `<h2 className="lobby-room-name">`를 `.lobby-code-card__qr` 안, QR 이미지 바로 앞으로 옮겼다(`DesktopLobby.tsx`).
  - `.lobby-room-name` 폰트를 팀 이름(`.lobby-team-card__name`)과 동일하게 맞췄다 — "YeogiOttaeJalnan" 32px, font-weight 400.
- API/Socket.IO/Shared 계약 변경: 없음.
- 환경 변수 변경: 없음.
- 검증 결과: `npm run typecheck -w frontend`, `npm run test -w frontend`, `npm run build -w frontend` 통과.

## 2026-07-28 - 모바일 대기/입장 화면 확대 (`frontend/mobile-waiting-screen-scale` 브랜치)

- 구현 목적: 실기기 스크린샷으로 확인해보니 "준비하기" 대기 화면과 닉네임 입력 화면이 지난 확대 작업(발굴/조준/발사/다이노런 게임 화면) 범위에서 빠져 있어 여전히 작게 보였다.
- 주요 변경 사항:
  - `.mobile-join__content`의 요소 간 간격을 16px → 28px로 넓혔다.
  - 대기 화면: 로고(`--small`), 팀 이름(`YeogiOttaeJalnan` 폰트로 통일), 입장 안내 문구, "준비하기" 버튼, "다른 팀원 N명" 문구를 전부 `clamp()` 기반으로 화면 폭에 비례해 크게 키웠다.
  - 닉네임 입력 화면: 카드 최대 폭 340px → 420px, 입력창·버튼 글자 크기와 패딩을 확대했다.
- API/Socket.IO/Shared 계약 변경: 없음.
- 환경 변수 변경: 없음.
- 검증 결과: `npm run build -w shared`(stale artifact 재빌드 필요했음) 후 `npm run typecheck -w frontend`, `npm run test -w frontend`, `npm run build -w frontend` 통과.

## 2026-07-28 - QR/팀 카드 세로 길이 stretch로 확실히 맞춤, "스캔해서 입장" 제거, 서브타이틀 폰트 교체 (`frontend/lobby-qr-height-and-font` 브랜치)

- 구현 목적: `min-height` 값을 추측해서 맞추는 방식이 방 이름을 QR 카드 안으로 옮긴 뒤로 다시 어긋났다는 피드백에 따라, 값 추측이 아니라 flexbox가 스스로 맞추는 방식으로 바꿨다. QR 안내 문구 "📱 스캔해서 입장"도 제거했다.
- 주요 변경 사항:
  - `.lobby-main`을 `align-items: flex-start` → `stretch`로 바꾸고, QR 카드(`.lobby-code-card--qr-only`)를 `.lobby-main__center` 래퍼에서 꺼내 `TeamCard A / QR / TeamCard B`와 같은 레벨의 flex item으로 만들었다. 셋 다 스스로 가장 큰 높이에 맞춰 늘어나므로, 이후 어느 쪽 내용이 늘어나도(방 이름, 인원수 등) 다시 어긋나지 않는다.
  - "게임 시작" 버튼·오류 배너·안내 문구는 `.lobby-main` 아래 새 `.lobby-actions` 섹션으로 분리했다(기존엔 QR 카드와 같은 열에 있어서 그 열 전체 높이가 늘어나 있었다).
  - 세로/좁은 창에서 QR 카드가 맨 위로 오는 `order: -1` 규칙을 새 위치(`.lobby-code-card--qr-only`)에 맞춰 갱신했다.
  - QR 안내의 "📱 스캔해서 입장" span을 제거했다.
  - "죽은 티라노, 정말 살려드립니다" 서브타이틀(데스크탑 `lobby-header__subtitle`, 모바일 `mobile-join__subtitle` 둘 다)에 산돌 삼립호빵체 Basic(SPC삼립 x 산돌, 상업용 무료, 눈누 배포)을 적용했다.
- API/Socket.IO/Shared 계약 변경: 없음.
- 환경 변수 변경: 없음.
- 검증 결과: `npm run build -w shared`(stale artifact) 후 `npm run typecheck -w frontend`, `npm run test -w frontend`, `npm run build -w frontend` 통과. 폰트 CDN URL은 curl로 200 확인.

## 2026-07-28 - 로비 헤더 로고 여백 미세 조정 (`frontend/lobby-header-spacing-tune` 브랜치)

- 구현 목적: 로고와 서브타이틀이 너무 붙어 있고, 로고와 화면 최상단 사이는 더 좁혀도 된다는 피드백.
- 주요 변경 사항:
  - `.lobby-header` padding-top을 `clamp(16px, 2.4vh, 27px)` → `clamp(10px, 1.6vh, 18px)`로 줄여 로고가 상단에 더 가깝게.
  - `.lobby-header__logo--big`의 `margin-bottom`을 `-45px` → `-25px`로 완화해 로고와 서브타이틀 사이에 살짝 여백을 줌.
- API/Socket.IO/Shared 계약 변경: 없음.
- 환경 변수 변경: 없음.
- 검증 결과: `npm run typecheck -w frontend`, `npm run build -w frontend` 통과.

## 2026-07-28 - 결과 화면: 로고 최상단 이동, 티라노 모델 자리 예약, 실질 통계 상세화 (`frontend/result-screen-stage-placeholders` 브랜치)

- 구현 목적: 향후 팀별 부활 티라노 3D/이미지와 티꾸 완료 티라노(박물관용)를 결과 화면에 넣을 예정이라, 지금은 자리를 예약하고 나머지 레이아웃을 정리했다. 점수 대신 실제 게임 수치(발굴 횟수, 운석 회피, 명중, 시간)를 자세히 보여달라는 요청도 반영했다.
- 주요 변경 사항:
  - "내 티라노를 살려내" 로고를 화면 맨 위(`result-view__top-logo`)로 옮겼다.
  - 팀 패널 위에 `.result-view__stage-row`를 새로 추가 — 팀별 부활 티라노가 들어갈 자리(빨강, 점선 박스, 팀 색상)와 티꾸 완료 티라노가 들어갈 자리(파랑, 점선 박스, 중앙)를 점선 placeholder로 예약했다. 아직 실제 이미지/모델은 없고 자리만 잡아뒀다.
  - 팀 패널을 `text-align`으로 중앙 기준 마주보게(A는 오른쪽 정렬, B는 왼쪽 정렬) 했다.
  - 팀 패널 통계를 "흔든 횟수 · 명중 + 시간 보너스!" 한 줄에서 4줄 목록으로 확장: 발굴 횟수(+팀 내 MVP), 운석 회피 수(팀 인원×SKY_OBJECT_COUNT 대비), 명중 수(+팀 내 MVP), 발굴+조립 시간 합(시간 보너스). 전부 `game:result`가 이미 내려주는 `players[].stats`/`teams[].*Ms`를 그대로 재가공했고 서버 계약은 안 건드렸다.
  - "운석을 피한 수"는 서버에 "회피"와 "보너스 획득"을 구분하는 필드가 따로 없어(둘 다 `stats.dinoCleared` 하나로 집계됨) 그 값을 그대로 썼다 — 정확히는 "회피+보너스 처리 수"에 더 가깝다는 점을 알아둬야 한다.
  - 개인 MVP 이름에 팀 이름과 같은 잘난체 폰트를 적용하고, MVP 박스 배경을 완전한 검정(`rgba(16,21,28,0.85)`)에서 다른 카드들과 같은 톤의 반투명 유리 스타일로 바꿨다.
- API/Socket.IO/Shared 계약 변경: 없음.
- 환경 변수 변경: 없음.
- 검증 결과: `npm run build -w shared`(stale artifact) 후 `npm run typecheck -w frontend`, `npm run test -w frontend`, `npm run build -w frontend` 통과. `npm run autoplay`로 로컬에서 4인 봇 게임을 끝까지 돌려 `game:result` 수신과 새 결과 화면 렌더링 경로에 런타임 예외가 없는지 확인했다. 실제 화면 스크린샷 검증은 브라우저 자동화 도구가 없어 못 했다 — 특히 "운석 회피 수" 라벨의 의미가 실제 데이터와 정확히 일치하는지는 사용자 확인이 필요하다.
## 2026-07-28 - 발굴 HUD 사격 화면형 대칭 레이아웃

- 구현 목적: 발굴 화면의 상단 정보와 기여도 패널을 좌우 팀이 거울처럼 대응하는 사격 화면형 레이아웃으로 통일하고, 3D 공간의 불필요한 A/B 라벨을 제거했다.
- 주요 변경 사항:
  - B팀 상단 HUD는 `점수·뼈·흔들기·인원 | 팀명` 순서로 반전해 A팀의 `팀명 | 인원·흔들기·뼈·점수`와 대칭이 되게 했다.
  - 양 팀 기여도 패널을 사격 점수판과 같은 크기·상단 위치·유리 질감·팀 컬러 상단선으로 통일하고 B팀 내부 행과 막대 방향을 반전했다.
  - 기여도 패널 배경 투명도를 높여 뒤쪽 발굴 장면이 더 잘 보이게 했다.
  - Godot `TeamStage`의 A/B 라벨은 발굴 페이즈에서 숨기고 다른 페이즈에서만 표시한다.
  - 로고가 있는 로비 화면의 상단 여백을 소폭 늘렸다.
- API/Socket.IO/Shared 계약 변경: 없음.
- 환경 변수 변경: 없음.
- 검증 결과: `npm run typecheck`, `npm test`, `npm run build` 통과. 로컬 환경에 Godot CLI가 없어 `npm run build:godot` 웹 내보내기는 실행하지 못했다.
## 2026-07-28 - 페이즈 카운트다운·영점 연습·발굴 표 UI 정리

- 구현 목적: 모든 경기 시작 카운트다운과 시간창의 노출 순서를 통일하고, 영점 연습 및 발굴 기여도 화면을 시연용 레이아웃에 맞춘다.
- 주요 변경 사항:
  - 로비의 큰 로고에 실제 양수 상단 마진을 적용해 화면 최상단과 간격을 확보했다.
  - 운석 피하기를 포함한 모든 페이즈가 같은 전체 화면 5초 카운트다운을 사용하며, 남은 시간 창은 카운트다운 종료 후에만 표시된다.
  - 영점 연습 안내 문구를 과녁판 아래로 이동하고 모바일 연습 카운트는 준비 시간 이후 15초를 표시한다.
  - 발굴 기여도를 사격 점수판처럼 팀 헤더·인원/총 흔들기·플레이어별 흔들기/기여율 표·발굴 뼈 요약 구조로 변경하고 B팀은 좌우 반전했다.
  - 사격 상단의 `부활 에너지 충전` 카드를 제거하고 `활성 코어` 안내에 로고 계열 글꼴을 적용했다.
- API/Socket.IO/Shared 계약 변경: 없음. `CHARGING_PRACTICE_DURATION_MS` 값만 15초로 변경.
- 환경 변수 변경: 없음.
- 검증 결과: `npm run typecheck`, `npm test`(72개), `npm run build`, `git diff --check` 통과.
## 2026-07-28 - 영점 제목 제거 및 발굴 HUD 백엔드 팀명 연동

- 구현 목적: 영점 화면을 과녁 중심으로 단순화하고 발굴 화면의 중복 상단 HUD와 프런트 고정 팀명을 제거한다.
- 주요 변경 사항:
  - 영점 화면의 `영점 조정 연습 중` 제목을 제거하고 과녁·안내·팀 범례만 유지했다.
  - 발굴 페이즈에서는 좌우 팀 상단 바를 렌더링하지 않는다.
  - 발굴 기여도 카드의 팀 이름은 `A팀/B팀` 고정 문자열 대신 서버 `RoomState.teamNames` 값을 사용한다.
- API/Socket.IO/Shared 계약 변경: 없음.
- 환경 변수 변경: 없음.
- 검증 결과: `npm run typecheck`, `npm test`(72개), `npm run build`, `git diff --check` 통과.
