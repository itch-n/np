# Year Card SVG Generation Prompt

Use this prompt when regenerating year card SVGs (e.g., when visits change or a new year begins).

---

## Request

Generate year card SVGs for my National Parks tracker based on the visits data in `./data/visits.json`. Each card should be a calm, minimal nature-inspired scene with a distinct visual personality.

## Technical Specifications

- **SVG viewBox**: `0 0 1024 300`
- **Border radius**: `rx="12"`
- **File location**: `./img/years/YYYY.svg`
- **Font**: `system-ui, -apple-system, sans-serif`, 80pt, weight 700
- **Year text positioning**:
  - Shadow: x=514, y=172, opacity=0.25, fill=[scene-tinted color]
  - Foreground: x=512, y=170, opacity=1.0, fill=#FCFAF8 (off-white)

## Design Requirements

### 1. Visual Distinction (Most Important)
Each year MUST have a distinctly different color palette. Prioritize visual contrast between years over strict adherence to site palette.

### 2. Color Palette Base
Earth tones inspired by site palette:
- Primary green: #82A686
- Dark green: #5C8B5F
- Light green: #B8D4BB
- Lightest: #EDF5EA
- Browns, beiges, tans, warm grays

Use different saturations, tones, and combinations to create visual distinction.

### 3. Style Guidelines
- Calm, minimal aesthetic
- Geometric shapes with clean lines
- Layered opacity for depth (distant=~0.4, mid=~0.5-0.6, foreground=~0.7-0.8)
- Gradients for sky/atmosphere
- Silhouetted or simplified foreground elements

### 4. Theme Selection
Base each year's theme on the types of parks visited that year (check `./data/visits.json`):

| Park Types | Theme Ideas |
|------------|-------------|
| Desert (Joshua Tree, Saguaro, Death Valley) | Desert landscapes with cacti, shrubs, mesas |
| Alpine/Mountain (Glacier, Rainier, Yosemite, Sequoia) | Snow-capped peaks with conifer forests |
| Tropical (Hawaii Volcanoes, Haleakala) | Volcanic mountains with palm silhouettes |
| Canyon/Red Rock (Bryce, Zion, Arches, Canyonlands) | Mesas, rock formations, warm tones |
| Coastal (Olympic, Acadia, Channel Islands) | Ocean, cliffs, coastal vegetation |

## SVG Structure Pattern

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 300">
  <!-- Sky gradient -->
  <defs>
    <linearGradient id="sky-YYYY" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:#XXXXXX;stop-opacity:1" />
      <stop offset="50%" style="stop-color:#XXXXXX;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#XXXXXX;stop-opacity:1" />
    </linearGradient>
  </defs>

  <rect width="1024" height="300" fill="url(#sky-YYYY)" rx="12"/>

  <!-- Optional: Sun/moon (circles with opacity) -->

  <!-- Distant layer: Mountains/formations (opacity ~0.4) -->
  <path d="..." fill="#XXXXXX" opacity="0.4"/>

  <!-- Mid-range layer: Secondary features (opacity ~0.5-0.6) -->
  <path d="..." fill="#XXXXXX" opacity="0.5"/>

  <!-- Foreground layer: Main features (opacity ~0.7) -->
  <path d="..." fill="#XXXXXX" opacity="0.7"/>

  <!-- Details: Vegetation/rocks (opacity ~0.5-0.8) -->
  <g opacity="0.7">
    <!-- Tree/plant elements -->
  </g>

  <!-- Year text with shadow -->
  <text x="514" y="172" font-family="system-ui, -apple-system, sans-serif"
        font-size="80" font-weight="700" fill="#XXXXXX"
        text-anchor="middle" opacity="0.25">YYYY</text>
  <text x="512" y="170" font-family="system-ui, -apple-system, sans-serif"
        font-size="80" font-weight="700" fill="#FCFAF8"
        text-anchor="middle">YYYY</text>
</svg>
```

## Current Examples (Reference)

These show the level of visual distinction needed:

- **2021**: Warm tans/browns - tropical volcanic sunset with palm silhouettes
- **2024**: Sage greens with light sand - desert with Joshua trees
- **2025**: Deep saturated forest greens - alpine mountains with snow-capped peaks and conifers
- **2026**: Peachy beige/dusty rose - desert sunrise with saguaro cacti

## Output

Create SVG files for each year that has visits, ensuring:
1. Each year has a visually distinct color story
2. Themes reflect the parks visited that year
3. Calm, minimal nature aesthetic is maintained
4. All technical specs are followed
