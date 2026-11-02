from pathlib import Path
from PIL import Image, ImageFilter, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "assets" / "source" / "official-presets-src"
OUT = ROOT / "assets" / "generated" / "characters" / "official"

CROPS = {
    "ref-01.jpg": ("crop-01.jpg", (95, 320, 875, 2050)),
    "ref-02.jpg": ("crop-02.jpg", (55, 305, 880, 1720)),
    "ref-03.jpg": ("crop-03.jpg", (145, 420, 935, 1995)),
}

def make_crops():
    SRC.mkdir(parents=True, exist_ok=True)
    for src_name, (out_name, box) in CROPS.items():
        image = Image.open(SRC / src_name).convert("RGB")
        crop = image.crop(box)
        # Light cleanup for compression/UI softness before sending as reference.
        crop = crop.filter(ImageFilter.UnsharpMask(radius=1.2, percent=80, threshold=4))
        crop.save(SRC / out_name, quality=94, subsampling=1)

def key_distance(pixel, key):
    return sum((int(pixel[i]) - int(key[i])) ** 2 for i in range(3))

def sample_key(image):
    w, h = image.size
    samples = []
    for box in [(0, 0, w // 10, h // 10), (w * 9 // 10, 0, w, h // 10), (0, h * 9 // 10, w // 10, h), (w * 9 // 10, h * 9 // 10, w, h)]:
        region = image.crop(box).resize((1, 1), Image.Resampling.BOX).getpixel((0, 0))
        samples.append(region[:3])
    # Prefer the greenest corner if the model followed chroma-key instructions.
    return max(samples, key=lambda p: int(p[1]) - int(p[0]) - int(p[2]))

def is_near_white(r, g, b):
    return r > 218 and g > 218 and b > 205 and max(r, g, b) - min(r, g, b) < 68

def is_chroma_green(r, g, b):
    return (g > 78 and g > r * 1.13 and g > b * 1.13) or (g > 38 and g > r * 1.55 and g > b * 1.38)

def keep_subject_components(alpha):
    w, h = alpha.size
    src = alpha.load()
    visited = bytearray(w * h)
    components = []

    for y in range(h):
        for x in range(w):
            idx = y * w + x
            if visited[idx] or src[x, y] <= 24:
                continue
            stack = [(x, y)]
            visited[idx] = 1
            pixels = []
            l = r = x
            t = b = y
            while stack:
                cx, cy = stack.pop()
                pixels.append((cx, cy))
                l = min(l, cx)
                r = max(r, cx)
                t = min(t, cy)
                b = max(b, cy)
                for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                    if nx < 0 or ny < 0 or nx >= w or ny >= h:
                        continue
                    nidx = ny * w + nx
                    if visited[nidx] or src[nx, ny] <= 24:
                        continue
                    visited[nidx] = 1
                    stack.append((nx, ny))
            components.append({"pixels": pixels, "area": len(pixels), "bbox": (l, t, r, b)})

    if not components:
        return alpha

    largest = max(component["area"] for component in components)
    cleaned = Image.new("L", (w, h), 0)
    dst = cleaned.load()
    for component in components:
        l, t, r, b = component["bbox"]
        touches_border = l < 3 or t < 3 or r > w - 4 or b > h - 4
        keep = component["area"] == largest or (component["area"] > largest * 0.018 and not touches_border)
        if not keep:
            continue
        for px, py in component["pixels"]:
            dst[px, py] = src[px, py]
    return cleaned

def despill_green_edges(rgba):
    pixels = rgba.load()
    w, h = rgba.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels[x, y]
            if a == 0:
                continue
            if g > max(r, b) + 6:
                neutral = min(g, max(r, b) + 4)
                pixels[x, y] = (r, neutral, b, a)
    return rgba

def cutout_cell(cell):
    rgba = cell.convert("RGBA")
    w, h = rgba.size
    key = sample_key(rgba)
    threshold = 105 if key[1] > 145 and key[1] > key[0] + 40 else 76
    threshold_sq = threshold * threshold
    pixels = rgba.load()
    visited = bytearray(w * h)
    bg = bytearray(w * h)
    queue = []

    def is_bg(x, y):
        r, g, b, a = pixels[x, y]
        if a < 16:
            return True
        if is_near_white(r, g, b):
            return True
        if key[1] > 145 and key[1] > key[0] + 40:
            return g > 92 and g > r * 1.18 and g > b * 1.18
        return key_distance((r, g, b), key) <= threshold_sq

    def push(x, y):
        if x < 0 or y < 0 or x >= w or y >= h:
            return
        idx = y * w + x
        if visited[idx] or not is_bg(x, y):
            return
        visited[idx] = 1
        bg[idx] = 1
        queue.append((x, y))

    for x in range(w):
        push(x, 0)
        push(x, h - 1)
    for y in range(h):
        push(0, y)
        push(w - 1, y)
    for x, y in queue:
        push(x + 1, y)
        push(x - 1, y)
        push(x, y + 1)
        push(x, y - 1)

    alpha = Image.new("L", (w, h), 255)
    ap = alpha.load()
    for y in range(h):
        row = y * w
        for x in range(w):
            r, g, b, _ = pixels[x, y]
            if bg[row + x] or is_chroma_green(r, g, b):
                ap[x, y] = 0
    alpha = alpha.filter(ImageFilter.GaussianBlur(0.45))
    alpha = keep_subject_components(alpha)
    rgba.putalpha(alpha)
    rgba = despill_green_edges(rgba)

    bbox = alpha.point(lambda p: 255 if p > 18 else 0).getbbox()
    if not bbox:
        return Image.new("RGBA", (768, 1440), (0, 0, 0, 0))

    pad = max(4, round(min(w, h) * 0.012))
    l, t, r, b = bbox
    l, t = max(0, l - pad), max(0, t - pad)
    r, b = min(w, r + pad), min(h, b + pad)
    subject = rgba.crop((l, t, r, b))

    canvas = Image.new("RGBA", (768, 1440), (0, 0, 0, 0))
    scale = min(768 * 0.94 / subject.width, 1440 * 0.972 / subject.height)
    nw, nh = max(1, round(subject.width * scale)), max(1, round(subject.height * scale))
    subject = subject.resize((nw, nh), Image.Resampling.LANCZOS)
    canvas.alpha_composite(subject, ((768 - nw) // 2, 1440 - nh - 8))
    return canvas

def process_sheet(character_id):
    folder = OUT / character_id
    sheet_path = folder / "sheet.png"
    if not sheet_path.exists():
        return False
    image = Image.open(sheet_path).convert("RGBA")
    cols, rows = 4, 2
    cell_w, cell_h = image.width // cols, image.height // rows
    frames = []
    for index in range(cols * rows):
        x = (index % cols) * cell_w
        y = (index // cols) * cell_h
        cell = image.crop((x, y, x + cell_w, y + cell_h))
        frame = cutout_cell(cell)
        frame.save(folder / f"frame-{index}.png")
        frames.append(frame)
    frames[0].save(folder / "portrait.png")

    preview = Image.new("RGB", (cols * 260, rows * 480), (26, 15, 23))
    for index, frame in enumerate(frames):
        small = frame.resize((256, 480), Image.Resampling.LANCZOS)
        tile = Image.new("RGBA", (260, 480), (26, 15, 23, 255))
        tile.alpha_composite(small, (2, 0))
        preview.paste(tile.convert("RGB"), ((index % cols) * 260, (index // cols) * 480))
    draw = ImageDraw.Draw(preview)
    draw.rectangle((0, 0, preview.width - 1, preview.height - 1), outline=(210, 160, 105), width=2)
    preview.save(folder / "preview-contact.jpg", quality=92)
    return True

def main():
    make_crops()
    processed = []
    for character_id in ["violet", "noir", "rose"]:
        if process_sheet(character_id):
            processed.append(character_id)
    print("processed", ", ".join(processed) if processed else "crops only")

if __name__ == "__main__":
    main()
