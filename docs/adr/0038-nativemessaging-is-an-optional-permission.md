# nativeMessaging is an optional permission

"Abrir o Anki sozinho" calls the opener through native messaging, and `nativeMessaging` is a permission with a warning. As a required permission it would disable the extension of everyone who already installed it until the person accepts the new warning; as an optional one it is asked only when the person presses Permitir abrir o Anki. `testes/test_empacotar.js` fails if the manifest of the repository or of the zip asks for it as required.
