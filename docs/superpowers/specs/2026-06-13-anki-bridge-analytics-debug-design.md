# Anki Bridge Analytics And Debug Design

## Goal

Add a local analytics and debug layer to the Anki Bridge so the user can quickly see API spend, card/image outcomes, and job failures by day, month, custom date range, and language.

## Scope

The first implementation uses existing JSON/job artifacts instead of adding a database. It reads per-job `costs.jsonl`, job payloads, state files, and image-pipeline records, then exposes aggregated summaries through bridge endpoints and a compact dashboard in the panel.

## Analytics

The dashboard supports filters:

- period: today, current month, all time, or custom `from`/`to`
- language: all, English, or Russian

Metrics shown:

- total API cost
- card-generation token cost
- image-judge token cost
- image-generation cost
- card count and completed/failed/partial job counts
- image outcomes: Google/real, generated, skipped, failed
- image percentages: percent Google/real, percent generated, percent skipped, percent failed
- estimated savings from using real Google/Openverse images instead of generated images

## Data Model

The bridge derives analytics from:

- `bridge/runtime/queue.json`
- `bridge/runtime/jobs/<jobId>/job.json`
- `bridge/runtime/jobs/<jobId>/state.json`
- `bridge/runtime/jobs/<jobId>/log/costs.jsonl`
- fallback global log at `Automatic Anki/log/costs.jsonl` only when needed for historical totals later

Each cost record is classified by:

- type: card tokens, image judge tokens, image guard tokens, generated image, real image, image pipeline
- language: inherited from the job
- date: record date from `costs.jsonl`, falling back to job creation date

## API

Add bridge endpoints:

- `GET /analytics/summary?from=YYYY-MM-DD&to=YYYY-MM-DD&lang=en|ru|all`
- `GET /analytics/jobs?from=YYYY-MM-DD&to=YYYY-MM-DD&lang=en|ru|all`
- `GET /jobs/<job_id>/debug-bundle`

`summary` returns totals and percentages. `jobs` returns per-job rows for the dashboard. `debug-bundle` returns a JSON diagnostic package with job payload, state, recent bridge log lines, costs, artifact list, Anki config path details, and sanitized config values.

## Panel UI

Add an "Analytics & Debug" section to the bridge area:

- quick range buttons: Today, Month, All
- custom date inputs
- language selector: All, EN, RU
- metric cards
- image source percentage row
- per-job table with status, language, deck, cost, image source counts, last error, and debug button

The UI should stay compact and operational, not a marketing-style dashboard.

## Error Handling

Analytics must tolerate missing files, partial jobs, malformed JSONL lines, and jobs created before analytics existed. Missing values count as zero and the job row still appears when enough metadata exists.

Debug bundles must not include API keys or raw `.env` secrets.

## Testing

Verify with:

- `python -m py_compile bridge/server.py`
- endpoint checks for `/analytics/summary` and `/analytics/jobs`
- at least one completed job and one failed job visible in results
- panel loads without breaking existing Anki job controls

