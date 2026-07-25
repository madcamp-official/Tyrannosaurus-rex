extends Node3D
class_name BoneModel

var _puzzle_model: TrexPuzzleModel
var _piece_index := 0

func _ready() -> void:
	_puzzle_model = TrexPuzzleModel.new()
	add_child(_puzzle_model)
	show_piece(0)

func show_piece(index: int) -> void:
	if not _puzzle_model:
		return
	var ids := _puzzle_model.get_piece_ids()
	_piece_index = posmod(index, ids.size())
	_puzzle_model.show_only_piece(ids[_piece_index])

func get_piece_count() -> int:
	return _puzzle_model.get_piece_ids().size() if _puzzle_model else 0
