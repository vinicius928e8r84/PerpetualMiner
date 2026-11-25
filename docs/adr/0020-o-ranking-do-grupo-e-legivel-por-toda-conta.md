# The group ranking is readable by every signed-in account, and whoever does not opt in writes nothing

The ranking of Boas-vindas (the "melhor que X%" of the quiz) lives in one Firestore collection, `ranking`, with one document per person and Idioma, `ranking/{idioma}_{uid}`, written only by whoever opted in. The box "Aparecer no ranking do grupo" starts unchecked; ticking it writes the document and unticking it deletes it. A person who did not opt in writes nothing, and without a Conta the screen does not even ask Firestore. If no one else opted in, the screen says the person is the first, never "0%".

**The rules do not limit fields.** Firestore security rules limit who reads and which document, not which fields. So the document holds only what the ranking shows and what later cuts will ask, and the fields that are not shown (the score, hits, questions, time, uid) are still readable by any signed-in account, for those who opted in. The text beside the box says it appears "para quem usa o PerpetualMiner com conta Google", which is what the rules allow. The "group" is therefore every account of the project that signs in, not a circle of friends; real groups belong to a future ranking.

**Left out.** The "half multiplayer" ranking (global, by groups, with the average) is out; the record is only born ready for it (`grupos` is an empty list today).

**Smaller limits.** The name and photo come from the Google account when the person opts in, and a rename at Google does not reach the ranking until they untick and tick again; the photo is shown only if it is an `https` address.

**Pending, owner-only.** `ranking-do-grupo.rules` is the publishable artifact and has not been published to the real Firebase. Without it, the collection is refused (403) and the screen says "Não deu para carregar o ranking". The owner has to publish it and prove it with a real account: opting in writes, unticking deletes, another account cannot write someone else's document, and with no sign-in nothing is read.
