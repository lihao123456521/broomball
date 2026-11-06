extends Node3D

const Art = preload("res://broomball/scripts/art.gd")

var home_goals: Array[Vector3] = []
var away_goals: Array[Vector3] = []
var rng := RandomNumberGenerator.new()


func _ready() -> void:
	rng.seed = 73
	_build_environment()
	_build_pitch()
	_build_stands()
	_build_goals()
	_build_airwalls()
	_build_horizon()


func _build_environment() -> void:
	var world := WorldEnvironment.new()
	var environment := Environment.new()
	var sky := Sky.new()
	var sky_material := ProceduralSkyMaterial.new()
	sky_material.sky_top_color = Color("172443")
	sky_material.sky_horizon_color = Color("d58b78")
	sky_material.ground_bottom_color = Color("182039")
	sky_material.ground_horizon_color = Color("ba7b72")
	sky_material.sky_curve = 0.2
	sky_material.ground_curve = 0.18
	sky.sky_material = sky_material
	environment.background_mode = Environment.BG_SKY
	environment.sky = sky
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.ambient_light_color = Color("a9b8df")
	environment.ambient_light_energy = 0.52
	environment.reflected_light_source = Environment.REFLECTION_SOURCE_SKY
	environment.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	environment.fog_enabled = true
	environment.fog_light_color = Color("7784a4")
	environment.fog_density = 0.00125
	environment.fog_sky_affect = 0.18
	environment.glow_enabled = true
	environment.glow_intensity = 0.65
	world.environment = environment
	add_child(world)

	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-42, -32, 0)
	sun.light_color = Color("ffd4a0")
	sun.light_energy = 1.35
	sun.shadow_enabled = true
	sun.directional_shadow_max_distance = 180.0
	sun.shadow_blur = 2.0
	add_child(sun)

	var fill := DirectionalLight3D.new()
	fill.rotation_degrees = Vector3(-25, 145, 0)
	fill.light_color = Color("718fd0")
	fill.light_energy = 0.34
	add_child(fill)


func _build_pitch() -> void:
	var base := Art.cylinder(self, 1.0, 1.2, Vector3(0, -0.62, 0), Color("173e32"), -1.0, 96)
	base.scale = Vector3(59, 1, 80)
	var skirt := Art.cylinder(self, 1.0, 2.0, Vector3(0, -1.7, 0), Color("b28a45"), -1.0, 96)
	skirt.scale = Vector3(60, 1, 81)
	var ground_body := StaticBody3D.new()
	ground_body.name = "PitchCollision"
	add_child(ground_body)
	var ground_collision := CollisionShape3D.new()
	var ground_shape := BoxShape3D.new()
	ground_shape.size = Vector3(112, 0.8, 152)
	ground_collision.shape = ground_shape
	ground_collision.position.y = -0.45
	ground_body.add_child(ground_collision)

	for i in range(11):
		var z := -60.0 + float(i) * 12.0
		var width := 53.0 * sqrt(max(0.0, 1.0 - pow(z / 77.0, 2.0)))
		var color := Color("28644b") if i % 2 == 0 else Color("2f7054")
		Art.box(self, Vector3(width * 2.0, 0.055, 12.05), Vector3(0, 0.025, z), color)

	var outer: PackedVector3Array = []
	var inner: PackedVector3Array = []
	for i in range(97):
		var angle := float(i) * TAU / 96.0
		outer.append(Vector3(sin(angle) * 55.5, 0.12, cos(angle) * 76.5))
		inner.append(Vector3(sin(angle) * 52.8, 0.12, cos(angle) * 73.8))
	for i in range(96):
		Art.beam(self, outer[i], outer[i + 1], 0.12, Color("e7c779"), 0.35)
		if i % 2 == 0:
			Art.beam(self, inner[i], inner[i + 1], 0.075, Color("dce8d5"))

	var center_ring := Art.torus(self, 9.82, 10.0, Vector3(0, 0.13, 0), Color("e9ddae"))
	center_ring.scale = Vector3(1, 1, 1.25)
	Art.box(self, Vector3(45, 0.06, 0.16), Vector3(0, 0.12, 0), Color("e9ddae"))
	var crest := Art.torus(self, 2.65, 2.9, Vector3(0, 0.15, 0), Color("e7c779"), 0.45)
	crest.scale = Vector3(1, 1, 1.25)
	for side in [-1.0, 1.0]:
		var wing := Art.box(self, Vector3(3.5, 0.06, 0.7), Vector3(side * 3.4, 0.14, 0), Color("e7c779"), 0.3)
		wing.rotation.y = side * 0.35


func _build_stands() -> void:
	var crimson := Color("732d3d")
	var navy := Color("233c61")
	var stone := Color("303849")
	var gold := Color("cda85c")
	for section in range(28):
		var angle := float(section) * TAU / 28.0
		var team := crimson if section % 2 == 0 else navy
		for tier in range(3):
			var radius_x := 72.0 + float(tier) * 3.0
			var radius_z := 91.0 + float(tier) * 3.0
			var tier_root := Node3D.new()
			tier_root.position = Vector3(sin(angle) * radius_x, 1.0 + float(tier) * 2.35, cos(angle) * radius_z)
			tier_root.rotation.y = angle
			add_child(tier_root)
			Art.box(tier_root, Vector3(17.2, 1.55, 5.2), Vector3.ZERO, stone)
			Art.box(tier_root, Vector3(16.8, 0.18, 4.6), Vector3(0, 0.86, 0), team)
			Art.beam(tier_root, Vector3(-8.3, 1.25, -2.15), Vector3(8.3, 1.25, -2.15), 0.075, gold, 0.5)
			for seat in range(5):
				var x := -6.4 + float(seat) * 3.2
				var shirt := team.lightened(rng.randf_range(-0.08, 0.22))
				Art.box(tier_root, Vector3(0.65, 0.75, 0.55), Vector3(x, 1.35, 0.25), shirt)
				Art.sphere(tier_root, 0.24, Vector3(x, 1.96, 0.25), Color("d5a37e"))
		if section % 2 == 0:
			var banner_root := Node3D.new()
			banner_root.position = Vector3(sin(angle) * 70.0, 7.5, cos(angle) * 89.0)
			banner_root.rotation.y = angle
			add_child(banner_root)
			_make_flag(banner_root, Vector3.ZERO, team, 5.5, 2.6)

	for x in [-68.0, 68.0]:
		for z in [-76.0, 76.0]:
			_make_tower(Vector3(x, 0, z), crimson if x * z > 0 else navy)


func _make_tower(position: Vector3, color: Color) -> void:
	var root := Node3D.new()
	root.position = position
	add_child(root)
	Art.cylinder(root, 3.0, 22.0, Vector3(0, 10.5, 0), Color("3b4052"), 2.35, 12)
	Art.cylinder(root, 3.6, 0.65, Vector3(0, 20.8, 0), Color("d0aa60"), -1.0, 16, 0.5)
	Art.cylinder(root, 4.2, 6.5, Vector3(0, 25.0, 0), color.darkened(0.15), 0.0, 12)
	Art.cylinder(root, 0.12, 6.0, Vector3(0, 30.5, 0), Color("d6b76f"), -1.0, 8, 0.6)
	Art.sphere(root, 0.38, Vector3(0, 33.6, 0), Color("ffe39a"), 0.4, 2.0)
	for side in [-1.0, 1.0]:
		Art.box(root, Vector3(0.75, 2.4, 0.25), Vector3(side * 1.1, 17.2, -2.3), Color("f5c877"), 0.1, 1.3)
	_make_flag(root, Vector3(2.3, 30.4, 0), color, 4.6, 2.2)


func _make_flag(parent: Node3D, position: Vector3, color: Color, width: float, height: float) -> void:
	var mesh := PlaneMesh.new()
	mesh.size = Vector2(width, height)
	mesh.subdivide_width = 12
	mesh.subdivide_depth = 2
	var node := MeshInstance3D.new()
	node.mesh = mesh
	node.position = position
	node.rotation.x = PI * 0.5
	var shader_material := ShaderMaterial.new()
	shader_material.shader = preload("res://broomball/scripts/flag.gdshader")
	shader_material.set_shader_parameter("flag_color", color)
	node.material_override = shader_material
	parent.add_child(node)


func _build_goals() -> void:
	for side in [-1.0, 1.0]:
		for i in range(3):
			var position := Vector3((float(i) - 1.0) * 12.0, 10.0 if i != 1 else 15.0, side * 61.0)
			if side > 0:
				home_goals.append(position)
			else:
				away_goals.append(position)
			Art.cylinder(self, 0.24, position.y, Vector3(position.x, position.y * 0.5, position.z), Color("caa354"), -1.0, 16, 0.75)
			Art.cylinder(self, 0.72, 0.35, Vector3(position.x, 0.18, position.z), Color("e2be68"), -1.0, 20, 0.65)
			var hoop_color := Color("f3ce71") if side > 0.0 else Color("81baff")
			var halo_color := Color("fff0ac") if side > 0.0 else Color("c4e7ff")
			var hoop := Art.torus(self, 3.35, 3.72, position, hoop_color, 0.78, 0.65)
			hoop.rotation.x = PI * 0.5
			var halo := Art.torus(self, 3.7, 3.79, position, halo_color, 0.4, 1.5)
			halo.rotation.x = PI * 0.5


func _build_airwalls() -> void:
	var wall_color := Color(0.55, 0.78, 0.95, 0.2)
	var top_color := Color(0.86, 0.75, 0.43, 0.38)
	for i in range(64):
		var angle := float(i) * TAU / 64.0
		var next_angle := float(i + 1) * TAU / 64.0
		var bottom := Vector3(sin(angle) * 55.2, 1.0, cos(angle) * 74.5)
		var top := Vector3(bottom.x, 39.5, bottom.z)
		var next_top := Vector3(sin(next_angle) * 55.2, 39.5, cos(next_angle) * 74.5)
		Art.beam(self, top, next_top, 0.055, top_color)
		if i % 4 == 0:
			Art.beam(self, bottom, top, 0.035, wall_color)


func _build_horizon() -> void:
	for i in range(24):
		var angle := float(i) * TAU / 24.0
		var distance := rng.randf_range(270.0, 420.0)
		var height := rng.randf_range(34.0, 78.0)
		var radius := rng.randf_range(24.0, 48.0)
		var color := Color("2d3954").lightened(rng.randf_range(-0.08, 0.08))
		Art.cylinder(self, radius, height, Vector3(sin(angle) * distance, height * 0.5 - 15.0, cos(angle) * distance), color, 0.0, 5)

	for i in range(13):
		var angle := float(i) * TAU / 13.0 + 0.2
		var cloud_root := Node3D.new()
		cloud_root.position = Vector3(sin(angle) * rng.randf_range(125.0, 190.0), rng.randf_range(42.0, 67.0), cos(angle) * rng.randf_range(125.0, 190.0))
		add_child(cloud_root)
		for puff in range(4):
			var cloud := Art.sphere(cloud_root, rng.randf_range(3.0, 5.5), Vector3(float(puff) * 4.2, rng.randf_range(-1.0, 1.0), rng.randf_range(-2.0, 2.0)), Color("c8c5d3"))
			cloud.scale = Vector3(1.6, 0.65, 1.0)

	Art.sphere(self, 9.0, Vector3(-115, 92, -205), Color("ffe6b0"), 0.0, 2.0)
