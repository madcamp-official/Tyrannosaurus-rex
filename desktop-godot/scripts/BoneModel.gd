extends Node3D
class_name BoneModel

const BONE_COLOR := Color(0.953, 0.925, 0.847)

func _ready() -> void:
	var mat := StandardMaterial3D.new()
	mat.albedo_color = BONE_COLOR
	mat.roughness = 0.6

	var shaft := MeshInstance3D.new()
	var shaft_mesh := CylinderMesh.new()
	shaft_mesh.top_radius = 0.14
	shaft_mesh.bottom_radius = 0.14
	shaft_mesh.height = 1.6
	shaft.mesh = shaft_mesh
	shaft.material_override = mat
	shaft.rotation.z = PI / 2.0
	add_child(shaft)

	for x in [-0.8, 0.8]:
		for z in [-0.18, 0.18]:
			var knob := MeshInstance3D.new()
			var knob_mesh := SphereMesh.new()
			knob_mesh.radius = 0.26
			knob_mesh.height = 0.52
			knob.mesh = knob_mesh
			knob.material_override = mat
			knob.position = Vector3(x, 0.0, z)
			add_child(knob)
