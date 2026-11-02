shader_type spatial;
render_mode cull_disabled;

uniform vec4 flag_color : source_color = vec4(0.55, 0.06, 0.12, 1.0);
uniform vec4 trim_color : source_color = vec4(0.94, 0.72, 0.28, 1.0);

void vertex() {
	VERTEX.y += sin(VERTEX.x * 2.8 + TIME * 3.2) * 0.18 * UV.x;
}

void fragment() {
	float edge = step(0.88, UV.x) + step(UV.y, 0.06) + step(0.94, UV.y);
	float diamond = step(abs(UV.x - 0.52) + abs(UV.y - 0.5), 0.16);
	vec3 color = mix(flag_color.rgb, trim_color.rgb, clamp(edge + diamond, 0.0, 1.0));
	ALBEDO = color;
	ROUGHNESS = 0.8;
}
