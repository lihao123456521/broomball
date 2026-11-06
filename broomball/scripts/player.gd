extends CharacterBody3D

const CharacterModels = preload("res://broomball/scripts/character_models.gd")
const CameraManager = preload("res://broomball/scripts/camera_manager.gd")

@export var MOVE_SPEED: float = 28.0
@export var BOOST_SPEED: float = 48.0
@export var FLY_SPEED: float = 16.0
@export var first_person: bool = false:
	set(value):
		first_person = value
		if not is_node_ready():
			return
		var arm: SpringArm3D = $CameraManager/Arm
		if is_instance_valid(view_tween):
			view_tween.kill()
		view_tween = create_tween()
		view_tween.tween_property(arm, "spring_length", 0.0 if first_person else 14.0, 0.25)
		if first_person:
			view_tween.tween_callback(_finish_view_transition)
		else:
			visual.visible = true
@export var gravity_enabled: bool = false:
	set(value):
		gravity_enabled = value
		if not gravity_enabled:
			velocity.y = 0.0
@export var collision_enabled: bool = true:
	set(value):
		collision_enabled = value
		if is_node_ready():
			$CollisionShapeBody.disabled = not collision_enabled
			$CollisionShapeRay.disabled = not collision_enabled
@export var acceleration: float = 30.0
@export var deceleration: float = 110.0
@export var air_acceleration: float = 60.0
@export var air_deceleration: float = 110.0
@export var vertical_accel: float = 40.0
@export var vertical_brake: float = 65.0
@export var turn_speed: float = 8.0
@export var pitch_speed: float = 6.0
@export var max_pitch_degrees: float = 45.0
@export var roll_enabled: bool = true
@export var roll_strength: float = 0.05
@export var max_roll_degrees: float = 25.0
@export var model_yaw_offset_deg: float = 0.0
@export var pitch_axis_yaw_offset_deg: float = 90.0

var game
var speed := 0.0
var stamina := 100.0
var hit_cooldown := 0.0
var boosting := false
var character_id := "harry"
var shield_time := 0.0
var visual: Node3D
var shield_mesh: MeshInstance3D
var camera: Camera3D
var aim_pivot: Node3D
var model_fix: Node3D
var flight_time := 0.0
var boundary_notice := 0.0
var _current_yaw := 0.0
var _current_pitch := 0.0
var _current_roll := 0.0
var _last_yaw := 0.0
var view_tween: Tween


func _ready() -> void:
	collision_layer = 2
	collision_mask = 1
	_build_collision()
	_build_model_rig()
	set_character(character_id)
	_build_shield()
	_build_camera()
	_last_yaw = _current_yaw


func _build_collision() -> void:
	var body_shape := CollisionShape3D.new()
	body_shape.name = "CollisionShapeBody"
	var capsule := CapsuleShape3D.new()
	capsule.radius = 0.55
	capsule.height = 1.8
	body_shape.shape = capsule
	body_shape.position.y = 1.0
	add_child(body_shape)
	var ray_shape := CollisionShape3D.new()
	ray_shape.name = "CollisionShapeRay"
	var sphere := SphereShape3D.new()
	sphere.radius = 0.7
	ray_shape.shape = sphere
	ray_shape.position = Vector3(0, 0.35, -0.8)
	add_child(ray_shape)


func _build_model_rig() -> void:
	aim_pivot = Node3D.new()
	aim_pivot.name = "AimPivot"
	add_child(aim_pivot)
	model_fix = Node3D.new()
	model_fix.name = "ModelFix"
	aim_pivot.add_child(model_fix)


func _build_camera() -> void:
	var manager := Node3D.new()
	manager.name = "CameraManager"
	var arm := SpringArm3D.new()
	arm.name = "Arm"
	arm.unique_name_in_owner = true
	arm.position = Vector3(0, 2.325, -0.032)
	arm.rotation_degrees.x = 25.0
	arm.spring_length = 14.0
	arm.margin = 0.35
	var arm_shape := SphereShape3D.new()
	arm_shape.radius = 0.35
	arm.shape = arm_shape
	manager.add_child(arm)
	camera = Camera3D.new()
	camera.name = "Camera3D"
	camera.unique_name_in_owner = true
	camera.position = Vector3(0, -1.5, 1.5)
	camera.fov = 62.0
	camera.near = 0.25
	camera.far = 700.0
	camera.current = true
	arm.add_child(camera)
	manager.set_script(CameraManager)
	add_child(manager)


func set_character(value: String) -> void:
	character_id = value
	if is_instance_valid(visual):
		model_fix.remove_child(visual)
		visual.queue_free()
	visual = CharacterModels.build(character_id)
	visual.name = "Body"
	model_fix.add_child(visual)
	visual.visible = not first_person


func _finish_view_transition() -> void:
	if first_person and is_instance_valid(visual):
		visual.visible = false


func toggle_view() -> void:
	first_person = not first_person


func get_spell_origin() -> Vector3:
	if is_instance_valid(visual) and visual.has_node("SpellSocket"):
		return visual.get_node("SpellSocket").global_position
	return global_position + Vector3.UP * 1.2 + get_aim_forward()


func get_aim_forward() -> Vector3:
	if camera != null:
		return -camera.global_transform.basis.z.normalized()
	return -global_transform.basis.z.normalized()


func _build_shield() -> void:
	var mesh := SphereMesh.new()
	mesh.radius = 2.35
	mesh.height = 4.7
	mesh.radial_segments = 32
	mesh.rings = 16
	shield_mesh = MeshInstance3D.new()
	shield_mesh.name = "ProtegoShield"
	shield_mesh.mesh = mesh
	shield_mesh.position.y = 1.0
	shield_mesh.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	var material := StandardMaterial3D.new()
	material.albedo_color = Color(0.35, 0.72, 1.0, 0.14)
	material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	material.emission_enabled = true
	material.emission = Color("74baff")
	material.emission_energy_multiplier = 0.65
	shield_mesh.material_override = material
	shield_mesh.visible = false
	add_child(shield_mesh)


func move_toward_vector(current: Vector3, target: Vector3, max_delta: float) -> Vector3:
	var diff: Vector3 = target - current
	var dist: float = diff.length()
	if dist <= max_delta:
		return target
	return current + diff / dist * max_delta


func _physics_process(delta: float) -> void:
	if game == null or not game.is_playing():
		return

	flight_time += delta
	hit_cooldown = maxf(0.0, hit_cooldown - delta)
	shield_time = maxf(0.0, shield_time - delta)
	boundary_notice = maxf(0.0, boundary_notice - delta)
	var direction: Vector3 = get_camera_relative_input()
	var braking := Input.is_key_pressed(KEY_X)
	boosting = Input.is_key_pressed(KEY_SHIFT) and not braking and direction.length_squared() > 0.01
	var h_velocity := Vector2(direction.x, direction.z).normalized() * (BOOST_SPEED if boosting else MOVE_SPEED)
	if braking:
		h_velocity = Vector2.ZERO

	var accel := acceleration if is_on_floor() else air_acceleration
	var decel := deceleration if is_on_floor() else air_deceleration
	if braking:
		decel = 180.0
	var target_velocity := Vector3(h_velocity.x, 0.0, h_velocity.y)
	var current_h := Vector3(velocity.x, 0.0, velocity.z)
	if h_velocity.length() > 0.1:
		current_h = move_toward_vector(current_h, target_velocity, accel * delta)
	else:
		current_h = move_toward_vector(current_h, Vector3.ZERO, decel * delta)
	velocity.x = current_h.x
	velocity.z = current_h.z

	var vertical_input := 0.0
	if Input.is_key_pressed(KEY_E) or Input.is_key_pressed(KEY_SPACE) or Input.is_key_pressed(KEY_UP):
		vertical_input += 1.0
	if Input.is_key_pressed(KEY_Q) or Input.is_key_pressed(KEY_CTRL) or Input.is_key_pressed(KEY_DOWN):
		vertical_input -= 1.0
	if braking:
		velocity.y = move_toward(velocity.y, 0.0, 180.0 * delta)
	elif vertical_input != 0.0:
		velocity.y = move_toward(velocity.y, vertical_input * FLY_SPEED, vertical_accel * delta)
	elif gravity_enabled:
		velocity.y -= 40.0 * delta
	else:
		velocity.y = move_toward(velocity.y, 0.0, vertical_brake * delta)

	_face_move_direction(delta)
	move_and_slide()
	_apply_airwall()
	speed = Vector3(velocity.x, 0.0, velocity.z).length()
	_update_cosmetics(delta)


func _update_cosmetics(delta: float) -> void:
	if is_instance_valid(visual):
		visual.position.y = sin(flight_time * 5.0) * 0.055
	if shield_mesh != null:
		shield_mesh.visible = shield_time > 0.0 and game != null and game.state == "playing"
		shield_mesh.rotation.y += delta * 0.8
		shield_mesh.scale = Vector3.ONE * (1.0 + sin(flight_time * 6.0) * 0.025)
	if camera != null:
		camera.fov = lerpf(camera.fov, 65.0 if boosting else 62.0, delta * 4.0)


func _face_move_direction(delta: float) -> void:
	var h_velocity := Vector3(velocity.x, 0.0, velocity.z)
	var h_speed := h_velocity.length()
	var model_yaw := deg_to_rad(model_yaw_offset_deg)
	var target_yaw := _current_yaw
	if h_speed > 0.5:
		target_yaw = atan2(-h_velocity.x, -h_velocity.z) - model_yaw
	_current_yaw = rotate_toward(_current_yaw, target_yaw, turn_speed * delta)

	var max_pitch := deg_to_rad(max_pitch_degrees)
	var target_pitch := 0.0
	if is_on_floor():
		target_pitch = 0.0
	elif h_speed > 0.5:
		target_pitch = clampf(atan2(velocity.y, h_speed), -max_pitch, max_pitch)
	else:
		var ratio := clampf(absf(velocity.y) / maxf(FLY_SPEED, 0.001), 0.0, 1.0)
		target_pitch = signf(velocity.y) * max_pitch * ratio
	_current_pitch = rotate_toward(_current_pitch, target_pitch, pitch_speed * delta)

	var max_roll := deg_to_rad(max_roll_degrees)
	var target_roll := 0.0
	if roll_enabled:
		var yaw_rate := angle_difference(_last_yaw, _current_yaw) / maxf(delta, 0.0001)
		if absf(yaw_rate) > 0.5:
			target_roll = clampf(yaw_rate * roll_strength, -max_roll, max_roll)
	_current_roll = lerpf(_current_roll, target_roll, 1.0 - exp(-8.0 * delta))
	_last_yaw = _current_yaw

	var visual_forward_local := Vector3(-sin(model_yaw), 0.0, -cos(model_yaw)).normalized()
	var visual_right_local := Vector3(cos(model_yaw), 0.0, -sin(model_yaw)).normalized()
	var q_yaw := Quaternion(Vector3.UP, _current_yaw)
	var visual_forward_world := (q_yaw * visual_forward_local).normalized()
	var visual_right_world := (q_yaw * visual_right_local).normalized()
	var axis_rotation := Quaternion(Vector3.UP, deg_to_rad(pitch_axis_yaw_offset_deg))
	var pitch_axis := (axis_rotation * visual_right_world).normalized()
	var roll_axis := (axis_rotation * visual_forward_world).normalized()
	aim_pivot.quaternion = Quaternion(roll_axis, _current_roll) * Quaternion(pitch_axis, _current_pitch) * q_yaw


func get_camera_relative_input() -> Vector3:
	var input_dir := Vector3.ZERO
	if Input.is_key_pressed(KEY_A):
		input_dir -= camera.global_transform.basis.x
	if Input.is_key_pressed(KEY_D):
		input_dir += camera.global_transform.basis.x
	if Input.is_key_pressed(KEY_W):
		input_dir -= camera.global_transform.basis.z
	if Input.is_key_pressed(KEY_S):
		input_dir += camera.global_transform.basis.z
	return input_dir


func _apply_airwall() -> void:
	global_position.y = clampf(global_position.y, 3.5, 40.0)
	if (global_position.y <= 3.6 and velocity.y < 0.0) or (global_position.y >= 39.9 and velocity.y > 0.0):
		velocity.y = 0.0
	var boundary := pow(global_position.x / 54.0, 2.0) + pow(global_position.z / 73.0, 2.0)
	if boundary > 1.0:
		var correction := 1.0 / sqrt(boundary)
		global_position.x *= correction
		global_position.z *= correction
		velocity.x *= 0.55
		velocity.z *= 0.55
		if boundary_notice <= 0.0 and game != null:
			game.notify("AIR WALL — STEER BACK INTO THE PITCH", 1.3)
			boundary_notice = 2.0


func _input(event: InputEvent) -> void:
	if game == null or not game.is_playing():
		return
	if event is InputEventKey and event.pressed and not event.echo and event.keycode == KEY_V:
		toggle_view()


func apply_hit(direction: Vector3) -> void:
	if hit_cooldown > 0.0 or shield_time > 0.0:
		return
	hit_cooldown = 1.6
	velocity = direction.normalized() * 22.0 + Vector3.UP * 7.0
