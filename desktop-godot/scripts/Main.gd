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
	# 절차적 그라디언트 대신 실제 하늘 사진을 파노라마 텍스처로 씌운다.
	var sky_material := PanoramaSkyMaterial.new()
	sky_material.panorama = load("res://assets/textures/night_sky.jpg")
	var sky := Sky.new()
	sky.sky_material = sky_material
	environment.background_mode = Environment.BG_SKY
	environment.sky = sky
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
	# 그림자를 살리려고 주변광을 0.55까지 낮췄더니 발굴 화면 전체가 너무 어둡다는 피드백이
	# 있어 다시 올렸다 — 그림자는 방향광 자체의 세기(아래 light_energy)로도 충분히 뚜렷하다.
	environment.ambient_light_energy = 0.95
	var world := WorldEnvironment.new()
	world.environment = environment
	add_child(world)

	var light := DirectionalLight3D.new()
	light.rotation_degrees = Vector3(-55, -30, 0)
	light.light_energy = 2.1
	# 기본값이 꺼져 있어서 지금까지 땅/뼈 모델 모두 그림자를 전혀 드리우지 않았다.
	light.shadow_enabled = true
	add_child(light)

## 각 팀의 발굴 지형(GroundDig)은 16×16짜리 독립된 패치라, 그 바깥은 원래 아무것도 없어
## 카메라가 조금만 벗어나도 하늘 배경이 부자연스럽게 옆쪽까지 뻗어 보였다. 두 패치
## "바깥"만 정확히 피해서 잔디 타일로 채운다.
##
## 예전엔 패치 가장자리와 배경 타일 사이에 z-fighting 방지용으로 아주 작은 빈 틈(gap)을
## 뒀는데, 카메라가 비스듬한 각도일 땐 원근 때문에 안 보였지만 탑다운으로 바뀌면서 그
## 틈이 똑바로 갈라진 직선처럼 뚜렷하게 보였다. 이제 틈 대신 살짝 겹치게(overlap) 배치해
## 그 자리를 메운다 — 겹치는 폭은 발굴 구역(반경 MAX_DIG_REACH≈5.8, 패치 절반=8)에 전혀
## 닿지 않을 만큼 패치 바깥쪽 가장자리에서만 아주 조금이라 파낸 구덩이를 가릴 일은 없다.
## z-fighting은 배경 타일을 아주 살짝만 아래로 내려서(그림자가 눈에 띄는 턱으로 보이지
## 않을 만큼 작게) 피한다.
func _build_ground_backdrop() -> void:
	var mat := GroundDig.build_flat_material()
	var patch_half := GroundDig.GROUND_SIZE * 0.5  # 8.0
	var team_b_x: float = TEAM_OFFSET["B"].x  # 9.0
	var overlap := 0.05
	var side_center_x := team_b_x + patch_half * 2.0 - overlap
	var far_z := patch_half * 2.0 - overlap

	var middle_gap_width := (team_b_x - patch_half) * 2.0 + overlap * 2.0  # 두 팀 패치 사이를 겹치게 채우는 폭

	_add_backdrop_tile(mat, GroundDig.GROUND_SIZE, 24.0, -side_center_x, 0.0)
	_add_backdrop_tile(mat, GroundDig.GROUND_SIZE, 24.0, side_center_x, 0.0)
	_add_backdrop_tile(mat, middle_gap_width, 24.0, 0.0, 0.0)
	_add_backdrop_tile(mat, 80.0, 16.0, 0.0, far_z)
	_add_backdrop_tile(mat, 80.0, 16.0, 0.0, -far_z)

func _add_backdrop_tile(material: ShaderMaterial, width: float, depth: float, x: float, z: float) -> void:
	var tile := MeshInstance3D.new()
	tile.mesh = GroundDig.build_flat_tile_mesh(width, depth)
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
