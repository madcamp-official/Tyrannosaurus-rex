extends Control
class_name CrosshairOverlay
## Plan.md §12.5 "크로스헤어는 Godot의 2D CanvasLayer에서 팀 화면 기준 좌표로 표시한다".
## 화면을 좌/우로 나눠 A팀은 왼쪽 절반, B팀은 오른쪽 절반 기준으로 그린다.

var _crosshairs_by_team: Dictionary = {}  # team_id(String) -> Array[Dictionary]

func _ready() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	resized.connect(queue_redraw)

func set_team_crosshairs(team_id: String, crosshairs: Array) -> void:
	_crosshairs_by_team[team_id] = crosshairs
	queue_redraw()

func _draw() -> void:
	var half_width := size.x * 0.5
	for team_id in _crosshairs_by_team.keys():
		var x_offset := 0.0 if team_id == "A" else half_width
		var list: Array = _crosshairs_by_team[team_id]
		for entry in list:
			var point: Dictionary = entry.get("point", {"x": 0.5, "y": 0.5})
			var px := x_offset + float(point.get("x", 0.5)) * half_width
			var py := float(point.get("y", 0.5)) * size.y
			var col := Color.WHITE
			var color_hex: String = entry.get("color", "")
			if color_hex != "":
				col = Color(color_hex)
			draw_arc(Vector2(px, py), 14.0, 0, TAU, 24, col, 3.0)
			draw_line(Vector2(px - 20, py), Vector2(px + 20, py), col, 2.0)
			draw_line(Vector2(px, py - 20), Vector2(px, py + 20), col, 2.0)
