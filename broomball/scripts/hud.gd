extends CanvasLayer

const GOLD := Color("e8c675")
const PALE := Color("f4eedf")
const MUTED := Color("aab4c8")
const DARK := Color(0.045, 0.065, 0.11, 0.9)

var game
var root: Control
var player_score_label: Label
var rival_score_label: Label
var time_label: Label
var speed_label: Label
var possession_label: Label
var character_label: Label
var spell_label: Label
var spell_description_label: Label
var target_label: Label
var spell_callout_label: Label
var stamina_bar: ProgressBar
var message_label: Label
var countdown_label: Label
var snitch_label: Label
var reticle_label: Label
var end_overlay: ColorRect
var end_title_label: Label
var end_score_label: Label
var end_detail_label: Label
var pause_overlay: ColorRect


class PitchRadar extends Control:
	var game

	func _process(_delta: float) -> void:
		queue_redraw()

	func _map(position: Vector3) -> Vector2:
		return size * 0.5 + Vector2(position.x / 60.0 * size.x * 0.37, position.z / 80.0 * size.y * 0.36)

	func _draw() -> void:
		if game == null:
			return
		draw_rect(Rect2(Vector2.ZERO, size), Color(0.035, 0.055, 0.09, 0.88), true)
		draw_rect(Rect2(Vector2.ZERO, size), Color("8c794d"), false, 1.0)
		var center := size * 0.5
		var points := PackedVector2Array()
		for i in range(65):
			var angle := float(i) * TAU / 64.0
			points.append(center + Vector2(sin(angle) * size.x * 0.37, cos(angle) * size.y * 0.36))
		draw_polyline(points, Color("8fa891"), 1.2, true)
		draw_line(center + Vector2(-size.x * 0.33, 0), center + Vector2(size.x * 0.33, 0), Color("536a62"), 1.0)
		draw_arc(center, 10.0, 0, TAU, 24, Color("8fa891"), 1.0, true)
		for goal in game.away_goals:
			draw_circle(_map(goal), 1.7, Color("81aee3"))
		for goal in game.home_goals:
			draw_circle(_map(goal), 1.7, Color("e5bd6a"))
		for rival in game.rivals:
			var color := Color("b18cdb") if rival.role == "seeker" else Color("6f9fd4")
			draw_circle(_map(rival.global_position), 2.5, color)
		for bludger in game.bludgers:
			draw_circle(_map(bludger["node"].global_position), 1.8, Color("70788b"))
		if not is_instance_valid(game.quaffle_carrier):
			draw_circle(_map(game.quaffle.global_position), 2.5, Color("df8059"))
		if game.snitch_active and game.state == "playing":
			draw_circle(_map(game.snitch.global_position), 3.0, Color("ffe181"))
			draw_arc(_map(game.snitch.global_position), 5.0, 0, TAU, 16, Color("ffe181"), 1.0, true)
		var player_position := _map(game.player.global_position)
		var forward: Vector3 = game.player.get_aim_forward()
		draw_line(player_position, player_position + Vector2(forward.x, forward.z).normalized() * 8.0, Color("ffffff"), 1.5, true)
		draw_circle(player_position, 3.5, Color("ffffff"))
		draw_string(ThemeDB.fallback_font, Vector2(8, 15), "PITCH RADAR", HORIZONTAL_ALIGNMENT_LEFT, -1, 10, Color("b9c3d4"))


func _ready() -> void:
	layer = 10
	root = Control.new()
	root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(root)
	_build_header()
	_build_scoreboard()
	_build_character_panel()
	_build_status()
	_build_radar()
	_build_center_messages()
	_build_controls()
	_build_end_screen()
	_build_pause_screen()


func _style(color: Color, border: Color = Color.TRANSPARENT, radius: int = 10) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = color
	style.border_color = border
	style.set_border_width_all(1 if border.a > 0.0 else 0)
	style.set_corner_radius_all(radius)
	style.content_margin_left = 16
	style.content_margin_right = 16
	style.content_margin_top = 10
	style.content_margin_bottom = 10
	return style


func _label(text: String, font_size: int, color: Color = PALE) -> Label:
	var label := Label.new()
	label.text = text
	label.add_theme_font_size_override("font_size", font_size)
	label.add_theme_color_override("font_color", color)
	label.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.65))
	label.add_theme_constant_override("shadow_offset_x", 1)
	label.add_theme_constant_override("shadow_offset_y", 2)
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return label


func _place(control: Control, anchors: Vector4, offsets: Vector4) -> void:
	control.anchor_left = anchors.x
	control.anchor_top = anchors.y
	control.anchor_right = anchors.z
	control.anchor_bottom = anchors.w
	control.offset_left = offsets.x
	control.offset_top = offsets.y
	control.offset_right = offsets.z
	control.offset_bottom = offsets.w


func _panel() -> PanelContainer:
	var panel := PanelContainer.new()
	panel.add_theme_stylebox_override("panel", _style(DARK, Color("736544")))
	panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return panel


func _build_header() -> void:
	var title := _label("B R O O M B A L L", 22, GOLD)
	_place(title, Vector4(0, 0, 0, 0), Vector4(24, 17, 310, 47))
	root.add_child(title)
	var subtitle := _label("T H E   G O L D E N   M A T C H", 10, MUTED)
	_place(subtitle, Vector4(0, 0, 0, 0), Vector4(25, 45, 310, 64))
	root.add_child(subtitle)
	snitch_label = _label("SNITCH • DORMANT", 12, GOLD)
	snitch_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	_place(snitch_label, Vector4(1, 0, 1, 0), Vector4(-254, 23, -24, 47))
	root.add_child(snitch_label)


func _build_scoreboard() -> void:
	var panel := _panel()
	_place(panel, Vector4(0.5, 0, 0.5, 0), Vector4(-242, 17, 242, 99))
	root.add_child(panel)
	var row := HBoxContainer.new()
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	row.add_theme_constant_override("separation", 28)
	panel.add_child(row)
	var lions := VBoxContainer.new()
	lions.add_theme_constant_override("separation", -3)
	row.add_child(lions)
	var lion_name := _label("LIONS", 13, Color("efb3ae"))
	lion_name.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	lions.add_child(lion_name)
	player_score_label = _label("0", 34, PALE)
	player_score_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	lions.add_child(player_score_label)
	var middle := VBoxContainer.new()
	middle.alignment = BoxContainer.ALIGNMENT_CENTER
	row.add_child(middle)
	var match_label := _label("GOLDEN MATCH", 10, GOLD)
	match_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	middle.add_child(match_label)
	time_label = _label("03:00", 25, PALE)
	time_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	middle.add_child(time_label)
	var ravens := VBoxContainer.new()
	ravens.add_theme_constant_override("separation", -3)
	row.add_child(ravens)
	var raven_name := _label("RAVENS", 13, Color("a9ccec"))
	raven_name.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	ravens.add_child(raven_name)
	rival_score_label = _label("0", 34, PALE)
	rival_score_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	ravens.add_child(rival_score_label)
	var objective := _label("GOALS +10    •    SNITCH +150 & ENDS MATCH", 11, PALE)
	objective.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_place(objective, Vector4(0.5, 0, 0.5, 0), Vector4(-270, 108, 270, 132))
	root.add_child(objective)


func _build_character_panel() -> void:
	var panel := _panel()
	_place(panel, Vector4(0, 0, 0, 0), Vector4(22, 78, 322, 215))
	root.add_child(panel)
	var stack := VBoxContainer.new()
	stack.add_theme_constant_override("separation", 4)
	panel.add_child(stack)
	character_label = _label("1  HARRY POTTER", 15, GOLD)
	stack.add_child(character_label)
	var choose := _label("1 HARRY   2 HERMIONE   3 RON", 9, MUTED)
	stack.add_child(choose)
	spell_label = _label("R / 右键  除你武器 · 就绪", 12, PALE)
	stack.add_child(spell_label)
	spell_description_label = _label("缴械掉球 · 36m", 11, MUTED)
	stack.add_child(spell_description_label)
	target_label = _label("将准星对准范围内目标", 11, GOLD)
	stack.add_child(target_label)


func _build_status() -> void:
	var panel := _panel()
	_place(panel, Vector4(0, 1, 0, 1), Vector4(22, -174, 272, -52))
	root.add_child(panel)
	var stack := VBoxContainer.new()
	stack.add_theme_constant_override("separation", 7)
	panel.add_child(stack)
	speed_label = _label("AIRSPEED  17", 14, PALE)
	stack.add_child(speed_label)
	stamina_bar = ProgressBar.new()
	stamina_bar.custom_minimum_size = Vector2(205, 9)
	stamina_bar.show_percentage = false
	stamina_bar.max_value = 100
	stamina_bar.add_theme_stylebox_override("background", _style(Color("202b3c"), Color.TRANSPARENT, 4))
	stamina_bar.add_theme_stylebox_override("fill", _style(GOLD, Color.TRANSPARENT, 4))
	stack.add_child(stamina_bar)
	var boost := _label("飞行速度 · SHIFT 加速 / X 制动", 10, MUTED)
	stack.add_child(boost)
	possession_label = _label("QUAFFLE • IN FLIGHT", 12, GOLD)
	stack.add_child(possession_label)


func _build_radar() -> void:
	var radar := PitchRadar.new()
	radar.game = game
	radar.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_place(radar, Vector4(1, 1, 1, 1), Vector4(-190, -178, -22, -34))
	root.add_child(radar)


func _build_center_messages() -> void:
	message_label = _label("", 21, GOLD)
	message_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_place(message_label, Vector4(0.5, 0, 0.5, 0), Vector4(-420, 143, 420, 180))
	root.add_child(message_label)
	reticle_label = _label("+", 23, Color(1, 1, 1, 0.65))
	reticle_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_place(reticle_label, Vector4(0.5, 0.5, 0.5, 0.5), Vector4(-100, -20, 100, 20))
	root.add_child(reticle_label)
	spell_callout_label = _label("", 31, GOLD)
	spell_callout_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_place(spell_callout_label, Vector4(0.5, 0.5, 0.5, 0.5), Vector4(-360, 40, 360, 88))
	root.add_child(spell_callout_label)
	countdown_label = _label("3", 88, PALE)
	countdown_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_place(countdown_label, Vector4(0.5, 0.5, 0.5, 0.5), Vector4(-180, -115, 180, 65))
	root.add_child(countdown_label)


func _build_controls() -> void:
	var primary := _label("WASD 移动（S 后退） · SPACE/E ↑ Q/CTRL ↓ · SHIFT 加速 · X 制动 · F/左键 射门 · R/右键 咒语", 11, PALE)
	primary.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_place(primary, Vector4(0.5, 1, 0.5, 1), Vector4(-435, -51, 435, -30))
	root.add_child(primary)
	var secondary := _label("1 哈利   2 赫敏   3 罗恩 · V 视角 · ESC 暂停 · 蓝色球门进攻 / 金色球门防守", 10, MUTED)
	secondary.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_place(secondary, Vector4(0.5, 1, 0.5, 1), Vector4(-390, -29, 390, -9))
	root.add_child(secondary)


func _build_end_screen() -> void:
	end_overlay = ColorRect.new()
	end_overlay.color = Color(0.025, 0.035, 0.07, 0.82)
	end_overlay.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(end_overlay)
	_place(end_overlay, Vector4(0, 0, 1, 1), Vector4.ZERO)
	var panel := _panel()
	panel.add_theme_stylebox_override("panel", _style(Color("10182b"), GOLD, 16))
	_place(panel, Vector4(0.5, 0.5, 0.5, 0.5), Vector4(-310, -175, 310, 175))
	end_overlay.add_child(panel)
	var stack := VBoxContainer.new()
	stack.alignment = BoxContainer.ALIGNMENT_CENTER
	stack.add_theme_constant_override("separation", 16)
	panel.add_child(stack)
	end_title_label = _label("GOLDEN VICTORY", 34, GOLD)
	end_title_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	stack.add_child(end_title_label)
	end_score_label = _label("150  —  0", 52, PALE)
	end_score_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	stack.add_child(end_score_label)
	end_detail_label = _label("", 15, MUTED)
	end_detail_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	end_detail_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	end_detail_label.custom_minimum_size.x = 530
	stack.add_child(end_detail_label)
	var restart := _label("按 ENTER 再赛一场", 14, GOLD)
	restart.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	stack.add_child(restart)
	end_overlay.visible = false


func _build_pause_screen() -> void:
	pause_overlay = ColorRect.new()
	pause_overlay.color = Color(0.025, 0.035, 0.07, 0.72)
	pause_overlay.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(pause_overlay)
	_place(pause_overlay, Vector4(0, 0, 1, 1), Vector4.ZERO)
	var label := _label("比赛已暂停\n\nESC 继续飞行   ·   ENTER 重新开赛", 26, GOLD)
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_place(label, Vector4(0.5, 0.5, 0.5, 0.5), Vector4(-360, -90, 360, 90))
	pause_overlay.add_child(label)
	pause_overlay.visible = false


func _process(_delta: float) -> void:
	if game == null or player_score_label == null:
		return
	player_score_label.text = str(game.player_score)
	rival_score_label.text = str(game.rival_score)
	var seconds := int(ceil(game.time_left))
	time_label.text = "%02d:%02d" % [seconds / 60, seconds % 60]
	speed_label.text = "AIRSPEED  %02d   •   ALT  %02d" % [int(game.player.speed), int(game.player.global_position.y)]
	stamina_bar.value = clampf(game.player.speed / game.player.BOOST_SPEED * 100.0, 0.0, 100.0)
	character_label.text = "%d  %s" % [game.character_index + 1, game.get_character_name()]
	var cooldown: float = game.get_spell_cooldown()
	spell_label.text = "R / 右键  %s · %s" % [game.spell_chinese_names[game.character_index], "就绪" if cooldown <= 0.0 else "%.1fs" % cooldown]
	spell_description_label.text = game.spell_descriptions[game.character_index]
	target_label.text = game.get_spell_target_text()
	spell_label.add_theme_color_override("font_color", GOLD if cooldown <= 0.0 else MUTED)
	if game.player.shield_time > 0.0:
		spell_description_label.text += "\n盔甲护身生效 · 剩余 %.1fs" % game.player.shield_time
	spell_callout_label.text = game.spell_callout
	spell_callout_label.visible = game.spell_callout_time > 0.0 and game.state == "playing" and not game.paused
	if game.quaffle_carrier == game.player:
		possession_label.text = "QUAFFLE • YOU HAVE IT"
		possession_label.add_theme_color_override("font_color", GOLD)
		reticle_label.text = "[ F / 左键 ]"
		reticle_label.add_theme_color_override("font_color", GOLD)
	elif is_instance_valid(game.quaffle_carrier):
		possession_label.text = "QUAFFLE • RAVENS HAVE IT"
		possession_label.add_theme_color_override("font_color", Color("a9ccec"))
		reticle_label.text = "+"
		reticle_label.add_theme_color_override("font_color", PALE)
	else:
		possession_label.text = "QUAFFLE • IN FLIGHT"
		possession_label.add_theme_color_override("font_color", MUTED)
		reticle_label.text = "+"
		reticle_label.add_theme_color_override("font_color", PALE)
	if game.snitch_active:
		snitch_label.text = "SNITCH • IN PLAY"
	elif game.state == "playing":
		snitch_label.text = "SNITCH • %02ds" % maxi(0, 35 - int(game.elapsed))
	else:
		snitch_label.text = "SNITCH • DORMANT"
	message_label.text = game.message
	message_label.visible = game.message_time > 0.0 and game.state == "playing" and not game.paused
	countdown_label.visible = game.state == "countdown" and not game.paused
	countdown_label.text = str(maxi(1, int(ceil(game.countdown))))
	end_overlay.visible = game.state == "ended"
	end_title_label.text = game.end_title
	end_score_label.text = "%d  —  %d" % [game.player_score, game.rival_score]
	end_detail_label.text = game.end_detail
	pause_overlay.visible = game.paused and game.state != "ended"
