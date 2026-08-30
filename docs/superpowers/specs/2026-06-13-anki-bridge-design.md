# Anki Bridge Integration Design

## Goal

Reduce friction between the mining panel and Automatic Anki by replacing the current manual export-and-paste workflow with a one-click pipeline that:

- sends selected phrases directly from the panel,
- splits mixed selections by language and processes them sequentially,
- uses saved per-language presets,
- opens Anki Desktop if needed and waits for AnkiConnect,
- preserves generated artifacts so failed jobs can be resumed without regenerating everything,
- establishes the first version of a future online architecture where the user installs only a local bridge.

## Scope

This design covers:

- panel-side job creation and progress UI,
- a local resident Windows bridge process,
- a non-interactive job API for Automatic Anki,
- durable job storage and retry behavior,
- export status synchronization back to the panel.

This design does not yet cover:

- remote authentication,
- cloud queueing,
- multi-device bridge coordination,
- installer packaging/distribution.

## Current State

Current user flow:

1. Mine phrases into the panel.
2. Select around 10 phrases once per day.
3. Export a `.txt` file from the panel.
4. Copy the exported text manually.
5. Open Automatic Anki manually.
6. Ensure Anki Desktop is open manually.
7. Re-select deck/language/image settings manually.
8. Paste the text and start processing manually.

Current technical constraints:

- `painel.js` only exports text and immediately marks selected phrases as `status='exported'`.
- `Automatic Anki/start.py` is interactive and collects settings from terminal prompts.
- `send_to_anki.py` expects AnkiConnect on `http://localhost:8765`.
- Automatic Anki cleanup currently runs after send-to-Anki and is not organized around resumable jobs.

## Target Architecture

Three components:

### 1. Panel Orchestrator

The panel remains the main UX for selecting phrases and managing presets.

Responsibilities:

- store saved presets for English and Russian,
- validate the selection,
- split selected phrases into sequential language-specific jobs,
- submit jobs to the local bridge,
- render live progress,
- mark phrases exported only after success confirmation.

### 2. Local Resident Bridge

A local Windows service-like background process remains available without manual opening.

Responsibilities:

- expose a local API for the panel,
- persist jobs durably in a local queue,
- process one job at a time,
- launch Anki Desktop if needed,
- wait for AnkiConnect readiness,
- invoke Automatic Anki in non-interactive mode,
- stream status back to the panel,
- support retry/resume without losing previous work.

### 3. Automatic Anki Core

Automatic Anki is refactored so its processing pipeline can be executed programmatically from a job payload instead of terminal prompts.

Responsibilities:

- accept a structured job payload,
- write the per-job mining input,
- run stages deterministically,
- persist stage outputs,
- report stage-level progress,
- skip already-finished stages on retry,
- only clean artifacts that are safely completed.

## Data Model

### Panel Presets

Saved locally in extension storage:

```json
{
  "ankiBridgePresets": {
    "en": {
      "deckName": "English Mining",
      "imageSource": "1",
      "ttsWordTld": "com",
      "ttsPhraseTld": "co.uk"
    },
    "ru": {
      "deckName": "Russian Mining",
      "imageSource": "1",
      "ttsWordTld": "ru",
      "ttsPhraseTld": "ru"
    }
  }
}
```

### Bridge Job

```json
{
  "jobId": "20260613-103501-en-01",
  "createdAt": "2026-06-13T10:35:01-03:00",
  "lang": "en",
  "deckName": "English Mining",
  "imageSource": "1",
  "tts": {
    "wordTld": "com",
    "phraseTld": "co.uk"
  },
  "entries": [
    {
      "phraseId": 123456789,
      "line": "keyword : phrase [Contexto: source - title - detail]"
    }
  ],
  "status": "queued"
}
```

### Bridge Job State

Persisted per job:

```json
{
  "jobId": "20260613-103501-en-01",
  "status": "running",
  "stage": "generate_audio",
  "completedStages": [
    "generate_cards",
    "extract_prompts"
  ],
  "successfulPhraseIds": [],
  "failedPhraseIds": [],
  "lastError": null,
  "updatedAt": "2026-06-13T10:36:48-03:00"
}
```

## Job Lifecycle

1. User selects one or more phrases in the panel.
2. Panel groups phrases by `idioma`.
3. Panel creates one job per language.
4. Panel submits jobs to bridge in sequence order.
5. Bridge persists jobs before execution.
6. Bridge runs first queued job.
7. Bridge ensures Anki Desktop is open.
8. Bridge waits until AnkiConnect responds.
9. Bridge runs Automatic Anki in non-interactive mode.
10. Automatic Anki emits progress by stage.
11. Bridge stores status updates durably.
12. On success, bridge returns exported `phraseId`s.
13. Panel marks only those phrases as exported.
14. Bridge advances to the next job.

## Non-Interactive Automatic Anki API

Automatic Anki needs a stable programmatic entry point. The interactive prompt flow in `start.py` remains available, but a new code path is added for automation.

Proposed interface:

- new module such as `bridge_runner.py` or a new `start.py` mode,
- input via JSON file path or direct JSON payload,
- no terminal questions,
- config fully supplied by job payload plus base `config.yaml`.

Required behavior:

- inject `lang`, `deck_name`, image source, and TTS overrides programmatically,
- create a per-job working directory,
- write a per-job `mining.txt`,
- execute the same core pipeline stages,
- emit machine-readable progress,
- support resume by skipping outputs that already exist and are valid.

## Persistence and Reuse Strategy

### Per-Job Workspace

Each bridge job gets an isolated workspace, for example:

`Automatic Anki/runtime/jobs/<jobId>/`

Contents:

- `job.json`
- `state.json`
- `mining.txt`
- `Output/`
- `prompts.txt`
- optional `logs/`

This prevents one batch from overwriting another and makes retry predictable.

### Resume Semantics

If a job fails:

- the queue entry stays persisted,
- completed outputs remain in place,
- the state file indicates the last successful stage,
- retry resumes from the first incomplete stage,
- already-sent cards are not re-sent if Anki already contains them.

### Cleanup Rules

- Never delete a failed job workspace automatically.
- Delete only artifacts confirmed safe after successful send for that job.
- Prefer conservative cleanup over aggressive cleanup.

## Anki Availability Handling

Bridge behavior:

1. Try AnkiConnect health check.
2. If unavailable, try launching Anki Desktop.
3. Poll AnkiConnect until timeout.
4. If AnkiConnect becomes ready, continue automatically.
5. If timeout expires, mark job as waiting/error but preserve all generated data.

This avoids failed runs that force regeneration.

## Panel UX Changes

### New Presets UI

Panel gets a settings area for per-language presets:

- English deck
- English image source
- English TTS preferences
- Russian deck
- Russian image source
- Russian TTS preferences

These are edited once and reused for one-click sending.

### New Action

Replace or supplement `Exportar .txt` with:

- `Enviar ao Anki`

Behavior:

- collects selected phrases,
- groups by language,
- builds jobs,
- submits them to bridge,
- opens a progress view.

### Progress View

Visible progress until completion:

- queued
- generating cards
- extracting prompts
- generating audio
- generating images
- waiting for Anki
- sending to Anki
- completed
- failed

This may be implemented as a modal, side panel, or dedicated status section in the panel.

## Bridge API

Initial local API contract:

- `POST /jobs`
- `GET /jobs`
- `GET /jobs/:id`
- `POST /jobs/:id/retry`
- `GET /health`

Responses are JSON. The panel should treat the bridge as the only execution backend. Later, this same contract can be mirrored by a remote service.

## Error Handling

### Panel

- If bridge is offline, keep selection unchanged and show a clear error.
- Do not mark exported on submission failure.
- Do not drop selected phrase IDs from the pending action silently.

### Bridge

- Persist first, execute second.
- If Anki launch fails, preserve job and return actionable status.
- If a stage throws, record stage name and error text in `state.json`.
- If partial send succeeds, store successful phrase IDs explicitly.

### Automatic Anki Core

- Skip stage outputs already present and valid.
- Avoid clearing `Output/` globally.
- Cleanup must become job-scoped.

## Testing Strategy

### Panel

- grouping mixed-language selections into sequential jobs,
- saved preset load/save behavior,
- export status only after success response.

### Bridge

- queue persistence across restart,
- retry after simulated failure,
- Anki closed at job start,
- sequential processing of two language jobs.

### Automatic Anki

- non-interactive run with English job,
- non-interactive run with Russian job,
- resume after mid-pipeline failure,
- no unnecessary regeneration when outputs already exist,
- no duplicate add to Anki when a retry occurs.

## Implementation Phases

### Phase 1

- add job-based, non-interactive Automatic Anki runner,
- add isolated per-job workspace,
- add local resident bridge with queue and health endpoint,
- add panel presets UI,
- add panel send-to-bridge action,
- add progress polling UI.

### Phase 2

- package bridge for install,
- harden startup/autostart behavior,
- improve logs and diagnostics.

### Phase 3

- move panel orchestration online,
- keep bridge as the only local desktop dependency,
- swap local submission for authenticated remote job sync.

## Open Decisions Resolved

- Mixed-language selections are split automatically into sequential jobs.
- The user wants a visible progress experience until completion.
- The bridge must wait for Anki to open rather than failing early.
- Failures must preserve generated assets so retries do not regenerate unnecessarily.
- The long-term architecture is online-first with a lightweight local bridge.

## Risks

- Chrome extension pages cannot directly manage OS-level background services, so the local bridge handshake must be explicit and reliable.
- Refactoring Automatic Anki from interactive orchestration to resumable job execution touches multiple pipeline assumptions.
- Existing cleanup behavior may accidentally delete outputs needed for retry if not tightened early.

## Recommendation

Implement the bridge pattern now instead of automating the current manual UI flow. This gives the shortest path to:

- immediate friction reduction,
- safe retry behavior,
- future web-based orchestration,
- a plug-and-play desktop bridge model.
