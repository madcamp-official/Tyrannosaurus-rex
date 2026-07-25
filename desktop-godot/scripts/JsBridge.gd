extends Node
## Plan.md §11.2~§11.5. React <-> Godot postMessage 브리지의 Godot 쪽 끝.
## Web export에서만 JavaScriptBridge가 존재하므로 에디터/데스크탑 실행에서는 조용히 비활성화된다.

const PROTOCOL_VERSION := 1
const SOURCE := "trex-godot"

var _receive_callback: JavaScriptObject
var _outgoing_sequence := 0
var _last_incoming_sequence := -1
var _is_web := false

func _ready() -> void:
	_is_web = OS.has_feature("web")
	if not _is_web:
		return

	_receive_callback = JavaScriptBridge.create_callback(_on_web_message)
	var window := JavaScriptBridge.get_interface("window")
	window.trexGodotReceive = _receive_callback

	send_to_react("GODOT_READY", {})

func _on_web_message(args: Array) -> void:
	if args.is_empty():
		return
	var json_text: String = args[0]
	var parsed = JSON.parse_string(json_text)
	if typeof(parsed) != TYPE_DICTIONARY:
		return
	if parsed.get("source") != "trex-react":
		return
	if parsed.get("version") != PROTOCOL_VERSION:
		return

	var sequence: int = int(parsed.get("sequence", -1))
	if sequence <= _last_incoming_sequence:
		return
	_last_incoming_sequence = sequence

	RenderRouter.route(parsed)

## §11.3 봉투 형식으로 감싸 React로 전송한다. Web export가 아니면 아무 것도 하지 않는다.
func send_to_react(type: String, payload: Dictionary, room_code: String = "") -> void:
	if not _is_web:
		return
	_outgoing_sequence += 1
	var envelope := {
		"source": SOURCE,
		"version": PROTOCOL_VERSION,
		"type": type,
		"sequence": _outgoing_sequence,
		"payload": payload,
	}
	if room_code != "":
		envelope["roomCode"] = room_code

	var window := JavaScriptBridge.get_interface("window")
	var origin: String = JavaScriptBridge.get_interface("location").origin
	window.parent.postMessage(JSON.stringify(envelope), origin)
