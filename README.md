# O-GlcNAc Static Public Site

Static frontend generated from the Django public pages. This repository is prepared for GitHub Pages at `oglcnac.org`.

Dynamic behavior is browser-side:

- Atlas/OGT-PIN search, browse, and detail pages use static JSON bundles in `/static/data/`.
- Atlas Browse uses client-side pagination over the static bundle.
- PRED-DL prediction calls `https://api.oglcnac.org/api/v1/predict`, with `/api/prediction/v1/predict` as a transition fallback while the current origin proxy is still in use.
- Contact pages use mailto links.

## GitHub Pages

This repository is prepared for GitHub Pages:

- `CNAME` points the site to `oglcnac.org`.
- `.nojekyll` disables Jekyll processing.
- `404.html` redirects legacy detail paths like `/atlas/detail/P18583` to query-style pages that work on GitHub Pages.
- PRED-DL tries `https://api.oglcnac.org/api/v1/predict` first and falls back to `/api/prediction/v1/predict` while the current origin proxy is still in use.

Regenerate static data bundles from the service SQLite database:

```bash
python3 scripts/generate_static_data.py
```
