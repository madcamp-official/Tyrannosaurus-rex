# 🦖 내 티라노사우루스 살려내!!!

> 죽은 티라노, 정말 살려드립니다.
>
> 몰입캠프 26s-w4-c3-01 · 웹 기반 무가입 크로스플랫폼 팀 파티 게임

---

## 0. 문서 목적

이 문서는 웹 기반 크로스플랫폼 팀 파티 게임 **내 티라노사우루스 살려내!!!**의 MVP를 실제 개발 가능한 단위로 정리한 전체 계획서다.

게임 기획, 기술 스택, Godot 3D 연동, 권위 서버, Socket.IO API, 모바일 센서, 화면 구성, Web 배포, 테스트와 7일 개발 순서를 하나의 문서로 연결한다. 구현자는 이 문서를 기준으로 별도의 제품·기술 결정을 내리지 않고 작업을 시작할 수 있어야 한다.

> 핵심 문장: **뼈를 캐고, 맞추고, 에너지를 쏴서 우리 팀의 티라노를 먼저 살려낸다.**

## 0.1 최종 반영 사항

이 계획에는 다음 결정을 최종 반영한다.

- 개인전 없이 A/B 2팀 대전에 집중
- 가입 없이 데스크탑이 방을 만들고 모바일이 QR과 4자리 코드로 입장
- 전체 2~6명, 팀당 최대 3명
- 팀별로 `발굴 → 골격 조립 → 에너지 충전` 단계를 독립 진행
- 흔들기 센서가 동작하지 않는 기기를 위한 발굴 탭 폴백
- 자이로 조준이 불안정한 기기를 위한 터치패드 폴백
- 부활 에너지와 생체 안정도를 분리한 정상·와이라노 판정
- 와이라노가 실패로 즉시 종료되지 않고 정화 사격으로 역전 가능
- 완성한 티라노를 데스크탑 로컬 `티라노박물관`에 저장
- Node.js 서버를 방·페이즈·입력·퍼즐·사격·승패의 유일한 진실 소스로 사용
- React는 Socket.IO 연결, DOM UI, HUD와 Godot 브리지를 담당
- Godot 4 Web Export는 데스크탑 3D 표현만 담당
- React와 Godot은 동일 origin iframe과 `postMessage`/`JavaScriptBridge`로 연결
- Godot은 GDScript, Compatibility Renderer, 싱글 스레드 Web Export 사용
- Socket.IO 이벤트의 payload, acknowledgement, 오류 코드, 빈도 제한 명세
- Zod 기반 런타임 검증과 TypeScript 타입 추론
- Cloudflare Tunnel을 이용한 iOS 센서용 HTTPS 개발 환경

## 0.2 현재 저장소 기준

2026-07-25 현재 저장소에는 계획 문서와 README만 있으며 애플리케이션 구현 코드는 없다.

| 항목 | 현재 상태 |
|---|---|
| npm workspace | 미구현 |
| Node.js/Socket.IO 서버 | 미구현 |
| React 데스크탑·모바일 | 미구현 |
| Godot 프로젝트와 Web Export | 미구현 |
| 3D 모델·애니메이션 | 미구현 |
| 자동 테스트 | 미구현 |
| HTTPS 터널과 배포 설정 | 미구현 |

따라서 이 문서의 일정은 기존 구현을 전제로 하지 않고 프로젝트 초기화부터 시작한다. 이후 실제 구현이 진행되면 이 절에 날짜별 반영 내역과 검증 명령을 누적한다.

## 0.3 구현 원칙

- 게임 결과에 영향을 주는 계산은 서버에서만 수행한다.
- 모바일은 원본 센서 스트림을 보내지 않고 로컬에서 집계·스로틀한다.
- Godot은 소켓에 직접 연결하지 않고 React가 전달한 권위 상태만 렌더링한다.
- 클라이언트 payload의 player/team ID를 신뢰하지 않고 소켓 세션에서 식별한다.
- 고빈도 입력과 저빈도 전체 상태를 별도 이벤트로 나눈다.
- 타입 정의와 런타임 검증 규칙을 중복 작성하지 않는다.
- 임시 구현이라도 fake 성공 처리나 무조건 명중 판정은 만들지 않는다.
- 외부 주소, 포트, 버전과 비밀값은 코드에 하드코딩하지 않는다.
- 센서 권한 거절, WebGL 실패, 네트워크 단절을 정상적인 사용자 경로로 처리한다.
- 에셋 라이선스와 출처가 확인되지 않은 모델·음원은 저장소에 포함하지 않는다.
- MVP 핵심 루프가 완성되기 전에는 후순위 연출과 아이템을 추가하지 않는다.

---

## 1. 서비스 개요

### 1.1 서비스명

- 정식명: **내 티라노사우루스 살려내!!!**
- 부제: **죽은 티라노, 정말 살려드립니다**
- 내부 영문 코드명: `TRex`

### 1.2 서비스 한 줄 설명

데스크탑의 박물관 화면을 보며 각 팀이 스마트폰으로 티라노의 뼈를 발굴하고, 골격을 조립한 뒤, 자이로 레이저로 부활 에너지를 충전해 자기 팀의 티라노를 먼저 살려내는 게임이다.

### 1.3 서비스 목표

- 설명을 길게 듣지 않아도 흔들기·드래그·조준·탭으로 바로 참여할 수 있다.
- 개인 스마트폰과 하나의 큰 화면을 결합해 같은 공간에서 함께 노는 경험을 만든다.
- 세 단계의 입력 방식을 사용해 한 가지 미니게임의 반복감을 줄인다.
- 팀원이 동시에 기여하되 서버 권위 구조로 결과의 공정성을 유지한다.
- 정상 부활·와이라노와 같은 게임 결과 자체가 기억에 남도록 만든다.

### 1.4 전체 사용자 흐름

```text
방 입장
  → 팀 편성
  → 뼈 발굴
  → 골격 퍼즐
  → 부활 에너지 사격
  → 티라노 또는 와이라노 탄생
  → 결과·티꾸
  → 티라노박물관
```

### 1.5 MVP 핵심 가치

- 스마트폰을 직접 흔드는 몸동작
- 팀원과 역할을 나누는 협동
- 큰 화면에서 함께 맞추는 티라노 골격 퍼즐
- 움직이는 골격을 자이로로 조준하는 사격
- 충전 품질에 따라 달라지는 부활 결과
- 완성한 티라노를 꾸미고 박물관에 전시하는 보상

---

## 2. 제품 철학과 게임 규칙

### 2.1 제품 철학

#### 함께 움직이는 파티 게임

모바일은 작은 게임 화면이 아니라 플레이어의 손에 들린 도구다. 모든 사람이 고개를 들어 데스크탑을 보게 하고, 스마트폰에는 지금 필요한 조작만 표시한다.

#### 실패도 콘텐츠가 되는 결과

에너지 품질이 부족하면 단순 패배 문구 대신 "와이라노"가 탄생한다. 결과 화면에는 완성된 티라노 대신 포효하는 티라노 사진에 "와이라노..." 말풍선이 달린 레퍼런스 이미지를 띄워 실패도 웃음 포인트가 되게 하고, 정화 기회를 주어 역전할 수 있게 한다.

#### 경쟁보다 협동이 먼저 보이는 구조

팀 간에는 속도를 경쟁하지만 팀 안에서는 발굴, 퍼즐 조립, 에너지 주입을 함께 수행한다. 개인 점수는 결과 통계로만 보여주고 팀 승리를 우선한다.

#### 시연 안정성이 기능보다 우선

흔들기에는 탭, 자이로에는 터치패드, Godot에는 2D 안전 화면을 둔다. 특정 센서나 WebGL 기능이 실패해도 전체 게임은 끝까지 진행할 수 있어야 한다.

### 2.2 기본 규칙

| 항목 | 규칙 |
|---|---|
| 게임 모드 | 2팀 대전 |
| 참가 인원 | 2~10명 |
| 팀 구성 | A/B팀 자동 균형 배정 |
| 권장 인원 | 4~6명 |
| 입장 방식 | 4자리 방 코드와 QR |
| 회원가입 | 없음 |
| 라운드 제한 시간 | 총 5분 |
| 승리 조건 | 건강한 티라노를 먼저 부활시킨 팀 |

팀 인원이 홀수이면 먼저 입장한 팀부터 한 명씩 교대 배정한다. 팀별 목표량은 인원수에 맞춰 보정하여 인원이 적은 팀이 구조적으로 불리하지 않게 한다.

### 2.3 라운드 구성

#### 1단계 — 뼈 발굴

- 폰을 흔들어서 흙을 판다.
- 팀이 필요한 모든 뼈를 모으면 다음 단계로 넘어간다.
- 발굴 중 돌, 일반 화석, 황금 뼈가 확률적으로 등장한다.

#### 2단계 — 골격 조립 퍼즐

- 발굴한 뼈를 알맞은 실루엣 위치에 배치한다.
- 모바일 화면에서 뼈를 선택하고 드래그하여 데스크탑 골격에 맞춘다.
- 잘못 배치하면 짧은 페널티가 발생한다.
- 모든 뼈를 맞추면 골격이 완성된다.

#### 3단계 — 부활 에너지 사격

- 완성된 스켈레톤 티라노가 팀 영역 안에서 계속 움직인다.
- 스마트폰 자이로 또는 터치패드로 조준한다.
- 화면을 탭해 에너지파를 발사한다.
- 정확한 부위에 에너지를 주입해 부활 게이지와 안정도를 높인다.

#### 부활 판정

- 제한 시간내로 부활 게이지 100%를 먼저 충족한 팀이 승리한다.
- 제한 시간 내로 부활 게이지의 100%를 다 채우지 못한 팀에는 와이라노가 탄생한다.

### 2.4 MVP 범위

#### 반드시 구현

- QR 방 생성과 모바일 입장
- A/B팀 자동 균형 배정과 준비 상태
- 탭·흔들기 기반 뼈 발굴
- 9개 뼈의 협동 조립 퍼즐
- 자이로·터치패드 조준과 탭 발사
- 서버 권위 히트 판정
- 정상·와이라노·정화 상태
- 승패·개인 통계·재경기
- 티라노 이름 및 티꾸 투표
- 최근 20마리 로컬 박물관
- Godot Web 3D 장면과 React 브리지
- 센서·WebGL·네트워크 실패 UI
- 진행 중 재접속과 자리 복구
- 6명 초과 대기열과 관전

#### 후순위

- 사용자 지정 팀 이름
- 추가 공룡과 발굴 지역
- 방해 아이템
- 온라인 계정과 박물관 클라우드 동기화
- 공개 박물관 공유 링크
- 관리자 페이지와 장기 운영 통계

---

## 3. 승리·실패·동점 처리

### 정상 승리

- 누가 더 땅을 빨리 팠는지
- 누가 더 퍼즐을 빨리 맞췄는지
- 누가 더 티라노를 빨리 살려냈는지

이 3가지 조건에 따라 시간 보너스를 주어서, 최종적으로 총합이 높은 팀/개인이 이기도록 한다. 

### 와이라노

제한 시간 내로 부활 게이지의 100%를 다 채우지 못한 팀에는 와이라노가 탄생한다. "와이라노"는 사투리 "왜 이러노"(왜 이래?)와 "티라노"를 합친 이름으로, 완성된 스켈레톤 대신 포효하는 티라노 사진에 "와이라노..." 말풍선이 달린 레퍼런스 이미지를 결과 화면에 띄운다.

---

## 4. 팀별 게임 밸런스

### 목표량 보정

| 요소 | 계산 |
|---|---|
| 팀 발굴력 | 모든 팀원의 유효 발굴 입력 합 |
| 뼈 발견 목표 | 팀 인원과 무관하게 핵심 뼈 9종 |
| 뼈 발견 확률 | 팀의 누적 유효 발굴량을 기준으로 계산 |
| 퍼즐 | 팀당 동일한 9개 조각 |
| 부활 에너지 | 팀원 데미지 합산 |

팀 인원이 많은 경우 입력량 우위를 제한하기 위해 팀 전체 발굴 인정량과 에너지 발사량에 상한을 둔다. 서버는 최근 1초의 팀 입력량에 완만한 효율 감소를 적용한다.

### 권장 초기 수치

| 항목 | 초기값 |
|---|---:|
| 핵심 뼈 | 9개 |
| 뼈 1개 발견에 필요한 발굴 포인트 | 60 |
| 흔들기 쿨다운 | 200ms |
| 모바일 입력 전송 주기 | 100ms |
| 퍼즐 오답 페널티 | 해당 조각 2초 잠금 |
| 사격 제한 시간 | 90초 |
| 발사 쿨다운 | 350ms |
| 조준 전송 빈도 | 최대 30Hz |
| 일반 명중 에너지 | 4 |
| 핵심 부위 명중 에너지 | 7 |
| 잘못된 부위 명중 안정도 | -3 |
| 핵심 부위 명중 안정도 | +2 |

모든 밸런스 값은 `shared` 상수로 관리하여 실기기 테스트 중 쉽게 조정한다.

---

## 5. 화면 구성

### 5.1 데스크탑

#### 로비

- 게임 로고와 부제
- 4자리 방 코드와 QR
- 참가자 명단과 팀 배정
- 팀 이름과 팀 색상
- 게임 시작 버튼
- 음소거와 전체화면 버튼

#### 발굴 화면

- 좌우 A/B팀 분할 화면
- 팀별 지층 단면
- 발견한 뼈 컬렉션
- 다음 뼈까지의 발굴 게이지
- 팀원별 발굴 기여도
- 돌과 화석 발견 이펙트

#### 퍼즐 화면

- 좌우 팀별 티라노 실루엣
- 아직 배치하지 않은 뼈 트레이
- 현재 선택된 팀원과 조각
- 정답·오답 피드백
- 팀별 조립 진행률

#### 에너지 사격 화면

- 좌우 팀별 스켈레톤 티라노
- 계속 위치가 바뀌는 골격
- 플레이어 색상의 크로스헤어
- 부활 에너지와 생체 안정도
- 남은 시간
- 와이라노 위험 경고

#### 결과 화면

- 탄생한 정상 또는 와이라노
- 우승 팀
- 발굴·퍼즐·사격 통계
- 티라노 이름
- 티꾸 결과
- 티라노박물관 이동 버튼

### 5.2 모바일

모바일은 현재 페이즈에 필요한 컨트롤만 표시한다.

| 페이즈 | 모바일 컨트롤 |
|---|---|
| 로비 | 닉네임, 팀 표시, 준비 상태 |
| 발굴 | 센서 권한, 흔들기 상태, 큰 발굴 버튼 |
| 퍼즐 | 뼈 선택, 드래그 패드, 회전 버튼, 배치 버튼 |
| 사격 | 캘리브레이션, 조준 패드, 발사 버튼, 모드 전환 |
| 결과 | 개인 통계, 티꾸 아이템 투표 |

---

## 6. 상세 게임 플레이

### 6.1 뼈 발굴

#### 입력 처리

- 센서 활성화는 사용자 탭 안에서 권한을 요청한다.
- 가속도 벡터가 임계값을 넘고 200ms 쿨다운이 지났을 때 흔들기 1회로 센다.
- 센서 미지원·권한 거절 기기에는 큰 발굴 버튼을 제공한다.
- 모바일은 100ms 동안 누적한 횟수만 서버로 전송한다.
- 서버는 플레이어 및 팀 단위 입력 속도를 제한한다.

#### 뼈 획득

발굴 포인트가 60 증가할 때마다 팀에 아직 없는 핵심 뼈 한 개를 지급한다.

```text
두개골
턱뼈
척추
골반
왼쪽/오른쪽 앞다리
왼쪽/오른쪽 뒷다리
왼쪽/오른쪽 갈비뼈
꼬리 앞부분
꼬리 뒷부분
```

발견 순서는 라운드마다 섞되 양 팀이 동일한 순서를 사용한다.

#### 발굴 이벤트

- 돌: 다음 3초간 팀 발굴 효율 20% 감소
- 일반 화석: 결과 통계에 수집품으로 기록
- 황금 뼈: 다음 핵심 뼈 요구 포인트 20 감소

발굴 이벤트는 시드 기반으로 생성해 양 팀에 같은 기회가 주어지도록 한다.

### 6.2 골격 퍼즐

#### 조작

1. 모바일에서 배치할 뼈를 선택한다.
2. 드래그 패드로 데스크탑의 뼈를 이동한다.
3. 회전 버튼으로 15도씩 회전한다.
4. 실루엣 위에서 배치 버튼을 누른다.
5. 서버가 위치와 각도 오차를 판정한다.

#### 협동 규칙

- 팀마다 동시에 움직일 수 있는 조각은 최대 2개다.
- 한 조각은 한 플레이어만 조작권을 가질 수 있다.
- 5초간 입력이 없으면 조작권이 자동 해제된다.
- 다른 팀원은 잠기지 않은 조각을 선택해 병렬로 맞출 수 있다.

#### 정답 판정

- 기준 위치와의 거리가 조각 크기의 12% 이내
- 기준 각도와의 차이가 15도 이내
- 두 조건을 모두 만족하면 조각을 고정한다.
- 오답이면 조각이 트레이로 돌아가고 2초 동안 잠긴다.

### 6.3 부활 에너지 사격

#### 티라노 움직임

- 서버가 각 팀 티라노의 기준 위치와 방향을 10Hz로 갱신한다.
- 티라노는 팀 화면 안에서 좌우 이동하고 간헐적으로 자세를 바꾼다.
- 클라이언트는 서버 위치 사이를 보간한다.
- 양 팀은 동일한 이동 패턴 시드를 사용한다.

#### 조준

- 자이로 모드에서는 화면 중앙을 겨눈 뒤 현재 자세를 영점으로 저장한다.
- 상대 회전량을 정규화된 크로스헤어 좌표로 변환한다.
- 저역 통과 필터와 감도를 적용한다.
- 화면 방향이 바뀌면 재캘리브레이션한다.
- 터치패드 모드는 드래그 변화량으로 크로스헤어를 이동한다.
- 사용자는 게임 중 언제든 두 모드를 전환할 수 있다.

#### 판정 부위

| 부위 | 효과 |
|---|---|
| 심장 코어 | 에너지 +7, 안정도 +2 |
| 두개골 코어 | 에너지 +7, 안정도 +2 |
| 척추 코어 | 에너지 +7, 안정도 +2 |
| 일반 뼈 | 에너지 +4 |
| 관절 바깥 | 에너지 +2, 안정도 -3 |
| 완전 빗나감 | 변화 없음 |

핵심 코어는 일정 시간마다 다른 뼈로 이동하여 한곳만 연타할 수 없게 한다.

#### 서버 판정

- 발사 요청은 고유 ID를 포함한다.
- 서버는 최신 권위 크로스헤어와 티라노 히트박스를 사용한다.
- 클라이언트가 보낸 명중 여부나 점수는 신뢰하지 않는다.
- 중복 요청과 쿨다운 중 발사를 거부한다.
- 한 팀이 정상 부활 조건을 충족하면 입력을 잠그고 결과를 확정한다.

---

## 7. 티꾸

`티꾸`는 부활한 티라노를 팀원들이 함께 꾸미는 짧은 보상 단계다.

### 방식

- 결과 화면에서 20초 동안 진행한다.
- 각 플레이어는 모바일에서 원하는 아이템에 투표한다.
- 카테고리별 최다 득표 아이템을 티라노에 적용한다.
- 동률이면 먼저 과반에 도달한 아이템, 과반이 없으면 서버가 후보 중 무작위 선택한다.

### MVP 아이템

| 카테고리 | 아이템 |
|---|---|
| 모자 | 왕관, 탐험가 모자, 리본 |
| 안경 | 선글라스, 하트 안경, 단안경 |
| 목 장식 | 나비넥타이, 목걸이, 스카프 |
| 배경 | 정글, 화산, 박물관 |

와이라노 결과에서는 티꾸 대신 결과 화면에 와이라노 레퍼런스 이미지를 표시한다. 정화에 성공해 정상 부활로 전환되면 그때부터 티꾸를 정상 진행한다.

---

## 8. 티라노박물관

티라노박물관은 현재 브라우저에서 완성한 티라노를 전시하는 컬렉션 화면이다.

### 전시 정보

- 티라노 이름
- 정상 또는 와이라노 상태
- 팀 이름과 팀원
- 완성 시각
- 발굴 시간
- 퍼즐 완료 시간
- 명중률
- 적용한 티꾸 아이템
- 발견한 일반 화석

### 저장 방식

- 회원가입과 데이터베이스가 없는 MVP에서는 데스크탑 브라우저의 `localStorage`에 저장한다.
- 최근 20마리까지만 보관한다.
- 같은 데스크탑 브라우저에서만 다시 볼 수 있다.
- 저장 데이터가 손상되면 해당 항목을 건너뛰고 나머지 전시를 유지한다.
- 브라우저 데이터 삭제 시 박물관도 초기화된다.

---

## 9. 기술 스택

### 9.1 전체 스택

| 영역 | 기술 | 선택 이유 |
|---|---|---|
| 공통 웹 클라이언트 | React, TypeScript, Vite | 로비·HUD·모바일 UI를 빠르게 개발하고 타입을 공유하기 좋음 |
| 데스크탑 3D | Godot 4, GDScript, Compatibility Renderer | 골격 조립, 티라노 애니메이션, 파티클과 3D 박물관 표현 |
| 실시간 통신 | Socket.IO | 방 단위 브로드캐스트, 자동 재연결, acknowledgement 지원 |
| 게임 서버 | Node.js, TypeScript | 클라이언트와 이벤트 타입을 공유하며 권위 판정 수행 |
| 공통 계약 | TypeScript 패키지 | 이벤트 payload, 상태, 상수, 오류 코드를 한곳에서 관리 |
| 모바일 입력 | DeviceMotion, DeviceOrientation, Pointer Events | 흔들기, 자이로 조준, 터치패드 폴백 |
| QR | `qrcode` 패키지 | HTTPS 참가 URL을 QR로 생성 |
| 로컬 컬렉션 | `localStorage` + 버전이 있는 JSON | 가입·DB 없이 박물관 기록 유지 |
| 테스트 | Vitest, Socket.IO Client, Playwright | 로직, 다중 소켓, 브라우저 흐름을 계층별 검증 |
| HTTPS 공개 | Cloudflare Tunnel | iOS 센서에 필요한 보안 컨텍스트 제공 |

### 9.2 Godot Web 설정

Godot은 데스크탑 브라우저에서 실행되는 WebAssembly/WebGL 빌드로 사용한다. 모바일 컨트롤러에는 Godot을 내려받지 않는다.

- Godot 4의 Web Export는 C#을 지원하지 않으므로 스크립트는 GDScript로 작성한다.
- 렌더러는 Web에서 지원되는 `Compatibility` 모드로 고정한다.
- 대상 브라우저는 WebAssembly와 WebGL 2.0을 지원해야 한다.
- MVP는 `Use Threads`를 끈 싱글 스레드 Web Export를 사용한다.
- 싱글 스레드를 선택하면 `SharedArrayBuffer`용 COOP/COEP 헤더와 cross-origin isolation 설정을 피할 수 있어 터널 및 임베딩 구성이 단순해진다.
- 오디오는 첫 사용자 클릭 이후 시작하고 Web Export의 저지연 샘플 재생 방식을 사용한다.
- Godot Web 결과물의 `.wasm`은 `application/wasm`, `.pck`은 `application/octet-stream` MIME으로 제공한다.
- 배포 시 `.wasm`, `.pck`을 압축하되 파일명은 export 결과 그대로 유지한다.

관련 기준은 Godot 공식 문서의 [Web Export](https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html), [JavaScriptBridge](https://docs.godotengine.org/en/stable/tutorials/platform/web/javascript_bridge.html), [Custom HTML Shell](https://docs.godotengine.org/en/stable/tutorials/platform/web/customizing_html5_shell.html)을 따른다.

---

## 10. 전체 시스템 아키텍처

### 10.1 한눈에 보는 구조

```text
┌──────────────────── 데스크탑 브라우저 ────────────────────┐
│                                                            │
│  React                                                     │
│  ├─ 방/Socket.IO 연결                                      │
│  ├─ QR, HUD, 타이머, 결과, 박물관 UI                       │
│  └─ GodotBridge                                            │
│          │  window.postMessage(JSON)                       │
│          ▼                                                 │
│  <iframe src="/godot/index.html">                          │
│  └─ Godot Web                                              │
│     ├─ 발굴 지층과 뼈                                      │
│     ├─ 3D 골격 퍼즐                                        │
│     ├─ 티라노 이동·레이저·부활 연출                        │
│     └─ 3D 박물관                                           │
└───────────────┬────────────────────────────────────────────┘
                │ Socket.IO
                ▼
┌──────────────── Node.js 권위 서버 ────────────────────────┐
│ 방·팀·페이즈·입력 제한·퍼즐 스냅·사격 판정·승패 계산       │
└───────────────▲────────────────────────────────────────────┘
                │ Socket.IO
┌───────────────┴──── 모바일 브라우저 × 2~6 ────────────────┐
│ React UI + 흔들기 센서 + 자이로 + 터치패드 + 발사 버튼     │
└────────────────────────────────────────────────────────────┘
```

### 10.2 책임 분리

#### Node.js 서버가 결정하는 것

- 누가 어느 방과 팀에 속하는지
- 현재 팀별 페이즈와 제한 시간
- 유효한 발굴 횟수와 뼈 획득
- 퍼즐 조각의 소유권, 위치, 각도와 스냅 성공
- 크로스헤어 좌표와 발사 쿨다운
- 티라노 위치, 히트박스, 명중 부위
- 에너지, 안정도, 와이라노·정화 상태와 최종 승리

#### React가 담당하는 것

- Socket.IO 연결은 React 애플리케이션에 하나만 둔다.
- 서버 상태를 로비·HUD·모바일 컨트롤에 표시한다.
- 데스크탑에서 받은 서버 상태를 Godot 렌더 명령으로 변환한다.
- Godot 로딩률, 오류, 준비 상태를 관리한다.
- 결과를 `localStorage`에 저장하고 박물관 목록을 관리한다.

#### Godot이 담당하는 것

- 전달받은 권위 상태를 3D 장면으로 표현한다.
- 10Hz 위치 상태 사이를 프레임 단위로 보간한다.
- 뼈 이동·스냅, 레이저, 파티클, 부활 시네마틱을 재생한다.
- 애니메이션 완료와 로딩 상태만 React에 돌려준다.
- 점수·판정·승패를 직접 계산하거나 Socket.IO에 직접 연결하지 않는다.

이 분리로 Godot의 화면과 React HUD가 달라져도 실제 게임 결과는 서버 상태 하나를 기준으로 복구할 수 있다.

### 10.3 프로젝트 구조

```text
Tyrannosaurus-rex/
├─ package.json
├─ PLAN.md
├─ shared/
│  └─ src/
│     ├─ domain.ts
│     ├─ events.ts
│     ├─ render-protocol.ts
│     └─ constants.ts
├─ server/
│  ├─ src/
│  │  ├─ rooms/
│  │  ├─ game/
│  │  ├─ validation/
│  │  └─ index.ts
│  └─ test/
├─ client/
│  ├─ public/
│  │  └─ godot/                 # export 결과물, 직접 수정 금지
│  ├─ src/
│  │  ├─ desktop/
│  │  ├─ mobile/
│  │  ├─ museum/
│  │  ├─ godot/GodotBridge.ts
│  │  ├─ socket.ts
│  │  └─ main.tsx
│  └─ vite.config.ts
└─ desktop-godot/
   ├─ project.godot
   ├─ export_presets.cfg
   ├─ scenes/
   ├─ scripts/
   ├─ shaders/
   ├─ assets/
   └─ web/
      └─ shell.html
```

`desktop-godot/`은 원본 프로젝트이고 `client/public/godot/`은 빌드 산출물이다. 원본 에셋이나 GDScript를 `client/public`에서 직접 수정하지 않는다.

### 10.4 라우트와 포트

| 주소 | 역할 |
|---|---|
| `/` | 데스크탑 공유 화면 |
| `/join/:code` | 모바일 입장 및 컨트롤러 |
| `/museum` | 티라노박물관 |
| `/godot/index.html` | React가 임베드하는 Godot Web 빌드 |
| `/socket.io` | Vite가 Node 서버로 프록시 |

개발 환경:

```text
Vite/React/Godot 정적 파일 :5173
Node.js/Socket.IO          :3001
Cloudflare Tunnel          → :5173
```

외부에서는 HTTPS origin 하나만 보이므로 QR, 센서 권한, iframe, Socket.IO가 모두 같은 origin을 사용한다.

### 10.5 빌드와 실행

```bash
# 전체 의존성 설치
npm install

# Node 서버와 Vite 실행
npm run dev

# Godot Web Export(desktop-godot/) 후 client/public/godot에 복사
npm run build:godot

# Godot을 포함한 전체 프로덕션 빌드
npm run build

# 타입, 테스트, 6명 부하 시뮬레이션
npm run typecheck
npm test
npm run simulate -- --players 6

# 개발 서버를 HTTPS 터널로 공개
npm run dev:tunnel
```

`build:godot`은 Godot CLI의 headless export를 호출한다.

```bash
godot --headless --path desktop-godot --export-release Web ../client/public/godot/index.html
```

CI에서는 Godot 버전을 고정하고 `client/public/godot/index.wasm`, `.pck`, `.js`, `.html`이 모두 생성되었는지 검사한다. 개발 중에는 GDScript나 3D 에셋을 변경했을 때만 Godot을 다시 export하며 React·서버 변경에는 기존 export를 재사용한다.

---

## 11. React와 Godot 연결 설계

### 11.1 연결 방식을 `iframe + postMessage`로 고정

React는 `<iframe src="/godot/index.html">`로 Godot Web 빌드를 실행한다. 같은 origin의 부모 React 페이지와 자식 Godot 페이지가 `window.postMessage()`로 JSON 메시지를 교환한다.

이 방식을 선택하는 이유:

- Godot이 생성한 HTML·WASM·PCK 로딩 흐름을 그대로 유지할 수 있다.
- React의 DOM과 Godot의 canvas 생명주기를 분리할 수 있다.
- 페이지 전환이나 React 재렌더가 Godot canvas를 직접 훼손하지 않는다.
- 브리지 메시지를 기록해 Godot 없이도 React 통합 테스트가 가능하다.

### 11.2 초기화 순서

```text
1. React가 Socket.IO에 연결하고 방을 생성
2. React가 Godot iframe을 렌더링
3. Godot Web이 WASM/PCK와 Main 장면을 로드
4. GDScript가 JavaScriptBridge로 window.trexGodotReceive 등록
5. Godot → React: GODOT_READY 전송
6. React → Godot: INIT 및 최신 전체 스냅샷 전송
7. 이후 서버 이벤트를 순서 번호와 함께 Godot에 전달
```

Godot 준비 전에 도착한 렌더 메시지는 React가 최신 스냅샷 하나로 합쳐 보관한다. `GODOT_READY` 이후 스냅샷을 한 번 전송하고 실시간 이벤트를 이어서 보낸다.

### 11.3 브리지 메시지 형식

모든 메시지는 다음 공통 봉투를 사용한다.

```ts
type BridgeEnvelope<TType extends string, TPayload> = {
  source: "trex-react" | "trex-godot";
  version: 1;
  type: TType;
  roomCode?: string;
  sequence: number;
  payload: TPayload;
};
```

React → Godot:

| 타입 | payload | Godot 동작 |
|---|---|---|
| `INIT` | 팀 색상, 에셋 버전, 화면 설정 | 장면 초기화 |
| `PHASE_CHANGED` | 팀별 페이즈, 시작·종료 시각 | 장면 전환 |
| `FULL_SNAPSHOT` | 두 팀의 전체 렌더 상태 | 화면 강제 동기화 |
| `BONE_DISCOVERED` | 팀, 뼈 ID, 발견 위치 | 발굴·획득 연출 |
| `PUZZLE_STATE` | 조각별 위치·각도·고정 상태 | 3D 뼈 변환 갱신 |
| `CROSSHAIRS` | 플레이어별 색상과 좌표 | 크로스헤어 표시 |
| `TREX_TRANSFORM` | 팀별 위치, 회전, pose ID | 티라노 보간 |
| `ENERGY_HIT` | 팀, 부위, 에너지, 안정도 | 레이저·피격 파티클 |
| `REVIVAL_RESULT` | 정상·와이라노·정화 결과 | 시네마틱 재생 |
| `DECORATION_STATE` | 적용 아이템과 색상 | 3D 액세서리 교체 |
| `MUSEUM_ENTRIES` | 전시 티라노 목록 | 박물관 배치 |

Godot → React:

| 타입 | 용도 |
|---|---|
| `GODOT_LOADING` | 현재/전체 바이트를 React 로딩 UI에 표시 |
| `GODOT_READY` | 브리지 등록과 Main 장면 준비 완료 |
| `SCENE_READY` | 특정 페이즈 장면 준비 완료 |
| `ANIMATION_FINISHED` | 발견·부활 연출 종료 알림 |
| `GODOT_ERROR` | 에셋·장면·브리지 오류 |
| `PERFORMANCE_SAMPLE` | FPS와 draw call 진단값 |

Godot의 `ANIMATION_FINISHED`는 화면 연출용 신호다. 서버 페이즈 전환을 승인하는 조건으로 사용하지 않으며, 서버 타이머가 게임 진행을 결정한다.

### 11.4 브리지 구현 모양

Godot의 GDScript는 `JavaScriptBridge.create_callback()`으로 JavaScript가 호출할 콜백을 등록한다.

```gdscript
var receive_callback: JavaScriptObject

func _ready() -> void:
    receive_callback = JavaScriptBridge.create_callback(_on_web_message)
    var window = JavaScriptBridge.get_interface("window")
    window.trexGodotReceive = receive_callback
    _send_to_react("GODOT_READY", {})

func _on_web_message(args: Array) -> void:
    var json_text: String = args[0]
    var message = JSON.parse_string(json_text)
    RenderRouter.route(message)
```

Godot의 custom HTML shell은 부모 메시지를 받아 위 콜백으로 전달한다.

```js
window.addEventListener("message", (event) => {
  if (event.origin !== window.location.origin) return;
  if (event.data?.source !== "trex-react") return;
  window.trexGodotReceive?.(JSON.stringify(event.data));
});
```

React의 `GodotBridge`는 iframe으로 명령을 보낸다.

```ts
iframe.contentWindow?.postMessage(
  {
    source: "trex-react",
    version: 1,
    type: "FULL_SNAPSHOT",
    sequence: nextSequence(),
    payload: snapshot,
  },
  window.location.origin,
);
```

Godot → React도 custom shell에서 `window.parent.postMessage(message, location.origin)`을 사용한다. 양쪽 모두 `origin`, `source`, `version`, `type`, payload 스키마를 검증한다.

### 11.5 동기화와 오류 복구

- 모든 브리지 메시지에 증가하는 `sequence`를 넣고 이전 순서 메시지는 무시한다.
- React는 5초마다 또는 페이즈 변경 때 `FULL_SNAPSHOT`을 보낸다.
- Godot이 `GODOT_READY`를 15초 안에 보내지 않으면 재시도 버튼과 2D 안전 화면을 표시한다.
- iframe이 다시 로드되면 React가 최신 스냅샷을 재전송한다.
- Godot 오류가 발생해도 서버와 모바일 게임 상태는 계속 유지한다.
- 개발 모드에서는 최근 브리지 메시지 100개를 진단 패널에 기록한다.

---

## 12. Godot 3D 구현 상세

### 12.1 장면 구조

```text
Main.tscn
├─ WorldEnvironment
├─ CameraRig
├─ RenderRouter
├─ SceneContainer
│  ├─ LobbyMuseum.tscn
│  ├─ ExcavationArena.tscn
│  ├─ AssemblyArena.tscn
│  ├─ ChargingArena.tscn
│  ├─ RevivalCinematic.tscn
│  └─ MuseumGallery.tscn
├─ EffectsPool
└─ DebugOverlay
```

각 Arena에는 `TeamAViewport`와 `TeamBViewport`를 두지 않고, 하나의 3D 월드 안에 좌우 팀 무대를 배치한다. 카메라 한 대가 두 무대를 함께 잡아 WebGL 렌더 타깃과 draw call을 줄인다.

### 12.2 발굴 장면

- 지층은 저해상도 메시와 반복 텍스처로 표현한다.
- 팀 발굴 진행도에 따라 지면 메시를 실제로 파괴하지 않고 깊이 마스크와 뼈 위치를 이동한다.
- 뼈 발견 시 미리 로드한 뼈 장면을 오브젝트 풀에서 꺼내 상승 애니메이션을 재생한다.
- 흙 파편은 GPU 파티클 수를 제한하고 모바일이 아닌 데스크탑에서만 렌더링한다.
- 이미 구현된 사안이 있으면, 추가로 구현하지 않고 구현된 내용을 따른다. 

### 12.3 골격 퍼즐 장면

- 뼈 9개는 각각 독립 `Node3D`와 고유 `boneId`를 갖는다.
- 서버 좌표 `x/y ∈ [0,1]`을 팀 퍼즐 평면의 로컬 X/Y 좌표로 변환한다.
- 서버 각도는 뼈의 Z축 회전에 적용한다.
- 고정된 조각은 target transform으로 200ms 보간하고 발광 효과를 재생한다.
- Godot 물리 충돌로 정답을 판정하지 않는다. 정답 transform 메타데이터는 서버에도 동일한 숫자로 제공한다.

### 12.4 스켈레톤 티라노

- `Skeleton3D` 리그는 정상 부활 경로에서만 사용한다. 와이라노 판정은 3D 리그 대신 결과 화면의 레퍼런스 이미지로 대체한다.
- 발굴한 9개 게임 조각과 시각용 세부 뼈를 분리한다.
- 퍼즐 완료 시 조각 오브젝트를 리그 위치로 흡수하는 연출 후 완성 리그로 전환한다.
- 이동은 `idle`, `walk`, `roar`, `hit`, `revive` AnimationTree 상태로 관리한다.
- 서버의 `poseId`, 위치, 회전을 목표값으로 받고 Godot이 부드럽게 보간한다.

### 12.5 레이저와 히트 표현

- 크로스헤어는 Godot의 2D CanvasLayer에서 팀 화면 기준 좌표로 표시한다.
- 발사 판정 후 서버가 `ENERGY_HIT`를 보낼 때만 레이저와 피격 효과를 재생한다.
- 레이저는 카메라 방향에서 서버 판정 부위의 미리 정의된 소켓까지 그린다.
- 빗나감은 화면 밖 소실점으로 레이저를 그린다.
- 파티클과 데미지 숫자는 오브젝트 풀을 사용해 반복 생성 비용을 줄인다.

### 12.6 정상 부활과 와이라노

- 정상 부활: 뼈 발광 → 조직 생성 셰이더 → 피부 메시 표시 → 포효
- 와이라노: 3D 부활 연출 대신 결과 화면에 포효하는 티라노 사진과 "와이라노..." 말풍선이 있는 레퍼런스 이미지를 띄운다.
- 조직 생성은 실제 메시 생성이 아니라 dissolve 셰이더의 threshold 애니메이션으로 표현한다.
- 정화 성공 시 와이라노 이미지를 내리고 정상 부활 연출로 전환한다.
- 결과에 영향을 주는 시점은 서버 이벤트이며 시네마틱 길이는 승패 판정과 분리한다.

### 12.7 티꾸와 박물관

- 모자·안경·목 장식은 리그의 `HeadSocket`, `FaceSocket`, `NeckSocket`에 부착한다.
- 아이템은 `DecorationCatalog` 리소스에서 ID, 장면 경로, 소켓, 위치 보정을 관리한다.
- 박물관은 저장된 `MuseumTyranno` 데이터를 받아 전시대별 모델과 장식을 생성한다.
- 최근 20마리를 모두 고해상도 렌더하지 않고 카메라 주변 전시만 활성화한다.

### 12.8 3D 에셋 규격

| 항목 | 규칙 |
|---|---|
| 원본 포맷 | Blender `.blend` 또는 작업 원본 |
| 런타임 포맷 | glTF 2.0 `.glb` |
| 축·단위 | Y-up, 1 Godot unit = 1m |
| 티라노 폴리곤 | 전체 50k triangles 이하 |
| 뼈 조각 | 조각당 5k triangles 이하 |
| 텍스처 | 기본 2048, 장식 1024 이하 |
| 머티리얼 | Compatibility Renderer에서 검증 |
| 애니메이션 | 하나의 공통 Skeleton3D 리그 |
| 충돌 | 렌더 메시와 분리한 단순 박스·캡슐 메타데이터 |

Normal, roughness, metallic 텍스처는 가능한 한 ORM 패킹을 사용하고, 투명 머티리얼과 실시간 그림자 수를 최소화한다.

### 12.9 성능 목표

- 시연 데스크탑 기준 1920×1080에서 평균 60 FPS, 최저 30 FPS
- 초기 Godot Web 다운로드 압축 기준 30MB 이하
- 첫 로딩 15초 이내를 목표로 하고 진행률을 React UI에 표시
- 동시 파티클 300개 이하
- 실시간 그림자 광원 1개
- 프레임 저하 시 파티클, 그림자, 후처리 순으로 자동 품질 저하

---

## 13. 게임 상태와 데이터 모델

### 상태 머신

```ts
type RoomPhase =
  | "LOBBY"
  | "PLAYING"
  | "RESULT"
  | "DECORATION";

type TeamPhase =
  | "EXCAVATION"
  | "ASSEMBLY"
  | "CHARGING"
  | "PURIFICATION"
  | "REVIVED";
```

방 전체는 `LOBBY → PLAYING → RESULT → DECORATION`으로 진행하지만, 플레이 중에는 양 팀이 서로 다른 `TeamPhase`에 있을 수 있다.

```text
Room:  LOBBY → PLAYING ─────────────────────→ RESULT → DECORATION

Team A:        EXCAVATION → ASSEMBLY → CHARGING → REVIVED
Team B:        EXCAVATION ───────→ ASSEMBLY → CHARGING
                                          └→ PURIFICATION
                                                ├→ REVIVED
                                                └→ CHARGING
```

한 팀이 `REVIVED`에 먼저 도달하면 서버가 방 전체를 `RESULT`로 전환하고 상대 팀의 입력을 잠근다.

### 주요 타입

#### `Player`

- ID, 닉네임, 팀, 색상
- 연결 상태와 센서 상태
- 발굴 기여도
- 현재 퍼즐 조각
- 크로스헤어 좌표
- 발사·명중·핵심 명중 통계

#### `TeamState`

- 팀 ID와 팀원
- 현재 `TeamPhase`와 단계 종료 시각
- 발견한 뼈와 발굴 포인트
- 퍼즐 조각별 위치·각도·고정 여부
- 부활 에너지와 안정도
- 정상·와이라노·정화 상태
- 단계별 완료 시각

#### `RoomState`

- 방 코드와 호스트
- 현재 `RoomPhase`
- 두 팀 상태
- 라운드 시드
- 단계 타이머
- 최종 결과

#### `MuseumTyranno`

- 고유 ID와 이름
- 완성 상태
- 팀 및 통계
- 티꾸 설정
- 화석 컬렉션
- 생성 시각과 데이터 버전

---

## 14. API 설계 원칙

### 14.1 통신 경계

```text
모바일 React ─┐
              ├─ Socket.IO ─→ Node.js 권위 서버
데스크탑 React ┘

데스크탑 React ── postMessage ── Godot Web iframe

브라우저/운영 도구 ── HTTP GET ── 상태 확인 API
```

- 게임 중 양방향 실시간 통신은 Socket.IO만 사용한다.
- REST API는 서버 상태 확인과 빌드 정보 확인에만 사용한다.
- Godot은 Node 서버와 직접 통신하지 않는다.
- 모든 시간은 Unix epoch millisecond인 `number`로 전송한다.
- 모든 좌표는 별도 언급이 없으면 `0~1` 정규화 좌표다.
- 게임 상태를 바꾸는 요청은 acknowledgement를 반환한다.
- 고빈도 좌표 이벤트는 acknowledgement 없이 보내고 서버가 범위·속도를 검증한다.
- 클라이언트가 보내는 ID는 UUID v4, 서버가 발급하는 ID는 opaque string으로 취급한다.

### 14.2 공통 타입

```ts
type RoomCode = string;       // 정규식: ^[0-9]{4}$
type PlayerId = string;
type SocketId = string;
type RequestId = string;      // UUID v4
type BoneId =
  | "SKULL"
  | "JAW"
  | "SPINE"
  | "PELVIS"
  | "ARMS"
  | "LEGS"
  | "RIBS"
  | "TAIL_FRONT"
  | "TAIL_REAR";

type TeamId = "A" | "B";
type SensorPermission = "UNKNOWN" | "GRANTED" | "DENIED" | "UNSUPPORTED";
type AimMode = "GYRO" | "TOUCHPAD";
type RevivalForm = "NONE" | "NORMAL" | "YRANNO";

type NormalizedPoint = {
  x: number; // 0 <= x <= 1
  y: number; // 0 <= y <= 1
};

type Transform2D = NormalizedPoint & {
  rotationDeg: number; // -180 <= rotationDeg <= 180
};

type ErrorCode =
  | "INVALID_PAYLOAD"
  | "CLIENT_VERSION_UNSUPPORTED"
  | "ROOM_NOT_FOUND"
  | "ROOM_FULL"
  | "ROOM_ALREADY_STARTED"
  | "NICKNAME_INVALID"
  | "NICKNAME_TAKEN"
  | "HOST_ONLY"
  | "PLAYER_NOT_JOINED"
  | "WRONG_ROOM_PHASE"
  | "WRONG_TEAM_PHASE"
  | "TEAM_ELIMINATED"
  | "RATE_LIMITED"
  | "DUPLICATE_REQUEST"
  | "BONE_NOT_AVAILABLE"
  | "PIECE_ALREADY_CLAIMED"
  | "PIECE_CLAIM_EXPIRED"
  | "SHOT_COOLDOWN"
  | "SERVER_ERROR";
```

### 14.3 acknowledgement

```ts
type ApiError = {
  code: ErrorCode;
  message: string;
  retryable: boolean;
  details?: Record<string, unknown>;
};

type Ack<T> =
  | {
      ok: true;
      requestId: RequestId;
      serverTime: number;
      data: T;
    }
  | {
      ok: false;
      requestId: RequestId;
      serverTime: number;
      error: ApiError;
    };
```

같은 소켓에서 동일한 `requestId`가 다시 들어오면 서버는 로직을 재실행하지 않고 최근 acknowledgement를 다시 반환한다. 캐시는 소켓별 최근 100개 또는 5분 중 먼저 도달하는 조건까지 유지한다.

### 14.4 오류 코드

| 코드 | 의미 | 재시도 |
|---|---|---|
| `INVALID_PAYLOAD` | 스키마 또는 값 범위 오류 | 수정 후 가능 |
| `CLIENT_VERSION_UNSUPPORTED` | 서버와 호환되지 않는 클라이언트 major 버전 | 업데이트 후 가능 |
| `ROOM_NOT_FOUND` | 방 코드가 존재하지 않음 | 불가 |
| `ROOM_FULL` | 최대 6명 도달 | 나중에 가능 |
| `ROOM_ALREADY_STARTED` | 이미 게임 진행 중 | 불가 |
| `NICKNAME_INVALID` | 닉네임 길이·문자 규칙 위반 | 수정 후 가능 |
| `NICKNAME_TAKEN` | 방 안에서 닉네임 중복 | 수정 후 가능 |
| `HOST_ONLY` | 데스크탑 호스트 전용 요청 | 불가 |
| `PLAYER_NOT_JOINED` | 입장하지 않은 모바일 요청 | 입장 후 가능 |
| `WRONG_ROOM_PHASE` | 현재 방 페이즈에서 불가능 | 페이즈 변경 후 가능 |
| `WRONG_TEAM_PHASE` | 현재 팀 페이즈에서 불가능 | 페이즈 변경 후 가능 |
| `TEAM_ELIMINATED` | 입력이 잠긴 팀의 요청 | 불가 |
| `RATE_LIMITED` | 허용 빈도 초과 | 잠시 후 가능 |
| `DUPLICATE_REQUEST` | 이미 처리된 일회성 요청 | 불가 |
| `BONE_NOT_AVAILABLE` | 획득하지 않았거나 고정된 조각 | 불가 |
| `PIECE_ALREADY_CLAIMED` | 다른 팀원이 조작 중 | 잠시 후 가능 |
| `PIECE_CLAIM_EXPIRED` | 조작권 만료 | 다시 획득 가능 |
| `SHOT_COOLDOWN` | 발사 쿨다운 중 | 잠시 후 가능 |
| `SERVER_ERROR` | 예상하지 못한 서버 오류 | 가능 |

---

## 15. 권위 상태 스키마

### 15.1 플레이어

```ts
type PublicPlayer = {
  id: PlayerId;
  nickname: string;
  teamId: TeamId;
  color: string;              // CSS hex: #RRGGBB
  connected: boolean;
  ready: boolean;
  aimMode: AimMode;
  motionPermission: SensorPermission;
  orientationPermission: SensorPermission;
  stats: {
    excavationInputs: number;
    puzzleCorrect: number;
    puzzleWrong: number;
    shots: number;
    hits: number;
    coreHits: number;
    energyContributed: number;
  };
};
```

### 15.2 퍼즐 조각

```ts
type PuzzlePieceState = {
  boneId: BoneId;
  discovered: boolean;
  fixed: boolean;
  transform: Transform2D;
  claimedBy: PlayerId | null;
  claimToken: string | null;       // 해당 플레이어에게만 별도 전달
  claimExpiresAt: number | null;
  lockedUntil: number | null;
};
```

전체 `room:state`에서는 다른 플레이어의 `claimToken`을 반드시 `null`로 마스킹한다. 조작권을 획득한 플레이어에게만 acknowledgement로 실제 token을 준다.

### 15.3 팀 상태

```ts
type TeamState = {
  id: TeamId;
  phase: TeamPhase;
  phaseStartedAt: number;
  phaseEndsAt: number | null;
  playerIds: PlayerId[];
  excavation: {
    points: number;
    nextBoneAt: number;
    discoveredBoneIds: BoneId[];
    fossils: number;
    efficiencyMultiplier: number;
    debuffEndsAt: number | null;
  };
  puzzle: {
    pieces: PuzzlePieceState[];
    fixedCount: number;
    completedAt: number | null;
  };
  charging: {
    energy: number;            // 0~100
    stability: number;         // 0~100
    activeCore: "HEART" | "SKULL" | "SPINE";
    coreChangesAt: number;
    form: RevivalForm;
    purificationEndsAt: number | null;
  };
};
```

### 15.4 방 상태

```ts
type RoomState = {
  schemaVersion: 1;
  revision: number;
  roomCode: RoomCode;
  roomPhase: RoomPhase;
  createdAt: number;
  roundStartedAt: number | null;
  roundEndsAt: number | null;
  hostConnected: boolean;
  players: PublicPlayer[];
  teams: Record<TeamId, TeamState>;
  winner: {
    teamId: TeamId | null;
    reason:
      | "NORMAL_REVIVAL"
      | "OPPONENT_DISCONNECTED"
      | "TIME_LIMIT"
      | "DRAW"
      | null;
  };
};
```

`revision`은 상태가 바뀔 때마다 서버에서 1씩 증가한다. 클라이언트는 더 낮은 revision의 스냅샷을 무시한다.

---

## 16. Socket.IO 연결 명세

### 16.1 namespace와 room

- namespace는 기본 `/` 하나를 사용한다.
- Socket.IO 내부 room 이름은 `room:{roomCode}`다.
- 데스크탑 호스트는 `host:{roomCode}`에도 참가한다.
- 모바일은 `team:{roomCode}:{teamId}`에도 참가한다.
- Socket.IO room 이름은 서버 내부 구현이며 클라이언트 API에 노출하지 않는다.

### 16.2 연결 handshake

데스크탑:

```ts
io(origin, {
  auth: {
    role: "HOST",
    clientVersion: "1.0.0",
  },
});
```

모바일:

```ts
io(origin, {
  auth: {
    role: "PLAYER",
    roomCode: "1234",
    clientVersion: "1.0.0",
  },
});
```

handshake는 역할과 클라이언트 버전만 확인한다. 모바일의 실제 플레이어 등록은 반드시 `room:join` 성공 이후 완료한다. 서버와 호환되지 않는 major 버전은 연결을 거절하고 `connect_error`의 `data.code`를 `CLIENT_VERSION_UNSUPPORTED`로 설정한다.

### 16.3 클라이언트 → 서버 이벤트 요약

| 이벤트 | 발신자 | acknowledgement | 최대 빈도 |
|---|---|---:|---:|
| `room:create` | 데스크탑 | 필수 | 연결당 1회 |
| `room:join` | 모바일 | 필수 | 초당 2회 |
| `player:setReady` | 모바일 | 필수 | 초당 2회 |
| `game:start` | 데스크탑 | 필수 | 초당 1회 |
| `excavate:input` | 모바일 | 없음 | 10Hz |
| `puzzle:claim` | 모바일 | 필수 | 초당 3회 |
| `puzzle:move` | 모바일 | 없음 | 20Hz |
| `puzzle:place` | 모바일 | 필수 | 초당 3회 |
| `aim:update` | 모바일 | 없음 | 30Hz |
| `energy:fire` | 모바일 | 필수 | 쿨다운 350ms |
| `sensor:status` | 모바일 | 필수 | 상태 변경 시 |
| `decoration:vote` | 모바일 | 필수 | 카테고리당 변경 5회 |
| `name:vote` | 모바일 | 필수 | 변경 5회 |
| `game:rematch` | 데스크탑 | 필수 | 초당 1회 |
| `room:requestState` | 양쪽 | 필수 | 5초당 1회 |

---

## 17. 클라이언트 → 서버 상세 명세

### 17.1 `room:create`

방을 생성하고 호출 소켓을 데스크탑 호스트로 등록한다.

```ts
type RoomCreateRequest = {
  requestId: RequestId;
  settings: {
    maxPlayers: 2 | 3 | 4 | 5 | 6;
    roundDurationSec: 300;
    language: "ko";
  };
};

type RoomCreateResponse = {
  roomCode: RoomCode;
  joinUrl: string;
  state: RoomState;
};
```

검증:

- `role === "HOST"`인 소켓만 호출 가능
- 같은 소켓이 이미 방을 가지고 있으면 기존 방 정보를 반환
- 코드 충돌 시 최대 20회 재생성 후 `SERVER_ERROR`

### 17.2 `room:join`

```ts
type RoomJoinRequest = {
  requestId: RequestId;
  roomCode: RoomCode;
  nickname: string;
};

type RoomJoinResponse = {
  playerId: PlayerId;
  teamId: TeamId;
  color: string;
  state: RoomState;
};
```

검증:

- 닉네임은 trim 후 1~8자
- 제어문자와 `<`, `>` 금지
- 대소문자와 앞뒤 공백을 무시해 중복 검사
- `LOBBY` 상태에서만 입장 가능
- 팀 인원 차이가 최소가 되도록 자동 배정

### 17.3 `player:setReady`

```ts
type PlayerSetReadyRequest = {
  requestId: RequestId;
  ready: boolean;
};

type PlayerSetReadyResponse = {
  playerId: PlayerId;
  ready: boolean;
};
```

2명 이상 입장하고 모든 연결된 플레이어가 준비 상태일 때만 호스트의 `game:start`를 허용한다.

### 17.4 `game:start`

```ts
type GameStartRequest = {
  requestId: RequestId;
};

type GameStartResponse = {
  roundStartedAt: number;
  roundEndsAt: number;
  seed: string;
  state: RoomState;
};
```

서버 처리 순서:

1. 호스트, 방 페이즈, 인원, 준비 상태 검증
2. 라운드 seed 생성
3. 팀 상태 초기화
4. `RoomPhase`를 `PLAYING`으로 변경
5. 두 팀 `TeamPhase`를 `EXCAVATION`으로 설정
6. `room:state`와 `room:phaseChanged` 브로드캐스트

### 17.5 `excavate:input`

```ts
type ExcavateInput = {
  seq: number;
  count: number;               // 정수 0~5
  sourceCounts: {
    motion: number;            // 정수 0~5
    tap: number;               // 정수 0~5
  };
  clientTime: number;
};
```

처리:

- acknowledgement를 기다리지 않는 10Hz 이벤트
- 플레이어별 마지막 `seq` 이하 입력은 무시
- `count !== motion + tap`이면 무시하고 진단 로그 기록
- 1초 슬라이딩 윈도우에서 플레이어당 최대 12회 인정
- 팀 전체 효율 감소를 적용한 뒤 발굴 포인트 증가
- 뼈 획득 시 `excavation:boneFound`를 브로드캐스트

### 17.6 `puzzle:claim`

```ts
type PuzzleClaimRequest = {
  requestId: RequestId;
  boneId: BoneId;
};

type PuzzleClaimResponse = {
  boneId: BoneId;
  claimToken: string;
  expiresAt: number;           // now + 5000ms
  transform: Transform2D;
};
```

고정·잠금·미발견 조각은 claim할 수 없다. 같은 팀의 동시 claim은 서버 수신 순서로 한 명만 성공한다.

### 17.7 `puzzle:move`

```ts
type PuzzleMoveInput = {
  seq: number;
  boneId: BoneId;
  claimToken: string;
  transform: Transform2D;
  clientTime: number;
};
```

처리:

- 최대 20Hz
- 유효한 claim의 만료 시간을 매 입력마다 5초 뒤로 연장
- 이동 속도를 초당 화면 너비 1.5 이하, 회전을 초당 360도 이하로 제한
- 검증된 transform을 팀과 데스크탑에 `puzzle:pieceMoved`로 전송

### 17.8 `puzzle:place`

```ts
type PuzzlePlaceRequest = {
  requestId: RequestId;
  boneId: BoneId;
  claimToken: string;
  transform: Transform2D;
};

type PuzzlePlaceResponse = {
  boneId: BoneId;
  correct: boolean;
  fixedTransform?: Transform2D;
  lockedUntil?: number;
  teamPhase: TeamPhase;
};
```

서버는 목표점과의 거리 및 각도 오차를 계산한다. 정답이면 target transform으로 고정하고, 오답이면 claim을 해제한 뒤 2초 잠근다.

### 17.9 `aim:update`

```ts
type AimUpdateInput = {
  seq: number;
  point: NormalizedPoint;
  mode: AimMode;
  calibrated: boolean;
  clientTime: number;
};
```

- 최대 30Hz
- 좌표 범위를 clamp하지 않고 잘못된 payload 전체를 거부
- 서버가 마지막 유효 좌표와 수신 시각을 보관
- 500ms 이상 새 좌표가 없으면 해당 크로스헤어를 비활성 상태로 표시

### 17.10 `energy:fire`

```ts
type EnergyFireRequest = {
  requestId: RequestId;
  shotId: string;              // UUID v4
  clientTime: number;
};

type EnergyFireResponse = {
  shotId: string;
  accepted: boolean;
  hit: boolean;
  hitZone: "HEART" | "SKULL" | "SPINE" | "BONE" | "JOINT_OUTSIDE" | null;
  energyDelta: number;
  stabilityDelta: number;
  energyAfter: number;
  stabilityAfter: number;
  teamPhaseAfter: TeamPhase;
};
```

판정:

- 서버에 저장된 최신 조준 좌표를 사용
- 조준 좌표가 500ms보다 오래되었으면 `INVALID_PAYLOAD`
- `shotId` 중복과 350ms 쿨다운 검사
- 서버의 현재 티라노 transform과 단순 히트박스 사용
- 결과를 `energy:shotResolved`로 방 전체에 전송

### 17.11 `sensor:status`

```ts
type SensorStatusRequest = {
  requestId: RequestId;
  motion: SensorPermission;
  orientation: SensorPermission;
  aimMode: AimMode;
  calibrated: boolean;
};
```

서버는 센서 상태를 게임 판정에 사용하지 않고 로비와 진단 UI에만 표시한다.

### 17.12 `decoration:vote`

```ts
type DecorationCategory = "HAT" | "GLASSES" | "NECK" | "BACKGROUND";

type DecorationVoteRequest = {
  requestId: RequestId;
  category: DecorationCategory;
  itemId: string;
};

type DecorationVoteResponse = {
  category: DecorationCategory;
  counts: Record<string, number>;
  selectedItemId: string | null;
  votingEndsAt: number;
};
```

item ID는 서버의 허용 목록에 있어야 한다. 투표 종료 후 최다 득표를 선택하고 동점 규칙을 적용한다.

### 17.13 `name:vote`

```ts
type NameVoteRequest = {
  requestId: RequestId;
  candidateId: string;
};

type NameVoteResponse = {
  counts: Record<string, number>;
  selectedName: string | null;
  votingEndsAt: number;
};
```

서버가 제공한 후보 ID만 허용하며 사용자가 임의 문자열을 제출하지 못하게 한다.

### 17.14 `game:rematch`

```ts
type GameRematchRequest = {
  requestId: RequestId;
};

type GameRematchResponse = {
  state: RoomState;
};
```

호스트만 호출할 수 있다. 팀, 닉네임, 색상은 유지하고 준비 상태와 게임 통계는 초기화한다.

### 17.15 `room:requestState`

```ts
type RoomRequestStateRequest = {
  requestId: RequestId;
  knownRevision: number;
};

type RoomRequestStateResponse =
  | { changed: false; revision: number }
  | { changed: true; state: RoomState };
```

---

## 18. 서버 → 클라이언트 상세 명세

모든 서버 push 이벤트에는 공통 메타데이터를 포함한다.

```ts
type ServerEvent<T> = {
  eventId: string;
  serverTime: number;
  roomCode: RoomCode;
  revision: number;
  data: T;
};
```

| 이벤트 | data | 대상 |
|---|---|---|
| `room:state` | `RoomState` | 방 전체 |
| `room:playerJoined` | `PublicPlayer` | 방 전체 |
| `room:playerConnectionChanged` | player ID, 연결 여부 | 방 전체 |
| `room:phaseChanged` | 이전·현재 RoomPhase, 종료 시각 | 방 전체 |
| `team:phaseChanged` | 팀, 이전·현재 TeamPhase, 종료 시각 | 방 전체 |
| `excavation:progress` | 팀, points, nextBoneAt, 효율 | 방 전체 |
| `excavation:boneFound` | 팀, boneId, 발견 index | 방 전체 |
| `excavation:eventTriggered` | 팀, 이벤트 종류, 종료 시각 | 방 전체 |
| `puzzle:claimChanged` | 팀, boneId, claimedBy, expiresAt | 해당 팀·데스크탑 |
| `puzzle:pieceMoved` | 팀, boneId, transform, player ID | 해당 팀·데스크탑 |
| `puzzle:piecePlaced` | 팀, boneId, 정답 여부, 상태 | 방 전체 |
| `aim:playerMoved` | player ID, 팀, point, active | 데스크탑 |
| `trex:transform` | 팀, transform, pose ID | 데스크탑 |
| `energy:shotResolved` | 발사자, 팀, 명중 결과, 게이지 | 방 전체 |
| `energy:coreChanged` | 팀, 이전·현재 코어, 다음 변경 시각 | 방 전체 |
| `revival:formChanged` | 팀, form, 에너지, 안정도 | 방 전체 |
| `revival:purificationStarted` | 팀, 종료 시각 | 방 전체 |
| `game:result` | 승자, 이유, 팀·개인 통계 | 방 전체 |
| `decoration:voteUpdated` | 카테고리, counts | 방 전체 |
| `decoration:completed` | 선택 아이템 전체 | 방 전체 |
| `name:voteUpdated` | 후보와 counts | 방 전체 |
| `room:closed` | reason | 방 전체 |
| `room:error` | `ApiError` | 해당 소켓 |

### 주요 push payload

```ts
type TrexTransformEvent = {
  teamId: TeamId;
  position: NormalizedPoint;
  rotationDeg: number;
  facing: "LEFT" | "RIGHT";
  poseId: "IDLE" | "WALK" | "ROAR" | "HIT" | "REVIVE";
  effectiveAt: number;
};

type ShotResolvedEvent = EnergyFireResponse & {
  playerId: PlayerId;
  teamId: TeamId;
  aimPoint: NormalizedPoint;
  hitPoint: NormalizedPoint | null;
};

type GameResultEvent = {
  winnerTeamId: TeamId | null;
  reason: RoomState["winner"]["reason"];
  finishedAt: number;
  teams: Array<{
    teamId: TeamId;
    form: RevivalForm;
    energy: number;
    stability: number;
    excavationMs: number | null;
    assemblyMs: number | null;
    chargingMs: number | null;
  }>;
  players: PublicPlayer[];
};
```

---

## 19. HTTP 운영 API

게임 생성·입장에는 HTTP API를 사용하지 않는다. 다음 읽기 전용 endpoint만 제공한다.

### `GET /api/health`

프로세스가 요청을 받을 수 있는지 확인한다.

```json
{
  "status": "ok",
  "time": 1784880000000,
  "uptimeSec": 1234
}
```

응답: 정상 `200`, 종료 준비 중 `503`

### `GET /api/ready`

서버 초기화와 필수 설정 검증 완료 여부를 확인한다.

```json
{
  "ready": true,
  "checks": {
    "socket": "ok",
    "config": "ok"
  }
}
```

응답: 준비 완료 `200`, 준비 전 `503`

### `GET /api/version`

```json
{
  "appVersion": "1.0.0",
  "apiVersion": 1,
  "gitCommit": "abcdef1",
  "godotAssetVersion": "2026.07.24.1"
}
```

### 공통 HTTP 오류

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Endpoint not found",
    "requestId": "server-generated-id"
  }
}
```

---

## 20. API 검증·보안·관찰성

### payload 검증

- Socket.IO payload와 HTTP 응답 타입은 `shared`에서 정의한다.
- 서버 런타임 검증에는 Zod 스키마를 사용한다.
- TypeScript 타입은 Zod 스키마에서 추론하여 타입과 런타임 규칙의 불일치를 막는다.
- 알 수 없는 필드는 제거하지 않고 `INVALID_PAYLOAD`로 거절한다.
- 닉네임은 HTML로 삽입하지 않고 React text node로 렌더링한다.

### 속도 제한

- 소켓별 token bucket을 사용한다.
- 고빈도 이벤트는 이벤트별 bucket을 분리한다.
- 한도를 넘긴 좌표 이벤트는 조용히 버리고 진단 카운터만 올린다.
- 상태 변경 요청은 `RATE_LIMITED` acknowledgement를 반환한다.
- 10초 동안 지속적으로 한도를 5배 초과하면 해당 소켓을 연결 해제한다.

### 권한

- host 전용: `game:start`, `game:rematch`
- player 전용: 발굴, 퍼즐, 조준, 사격, 투표
- 모든 요청은 `socket.data.roomCode`, `socket.data.playerId`, 현재 페이즈를 서버에서 확인한다.
- 클라이언트 payload에 player ID나 team ID를 받지 않고 소켓 세션에서 결정한다.

### 로그

구조화 JSON 로그에 다음 필드를 사용한다.

```ts
type LogContext = {
  requestId?: string;
  eventName?: string;
  roomCode?: string;
  playerId?: string;
  socketId?: string;
  durationMs?: number;
  errorCode?: string;
};
```

닉네임, 센서 원본 값, 전체 IP는 로그에 저장하지 않는다. IP가 필요하면 마지막 octet을 제거한 값만 일시적으로 사용한다.

### 측정 지표

- 현재 방·소켓·플레이어 수
- 이벤트별 수신량과 거부량
- acknowledgement 처리 시간 p50/p95
- 브로드캐스트 크기
- 발굴·퍼즐·사격 단계 평균 시간
- Godot 준비 시간과 오류 수
- 서버 event loop lag

---

## 21. 연결 처리

- 데스크탑이 연결 해제되면 방을 폐쇄한다.
- 모바일 연결 해제 시 플레이어 자리는 현재 라운드가 끝날 때까지 유지한다.
- 진행 중인 방에는 신규 플레이어가 들어올 수 없다.
- 연결 해제된 플레이어가 잡고 있던 퍼즐 조작권은 즉시 해제한다.
- 한 팀의 모든 플레이어가 연결 해제되면 상대 팀의 승리로 종료한다.
- MVP에서는 새로고침 후 자리 복구를 지원하지 않는다.
- 재경기 시 팀과 색상은 유지하고 게임 데이터만 초기화한다.

---

## 22. 인프라와 환경 변수

### 22.1 개발·시연 인프라

```text
Internet / Mobile
       │ HTTPS
       ▼
Cloudflare Tunnel
       │
       ▼
Vite :5173
├─ React 정적·개발 리소스
├─ /godot/* Web Export
├─ /socket.io → Node :3001 proxy
└─ /api/*      → Node :3001 proxy
```

개발 중에는 Vite가 React와 Godot 정적 파일을 제공한다. Socket.IO와 운영 HTTP API는 Node.js 서버로 프록시한다. 외부 스마트폰에는 HTTPS origin 하나만 노출한다.

### 22.2 Vite 프록시 정책

```ts
server: {
  host: "0.0.0.0",
  port: 5173,
  proxy: {
    "/socket.io": {
      target: "http://127.0.0.1:3001",
      ws: true,
    },
    "/api": {
      target: "http://127.0.0.1:3001",
    },
  },
}
```

### 22.3 정적 파일 정책

- `.wasm`은 `application/wasm`으로 제공한다.
- `.pck`은 `application/octet-stream`으로 제공한다.
- 버전이 붙은 Godot `.wasm`, `.pck`, `.js`는 장기 캐시할 수 있다.
- `index.html`과 버전 manifest는 `no-cache`로 제공한다.
- Godot asset version이 바뀌면 iframe URL에 `?v=<assetVersion>`을 붙인다.
- Web Export 파일은 Brotli 또는 gzip 압축을 사용한다.

### 22.4 공통 환경 변수

| 변수 | 필수 | 예시 | 용도 |
|---|---:|---|---|
| `NODE_ENV` | O | `development` | 실행 환경 |
| `SERVER_PORT` | O | `3001` | Node 서버 포트 |
| `CLIENT_ORIGIN` | O | `https://example.trycloudflare.com` | CORS·Socket.IO 허용 origin |
| `PUBLIC_JOIN_ORIGIN` | O | 동일 HTTPS 주소 | QR 참가 URL 생성 |
| `APP_VERSION` | O | `0.1.0` | 서버·클라이언트 버전 |
| `API_VERSION` | O | `1` | Socket/HTTP 계약 버전 |
| `GODOT_ASSET_VERSION` | O | `2026.07.25.1` | iframe·정적 에셋 캐시 무효화 |
| `LOG_LEVEL` | O | `info` | 구조화 로그 수준 |
| `ROOM_IDLE_TTL_MS` | O | `1800000` | 로비 유휴 방 만료 |
| `ROUND_DURATION_MS` | O | `300000` | 라운드 전체 제한 |

### 22.5 클라이언트 공개 환경 변수

| 변수 | 예시 | 용도 |
|---|---|---|
| `VITE_SOCKET_PATH` | `/socket.io` | Socket.IO 경로 |
| `VITE_API_VERSION` | `1` | 클라이언트 계약 버전 |
| `VITE_GODOT_ENTRY` | `/godot/index.html` | Godot iframe 진입점 |
| `VITE_GODOT_ASSET_VERSION` | `2026.07.25.1` | 캐시 버전 |
| `VITE_ENABLE_DEBUG_PANEL` | `true` | 센서·브리지 진단 패널 |

`VITE_*` 값은 브라우저에 공개된다. 비밀키나 인증 토큰을 넣지 않는다.

### 22.6 `.env` 관리

```text
.env.example             # 변수명과 안전한 기본값, Git 포함
.env                     # 로컬 공통값, Git 제외
.env.development.local   # 개인 개발값, Git 제외
.env.production          # 운영 서버에서 별도 주입, Git 제외
```

- 서버 시작 시 Zod로 환경 변수를 검증하고 누락 시 즉시 종료한다.
- Cloudflare Tunnel 임시 URL이 바뀌면 `CLIENT_ORIGIN`과 `PUBLIC_JOIN_ORIGIN`을 함께 갱신한다.
- 비밀값을 브라우저 코드, QR, 로그와 Git에 기록하지 않는다.
- MVP는 DB와 외부 유료 API가 없으므로 별도 secret이 필요하지 않다.

### 22.7 운영 빌드 순서

```bash
npm ci
npm run typecheck
npm test
npm run build:godot
npm run build
npm run start
```

배포 후 다음 순서로 확인한다.

```bash
curl -I https://<origin>/
curl -I https://<origin>/godot/index.html
curl -I https://<origin>/godot/index.wasm
curl -I https://<origin>/api/health
curl -I https://<origin>/api/version
```

---

## 23. 개발 단계별 계획

### Day 1 — 기반과 QR 로비

#### 목표

모노레포, 실시간 연결, HTTPS 실기기 입장과 React–Godot 최소 브리지를 완성한다.

#### 작업 항목

- npm workspaces, TypeScript, React/Vite, Socket.IO 구성
- 공유 Zod 스키마, TypeScript 타입, 오류 코드, 이벤트 맵 작성
- acknowledgement 래퍼와 request ID 멱등성 캐시
- 방 생성, QR 입장, 팀 자동 배정과 준비 상태
- 데스크탑·모바일 로비
- Cloudflare Tunnel HTTPS 구성
- 2~6명 시뮬레이션 클라이언트
- Godot 4 Compatibility 프로젝트와 Web Export preset
- 빈 Godot Web 빌드를 React iframe에 임베드
- `GODOT_READY`와 `FULL_SNAPSHOT` 브리지 왕복

#### 산출물

- 실행 가능한 `shared`, `server`, `client`, `godot` 패키지
- QR 로비 화면과 모바일 입장 화면
- 방 생성·입장 Socket.IO 계약 테스트
- Godot 빈 3D 장면과 브리지 진단 패널

#### 완료 기준

- `npm run dev` 한 번으로 서버와 클라이언트가 실행된다.
- 실기기 2대가 HTTPS QR로 입장하고 같은 팀 상태를 본다.
- React 명령으로 iframe 속 Godot 장면 상태를 변경한다.
- 가짜 플레이어 6명이 입장해도 방 상태가 일치한다.

### Day 2 — 뼈 발굴

#### 목표

모든 지원 기기에서 팀 발굴을 수행하고 9종 뼈 획득까지 진행한다.

#### 작업 항목

- 탭과 흔들기 입력
- iOS 센서 권한 요청과 거절·미지원 UI
- 100ms 입력 집계와 서버 속도 제한
- `excavate:input` sequence와 token bucket
- 9종 뼈 획득과 공정한 이벤트 seed
- 팀별 발굴 화면과 개인 기여도
- 돌·화석·황금 뼈 이벤트
- Godot 발굴 무대, 지층과 뼈 오브젝트 풀
- `BONE_DISCOVERED` 브리지 연출

#### 산출물

- 모바일 발굴 컨트롤러
- 서버 발굴 도메인 로직과 단위 테스트
- Godot 발굴 장면
- 센서 진단 화면

#### 완료 기준

- iOS와 Android에서 탭 발굴이 동작한다.
- 지원 기기에서 흔들기 입력이 중복 폭주 없이 반영된다.
- 양 팀이 9개 뼈를 모두 모으면 각자 퍼즐 단계에 진입한다.
- 비정상 입력과 제한 초과 입력은 점수에 반영되지 않는다.

### Day 3 — 골격 퍼즐

#### 목표

팀원이 서로 다른 3D 뼈를 동시에 조작하고 서버 판정으로 골격을 완성한다.

#### 작업 항목

- 뼈 트레이와 티라노 실루엣
- 조각 선택·이동·회전·배치
- claim token 발급·마스킹·만료
- 조각별 단일 조작권과 5초 타임아웃
- 위치·각도 정답 판정과 오답 잠금
- 9개 3D 뼈와 Skeleton3D target transform
- `PUZZLE_STATE`의 이동·회전·스냅 표현

#### 산출물

- 퍼즐 모바일 컨트롤
- 퍼즐 조작권·스냅 서버 모듈
- 9개 뼈 메타데이터
- Godot Assembly 장면

#### 완료 기준

- 같은 조각을 동시에 요청한 두 플레이어 중 한 명만 조작권을 얻는다.
- 연결 해제 또는 입력 중단 시 조작권이 자동 해제된다.
- 서버 정답 조각이 Godot 목표 위치로 정확히 스냅된다.
- 9개 조각 고정 후 해당 팀만 사격 단계에 진입한다.

### Day 4 — 자이로와 터치패드 조준

#### 목표

자이로 지원 여부와 관계없이 모든 기기에서 안정적으로 조준한다.

#### 작업 항목

- 자이로 권한과 영점 캘리브레이션
- 상대 회전량 변환, 필터와 감도
- 터치패드 폴백
- 30Hz 좌표 스로틀과 sequence
- 500ms 이상 오래된 좌표 무효화
- Godot CanvasLayer 크로스헤어
- 서버 티라노 transform 10Hz 수신과 보간
- WebGL 성능과 초기 다운로드 측정

#### 산출물

- 공통 조준 좌표 파이프라인
- 모바일 모드 전환 UI
- 다중 크로스헤어 Godot UI
- 기기별 센서 검증표

#### 완료 기준

- 모든 실기기에서 터치패드 조준이 가능하다.
- 지원 기기에서 중앙 캘리브레이션 후 주요 화면 영역을 조준한다.
- 화면 회전 시 재캘리브레이션을 요구한다.
- 6명 30Hz 입력에서도 서버와 데스크탑이 안정적으로 동작한다.

### Day 5 — 에너지 사격과 부활

#### 목표

서버 권위 사격 판정부터 정상·와이라노·정화 결과까지 핵심 승패 루프를 완성한다.

#### 작업 항목

- 스켈레톤 티라노 이동과 pose
- 핵심·일반·관절 히트박스
- shot ID 멱등성, 350ms 발사 쿨다운
- 에너지와 안정도
- 핵심 코어 이동
- 정상 부활·와이라노와 10초 정화
- 시간 종료와 동점 규칙
- Godot 레이저·피격·부활 시네마틱과 와이라노 결과 이미지
- AnimationTree와 dissolve 셰이더
- 서버 결과와 연출 완료 분리

#### 산출물

- 사격·히트·부활 서버 모듈
- Charging/Purification Godot 장면
- 에너지 HUD와 모바일 발사 컨트롤
- 상태 전환 자동 테스트

#### 완료 기준

- 정상 부활, 와이라노 탄생, 정화 성공·실패를 각각 재현한다.
- 같은 shot ID가 점수를 두 번 변경하지 않는다.
- 서버 판정 결과와 Godot 시각 효과가 일치한다.
- 먼저 정상 부활한 팀만 한 번 승리 처리된다.

### Day 6 — 결과, 티꾸와 박물관

#### 목표

한 판의 결과를 보상 콘텐츠로 연결하고 재경기까지 전체 흐름을 닫는다.

#### 작업 항목

- 팀·개인 통계와 결과 화면
- 티라노 이름 후보와 투표
- 티꾸 카테고리 투표
- 정상 부활 장식 외형과 와이라노 결과 이미지 노출
- `localStorage` 박물관과 schema version
- 재경기 초기화
- `/api/health`, `/api/ready`, `/api/version`
- API와 Godot asset version 표시
- Godot 장식 소켓과 `DecorationCatalog`
- 3D 박물관과 거리별 모델 활성화
- Godot Web headless export 스크립트

#### 산출물

- 결과·투표·재경기 UI
- 티꾸 12종과 배경 4종
- 박물관 저장·복구 모듈
- 운영 상태 endpoint와 전체 빌드 명령

#### 완료 기준

- 완성한 티라노를 꾸며 박물관에 저장한다.
- 새로고침 후 최근 전시 기록을 복구한다.
- 손상된 한 항목이 나머지 박물관 로딩을 막지 않는다.
- 같은 참가자로 두 판 연속 진행할 수 있다.

### Day 7 — 통합 테스트와 시연 동결

#### 목표

실제 시연 환경에서 6명이 반복 완주하고 장애 발생 시 폴백으로 복구한다.

#### 작업 항목

- 실기기 4~6대 전체 흐름 반복
- 캠퍼스 Wi-Fi, Cloudflare Tunnel, 핫스팟 검증
- 센서 권한 거절, 화면 회전, 백그라운드, 연결 해제
- 소켓 부하, Godot FPS, 메모리와 다운로드 크기 측정
- 게임 수치 조정
- 시연·장애 대응 체크리스트
- 기능 동결과 치명적 버그 수정

#### 산출물

- 최종 production build
- 실기기·브라우저 호환성 표
- 밸런스 상수 최종값
- 시연 순서와 장애 대응 문서

#### 완료 기준

- 실기기 6대로 세 판 연속 완주한다.
- 자이로 실패 시 30초 안에 터치패드로 전환한다.
- Godot 재로드 후 최신 서버 상태로 화면을 복구한다.
- 시연 PC 1080p에서 평균 60 FPS, 최저 30 FPS를 만족한다.

---

## 24. 테스트 계획

### 단위 테스트

- 모든 Zod 요청·응답 스키마의 정상·경계·거부 값
- ErrorCode별 `retryable` 값
- acknowledgement request ID 멱등성
- 방 코드 충돌 재생성
- 닉네임과 정원 검증
- 홀수 인원 팀 균형 배정
- 발굴 입력 속도 제한
- 뼈 발견 순서와 이벤트 시드
- 퍼즐 위치·각도 허용 오차
- 조각 조작권 타임아웃
- 사격 쿨다운과 중복 요청
- 부위별 에너지·안정도 계산
- 정상·와이라노·정화 상태 전환
- 제한 시간 동점 처리

### 통합 테스트

- host/player 권한 위반 거부
- 잘못된 방·팀 페이즈 이벤트 거부
- Socket.IO 이벤트 payload와 push payload 계약 검사
- revision 역전 및 중복 request ID 처리
- 이벤트별 token bucket과 지속 위반 연결 해제
- 방 생성부터 양 팀 입장
- 발굴 완료 후 팀별 독립 페이즈 전환
- 동시에 같은 퍼즐 조각 요청
- 연결 해제 시 조작권 해제
- 여러 플레이어의 동시 사격
- 와이라노 탄생 중 상대 팀 정상 부활
- HP 또는 타이머성 이벤트의 결과 중복 방지
- 재경기 상태 초기화
- 브리지 메시지 스키마·origin·version 검증
- Godot 재로드 후 최신 스냅샷 복구
- 순서가 뒤바뀐 bridge sequence 무시
- `/api/health`, `/api/ready`, `/api/version` 상태 코드와 응답 스키마

### 실기기 테스트

- iOS 센서 권한 허용·거절
- Android 센서 편차
- 화면 방향 변경
- 백그라운드 전환
- 자이로·터치패드 전환
- 6명 조준 30Hz 부하
- Wi-Fi 지연과 순간 단절
- Chromium과 Safari의 Godot Web 로딩
- 1080p Godot 평균·최저 FPS와 메모리

### 최종 E2E

```text
방 생성
  → 6명 입장
  → 뼈 9종 발굴
  → 골격 퍼즐 완성
  → 에너지 사격
  → 정상 부활 또는 와이라노
  → 결과
  → 티꾸
  → 박물관 저장
  → 재경기
```

---

## 25. 예상 리스크와 대응

| 리스크 | 대응 |
|---|---|
| iOS 센서와 HTTPS | Day 2 전에 터널과 실기기 권한 검증 |
| 자이로 품질 | 터치패드 폴백을 항상 제공 |
| 퍼즐 조작 충돌 | 서버 조작권과 5초 타임아웃 |
| 팀 인원 차이 | 팀 전체 입력량 효율 감소와 동일 목표 |
| 게임 규칙 복잡도 | 페이즈별 모바일 UI를 한 가지 행동에 집중 |
| Wi-Fi 불안정 | 서버 권위 상태와 핫스팟 백업 |
| 6대 테스트 인력 | Socket.IO 가짜 클라이언트 |
| 범위 초과 | 박물관은 로컬 저장, 티꾸는 투표형으로 제한 |
| 에셋 부족 | 도형과 라이선스가 확인된 임시 에셋 사용 |
| Godot Web 초기 로딩 | 30MB 예산, 압축, 진행률 UI, 에셋 경량화 |
| React–Godot 상태 불일치 | 서버 스냅샷, sequence, 5초 재동기화 |
| WebGL 성능 저하 | Compatibility 렌더러, 단일 월드, 자동 품질 저하 |
| iframe·WASM 로딩 실패 | 오류 UI, 재시도, 서버 상태 유지, 2D 안전 화면 |
| 브라우저별 WebGL 차이 | 시연은 Chromium 우선, Safari는 별도 검증 |
| API 타입과 런타임 검증 불일치 | Zod 스키마에서 TypeScript 타입 추론 |
| 이벤트 중복으로 점수 이중 반영 | request ID·shot ID 멱등성 및 최근 응답 캐시 |
| 고빈도 이벤트 서버 과부하 | 이벤트별 token bucket과 전체 브로드캐스트 분리 |

---

## 26. 현재 개발 우선순위

일정이 밀릴 때는 다음 순서로 기능을 지킨다.

```text
P0: 시연 필수
├─ QR 입장과 팀 배정
├─ 서버 권위 상태 머신
├─ 탭 발굴
├─ 골격 퍼즐
├─ 터치패드 조준과 발사
├─ 정상 부활과 결과
└─ 재경기

P1: 핵심 경험
├─ 흔들기 센서
├─ 자이로 조준
├─ 와이라노·정화
├─ Godot 3D 연출
└─ 실기기 6대 안정화

P2: 보상과 완성도
├─ 티꾸
├─ 티라노박물관
├─ 사운드
├─ 돌·화석·황금 뼈
└─ 고급 파티클·셰이더
```

P0가 완성되지 않으면 P2 작업을 시작하지 않는다. Godot 3D가 지연되더라도 서버와 React 기반 전체 게임 흐름을 먼저 완주 가능하게 만든다.

## 27. 실행 및 운영 적용 순서

### 로컬 개발

```bash
npm install
npm run build:godot
npm run dev
```

### 타입·테스트·빌드

```bash
npm run typecheck
npm test
npm run build
```

### HTTPS 실기기 테스트

```bash
npm run dev
npm run dev:tunnel
```

터널 URL이 생성되면 `.env.development.local`의 `CLIENT_ORIGIN`과 `PUBLIC_JOIN_ORIGIN`을 갱신하고 서버를 다시 시작한다.

### 시연 직전

```text
1. 시연 PC와 모바일을 동일 네트워크에 연결
2. Node/Vite production build 실행
3. /api/health와 /api/version 확인
4. Godot WASM/PCK 응답과 MIME 확인
5. HTTPS QR로 iOS·Android 각 1대 입장
6. 센서 권한과 터치패드 폴백 확인
7. 2명 스모크 게임 1회
8. 브라우저 전체화면과 오디오 활성화
9. 불필요한 탭·개발 도구 종료
10. 핫스팟 백업 준비
```

## 28. 최종 검증 체크리스트

### 자동 검증

```bash
npm run typecheck
npm test
npm run build:godot
npm run build
npm run simulate -- --players 6
```

### 서버·정적 파일

- [ ] `/api/health`가 `200`을 반환한다.
- [ ] `/api/ready`가 `ready: true`를 반환한다.
- [ ] `/api/version`의 API와 Godot asset version이 화면과 일치한다.
- [ ] `.wasm` MIME이 `application/wasm`이다.
- [ ] `.pck`와 `.wasm` 압축 응답이 적용된다.
- [ ] Socket.IO WebSocket upgrade가 성공한다.

### 로비

- [ ] QR이 현재 HTTPS origin과 정확한 방 코드를 포함한다.
- [ ] 2~6명이 중복 닉네임 없이 입장한다.
- [ ] 홀수 인원이 A/B팀에 균형 배정된다.
- [ ] 전원 준비 전에는 시작할 수 없다.
- [ ] 진행 중인 방의 신규 입장이 거절된다.

### 발굴

- [ ] iOS 권한 요청이 사용자 탭 안에서 실행된다.
- [ ] Android 흔들기 입력이 동작한다.
- [ ] 권한 거절 후 탭 발굴이 가능하다.
- [ ] 입력 폭주가 서버 제한을 우회하지 못한다.
- [ ] 양 팀의 이벤트 순서가 같은 seed를 따른다.

### 퍼즐

- [ ] 같은 조각에 조작권이 중복 발급되지 않는다.
- [ ] 5초 입력 중단과 연결 해제 시 claim이 풀린다.
- [ ] 오답 조각은 2초 잠긴다.
- [ ] 정답 위치와 Godot 스냅 위치가 일치한다.
- [ ] 먼저 완성한 팀만 사격 단계로 이동한다.

### 조준·사격

- [ ] 자이로 영점과 재캘리브레이션이 동작한다.
- [ ] 터치패드로 화면 전체를 조준할 수 있다.
- [ ] 500ms 이상 오래된 조준 좌표로 발사할 수 없다.
- [ ] 같은 shot ID가 두 번 반영되지 않는다.
- [ ] 코어·일반 뼈·관절·빗나감 판정이 구분된다.

### 결과·박물관

- [ ] 정상·와이라노·정화 결과가 각각 재현된다.
- [ ] 승자가 한 번만 확정된다.
- [ ] 개인·팀 통계가 서버 결과와 일치한다.
- [ ] 티꾸 동점 규칙이 적용된다.
- [ ] 새로고침 후 박물관 기록이 유지된다.
- [ ] 재경기 시 이전 점수와 센서 영점이 초기화된다.

### 장애 복구

- [ ] 모바일 연결 해제 시 퍼즐 claim이 해제된다.
- [ ] 한 팀 전원 연결 해제 시 상대 팀이 승리한다.
- [ ] 호스트 연결 해제 시 방이 폐쇄된다.
- [ ] Godot iframe 재로드 후 최신 스냅샷으로 복구된다.
- [ ] WebGL 실패 시 2D 안전 화면이 표시된다.
- [ ] Wi-Fi 실패 시 핫스팟 환경으로 다시 실행할 수 있다.

## 29. MVP 이후 확장 계획

### Phase 2 — 접속 안정화

- 닉네임과 재접속 토큰 기반 자리 복구
- 데스크탑 새로고침 후 방 복구
- 네트워크 품질 HUD
- 관전 모드

### Phase 3 — 공룡과 콘텐츠

- 트리케라톱스·스테고사우루스
- 공룡별 다른 골격 퍼즐
- 사막·빙하·화산 발굴 지역
- 티라노 행동 패턴과 보스 연출

### Phase 4 — 박물관

- 서버 DB 기반 계정 없는 공유 박물관
- 박물관 QR 공개
- 희귀 화석 도감
- 시즌 장식과 업적

### Phase 5 — 운영

- 방·게임 완료율 대시보드
- 단계별 이탈과 평균 소요 시간
- 센서·브라우저 호환성 통계
- 관리자 밸런스 설정

## 30. 구현 가정

- 기존 코드가 없는 현재 저장소에서 새로 구현한다.
- 게임은 개인전 없이 2팀 대전으로 집중한다.
- 최대 인원은 팀당 3명, 전체 6명이다.
- 양 팀은 각 페이즈를 독립적으로 진행하며 먼저 끝낸 팀은 다음 단계에 먼저 진입할 수 있다.
- 서버가 게임 상태와 모든 판정의 유일한 진실 소스다.
- 공개 API 버전은 MVP 동안 `1`로 고정하고 breaking change 시에만 증가시킨다.
- 게임 변경 API는 Socket.IO로만 제공하며 HTTP는 읽기 전용 운영 endpoint만 둔다.
- 런타임 payload 검증은 Zod, 컴파일 타임 계약은 여기서 추론한 TypeScript 타입을 사용한다.
- Godot은 데스크탑 3D 렌더링만 담당하고 Socket.IO에 직접 연결하지 않는다.
- React와 Godot은 동일 origin iframe과 버전이 있는 `postMessage` 계약으로 통신한다.
- Godot 코드는 Web Export 호환을 위해 GDScript로 작성한다.
- MVP Web Export는 Compatibility Renderer와 싱글 스레드를 사용한다.
- 자이로는 선택 기능이고 터치패드는 필수 기능이다.
- 티라노박물관은 데스크탑 브라우저에만 로컬 저장한다.
- 와이라노도 실패 화면으로 끝내지 않고 정화로 역전할 기회를 제공한다.
- 전용 아트가 준비되지 않으면 Godot 기본 메시와 라이선스가 확인된 임시 스켈레톤 에셋으로 기능을 먼저 검증한다.
