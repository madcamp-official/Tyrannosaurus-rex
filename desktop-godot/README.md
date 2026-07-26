# desktop-godot

Three.js 프로토타입(뼈 캐기 굴착 데모)을 Godot 4.3+ 로 포팅한 것.

## 실제 티라노 골격과 퍼즐 조각

- `assets/models/trex_skeleton/skeleton.gltf`: 254개 세부 메시가 포함된 원본 Stan 골격
- `scripts/TrexPuzzleModel.gd`: 세부 메시를 13개 대형 해부학 퍼즐 조각으로 묶는 런타임 모델
- `scenes/TrexPuzzlePreview.tscn`: 완성·분해·조각 단독 보기를 확인하는 장면
- `assets/models/trex_skeleton/PUZZLE_PARTS.md`: 조각별 포함 범위와 조작법

기존 `BoneModel.gd`의 임시 원통 뼈는 제거했다. 발굴 데모에서는 실제 13개 퍼즐 조각이 차례대로 발견된다.

## 실행

기본 실행 씬은 이제 `scenes/Main.tscn`이다 (React 연동 장면, 아래 "React 연동 3D 장면" 참고).
`scenes/DigSite.tscn`은 클릭/스페이스바로 굴착만 단독으로 확인하는 프로토타입으로 남아있고,
`scenes/TrexPuzzlePreview.tscn`은 13개 퍼즐 조각을 키보드로 확인하는 프리뷰다. Godot 4.3
이상 에디터에서 원하는 씬을 열고 실행하면 된다.

## 프로토타입과 다른 점

- **텍스처**: 원본의 base64 인라인 잔디/흙 사진 대신 `ProceduralTextures.gd`가 런타임에 생성하는 단색 노이즈 텍스처를 씀. 실제 사진을 쓰려면 `.png`를 `res://assets/textures/`에 넣고 `GroundDig` 노드의 `grass_texture`/`dirt_texture`(export 변수)에 연결하면 됨.
- **지형 해상도**: 원본은 120x120 세그먼트, 여기는 64x64로 낮춤 — GDScript는 JS보다 루프가 느려서 클릭마다 전체 재구축(SurfaceTool)하는 비용을 줄이기 위함. 느껴지면 `GroundDig.gd`의 `SEGS` 상수만 조절.
- **커스텀 정점 속성**: three.js는 `dirtAmount`를 별도 BufferAttribute로 뒀지만 Godot `ArrayMesh`는 임의 속성을 못 붙여서 정점 컬러(vertex color)의 R 채널에 태움. 셰이더(`shaders/ground.gdshader`)에서 `COLOR.r`로 읽음.
- **셰이딩**: 원본처럼 씬 라이트를 안 받는 `unshaded` 머티리얼로 포팅해서 원본의 수동 조명 계산(dot product)을 그대로 유지. 뼈 모델(`BoneModel.gd`)은 일반 `StandardMaterial3D`라 `DirectionalLight3D`의 영향을 받음.

## 이 포트에서 안 한 것 (아직 실행 검증 불가)

이 환경에 Godot 실행 파일이 없어서 실제로 에디터에서 열어 확인하지 못함. 문법은 Godot 4.3 기준으로 맞췄지만, 처음 열었을 때 콘솔에 에러가 뜨면 (특히 `.tscn` 파싱이나 API 이름 관련) 알려주면 바로 고칠 수 있음.

## 다음 단계 (네트워크 연동)

지금은 `DigSite.gd`의 `_unhandled_input`이 클릭/스페이스바를 직접 처리함. 나중에 서버에서 팀 굴착 진행량을 받으면, 이 입력 핸들러를 제거하고 `_on_dig_tick()`을 서버 이벤트 콜백에서 호출하도록 바꾸면 됨 (게임 로직 함수 자체는 순수 함수라 그대로 재사용 가능).

## Web Export와 React 브리지 (Plan.md §9.2, §11)

- 렌더러를 `gl_compatibility`(Compatibility)로 고정했다. 에디터에서 이 프로젝트를 처음 열면 렌더러 전환 대화상자가 뜰 수 있다.
- `scripts/JsBridge.gd`, `scripts/RenderRouter.gd`를 오토로드로 등록했다. `JsBridge`는 Web export에서만 `JavaScriptBridge`로 `window.trexGodotReceive`를 등록하고 `GODOT_READY`를 보낸다. 에디터/데스크탑 실행에서는 `OS.has_feature("web")`이 false라 조용히 비활성화된다.
- `web/shell.html`이 export preset의 커스텀 HTML shell이다. Godot 기본 `full-size.html` 템플릿에 `postMessage` 릴레이 스크립트만 추가했다.
- `export_presets.cfg`는 싱글 스레드(`variant/thread_support=false`) Web 프리셋이며 `../frontend/public/godot/index.html`로 export한다.

**아직 실행 검증 불가**: 이 환경에는 Godot 에디터·export 템플릿이 없어서 `export_presets.cfg`와 `web/shell.html`을 실제 export로 확인하지 못했다. 처음 `godot --headless --path desktop-godot --export-release Web ...`를 돌렸을 때:
- `export_presets.cfg`가 에디터에 의해 자동으로 다시 쓰이며 옵션 키가 달라질 수 있다.
- `$GODOT_URL$`, `$GODOT_CONFIG$`, `$GODOT_HEAD_INCLUDE$` 등 shell.html의 템플릿 변수가 사용 중인 Godot 버전의 기본 shell과 다르면 콘솔에 오류가 뜬다. 그 경우 Godot 설치 폴더의 `misc/dist/html/full-size.html` 원본과 비교해서 고치면 된다.

## React 연동 3D 장면 (Plan.md §12.1)

`scenes/Main.tscn` (`scripts/Main.gd`)이 실제로 React 브리지 메시지를 3D로 그리는 장면이다.

- 좌우로 티라노스테이지(`scripts/TeamStage.gd`) 두 개를 배치한다 (A팀 x=-9, B팀 x=+9) — §12.1이 말하는
  "하나의 3D 월드 안에 좌우 팀 무대를 배치"를 그대로 따랐다.
- 각 `TeamStage`는 발굴(`GroundDig`)·조립·충전 세 단계를 **하나의 `TrexPuzzleModel` 인스턴스**로 이어간다:
  발굴 중 `BONE_DISCOVERED`가 오면 해당 조각만 보이게 하고 팝업 트윈을 재생하고, 조립 중
  `PUZZLE_STATE`로 조각이 정답 배치되면(`fixed: true`) 그 조각의 실제 해부학적 목표 위치로
  스냅하고, 충전 중에는 이미 조립된 같은 모델 전체를 `TREX_TRANSFORM` 좌표로 이동시킨다.
  이렇게 하면 97MB 골격 에셋을 단계마다 새로 로드하지 않는다.
- `PUZZLE_STATE`가 보내는 서버의 0~1 정규화 좌표는 자체 2D 판정용이라 3D 모델의 실제 관절 위치와
  대응하지 않는다. 드래그 중에는 조각을 보이게만 두고, 배치가 **정답으로 확정**될 때만
  `TrexPuzzleModel.snap_piece()`로 실제 해부학적 위치에 스냅한다 — 조각이 정확히 어디로
  움직이는지는 서버 좌표가 아니라 모델 자체가 아는 정답 위치를 따른다.
- `CROSSHAIRS`는 `scripts/CrosshairOverlay.gd`(2D `CanvasLayer`)가 화면을 좌/우로 나눠 그린다.
- `ENERGY_HIT`은 `CPUParticles3D` 한 번 재생, `REVIVAL_RESULT`는 조각 메쉬에 반투명
  `material_overlay`를 씌워 좀비(초록)/정상(밝게) 틴트를 표현한다 — 전용 셰이더 없이 최소
  구현이다.
- `FULL_SNAPSHOT`(React가 상태 바뀔 때마다, 최소 5초 주기로 보냄)이 `TeamStage.apply_full_snapshot()`로
  들어와 발견된 뼈·고정된 조각·현재 phase·(충전 중이면) 티라노 위치를 한 번에 다시 맞춘다. 즉
  Godot iframe이 재로드돼도 다음 스냅샷으로 복구된다(§11.5).

**중요한 한계**: `JsBridge.gd`는 `OS.has_feature("web")`이 참일 때만(Web export) 동작한다.
에디터에서 `Main.tscn`을 바로 실행하면 React 연결이 없어 아무 메시지도 오지 않고, 두 팀
무대가 초기 상태(땅은 보이고 뼈는 전부 숨겨진 채)로만 나온다 — 이건 버그가 아니라 브리지
설계상 당연한 동작이다. 실제 동작을 보려면 `npm run build:godot`으로 export한 뒤
`npm run dev`로 전체 스택을 띄우고 브라우저에서 데스크탑 화면을 열어야 한다. 이 환경에는
Godot 에디터가 없어 `TeamStage`/`Main`의 실제 렌더링 결과를 스크린샷 등으로 확인하지 못했다 —
스크립트 문법과 노드 API 사용은 Godot 4.3 문서 기준으로 맞췄지만, 처음 열었을 때 콘솔 에러가
나면 알려주면 바로 고칠 수 있다.
