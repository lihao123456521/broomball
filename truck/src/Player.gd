extends CharacterBody3D

@export var MOVE_SPEED: float = 50.0
@export var FLY_SPEED: float = 20.0

@export var first_person: bool = false : 
	set(p_value):
		first_person = p_value
		if first_person:
			var tween: Tween = create_tween()
			tween.tween_property($CameraManager/Arm, "spring_length", 0.0, .33)
			tween.tween_callback($AimPivot/ModelFix/Body.set_visible.bind(false))
		else:
			$AimPivot/ModelFix/Body.visible = true
			create_tween().tween_property($CameraManager/Arm, "spring_length", 6.0, .33)

@export var gravity_enabled: bool = true :
	set(p_value):
		gravity_enabled = p_value
		if not gravity_enabled:
			velocity.y = 0

@export var collision_enabled: bool = true :
	set(p_value):
		collision_enabled = p_value
		$CollisionShapeBody.disabled = ! collision_enabled
		$CollisionShapeRay.disabled = ! collision_enabled

@export var ball_radius: float = 0.8

@export var acceleration: float = 30.0
@export var deceleration: float = 40.0
@export var air_acceleration: float = 60.0
@export var air_deceleration: float = 60.0

@export var vertical_accel: float = 40.0
@export var vertical_brake: float = 25.0

@export var turn_speed: float = 8.0
@export var pitch_speed: float = 6.0
@export var max_pitch_degrees: float = 45.0

@export var roll_enabled: bool = true
@export var roll_strength: float = 0.05
@export var max_roll_degrees: float = 25.0

@export var model_yaw_offset_deg: float = 30.0

# ★ pitch 轴在水平面内旋转的角度。默认 90°
@export var pitch_axis_yaw_offset_deg: float = 90.0

var _current_yaw: float = 0.0
var _current_pitch: float = 0.0
var _current_roll: float = 0.0
var _last_yaw: float = 0.0

@onready var aim_pivot: Node3D = $AimPivot


func move_toward_vector(current: Vector3, target: Vector3, max_delta: float) -> Vector3:
	var diff: Vector3 = target - current
	var dist: float = diff.length()
	if dist <= max_delta:
		return target
	return current + diff / dist * max_delta


func _ready() -> void:
	_last_yaw = _current_yaw


func _physics_process(p_delta: float) -> void:
	var direction: Vector3 = get_camera_relative_input()
	var h_veloc: Vector2 = Vector2(direction.x, direction.z).normalized() * MOVE_SPEED
	if Input.is_key_pressed(KEY_SHIFT):
		h_veloc *= 2

	var accel: float = acceleration if is_on_floor() else air_acceleration
	var decel: float = deceleration if is_on_floor() else air_deceleration

	var target_velocity: Vector3 = Vector3(h_veloc.x, 0, h_veloc.y)
	var current_h: Vector3 = Vector3(velocity.x, 0, velocity.z)
	if h_veloc.length() > 0.1:
		current_h = move_toward_vector(current_h, target_velocity, accel * p_delta)
	else:
		current_h = move_toward_vector(current_h, Vector3.ZERO, decel * p_delta)
	velocity.x = current_h.x
	velocity.z = current_h.z

	var v_input: float = 0.0
	if Input.is_key_pressed(KEY_E):
		v_input += 1.0
	if Input.is_key_pressed(KEY_Q):
		v_input -= 1.0

	if v_input != 0.0:
		var target_vy: float = v_input * FLY_SPEED
		velocity.y = move_toward(velocity.y, target_vy, vertical_accel * p_delta)
	elif gravity_enabled:
		velocity.y -= 40.0 * p_delta
	else:
		velocity.y = move_toward(velocity.y, 0.0, vertical_brake * p_delta)

	_face_move_direction(p_delta)
	move_and_slide()


func _face_move_direction(p_delta: float) -> void:
	var h_vel: Vector3 = Vector3(velocity.x, 0.0, velocity.z)
	var h_speed: float = h_vel.length()
	var v_speed: float = velocity.y
	var model_yaw: float = deg_to_rad(model_yaw_offset_deg)

	var target_yaw: float = _current_yaw
	if h_speed > 0.5:
		target_yaw = atan2(-h_vel.x, -h_vel.z) - model_yaw
	_current_yaw = rotate_toward(_current_yaw, target_yaw, turn_speed * p_delta)

	var max_p: float = deg_to_rad(max_pitch_degrees)
	var target_pitch: float = 0.0
	if is_on_floor():
		target_pitch = 0.0
	elif h_speed > 0.5:
		target_pitch = clampf(atan2(v_speed, h_speed), -max_p, max_p)
	else:
		var ratio: float = clampf(absf(v_speed) / maxf(FLY_SPEED, 0.001), 0.0, 1.0)
		target_pitch = signf(v_speed) * max_p * ratio
	_current_pitch = rotate_toward(_current_pitch, target_pitch, pitch_speed * p_delta)

	var max_r: float = deg_to_rad(max_roll_degrees)
	var target_roll: float = 0.0
	if roll_enabled:
		var safe_dt: float = maxf(p_delta, 0.0001)
		var yaw_rate: float = angle_difference(_last_yaw, _current_yaw) / safe_dt
		if absf(yaw_rate) > 0.5:
			target_roll = clampf(yaw_rate * roll_strength, -max_r, max_r)
	_current_roll = lerpf(_current_roll, target_roll, 1.0 - exp(-8.0 * p_delta))
	_last_yaw = _current_yaw

	# ---------- 组装四元数 ----------
	var visual_forward_local: Vector3 = Vector3(-sin(model_yaw), 0.0, -cos(model_yaw)).normalized()
	var visual_right_local: Vector3   = Vector3( cos(model_yaw), 0.0, -sin(model_yaw)).normalized()

	var q_yaw: Quaternion = Quaternion(Vector3.UP, _current_yaw)
	var visual_forward_world: Vector3 = (q_yaw * visual_forward_local).normalized()
	var visual_right_world: Vector3   = (q_yaw * visual_right_local).normalized()

	# ★ 把 pitch / roll 的轴在水平面内额外旋转一个角度
	var axis_rot: Quaternion = Quaternion(Vector3.UP, deg_to_rad(pitch_axis_yaw_offset_deg))
	var pitch_axis: Vector3 = (axis_rot * visual_right_world).normalized()
	var roll_axis: Vector3  = (axis_rot * visual_forward_world).normalized()

	var q_pitch: Quaternion = Quaternion(pitch_axis, _current_pitch)
	var q_roll:  Quaternion = Quaternion(roll_axis,  _current_roll)

	aim_pivot.quaternion = q_roll * q_pitch * q_yaw


func get_camera_relative_input() -> Vector3:
	var input_dir: Vector3 = Vector3.ZERO
	if Input.is_key_pressed(KEY_A):
		input_dir -= %Camera3D.global_transform.basis.x
	if Input.is_key_pressed(KEY_D):
		input_dir += %Camera3D.global_transform.basis.x
	if Input.is_key_pressed(KEY_W):
		input_dir -= %Camera3D.global_transform.basis.z
	if Input.is_key_pressed(KEY_S):
		input_dir += %Camera3D.global_transform.basis.z
	if Input.is_key_pressed(KEY_KP_ADD) or Input.is_key_pressed(KEY_EQUAL):
		MOVE_SPEED = clamp(MOVE_SPEED + .5, 5, 9999)
	if Input.is_key_pressed(KEY_KP_SUBTRACT) or Input.is_key_pressed(KEY_MINUS):
		MOVE_SPEED = clamp(MOVE_SPEED - .5, 5, 9999)
	return input_dir


func _input(p_event: InputEvent) -> void:
	if p_event is InputEventMouseButton and p_event.pressed:
		if p_event.button_index == MOUSE_BUTTON_WHEEL_UP:
			MOVE_SPEED = clamp(MOVE_SPEED + 5, 5, 9999)
		elif p_event.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			MOVE_SPEED = clamp(MOVE_SPEED - 5, 5, 9999)
	elif p_event is InputEventKey:
		if p_event.pressed:
			if p_event.keycode == KEY_V:
				first_person = ! first_person
			elif p_event.keycode == KEY_G:
				gravity_enabled = ! gravity_enabled
			elif p_event.keycode == KEY_C:
				collision_enabled = ! collision_enabled
