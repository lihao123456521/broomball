extends CharacterBody3D

@export var MOVE_SPEED: float = 50.0
@export var JUMP_SPEED: float = 2.0
@export var first_person: bool = false : 
	set(p_value):
		first_person = p_value
		if first_person:
			var tween: Tween = create_tween()
			tween.tween_property($CameraManager/Arm, "spring_length", 0.0, .33)
			tween.tween_callback($Body.set_visible.bind(false))
		else:
			$Body.visible = true
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

@export var ball_radius: float = 0.8   # 根据实际模型半径调整

@export var acceleration: float = 30.0   # 地面加速度
@export var deceleration: float = 40.0   # 地面减速度（停止时的摩擦力）
@export var air_acceleration: float = 0.0  # 空中加速度（可选）
@export var air_deceleration: float = 5.0   # 空中减速度（可选）

@export var max_head_pitch: float = 30.0        # 最大俯仰角度（度）
@export var head_rotation_speed: float = 10.0   # 头部旋转平滑速度
@export var head_max_speed: float = 100.0       # 用于归一化速度的最大值（可调整为 MOVE_SPEED * 2）

@onready var head_pivot: Node3D = $HeadPivot   # 确保节点名为Head
# 保存初始旋转（假设 Head 初始时无倾斜，若有初始姿态则用此叠加）
@onready var head_initial_quat: Quaternion = head_pivot.quaternion


func move_toward_vector(current: Vector3, target: Vector3, max_delta: float) -> Vector3:
	var diff = target - current
	var dist = diff.length()
	if dist <= max_delta:
		return target
	return current + diff / dist * max_delta

func _physics_process(p_delta) -> void:
	var direction: Vector3 = get_camera_relative_input()
	var h_veloc: Vector2 = Vector2(direction.x, direction.z).normalized() * MOVE_SPEED
	if Input.is_key_pressed(KEY_SHIFT):
		h_veloc *= 2
	
	var accel = acceleration if is_on_floor() else air_acceleration
	var decel = deceleration if is_on_floor() else air_deceleration
	
	var target_velocity = Vector3(h_veloc.x, 0, h_veloc.y)
	var current_h_velocity = Vector3(velocity.x, 0, velocity.z)
	
	if h_veloc.length() > 0.1:
		current_h_velocity = move_toward_vector(current_h_velocity, target_velocity, accel * p_delta)
	else:
		current_h_velocity = move_toward_vector(current_h_velocity, Vector3.ZERO, decel * p_delta)
	
	velocity.x = current_h_velocity.x
	velocity.z = current_h_velocity.z
	
	# 球体滚动旋转
	if current_h_velocity.length() > 0.01:
		var speed = current_h_velocity.length()
		var axis = Vector3(current_h_velocity.z, 0, -current_h_velocity.x).normalized()
		var angle: float = speed / ball_radius * p_delta
		$Body.global_rotate(axis, angle)

	# Head 倾斜
	if head_pivot:
		var speed = current_h_velocity.length()
		var speed_ratio = clamp(speed / head_max_speed, 0.0, 1.0)
		var tilt_angle = deg_to_rad(max_head_pitch) * sqrt(speed_ratio)  # 平方根映射

		if speed > 0.1:
			var dir = current_h_velocity.normalized()
			var original_axis = dir.cross(Vector3.UP).normalized()   # 原始轴（水平面上垂直于运动方向）
			original_axis = -Vector3(current_h_velocity.z, 0, -current_h_velocity.x).normalized()
			var rotated_axis = Quaternion(Vector3.UP, -PI/2) * original_axis  # 绕Y轴旋转90度
			# 在初始旋转基础上叠加倾斜（局部空间旋转）
			head_pivot.quaternion = head_initial_quat * Quaternion(rotated_axis, tilt_angle)
		else:
			# 无速度时恢复初始旋转
			head_pivot.quaternion = head_initial_quat
	
	if gravity_enabled:
		velocity.y -= 40 * p_delta
	move_and_slide()

# Returns the input vector relative to the camera. Forward is always the direction the camera is facing
func get_camera_relative_input() -> Vector3:
	var input_dir: Vector3 = Vector3.ZERO
	if Input.is_key_pressed(KEY_A): # Left
		input_dir -= %Camera3D.global_transform.basis.x
	if Input.is_key_pressed(KEY_D): # Right
		input_dir += %Camera3D.global_transform.basis.x
	if Input.is_key_pressed(KEY_W): # Forward
		input_dir -= %Camera3D.global_transform.basis.z
	if Input.is_key_pressed(KEY_S): # Backward
		input_dir += %Camera3D.global_transform.basis.z
	if Input.is_key_pressed(KEY_E) or Input.is_key_pressed(KEY_SPACE): # Up
		velocity.y += JUMP_SPEED + MOVE_SPEED*.016
	if Input.is_key_pressed(KEY_Q): # Down
		velocity.y -= JUMP_SPEED + MOVE_SPEED*.016
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

		# Else if up/down released
		elif p_event.keycode in [ KEY_Q, KEY_E, KEY_SPACE ]:
			velocity.y = 0
