from pathlib import Path
from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter, ImageOps

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "assets" / "source" / "official-presets-src"
OUT = ROOT / "assets" / "generated" / "characters" / "official-2d"

CANVAS = (768, 1240)

PRESETS = [
    {
        "id": "lilac",
        "source": "crop-01.jpg",
        "crop_bottom": 0.925,
        "scale": 1.04,
        "y_offset": 8,
        "feather": 18,
        "centering": (0.54, 0.42),
        "accent": (188, 126, 255),
        "mask": [
            (0.47, 0.01),
            (0.63, 0.03),
            (0.72, 0.12),
            (0.83, 0.20),
            (0.98, 0.31),
            (0.92, 0.43),
            (0.80, 0.40),
            (0.74, 0.55),
            (0.84, 0.87),
            (0.78, 0.99),
            (0.35, 0.99),
            (0.32, 0.82),
            (0.25, 0.55),
            (0.07, 0.43),
            (0.02, 0.32),
            (0.18, 0.20),
            (0.34, 0.13),
            (0.38, 0.04),
        ],
    },
    {
        "id": "noir",
        "source": "crop-02.jpg",
        "crop_bottom": 0.93,
        "scale": 1.1,
        "y_offset": 4,
        "feather": 15,
        "centering": (0.53, 0.34),
        "accent": (238, 190, 138),
        "mask": [
            (0.44, 0.01),
            (0.62, 0.02),
            (0.72, 0.13),
            (0.96, 0.22),
            (0.99, 0.32),
            (0.86, 0.40),
            (0.76, 0.36),
            (0.70, 0.54),
            (0.87, 0.94),
            (0.76, 0.99),
            (0.48, 0.93),
            (0.36, 0.74),
            (0.18, 0.62),
            (0.00, 0.37),
            (0.04, 0.22),
            (0.29, 0.30),
            (0.36, 0.10),
        ],
    },
    {
        "id": "pink",
        "source": "crop-03.jpg",
        "crop_bottom": 0.96,
        "scale": 1.0,
        "y_offset": 2,
        "feather": 16,
        "centering": (0.50, 0.34),
        "accent": (255, 146, 190),
        "mask": [
            (0.39, 0.01),
            (0.61, 0.01),
            (0.74, 0.12),
            (0.96, 0.32),
            (0.91, 0.98),
            (0.10, 0.98),
            (0.04, 0.32),
            (0.25, 0.12),
        ],
    },
]


def normalized_polygon(points, width, height):
    return [(round(x * width), round(y * height)) for x, y in points]


def vertical_fade(width, height, start=0.84):
    fade = Image.new("L", (width, height), 255)
    pixels = fade.load()
    start_y = round(height * start)
    for y in range(start_y, height):
        alpha = round(255 * max(0, 1 - ((y - start_y) / max(1, height - start_y)) ** 1.4))
        for x in range(width):
            pixels[x, y] = alpha
    return fade


def build_mask(size, preset):
    width, height = size
    mask = Image.new("L", size, 0)
    draw = ImageDraw.Draw(mask)
    draw.polygon(normalized_polygon(preset["mask"], width, height), fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(preset["feather"]))
    mask = ImageChops.multiply(mask, vertical_fade(width, height))
    return mask


def trim_source(image, preset):
    width, height = image.size
    bottom = max(1, min(height, round(height * preset["crop_bottom"])))
    return image.crop((0, 0, width, bottom))


def create_sprite(preset):
    source = Image.open(SRC / preset["source"]).convert("RGB")
    source = trim_source(source, preset)
    source = ImageEnhance.Color(source).enhance(1.04)
    source = ImageEnhance.Contrast(source).enhance(1.03)
    source = ImageEnhance.Sharpness(source).enhance(1.08)

    mask = build_mask(source.size, preset)
    subject = source.convert("RGBA")
    subject.putalpha(mask)

    canvas = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    scale = min(CANVAS[0] * 0.96 / subject.width, CANVAS[1] * preset["scale"] / subject.height)
    new_size = (round(subject.width * scale), round(subject.height * scale))
    subject = subject.resize(new_size, Image.Resampling.LANCZOS)
    x = (CANVAS[0] - new_size[0]) // 2
    y = CANVAS[1] - new_size[1] + preset["y_offset"]
    canvas.alpha_composite(subject, (x, y))
    return canvas


def rounded_mask(size, radius):
    mask = Image.new("L", size, 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle((0, 0, size[0] - 1, size[1] - 1), radius=radius, fill=255)
    return mask


def gradient_overlay(size, top=(0, 0, 0, 0), bottom=(0, 0, 0, 150)):
    width, height = size
    overlay = Image.new("RGBA", size, (0, 0, 0, 0))
    pixels = overlay.load()
    for y in range(height):
        t = y / max(1, height - 1)
        color = tuple(round(top[i] * (1 - t) + bottom[i] * t) for i in range(4))
        for x in range(width):
            pixels[x, y] = color
    return overlay


def create_live_card(preset):
    source = Image.open(SRC / preset["source"]).convert("RGB")
    source = trim_source(source, preset)
    source = ImageEnhance.Color(source).enhance(1.05)
    source = ImageEnhance.Contrast(source).enhance(1.04)
    source = ImageEnhance.Sharpness(source).enhance(1.05)

    canvas = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    panel = (54, 58, CANVAS[0] - 54, CANVAS[1] - 50)
    panel_w = panel[2] - panel[0]
    panel_h = panel[3] - panel[1]
    radius = 42

    shadow = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow)
    shadow_draw.rounded_rectangle(
        (panel[0] + 14, panel[1] + 24, panel[2] + 14, panel[3] + 24),
        radius=radius,
        fill=(0, 0, 0, 160),
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(24))
    canvas.alpha_composite(shadow)

    fitted = ImageOps.fit(
        source,
        (panel_w, panel_h),
        method=Image.Resampling.LANCZOS,
        centering=preset["centering"],
    ).convert("RGBA")
    fitted.alpha_composite(gradient_overlay((panel_w, panel_h), bottom=(0, 0, 0, 105)))

    accent = preset["accent"]
    tint = Image.new("RGBA", (panel_w, panel_h), (*accent, 0))
    tint_draw = ImageDraw.Draw(tint)
    tint_draw.ellipse((-panel_w * 0.25, -panel_h * 0.18, panel_w * 0.75, panel_h * 0.42), fill=(*accent, 26))
    tint_draw.ellipse((panel_w * 0.30, panel_h * 0.55, panel_w * 1.25, panel_h * 1.18), fill=(*accent, 18))
    tint = tint.filter(ImageFilter.GaussianBlur(38))
    fitted.alpha_composite(tint)

    mask = rounded_mask((panel_w, panel_h), radius)
    fitted.putalpha(mask)
    canvas.alpha_composite(fitted, (panel[0], panel[1]))

    line = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    line_draw = ImageDraw.Draw(line)
    line_draw.rounded_rectangle(panel, radius=radius, outline=(*accent, 150), width=3)
    line_draw.rounded_rectangle(
        (panel[0] + 8, panel[1] + 8, panel[2] - 8, panel[3] - 8),
        radius=radius - 8,
        outline=(255, 245, 232, 58),
        width=1,
    )
    canvas.alpha_composite(line)

    shine = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    shine_draw = ImageDraw.Draw(shine)
    shine_draw.polygon(
        [
            (panel[0] + 34, panel[1]),
            (panel[0] + 156, panel[1]),
            (panel[0] + 58, panel[3]),
            (panel[0] - 64, panel[3]),
        ],
        fill=(255, 255, 255, 20),
    )
    shine.putalpha(ImageChops.multiply(shine.getchannel("A"), rounded_mask(CANVAS, 44)))
    canvas.alpha_composite(shine)
    return canvas


def create_preview(sprite, preset):
    bg = Image.new("RGB", (720, 1080), (25, 13, 21))
    overlay = Image.new("RGBA", bg.size, (0, 0, 0, 0))
    glow = Image.new("RGBA", bg.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(glow)
    draw.ellipse((120, 120, 600, 820), fill=(214, 156, 110, 32))
    glow = glow.filter(ImageFilter.GaussianBlur(42))
    overlay.alpha_composite(glow)
    small = sprite.resize((668, 1080), Image.Resampling.LANCZOS)
    overlay.alpha_composite(small, (26, 0))
    bg = Image.alpha_composite(bg.convert("RGBA"), overlay).convert("RGB")
    return bg


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    processed = []
    for preset in PRESETS:
        folder = OUT / preset["id"]
        folder.mkdir(parents=True, exist_ok=True)
        cutout = create_sprite(preset)
        cutout.save(folder / "cutout-soft.png")
        sprite = create_live_card(preset)
        sprite.save(folder / "sprite.png")
        sprite.save(folder / "portrait.png")
        create_preview(sprite, preset).save(folder / "preview.jpg", quality=92)
        processed.append(preset["id"])
    print("processed", ", ".join(processed))


if __name__ == "__main__":
    main()
