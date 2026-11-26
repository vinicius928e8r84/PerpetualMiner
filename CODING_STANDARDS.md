# Coding Standards

The mistakes review keeps catching that no script can see. What a script can see is a check (`node scripts/regras/verificar.js`, whose `--help` lists what each rule guards), and the rest follows the surrounding code and the surface's skill.

## Rules

- **The screen says the true current state** (rule C8 of the Voice, `docs/design/voz/README.md`). A status, a note or a promise on screen matches what the code does in that case, including the rare path: another account, a failure, a dropped connection, a navigation that never answers. A design doc, a skill or a test that pins a state matches the code on `main`.
- **Code Health goes down through a real refactor**, while the CodeScene campaign (issue #729) is open; the limit itself is the `saude-do-codigo` check. A real refactor names the domain: deciding split from doing, a named condition, a table for a cascade that is a map, arguments grouped into an object the domain already has, a file split by responsibility. A function cut into parts with no domain name, an options bag, or logic hidden in closures does not count.

## What blocks a merge

A review verdict has three levels. Only the first stops the merge.

- **Blocks:** a finding rated HIGH (ALTA), or a regression against `main` (something that worked on `main` and does not on the branch).
- **Fix if cheap:** a new MEDIUM (MÉDIA) finding that this diff brings. Fix it in the PR when the fix is small; otherwise it goes to the next level.
- **Becomes an issue:** everything else (a MEDIUM that was already on `main`, LOW findings, style, a limit the owner has accepted and named). Open an issue and link it; the PR goes on.
