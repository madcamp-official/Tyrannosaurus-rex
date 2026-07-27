# Frontend 변경 이력

## 2026-07-27 - 티라노 게임 구현 및 협업 원칙 문서화

- 구현 목적: 티라노 게임 개발에서 공통으로 지켜야 할 실제 구현 원칙과 Frontend, Backend, Shared, Godot의 책임 및 협업 절차를 명확히 정의했다.
- 주요 변경 사항: mock·dummy·fake 성공 응답 금지, 서버 권위 상태 관리, 오류 처리, 브랜치 소유권, 기능 단위 commit·push, 담당자별 한국어 변경 이력 작성 및 완료 기준을 `implementation_rule.md`에 정리했다.
- API/Socket.IO/Shared 계약 변경: 실제 계약 코드는 변경하지 않았으며, 향후 계약 변경 시 기록하고 공동 검토해야 할 기준을 문서화했다.
- 환경 변수 변경: 실제 환경 변수 key는 변경하지 않았으며, `.env.example`에는 key 목록만 두고 필수 설정 누락 시 명확히 실패하도록 하는 원칙을 문서화했다.
- 검증 결과: 문서 형식과 Git diff whitespace 검사를 완료했다. 실행 코드 변경이 없어 typecheck, test, build는 실행하지 않았다.
