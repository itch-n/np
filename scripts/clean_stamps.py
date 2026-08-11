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
  - Green / cyan (hue 80-210°): duotone to a consistent dark teal-green
  - Blue (hue 210-270°):        darken while preserving hue
  - Warm / brown / black:       remove white background only
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
BLUE_BRIGHTNESS        = 0.60             # multiplier for blue stamps
WHITE_BG_FUZZ          = 0.20             # fuzz threshold for background removal
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


def colour_label(hue: float) -> str:
    if 80 <= hue <= 210:
        return "green/cyan → duotone"
    elif 210 < hue <= 270:
        return "blue → darken"
    else:
        return "warm/brown → no colour change"


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

    # Remove white background
    img = remove_white_bg(img)

    # Apply colour normalisation
    if 80 <= hue <= 210:
        img = apply_green_duotone(img)
    elif 210 < hue <= 270:
        img = normalize_blue(img)

    output_path = scripts_dir / f"{image_path.stem}_clean.png"
    img.save(output_path, "PNG")
    print(f"  Saved: {output_path.name}")

print("\nDone. Review the _clean files, then copy to img/cancellations/ with")
print("the naming convention: YYYYMMDD-{parkCode}.png")
