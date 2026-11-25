# The Anki repair force-closes only the processes that own the port, never by name

Consertar sozinho exists so a stuck Anki does not need the person. The extension calls the opener only when `/health` of the Conexão com o Anki does not answer. The opener force-closes the Anki, or turns on a Conexão that was disabled in `meta.json`, and reopens the Anki.

**The safety rule.** The opener closes by force only an Anki whose process ids are all the owners of port 8766, and only those ids. If the Anki is open and who listens on the port is another program (alone, or sharing the port with the Anki) or nobody, the opener says `conexao_fora` and kills nothing, and the Anki stays open. If the person closed the Anki during the wait, or it left before the signal, the opener opens nothing. Closing by process name is not used: the owners of the port are what ties the kill to the Anki that holds the Conexão.

**Cost accepted.** Closing by force can lose the Cartão the person was editing. An Anki whose main thread is stuck still answers `/health`, so it does not trigger the repair; that is a separate slice, tracked apart.

**Not proven.** The repair is tested with fake programs (`complemento/test_conserto*.py` for the Mac script, `e2e/tests/painel-conserto.spec.js` for the extension). No real Anki has been force-closed by it, and the Windows `.ps1` has never run beyond `conferir`.
