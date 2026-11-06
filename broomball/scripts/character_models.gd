extends RefCounted

const Art = preload("res://broomball/scripts/art.gd")
const WAND_TIP := Vector3(0.62, 1.1, -1.15)


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
	socket.position = WAND_TIP
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
	var torso := Art.cylinder(parent, 0.27, 0.84, Vector3(0, 1.15, 0.17), robe, 0.40, 10)
	torso.scale.z = 0.67
	torso.rotation.x = -0.28
	var seat := Art.sphere(parent, 0.28, Vector3(0, 0.63, 0.29), robe.darkened(0.22))
	seat.scale = Vector3(1.06, 0.75, 1.0)
	var waist := Art.cylinder(parent, 0.278, 0.1, Vector3(0, 0.77, 0.28), robe.darkened(0.3), 0.278, 10)
	waist.scale.z = 0.75
	waist.rotation.x = -0.28
	var cape := Art.cylinder(parent, 0.57, 1.22, Vector3(0, 1.22, 0.82), robe.darkened(0.34), 0.37, 8)
	cape.name = "Cape"
	cape.scale.z = 0.12
	cape.rotation.x = -1.02

	var broom_hand := Vector3(-0.095, 0.41, -0.84)
	var wand_hand := Vector3(0.54, 1.0, -0.66)
	for side in [-1.0, 1.0]:
		var shoulder := Vector3(side * 0.3, 1.47, 0.06)
		var elbow := Vector3(side * 0.48, 1.03, -0.24)
		var hand := broom_hand if side < 0.0 else wand_hand
		Art.beam(parent, shoulder, elbow, 0.145, robe)
		Art.sphere(parent, 0.136, elbow, robe)
		Art.beam(parent, elbow, hand, 0.105, robe.darkened(0.13))
		Art.sphere(parent, 0.103, hand, skin)

		var hip := Vector3(side * 0.19, 0.63, 0.29)
		var knee := Vector3(side * 0.43, 0.49, -0.29)
		var ankle := Vector3(side * 0.4, -0.025, 0.01)
		Art.beam(parent, hip, knee, 0.155, dark)
		Art.sphere(parent, 0.143, knee, dark)
		Art.beam(parent, knee, ankle, 0.113, dark.lightened(0.08))
		var boot := Art.sphere(parent, 0.15, ankle + Vector3(0, -0.04, -0.1), Color("392822"))
		boot.scale = Vector3(0.84, 0.69, 1.45)

	var wand := Art.beam(parent, wand_hand, WAND_TIP, 0.027, Color("976342"))
	wand.name = "Wand"
	Art.beam(parent, wand_hand, wand_hand.lerp(WAND_TIP, 0.32), 0.041, Color("50342a"))
	Art.sphere(parent, 0.34, Vector3(0, 1.94, 0.05), skin)
	var hair := Art.sphere(parent, 0.35, Vector3(0, 2.08, 0.11), hair_color)
	hair.name = "Hair"
	hair.scale = Vector3(1.02, 0.62, 1.02)
	var collar := Art.cylinder(parent, 0.26, 0.15, Vector3(0, 1.61, 0.05), scarf_color, 0.24, 12)
	collar.scale.z = 0.86
	Art.sphere(parent, 0.10, Vector3(0.18, 1.60, 0.19), scarf_color)
	var scarf := Art.box(parent, Vector3(0.17, 0.065, 1.03), Vector3(0.22, 1.55, 0.72), scarf_color)
	scarf.name = "ScarfTail"
	scarf.rotation.x = 0.1
	Art.box(scarf, Vector3(0.174, 0.071, 0.09), Vector3(0, 0, 0.34), robe)
	Art.box(scarf, Vector3(0.174, 0.071, 0.06), Vector3(0, 0, 0.46), robe)


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
