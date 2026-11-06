extends SceneTree

var failures := 0


func _initialize() -> void:
	call_deferred("_run")


func expect(condition: bool, description: String) -> void:
	if condition:
		print("PASS: ", description)
	else:
		failures += 1
		push_error("FAIL: " + description)


func _run() -> void:
	var game = load("res://broomball/main.tscn").instantiate()
	root.add_child(game)
	await process_frame
	await process_frame
	game.state = "playing"
	game.paused = false
	game.set_physics_process(false)
	game.player.set_physics_process(false)
	for rival in game.rivals:
		rival.set_physics_process(false)

	expect(game.away_goals.size() == 3 and game.home_goals.size() == 3, "Each end has three scoring hoops")
	expect(game.rivals.size() == 4 and game.bludgers.size() == 2, "Rival roles and Bludgers are initialized")
	expect(game.player.visual.has_node("BroomModel") and game.player.visual.has_node("CharacterModel"), "Character and broom retain independent replacement nodes")
	expect(is_equal_approx(game.time_left, 180.0), "Match starts at three minutes")
	expect(is_equal_approx(game.player.MOVE_SPEED, 28.0), "Cruise speed is comfortable for the pitch size")
	expect(game.player.air_deceleration >= 100.0, "Releasing movement brakes promptly")

	game._score_goal("player")
	expect(game.player_score == 10, "A player goal awards ten points")
	game._set_carrier(game.player)
	game.throw_quaffle()
	expect(game.quaffle_carrier == null and game.quaffle_target_side == "player", "Throw releases a live shot toward the Ravens")
	game._score_goal("player")
	expect(game.player_score == 20, "Goals accumulate without ending the match")
	game._score_goal("rival")
	expect(game.rival_score == 10, "A rival goal awards ten points")

	for rival in game.rivals:
		rival.position = Vector3(100, 30, 100)
	for bludger in game.bludgers:
		bludger["node"].position = Vector3(100, 30, 100)
	game.select_character(1)
	game.cast_spell()
	expect(game.get_spell_cooldown() == 0.0 and game.spell_projectiles.is_empty(), "No target does not consume an offensive spell cooldown")
	var target = game.rivals[0]
	target.position = game.player.position + game.player.get_aim_forward() * 15.0
	game.cast_spell()
	expect(game.character_index == 1 and game.get_spell_cooldown() > 0.0, "Hermione casts Stupefy with a real cooldown")
	expect(game.spell_projectiles.size() == 1, "Offensive spells create a guided projectile")
	game.select_character(2)
	game.cast_spell()
	expect(game.player.shield_time > 3.9, "Ron casts Protego as a timed defensive shield")
	game.select_character(0)
	expect(game.player.shield_time > 3.9, "Switching rider preserves a live Protego shield")
	game._set_carrier(target)
	target.stun = 0.0
	game._apply_spell("stupefy", target, target.position)
	expect(game.quaffle_carrier == target and is_equal_approx(target.stun, 3.2), "Stupefy immobilizes without behaving like a disarm")
	expect("昏昏倒地" in game.message, "Projectile impact names its own spell after character switching")
	target.stun = 0.0
	game._apply_spell("expelliarmus", target, target.position)
	expect(game.quaffle_carrier == null and is_equal_approx(target.stun, 0.65), "Expelliarmus disarms with only a brief hit reaction")
	game.paused = true
	game.player.hit_cooldown = 1.2
	game.player._physics_process(0.5)
	target._physics_process(0.5)
	expect(is_equal_approx(game.player.hit_cooldown, 1.2) and is_equal_approx(target.stun, 0.65), "Pause freezes hit immunity and rival stun")
	game.paused = false
	game.player.toggle_view()
	game.player.toggle_view()
	await create_timer(0.4).timeout
	expect(not game.player.first_person and game.player.visual.visible, "Rapid view toggles cannot hide the third-person rider")
	game.player.toggle_view()
	await create_timer(0.4).timeout
	expect(game.player.first_person and not game.player.visual.visible, "First-person view follows the original hidden-body transition")
	game.player.toggle_view()
	expect(not game.player.first_person and game.player.visual.visible, "Third-person view restores the rider body")

	game.snitch_active = true
	game._catch_snitch("player")
	expect(game.player_score == 170, "Catching the Snitch awards 150 points")
	expect(game.state == "ended" and game.end_title == "GOLDEN VICTORY", "A player Snitch catch ends the match")

	game.state = "playing"
	game.snitch_active = true
	game._catch_snitch("rival")
	expect(game.rival_score == 160 and game.state == "ended" and game.end_title == "LIONS WIN", "Snitch capture awards points but the final score determines the winner")
	game.state = "playing"
	game.player_score = 0
	game.rival_score = 150
	game.snitch_active = true
	game._catch_snitch("player")
	expect(game.end_title == "A GOLDEN DRAW", "A tied score after a Snitch capture is a draw")

	game.state = "playing"
	game.player_score = 30
	game.rival_score = 20
	game._finish_by_time()
	expect(game.state == "ended" and game.end_title == "LIONS WIN", "Time expiry resolves the match by score")

	game.state = "playing"
	game.quaffle_carrier = null
	game.quaffle_target_side = ""
	game.kickoff_delay = 0.0
	game.quaffle_pickup_delay = 0.0
	target.global_position = Vector3(20, 18, 0)
	game.quaffle.global_position = target.global_position
	target.stun = 1.0
	game._update_quaffle(0.0)
	expect(game.quaffle_carrier == null, "A stunned chaser cannot pick up a free Quaffle on contact")
	game.quaffle_carrier = null
	game.quaffle_pickup_delay = 0.0
	target.stun = 0.0
	game._update_quaffle(0.0)
	expect(game.quaffle_carrier == target, "A recovered chaser can pick up a free Quaffle")

	target.global_position = game.player.global_position + Vector3.RIGHT * 2.3
	game._set_carrier(target)
	game.steal_cooldown = 0.0
	game.player.speed = game.player.MOVE_SPEED
	game._update_steals()
	expect(game.quaffle_carrier == target, "Cruising past a healthy carrier does not steal the Quaffle")

	target.global_position = game.player.global_position + Vector3.RIGHT * 2.6
	game._set_carrier(target)
	game.steal_cooldown = 0.0
	game.player.speed = game.player.BOOST_SPEED
	game._update_steals()
	expect(game.quaffle_carrier == game.player, "Boosting within 2.7 units steals the Quaffle")

	game._set_carrier(target)
	game.steal_cooldown = 0.0
	game.player.speed = 0.0
	target.stun = 1.0
	game._update_steals()
	expect(game.quaffle_carrier == game.player, "A stationary player can steal from a nearby stunned carrier")

	var seeker = game.rivals[3]
	seeker.global_position = Vector3(-20, 18, 0)
	game.snitch.global_position = seeker.global_position
	game.snitch_active = true
	seeker.stun = 1.0
	game._update_snitch(0.0)
	expect(game.snitch_active and game.state == "playing" and game.rival_score == 20, "A stunned seeker cannot catch the Snitch on contact")
	game.state = "playing"
	game.rival_score = 20
	game.snitch_active = true
	seeker.stun = 0.0
	game._update_snitch(0.0)
	expect(not game.snitch_active and game.state == "ended" and game.rival_score == 170, "A recovered seeker can catch the Snitch")

	game.queue_free()
	await process_frame
	print("SMOKE_TEST_COMPLETE failures=", failures)
	quit(1 if failures > 0 else 0)
