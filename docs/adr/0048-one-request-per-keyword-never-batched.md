# One request per keyword, never batched

A mining line with several keywords becomes one card per keyword, and each card is one request to the model: the first keyword uses the original phrase, and each of the others is told explicitly to invent a new sentence. A request per keyword is never batched, because batching makes the model hallucinate keywords. The price is more requests per line.
