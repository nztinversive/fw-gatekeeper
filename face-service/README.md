# Face Encoding Service

FastAPI service for face encoding and matching, used by fw-gatekeeper.

## Endpoints

- `GET /health` — health check
- `POST /encode` — `{ photos: string[] }` → `{ encoding: number[] }` (512-dim normalized average embedding)
- `POST /match` — `{ photo: string, encodings: [{ worker_id, encoding }] }` → `{ match: { worker_id, confidence } | null }`

Photos are base64 JPEG data URLs. Matching uses cosine similarity with a 0.4 threshold.

`POST /encode` and `POST /match` require the `x-face-service-key` header to match
`FACE_SERVICE_KEY`. `GET /health` remains public for deployment and dashboard health checks.
Set `FACE_SERVICE_ALLOWED_ORIGINS` to a comma-separated list of trusted dashboard origins;
it defaults to `https://fw-gatekeeper.onrender.com` and rejects wildcard configuration.

## Run

```bash
export FACE_SERVICE_KEY="replace-with-a-long-random-secret"
py -m pip install -r requirements.txt
py main.py
# or: start.bat
```

Runs on port 5557.
