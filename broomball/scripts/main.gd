extends Node3D

const Arena = preload("res://broomball/scripts/arena.gd")
const Player = preload("res://broomball/scripts/player.gd")
const Rival = preload("res://broomball/scripts/rival.gd")
const Hud = preload("res://broomball/scripts/hud.gd")
const Art = preload("res://broomball/scripts/art.gd")

var state := "countdown"
var paused := false
var countdown := 3.0
var elapsed := 0.0
var time_left := 180.0
var player_score := 0
var rival_score := 0
var message := ""
var message_time := 0.0
var end_title := ""
var end_detail := ""

var character_index := 0
var character_ids: Array = ["harry", "hermione", "ron"]
var character_names: Array = ["HARRY POTTER", "HERMIONE GRANGER", "RON WEASLEY"]
var spell_names: Array = ["EXPELLIARMUS", "STUPEFY", "PROTEGO"]
var spell_chinese_names: Array = ["除你武器", "昏昏倒地", "盔甲护身"]
var spell_descriptions: Array = ["缴械掉球 · 36m", "昏迷 / 冻结 3.2s · 32m", "护盾 4s · 格挡撞击与抢断"]
var spell_cooldowns: Array = [0.0, 0.0, 0.0]
var spell_cooldown_max: Array = [7.0, 9.0, 12.0]
var spell_callout := ""
var spell_callout_time := 0.0
var spell_projectiles: Array[Dictionary] = []
var tts_voices: Array = []
var utterance_id := 0

var arena
var player
var rivals: Array = []
var home_goals: Array[Vector3] = []
var away_goals: Array[Vector3] = []
var quaffle: Node3D
var quaffle_carrier: Node3D
var quaffle_velocity := Vector3.ZERO
var quaffle_target := Vector3.ZERO
var quaffle_target_side := ""
var quaffle_pickup_delay := 0.0
var kickoff_delay := 0.0
var steal_cooldown := 1.5

var snitch: Node3D
var snitch_active := false
var snitch_target := Vector3.ZERO
var snitch_retarget := 0.0
var snitch_time := 0.0
var bludgers: Array[Dictionary] = []
var hud: CanvasLayer
var rng := RandomNumberGenerator.new()


func _ready() -> void:
	rng.randomize()
	_build_match()
	tts_voices = DisplayServer.tts_get_voices()
	if "--capture" in OS.get_cmdline_user_args():
		_capture_after_delay()


func _build_match() -> void:
	arena = Arena.new()
	arena.name = "GoldenStadium"
	add_child(arena)
	home_goals = arena.home_goals
	away_goals = arena.away_goals

	player = Player.new()
	player.name = "LionSeeker"
	player.game = self
	player.position = Vector3(0, 10, 38)
	add_child(player)

	_add_rival("chaser", Vector3(-16, 12, -12), 0)
	_add_rival("chaser", Vector3(18, 9, 20), 1)
	_add_rival("keeper", Vector3(0, 12, -53), 2)
	_add_rival("seeker", Vector3(25, 24, 2), 3)

	quaffle = Node3D.new()
	quaffle.name = "Quaffle"
	add_child(quaffle)
	Art.sphere(quaffle, 0.78, Vector3.ZERO, Color("b85236"), 0.1)
	var seam := Art.torus(quaffle, 0.69, 0.79, Vector3.ZERO, Color("e6a06e"))
	seam.rotation.x = PI * 0.5
	_reset_quaffle()
	kickoff_delay = 2.4

	snitch = Art.snitch()
	snitch.name = "GoldenSnitch"
	snitch.position = Vector3(0, 21, -8)
	snitch.visible = false
	add_child(snitch)

	_add_bludger(Vector3(-28, 15, -4), Vector3(12, 0, 16))
	_add_bludger(Vector3(27, 18, 12), Vector3(-14, -2, -14))

	hud = Hud.new()
	hud.game = self
	add_child(hud)


func _add_rival(role: String, position: Vector3, index: int) -> void:
	var rival := Rival.new()
	rival.name = role.capitalize() + str(index)
	rival.game = self
	rival.role = role
	rival.index = index
	rival.position = position
	rival.rotation.y = PI
	add_child(rival)
	rivals.append(rival)


func _add_bludger(position: Vector3, velocity: Vector3) -> void:
	var node := Node3D.new()
	node.name = "Bludger"
	node.position = position
	add_child(node)
	Art.sphere(node, 0.92, Vector3.ZERO, Color("202636"), 0.7)
	var band := Art.torus(node, 0.79, 0.94, Vector3.ZERO, Color("576078"), 0.65)
	band.rotation.x = PI * 0.5
	bludgers.append({"node": node, "velocity": velocity, "retarget": rng.randf_range(7.0, 10.0), "frozen": 0.0})


func is_playing() -> bool:
	return state == "playing" and not paused


func _physics_process(delta: float) -> void:
	if state == "ended" or paused:
		return
	message_time = maxf(0.0, message_time - delta)
	if state == "countdown":
		countdown -= delta
		if countdown <= 0.0:
			state = "playing"
			notify("THE GOLDEN MATCH HAS BEGUN", 2.2)
		return

	elapsed += delta
	time_left = maxf(0.0, time_left - delta)
	if time_left <= 0.0:
		_finish_by_time()
		return

	quaffle_pickup_delay = maxf(0.0, quaffle_pickup_delay - delta)
	kickoff_delay = maxf(0.0, kickoff_delay - delta)
	steal_cooldown = maxf(0.0, steal_cooldown - delta)
	_update_quaffle(delta)
	_update_steals()
	_update_spells(delta)
	_update_snitch(delta)
	_update_bludgers(delta)


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo:
		if event.keycode == KEY_ESCAPE and state != "ended":
			paused = not paused
			player.velocity = Vector3.ZERO
			player.boosting = false
			Input.set_mouse_mode(Input.MOUSE_MODE_VISIBLE if paused else Input.MOUSE_MODE_CAPTURED)
			get_viewport().set_input_as_handled()
		elif event.keycode == KEY_ENTER and (state == "ended" or paused):
			get_tree().paused = false
			get_tree().reload_current_scene()
		elif event.keycode == KEY_F and is_playing():
			throw_quaffle()
		elif event.keycode == KEY_R and is_playing():
			cast_spell()
		elif event.keycode in [KEY_1, KEY_2, KEY_3] and state != "ended" and not paused:
			select_character(int(event.keycode - KEY_1))
	if event is InputEventMouseButton and event.pressed and is_playing():
		if event.button_index == MOUSE_BUTTON_LEFT:
			throw_quaffle()
		elif event.button_index == MOUSE_BUTTON_RIGHT:
			cast_spell()


func _notification(what: int) -> void:
	if what == NOTIFICATION_APPLICATION_FOCUS_OUT and state != "ended":
		paused = true
		if is_instance_valid(player):
			player.velocity = Vector3.ZERO
			player.boosting = false
		Input.set_mouse_mode(Input.MOUSE_MODE_VISIBLE)


func _update_quaffle(delta: float) -> void:
	if is_instance_valid(quaffle_carrier):
		var carrier_basis := quaffle_carrier.global_transform.basis
		var carry_position := quaffle_carrier.global_position + carrier_basis.x * 0.95 + Vector3.UP * 1.15 - carrier_basis.z * 0.35
		quaffle.global_position = quaffle.global_position.lerp(carry_position, 1.0 - exp(-delta * 22.0))
		quaffle.rotate_y(delta * 2.0)
		return

	if kickoff_delay <= 0.0:
		if quaffle_target_side != "":
			var desired := (quaffle_target - quaffle.global_position).normalized() * 34.0
			quaffle_velocity = quaffle_velocity.lerp(desired, 1.0 - exp(-delta * 3.2))
		else:
			quaffle_velocity.y -= 4.5 * delta
		quaffle.global_position += quaffle_velocity * delta
		quaffle.rotate_x(delta * 4.0)

		if quaffle.global_position.y < 2.0:
			quaffle.global_position.y = 2.0
			quaffle_velocity.y = absf(quaffle_velocity.y) * 0.62
			quaffle_velocity.x *= 0.84
			quaffle_velocity.z *= 0.84
		if quaffle_target_side != "" and quaffle.global_position.distance_to(quaffle_target) < 2.05:
			_score_goal(quaffle_target_side)
			return
		if quaffle_target_side == "player":
			for rival in rivals:
				if rival.role == "keeper" and rival.stun <= 0.0 and rival.global_position.distance_to(quaffle.global_position) < 2.35:
					quaffle_target_side = ""
					quaffle_velocity = Vector3(rng.randf_range(-10, 10), 7, 22)
					quaffle_pickup_delay = 0.65
					notify("SAVED BY THE RAVEN KEEPER", 1.8)
					return

		if quaffle_pickup_delay <= 0.0:
			if player.global_position.distance_to(quaffle.global_position) < 2.85:
				_set_carrier(player)
				notify("QUAFFLE SECURED — F TO THROW", 1.7)
				return
			for rival in rivals:
				if rival.role == "chaser" and rival.stun <= 0.0 and rival.global_position.distance_to(quaffle.global_position) < 2.55:
					_set_carrier(rival)
					notify("THE RAVENS HAVE THE QUAFFLE", 1.4)
					return


func _set_carrier(carrier: Node3D) -> void:
	quaffle_carrier = carrier
	quaffle_target_side = ""
	quaffle_velocity = Vector3.ZERO
	quaffle_pickup_delay = 0.35


func throw_quaffle() -> void:
	if quaffle_carrier != player or not is_playing():
		return
	var forward: Vector3 = player.get_aim_forward()
	var best_goal: Vector3 = away_goals[1]
	var best_score := -INF
	for goal in away_goals:
		var offset: Vector3 = goal - player.global_position
		var alignment: float = offset.normalized().dot(forward)
		var score: float = alignment * 100.0 - offset.length() * 0.12
		if score > best_score:
			best_score = score
			best_goal = goal
	quaffle_carrier = null
	quaffle_target = best_goal
	quaffle_target_side = "player"
	quaffle_velocity = forward * 12.0 + (best_goal - quaffle.global_position).normalized() * 25.0 + Vector3.UP * 2.0
	quaffle_pickup_delay = 0.7


func rival_throw(rival: Node3D) -> void:
	if quaffle_carrier != rival or not is_playing():
		return
	quaffle_carrier = null
	quaffle_target = closest_goal(home_goals, rival.global_position)
	quaffle_target_side = "rival"
	quaffle_velocity = (quaffle_target - quaffle.global_position).normalized() * 28.0 + Vector3.UP * 1.5
	quaffle_pickup_delay = 0.7


func _score_goal(side: String) -> void:
	if state != "playing":
		return
	if side == "player":
		player_score += 10
		notify("LIONS SCORE!  +10", 2.2)
	else:
		rival_score += 10
		notify("RAVENS SCORE", 2.0)
	_reset_quaffle()
	kickoff_delay = 1.25


func _reset_quaffle() -> void:
	quaffle_carrier = null
	quaffle_target_side = ""
	quaffle_velocity = Vector3.ZERO
	quaffle.global_position = Vector3(0, 9, 0)
	quaffle_pickup_delay = 0.75


func _drop_quaffle() -> void:
	if not is_instance_valid(quaffle_carrier):
		return
	quaffle_carrier = null
	quaffle_target_side = ""
	quaffle_velocity = Vector3(rng.randf_range(-7, 7), 5, rng.randf_range(-7, 7))
	quaffle_pickup_delay = 0.8


func _update_steals() -> void:
	if steal_cooldown > 0.0 or not is_instance_valid(quaffle_carrier):
		return
	if quaffle_carrier == player:
		if player.shield_time > 0.0:
			return
		for rival in rivals:
			if rival.role == "chaser" and rival.stun <= 0.0 and rival.global_position.distance_to(player.global_position) < 2.35:
				_set_carrier(rival)
				steal_cooldown = 1.4
				notify("TACKLED — BOOST INTO THE CARRIER TO STEAL", 2.0)
				return
	elif (player.speed > 30.0 or quaffle_carrier.stun > 0.0) and player.global_position.distance_to(quaffle_carrier.global_position) < 2.7:
		_set_carrier(player)
		steal_cooldown = 1.4
		notify("CLEAN STEAL!  F TO THROW", 1.8)


func get_rival_target(rival: Node3D) -> Vector3:
	if rival.role == "keeper":
		var focus := quaffle.global_position
		if quaffle_target_side == "player":
			focus = quaffle_target
		return Vector3(clampf(focus.x, -13.0, 13.0), clampf(focus.y, 7.0, 17.0), -54.0)
	if rival.role == "seeker":
		if snitch_active and elapsed >= 43.0:
			return snitch.global_position
		return Vector3(sin(elapsed * 0.35) * 30.0, 24.0, cos(elapsed * 0.35) * 38.0)
	if kickoff_delay > 0.0:
		return Vector3(float(rival.index) * 32.0 - 16.0, 12.0, 20.0)
	if quaffle_carrier == rival:
		return closest_goal(home_goals, rival.global_position)
	if quaffle_carrier == player:
		return player.global_position
	if is_instance_valid(quaffle_carrier):
		return Vector3(rival.index * 8.0 - 4.0, 13.0, 18.0)
	return quaffle.global_position


func closest_goal(goals: Array[Vector3], from: Vector3) -> Vector3:
	var result: Vector3 = goals[0]
	var distance := INF
	for goal in goals:
		var candidate := from.distance_squared_to(goal)
		if candidate < distance:
			distance = candidate
			result = goal
	return result


func _update_snitch(delta: float) -> void:
	if not snitch_active:
		if elapsed < 35.0:
			return
		snitch_active = true
		snitch.visible = true
		snitch_retarget = 0.0
		notify("THE GOLDEN SNITCH IS LOOSE — 150 POINTS", 3.0)
	snitch_time += delta
	snitch_retarget -= delta
	if snitch_retarget <= 0.0 or snitch.global_position.distance_to(snitch_target) < 2.0:
		_choose_snitch_target()
	var direction := (snitch_target - snitch.global_position).normalized()
	var wobble := Vector3(sin(snitch_time * 7.0), cos(snitch_time * 5.0) * 0.6, sin(snitch_time * 6.0)) * 0.32
	snitch.global_position += (direction + wobble).normalized() * 13.5 * delta
	var flap := sin(snitch_time * 24.0) * 0.5
	snitch.get_node("WingL").rotation.z = -0.28 + flap
	snitch.get_node("WingR").rotation.z = 0.28 - flap
	if player.global_position.distance_to(snitch.global_position) < 2.35:
		_catch_snitch("player")
		return
	for rival in rivals:
		if rival.role == "seeker" and rival.stun <= 0.0 and rival.global_position.distance_to(snitch.global_position) < 2.05:
			_catch_snitch("rival")
			return


func _choose_snitch_target() -> void:
	var angle := rng.randf() * TAU
	var radius := sqrt(rng.randf())
	snitch_target = Vector3(sin(angle) * 42.0 * radius, rng.randf_range(8.0, 31.0), cos(angle) * 56.0 * radius)
	snitch_retarget = rng.randf_range(1.3, 2.5)


func _catch_snitch(side: String) -> void:
	if state != "playing" or not snitch_active:
		return
	snitch.visible = false
	snitch_active = false
	if side == "player":
		player_score += 150
	else:
		rival_score += 150
	if player_score > rival_score:
		end_title = "GOLDEN VICTORY" if side == "player" else "LIONS WIN"
	elif rival_score > player_score:
		end_title = "RAVENS TAKE THE SNITCH" if side == "rival" else "RAVENS WIN"
	else:
		end_title = "A GOLDEN DRAW"
	end_detail = ("你" if side == "player" else "对方找球手") + "抓到金色飞贼，获得 150 分。比赛按最终总分结算。"
	state = "ended"
	Input.set_mouse_mode(Input.MOUSE_MODE_VISIBLE)


func _update_bludgers(delta: float) -> void:
	for bludger in bludgers:
		var node: Node3D = bludger["node"]
		var velocity: Vector3 = bludger["velocity"]
		if bludger["frozen"] > 0.0:
			bludger["frozen"] = maxf(0.0, bludger["frozen"] - delta)
			node.rotate_y(delta * 1.5)
			continue
		bludger["retarget"] -= delta
		if bludger["retarget"] <= 0.0:
			var target: Vector3 = player.global_position + player.get_aim_forward() * player.speed * 0.35
			if rng.randf() < 0.28:
				target = rivals[rng.randi_range(0, 1)].global_position
			velocity = (target - node.global_position).normalized() * 20.0
			bludger["retarget"] = rng.randf_range(2.0, 3.6)
		node.global_position += velocity * delta
		node.rotate_x(delta * 5.0)
		node.rotate_z(delta * 3.0)
		if node.global_position.y < 4.0 or node.global_position.y > 32.0:
			velocity.y *= -1.0
			node.global_position.y = clampf(node.global_position.y, 4.0, 32.0)
		var boundary := pow(node.global_position.x / 56.0, 2.0) + pow(node.global_position.z / 75.0, 2.0)
		if boundary > 1.0:
			velocity = (Vector3(0, 14, 0) - node.global_position).normalized() * 20.0
		if node.global_position.distance_to(player.global_position) < 2.25 and player.hit_cooldown <= 0.0:
			if player.shield_time > 0.0:
				velocity = (node.global_position - player.global_position).normalized() * 26.0
				bludger["frozen"] = 0.35
				bludger["retarget"] = 1.0
				notify("PROTEGO DEFLECTED THE BLUDGER", 1.3)
			else:
				if quaffle_carrier == player:
					_drop_quaffle()
				var hit_direction: Vector3 = (player.global_position - node.global_position).normalized()
				player.apply_hit(hit_direction)
				velocity = -hit_direction * 19.0
				notify("BLUDGER HIT!  RECOVER YOUR LINE", 1.8)
		for rival in rivals:
			if node.global_position.distance_to(rival.global_position) < 1.95 and rival.stun <= 0.0:
				if quaffle_carrier == rival:
					_drop_quaffle()
				var direction: Vector3 = (rival.global_position - node.global_position).normalized()
				rival.apply_hit(direction)
				velocity = -direction * 18.0
		bludger["velocity"] = velocity


func get_character_name() -> String:
	return character_names[character_index]


func get_spell_name() -> String:
	return spell_names[character_index]


func get_spell_target_text() -> String:
	if character_index == 2:
		return "自身护盾 · 无需锁定"
	var target: Node3D = _find_spell_target(character_index == 1)
	if not is_instance_valid(target):
		return "将准星对准范围内目标"
	var label := "游走球" if not rivals.has(target) else ("持球对手" if quaffle_carrier == target else "对手")
	return "%s · %dm · R / 右键" % [label, int(player.global_position.distance_to(target.global_position))]


func get_spell_cooldown() -> float:
	return spell_cooldowns[character_index]


func select_character(index: int) -> void:
	if index < 0 or index >= character_ids.size() or index == character_index:
		return
	character_index = index
	player.set_character(character_ids[index])
	notify(character_names[index] + " · " + spell_chinese_names[index], 1.6)


func cast_spell() -> void:
	if not is_playing():
		return
	if get_spell_cooldown() > 0.0:
		notify(spell_chinese_names[character_index] + " 冷却 %.1fs" % get_spell_cooldown(), 0.9)
		return
	var target: Node3D = null
	if character_index != 2:
		target = _find_spell_target(character_index == 1)
		if not is_instance_valid(target):
			notify("请瞄准范围内的对手" + ("或游走球" if character_index == 1 else "") + " · 未消耗冷却", 1.4)
			return
	spell_cooldowns[character_index] = spell_cooldown_max[character_index]
	spell_callout = spell_names[character_index] + "!"
	spell_callout_time = 1.45
	_speak_spell()
	if character_index == 2:
		player.shield_time = 4.0
		_spell_burst(player.global_position + Vector3.UP, Color("79bfff"))
		notify("盔甲护身 · 4 秒内格挡撞击与抢断", 1.5)
		return

	var bolt := Node3D.new()
	bolt.name = spell_names[character_index] + "Bolt"
	add_child(bolt)
	bolt.global_position = player.get_spell_origin()
	var color := Color("ff8266") if character_index == 0 else Color("ff4f78")
	Art.sphere(bolt, 0.28, Vector3.ZERO, color, 0.15, 3.0)
	var light := OmniLight3D.new()
	light.light_color = color
	light.light_energy = 2.2
	light.omni_range = 6.0
	bolt.add_child(light)
	var direction: Vector3 = player.get_aim_forward()
	if is_instance_valid(target):
		direction = (target.global_position - bolt.global_position).normalized()
	spell_projectiles.append({
		"node": bolt,
		"target": target,
		"effect": "expelliarmus" if character_index == 0 else "stupefy",
		"velocity": direction * 46.0,
		"life": 2.8
	})


func _find_spell_target(include_bludgers: bool) -> Node3D:
	var forward: Vector3 = player.get_aim_forward()
	var best: Node3D = null
	var best_score := INF
	for rival in rivals:
		var offset: Vector3 = rival.global_position - player.global_position
		var distance: float = offset.length()
		if distance > (32.0 if include_bludgers else 36.0) or distance < 0.1:
			continue
		var alignment: float = offset.normalized().dot(forward)
		if alignment < cos(deg_to_rad(22.0)):
			continue
		var score: float = distance * 0.15 + (1.0 - alignment) * 100.0
		if quaffle_carrier == rival:
			score -= 0.6
		if score < best_score:
			best_score = score
			best = rival
	if include_bludgers:
		for bludger in bludgers:
			var node: Node3D = bludger["node"]
			var offset: Vector3 = node.global_position - player.global_position
			var distance: float = offset.length()
			var alignment: float = offset.normalized().dot(forward)
			if distance <= 32.0 and distance > 0.1 and alignment >= cos(deg_to_rad(22.0)):
				var score: float = distance * 0.15 + (1.0 - alignment) * 100.0
				if score < best_score:
					best_score = score
					best = node
	return best


func _update_spells(delta: float) -> void:
	for i in range(spell_cooldowns.size()):
		spell_cooldowns[i] = maxf(0.0, spell_cooldowns[i] - delta)
	spell_callout_time = maxf(0.0, spell_callout_time - delta)
	for i in range(spell_projectiles.size() - 1, -1, -1):
		var shot := spell_projectiles[i]
		var node: Node3D = shot["node"]
		var target = shot["target"]
		shot["life"] -= delta
		if is_instance_valid(target):
			var desired: Vector3 = (target.global_position - node.global_position).normalized() * 46.0
			shot["velocity"] = shot["velocity"].lerp(desired, 1.0 - exp(-delta * 5.0))
		node.global_position += shot["velocity"] * delta
		node.rotate_y(delta * 9.0)
		if is_instance_valid(target) and node.global_position.distance_to(target.global_position) < 2.0:
			_apply_spell(shot["effect"], target, node.global_position)
			shot["life"] = 0.0
		if shot["life"] <= 0.0:
			node.queue_free()
			spell_projectiles.remove_at(i)


func _apply_spell(effect: String, target, position: Vector3) -> void:
	var color := Color("ff8266") if effect == "expelliarmus" else Color("ff4f78")
	_spell_burst(position, color)
	if rivals.has(target):
		if effect == "expelliarmus" and quaffle_carrier == target:
			_drop_quaffle()
		target.stun = maxf(target.stun, 0.65 if effect == "expelliarmus" else 3.2)
		notify("除你武器 · 缴械命中" if effect == "expelliarmus" else "昏昏倒地 · 对手昏迷 3.2 秒", 1.6)
		return
	for bludger in bludgers:
		if bludger["node"] == target:
			bludger["frozen"] = 3.2 if effect == "stupefy" else 1.2
			bludger["velocity"] *= 0.15
			notify("昏昏倒地 · 游走球冻结 3.2 秒", 1.5)
			return


func _spell_burst(position: Vector3, color: Color) -> void:
	var burst := Node3D.new()
	add_child(burst)
	burst.global_position = position
	var directions := [Vector3.UP, Vector3.DOWN, Vector3.LEFT, Vector3.RIGHT, Vector3.FORWARD, Vector3.BACK]
	for direction in directions:
		Art.sphere(burst, 0.18, direction * 0.65, color, 0.0, 2.4)
	var tween := create_tween()
	tween.tween_property(burst, "scale", Vector3.ONE * 2.5, 0.24)
	tween.tween_callback(burst.queue_free)


func _speak_spell() -> void:
	if tts_voices.is_empty():
		return
	var voice_index := character_index % tts_voices.size()
	var voice_id: String = tts_voices[voice_index].get("id", "")
	if voice_id.is_empty():
		return
	utterance_id += 1
	var pitches := [0.9, 1.08, 0.82]
	var rates := [0.92, 1.04, 0.9]
	DisplayServer.tts_speak(spell_callout, voice_id, 90, pitches[character_index], rates[character_index], utterance_id, true)


func _finish_by_time() -> void:
	time_left = 0.0
	if player_score > rival_score:
		end_title = "LIONS WIN"
		end_detail = "Time is up. Your command of the pitch made the difference."
	elif rival_score > player_score:
		end_title = "RAVENS WIN"
		end_detail = "Time is up. The next match is yours to claim."
	else:
		end_title = "A GOLDEN DRAW"
		end_detail = "Honours even. Rematch and settle it in the sky."
	state = "ended"
	Input.set_mouse_mode(Input.MOUSE_MODE_VISIBLE)


func notify(text: String, duration: float = 2.0) -> void:
	message = text
	message_time = duration


func _capture_after_delay() -> void:
	await get_tree().create_timer(5.0).timeout
	var image := get_viewport().get_texture().get_image()
	var path := "user://broomball_capture.png"
	image.save_png(path)
	print("CAPTURE_SAVED=", ProjectSettings.globalize_path(path))
	get_tree().quit()
