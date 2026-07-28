shader_type spatial;
render_mode cull_back;

uniform sampler2D grass_tex : source_color;
uniform sampler2D dirt_tex : source_color;
uniform float uv_repeat = 3.0;
uniform float dirt_uv_repeat = 0.95;
uniform vec3 dirt_light : source_color = vec3(0.82, 0.61, 0.39);
uniform vec3 dirt_mid : source_color = vec3(0.64, 0.43, 0.25);
uniform vec3 dirt_deep : source_color = vec3(0.38, 0.24, 0.14);

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
	// 발굴 구덩이를 울퉁불퉁하게 바꾸면서 가파른 경사면(wall_factor가 높은 곳)이 파낸
	// 구역 전체에 훨씬 넓게 생겼다 — 경사면마다 크게 어둡게 칠하다 보니, 땅을 팔수록
	// (경사면이 늘어날수록) 화면 전체가 점점 어두워 보이는 문제가 있었다. 어둡기는
	// 실제 깊이(deep_mix)가 주로 결정하고, 경사 자체의 비중은 크게 줄였다.
	float wall_factor = smoothstep(0.18, 0.78, 1.0 - abs(n.y));
	// 큰 얼룩과 작은 흙결을 섞어 같은 깊이도 단색 면처럼 보이지 않게 한다.
	float broad_variation = sin(v_pos.x * 0.72 + v_pos.z * 0.31)
		* sin(v_pos.z * 0.83 - v_pos.x * 0.27);
	float fine_variation = sin((v_pos.x + v_pos.z) * 2.35) * 0.35;
	float soil_variation = clamp(0.5 + broad_variation * 0.32 + fine_variation * 0.18, 0.0, 1.0);

	vec3 dirt_tint = mix(dirt_light, dirt_mid, deep_mix);
	dirt_tint = mix(dirt_tint, dirt_deep, deep_mix * 0.55 + wall_factor * 0.18);
	dirt_tint *= mix(0.86, 1.12, soil_variation);
	vec3 dirt_color = mix(dirt_tint, dirt_tex_color, 0.60);
	// 평평한 표면은 밝게 유지하되 깊은 바닥과 가파른 벽에만 감광을 집중한다.
	// 환경광을 낮춰 생긴 실제 그림자와 합쳐져 구덩이 윤곽이 선명해진다.
	float cavity = clamp(deep_mix * 0.68 + wall_factor * 0.30, 0.0, 1.0);
	dirt_color *= mix(1.18, 0.64, cavity);

	vec3 col = mix(grass_color, dirt_color, grass_to_dirt);
	// 예전엔 unshaded라 씬 조명/그림자를 아예 안 받고 법선 방향으로 흉내만 낸 명암을 썼다.
	// 이제 실제 DirectionalLight3D(그림자 포함)가 셰이딩을 맡으므로, 여기서는 흙/잔디처럼
	// 광택 없는 재질로 보이게 거칠기·반사만 잡아주고 명암 계산 자체는 엔진에 맡긴다.
	ALBEDO = col;
	// 실시간 그림자는 유지하되, 오목한 구덩이 벽이 Web 렌더러에서 검게 뭉개지지 않도록
	// 지면 색의 일부를 약한 간접광처럼 되돌려 준다.
	EMISSION = col * 0.01;
	ROUGHNESS = 1.0;
	SPECULAR = 0.0;
}
