import unittest

import send_to_anki


RU_CARD_WITH_QUERY_BLOCK = """Anki Card
Front
Я не мальчик!

Back
Pronunciation: Ya ne mal'chik!

Translation: I am not a boy!

Google Image Search Queries:
1. girl
2. young girl portrait
3. confident girl
4. female child portrait

Image: A person confidently saying "I am not a boy" with a neutral expression, no text in the image

Alignment:
1 | Я | I
2 | не | not
3 | мальчик | a boy
"""


RU_CARD_WITH_THREE_ALIGNED_CHUNKS = """Anki Card
Front
Ya ne malchik!

Back
Pronunciation: Ya ne malchik!

Literal: I not a boy!

Natural: I am not a boy!

Gist: Someone corrects a mistaken assumption about them.

Google Image Search Queries:
1. girl
2. young girl portrait
3. confident girl
4. female child portrait

Image: A confident girl with a neutral expression, no text in the image

Alignment:
1 | Ya | I
2 | ne | not
3 | malchik | a boy
"""


EN_CARD_FULL = """Anki Card
Source Context: Scientific Advertising - Chapter 8

Front: Dealers *resent it* when advertisers bypass them.

Back: resent it - /ri-ZENT it/

Definition: To feel bitterness or anger about something seen as unfair.

Simple meaning: To feel annoyed because something feels unfair.

Gist: Dealers feel pushed aside by a sales practice they dislike.

-> Dealers resent it when advertisers bypass them. = Dealers dislike that unfair treatment.

Other example: -> Retailers resent it when jobbers take over their customers.

Trigger: A dealer sees a supplier ignore him and sell straight to his customers.

Google Image Search Queries:
1. angry shopkeeper
2. frustrated retailer
3. unfair business deal
4. dealer argument

Image: A frustrated shopkeeper behind a counter, no text.
"""


class BuildBackTests(unittest.TestCase):
    def test_ru_alignment_colors_front_and_literal_with_same_three_chunks(self):
        front = send_to_anki._build_front(
            RU_CARD_WITH_THREE_ALIGNED_CHUNKS,
            "ya_ne_malchik_phrase.mp3",
            lang="ru",
        )
        back = send_to_anki._build_back(
            RU_CARD_WITH_THREE_ALIGNED_CHUNKS,
            "ya_ne_malchik_word.mp3",
            lang="ru",
        )

        expected_colors = send_to_anki._COLOR_PALETTE[:3]
        for color in expected_colors:
            self.assertEqual(front.count(f'<span style="color: {color};">'), 1)
            self.assertEqual(back.count(f'<span style="color: {color};">'), 1)

        self.assertEqual(front.count('<span style="color:'), 3)
        self.assertEqual(back.count('<span style="color:'), 3)
        self.assertIn('<span style="color: #ff8c42;">Ya</span>', front)
        self.assertIn('<span style="color: #a855f7;">ne</span>', front)
        self.assertIn('<span style="color: #22c55e;">malchik</span>', front)
        self.assertIn(
            'Literal: <span style="color: #ff8c42;">I</span> '
            '<span style="color: #a855f7;">not</span> '
            '<span style="color: #22c55e;">a boy</span>!',
            back,
        )
        back_lines = [line for line in back.split("<br>") if line]
        for field in ("Pronunciation:", "Natural:", "Gist:"):
            field_html = next(line for line in back_lines if line.startswith(field))
            self.assertNotIn("<span", field_html)
        self.assertNotIn("Google Image Search Queries", back)
        self.assertNotIn("young girl portrait", back)
        self.assertNotIn("Image:", back)
        self.assertNotIn("Alignment:", back)
        self.assertNotIn("1 | Ya | I", back)

    def test_en_back_keeps_learning_fields_but_hides_image_prompt_and_queries(self):
        back = send_to_anki._build_back(
            EN_CARD_FULL,
            "resent_it_word.mp3",
            image_name="resent_it.png",
            lang="en",
        )

        self.assertIn("resent it - /ri-ZENT it/ [sound:resent_it_word.mp3]", back)
        self.assertIn("Simple meaning:", back)
        self.assertIn("Gist:", back)
        self.assertIn("Dealers feel pushed aside", back)
        self.assertIn("-> Dealers resent it", back)
        self.assertIn("Other example:", back)
        self.assertIn("Definition:", back)
        self.assertIn("Trigger:", back)
        self.assertIn('<img src="resent_it.png">', back)

        definition_idx = back.index("Definition:")
        simple_idx = back.index("Simple meaning:")
        arrow_idx = back.index("-> Dealers resent it")
        gist_idx = back.index("Gist:")
        other_idx = back.index("Other example:")
        trigger_idx = back.index("Trigger:")

        self.assertLess(definition_idx, simple_idx)
        self.assertLess(simple_idx, arrow_idx)
        self.assertLess(arrow_idx, gist_idx)
        self.assertLess(gist_idx, other_idx)
        self.assertLess(other_idx, trigger_idx)
        self.assertIn(
            "Dealers dislike that unfair treatment.<br><br>Gist:",
            back,
        )

        self.assertNotIn("Google Image Search Queries", back)
        self.assertNotIn("angry shopkeeper", back)
        self.assertNotIn("Image:", back)

    def test_ru_back_omits_multiline_image_query_block(self):
        back = send_to_anki._build_back(
            RU_CARD_WITH_QUERY_BLOCK,
            "dummy.mp3",
            lang="ru",
        )

        self.assertIn("Translation:", back)
        self.assertNotIn("Google Image Search Queries", back)
        self.assertNotIn("young girl portrait", back)
        self.assertNotIn("confident girl", back)
        self.assertNotIn("female child portrait", back)


if __name__ == "__main__":
    unittest.main()
