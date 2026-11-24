# The quiz makes no sound when the person misses

The sounds of the level quiz are made on the spot with WebAudio, without a file. Nothing plays before the first touch: the `AudioContext` is born only when a sound is asked for, and sounds are asked for only by what answers a click. A miss has no sound (no buzzer); "Não sei" has a low, neutral tone; the sound button turns everything on and off.
