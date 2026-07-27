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
