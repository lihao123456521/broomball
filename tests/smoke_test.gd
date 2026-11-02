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

	expect(game.away_goals.size() == 3 and game.home_goals.size() == 3, "Each end has three scoring hoops")
	expect(game.rivals.size() == 4 and game.bludgers.size() == 2, "Rival roles and Bludgers are initialized")
	expect(game.player.visual.has_node("BroomModel") and game.player.visual.has_node("CharacterModel"), "Character and broom retain independent replacement nodes")
	expect(is_equal_approx(game.time_left, 180.0), "Match starts at three minutes")

	game._score_goal("player")
	expect(game.player_score == 10, "A player goal awards ten points")
	game._set_carrier(game.player)
	game.throw_quaffle()
	expect(game.quaffle_carrier == null and game.quaffle_target_side == "player", "Throw releases a live shot toward the Ravens")
	game._score_goal("player")
	expect(game.player_score == 20, "Goals accumulate without ending the match")
	game._score_goal("rival")
	expect(game.rival_score == 10, "A rival goal awards ten points")

	game.select_character(1)
	game.cast_spell()
	expect(game.character_index == 1 and game.get_spell_cooldown() > 0.0, "Hermione casts Stupefy with a real cooldown")
	expect(game.spell_projectiles.size() == 1, "Offensive spells create a guided projectile")
	game.select_character(2)
	game.cast_spell()
	expect(game.player.shield_time > 3.9, "Ron casts Protego as a timed defensive shield")
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
	expect(game.rival_score == 160 and game.state == "ended", "The rival Seeker can also catch the Snitch and win")

	game.state = "playing"
	game.player_score = 30
	game.rival_score = 20
	game._finish_by_time()
	expect(game.state == "ended" and game.end_title == "LIONS WIN", "Time expiry resolves the match by score")

	game.queue_free()
	await process_frame
	print("SMOKE_TEST_COMPLETE failures=", failures)
	quit(1 if failures > 0 else 0)
