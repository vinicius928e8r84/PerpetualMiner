---
name: delete-comment
description: "Classify every code comment of an area as Tautology, Excuse, Stale or Decision Record, delete it, file an issue for each Excuse, move each Decision Record into an ADR, and lower the ratchet. Use to repeat the comment cleanup, or when sem-comentario says a file has comments the baseline does not allow."
disable-model-invocation: true
---

Take one area of the repo (a folder: `e2e/tests`, `scripts`, `complemento`, …) and remove its code comments by the rules below. One area per PR, on the current `origin/main`, small enough to review. Never touch `fm/*` branches.

The rule behind it is `sem-comentario` (`scripts/regras/sem-comentario.js`, CODING_STANDARDS.md rule 14): each file has a ceiling of comment lines in `scripts/regras/linha-de-base.json` that only goes down, and a file that reaches zero leaves the list and may not have a comment again. It counts prose; it lets through the `#!` line, tool directives (`eslint-disable`, `@ts-*`, `noqa`, `type: ignore`, `istanbul`/`c8 ignore`, `prettier-ignore`, `shellcheck source=`/`disable=`), a license header and the marks another rule reads (`exceção <rule> até …`, `Exceção de teste: …`, `@estado-guardado`). Those stay.

## 1. List

```
node scripts/regras/apoio-listar-comentarios.js '<regex of the path>'
```

It prints each comment line with its file and line number: the same lines the rule counts. Docstrings are not comments here; leave them (the owner decides that separately). Prototypes in `docs/design/` are out of the rule's reach; leave them too.

## 2. Classify each comment

Read the code around it before deciding. Four classes, one action each:

| Class | It is | Action |
|---|---|---|
| **Tautology** | Repeats what the code already shows (`// increment i`, a section banner, a restated name). | Delete. If the code is only clear because of the comment, rename instead. |
| **Stale** | Names code, a ticket, a behavior or a date that no longer exists or no longer holds. Check with `git grep` and by reading the code it points at. | Delete. |
| **Excuse** | Explains away a hack (`workaround`, `for now`, `sem isso quebra`, `não dá para…`): the comment is what lets a shortcut survive review and get copied. | Delete the comment **and** file an issue to fix the hack (below). |
| **Decision Record** | Gives the why of a non-obvious decision. | Pass the bar below and move it into an ADR; otherwise it is a Tautology or Stale and goes. |

The bar for an ADR is the repo's own (`.claude/skills/domain-modeling/ADR-FORMAT.md`): all three must hold. It is **hard to reverse** (in time, tokens or another resource), **surprising without the context**, and **the result of a real trade-off**. What does not pass is not a Decision Record: delete it. When unsure between Excuse and Decision Record: if the comment says the code is wrong or temporary, it is an Excuse; if it says the code is deliberately this way, it is a Decision Record.

The codebase is the single source of truth: a fact the code shows needs no comment, and a fact that is not true any more must not survive in one.

## 3. Act

**Delete** with the comment's whole line (not a half-removed line). Do not change anything but comments: no reformatting, no renamed variable in the same commit, no "while I am here". A rename the comment asked for goes in its own PR.

**Excuse → issue.** One issue per hack, not per comment, with `gh issue create` (see `docs/agents/issue-tracker.md`). Title: what to fix, in the glossary's words (`glossary.md`). Body: the file and line the comment was on, its text quoted, what the shortcut is, and what the fixed version looks like. Label `needs-triage`. Quote the text because the comment is gone after the PR. Put the issue URLs in the PR body.

**Decision Record → ADR.** `docs/adr/NNNN-slug.md`, next number, the format of ADR-FORMAT.md: a title, one to three sentences of context, decision and reason; Considered Options only when the rejected alternative is worth remembering. Use the glossary's terms. One ADR per decision; do not pile unrelated ones in a file. Several comments that record the same decision become one ADR. The code stops pointing at the comment; if a reader of the code needs to find the ADR, name the thing so that a `git grep` of its name finds the ADR text, and say so in the PR body.

**Directives and marks stay.** A directive with prose after it (`# noqa: F401  (used outside)`) keeps the directive and loses the prose.

## 4. Lower the ratchet

```
node scripts/regras/verificar.js --atualizar
```

`--atualizar` rewrites the baseline for every rule. Before committing, `git diff scripts/regras/linha-de-base.json` must show only lowered `sem-comentario` entries (and removed ones, for files that reached zero). Undo any other section it touched. Then `node scripts/regras/verificar.js --base origin/main` must say `regras ok`.

## 5. Prove it only removed comments

```
node scripts/ci/so-tira-comentario.js --base origin/main
```

It compares each changed file with the comments taken out: token by token in JavaScript and Python, text in CSS, HTML, shell and YAML. It passes only when the code is identical, there are fewer comments and none new, and the other changes are documentation (the ADRs) and the baseline. The "Registro da PR" check runs the same code: when it proves, the PR counts as Atenção BAIXA and needs no manual Prova real. If it fails, a code change slipped in; split it out.

Run the groups the touched files belong to (`node scripts/testar.mjs <group>`, see `scripts/testes.json`).

## 6. PR

Body in the repo's model (`.github/PULL_REQUEST_TEMPLATE.md`): Summary with the counts (comments deleted per class, ADRs written, issues opened with their links), Evidence with the two commands above and their output, Atenção BAIXA. Check it with `node scripts/ci/corpo-da-pr.js <file>`. Do not merge.

## Estimating how many lines a cleanup sheds

The baseline total (the sum of the `sem-comentario` section of `scripts/regras/linha-de-base.json`) is the number of prose comment lines. It over-counts the lines that leave the files: a comment at the end of a code line sheds no line, and the delimiter lines of a block (`/**`, `*/`, `<!--`) shed one each without being counted. To get the real number, remove the comments in memory (`semOsComentarios` in `scripts/ci/so-tira-comentario.js` takes a source and the comment spans from `trechosDeComentario` in `scripts/regras/comum.js`) and subtract the line counts before and after. The first cleanup measured 679 counted lines against about 640 lines shed, in about 130,000 lines of code in scope.
