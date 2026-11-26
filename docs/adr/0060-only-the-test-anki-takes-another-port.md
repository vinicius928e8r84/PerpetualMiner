# Only the test Anki takes another port, and never 8766

The fleet's proofs need an Anki of their own, so no proof ever touches the owner's Anki or port 8766 (decided by the owner in home-repo #62, built in #896).

**The rule.** The add-on listens on 8766 (`configuracao.PORTA`), except in a test Anki. An Anki is a test Anki only when its data folder holds the file `anki-de-teste`, which only `scripts/anki-de-teste.py` writes, in a folder it made for the proof. Then the port is the number in `PM_ANKI_DE_TESTE_PORTA`, between 1024 and 65535 and never 8766. A test Anki without a good port does not start the Conexão: it never falls back to 8766. In any other Anki the variable means nothing, so one left in the environment of the owner's Anki changes nothing. The same port goes to the Windows handover (`passagem.py`), which would otherwise look for the owner's Conexão on 8766, and to the opener's repair (`conserto_do_anki.py`), which would otherwise close whoever owns 8766.

**Where it runs.** On the VPS, in the Qt `offscreen` platform, one Anki per proof and one at a time (a lock), with a free port chosen per proof, a throwaway data folder with `HOME` inside it and its own `ANKI_SINGLE_INSTANCE_KEY` (without it a second copy next to the owner's only raises the first one's window). It is closed and its folder deleted at the end. On the Mac only what exists there (the opener and the login item) is proven, behind a lock that waits with no limit (`no-mac.sh`). The owner's PC stays out.

**Options dropped.** A reserved or locked 8766 (the owner chose not to give it any role); a switch in the add-on's settings (the owner's Anki would carry it); a build of the add-on with another port (the proof would not run the shipped bytes).

**Cost accepted.** The free port is chosen by the proof just before the Anki starts, so another program can take it in between; the proof then fails with the Anki's log instead of retrying.
