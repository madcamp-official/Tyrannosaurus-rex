extends MeshInstance3D
class_name GroundDig

const GROUND_SIZE := 16.0
const SEGS := 64
const DIG_ZONE_RADIUS := 3.45
const SCOOP_RADIUS_MIN := 1.32
const SCOOP_RADIUS_MAX := 2.1
const SCOOP_DEPTH_MIN := 0.5
const SCOOP_DEPTH_MAX := 1.15
const DIRT_COLOR_DEPTH_SCALE := 7.5
const MAX_SCOOP_HISTORY := 18
## 파낸 흙이 구덩이 바깥쪽에 둔덕으로 쌓이는 효과 — 파낸 양이 늘수록 둔덕도 점점 높아진다.
const PILE_RING_INNER := 3.6
const PILE_RING_OUTER := 5.2
const PILE_HEIGHT_MAX := 0.62
const PILE_VOLUME_SCALE := 9.0

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
var _total_dig_volume := 0.0
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

func apply_scoop(scoop_x: float, scoop_z: float, scoop_radius: float, scoop_depth: float, phase: float) -> void:
	var seed_a := _rng.randf() * TAU
	var seed_b := _rng.randf() * TAU
	var seed_c := _rng.randf() * 10.0
	var roughness := 0.08 + phase * 0.13
	var micro_bump := 0.018 + phase * 0.055

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
			var profile := pow(maxf(rounded, 0.0), lerp(1.15, 1.35, phase))

			var edge_noise := _wall_noise(x * 1.25, z * 1.25)
			var ripple := sin((t * 9.0) + seed_a * 0.7 + edge_noise * 3.0) * micro_bump
			var jagged := clampf(1.0 + edge_noise * (0.16 + roughness * 0.30) + ripple, 0.80, 1.26)
			var shoulder_spread := 1.0 + smoothstep(0.42, 0.78, t) * (1.0 - smoothstep(0.88, 1.0, t)) * 0.10
			var dig := scoop_depth * profile * jagged * shoulder_spread
			_height_field[i] -= dig
			if -_height_field[i] > _tracked_max_depth:
				_tracked_max_depth = -_height_field[i]

	_total_dig_volume += scoop_radius * scoop_depth
	_apply_dirt_pile()
	_rebuild_geometry()

## 파낸 만큼(누적 _total_dig_volume) 구덩이 바깥 고리(PILE_RING_INNER~OUTER)에 흙 둔덕을
## 쌓는다. 이미 파낸(음수) 자리는 절대 덮어쓰지 않는다 — 스쿱이 고리 안쪽까지 파고든
## 경우에도 구덩이가 항상 둔덕보다 우선한다.
func _apply_dirt_pile() -> void:
	var pile_ratio := 1.0 - exp(-_total_dig_volume / PILE_VOLUME_SCALE)
	var pile_height := PILE_HEIGHT_MAX * pile_ratio
	if pile_height <= 0.001:
		return
	for i in _vertex_count:
		if _height_field[i] < -0.001:
			continue
		var x := _orig_x[i]
		var z := _orig_z[i]
		var r := sqrt(x * x + z * z)
		if r < PILE_RING_INNER or r > PILE_RING_OUTER:
			continue
		var t := (r - PILE_RING_INNER) / (PILE_RING_OUTER - PILE_RING_INNER)
		var shape := sin(t * PI)  # 안쪽·바깥쪽 모두 0으로 사라지고 가운데가 볼록한 둔덕 단면
		var noise := _wall_noise(x * 1.4, z * 1.4)
		var jagged := clampf(1.0 + noise * 0.35, 0.55, 1.35)
		_height_field[i] = maxf(_height_field[i], pile_height * shape * jagged)

func _rebuild_geometry() -> void:
	var verts := PackedVector3Array()
	var colors := PackedColorArray()
	verts.resize(_vertex_count)
	colors.resize(_vertex_count)

	for i in _vertex_count:
		var dug := _height_field[i]
		var y := dug if absf(dug) > 0.01 else 0.0
		verts[i] = Vector3(_orig_x[i], y, _orig_z[i])
		var depth := absf(dug)
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

func dig_random_scoop(progress: float) -> Vector2:
	var phase := clampf(progress / 100.0, 0.0, 1.0)
	var cluster_chance := 0.04 + phase * 0.58

	var scoop_x: float
	var scoop_z: float
	if _scoop_history.size() > 2 and _rng.randf() < cluster_chance:
		var anchor := _pick_recent_scoop()
		var angle := _rng.randf() * TAU
		var side_min: float = lerp(1.22, 1.08, phase)
		var side_max: float = lerp(2.18, 1.88, phase)
		var jitter_radius: float = lerp(side_min, side_max, _rng.randf())
		var point := _keep_inside_dig_zone(
			anchor.x + cos(angle) * jitter_radius,
			anchor.y + sin(angle) * jitter_radius
		)
		scoop_x = point.x
		scoop_z = point.y
	else:
		var angle := _rng.randf() * TAU
		var center_bias: float = lerp(0.55, 2.15, phase)
		var r := DIG_ZONE_RADIUS * pow(_rng.randf(), center_bias)
		scoop_x = cos(angle) * r
		scoop_z = sin(angle) * r

	var scoop_radius := clampf(
		lerp(SCOOP_RADIUS_MAX, 1.58, phase) + (_rng.randf() - 0.5) * 0.16,
		SCOOP_RADIUS_MIN, SCOOP_RADIUS_MAX
	)
	var scoop_depth := clampf(
		lerp(SCOOP_DEPTH_MIN, 1.0, phase) + (_rng.randf() - 0.5) * 0.08,
		SCOOP_DEPTH_MIN, SCOOP_DEPTH_MAX
	)

	apply_scoop(scoop_x, scoop_z, scoop_radius, scoop_depth, phase)
	_remember_scoop(scoop_x, scoop_z)
	return Vector2(scoop_x, scoop_z)

func reset() -> void:
	_tracked_max_depth = 0.0
	_total_dig_volume = 0.0
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
