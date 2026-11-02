extends RefCounted

const Art = preload("res://broomball/scripts/art.gd")


# Player rig contract: keep BroomModel, CharacterModel and SpellSocket as separate
# nodes so higher-resolution assets can replace either model without touching flight.
static func build(character_id: String) -> Node3D:
	var root := Node3D.new()
	root.name = "WizardRig"
	root.set_meta("character_id", character_id)
	var broom := Node3D.new()
	broom.name = "BroomModel"
	root.add_child(broom)
	var character := Node3D.new()
	character.name = "CharacterModel"
	root.add_child(character)
	var socket := Marker3D.new()
	socket.name = "SpellSocket"
	socket.position = Vector3(0.62, 1.1, -1.15)
	root.add_child(socket)

	_build_broom(broom, character_id)
	match character_id:
		"hermione":
			_build_wizard(character, Color("773247"), Color("edc975"), Color("4a2b22"))
			_build_hermione(character)
		"ron":
			_build_wizard(character, Color("873a35"), Color("e6bd65"), Color("a64e28"))
			_build_ron(character)
		_:
			_build_wizard(character, Color("8f2f45"), Color("f0c66d"), Color("171922"))
			_build_harry(character)
	return root


static func _build_broom(parent: Node3D, character_id: String) -> void:
	var wood := Color("9b6a38")
	var twig := Color("b77b3c")
	var length := 2.35
	if character_id == "hermione":
		wood = Color("6f4b32")
		twig = Color("c39455")
	elif character_id == "ron":
		wood = Color("765039")
		twig = Color("8c653e")
		length = 2.15
	var handle := Art.beam(parent, Vector3(0, 0.35, 1.85), Vector3(0, 0.35, -length), 0.075, wood)
	handle.name = "Handle"
	var bristles := Art.cylinder(parent, 0.42, 1.35, Vector3(0, 0.35, 2.15), twig, 0.07, 12)
	bristles.name = "Bristles"
	bristles.rotation.x = PI * 0.5
	for i in range(6):
		var angle := float(i) * TAU / 6.0
		Art.beam(parent, Vector3(0, 0.35, 1.45), Vector3(cos(angle) * 0.34, 0.35 + sin(angle) * 0.34, 2.7), 0.03, twig.lightened(0.18))


static func _build_wizard(parent: Node3D, robe: Color, scarf_color: Color, hair_color: Color) -> void:
	var skin := Color("e7b78f")
	var dark := Color("202131")
	Art.box(parent, Vector3(0.78, 0.92, 0.48), Vector3(0, 1.12, 0.22), robe)
	var cape := Art.box(parent, Vector3(0.9, 1.25, 0.12), Vector3(0, 1.02, 0.62), robe.darkened(0.28))
	cape.rotation.x = -0.28
	Art.beam(parent, Vector3(-0.28, 1.48, 0), Vector3(-0.62, 0.65, -0.72), 0.13, robe)
	Art.beam(parent, Vector3(0.28, 1.48, 0), Vector3(0.62, 0.65, -0.72), 0.13, robe)
	Art.sphere(parent, 0.14, Vector3(-0.62, 0.65, -0.72), skin)
	Art.sphere(parent, 0.14, Vector3(0.62, 0.65, -0.72), skin)
	Art.beam(parent, Vector3(-0.25, 0.78, 0.2), Vector3(-0.36, 0.18, -0.42), 0.16, dark)
	Art.beam(parent, Vector3(0.25, 0.78, 0.2), Vector3(0.36, 0.18, -0.42), 0.16, dark)
	Art.sphere(parent, 0.34, Vector3(0, 1.94, 0.05), skin)
	var hair := Art.sphere(parent, 0.35, Vector3(0, 2.08, 0.11), hair_color)
	hair.name = "Hair"
	hair.scale = Vector3(1.02, 0.62, 1.02)
	Art.box(parent, Vector3(0.82, 0.13, 0.52), Vector3(0, 1.62, 0.16), scarf_color)
	var scarf := Art.box(parent, Vector3(0.18, 0.12, 1.25), Vector3(0.28, 1.58, 0.92), scarf_color)
	scarf.rotation.x = -0.14


static func _build_harry(parent: Node3D) -> void:
	for side in [-1.0, 1.0]:
		var lens := Art.torus(parent, 0.105, 0.135, Vector3(side * 0.145, 1.98, -0.275), Color("34333a"), 0.6)
		lens.rotation.x = PI * 0.5
	Art.beam(parent, Vector3(-0.03, 1.98, -0.285), Vector3(0.03, 1.98, -0.285), 0.015, Color("34333a"), 0.6)
	Art.beam(parent, Vector3(0.055, 2.13, -0.265), Vector3(0.09, 2.06, -0.29), 0.012, Color("8e493c"))
	Art.beam(parent, Vector3(0.09, 2.06, -0.29), Vector3(0.045, 2.025, -0.295), 0.012, Color("8e493c"))


static func _build_hermione(parent: Node3D) -> void:
	var brown := Color("4a2b22")
	for side in [-1.0, 1.0]:
		var curl := Art.sphere(parent, 0.24, Vector3(side * 0.29, 1.86, 0.16), brown)
		curl.scale = Vector3(0.8, 1.8, 1.0)
	var back := Art.sphere(parent, 0.32, Vector3(0, 1.83, 0.29), brown)
	back.scale = Vector3(0.95, 1.35, 0.6)


static func _build_ron(parent: Node3D) -> void:
	var freckle := Color("b87755")
	for i in range(3):
		Art.sphere(parent, 0.018, Vector3(-0.09 + float(i) * 0.09, 1.91, -0.292), freckle)
	var hair_tuft := Art.box(parent, Vector3(0.36, 0.12, 0.22), Vector3(0.05, 2.23, -0.02), Color("a64e28"))
	hair_tuft.rotation.z = -0.18
