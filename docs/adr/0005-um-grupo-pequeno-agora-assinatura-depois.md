# The product is for a small group now, and a subscription comes after it is validated

The owner decided who the product is for. Today it is the owner alone and then a small group (a partner, friends). After it is validated, the idea is to make it plug-and-play and sell it as a subscription. The decision for the front-end redesign was that its destination does not change: it delivers the specs and prototypes for this stage. The subscription product (onboarding, billing, an installable Conexão com o Anki, accounts) is a future effort outside that scope.

What the future stage does change is how today's work is written. The visual identity (ADR 0006) and the copy in the Voice catalog are product-grade from the start, with nothing personal in them. The requirements for installing and mending the Conexão com o Anki without a terminal (ADR 0008) follow from the same decision.

We rejected building for the subscription now (it would pull in billing, accounts and an installer before anyone has validated the product) and rejected writing for the owner only (it would make every later rewrite of the copy and the identity a rework).
