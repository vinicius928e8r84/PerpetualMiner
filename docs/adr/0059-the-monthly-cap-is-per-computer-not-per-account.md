# The monthly cap is per computer, not per Conta

The monthly cap (teto do mês, #160) is a number of US dollars, US$ 10 by default, that the Envio checks before each Cartão: when this month's spend reaches it, the Envio pauses with `monthly_cap` and goes on by itself when the person raises the cap or the month turns. It was built per computer, and the owner never confirmed that was what they wanted (risk 14 of #138). Issue #807 asked: per computer, or per Conta?

**Decision, confirmed by the owner: per computer, as it is.** The cap is one file, `user_files/teto-do-mes.json`, in the data folder of the Conexão com o Anki. The spend it is compared with is the sum of the costs of the Envios that ran on this computer in the current month (the costs stay after the retention of #243 removes the queue of an old Envio). Nothing about the cap goes to the Nuvem, and the Conexão never reads the cost of another computer.

**Why not per Conta.** A cap per Conta needs two things the product does not have: a place in the Nuvem for the cap, with one owner of its value, and the sum of the costs of every computer of the Conta. The costs of an Envio exist only in the Conexão of the computer where it ran, and the Conexão holds no Google token to read the Nuvem on its own (ADR 0012). It would also need an answer for the person without a Conta, who has no Nuvem at all, so the cap would end up in two places. The cap is a guard against a runaway Envio, not a bill, so it does not need to be exact across computers.

**Consequences.**

- **Two computers of one Conta have two caps and two spends.** Each one stops at its own number, so the Conta can spend up to the cap times the number of computers in a month. The cap limits a computer, not a person. Whoever wants a hard limit uses an OpenAI project with a spend limit, as ADR 0012 already advises.
- **A computer with the cap raised keeps it.** Changing the cap on one computer does not change it on the other, and signing in on a new computer starts at US$ 10.
- **Without a Conta, nothing changes.** The cap never depended on the Conta, so it works the same with and without one.
- **The cap counts what the key spends**, including the image generated when the text went through the ChatGPT plan; the Cartões of the plan count 0 (ADR 0013). The plan's own limit is a different wait (ADR 0055).
- **Relation with #897 (one OpenAI key per Conta).** That issue makes the Envio stop when the stored key belongs to another Conta than the current one. It does not change this decision: the cap stays per computer even when two Contas share a computer and each has its own key, and the spend is the sum of every Envio of the computer, whichever Conta or key paid for it. A cap per key, or per Conta on a shared computer, would be a new decision with its own design (the owner of the cap and the Conta stamped on each cost record); it is not part of #897 nor of this one.
- **Reversing it costs a design, not a fix.** If the owner later wants a cap per Conta, the issue becomes the design of a single owner of the cap in the Nuvem, the sum of the costs of all computers and what happens without a Conta. The file of the cap on each computer would then be a copy, not the owner.

**What the screens say.** Custos and the warning at 80% talk about "o teto do mês" and never say whose it is. The text of the screens did not need to change with this decision; if a person asks why a second computer is not paused, this ADR is the answer.
