import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import mock

import send_to_anki
from parser import MiningEntry


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


def _write_card_files(folder: Path, stem: str, front: str) -> None:
    (folder / f"{stem}.txt").write_text(f"Front\n{front}\n\nBack\nHello\n", encoding="utf-8")
    (folder / f"{stem}_phrase.mp3").write_bytes(b"x")
    (folder / f"{stem}_word.mp3").write_bytes(b"y")


def _config(folder: Path, lang: str = "ru") -> dict:
    return {
        "anki": {
            "deck_name": "D",
            "note_type": "Básico",
            "url": "http://127.0.0.1:8765",
            "fields": {"front": "Frente", "back": "Verso"},
        },
        "paths": {"output_dir": str(folder)},
        "lang": lang,
    }


def _normalized_front_for(folder: Path, stem: str, lang: str = "ru") -> str:
    """Reproduce exactly how run() derives the normalized front for a stem."""
    content = (folder / f"{stem}.txt").read_text(encoding="utf-8").replace("## Anki Card", "").strip()
    front = send_to_anki._build_front(content, f"{stem}_phrase.mp3", lang=lang)
    return send_to_anki._normalize_front_text(front, lang)


class RunStatusTests(unittest.TestCase):
    def test_new_card_is_added_existing_is_duplicate(self):
        with TemporaryDirectory() as d:
            folder = Path(d)
            _write_card_files(folder, "new_stem", "Новая фраза")
            _write_card_files(folder, "dup_stem", "Старая фраза")
            entries = [
                MiningEntry(keywords=["Новая"], phrase="Новая фраза", file_stem="new_stem"),
                MiningEntry(keywords=["Старая"], phrase="Старая фраза", file_stem="dup_stem"),
            ]
            existing = {_normalized_front_for(folder, "dup_stem")}

            with mock.patch.object(send_to_anki, "_ensure_deck"), \
                 mock.patch.object(send_to_anki, "_existing_fronts", return_value=set(existing)), \
                 mock.patch.object(send_to_anki, "_store_media", return_value=True), \
                 mock.patch.object(send_to_anki, "_add_note", return_value=True) as add_note:
                results = send_to_anki.run(entries, _config(folder))

            self.assertEqual(results["new_stem"], send_to_anki.ADDED)
            self.assertEqual(results["dup_stem"], send_to_anki.DUPLICATE)
            # The existing card must NOT trigger an addNote call.
            self.assertEqual(add_note.call_count, 1)
            self.assertTrue(send_to_anki.is_present(results["new_stem"]))
            self.assertTrue(send_to_anki.is_present(results["dup_stem"]))

    def test_missing_files_are_failed_and_rejected_add_is_failed(self):
        with TemporaryDirectory() as d:
            folder = Path(d)
            _write_card_files(folder, "ok_stem", "Ок фраза")
            # missing_stem has no files on disk
            entries = [
                MiningEntry(keywords=["Ок"], phrase="Ок фраза", file_stem="ok_stem"),
                MiningEntry(keywords=["Falta"], phrase="Sem arquivos", file_stem="missing_stem"),
            ]
            with mock.patch.object(send_to_anki, "_ensure_deck"), \
                 mock.patch.object(send_to_anki, "_existing_fronts", return_value=set()), \
                 mock.patch.object(send_to_anki, "_store_media", return_value=True), \
                 mock.patch.object(send_to_anki, "_add_note", return_value=False):
                results = send_to_anki.run(entries, _config(folder))

            # AnkiConnect rejected the note -> FAILED (not silently present).
            self.assertEqual(results["ok_stem"], send_to_anki.FAILED)
            self.assertEqual(results["missing_stem"], send_to_anki.FAILED)
            self.assertFalse(send_to_anki.is_present(results["ok_stem"]))


class CleanupOutputTests(unittest.TestCase):
    def _seed(self, folder: Path, stem: str) -> None:
        (folder / f"{stem}.txt").write_text("x", encoding="utf-8")
        (folder / f"{stem}_word.mp3").write_bytes(b"1")
        (folder / f"{stem}_phrase.mp3").write_bytes(b"1")

    def test_deletes_present_cards_keeps_failed(self):
        with TemporaryDirectory() as d:
            folder = Path(d)
            for stem in ("added", "dup", "failed"):
                self._seed(folder, stem)
            results = {
                "added": send_to_anki.ADDED,
                "dup": send_to_anki.DUPLICATE,
                "failed": send_to_anki.FAILED,
            }
            send_to_anki.cleanup_output(folder, results)

            self.assertFalse((folder / "added.txt").exists())
            self.assertFalse((folder / "dup.txt").exists())
            # FAILED artifacts survive for a later retry.
            self.assertTrue((folder / "failed.txt").exists())
            self.assertTrue((folder / "failed_word.mp3").exists())

    def test_no_full_wipe_when_a_card_failed(self):
        with TemporaryDirectory() as d:
            folder = Path(d)
            self._seed(folder, "added")
            (folder / "leftover.tmp").write_text("x", encoding="utf-8")
            send_to_anki.cleanup_output(
                folder, {"added": send_to_anki.ADDED, "z": send_to_anki.FAILED}
            )
            self.assertTrue((folder / "leftover.tmp").exists())

    def test_full_wipe_when_all_present(self):
        with TemporaryDirectory() as d:
            folder = Path(d)
            self._seed(folder, "added")
            (folder / "leftover.tmp").write_text("x", encoding="utf-8")
            send_to_anki.cleanup_output(
                folder, {"added": send_to_anki.ADDED, "dup": send_to_anki.DUPLICATE}
            )
            self.assertFalse((folder / "leftover.tmp").exists())


if __name__ == "__main__":
    unittest.main()
