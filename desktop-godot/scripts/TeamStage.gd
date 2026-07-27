extends Node3D
class_name TeamStage
## Plan.md §12.1 "하나의 3D 월드 안에 좌우 팀 무대를 배치한다".
## 발굴·조립·충전 세 단계를 하나의 TrexPuzzleModel 인스턴스로 이어간다:
## 발굴 중 뼈가 하나씩 드러나고, 조립 중 각 조각이 맞는 자리로 스냅되고,
## 충전 중에는 이미 조립된 같은 모델이 통째로 움직인다.

const ARENA_WIDTH := 6.0
const ARENA_DEPTH := 4.0
const REVEAL_POP_DURATION := 0.5
const SNAP_DURATION := 0.3
## excavation:progress는 입력마다(초당 최대 12회) 오지만, 매번 파면 뼈 하나 찾는 사이에도
## 땅이 다 파여서 후반부에 시각적 변화가 없어진다. 진행도가 이만큼 움직일 때마다 한 번만 판다
## (뼈 하나당 0~100%를 대략 10번에 나눠 파는 셈).
const EXCAVATION_DIG_STEP := 10.0

var team_id: String = "A"
var _ground: GroundDig
var _model: TrexPuzzleModel
var _model_ready := false
var _pending_discovered: Array[String] = []
var _phase: String = "EXCAVATION"
var _hit_particles: CPUParticles3D
var _label: Label3D
var _last_dig_progress := -EXCAVATION_DIG_STEP

func setup(id: String) -> void:
	team_id = id
	_build_ground()
	_build_model()
	_build_hit_particles()
	_build_label()

func _build_ground() -> void:
	_ground = GroundDig.new()
	_ground.position = Vector3.ZERO
	add_child(_ground)

func _build_model() -> void:
	_model = TrexPuzzleModel.new()
	_model.pieces_ready.connect(_on_pieces_ready)
	_model.position = Vector3(0, 1.6, 0)
	add_child(_model)

func _build_hit_particles() -> void:
	_hit_particles = CPUParticles3D.new()
	_hit_particles.emitting = false
	_hit_particles.one_shot = true
	_hit_particles.amount = 24
	_hit_particles.lifetime = 0.6
	_hit_particles.explosiveness = 1.0
	_hit_particles.direction = Vector3(0, 1, 0)
	_hit_particles.spread = 60.0
	_hit_particles.gravity = Vector3(0, -6.0, 0)
	_hit_particles.initial_velocity_min = 1.5
	_hit_particles.initial_velocity_max = 3.5
	_hit_particles.scale_amount_min = 0.4
	_hit_particles.scale_amount_max = 0.7
	_hit_particles.color = Color(1.0, 0.85, 0.3)
	var box := BoxMesh.new()
	box.size = Vector3(0.06, 0.06, 0.06)
	_hit_particles.mesh = box
	add_child(_hit_particles)

func _build_label() -> void:
	_label = Label3D.new()
	_label.text = "%s팀" % team_id
	_label.position = Vector3(0, 3.4, 0)
	_label.font_size = 48
	_label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	add_child(_label)

func _on_pieces_ready(_ids: Array[String]) -> void:
	_model_ready = true
	for piece_id in _model.get_piece_ids():
		var piece := _model.get_piece(piece_id)
		if piece:
			piece.visible = false
	for boneId in _pending_discovered:
		_reveal_piece(boneId, false)
	_pending_discovered.clear()

## §11.5 FULL_SNAPSHOT: React가 5초마다 또는 재접속 시 보내는 전체 동기화.
func apply_full_snapshot(team_data: Dictionary) -> void:
	set_phase(team_data.get("phase", _phase))

	var discovered: Array = team_data.get("discoveredBoneIds", [])
	for boneId in discovered:
		_reveal_piece(str(boneId), false)

	var pieces: Array = team_data.get("puzzlePieces", [])
	for piece_data in pieces:
		var bone_id := str(piece_data.get("boneId", ""))
		if bool(piece_data.get("fixed", false)):
			_snap_piece(bone_id, false)

	if _phase == "CHARGING":
		var trex: Dictionary = team_data.get("trex", {})
		if trex.has("position"):
			_move_model_to(trex["position"])

func set_phase(phase: String) -> void:
	if _phase == phase:
		return
	var previous := _phase
	_phase = phase
	_apply_ground_visibility()
	if phase == "EXCAVATION" and previous != "EXCAVATION":
		# 재경기 등으로 발굴 페이즈에 다시 들어올 때, 이전 라운드에 파낸 땅이 그대로 남아있지
		# 않도록 평평하게 되돌린다.
		if _ground:
			_ground.reset()
		_last_dig_progress = -EXCAVATION_DIG_STEP
	if phase == "ASSEMBLY" and previous == "EXCAVATION" and _model_ready:
		_model.scatter(team_id.hash())

func _apply_ground_visibility() -> void:
	if _ground:
		_ground.visible = _phase == "EXCAVATION"

## React가 excavation:progress마다 보내는 이번 뼈 구간 진행도(0~100)를 받아 땅을 파낸다.
## 진행도가 EXCAVATION_DIG_STEP만큼 움직였을 때만 실제로 파서, 뼈 하나 얻는 동안 땅이
## 다 파여버리지 않고 발굴 전체 구간에 걸쳐 조금씩 변화하게 한다.
var _debug_dig_count := 0
var _debug_label: Label3D

func on_excavation_progress(progress: float) -> void:
	if not _debug_label:
		_debug_label = Label3D.new()
		_debug_label.position = Vector3(0, 2.6, 0)
		_debug_label.font_size = 64
		_debug_label.modulate = Color(1, 0.2, 0.2)
		_debug_label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
		add_child(_debug_label)
	_debug_label.text = "recv progress=%.1f" % progress
	if not _ground or _phase != "EXCAVATION":
		return
	if absf(progress - _last_dig_progress) < EXCAVATION_DIG_STEP:
		return
	_last_dig_progress = progress
	_debug_dig_count += 1
	_debug_label.text = "DIG #%d @ %.1f" % [_debug_dig_count, progress]
	_ground.dig_random_scoop(progress)

func on_bone_discovered(bone_id: String) -> void:
	_reveal_piece(bone_id, true)

func _reveal_piece(bone_id: String, animate: bool) -> void:
	if not _model_ready:
		if bone_id not in _pending_discovered:
			_pending_discovered.append(bone_id)
		return
	var piece := _model.get_piece(bone_id)
	if not piece or piece.visible:
		return
	piece.visible = true
	if not animate:
		return
	var original_scale := piece.scale
	piece.scale = Vector3.ZERO
	var tween := create_tween()
	tween.set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tween.tween_property(piece, "scale", original_scale, REVEAL_POP_DURATION)

func on_puzzle_piece_moved(bone_id: String, _transform_2d: Dictionary) -> void:
	# 서버의 0~1 정규화 좌표는 별도 2D 퍼즐 판정용이라 3D 모델 좌표와 직접 대응하지 않는다.
	# 드래그 중에는 조각을 보이는 상태로만 유지하고, 실제 이동은 배치 확정 시 스냅으로 표현한다.
	var piece := _model.get_piece(bone_id) if _model_ready else null
	if piece and not piece.visible:
		piece.visible = true

func on_puzzle_piece_placed(bone_id: String, correct: bool) -> void:
	if not correct:
		return
	_snap_piece(bone_id, true)

func _snap_piece(bone_id: String, animate: bool) -> void:
	if not _model_ready:
		return
	var piece := _model.get_piece(bone_id)
	if not piece:
		return
	piece.visible = true
	if animate:
		_model.snap_piece(bone_id, SNAP_DURATION)
	else:
		piece.transform = _model.get_target_transform(bone_id)

func on_trex_transform(position: Dictionary, _rotation_deg: float, _facing: String, _pose_id: String) -> void:
	_move_model_to(position)

func _move_model_to(normalized_position: Dictionary) -> void:
	if not _model:
		return
	var nx: float = normalized_position.get("x", 0.5)
	var ny: float = normalized_position.get("y", 0.5)
	var target := Vector3((nx - 0.5) * ARENA_WIDTH, 1.6, (ny - 0.5) * ARENA_DEPTH)
	var tween := create_tween()
	tween.tween_property(_model, "position", target, 0.15)

func on_energy_hit(hit_zone: String, hit_point) -> void:
	if hit_zone == "":
		return
	if hit_point is Dictionary and hit_point.has("x"):
		var nx: float = hit_point.get("x", 0.5)
		var ny: float = hit_point.get("y", 0.5)
		_hit_particles.position = Vector3((nx - 0.5) * ARENA_WIDTH, 1.6, (ny - 0.5) * ARENA_DEPTH)
	else:
		_hit_particles.position = _model.position
	_hit_particles.restart()

## Plan.md §12.6: "Skeleton3D 리그는 정상 부활 경로에서만 사용한다. 와이라노 판정은
## 3D 리그 대신 결과 화면의 레퍼런스 이미지로 대체한다." 그래서 실패(YRANNO)에는
## 3D 연출을 넣지 않는다 — 그 몫은 전적으로 2D 결과 화면(ResultView)이 담당한다.
func on_revival_result(form: String, _purified: bool) -> void:
	if not _model_ready or form != "NORMAL":
		return
	var tint := Color(1.0, 1.0, 0.85, 0.5)
	for piece_id in _model.get_piece_ids():
		var piece := _model.get_piece(piece_id)
		if not piece:
			continue
		for mesh_instance in _mesh_descendants(piece):
			var mat := StandardMaterial3D.new()
			mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
			mat.albedo_color = tint
			mesh_instance.material_overlay = mat

func _mesh_descendants(root: Node) -> Array[MeshInstance3D]:
	var result: Array[MeshInstance3D] = []
	if root is MeshInstance3D:
		result.append(root as MeshInstance3D)
	for child in root.get_children():
		result.append_array(_mesh_descendants(child))
	return result
