# What goes to the stores leaves from a green commit

A commit of `main` is green when the full suite passed on it, and the workflow `Commit verde` marks it with the tag `verde/<date>-<sha7>`. The tag never moves, so every commit that passed keeps its record.

**The decision, the owner's.** The two files that leave the repository, the zip of the Chrome Web Store (`scripts/empacotar-extensao.mjs`) and the add-on for AnkiWeb (`complemento/empacotar.py`), are built only from a green commit. Both refuse, before they write anything, when HEAD has no `verde/*` tag or the tree has a change or a new file outside the commit. This is a rule and not a warning: with no variable set, packaging refuses.

`PM_COMMIT_VERDE=avisar` and `ignorar` exist for tests and for rebuilding a file on a tree that is being edited, and for nothing else: what goes to the store or to AnkiWeb is built from a green commit with the variable absent. The version commit that `complemento/versao_no_merge.py` makes on `main` is a new commit, and it gets the tag only after the suite passes on it. The push to `main` does not charge the add-on's version tests; they stay charged on the version commit, on the rebuilt version PR and in the workflow `Lançamento`.

A warning instead of a refusal was the alternative, and the owner ruled it out: it is a rule, not a notice.
