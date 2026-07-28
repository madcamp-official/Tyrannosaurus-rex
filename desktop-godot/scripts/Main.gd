extends Node3D
## Plan.md §12.1. 좌우 팀 무대를 한 3D 월드에 배치하고 RenderRouter가 파싱한
## React 메시지를 각 TeamStage/크로스헤어 오버레이로 분배한다.

const TEAM_OFFSET := {
	"A": Vector3(-9, 0, 0),
	"B": Vector3(9, 0, 0),
}

var _stages: Dictionary = {}  # "A"/"B" -> TeamStage
var _crosshair_overlay: CrosshairOverlay

func _ready() -> void:
	_build_environment()
	_build_ground_backdrop()
	_build_camera()
	_build_stages()
	_build_bottom_gradient_overlay()
	_build_crosshair_overlay()
	RenderRouter.snapshot_updated.connect(_on_snapshot_updated)
	RenderRouter.message_routed.connect(_on_message_routed)
	# RenderRouter가 이 씬보다 먼저 FULL_SNAPSHOT을 받아둔 경우를 대비해 한 번 즉시 반영한다.
	if not RenderRouter.latest_snapshot.is_empty():
		_on_snapshot_updated(RenderRouter.latest_snapshot)

func _build_environment() -> void:
	var environment := Environment.new()
	# 밤하늘 사진(어두워서 색감이 칙칙했다)과 그 다음 시도한 단색 배경(색감이 어색했다)을
	# 모두 걷어내고, 맑은 낮하늘처럼 보이는 절차적 그라디언트 하늘로 바꿨다. 차갑고 새파란
	# 색 대신 노을 지평선처럼 살짝 금빛이 도는 따뜻한 톤으로 잡아 아늑한 분위기를 낸다.
	var sky_material := ProceduralSkyMaterial.new()
	sky_material.sky_top_color = Color(0.35, 0.55, 0.78)
	sky_material.sky_horizon_color = Color(0.96, 0.80, 0.58)
	sky_material.ground_bottom_color = Color(0.42, 0.33, 0.24)
	sky_material.ground_horizon_color = Color(0.96, 0.80, 0.58)
	var sky := Sky.new()
	sky.sky_material = sky_material
	environment.background_mode = Environment.BG_SKY
	environment.sky = sky
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
	environment.ambient_light_energy = 1.0
	var world := WorldEnvironment.new()
	world.environment = environment
	add_child(world)

	var light := DirectionalLight3D.new()
	light.rotation_degrees = Vector3(-55, -30, 0)
	light.light_energy = 1.8
	# 방향광도 순백색 대신 살짝 노란빛이 도는 따뜻한 색으로 — 하늘 톤과 어우러져 전체
	# 분위기가 따뜻하게 느껴지게 한다.
	light.light_color = Color(1.0, 0.93, 0.80)
	# 기본값이 꺼져 있어서 지금까지 땅/뼈 모델 모두 그림자를 전혀 드리우지 않았다.
	light.shadow_enabled = true
	add_child(light)

## 각 팀의 발굴 지형(GroundDig)은 16×16짜리 독립된 패치라, 그 바깥은 원래 아무것도 없어
## 카메라가 조금만 벗어나도 배경이 부자연스럽게 옆쪽까지 뻗어 보였다. 두 패치 "바깥"만
## 정확히 피해서 잔디로 채운다.
##
## 예전엔 큰 사각형 5개(양옆/가운데/앞뒤)를 각 구역 크기에 딱 맞춰 짜깁기했는데, 조각마다
## 크기가 달라 인위적인 헝겊 조각처럼 보였다. 대신 같은 크기의 정사각 타일을 격자로
## 반복해서 깔아 자연스러운 바닥처럼 보이게 한다 — 타일 자체는 패치 가장자리를 살짝
## 겹치게(overlap) 배치해 틈이 안 생기고, 그 겹치는 폭은 발굴 구역(반경 MAX_DIG_REACH≈5.8,
## 패치 절반=8)에 전혀 닿지 않을 만큼 작아서 파낸 구덩이를 가릴 일은 없다. z-fighting은
## 배경 타일을 아주 살짝만 아래로 내려서(그림자가 눈에 띄는 턱으로 보이지 않을 만큼 작게) 피한다.
func _build_ground_backdrop() -> void:
	var mat := GroundDig.build_flat_material()
	var patch_half := GroundDig.GROUND_SIZE * 0.5  # 8.0
	var team_b_x: float = TEAM_OFFSET["B"].x  # 9.0
	var overlap := 0.05
	var side_start_x := team_b_x + patch_half - overlap
	var far_z_start := patch_half - overlap
	var gap_half := (team_b_x - patch_half) + overlap  # 두 팀 패치 사이를 살짝 겹치게 채우는 절반 폭

	# 좌우 바깥
	_fill_grid(mat, -side_start_x - 16.0, -side_start_x, -24.0, 24.0)
	_fill_grid(mat, side_start_x, side_start_x + 16.0, -24.0, 24.0)
	# 두 팀 패치 사이
	_fill_grid(mat, -gap_half, gap_half, -24.0, 24.0)
	# 앞뒤 바깥
	_fill_grid(mat, -40.0, 40.0, far_z_start, far_z_start + 16.0)
	_fill_grid(mat, -40.0, 40.0, -far_z_start - 16.0, -far_z_start)

## [x_min, x_max) × [z_min, z_max) 영역을 BACKDROP_TILE_SIZE 크기의 정사각 타일로 채운다.
## 영역 폭이 타일 크기의 배수가 아니면 마지막 타일이 살짝 바깥으로 넘치는데, 어차피 그
## 바깥은 다른 배경 타일이 없는 빈 공간이라 더 채워지는 것뿐이라 문제되지 않는다.
const BACKDROP_TILE_SIZE := 4.0

func _fill_grid(material: ShaderMaterial, x_min: float, x_max: float, z_min: float, z_max: float) -> void:
	var cols := int(ceil((x_max - x_min) / BACKDROP_TILE_SIZE))
	var rows := int(ceil((z_max - z_min) / BACKDROP_TILE_SIZE))
	for row in rows:
		for col in cols:
			var cx := x_min + BACKDROP_TILE_SIZE * (col + 0.5)
			var cz := z_min + BACKDROP_TILE_SIZE * (row + 0.5)
			_add_backdrop_tile(material, cx, cz)

func _add_backdrop_tile(material: ShaderMaterial, x: float, z: float) -> void:
	var tile := MeshInstance3D.new()
	tile.mesh = GroundDig.build_flat_tile_mesh(BACKDROP_TILE_SIZE, BACKDROP_TILE_SIZE)
	tile.material_override = material
	tile.position = Vector3(x, -0.01, z)
	add_child(tile)

func _build_camera() -> void:
	var camera := Camera3D.new()
	# 비스듬히 내려다보던 각도 대신, 하늘에서 수직으로 내려다보는 탑다운 시점으로 바꿨다.
	# 높이는 이전 카메라(0,9,13)의 원점까지 거리(~15.8)와 비슷하게 잡아 구덩이/티라노가
	# 화면에서 차지하는 크기가 크게 달라지지 않게 했다. 곧장 아래를 보는 방향은 기본
	# up 벡터(Vector3.UP)와 평행해 look_at 기준이 무너지므로, 화면 위쪽이 -Z(원래 카메라가
	# 있던 반대쪽) 방향을 향하도록 별도의 up 벡터를 준다.
	camera.position = Vector3(0, 15, 0)
	camera.fov = 68.0
	camera.near = 0.1
	camera.far = 100.0
	add_child(camera)
	camera.look_at_from_position(camera.position, Vector3(0, 0, 0), Vector3(0, 0, -1))
	camera.current = true

func _build_stages() -> void:
	for team_id in TEAM_OFFSET.keys():
		var stage := TeamStage.new()
		stage.position = TEAM_OFFSET[team_id]
		add_child(stage)
		stage.setup(team_id)
		_stages[team_id] = stage

## 화면 위쪽은 그대로 두고 아래쪽으로 갈수록 점점 어두워지는 화면 공간 그라데이션.
## 탑다운 카메라라 3D 배경색은 거의 안 보이므로, 3D 씬 위에 얹는 2D 오버레이로 구현한다.
func _build_bottom_gradient_overlay() -> void:
	var layer := CanvasLayer.new()
	layer.layer = 0  # 크로스헤어(기본 layer=1)보다 아래에 그려지게 한다.
	add_child(layer)

	var gradient := Gradient.new()
	gradient.colors = PackedColorArray([Color(0, 0, 0, 0.0), Color(0, 0, 0, 0.5)])

	var gradient_tex := GradientTexture2D.new()
	gradient_tex.gradient = gradient
	gradient_tex.fill = GradientTexture2D.FILL_LINEAR
	gradient_tex.fill_from = Vector2(0.5, 0.0)
	gradient_tex.fill_to = Vector2(0.5, 1.0)
	gradient_tex.width = 4
	gradient_tex.height = 256

	var rect := TextureRect.new()
	rect.texture = gradient_tex
	rect.stretch_mode = TextureRect.STRETCH_SCALE
	rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	rect.set_anchors_preset(Control.PRESET_FULL_RECT)
	layer.add_child(rect)

func _build_crosshair_overlay() -> void:
	var layer := CanvasLayer.new()
	add_child(layer)
	_crosshair_overlay = CrosshairOverlay.new()
	layer.add_child(_crosshair_overlay)

func _stage_for(payload: Dictionary) -> TeamStage:
	return _stages.get(str(payload.get("teamId", "")))

## §11.3 FULL_SNAPSHOT: { revision, teams: { A: {...}, B: {...} } }
func _on_snapshot_updated(snapshot: Dictionary) -> void:
	var teams: Dictionary = snapshot.get("teams", {})
	for team_id in teams.keys():
		var stage: TeamStage = _stages.get(team_id)
		if stage:
			stage.apply_full_snapshot(teams[team_id])

func _on_message_routed(type: String, payload: Dictionary) -> void:
	match type:
		"BONE_DISCOVERED":
			var stage := _stage_for(payload)
			if stage:
				stage.on_bone_discovered(str(payload.get("boneId", "")))
		"EXCAVATION_PROGRESS":
			var progress_stage := _stage_for(payload)
			if progress_stage:
				progress_stage.on_excavation_progress(float(payload.get("progress", 0.0)))
		"PUZZLE_STATE":
			var stage := _stage_for(payload)
			if stage:
				for piece in payload.get("pieces", []):
					var bone_id := str(piece.get("boneId", ""))
					stage.on_puzzle_piece_moved(bone_id, piece.get("transform", {}))
					if bool(piece.get("fixed", false)):
						stage.on_puzzle_piece_placed(bone_id, true)
		"CROSSHAIRS":
			var team_id := str(payload.get("teamId", ""))
			_crosshair_overlay.set_team_crosshairs(team_id, payload.get("crosshairs", []))
		"TREX_TRANSFORM":
			var stage := _stage_for(payload)
			if stage:
				stage.on_trex_transform(
					payload.get("position", {}),
					float(payload.get("rotationDeg", 0.0)),
					str(payload.get("facing", "RIGHT")),
					str(payload.get("poseId", "IDLE"))
				)
		"ENERGY_HIT":
			var stage := _stage_for(payload)
			if stage:
				stage.on_energy_hit(str(payload.get("hitZone", "")), payload.get("hitPoint"))
		"REVIVAL_RESULT":
			var stage := _stage_for(payload)
			if stage:
				stage.on_revival_result(str(payload.get("form", "NONE")), bool(payload.get("purified", false)))
		_:
			pass
