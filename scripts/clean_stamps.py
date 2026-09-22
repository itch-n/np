#!/usr/bin/env python3
# /// script
# requires-python = ">=3.11"
# dependencies = ["google-genai", "Pillow"]
# ///
"""
Clean up NPS passport cancellation stamp photos using Gemini, then normalise
colours so all stamps look consistent against the card's cream background.

Place raw stamp photos in this folder (jpg/png/heic) and run:
    GEMINI_API_KEY=your_key uv run scripts/clean_stamps.py

Cleaned 160x160 PNGs are saved alongside the originals with a _clean suffix
for review. Once happy, rename and move to img/cancellations/.

Colour treatment applied automatically by detected hue:
  - Green / cyan (hue 80-210°): duotone to teal-green, lightness normalised to L=52%
  - Blue (hue 210-270°):        darken while preserving hue
  - Warm / orange (other):      alpha duotone to #ED7031, normalised to L=50% S=68%
"""

import colorsys
import io
import math
import os
import sys
from pathlib import Path

try:
    from google import genai
    from google.genai import types
    from PIL import Image
except ImportError:
    print("Missing dependencies. Run: pip install google-genai Pillow")
    sys.exit(1)

API_KEY = os.environ.get("GEMINI_API_KEY")
if not API_KEY:
    print("Error: set GEMINI_API_KEY environment variable before running")
    sys.exit(1)

# ── Colour normalisation settings ────────────────────────────────────────────
GREEN_DUOTONE_TARGET   = (90, 184, 154)   # #5AB89A - consistent teal-green
GREEN_DUOTONE_BRIGHT   = 0.85             # luminance multiplier before tint
GREEN_DUOTONE_MIX      = 0.50             # how strongly the target colour is applied
GREEN_TARGET_L         = 0.52             # target median lightness for green stamps
BLUE_BRIGHTNESS        = 0.60             # multiplier for blue stamps
WHITE_BG_FUZZ          = 0.20             # fuzz threshold for background removal
ORANGE_DUOTONE_TARGET  = (237, 112, 49)   # #ED7031 - NPS orange for warm-ink stamps
ORANGE_INK_FLOOR       = 0.06             # ink fraction below which pixel is transparent
ORANGE_INK_RAMP        = 0.16             # ramp width: full opacity at floor + ramp
WARM_TARGET_L          = 0.50             # target median lightness for warm stamps
WARM_TARGET_S          = 0.68             # target median saturation for warm stamps
# ─────────────────────────────────────────────────────────────────────────────

PROMPT = (
    "Remove the background from this passport cancellation stamp photo and replace it with pure white. "
    "Do not redraw, recreate, or alter the stamp itself in any way - keep the original ink, texture, and imperfections exactly as they are. "
    "Do not adjust the colors, contrast, or brightness of the stamp. "
    "Only remove shadows, gradients, and background noise outside the stamp. "
    "The stamp should look exactly as it does in the photo, just on a clean white background."
)

MIME_TYPES = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".heic": "image/heic",
}


def get_dominant_hue(img: Image.Image) -> float:
    """Returns median hue (0-360°) of non-white, non-transparent, saturated pixels."""
    rgba = img.convert("RGBA")
    hues = []
    for r, g, b, a in rgba.getdata():
        if a < 30:
            continue
        if r > 200 and g > 200 and b > 200:
            continue
        h, s, _ = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
        if s > 0.15:
            hues.append(h * 360)
    if not hues:
        return 30.0  # default to warm/brown if no saturated pixels found
    hues.sort()
    return hues[len(hues) // 2]


def remove_white_bg(img: Image.Image, fuzz: float = WHITE_BG_FUZZ) -> Image.Image:
    """Make near-white pixels transparent."""
    rgba = img.convert("RGBA")
    threshold = fuzz * math.sqrt(3)
    pixels = []
    for r, g, b, a in rgba.getdata():
        dist = math.sqrt((1 - r / 255) ** 2 + (1 - g / 255) ** 2 + (1 - b / 255) ** 2)
        pixels.append((r, g, b, 0 if dist < threshold else a))
    result = Image.new("RGBA", rgba.size)
    result.putdata(pixels)
    return result


def apply_green_duotone(img: Image.Image) -> Image.Image:
    """Desaturate and tint to a consistent green, preserving transparency."""
    tr, tg, tb = GREEN_DUOTONE_TARGET
    mix = GREEN_DUOTONE_MIX
    bright = GREEN_DUOTONE_BRIGHT
    rgba = img.convert("RGBA")
    pixels = []
    for r, g, b, a in rgba.getdata():
        if a < 10:
            pixels.append((0, 0, 0, 0))
            continue
        gray = int((0.299 * r + 0.587 * g + 0.114 * b) * bright)
        pixels.append((
            min(255, int(gray * (1 - mix) + tr * mix)),
            min(255, int(gray * (1 - mix) + tg * mix)),
            min(255, int(gray * (1 - mix) + tb * mix)),
            a,
        ))
    result = Image.new("RGBA", rgba.size)
    result.putdata(pixels)
    return result


def normalize_blue(img: Image.Image) -> Image.Image:
    """Darken blue stamps while preserving their hue."""
    bright = BLUE_BRIGHTNESS
    rgba = img.convert("RGBA")
    pixels = []
    for r, g, b, a in rgba.getdata():
        if a < 10:
            pixels.append((0, 0, 0, 0))
            continue
        pixels.append((int(r * bright), int(g * bright), int(b * bright), a))
    result = Image.new("RGBA", rgba.size)
    result.putdata(pixels)
    return result


def apply_warm_duotone(img: Image.Image) -> Image.Image:
    """
    Alpha-based duotone for warm/orange stamps.

    Fuzz-based background removal (used for green/blue) maps thin ink strokes
    towards white before thresholding, which destroys fine text detail. This
    function instead derives alpha directly from ink density so thin strokes
    stay vivid at partial opacity rather than disappearing.
    """
    tr, tg, tb = ORANGE_DUOTONE_TARGET
    rgba = img.convert("RGBA")
    pixels = []
    for r, g, b, a in rgba.getdata():
        if a < 10:
            pixels.append((0, 0, 0, 0))
            continue
        gray = (0.299 * r + 0.587 * g + 0.114 * b) / 255
        ink = 1.0 - gray
        alpha = max(0.0, min(1.0, (ink - ORANGE_INK_FLOOR) / ORANGE_INK_RAMP))
        pixels.append((tr, tg, tb, int(alpha * 255)))
    result = Image.new("RGBA", rgba.size)
    result.putdata(pixels)
    return result


def normalize_lightness(img: Image.Image, target_l: float, target_s: float = None) -> Image.Image:
    """Scale median lightness (and optionally saturation) to target values."""
    rgba = img.convert("RGBA")
    data = list(rgba.getdata())
    ls_vals = sorted(l for r,g,b,a in data if a > 200
                     for _,l,_ in [colorsys.rgb_to_hls(r/255,g/255,b/255)])
    if not ls_vals:
        return img
    scale_l = target_l / ls_vals[len(ls_vals) // 2]
    scale_s = 1.0
    if target_s is not None:
        ss_vals = sorted(s for r,g,b,a in data if a > 200
                         for _,_,s in [colorsys.rgb_to_hls(r/255,g/255,b/255)])
        scale_s = target_s / ss_vals[len(ss_vals) // 2] if ss_vals[len(ss_vals) // 2] > 0 else 1.0
    pixels = []
    for r, g, b, a in data:
        if a < 10:
            pixels.append((0, 0, 0, 0))
            continue
        h, l, s = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
        l = min(1.0, l * scale_l)
        s = min(1.0, s * scale_s)
        rn, gn, bn = colorsys.hls_to_rgb(h, l, s)
        pixels.append((int(rn * 255), int(gn * 255), int(bn * 255), a))
    result = Image.new("RGBA", rgba.size)
    result.putdata(pixels)
    return result


def colour_label(hue: float) -> str:
    if 80 <= hue <= 210:
        return "green/cyan → duotone"
    elif 210 < hue <= 270:
        return "blue → darken"
    else:
        return "warm/orange → alpha duotone"


# ── Main ──────────────────────────────────────────────────────────────────────

scripts_dir = Path(__file__).parent
images = sorted(
    f for f in scripts_dir.iterdir()
    if f.suffix.lower() in MIME_TYPES and "_clean" not in f.stem
)

if not images:
    print("No images found in scripts/ - add your stamp photos and re-run")
    sys.exit(0)

client = genai.Client(api_key=API_KEY)

for image_path in images:
    print(f"Processing {image_path.name} ...")
    image_data = image_path.read_bytes()
    mime_type = MIME_TYPES[image_path.suffix.lower()]

    response = client.models.generate_content(
        model="gemini-3.1-flash-image",
        contents=[
            types.Part.from_bytes(data=image_data, mime_type=mime_type),
            PROMPT,
        ],
        config=types.GenerateContentConfig(
            response_modalities=["IMAGE"],
        ),
    )

    image_part = next(
        (p for p in response.candidates[0].content.parts if p.inline_data),
        None,
    )
    if not image_part:
        print(f"  No image returned for {image_path.name} - skipping")
        continue

    img = Image.open(io.BytesIO(image_part.inline_data.data)).convert("RGBA")
    img = img.resize((160, 160), Image.LANCZOS)

    # Detect hue before removing background (white pixels excluded in analysis)
    hue = get_dominant_hue(img)
    print(f"  Dominant hue: {hue:.0f}° → {colour_label(hue)}")

    if 80 <= hue <= 210:
        img = remove_white_bg(img)
        img = apply_green_duotone(img)
        img = normalize_lightness(img, GREEN_TARGET_L)
    elif 210 < hue <= 270:
        img = remove_white_bg(img)
        img = normalize_blue(img)
    else:
        # Warm/orange: alpha-based duotone handles transparency internally.
        # Skipping remove_white_bg here is intentional - fuzz removal maps light
        # ink strokes towards white before thresholding, destroying thin text detail.
        img = apply_warm_duotone(img)
        img = normalize_lightness(img, WARM_TARGET_L, WARM_TARGET_S)

    output_path = scripts_dir / f"{image_path.stem}_clean.png"
    img.save(output_path, "PNG")
    print(f"  Saved: {output_path.name}")

print("\nDone. Review the _clean files, then copy to img/cancellations/ with")
print("the naming convention: YYYYMMDD-{parkCode}.png")
