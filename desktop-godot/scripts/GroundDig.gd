extends MeshInstance3D
class_name GroundDig

const GROUND_SIZE := 16.0
const SEGS := 64
const DIG_ZONE_RADIUS := 3.45
const SCOOP_RADIUS_MIN := 1.15
const SCOOP_RADIUS_MAX := 2.0
const SCOOP_DEPTH_MIN := 0.45
const SCOOP_DEPTH_MAX := 1.05
# 같은 지점이 여러 번 겹쳐 파여도 이 이상 깊어지지 않게 막아, 한 곳만 뾰족하게
# 깊어지는 대신 구덩이 전체가 고르게 울퉁불퉁한 깊이를 유지하게 한다.
const MAX_DIG_DEPTH := 2.3
# 매번 완전히 새 위치를 뽑는 대신, 이 확률로만 최근 삽질 근처에 이어 파서 뼈 하나짜리
# 매끈한 원이 아니라 군데군데 붙어있는 불규칙한 구멍 뭉치처럼 보이게 한다.
const SCOOP_CLUSTER_CHANCE := 0.22
const DIRT_COLOR_DEPTH_SCALE := 7.5
const MAX_SCOOP_HISTORY := 18

@export var grass_texture: Texture2D
@export var dirt_texture: Texture2D

var _orig_x: PackedFloat32Array = []
var _orig_z: PackedFloat32Array = []
var _height_field: PackedFloat32Array = []
var _uvs: PackedVector2Array = []
var _indices: PackedInt32Array = []
var _vertex_count := 0
var _scoop_history: Array[Vector2] = []
var _tracked_max_depth := 0.0
var _rng := RandomNumberGenerator.new()

func _ready() -> void:
	_rng.randomize()
	_build_grid()
	_setup_material()
	_rebuild_geometry()

func _build_grid() -> void:
	var verts_per_side := SEGS + 1
	_vertex_count = verts_per_side * verts_per_side
	_orig_x.resize(_vertex_count)
	_orig_z.resize(_vertex_count)
	_height_field.resize(_vertex_count)
	_uvs.resize(_vertex_count)
	var half := GROUND_SIZE * 0.5

	var i := 0
	for iz in range(verts_per_side):
		for ix in range(verts_per_side):
			_orig_x[i] = lerp(-half, half, float(ix) / SEGS)
			_orig_z[i] = lerp(-half, half, float(iz) / SEGS)
			_height_field[i] = 0.0
			_uvs[i] = Vector2(float(ix) / SEGS, float(iz) / SEGS)
			i += 1

	_indices.clear()
	for iz in range(SEGS):
		for ix in range(SEGS):
			var a := iz * verts_per_side + ix
			var b := a + 1
			var c := a + verts_per_side
			var d := c + 1
			_indices.append(a); _indices.append(b); _indices.append(c)
			_indices.append(b); _indices.append(d); _indices.append(c)

func _setup_material() -> void:
	var mat := ShaderMaterial.new()
	mat.shader = preload("res://shaders/ground.gdshader")
	mat.set_shader_parameter("grass_tex", grass_texture if grass_texture else _load_texture("res://assets/textures/grass.jpg", ProceduralTextures.make_grass))
	mat.set_shader_parameter("dirt_tex", dirt_texture if dirt_texture else _load_texture("res://assets/textures/dirt.png", ProceduralTextures.make_dirt))
	material_override = mat

func _load_texture(path: String, fallback: Callable) -> Texture2D:
	if ResourceLoader.exists(path):
		var tex: Texture2D = load(path)
		if tex:
			return tex
	return fallback.call()

func _wall_noise(x: float, z: float) -> float:
	return 0.07 * sin(x * 3.1 + z * 1.7) \
		+ 0.05 * sin(x * 5.3 - z * 2.9) \
		+ 0.04 * sin((x + z) * 4.4)

func _keep_inside_dig_zone(x: float, z: float, margin: float = 0.04) -> Vector2:
	var r := Vector2(x, z).length()
	var max_r := DIG_ZONE_RADIUS - margin
	if r > max_r:
		var s := max_r / r
		return Vector2(x * s, z * s)
	return Vector2(x, z)

func _remember_scoop(x: float, z: float) -> void:
	_scoop_history.append(Vector2(x, z))
	if _scoop_history.size() > MAX_SCOOP_HISTORY:
		_scoop_history.pop_front()

func _pick_recent_scoop() -> Vector2:
	var recent_count := mini(10, _scoop_history.size())
	var idx_from_end := int(pow(_rng.randf(), 1.6) * recent_count)
	return _scoop_history[_scoop_history.size() - 1 - idx_from_end]

func apply_scoop(scoop_x: float, scoop_z: float, scoop_radius: float, scoop_depth: float) -> void:
	var seed_a := _rng.randf() * TAU
	var seed_b := _rng.randf() * TAU
	var seed_c := _rng.randf() * 10.0
	# 예전엔 발굴이 진행될수록(phase) 거칠기가 커졌는데, 뼈 하나를 다 팔 때마다 phase가
	# 0으로 리셋돼 "막바지엔 거칠게" 로직이 뼈 개수만큼 반복 적용되며 특정 구간만 계속
	# 뾰족해지는 문제가 있었다. 이제 삽질마다 거칠기를 독립적으로 무작위로 뽑아서, 파낼수록
	# 점점 날카로워지는 대신 매번 제각각 울퉁불퉁하게 — 전체적으로 고르게 불규칙해지게 한다.
	var roughness := _rng.randf_range(0.08, 0.21)
	var micro_bump := _rng.randf_range(0.018, 0.073)

	for i in _vertex_count:
		var x := _orig_x[i]
		var z := _orig_z[i]
		var dx := x - scoop_x
		var dz := z - scoop_z
		var theta := atan2(dz, dx)

		var angular_warp := 1.0 \
			+ sin(theta * 3.0 + seed_a) * (0.10 + roughness) \
			+ sin(theta * 7.0 + seed_b) * (0.05 + roughness * 0.45) \
			+ _wall_noise(x * 1.55 + seed_c, z * 1.55 - seed_c) * (0.12 + roughness * 0.35)

		var effective_radius := scoop_radius * clampf(angular_warp, 0.68, 1.34)
		var r := sqrt(dx * dx + dz * dz)
		if r < effective_radius:
			var t := r / effective_radius
			var rounded := cos(t * PI * 0.5)
			var profile := pow(maxf(rounded, 0.0), 1.2)

			var edge_noise := _wall_noise(x * 1.25, z * 1.25)
			var ripple := sin((t * 9.0) + seed_a * 0.7 + edge_noise * 3.0) * micro_bump
			var jagged := clampf(1.0 + edge_noise * (0.16 + roughness * 0.30) + ripple, 0.80, 1.26)
			var shoulder_spread := 1.0 + smoothstep(0.42, 0.78, t) * (1.0 - smoothstep(0.88, 1.0, t)) * 0.10
			var dig := scoop_depth * profile * jagged * shoulder_spread
			# 겹쳐 파도 한 지점만 계속 깊어지지 않도록 최대 깊이에서 막는다 — 안 그러면
			# 뼈 개수만큼 반복되는 삽질이 같은 자리에 계속 쌓여 뾰족한 깔때기가 됐다.
			_height_field[i] = maxf(_height_field[i] - dig, -MAX_DIG_DEPTH)
			if -_height_field[i] > _tracked_max_depth:
				_tracked_max_depth = -_height_field[i]

	_rebuild_geometry()

func _rebuild_geometry() -> void:
	var verts := PackedVector3Array()
	var colors := PackedColorArray()
	verts.resize(_vertex_count)
	colors.resize(_vertex_count)

	for i in _vertex_count:
		var dug := _height_field[i]
		var y := dug if dug < -0.01 else 0.0
		verts[i] = Vector3(_orig_x[i], y, _orig_z[i])
		var depth := maxf(0.0, -dug)
		var depth_ratio := 1.0 - exp(-depth / DIRT_COLOR_DEPTH_SCALE) if depth > 0.01 else 0.0
		colors[i] = Color(depth_ratio, 0.0, 0.0, 1.0)

	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	for idx in _indices:
		st.set_uv(_uvs[idx])
		st.set_color(colors[idx])
		st.add_vertex(verts[idx])
	st.generate_normals(true)
	st.index()
	mesh = st.commit()

## progress(현재 뼈의 0~100% 진행도)는 뼈 하나를 다 팔 때마다 0으로 리셋된다 — 예전엔
## 이 값으로 "막바지엔 중앙으로, 좁고 깊게" 파이도록 만들었는데, 그 로직이 뼈 개수만큼
## 반복 적용되면서 매번 같은 원점 근처가 겹쳐 파여 뾰족하고 깊은 깔때기 모양이 됐다.
## 이제 위치·반경·깊이 모두 progress와 무관하게 매번 새로 뽑아, 발굴 구역 전체에 걸쳐
## 넓고 불규칙하게(울퉁불퉁하게) 파이도록 한다. 인자는 호출부와의 호환을 위해 남겨둔다.
func dig_random_scoop(_progress: float) -> Vector2:
	var scoop_x: float
	var scoop_z: float
	if _scoop_history.size() > 2 and _rng.randf() < SCOOP_CLUSTER_CHANCE:
		var anchor := _pick_recent_scoop()
		var angle := _rng.randf() * TAU
		var jitter_radius := _rng.randf_range(1.05, 2.0)
		var point := _keep_inside_dig_zone(
			anchor.x + cos(angle) * jitter_radius,
			anchor.y + sin(angle) * jitter_radius
		)
		scoop_x = point.x
		scoop_z = point.y
	else:
		# 반지름을 그냥 균등분포로 뽑으면(randf() * RADIUS) 중심 쪽 면적이 더 좁아서 오히려
		# 점이 중앙에 몰린다 — sqrt를 취해야 구역 "면적" 전체에 걸쳐 고르게 흩어진다.
		var angle := _rng.randf() * TAU
		var r := DIG_ZONE_RADIUS * sqrt(_rng.randf())
		scoop_x = cos(angle) * r
		scoop_z = sin(angle) * r

	var scoop_radius := _rng.randf_range(SCOOP_RADIUS_MIN, SCOOP_RADIUS_MAX)
	var scoop_depth := _rng.randf_range(SCOOP_DEPTH_MIN, SCOOP_DEPTH_MAX)

	apply_scoop(scoop_x, scoop_z, scoop_radius, scoop_depth)
	_remember_scoop(scoop_x, scoop_z)
	return Vector2(scoop_x, scoop_z)

func reset() -> void:
	_tracked_max_depth = 0.0
	_scoop_history.clear()
	for i in _vertex_count:
		_height_field[i] = 0.0
	_rebuild_geometry()

## 메인 발굴 지형 주변을 채우는, 항상 잔디인 평면 타일 (dirtAmount=0 고정).
## depth를 안 주면 정사각형이 된다 — 좁고 긴 여백(팀 사이 틈 등)을 채울 때는 따로 준다.
static func build_flat_tile_mesh(width: float, depth: float = -1.0) -> ArrayMesh:
	var half_x := width * 0.5
	var half_z := (depth if depth > 0.0 else width) * 0.5
	var verts := [
		Vector3(-half_x, 0.0, -half_z),
		Vector3(half_x, 0.0, -half_z),
		Vector3(-half_x, 0.0, half_z),
		Vector3(half_x, 0.0, half_z),
	]
	var uvs := [
		Vector2(0.0, 0.0),
		Vector2(1.0, 0.0),
		Vector2(0.0, 1.0),
		Vector2(1.0, 1.0),
	]
	var order := [0, 1, 2, 1, 3, 2]

	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	for idx in order:
		st.set_uv(uvs[idx])
		st.set_color(Color(0.0, 0.0, 0.0, 1.0))
		st.add_vertex(verts[idx])
	st.generate_normals(true)
	st.index()
	return st.commit()

## build_flat_tile_mesh와 짝을 이루는 잔디 전용 머티리얼 — 실제 발굴 지형과 같은
## 셰이더/텍스처를 써서 이어붙였을 때 이질감이 없게 한다.
static func build_flat_material() -> ShaderMaterial:
	var mat := ShaderMaterial.new()
	mat.shader = preload("res://shaders/ground.gdshader")
	var grass_tex: Texture2D = load("res://assets/textures/grass.jpg") if ResourceLoader.exists("res://assets/textures/grass.jpg") else ProceduralTextures.make_grass()
	var dirt_tex: Texture2D = load("res://assets/textures/dirt.png") if ResourceLoader.exists("res://assets/textures/dirt.png") else ProceduralTextures.make_dirt()
	mat.set_shader_parameter("grass_tex", grass_tex)
	mat.set_shader_parameter("dirt_tex", dirt_tex)
	return mat
