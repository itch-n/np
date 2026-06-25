#!/usr/bin/env python3
"""
Clean up NPS passport cancellation stamp photos using Gemini.

Place raw stamp photos in this folder (jpg/png/heic) and run:
    GEMINI_API_KEY=your_key python3 scripts/clean_stamps.py

Cleaned 160x160 PNGs are saved alongside the originals with a _clean suffix
for review. Once happy, rename and move to img/cancellations/.
"""

import io
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

    img = Image.open(io.BytesIO(image_part.inline_data.data)).convert("RGB")
    img = img.resize((160, 160), Image.LANCZOS)

    output_path = scripts_dir / f"{image_path.stem}_clean.png"
    img.save(output_path, "PNG")
    print(f"  Saved: {output_path.name}")

print("\nDone. Review the _clean files, then copy to img/cancellations/ with")
print("the naming convention: YYYYMMDD-{parkCode}.png")
