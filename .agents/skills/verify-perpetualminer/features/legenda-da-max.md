# Mining the caption on Max

On Max (`www.max.com`) the player writes the episode name in a class that used to be read as the caption, so the mined phrase was `DNR` instead of what was said. Mining there must save the line on screen (`contexto.fonte: 'max'`) and never the episode name, a hidden label or a repeated cue.

## Sub-features

- `max-shortcut` Alt+S saves the spoken line on screen, not the episode name.
- `max-line-changes` when the line changes, the one mined is the one now on screen.
- `max-two-lines` a line of two rows is saved whole, as one phrase.
- `max-nested-cue` a cue that wraps another cue does not repeat the line.
- `max-hidden-track` the cue of an old, hidden track is not part of the line.
- `max-no-line` with no line on screen nothing is mined (the episode name is not a fallback).
- `max-auto` automatic mining saves the line and never the episode name ([mineracao-automatica.md](./mineracao-automatica.md)).

## How to get to it (user POV)

- Open an episode on Max with the captions on, press **Alt+S** or click **Minerar legenda**; or turn the automatic mining on in the popup.

## Driving it with the Playwright e2e harness

Preconditions: `doctor.sh` green. The spec serves `e2e/pages/player-max.html` at `https://www.max.com/video/watch/shameless` by route, without network; the page has the cue, the title, the season/episode, the episode name `DNR` and a hidden label.

- **Shortcut (`max-shortcut` and the cases below).** `drive.sh max legenda-da-max.spec`. Observable: `frases()` texts are exactly `["It's got a heated pool, gym,"]` with `contexto.fonte: 'max'`; the other titles cover a changed line, two rows, a wrapping cue, the hidden track and no line (`-g "sem nenhuma fala"` leaves `frases()` empty).
- **Automatic (`max-auto`).** `drive.sh max-auto legenda-da-max.spec -g "mineração automática"`. The spec turns English on with `dailyLimit: 20`, plays the video; observable: the line is saved, and 1.5 s later `DNR` is still not in `frases()`.

## Gotchas

- The page is a fixture of Max's markup (class names such as `TextCue-Fuse-Web-Play…`); when Max changes its markup the fixture does not know. A proof here is of the extension against the fixture, never of the real Max.
- The route covers `https://www.max.com/**` only in the test's page; no other Max address is served.
