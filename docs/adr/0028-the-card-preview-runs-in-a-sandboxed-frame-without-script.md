# The card preview runs in a sandboxed frame without script

The preview of a Cartão is drawn in a frame with `sandbox="allow-same-origin"` and no `allow-scripts`: the note type's CSS and the card's HTML are only read, never run. The same origin is there only so the panel can measure the height of the frame. Adding `allow-scripts` to that pair would let the card's content escape the sandbox; the policy of the frame also lets only `data:` in.
