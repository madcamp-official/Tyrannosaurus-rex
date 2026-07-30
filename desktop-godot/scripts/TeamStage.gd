extends Node3D
class_name TeamStage
## Plan.md §12.1 "하나의 3D 월드 안에 좌우 팀 무대를 배치한다".
## 발굴·조립·충전 세 단계를 하나의 TrexPuzzleModel 인스턴스로 이어간다:
## 발굴 중 뼈가 하나씩 드러나고, 조립 중 각 조각이 맞는 자리로 스냅되고,
## 충전 중에는 이미 조립된 같은 모델이 통째로 움직인다.

const ARENA_WIDTH := 6.0
const ARENA_DEPTH := 4.0
const REVEAL_POP_DURATION := 0.6
const SNAP_DURATION := 0.3
## excavation:progress는 입력마다(초당 최대 12회) 오지만 매번 파면 너무 잦다. progress는
## "뼈 구간 하나(0~100%)"가 아니라 "팀의 발굴 전체 목표치 대비 누적 진행도(0~100%)"이므로
## (§DesktopLobby.tsx의 excavation:progress 핸들러), 이 값은 발굴 전체 동안 몇 번 팔지를
## 정한다 — 100/EXCAVATION_DIG_STEP번. 팀 인원이 적어 전체 목표치가 낮아도(웨이브 수가
## 적어도) 항상 같은 횟수만큼 파여서, 인원수와 무관하게 땅이 고르게 파인 것처럼 보인다.
const EXCAVATION_DIG_STEP := 0.6

var team_id: String = "A"
var _ground: GroundDig
var _model: TrexPuzzleModel
var _model_ready := false
var _pending_discovered: Array[String] = []
var _phase: String = "EXCAVATION"
var _hit_particles: CPUParticles3D
var _dirt_particles: CPUParticles3D
var _label: Label3D
var _bone_highlight_material: StandardMaterial3D
var _last_dig_progress := -EXCAVATION_DIG_STEP

func setup(id: String) -> void:
	team_id = id
	_build_bone_highlight_material()
	_build_ground()
	_build_model()
	_build_hit_particles()
	_build_dirt_particles()
	_build_label()

func _build_bone_highlight_material() -> void:
	_bone_highlight_material = StandardMaterial3D.new()
	_bone_highlight_material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	_bone_highlight_material.albedo_color = Color(1.0, 0.94, 0.78, 0.2)
	_bone_highlight_material.emission_enabled = true
	_bone_highlight_material.emission = Color(1.0, 0.9, 0.68)
	_bone_highlight_material.emission_energy_multiplier = 0.32
	_bone_highlight_material.shading_mode = BaseMaterial3D.SHADING_MODE_PER_PIXEL

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

func _build_dirt_particles() -> void:
	_dirt_particles = CPUParticles3D.new()
	_dirt_particles.emitting = false
	_dirt_particles.one_shot = true
	# 양 팀이 동시에 발굴할 때 WebGL 파티클 오버드로우가 급증하지 않도록 제한한다.
	_dirt_particles.amount = 26
	_dirt_particles.lifetime = 1.05
	_dirt_particles.explosiveness = 0.92
	_dirt_particles.randomness = 0.38
	_dirt_particles.direction = Vector3(0, 1, 0)
	_dirt_particles.spread = 76.0
	_dirt_particles.gravity = Vector3(0, -8.5, 0)
	_dirt_particles.initial_velocity_min = 2.2
	_dirt_particles.initial_velocity_max = 5.4
	_dirt_particles.scale_amount_min = 0.65
	_dirt_particles.scale_amount_max = 1.45
	_dirt_particles.color = Color(0.34, 0.21, 0.11, 1.0)
	var dirt_chunk := BoxMesh.new()
	dirt_chunk.size = Vector3(0.09, 0.07, 0.09)
	_dirt_particles.mesh = dirt_chunk
	add_child(_dirt_particles)

func _build_label() -> void:
	_label = Label3D.new()
	_label.text = "%s팀" % team_id
	_label.position = Vector3(0, 3.4, 0)
	_label.font_size = 48
	_label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	_label.visible = _phase != "EXCAVATION"
	add_child(_label)

func _on_pieces_ready(_ids: Array[String]) -> void:
	_model_ready = true
	# 발굴 중 드러나는 조각이 완성된 자리가 아니라 흩어진 채로 보이도록, 조립(ASSEMBLY) 전에
	# 미리 흩뿌려 둔다. scatter()가 모든 조각을 잠깐 visible로 만들지만 바로 아래에서 다시
	# 숨기므로, 결과적으로 위치만 흩어지고 발견 전까지는 여전히 안 보인다.
	_model.scatter(team_id.hash())
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
	if _phase == "EXCAVATION":
		on_excavation_progress(float(team_data.get("excavationProgress", 0.0)))

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
	if _label:
		_label.visible = phase != "EXCAVATION"
	_apply_ground_visibility()
	if phase == "EXCAVATION" and previous != "EXCAVATION":
		# 재경기 등으로 발굴 페이즈에 다시 들어올 때, 이전 라운드에 파낸 땅이 그대로 남아있지
		# 않도록 평평하게 되돌린다.
		if _ground:
			_ground.reset()
		_last_dig_progress = -EXCAVATION_DIG_STEP
	if phase == "ASSEMBLY" and previous == "EXCAVATION" and _model_ready:
		for piece_id in _model.get_piece_ids():
			_set_piece_highlight(_model.get_piece(piece_id), false)
		_model.scatter(team_id.hash())

## 발굴 지형은 항상 보여야 한다 — Main._build_ground_backdrop()이 이 패치 영역을 일부러
## 피해서 잔디를 깔아 두므로(발굴 중 파는 모습을 가리지 않기 위해), EXCAVATION이 아닐 때
## 이 지형을 숨기면 그 자리만 배경(하늘색)이 그대로 비치는 구멍이 생긴다.
func _apply_ground_visibility() -> void:
	if _ground:
		_ground.visible = true

## React가 excavation:progress마다 보내는 팀 전체 발굴 진행도(0~100, §EXCAVATION_DIG_STEP)를
## 받아 땅을 파낸다. 진행도가 EXCAVATION_DIG_STEP만큼 움직였을 때만 실제로 파서, 발굴 시작부터
## 끝까지 조금씩 고르게 변화하게 한다.
func on_excavation_progress(progress: float) -> void:
	if not _ground or _phase != "EXCAVATION":
		return
	# 이벤트를 실시간으로 받든 HMR/재접속 뒤 전체 스냅샷으로 한꺼번에 복구하든 같은
	# 누적 진행도에는 같은 횟수만큼 땅이 파여야 한다. 이전 구현은 스냅샷의 큰 점프에도
	# 한 번만 파서 서버 진행도와 화면 지형이 어긋났다.
	while progress - _last_dig_progress >= EXCAVATION_DIG_STEP:
		_last_dig_progress += EXCAVATION_DIG_STEP
		_ground.dig_random_scoop(_last_dig_progress)

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
	_set_piece_highlight(piece, _phase == "EXCAVATION")
	if not animate:
		return
	_burst_dirt_around(piece)
	var original_scale := piece.scale
	var original_rotation := piece.rotation
	# 땅속에서 뽑혀 올라오는 대신, 발견 위치에서 먼지를 털어내듯 짧게 회전하며
	# 선명해지는 연출로 바꾼다. 위치는 움직이지 않아 발굴물이 튀어나와 보이지 않는다.
	piece.scale = original_scale * 0.92
	piece.rotation.y = original_rotation.y - 0.22
	var tween := create_tween()
	tween.set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	tween.tween_property(piece, "rotation:y", original_rotation.y + 0.12, REVEAL_POP_DURATION * 0.55)
	tween.parallel().tween_property(piece, "scale", original_scale * 1.04, REVEAL_POP_DURATION * 0.55)
	tween.tween_property(piece, "rotation:y", original_rotation.y, REVEAL_POP_DURATION * 0.45)
	tween.parallel().tween_property(piece, "scale", original_scale, REVEAL_POP_DURATION * 0.45)

func _set_piece_highlight(piece: Node3D, enabled: bool) -> void:
	if not piece:
		return
	for mesh_instance in _mesh_descendants(piece):
		mesh_instance.material_overlay = _bone_highlight_material if enabled else null

func _burst_dirt_around(piece: Node3D) -> void:
	if not _dirt_particles:
		return
	_dirt_particles.position = to_local(piece.global_position) + Vector3(0, 0.08, 0)
	_dirt_particles.restart()

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
