# Domain Docs

How the engineering skills read this repo's domain documentation.

- **`glossary.md`** at the repo root is this repo's domain language file, in place of the standard `CONTEXT.md`. This repo has no `CONTEXT.md`: wherever a skill says `CONTEXT.md`, read and update `glossary.md`, and do not create a `CONTEXT.md`. There is no `CONTEXT-MAP.md` either.
- **`docs/adr/`** holds the decisions; read the ones that touch the area you are about to work in, and surface an explicit conflict instead of silently overriding one.
- Use the glossary's terms in issue titles, refactor proposals and test names, and not the synonyms it lists under _Avoid_. If the concept you need is not in the glossary, either you are inventing language the project does not use, or there is a real gap to note for `/domain-modeling`.
- If one of these files does not exist, proceed silently.
