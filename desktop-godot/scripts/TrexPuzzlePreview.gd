extends Node3D

var _model: TrexPuzzleModel
var _piece_index := 0
var _label: Label

func _ready() -> void:
	_build_environment()
	_model = TrexPuzzleModel.new()
	add_child(_model)
	_model.show_assembled()
	_build_hud()

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed:
		if event.keycode == KEY_A:
			_model.show_assembled()
			_label.text = "완성 골격 · S: 흩뜨리기 · ←/→: 조각 확인"
		elif event.keycode == KEY_S:
			_model.scatter(20260725)
			_label.text = "13개 퍼즐 조각 배치 · A: 완성"
		elif event.keycode == KEY_LEFT:
			_show_piece(-1)
		elif event.keycode == KEY_RIGHT:
			_show_piece(1)

func _show_piece(direction: int) -> void:
	_piece_index = posmod(_piece_index + direction, _model.get_piece_ids().size())
	var piece_id := _model.get_piece_ids()[_piece_index]
	_model.show_only_piece(piece_id)
	_label.text = "%02d/13  %s (%s)" % [
		_piece_index + 1,
		_model.get_piece_label(piece_id),
		piece_id,
	]

func _build_environment() -> void:
	var environment := Environment.new()
	environment.background_mode = Environment.BG_COLOR
	environment.background_color = Color(0.055, 0.067, 0.09)
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.ambient_light_color = Color(0.75, 0.82, 1.0)
	environment.ambient_light_energy = 1.4
	var world := WorldEnvironment.new()
	world.environment = environment
	add_child(world)

	var light := DirectionalLight3D.new()
	light.rotation_degrees = Vector3(-50, -35, 0)
	light.light_energy = 2.0
	light.shadow_enabled = true
	add_child(light)

	var camera := Camera3D.new()
	camera.position = Vector3(0, 2.4, 11.5)
	camera.look_at_from_position(camera.position, Vector3(0, 1.5, 0))
	camera.fov = 48.0
	camera.current = true
	add_child(camera)

func _build_hud() -> void:
	var layer := CanvasLayer.new()
	add_child(layer)
	_label = Label.new()
	_label.text = "완성 골격 · S: 흩뜨리기 · ←/→: 조각 확인"
	_label.position = Vector2(24, 24)
	_label.add_theme_font_size_override("font_size", 24)
	layer.add_child(_label)
