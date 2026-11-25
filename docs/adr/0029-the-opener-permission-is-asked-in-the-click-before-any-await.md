# The opener permission is asked in the click, before any await

Chrome grants a permission request only inside the gesture of the click, and an `await` before the request ends that gesture. So every button that may need the opener (Reiniciar o Anki, the closed-Anki strip, the stopped Envio) asks the permission first, in the click handler, and only then does anything else; without the permission the Anki is not closed, because nobody would open it back.
