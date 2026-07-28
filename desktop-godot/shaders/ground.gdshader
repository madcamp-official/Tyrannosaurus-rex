shader_type spatial;
render_mode cull_back;

uniform sampler2D grass_tex : source_color;
uniform sampler2D dirt_tex : source_color;
uniform float uv_repeat = 3.0;
uniform float dirt_uv_repeat = 0.95;
uniform vec3 dirt_light : source_color = vec3(0.725, 0.514, 0.333);
uniform vec3 dirt_mid : source_color = vec3(0.561, 0.365, 0.224);
uniform vec3 dirt_deep : source_color = vec3(0.306, 0.192, 0.125);

varying vec3 v_normal_world;
varying vec3 v_pos;
varying float v_dirt;

void vertex() {
	v_normal_world = normalize((MODEL_MATRIX * vec4(NORMAL, 0.0)).xyz);
	v_pos = VERTEX;
	v_dirt = COLOR.r;
}

void fragment() {
	vec3 n = v_normal_world;
	vec3 grass_color = texture(grass_tex, UV * uv_repeat).rgb;

	vec3 blend = abs(n);
	blend = pow(blend, vec3(5.0));
	blend /= max(blend.x + blend.y + blend.z, 0.0001);

	vec3 x_proj = texture(dirt_tex, v_pos.zy * dirt_uv_repeat).rgb;
	vec3 y_proj = texture(dirt_tex, v_pos.xz * dirt_uv_repeat).rgb;
	vec3 z_proj = texture(dirt_tex, v_pos.xy * dirt_uv_repeat).rgb;
	vec3 dirt_tex_color = x_proj * blend.x + y_proj * blend.y + z_proj * blend.z;

	float grass_to_dirt = smoothstep(0.006, 0.035, v_dirt);
	float deep_mix = smoothstep(0.28, 0.92, v_dirt);
	float wall_factor = smoothstep(0.18, 0.78, 1.0 - abs(n.y));

	vec3 dirt_tint = mix(dirt_light, dirt_mid, deep_mix);
	dirt_tint = mix(dirt_tint, dirt_deep, deep_mix * 0.55 + wall_factor * 0.18);
	vec3 dirt_color = mix(dirt_tint, dirt_tex_color, 0.72);
	dirt_color *= mix(1.08, 0.72, deep_mix * 0.80 + wall_factor * 0.22);

	vec3 col = mix(grass_color, dirt_color, grass_to_dirt);
	// 예전엔 unshaded라 씬 조명/그림자를 아예 안 받고 법선 방향으로 흉내만 낸 명암을 썼다.
	// 이제 실제 DirectionalLight3D(그림자 포함)가 셰이딩을 맡으므로, 여기서는 흙/잔디처럼
	// 광택 없는 재질로 보이게 거칠기·반사만 잡아주고 명암 계산 자체는 엔진에 맡긴다.
	ALBEDO = col;
	ROUGHNESS = 1.0;
	SPECULAR = 0.0;
}
