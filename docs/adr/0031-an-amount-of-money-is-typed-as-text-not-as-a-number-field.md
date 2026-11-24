# An amount of money is typed as text, not as a number field

The spending ceiling is a text field, not `type=number`: the browser's number field reads "12,50" by the language of Chrome (in English it becomes 1250), and the panel's amount must mean the same whatever the browser language is. The panel parses the text itself.
