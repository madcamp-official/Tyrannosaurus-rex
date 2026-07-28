extends MeshInstance3D
class_name GroundDig

const GROUND_SIZE := 16.0
const SEGS := 64
const DIG_ZONE_RADIUS := 3.8
const SCOOP_RADIUS_MIN := 1.3
const SCOOP_RADIUS_MAX := 2.3
const SCOOP_DEPTH_MIN := 0.4
const SCOOP_DEPTH_MAX := 0.95
# 같은 지점이 여러 번 겹쳐 파여도 이 이상 깊어지지 않게 막아, 한 곳만 뾰족하게
# 깊어지는 대신 구덩이 전체가 고르게 울퉁불퉁한 깊이를 유지하게 한다.
const MAX_DIG_DEPTH := 1.9
# 바닥이 이 최대 깊이를 "하나의 평평한 값"으로 막으면, 삽질이 계속 쌓일수록 점점 더 많은
# 정점이 똑같은 값에 눌러붙어 결국 넓은 구간이 판판해진다 — 발굴이 진행될수록 오히려
# 매끈해지던 원인이 이것이다. 막는 깊이 자체를 위치별로 들쭉날쭉하게 만들어, 다 파여
# 눌러붙은 바닥도 평평한 바닥이 아니라 울퉁불퉁한 "암반"처럼 보이게 한다.
const FLOOR_NOISE_AMPLITUDE := 0.65
# 매번 완전히 새 위치를 뽑는 대신, 이 확률로만 최근 삽질 근처에 이어 파서 뼈 하나짜리
# 매끈한 원이 아니라 군데군데 붙어있는 불규칙한 구멍 뭉치처럼 보이게 한다.
const SCOOP_CLUSTER_CHANCE := 0.15
# 스쿱 "중심"을 DIG_ZONE_RADIUS 안에서만 뽑으면, 반경이 존 크기에 비해 상당히 커서
# 중심 근처 정점은 거의 모든 스쿱에 걸리는 반면, 가장자리 정점은 존 경계에 스쿱이
# 잘려나가 걸리는 빈도가 훨씬 낮아진다 — 위치를 아무리 균등하게 뽑아도 이 "경계 효과"
# 때문에 중앙만 계속 더 깊이 겹쳐 파여 뾰족해졌다. 스쿱 중심을 존보다 넓은 반경에서
# 뽑아 이 효과를 상쇄하고, 그 과정에서 존 바깥쪽(벽 부근)도 자연스럽게 그레이징된다.
const SCOOP_CENTER_RADIUS := 5.5
# 벽(존 경계 부근) 띠에 국지적으로 작고 얕은 자국을 추가로 놓아, 매끈한 경사면 대신
# 군데군데 움푹움푹 파인 성의없는 느낌을 낸다.
const WALL_NOTCH_CHANCE := 0.32
const WALL_NOTCH_MIN_R := 2.4
const WALL_NOTCH_MAX_R := 4.6
const WALL_NOTCH_RADIUS_MIN := 0.45
const WALL_NOTCH_RADIUS_MAX := 0.95
const WALL_NOTCH_DEPTH_MIN := 0.2
const WALL_NOTCH_DEPTH_MAX := 0.55
# 클러스터(연속 삽질)가 여러 번 이어져도 무한정 밖으로 표류하지 않게 잡아두는 한계 반경.
const CLUSTER_BOUND_RADIUS := 6.2
# 발굴된 뼈는 TrexPuzzleModel.scatter()가 항상 반경 6.5m에 놓는다 — 구덩이(중심+반경)가
# 거기까지 닿으면 뼈가 파인 자리 위에 놓인 것처럼 보인다. 어느 스쿱이든 "중심에서
# scoop_radius만큼 뻗은 끝"이 이 반경을 넘지 않도록 최종 위치를 한 번 더 잘라낸다.
const MAX_DIG_REACH := 5.8
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

## 위치에 고정으로 묶인(스쿱마다 안 변하는) 저주파+고주파 혼합 노이즈. 같은 정점은 몇 번을
## 다시 파도 항상 같은 값으로 수렴하므로, "다 파여 막힌" 바닥이 매번 다른 임의의 평평한
## 값이 아니라 하나의 고정된 울퉁불퉁한 모양으로 안정적으로 남는다.
func _floor_noise(x: float, z: float) -> float:
	return 0.28 * sin(x * 1.3 + z * 0.7) \
		+ 0.22 * sin(x * 2.6 - z * 1.9) \
		+ 0.16 * sin((x - z) * 2.1 + 3.7) \
		+ 0.14 * sin(x * 4.4 + z * 3.3)

func _keep_inside_radius(x: float, z: float, radius: float, margin: float = 0.04) -> Vector2:
	var r := Vector2(x, z).length()
	var max_r := radius - margin
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
	var roughness := _rng.randf_range(0.08, 0.26)
	var micro_bump := _rng.randf_range(0.018, 0.09)
	# 프로필 지수도 스쿱마다 무작위로 — 1보다 작으면 바닥이 넓적한 못생긴 웅덩이,
	# 1보다 크면 중심이 뾰족한 모양이 되는데, 둘을 섞어야 "성의없이 판" 느낌이 난다.
	var profile_exp := _rng.randf_range(0.8, 1.4)

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
			var profile := pow(maxf(rounded, 0.0), profile_exp)

			var edge_noise := _wall_noise(x * 1.25, z * 1.25)
			var ripple := sin((t * 9.0) + seed_a * 0.7 + edge_noise * 3.0) * micro_bump
			var jagged := clampf(1.0 + edge_noise * (0.16 + roughness * 0.30) + ripple, 0.80, 1.26)
			var shoulder_spread := 1.0 + smoothstep(0.42, 0.78, t) * (1.0 - smoothstep(0.88, 1.0, t)) * 0.10
			var dig := scoop_depth * profile * jagged * shoulder_spread
			# 겹쳐 파도 한 지점만 계속 깊어지지 않도록 막되, 막는 깊이("바닥") 자체를
			# 위치별로 들쭉날쭉하게 둔다 — 하나의 평평한 값으로 막으면 삽질이 쌓일수록
			# 점점 더 많은 정점이 그 값에 눌러붙어 발굴이 진행될수록 오히려 매끈해졌다.
			var local_floor := -(MAX_DIG_DEPTH + _floor_noise(x, z) * FLOOR_NOISE_AMPLITUDE)
			_height_field[i] = maxf(_height_field[i] - dig, local_floor)
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

## progress(현재 뼈의 0~100% 진행도)는 뼈 하나를 다 팔 때마다 0으로 리셋되므로 더 이상
## 위치/반경/깊이를 여기에 연동하지 않는다 — 예전엔 "막바지엔 중앙으로, 좁고 깊게" 로직이
## 뼈 개수만큼 반복 적용돼 같은 원점 근처만 계속 겹쳐 파였다. 인자는 호출부와의 호환을
## 위해 남겨둔다.
func dig_random_scoop(_progress: float) -> Vector2:
	var scoop_x: float
	var scoop_z: float
	var scoop_radius: float
	var scoop_depth: float

	if _scoop_history.size() > 2 and _rng.randf() < SCOOP_CLUSTER_CHANCE:
		var anchor := _pick_recent_scoop()
		var angle := _rng.randf() * TAU
		var jitter_radius := _rng.randf_range(1.05, 2.2)
		var point := _keep_inside_radius(
			anchor.x + cos(angle) * jitter_radius,
			anchor.y + sin(angle) * jitter_radius,
			CLUSTER_BOUND_RADIUS
		)
		scoop_x = point.x
		scoop_z = point.y
		scoop_radius = _rng.randf_range(SCOOP_RADIUS_MIN, SCOOP_RADIUS_MAX)
		scoop_depth = _rng.randf_range(SCOOP_DEPTH_MIN, SCOOP_DEPTH_MAX)
	elif _rng.randf() < WALL_NOTCH_CHANCE:
		# 존 경계 부근의 좁은 띠에만 작고 얕은 자국을 놓아, 매끈한 경사면 대신 벽 쪽에도
		# 군데군데 움푹 파인 자국이 남게 한다.
		var angle := _rng.randf() * TAU
		var r := _rng.randf_range(WALL_NOTCH_MIN_R, WALL_NOTCH_MAX_R)
		scoop_x = cos(angle) * r
		scoop_z = sin(angle) * r
		scoop_radius = _rng.randf_range(WALL_NOTCH_RADIUS_MIN, WALL_NOTCH_RADIUS_MAX)
		scoop_depth = _rng.randf_range(WALL_NOTCH_DEPTH_MIN, WALL_NOTCH_DEPTH_MAX)
	else:
		# 스쿱 "중심"을 DIG_ZONE_RADIUS 안에서만 뽑으면(면적 균등분포를 쓰더라도) 존 경계에
		# 잘려나가는 스쿱이 많은 가장자리보다 중심이 훨씬 더 자주 겹쳐 파인다 — 그래서 중심을
		# 존보다 넓은 SCOOP_CENTER_RADIUS 안에서 면적 균등분포(sqrt)로 뽑아 이 경계 효과를
		# 상쇄한다. 결과적으로 존 바깥쪽도 자연스럽게 스쳐 파이며 넓어진다.
		var angle := _rng.randf() * TAU
		var r := SCOOP_CENTER_RADIUS * sqrt(_rng.randf())
		scoop_x = cos(angle) * r
		scoop_z = sin(angle) * r
		scoop_radius = _rng.randf_range(SCOOP_RADIUS_MIN, SCOOP_RADIUS_MAX)
		scoop_depth = _rng.randf_range(SCOOP_DEPTH_MIN, SCOOP_DEPTH_MAX)

	var reach_point := _keep_inside_radius(scoop_x, scoop_z, MAX_DIG_REACH - scoop_radius)
	scoop_x = reach_point.x
	scoop_z = reach_point.y

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
