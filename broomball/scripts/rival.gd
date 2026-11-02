extends Node3D

const Art = preload("res://broomball/scripts/art.gd")

var game
var role := "chaser"
var index := 0
var speed := 26.0
var stun := 0.0
var visual: Node3D
var flight_time := 0.0


func _ready() -> void:
	var color := Color("294f7d")
	var accent := Color("b9d6e8")
	if role == "keeper":
		color = Color("315e58")
		accent = Color("e5cb75")
		speed = 29.0
	elif role == "seeker":
		color = Color("493b78")
		accent = Color("d7c1ff")
		speed = 31.0
	visual = Art.rider(color, accent, false)
	add_child(visual)


func _physics_process(delta: float) -> void:
	flight_time += delta
	stun = maxf(0.0, stun - delta)
	visual.position.y = sin(flight_time * 5.0 + float(index)) * 0.055
	if game == null or not game.is_playing() or stun > 0.0:
		return
	var target: Vector3 = game.get_rival_target(self)
	var direction := target - global_position
	if direction.length() < 0.4:
		return
	direction = direction.normalized()
	var pace := speed
	if role == "chaser" and game.quaffle_carrier == self:
		pace += 2.0
	global_position += direction * pace * delta
	global_position.y = clampf(global_position.y, 4.0, 38.0)
	var desired_yaw := atan2(-direction.x, -direction.z)
	var yaw_difference := wrapf(desired_yaw - rotation.y, -PI, PI)
	rotation.y = lerp_angle(rotation.y, desired_yaw, 1.0 - exp(-delta * 4.0))
	visual.rotation.z = lerpf(visual.rotation.z, clampf(yaw_difference, -0.6, 0.6), delta * 4.0)
	visual.rotation.x = lerpf(visual.rotation.x, -direction.y * 0.25, delta * 3.0)

	if role == "chaser" and game.quaffle_carrier == self:
		var goal: Vector3 = game.closest_goal(game.home_goals, global_position)
		if global_position.distance_to(goal) < 27.0:
			game.rival_throw(self)


func apply_hit(direction: Vector3) -> void:
	stun = 1.6
	global_position += direction.normalized() * 2.0
