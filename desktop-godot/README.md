# desktop-godot

Three.js 프로토타입(뼈 캐기 굴착 데모)을 Godot 4.3+ 로 포팅한 것.

## 실제 티라노 골격과 퍼즐 조각

- `assets/models/trex_skeleton/skeleton.gltf`: 254개 세부 메시가 포함된 원본 Stan 골격
- `scripts/TrexPuzzleModel.gd`: 세부 메시를 13개 대형 해부학 퍼즐 조각으로 묶는 런타임 모델
- `scenes/TrexPuzzlePreview.tscn`: 완성·분해·조각 단독 보기를 확인하는 장면
- `assets/models/trex_skeleton/PUZZLE_PARTS.md`: 조각별 포함 범위와 조작법

기존 `BoneModel.gd`의 임시 원통 뼈는 제거했다. 발굴 데모에서는 실제 13개 퍼즐 조각이 차례대로 발견된다.

## 실행

Godot 4.3 이상 에디터로 이 폴더(`desktop-godot/`)를 프로젝트로 열고 실행. 클릭 또는 스페이스바 = 굴착 1회 (아직 폰 연동 전이라 프로토타입과 동일하게 임시 입력).

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
- `export_presets.cfg`는 싱글 스레드(`variant/thread_support=false`) Web 프리셋이며 `../client/public/godot/index.html`로 export한다.

**아직 실행 검증 불가**: 이 환경에는 Godot 에디터·export 템플릿이 없어서 `export_presets.cfg`와 `web/shell.html`을 실제 export로 확인하지 못했다. 처음 `godot --headless --path desktop-godot --export-release Web ...`를 돌렸을 때:
- `export_presets.cfg`가 에디터에 의해 자동으로 다시 쓰이며 옵션 키가 달라질 수 있다.
- `$GODOT_URL$`, `$GODOT_CONFIG$`, `$GODOT_HEAD_INCLUDE$` 등 shell.html의 템플릿 변수가 사용 중인 Godot 버전의 기본 shell과 다르면 콘솔에 오류가 뜬다. 그 경우 Godot 설치 폴더의 `misc/dist/html/full-size.html` 원본과 비교해서 고치면 된다.
