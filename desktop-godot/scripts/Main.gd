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
	environment.background_mode = Environment.BG_COLOR
	environment.background_color = Color(0.04, 0.05, 0.07)
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.ambient_light_color = Color(0.7, 0.78, 1.0)
	environment.ambient_light_energy = 1.2
	var world := WorldEnvironment.new()
	world.environment = environment
	add_child(world)

	var light := DirectionalLight3D.new()
	light.rotation_degrees = Vector3(-55, -30, 0)
	light.light_energy = 1.8
	add_child(light)

func _build_camera() -> void:
	var camera := Camera3D.new()
	camera.position = Vector3(0, 11, 18)
	camera.fov = 62.0
	camera.near = 0.1
	camera.far = 100.0
	add_child(camera)
	camera.look_at_from_position(camera.position, Vector3(0, 1.5, 0), Vector3.UP)
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
