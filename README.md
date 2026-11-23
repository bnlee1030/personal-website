# Personal website: the pond

The home page is an ink painting of four carp. Each fish is a link to one section of the site:

| Fish | Section |
| --- | --- |
| Big dark carp (left) | About |
| Pale fish (top) | Writing |
| Curling carp (right) | Music |
| Small golden carp (bottom) | Work |

The fish sway gently, and now and then a ripple spreads across the water. Hover over a fish (or a name in the menu at the bottom) and the fish lifts while the others fade back. Click a fish and it swims off; the pond drifts away and the section opens on a different part of the pond. "Back to the pond" (or Esc) brings the fish swimming home.

It is a plain static site with no build step: `index.html`, `css/style.css`, `js/pond.js` and `assets/`.

## Run it locally

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

(Opening `index.html` straight from disk works too, but then clicks use each fish's rectangle instead of its exact outline.)

## Edit the content

All text is in `index.html`:

- **Name and tagline**: the `.mark` header near the top, plus `<title>`. The red seal shows your initials (`YN`).
- **Sections**: each one is an `<article class="section" data-route="...">` block. Replace the placeholder text, links, posts, tracks, jobs and publications.
- **Résumé**: put a `resume.pdf` next to `index.html`; the Work page already links to it.
- **Which fish goes where**: change a fish's `href` and `aria-label` in the pond, plus its `data-route` section.

Labels sit at `--lx/--ly` on each fish (as a % of the fish's image, the point is the label's bottom centre). Each fish's swimming direction is `data-heading`.

## Regenerating the fish

`tools/extract_fish.py` cuts the fish out of the photo of the painting (`tools/source-painting.jpg`), evens out the lighting, and paints the paper back in where the fish were:

```sh
pip install opencv-python-headless numpy
python3 tools/extract_fish.py tools/source-painting.jpg assets
```

The fish outlines are hand-drawn polygons in that script, refined with GrabCut. To use a different painting, update the crop and polygons, then copy the new numbers from `assets/fish.json` into the fish `style` attributes in `index.html`.

## Publishing

Any static host works. For GitHub Pages: Settings → Pages → deploy from the branch, root folder. `.nojekyll` is already there.
