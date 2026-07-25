# desktop-godot

Three.js 프로토타입(뼈 캐기 굴착 데모)을 Godot 4.3+ 로 포팅한 것.

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
