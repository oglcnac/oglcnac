# O-GlcNAc Static Public Site

Static frontend generated from the Django public pages. Serve this directory as the public web root and route API calls to the FastAPI services.

Expected reverse proxy routes:

```text
/api/data/ -> http://127.0.0.1:8020/api/
/api/prediction/ -> http://127.0.0.1:8010/api/
/atlas/detail/* -> /atlas/detail/index.html
/ogt-pin/detail/* -> /ogt-pin/detail/index.html
all other public page paths -> matching index.html files
```

Dynamic behavior is browser-side:

- Atlas/OGT-PIN search, browse, and detail pages call `/api/data/v1`.
- Atlas Browse uses server-side pagination through `/api/data/v1/atlas/browse` so large species datasets are not loaded into the browser in one response.
- PRED-DL prediction calls `/api/prediction/v1/predict`.
- Contact pages use mailto links.
