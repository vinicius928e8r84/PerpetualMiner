# A new name in the code follows the glossary

Every new name in the code (a function, a variable, a storage key, a message, a file) is the term of [`glossary.md`](../../glossary.md), written in the code's own case and without accents: `Termo` becomes `termo`, `Envio` becomes `envio`, `Cartão` becomes `cartao`. The glossary speaks only of language, so the old names (`keywords`, `job`, `deck`, `card`, `streaming`, `ankiBridgePresets` and the rest the glossary once listed beside each term) are not recorded anywhere now: each concept whose name in the code differs from the glossary has an issue to rename it, and those issues wait for the end of the campaign, because no behavior change enters while it lasts.

We considered keeping a `_Nome no código_` line under each term and calling the existing names acceptable. We rejected it: the line made the glossary a map of the code, it went stale with every rename, and it let a name that the glossary avoids look approved. The rule `glossario-so-linguagem` keeps that line, and any code, out of `glossary.md`.

Until a concept's rename lands, its old name stays in the code, and everything else (tests, issues, docs, screen texts, new names) uses the glossary term.
