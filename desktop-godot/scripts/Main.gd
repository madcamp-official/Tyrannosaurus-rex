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
	_build_crosshair_overlay()
	RenderRouter.snapshot_updated.connect(_on_snapshot_updated)
	RenderRouter.message_routed.connect(_on_message_routed)
	# RenderRouter가 이 씬보다 먼저 FULL_SNAPSHOT을 받아둔 경우를 대비해 한 번 즉시 반영한다.
	if not RenderRouter.latest_snapshot.is_empty():
		_on_snapshot_updated(RenderRouter.latest_snapshot)

func _build_environment() -> void:
	var environment := Environment.new()
	# 하늘 사진 대신 절차적 하늘(그라디언트)을 쓴다 — 별도 텍스처 없이 바로 동작한다.
	var sky_material := ProceduralSkyMaterial.new()
	sky_material.sky_top_color = Color(0.30, 0.55, 0.85)
	sky_material.sky_horizon_color = Color(0.75, 0.82, 0.88)
	sky_material.ground_bottom_color = Color(0.3, 0.28, 0.24)
	sky_material.ground_horizon_color = Color(0.75, 0.82, 0.88)
	sky_material.sun_angle_max = 30.0
	var sky := Sky.new()
	sky.sky_material = sky_material
	environment.background_mode = Environment.BG_SKY
	environment.sky = sky
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
	environment.ambient_light_energy = 1.1
	var world := WorldEnvironment.new()
	world.environment = environment
	add_child(world)

	var light := DirectionalLight3D.new()
	light.rotation_degrees = Vector3(-55, -30, 0)
	light.light_energy = 1.8
	add_child(light)

## 각 팀의 발굴 지형(GroundDig)은 16×16짜리 독립된 패치라, 그 바깥은 원래 아무것도 없어
## 카메라가 조금만 벗어나도 하늘 배경이 부자연스럽게 옆쪽까지 뻗어 보였다. 두 패치
## "바깥"만 정확히 피해서 잔디 타일로 채운다 — 패치 영역 자체를 덮으면(첫 시도 때 실수)
## 파낸 구덩이가 평평한 배경 평면에 가려 안 보이게 되므로 절대 겹치면 안 된다.
func _build_ground_backdrop() -> void:
	var mat := GroundDig.build_flat_material()
	var patch_half := GroundDig.GROUND_SIZE * 0.5  # 8.0
	var team_b_x: float = TEAM_OFFSET["B"].x  # 9.0
	var gap := 0.02  # 패치 가장자리와 살짝 띄워 부동소수점 겹침(z-fighting)을 막는 여유
	var side_center_x := team_b_x + patch_half + gap + patch_half
	var far_z := patch_half + gap + patch_half

	var middle_gap_width := (team_b_x - patch_half) * 2.0 - gap * 2.0  # 두 팀 패치 사이 빈 틈의 폭

	_add_backdrop_tile(mat, GroundDig.GROUND_SIZE, 24.0, -side_center_x, 0.0)
	_add_backdrop_tile(mat, GroundDig.GROUND_SIZE, 24.0, side_center_x, 0.0)
	_add_backdrop_tile(mat, middle_gap_width, 24.0, 0.0, 0.0)
	_add_backdrop_tile(mat, 80.0, 16.0, 0.0, far_z)
	_add_backdrop_tile(mat, 80.0, 16.0, 0.0, -far_z)

func _add_backdrop_tile(material: ShaderMaterial, width: float, depth: float, x: float, z: float) -> void:
	var tile := MeshInstance3D.new()
	tile.mesh = GroundDig.build_flat_tile_mesh(width, depth)
	tile.material_override = material
	tile.position = Vector3(x, -0.03, z)
	add_child(tile)

func _build_camera() -> void:
	var camera := Camera3D.new()
	# 시선을 땅에 더 가깝게, 더 당겨서 옆쪽 여백이 덜 보이게 했다 (배경 잔디 평면도 함께 깔아
	# 혹시 남는 여백도 검은색 대신 잔디로 보이게 함).
	camera.position = Vector3(0, 6, 8)
	camera.fov = 66.0
	camera.near = 0.1
	camera.far = 100.0
	add_child(camera)
	camera.look_at_from_position(camera.position, Vector3(0, 0.1, 0), Vector3.UP)
	camera.current = true

func _build_stages() -> void:
	for team_id in TEAM_OFFSET.keys():
		var stage := TeamStage.new()
		stage.position = TEAM_OFFSET[team_id]
		add_child(stage)
		stage.setup(team_id)
		_stages[team_id] = stage

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
