extends RefCounted

static var _materials: Dictionary = {}


static func material(color: Color, metallic: float = 0.0, emission: float = 0.0) -> StandardMaterial3D:
	var key := "%s/%.2f/%.2f" % [color.to_html(), metallic, emission]
	if _materials.has(key):
		return _materials[key]
	var result := StandardMaterial3D.new()
	result.albedo_color = color
	result.roughness = 0.72 if metallic < 0.5 else 0.3
	result.metallic = metallic
	if color.a < 0.99:
		result.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		result.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	if emission > 0.0:
		result.emission_enabled = true
		result.emission = color
		result.emission_energy_multiplier = emission
	_materials[key] = result
	return result


static func mesh_node(parent: Node3D, mesh: Mesh, position: Vector3, color: Color, metallic: float = 0.0, emission: float = 0.0) -> MeshInstance3D:
	var node := MeshInstance3D.new()
	node.mesh = mesh
	node.material_override = material(color, metallic, emission)
	node.position = position
	parent.add_child(node)
	return node


static func box(parent: Node3D, size: Vector3, position: Vector3, color: Color, metallic: float = 0.0, emission: float = 0.0) -> MeshInstance3D:
	var mesh := BoxMesh.new()
	mesh.size = size
	return mesh_node(parent, mesh, position, color, metallic, emission)


static func cylinder(parent: Node3D, radius: float, height: float, position: Vector3, color: Color, top_radius: float = -1.0, segments: int = 20, metallic: float = 0.0, emission: float = 0.0) -> MeshInstance3D:
	var mesh := CylinderMesh.new()
	mesh.bottom_radius = radius
	mesh.top_radius = radius if top_radius < 0.0 else top_radius
	mesh.height = height
	mesh.radial_segments = segments
	mesh.rings = 1
	return mesh_node(parent, mesh, position, color, metallic, emission)


static func sphere(parent: Node3D, radius: float, position: Vector3, color: Color, metallic: float = 0.0, emission: float = 0.0) -> MeshInstance3D:
	var mesh := SphereMesh.new()
	mesh.radius = radius
	mesh.height = radius * 2.0
	mesh.radial_segments = 20
	mesh.rings = 10
	return mesh_node(parent, mesh, position, color, metallic, emission)


static func torus(parent: Node3D, inner_radius: float, outer_radius: float, position: Vector3, color: Color, metallic: float = 0.0, emission: float = 0.0) -> MeshInstance3D:
	var mesh := TorusMesh.new()
	mesh.inner_radius = inner_radius
	mesh.outer_radius = outer_radius
	mesh.rings = 32
	mesh.ring_segments = 8
	return mesh_node(parent, mesh, position, color, metallic, emission)


static func beam(parent: Node3D, from: Vector3, to: Vector3, radius: float, color: Color, metallic: float = 0.0) -> MeshInstance3D:
	var direction := to - from
	var node := cylinder(parent, radius, direction.length(), (from + to) * 0.5, color, -1.0, 8, metallic)
	if direction.length_squared() > 0.0001:
		node.quaternion = Quaternion(Vector3.UP, direction.normalized())
	return node


static func rider(team_color: Color, accent: Color, hat: bool = true) -> Node3D:
	var root := Node3D.new()
	var leather := Color("3b241d")
	var wood := Color("8b5a32")
	var skin := Color("e7b78f")
	var dark := Color("141827")

	beam(root, Vector3(0, 0.35, 2.0), Vector3(0, 0.35, -2.35), 0.075, wood)
	var bristles := cylinder(root, 0.42, 1.35, Vector3(0, 0.35, 2.15), Color("9b6a35"), 0.07, 12)
	bristles.rotation.x = PI * 0.5
	for i in range(5):
		var angle := float(i) * TAU / 5.0
		beam(root, Vector3(0, 0.35, 1.45), Vector3(cos(angle) * 0.34, 0.35 + sin(angle) * 0.34, 2.7), 0.035, Color("c18a45"))

	box(root, Vector3(0.78, 0.92, 0.48), Vector3(0, 1.12, 0.22), team_color)
	var cape := box(root, Vector3(0.9, 1.25, 0.12), Vector3(0, 1.02, 0.62), team_color.darkened(0.28))
	cape.rotation.x = -0.28
	beam(root, Vector3(-0.28, 1.48, 0), Vector3(-0.62, 0.65, -0.72), 0.13, team_color)
	beam(root, Vector3(0.28, 1.48, 0), Vector3(0.62, 0.65, -0.72), 0.13, team_color)
	sphere(root, 0.14, Vector3(-0.62, 0.65, -0.72), skin)
	sphere(root, 0.14, Vector3(0.62, 0.65, -0.72), skin)
	beam(root, Vector3(-0.25, 0.78, 0.2), Vector3(-0.36, 0.18, -0.42), 0.16, dark)
	beam(root, Vector3(0.25, 0.78, 0.2), Vector3(0.36, 0.18, -0.42), 0.16, dark)
	sphere(root, 0.34, Vector3(0, 1.94, 0.05), skin)
	var hair := sphere(root, 0.35, Vector3(0, 2.08, 0.11), dark)
	hair.scale = Vector3(1.02, 0.62, 1.02)
	box(root, Vector3(0.82, 0.13, 0.52), Vector3(0, 1.62, 0.16), accent)
	var scarf := box(root, Vector3(0.18, 0.12, 1.25), Vector3(0.28, 1.58, 0.92), accent)
	scarf.rotation.x = -0.14
	if hat:
		cylinder(root, 0.54, 0.08, Vector3(0, 2.24, 0.08), dark, -1.0, 20)
		var hat_cone := cylinder(root, 0.4, 0.95, Vector3(0, 2.68, 0.13), dark, 0.02, 16)
		hat_cone.rotation.z = -0.12
	else:
		var goggles := torus(root, 0.11, 0.15, Vector3(0, 1.98, -0.28), accent, 0.65)
		goggles.rotation.x = PI * 0.5
	return root


static func snitch() -> Node3D:
	var root := Node3D.new()
	sphere(root, 0.48, Vector3.ZERO, Color("ffd76a"), 0.75, 2.2)
	var band := torus(root, 0.39, 0.5, Vector3.ZERO, Color("fff0a6"), 0.8, 1.0)
	band.rotation.x = PI * 0.5
	for side in [-1.0, 1.0]:
		var wing := sphere(root, 0.55, Vector3(side * 0.88, 0.08, 0), Color("eaf5ff"), 0.15, 0.7)
		wing.name = "WingL" if side < 0.0 else "WingR"
		wing.scale = Vector3(1.65, 0.12, 0.55)
		wing.rotation.z = side * 0.28
	var light := OmniLight3D.new()
	light.light_color = Color("ffd36a")
	light.light_energy = 1.8
	light.omni_range = 7.0
	root.add_child(light)
	return root
