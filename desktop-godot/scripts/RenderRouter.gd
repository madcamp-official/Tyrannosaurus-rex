extends Node
## Plan.md §11.3, §12.1. React가 보낸 렌더 명령을 장면별 핸들러로 분배한다.
## Day1 범위에서는 FULL_SNAPSHOT/INIT/PHASE_CHANGED를 보관만 하고, 실제 장면 반영은
## 각 Arena 장면이 구현되는 Day2+에서 latest_snapshot을 읽어가는 방식으로 이어진다.

signal snapshot_updated(snapshot: Dictionary)
signal message_routed(type: String, payload: Dictionary)

var latest_snapshot: Dictionary = {}
var latest_init: Dictionary = {}

func route(message: Dictionary) -> void:
	var type: String = message.get("type", "")
	var payload: Dictionary = message.get("payload", {})

	match type:
		"INIT":
			latest_init = payload
		"FULL_SNAPSHOT":
			latest_snapshot = payload
			snapshot_updated.emit(payload)
		_:
			pass

	message_routed.emit(type, payload)
