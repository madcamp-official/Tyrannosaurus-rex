extends Node3D
class_name TrexPuzzleModel

signal pieces_ready(piece_ids: Array[String])

const SKELETON_SCENE: PackedScene = preload("res://assets/models/trex_skeleton/skeleton.gltf")
const MODEL_SCALE := 0.01
## 발굴과 조립에서 흩어진 조각을 원래 표시 크기(1.8)의 2.5배로 키운다.
## 올바른 자리에 snap된 조각은 target transform의 scale(1.0)로 돌아가 완성 골격 비율을 유지한다.
const SCATTER_PIECE_SCALE := 4.5

## 퍼즐용 대형 조각 13개.
## 작은 발가락/척추뼈를 하나씩 떼지 않고, 사람이 한눈에 구분할 수 있는
## 해부학적 덩어리 안에서 원본 메시들을 함께 움직인다.
const PIECE_ORDER: Array[String] = [
	"SKULL",
	"JAW",
	"NECK",
	"SPINE",
	"RIBCAGE",
	"PELVIS",
	"ARM_LEFT",
	"ARM_RIGHT",
	"LEG_LEFT",
	"LEG_RIGHT",
	"TAIL_BASE",
	"TAIL_MIDDLE",
	"TAIL_TIP",
]

const PIECE_LABELS := {
	"SKULL": "머리뼈",
	"JAW": "아래턱",
	"NECK": "목뼈",
	"SPINE": "등뼈",
	"RIBCAGE": "갈비뼈",
	"PELVIS": "골반",
	"ARM_LEFT": "왼팔",
	"ARM_RIGHT": "오른팔",
	"LEG_LEFT": "왼다리",
	"LEG_RIGHT": "오른다리",
	"TAIL_BASE": "꼬리 시작",
	"TAIL_MIDDLE": "꼬리 중간",
	"TAIL_TIP": "꼬리 끝",
}

var _model_space: Node3D
var _source: Node3D
var _pieces: Dictionary = {}
var _target_transforms: Dictionary = {}
var _displayed_piece_id := ""

func _ready() -> void:
	_build_puzzle_model()

func get_piece_ids() -> Array[String]:
	var result: Array[String] = []
	result.assign(PIECE_ORDER)
	return result

func get_piece_label(piece_id: String) -> String:
	return PIECE_LABELS.get(piece_id, piece_id)

func get_piece(piece_id: String) -> Node3D:
	return _pieces.get(piece_id) as Node3D

func get_target_transform(piece_id: String) -> Transform3D:
	return _target_transforms.get(piece_id, Transform3D.IDENTITY)

func show_assembled() -> void:
	_displayed_piece_id = ""
	for piece_id in PIECE_ORDER:
		var piece := get_piece(piece_id)
		if piece:
			piece.visible = true
			piece.transform = get_target_transform(piece_id)

func show_only_piece(piece_id: String) -> void:
	_displayed_piece_id = piece_id
	for id in PIECE_ORDER:
		var piece := get_piece(id)
		if not piece:
			continue
		piece.visible = id == piece_id
		if id == piece_id:
			# 각 조각의 pivot이 자체 bounds 중심이므로 원점에 놓아도 자연스럽게 회전한다.
			piece.position = Vector3.ZERO
			piece.rotation = Vector3.ZERO
			piece.scale = Vector3.ONE

## radius_meters 기본값(6.5)은 GroundDig.DIG_ZONE_RADIUS(3.45)보다 충분히 바깥이라, 발굴된
## 뼈가 구덩이의 들쭉날쭉한 가장자리를 벗어난 평평한 자리에 놓인다.
##
## 예전엔 카메라(Main._build_camera)가 비스듬한 각도로 내려다봐서, 조각을 원 전체에
## 흩뿌리면 카메라에서 먼 쪽으로 간 조각들이 원근 때문에 화면상 구덩이 뒤로 겹쳐 보이는
## 문제가 있어 반원으로 제한했었다. 카메라가 수직 탑다운으로 바뀌면서 "먼 쪽"이 없어져
## 더 이상 그럴 필요가 없으므로 다시 원 전체에 고르게 흩어 놓는다.
func scatter(seed_value: int = 0, radius_meters: float = 6.5) -> void:
	_displayed_piece_id = ""
	var rng := RandomNumberGenerator.new()
	rng.seed = seed_value if seed_value != 0 else Time.get_ticks_usec()
	var radius_units := radius_meters / MODEL_SCALE
	var count := PIECE_ORDER.size()

	for i in count:
		var piece := get_piece(PIECE_ORDER[i])
		if not piece:
			continue
		piece.visible = true
		var t := float(i) / float(maxi(1, count))
		var angle := t * TAU
		angle += rng.randf_range(-0.06, 0.06) * PI
		piece.position = Vector3(
			cos(angle) * radius_units,
			rng.randf_range(-1.2, 1.2) / MODEL_SCALE,
			sin(angle) * radius_units
		)
		piece.rotation = Vector3(
			rng.randf_range(-0.35, 0.35),
			rng.randf_range(-PI, PI),
			rng.randf_range(-0.35, 0.35)
		)
		piece.scale = Vector3.ONE * SCATTER_PIECE_SCALE

func set_piece_pose(piece_id: String, pose: Transform3D) -> void:
	var piece := get_piece(piece_id)
	if piece:
		piece.transform = pose

func snap_piece(piece_id: String, duration := 0.25) -> void:
	var piece := get_piece(piece_id)
	if not piece:
		return
	var tween := create_tween()
	tween.set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	tween.tween_property(piece, "transform", get_target_transform(piece_id), duration)

func _build_puzzle_model() -> void:
	_model_space = Node3D.new()
	_model_space.name = "ModelSpace"
	_model_space.scale = Vector3.ONE * MODEL_SCALE
	add_child(_model_space)

	_source = SKELETON_SCENE.instantiate() as Node3D
	_source.name = "OriginalSkeleton"
	_model_space.add_child(_source)

	# 원본에서는 atlas/axis가 두개골 subtree 안에 있으므로 목 조각으로 먼저 분리한다.
	var atlas := _find("atlas_axis_Untitled_153")
	if atlas:
		atlas.reparent(_source, true)

	var dorsals := _find("DORSALS")
	var spine_nodes: Array[Node3D] = []
	if dorsals:
		for child in dorsals.get_children():
			if child is Node3D and child.name not in ["Ribs_R", "Ribs_L"]:
				spine_nodes.append(child as Node3D)

	var neck_nodes: Array[Node3D] = _nodes(["Cervicals", "atlas_axis_Untitled_153"])
	var rib_nodes: Array[Node3D] = _nodes([
		"Ribs_R",
		"Ribs_L",
		"GastraliaRight",
		"GastraliaLeft1",
		"Gastralia_RIGHT",
		"Gastralia_Left",
		"scap_corcoid_Cube_Untitled_057",
		"furcula_Untitled_042",
	])

	var tail_groups := _split_tail_by_distance()
	var groups := {
		"SKULL": _nodes(["stan_skull_Untitled_059"]),
		"JAW": _nodes(["stan_mandible_Untitled_082"]),
		"NECK": neck_nodes,
		"SPINE": spine_nodes,
		"RIBCAGE": rib_nodes,
		"PELVIS": _nodes(["Hips"]),
		"ARM_LEFT": _nodes(["LeftArm_2"]),
		"ARM_RIGHT": _nodes(["Right_Arm"]),
		"LEG_LEFT": _nodes(["Left_Leg_2"]),
		"LEG_RIGHT": _nodes(["Right_Leg"]),
		"TAIL_BASE": tail_groups[0],
		"TAIL_MIDDLE": tail_groups[1],
		"TAIL_TIP": tail_groups[2],
	}

	for piece_id in PIECE_ORDER:
		_create_piece(piece_id, groups[piece_id])

	_source.queue_free()
	pieces_ready.emit(get_piece_ids())

func _create_piece(piece_id: String, members: Array) -> void:
	if members.is_empty():
		push_error("T-rex puzzle piece has no source nodes: %s" % piece_id)
		return

	var piece := Node3D.new()
	piece.name = piece_id
	piece.set_meta("puzzle_piece_id", piece_id)
	piece.set_meta("display_name", get_piece_label(piece_id))
	_model_space.add_child(piece)

	# 조각 자체의 중심을 pivot으로 삼아 퍼즐에서 회전시키기 쉽게 만든다.
	var bounds := _bounds_for_nodes(members)
	piece.global_position = bounds.get_center()
	for member in members:
		if is_instance_valid(member):
			member.reparent(piece, true)

	_pieces[piece_id] = piece
	_target_transforms[piece_id] = piece.transform

func _split_tail_by_distance() -> Array:
	var caudal := _find("CAUDAL")
	if not caudal:
		return [[], [], []]

	var pelvis := _find("Hips")
	var pelvis_center := _bounds_for_nodes([pelvis]).get_center() if pelvis else Vector3.ZERO
	var tail_children: Array[Node3D] = []
	for child in caudal.get_children():
		if child is Node3D:
			tail_children.append(child as Node3D)

	tail_children.sort_custom(func(a: Node3D, b: Node3D) -> bool:
		var da := _bounds_for_nodes([a]).get_center().distance_squared_to(pelvis_center)
		var db := _bounds_for_nodes([b]).get_center().distance_squared_to(pelvis_center)
		return da < db
	)

	var groups: Array = [[], [], []]
	for i in tail_children.size():
		var section := mini(2, int(floor(float(i) * 3.0 / float(tail_children.size()))))
		groups[section].append(tail_children[i])
	return groups

func _nodes(names: Array[String]) -> Array[Node3D]:
	var result: Array[Node3D] = []
	for node_name in names:
		var node := _find(node_name)
		if node:
			result.append(node)
		else:
			push_warning("T-rex source node not found: %s" % node_name)
	return result

func _find(node_name: String) -> Node3D:
	return _source.find_child(node_name, true, false) as Node3D

func _bounds_for_nodes(nodes: Array) -> AABB:
	var bounds := AABB()
	var has_bounds := false
	for node_value in nodes:
		var node := node_value as Node3D
		if not is_instance_valid(node):
			continue
		var meshes := _mesh_descendants(node)
		for mesh_instance in meshes:
			var local_aabb := mesh_instance.get_aabb()
			for corner_index in 8:
				var corner := Vector3(
					local_aabb.position.x + (local_aabb.size.x if (corner_index & 1) != 0 else 0.0),
					local_aabb.position.y + (local_aabb.size.y if (corner_index & 2) != 0 else 0.0),
					local_aabb.position.z + (local_aabb.size.z if (corner_index & 4) != 0 else 0.0)
				)
				var world_corner := mesh_instance.global_transform * corner
				if not has_bounds:
					bounds = AABB(world_corner, Vector3.ZERO)
					has_bounds = true
				else:
					bounds = bounds.expand(world_corner)
	return bounds

func _mesh_descendants(root: Node) -> Array[MeshInstance3D]:
	var result: Array[MeshInstance3D] = []
	if root is MeshInstance3D:
		result.append(root as MeshInstance3D)
	for child in root.get_children():
		result.append_array(_mesh_descendants(child))
	return result
