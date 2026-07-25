extends Node3D

const SHAKES_TO_REVEAL := 80

var _ground: GroundDig
var _bone: BoneModel
var _particles: CPUParticles3D
var _progress_bar: ProgressBar
var _found_label: Label
var _bone_count_label: Label

var _progress := 0.0
var _revealed := false
var _bone_count := 0
var _cam: Camera3D

func _ready() -> void:
	_build_scene()
	_reset_bone()

func _build_scene() -> void:
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color(0.749, 0.910, 0.961)
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color(1, 1, 1)
	env.ambient_light_energy = 1.1
	var world_env := WorldEnvironment.new()
	world_env.environment = env
	add_child(world_env)

	_cam = Camera3D.new()
	_cam.transform = Transform3D(Basis(), Vector3(0, 10.5, 7.5)).looking_at(Vector3(0, -1.2, 0), Vector3.UP)
	_cam.fov = 45.0
	_cam.near = 0.1
	_cam.far = 100.0
	add_child(_cam)
	_cam.current = true

	_ground = GroundDig.new()
	add_child(_ground)

	_bone = BoneModel.new()
	add_child(_bone)

	_particles = CPUParticles3D.new()
	_particles.emitting = false
	_particles.one_shot = true
	_particles.amount = 14
	_particles.lifetime = 0.8
	_particles.explosiveness = 1.0
	_particles.direction = Vector3(0, 1, 0)
	_particles.spread = 45.0
	_particles.gravity = Vector3(0, -9.8, 0)
	_particles.initial_velocity_min = 2.0
	_particles.initial_velocity_max = 5.0
	_particles.scale_amount_min = 0.6
	_particles.scale_amount_max = 0.9
	_particles.color = Color(0.42, 0.294, 0.18)
	var box := BoxMesh.new()
	box.size = Vector3(0.08, 0.08, 0.08)
	_particles.mesh = box
	add_child(_particles)

	var hud := CanvasLayer.new()
	add_child(hud)

	_progress_bar = ProgressBar.new()
	_progress_bar.max_value = 100
	_progress_bar.show_percentage = false
	_progress_bar.set_anchors_preset(Control.PRESET_CENTER_BOTTOM)
	_progress_bar.custom_minimum_size = Vector2(320, 24)
	_progress_bar.position = Vector2(-160, -60)
	hud.add_child(_progress_bar)

	_found_label = Label.new()
	_found_label.text = "🦴 뼈 발견!"
	_found_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_found_label.add_theme_font_size_override("font_size", 48)
	_found_label.modulate = Color(1, 1, 1, 0)
	_found_label.set_anchors_preset(Control.PRESET_CENTER_TOP)
	_found_label.custom_minimum_size = Vector2(480, 60)
	_found_label.position = Vector2(-240, 200)
	hud.add_child(_found_label)

	_bone_count_label = Label.new()
	_bone_count_label.text = "발굴한 뼈: 0개"
	_bone_count_label.position = Vector2(20, 20)
	hud.add_child(_bone_count_label)

	var hint_label := Label.new()
	hint_label.text = "화면 클릭 또는 스페이스바 = 흔들기 1회"
	hint_label.modulate = Color(1, 1, 1, 0.85)
	hint_label.set_anchors_preset(Control.PRESET_BOTTOM_RIGHT)
	hint_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	hint_label.custom_minimum_size = Vector2(320, 20)
	hint_label.position = Vector2(-336, -36)
	hud.add_child(hint_label)

func _process(delta: float) -> void:
	_cam.position.x += (0.0 - _cam.position.x) * delta * 2.0

func _unhandled_input(event: InputEvent) -> void:
	if _revealed:
		return
	if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		_on_dig_tick()
	elif event is InputEventKey and event.pressed and event.keycode == KEY_SPACE:
		_on_dig_tick()

func _on_dig_tick() -> void:
	_progress = minf(100.0, _progress + 100.0 / SHAKES_TO_REVEAL)
	_progress_bar.value = _progress

	var scoop_pos := _ground.dig_random_scoop(_progress)
	_particles.position = Vector3(scoop_pos.x, 0.3, scoop_pos.y)
	_particles.restart()
	_cam.position.x += (randf() - 0.5) * 0.2

	if _progress >= 100.0 and not _revealed:
		_revealed = true
		_reveal_bone()

func _reveal_bone() -> void:
	_bone_count += 1
	_bone_count_label.text = "발굴한 뼈: %d개" % _bone_count

	var tween := create_tween()
	tween.tween_property(_bone, "scale", Vector3.ONE, 1.2).set_trans(Tween.TRANS_BACK)
	tween.parallel().tween_property(_bone, "rotation:y", _bone.rotation.y + TAU, 1.2)

	_found_label.modulate.a = 1.0
	var msg_tween := create_tween()
	msg_tween.tween_interval(1.4)
	msg_tween.tween_property(_found_label, "modulate:a", 0.0, 0.4)
	msg_tween.tween_callback(_reset_site)

func _reset_site() -> void:
	_progress = 0.0
	_revealed = false
	_progress_bar.value = 0.0
	_ground.reset()
	_reset_bone()

func _reset_bone() -> void:
	if _bone_count > 0:
		_bone.show_piece(_bone_count % maxi(1, _bone.get_piece_count()))
	_bone.scale = Vector3.ZERO
	_bone.position.y = -4.2
	_bone.rotation.y = randf() * PI
