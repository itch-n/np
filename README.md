# National Parks Tracker

An interactive map visualization of U.S. National Parks visits, built with D3.js.

**Live site:** https://itch-n.github.io/np

## What it does

- Renders all 63 U.S. National Parks as circular emblems on an Albers USA projection (including territories)
- Animates a chronological reveal of visited parks with a stamp effect on page load
- Shows a visits table below the map, grouped by year with illustrated year cards
- Hover (or tap on mobile) any park emblem to see its name and state

## Tech stack

- [D3.js v6](https://d3js.org/) - map rendering, data binding, animation
- [TopoJSON](https://github.com/topojson/topojson) - US state/nation geometry
- [geo-albers-usa-territories](https://github.com/rveciana/geo-albers-usa-territories) - projection that includes AK, HI, PR, VI, AS
- Plain HTML/CSS/ES modules - no build step

## Running locally

Because the app uses ES modules and fetches local JSON, it needs an HTTP server:

```sh
npx serve .
# or
python3 -m http.server
```

Then open `http://localhost:3000` (or whatever port is shown).

## Project structure

```
data/
  parks.json       # 63 national parks - name, parkCode, lat/lng, state
  visits.json      # visit records - parkCode, date, image paths

img/
  np/              # park emblem PNGs, one per park (named by parkCode)
  cancellations/   # cancellation stamp PNGs, one per visit
  visits/          # visit photos, one per visit
  years/           # year card SVGs shown at the start of each year group

js/
  main.js          # map rendering, animation, visits table
  tooltip.js       # hover/touch tooltip interactions
  svgFilters.js    # SVG filter definitions (inset shadow, drop shadow)

css/
  style.css

generate-year-cards-prompt.md   # prompt for regenerating year card SVGs
```

## Adding a visit

**Checklist:**

- [ ] Add entry to `data/visits.json`
- [ ] Add cancellation stamp image: `img/cancellations/YYYYMMDD-{parkCode}.png`
- [ ] Add visit photo: `img/visits/YYYYMMDD-{parkCode}.{ext}`
- [ ] If the year is new (no prior visits that year), create a year card SVG: `img/years/YYYY.svg`
- [ ] If the park is not yet in `data/parks.json`, add it (rare - all 63 parks are already present)

### 1. Update `data/visits.json`

Append a new object to the array. Fields:

| Field               | Type   | Description |
|---------------------|--------|-------------|
| `parkCode`          | string | 4-letter NPS park code (lowercase), e.g. `"yose"` |
| `date`              | string | ISO date `"YYYY-MM-DD"` |
| `cancellationImage` | string | Path from project root: `"img/cancellations/YYYYMMDD-{parkCode}.png"` |
| `visitImage`        | string | `"../img/visits/YYYYMMDD-{parkCode}.{ext}"`, or `"null"` if no photo - see notes below |

```json
{
  "parkCode": "grca",
  "date": "2026-05-10",
  "cancellationImage": "img/cancellations/20260510-grca.png",
  "visitImage": "../img/visits/20260510-grca.jpg"
}
```

> **Why `../img/visits/` and not `img/visits/`?**
> `visitImage` ends up in a CSS custom property (`--visit-bg-image`) consumed by `background-image: var(--visit-bg-image)` inside `css/style.css`. Browsers resolve `url()` values relative to the stylesheet that consumes them, so the path must be relative to the `css/` directory. `../img/visits/` navigates one level up from `css/` to the project root, then into `img/visits/`. Using `img/visits/` would resolve to `css/img/visits/` and break.
>
> `cancellationImage` is set via an `<img src>` attribute in JavaScript, which resolves from the document root, so it needs no `../` prefix.
>
> **No photo?** Set `visitImage` to the string `"null"` and omit the image file. The card background will simply be blank.

Chronological order is conventional but not required.

### 2. Add the cancellation stamp image

- **Path:** `img/cancellations/YYYYMMDD-{parkCode}.png`
- **Format:** PNG
- **Dimensions:** 160x160px (2x for the 80px display size)
- The rubber cancellation stamp from the park's passport stamp, displayed as the primary visual in the visit card
- **Tip:** If the scanned stamp has overlapping stamps or noise, Gemini image generation does a great job producing a clean recreation. Prompt it with the park name, date, and location text from the original stamp.

### 3. Add the visit photo

- **Path:** `img/visits/YYYYMMDD-{parkCode}.{ext}` (jpg, jpeg, or png)
- **Dimensions:** 500px wide, height flexible - the image is cropped from the center via `background-size: cover`, so only the middle strip is visible at card height (92px). Landscape or square crops work best; tall portrait images lose most of their content.
- Used as a blurred background image on the visit card, revealed on hover
- **Tip:** To make photos pop, apply a gentle filter before saving: `magick input.jpg -brightness-contrast 3x18 -modulate 100,140,100 -unsharp 0x0.6+0.5+0 output.jpg` (boosts contrast, saturation, and adds light sharpening)

### 4. Create a year card SVG (new years only)

If the visit is in a year with no existing card in `img/years/`, create one. Use the prompt in [`generate-year-cards-prompt.md`](generate-year-cards-prompt.md). Key specs:

- **File:** `img/years/YYYY.svg`
- **Dimensions:** viewBox `0 0 1024 300` (~3.4:1 landscape, displayed at full card width × 92px height)
- Base the theme on the types of parks visited that year (check `data/visits.json`)
- Must be visually distinct from existing year cards - different color palette and landscape theme

### 5. Adding a new park (rare)

All 63 current U.S. National Parks are already in `data/parks.json`. Only needed if a new park has been designated.

Fields: `name`, `parkCode` (4-letter lowercase NPS code), `latitude`, `longitude`, `state` (2-letter abbreviation).

If coordinates need adjustment to avoid overlap or water placement, document the original value in a `_comment` field:

```json
{
  "name": "Pinnacles National Park",
  "parkCode": "pinn",
  "latitude": "36.49029208",
  "longitude": "-119.1813607",
  "state": "CA",
  "_comment": "shifted slightly west so it's not in water. long was -121.1813607"
}
```

You must also add a park emblem image at `img/np/{parkCode}.png` (96x103px PNG). Without it the park will silently disappear from the map - the code hides missing emblems rather than showing a broken image.

Alaska, Hawaii, and territory parks are automatically rendered at a smaller radius - no special handling needed.

Finally, update the hardcoded total in `index.html`:

```html
<span class="top__counter-text-63">63</span>
```

Change `63` to the new total and rename the class to match (e.g. `top__counter-text-64`).
