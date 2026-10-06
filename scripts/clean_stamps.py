#!/usr/bin/env python3
# /// script
# requires-python = ">=3.11"
# dependencies = ["google-genai", "Pillow"]
# ///
"""
Clean up NPS passport cancellation stamp photos using Gemini, then apply the
official regional colour for each park via ink-density duotone.

Modes:
  Normal:   process raw photos in scripts/, save _clean.png for review
  Recolor:  reapply regional colours to existing stamps in img/cancellations/

Usage:
    GEMINI_API_KEY=key uv run scripts/clean_stamps.py         # process scripts/
    uv run scripts/clean_stamps.py --recolor                   # recolor existing stamps
    GEMINI_API_KEY=key uv run scripts/clean_stamps.py --color 009E54  # override color

Name raw photos as YYYYMMDD-{parkCode}.ext so the regional colour is auto-selected.
Pass --color RRGGBB to override for parks not yet in PARK_REGION.

NPS passport regions:
  North Atlantic  #A0522D  Mid-Atlantic    #9BCBEB  National Capital #E13833
  Southeast       #C73977  Midwest         #FFFF00  Southwest        #800080
  Rocky Mountain  #DAA520  Western         #009E54  Pacific NW/AK    #00008B
"""

import argparse
import colorsys
import io
import os
import re
import sys
from pathlib import Path

try:
    from google import genai
    from google.genai import types
    from PIL import Image
except ImportError:
    print("Missing dependencies. Run: pip install google-genai Pillow")
    sys.exit(1)

# ── Regional colour map ───────────────────────────────────────────────────────
REGION_COLORS = {
    "north_atlantic":   (160,  82,  45),  # #A0522D
    "mid_atlantic":     (155, 203, 235),  # #9BCBEB
    "national_capital": (225,  56,  51),  # #E13833
    "southeast":        (199,  57, 119),  # #C73977
    "midwest":          (255, 255,   0),  # #FFFF00
    "southwest":        (128,   0, 128),  # #800080
    "rocky_mountain":   (218, 165,  32),  # #DAA520
    "western":          (  0, 158,  84),  # #009E54
    "pacific_nw_ak":    (  0,   0, 139),  # #00008B
}

PARK_REGION = {
    # North Atlantic (ME, NH, VT, MA, RI, CT, NY, NJ)
    "acad": "north_atlantic",   # Acadia, ME
    # Midwest (OH, IN, MI, WI, MN, IA, MO, IL)
    "voya": "midwest",          # Voyageurs, MN
    # Southwest (TX, NM, OK, AR, LA)
    "bibe": "southwest",        # Big Bend, TX
    # Rocky Mountain (MT, WY, CO, UT, ND, SD, NE, KS)
    "glac": "rocky_mountain",   # Glacier, MT
    "grte": "rocky_mountain",   # Grand Teton, WY
    "yell": "rocky_mountain",   # Yellowstone, WY
    "arch": "rocky_mountain",   # Arches, UT
    "cany": "rocky_mountain",   # Canyonlands, UT
    "care": "rocky_mountain",   # Capitol Reef, UT
    "brca": "rocky_mountain",   # Bryce Canyon, UT
    "zion": "rocky_mountain",   # Zion, UT
    # Western (CA, AZ, HI, NV, Pacific territories)
    "grca": "western",          # Grand Canyon, AZ
    "pefo": "western",          # Petrified Forest, AZ
    "sagu": "western",          # Saguaro, AZ
    "havo": "western",          # Hawaii Volcanoes, HI
    "hale": "western",          # Haleakala, HI
    "yose": "western",          # Yosemite, CA
    "sequ": "western",          # Sequoia, CA
    "kica": "western",          # Kings Canyon, CA
    "deva": "western",          # Death Valley, CA/NV
    "jotr": "western",          # Joshua Tree, CA
    "chis": "western",          # Channel Islands, CA
    "pinn": "western",          # Pinnacles, CA
    "lavo": "western",          # Lassen Volcanic, CA
    "redw": "western",          # Redwood, CA
    # Pacific NW & Alaska (WA, OR, ID, AK)
    "olym": "pacific_nw_ak",    # Olympic, WA
    "mora": "pacific_nw_ak",    # Mount Rainier, WA
}

FALLBACK_COLOR = (237, 112, 49)  # #ED7031 - used when park not in PARK_REGION
INK_FLOOR = 0.06  # ink fraction below which pixel is transparent
INK_RAMP  = 0.16  # ramp width: full opacity at floor + ramp
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


def extract_park_code(stem: str) -> str | None:
    m = re.match(r"^\d{8}-([a-z]{4})$", stem)
    if m:
        return m.group(1)
    if re.match(r"^[a-z]{4}$", stem):
        return stem
    return None


def get_target_color(park_code: str | None, override: tuple | None) -> tuple[int, int, int]:
    if override:
        return override
    if park_code and park_code in PARK_REGION:
        return REGION_COLORS[PARK_REGION[park_code]]
    return FALLBACK_COLOR


def apply_duotone(img: Image.Image, target: tuple[int, int, int]) -> Image.Image:
    """Derive alpha from ink density (1 - luminance) and apply target colour."""
    tr, tg, tb = target
    rgba = img.convert("RGBA")
    pixels = []
    for r, g, b, a in rgba.getdata():
        if a < 10:
            pixels.append((0, 0, 0, 0))
            continue
        gray = (0.299 * r + 0.587 * g + 0.114 * b) / 255
        ink = 1.0 - gray
        alpha = max(0.0, min(1.0, (ink - INK_FLOOR) / INK_RAMP))
        pixels.append((tr, tg, tb, int(alpha * 255)))
    result = Image.new("RGBA", rgba.size)
    result.putdata(pixels)
    return result


# ── Main ──────────────────────────────────────────────────────────────────────

parser = argparse.ArgumentParser(description="Clean NPS passport cancellation stamps")
parser.add_argument("--color", metavar="RRGGBB", help="Override regional color (hex, no #)")
parser.add_argument("--recolor", action="store_true", help="Reapply regional colors to img/cancellations/")
args = parser.parse_args()

color_override = None
if args.color:
    h = args.color.lstrip("#")
    color_override = (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))

scripts_dir = Path(__file__).parent

if args.recolor:
    cancellations_dir = scripts_dir.parent / "img" / "cancellations"
    stamps = sorted(f for f in cancellations_dir.iterdir()
                    if f.suffix.lower() == ".png" and not f.name.startswith("."))
    for stamp_path in stamps:
        park_code = extract_park_code(stamp_path.stem)
        target = get_target_color(park_code, color_override)
        region = PARK_REGION.get(park_code, "unknown") if park_code else "unknown"
        img = Image.open(stamp_path).convert("RGBA")
        img = apply_duotone(img, target)
        print(f"{stamp_path.name}: {park_code or '?'} ({region}) → #{target[0]:02X}{target[1]:02X}{target[2]:02X}")
        img.save(stamp_path, "PNG")
    print(f"\nDone {len(stamps)} stamps in {cancellations_dir}")
    sys.exit(0)

# Normal mode: process raw photos in scripts/
API_KEY = os.environ.get("GEMINI_API_KEY")
if not API_KEY:
    print("Error: set GEMINI_API_KEY environment variable before running")
    sys.exit(1)

images = sorted(
    f for f in scripts_dir.iterdir()
    if f.suffix.lower() in MIME_TYPES and "_clean" not in f.stem
)

if not images:
    print("No images found in scripts/ - add your stamp photos and re-run")
    sys.exit(0)

client = genai.Client(api_key=API_KEY)

for image_path in images:
    park_code = extract_park_code(image_path.stem)
    target = get_target_color(park_code, color_override)
    region = PARK_REGION.get(park_code, "unknown") if park_code else "unknown"
    print(f"Processing {image_path.name} ({park_code or '?'}, {region}) → #{target[0]:02X}{target[1]:02X}{target[2]:02X}")

    image_data = image_path.read_bytes()
    mime_type = MIME_TYPES[image_path.suffix.lower()]

    response = client.models.generate_content(
        model="gemini-3.1-flash-image",
        contents=[
            types.Part.from_bytes(data=image_data, mime_type=mime_type),
            PROMPT,
        ],
        config=types.GenerateContentConfig(response_modalities=["IMAGE"]),
    )

    image_part = next(
        (p for p in response.candidates[0].content.parts if p.inline_data), None
    )
    if not image_part:
        print(f"  No image returned - skipping")
        continue

    img = Image.open(io.BytesIO(image_part.inline_data.data)).convert("RGBA")
    img = img.resize((160, 160), Image.LANCZOS)
    img = apply_duotone(img, target)

    output_path = scripts_dir / f"{image_path.stem}_clean.png"
    img.save(output_path, "PNG")
    print(f"  Saved: {output_path.name}")

print("\nDone. Review the _clean files, then copy to img/cancellations/ with")
print("the naming convention: YYYYMMDD-{parkCode}.png")
