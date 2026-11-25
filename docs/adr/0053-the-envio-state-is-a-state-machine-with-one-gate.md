# The Envio state is a state machine with one gate

The state of an Envio (`estado/<jobId>.json`) is a state machine: `queued → running ⇄ esperando → completed | partial | failed → queued` (Tentar de novo), and from any state to `apagado`, from which nothing leaves. `Fila.mudar` is the single gate: every writer of the state passes through it, it checks the change against the table of transitions and writes under the lock of the queue.

The state is also per Card (`pending → text → added | duplicate`, or `failed` with the error), so a resume redoes nothing that is done: the `guid` of the note is the same at each round, a Card already in Anki is neither generated nor paid for again, and a text already paid for is never asked again. The files in `user_files` are each written to a temporary and swapped at once; a temporary left by a write that died holds the Palavra and the Frase, so every start deletes them.

Who owns each piece of data, what the state keeps of the mined text and when a finished Envio is deleted are in ADR 0009 and ADR 0010.
