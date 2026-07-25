extends RefCounted
class_name ProceduralTextures

static func make_grass() -> ImageTexture:
	var img := Image.create(64, 64, false, Image.FORMAT_RGB8)
	var rng := RandomNumberGenerator.new()
	rng.seed = 1
	for y in 64:
		for x in 64:
			var n := rng.randf_range(-0.06, 0.06)
			img.set_pixel(x, y, Color(0.22 + n, 0.5 + n, 0.16 + n))
	return ImageTexture.create_from_image(img)

static func make_dirt() -> ImageTexture:
	var img := Image.create(64, 64, false, Image.FORMAT_RGB8)
	var rng := RandomNumberGenerator.new()
	rng.seed = 2
	for y in 64:
		for x in 64:
			var n := rng.randf_range(-0.05, 0.05)
			img.set_pixel(x, y, Color(0.5 + n, 0.33 + n, 0.2 + n))
	return ImageTexture.create_from_image(img)
