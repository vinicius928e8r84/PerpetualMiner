from __future__ import annotations

import ast
import json
import pickle
import sqlite3
import sys
import tempfile
import time
import unittest
from pathlib import Path
from typing import Any
from unittest import mock


SERVER_PATH = Path(__file__).with_name("server.py")
ANKI_SESSION_PATH = Path(__file__).with_name("anki_session.py")
if str(SERVER_PATH.parent) not in sys.path:
    sys.path.insert(0, str(SERVER_PATH.parent))

import server  # noqa: E402  (após ajustar sys.path)
from anki_session import AnkiRepairBlockedError, AnkiSession  # noqa: E402

CONFIG_PATH = Path(__file__).with_name("config.json")
INSTALL_AUTOSTART_PATH = Path(__file__).with_name("install_autostart.py")


def _source() -> str:
    return SERVER_PATH.read_text(encoding="utf-8")


def _anki_session_source() -> str:
    return ANKI_SESSION_PATH.read_text(encoding="utf-8")


def _install_autostart_source() -> str:
    return INSTALL_AUTOSTART_PATH.read_text(encoding="utf-8")


def _function_source_of(path: Path, name: str) -> str:
    source = path.read_text(encoding="utf-8")
    tree = ast.parse(source)
    for node in ast.walk(tree):
        if isinstance(node, ast.FunctionDef) and node.name == name:
            return ast.get_source_segment(source, node) or ""
    raise AssertionError(f"function not found in {path.name}: {name}")


def _function_source(name: str) -> str:
    return _function_source_of(SERVER_PATH, name)


def _anki_session_function_source(name: str) -> str:
    return _function_source_of(ANKI_SESSION_PATH, name)


def _session(**overrides: Any) -> AnkiSession:
    config: dict[str, Any] = {"anki_connect_url": "http://127.0.0.1:8765"}
    config.update(overrides)
    return AnkiSession(config)


class AnkiSessionBehaviorTests(unittest.TestCase):
    def test_repair_blocked_error_is_reexported_from_server(self) -> None:
        # Routes/worker in server.py catch the exception imported from anki_session.
        self.assertIs(server.AnkiRepairBlockedError, AnkiRepairBlockedError)

    def test_launch_command_structure_uses_base_and_profile(self) -> None:
        class FakeSession(AnkiSession):
            def _anki_last_loaded_profile_matches_config(self) -> bool:
                return False

        session = FakeSession(
            {
                "anki_executable": r"C:\Programs\Anki\anki.exe",
                "anki_base_path": r"C:\Anki2",
                "anki_profile": "Ingles - Vinicius",
            }
        )

        self.assertEqual(
            session._anki_launch_command(),
            [r"C:\Programs\Anki\anki.exe", "-b", r"C:\Anki2", "-p", "Ingles - Vinicius"],
        )

    def test_launch_command_omits_profile_when_last_loaded_matches_config(self) -> None:
        class FakeSession(AnkiSession):
            def _anki_last_loaded_profile_matches_config(self) -> bool:
                return True

        session = FakeSession(
            {
                "anki_executable": r"C:\Users\sadvi\AppData\Local\Programs\Anki\anki.exe",
                "anki_base_path": r"C:\Users\sadvi\AppData\Roaming\Anki2",
                "anki_profile": "Ingles - Vinicius",
            }
        )

        self.assertEqual(
            session._anki_launch_command(),
            [
                r"C:\Users\sadvi\AppData\Local\Programs\Anki\anki.exe",
                "-b",
                r"C:\Users\sadvi\AppData\Roaming\Anki2",
            ],
        )

    def test_launch_command_keeps_profile_when_last_loaded_differs(self) -> None:
        class FakeSession(AnkiSession):
            def _anki_last_loaded_profile_matches_config(self) -> bool:
                return False

        session = FakeSession(
            {
                "anki_executable": r"C:\Users\sadvi\AppData\Local\Programs\Anki\anki.exe",
                "anki_base_path": r"C:\Users\sadvi\AppData\Roaming\Anki2",
                "anki_profile": "Ingles - Vinicius",
            }
        )

        self.assertEqual(
            session._anki_launch_command(),
            [
                r"C:\Users\sadvi\AppData\Local\Programs\Anki\anki.exe",
                "-b",
                r"C:\Users\sadvi\AppData\Roaming\Anki2",
                "-p",
                "Ingles - Vinicius",
            ],
        )

    def test_last_loaded_profile_reads_prefs21_global_pickle(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            prefs = base / "prefs21.db"
            conn = sqlite3.connect(prefs)
            try:
                conn.execute("create table profiles (name text, data blob)")
                blob = pickle.dumps({"last_loaded_profile_name": "Ingles - Vinicius"})
                conn.execute("insert into profiles values ('_global', ?)", (blob,))
                conn.commit()
            finally:
                conn.close()

            matching = _session(anki_base_path=str(base), anki_profile="ingles - vinicius")
            self.assertEqual(matching._anki_last_loaded_profile_name(), "Ingles - Vinicius")
            self.assertTrue(matching._anki_last_loaded_profile_matches_config())

            differing = _session(anki_base_path=str(base), anki_profile="Outro Perfil")
            self.assertFalse(differing._anki_last_loaded_profile_matches_config())

    def test_last_loaded_profile_returns_none_without_prefs_db(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            session = _session(anki_base_path=tmp, anki_profile="X")
            self.assertIsNone(session._anki_last_loaded_profile_name())
            self.assertFalse(session._anki_last_loaded_profile_matches_config())

    def test_launch_env_strips_python_and_qt_pollution(self) -> None:
        fake_env = {
            "PATH": r"C:\System32;C:\Windows",
            "KEEPME": "yes",
            "PYTHONPATH": r"C:\hermes\venv",
            "PYTHONHOME": r"C:\py",
            "UV_CACHE_DIR": r"C:\uv",
            "VIRTUAL_ENV": r"C:\venv",
            "CONDA_PREFIX": r"C:\conda",
            "QT_PLUGIN_PATH": r"C:\qt\plugins",
            "PYCHARM_HOSTED": "1",
        }
        with mock.patch.dict("anki_session.os.environ", fake_env, clear=True):
            env = _session()._anki_launch_env(Path(r"C:\Programs\Anki"))

        self.assertEqual(env.get("KEEPME"), "yes")
        for blocked in ("PYTHONPATH", "PYTHONHOME", "UV_CACHE_DIR", "VIRTUAL_ENV", "CONDA_PREFIX", "QT_PLUGIN_PATH", "PYCHARM_HOSTED"):
            self.assertNotIn(blocked, env)
        # sanitized PATH is rebuilt under "Path" and leads with the Anki dir
        self.assertIn("Path", env)
        self.assertTrue(env["Path"].startswith(r"C:\Programs\Anki"))

    def test_launch_desktop_returns_none_when_executable_unavailable(self) -> None:
        self.assertIsNone(_session()._launch_anki_desktop())  # no executable configured
        missing = _session(anki_executable=r"C:\nope\definitely-not-anki.exe")
        self.assertIsNone(missing._launch_anki_desktop())  # path does not exist

    def test_status_healthy_gate_follows_collection_ready_only(self) -> None:
        class ReadyInvisible(AnkiSession):
            def connect_status(self) -> tuple[bool, str]:
                return True, "version ok"

            def collection_ready_status(self) -> tuple[bool, str]:
                return True, "collection ready"

            def _anki_processes(self) -> list[dict[str, Any]]:
                return []  # ready but no visible window

        payload = ReadyInvisible({}).status()
        self.assertTrue(payload["healthy"])
        self.assertFalse(payload["visibleWindow"])
        self.assertEqual(payload["healthy"], payload["collectionReady"])

        class VisibleNotReady(AnkiSession):
            def connect_status(self) -> tuple[bool, str]:
                return True, "version ok"

            def collection_ready_status(self) -> tuple[bool, str]:
                return False, "deckNames error"

            def _anki_processes(self) -> list[dict[str, Any]]:
                return [{"pid": 1, "visibleWindow": True}]

        payload2 = VisibleNotReady({}).status()
        self.assertFalse(payload2["healthy"])  # visible window does NOT make it healthy
        self.assertTrue(payload2["visibleWindow"])

    def test_repair_ok_is_gated_on_collection_ready(self) -> None:
        class FailSession(AnkiSession):
            def _kill_anki_processes(self) -> dict[str, Any]:
                return {"remaining": []}

            def status(self) -> dict[str, Any]:
                return {"collectionReady": False, "visibleWindow": False, "collectionDetail": "offline"}

            def _launch_anki_desktop(self) -> Any:
                return None

        # wait timeout 0 → repair loop is skipped, resolves immediately
        result = FailSession({"anki_wait_timeout_sec": 0}).repair()
        self.assertFalse(result["ok"])
        self.assertEqual(result["detail"], "offline")

        class OkSession(AnkiSession):
            def _kill_anki_processes(self) -> dict[str, Any]:
                return {"remaining": []}

            def status(self) -> dict[str, Any]:
                return {"collectionReady": True, "visibleWindow": True, "collectionDetail": "ready"}

            def _launch_anki_desktop(self) -> Any:
                return None

        with mock.patch("anki_session.time.sleep"):
            ok_result = OkSession({}).repair()
        self.assertTrue(ok_result["ok"])

    def test_launch_still_bootstrapping_waits_while_children_exist(self) -> None:
        class NoProcs(AnkiSession):
            def _anki_processes(self) -> list[dict[str, Any]]:
                return []

        session = NoProcs({})

        class ExitedProc:
            def poll(self) -> int:
                return 0

        # No proc handle → still bootstrapping (can't conclude it exited)
        self.assertTrue(session._anki_launch_still_bootstrapping(None))
        # Proc exited, no children, no connect → not bootstrapping anymore
        self.assertFalse(session._anki_launch_still_bootstrapping(ExitedProc()))
        # Proc exited but AnkiConnect already answering → keep waiting
        self.assertTrue(session._anki_launch_still_bootstrapping(ExitedProc(), {"connectAvailable": True}))

    def test_taskkill_access_denied_detection_accepts_stdout_and_stderr(self) -> None:
        session = _session()
        self.assertTrue(session._taskkill_access_denied([{"stdout": "ERRO: Acesso negado", "stderr": ""}]))
        self.assertTrue(session._taskkill_access_denied([{"stdout": "", "stderr": "Access is denied."}]))
        self.assertFalse(session._taskkill_access_denied([{"stdout": "SUCCESS", "stderr": ""}]))

    def test_clear_invisible_returns_false_when_a_window_is_visible(self) -> None:
        session = _session()
        self.assertFalse(
            session._clear_invisible_anki_processes(
                [{"pid": 1, "visibleWindow": True}],
                "some detail",
            )
        )

    def test_clear_invisible_kills_and_reports_success(self) -> None:
        class FakeSession(AnkiSession):
            def _kill_anki_processes(self) -> dict[str, Any]:
                return {"remaining": []}

        with mock.patch("anki_session.time.sleep"):
            cleared = FakeSession({})._clear_invisible_anki_processes(
                [{"pid": 1, "visibleWindow": False}],
                "ConnectionError: refused",
            )
        self.assertTrue(cleared)

    def test_invisible_access_denied_raises_structured_exception(self) -> None:
        class FakeSession(AnkiSession):
            def _all_anki_processes_invisible(self, processes: list[dict[str, Any]]) -> bool:
                return True

            def _kill_anki_processes(self) -> dict[str, Any]:
                process = {"pid": 1234, "image": "anki", "visibleWindow": False, "mainWindowTitle": ""}
                return {
                    "accessDenied": True,
                    "remaining": [process],
                    "processes": [process],
                    "results": [{"pid": 1234, "stderr": "ERRO: Acesso negado"}],
                }

        session = FakeSession({})
        with self.assertRaises(AnkiRepairBlockedError) as ctx:
            session._clear_invisible_anki_processes(
                [{"pid": 1234, "image": "anki", "visibleWindow": False}],
                "ConnectionError: refused",
            )

        payload = ctx.exception.payload
        self.assertEqual(payload["code"], "anki_repair_access_denied")
        self.assertEqual(payload["pids"], [1234])
        self.assertIn("Os arquivos deste job ja foram gerados", payload["detail"])

    def test_ensure_ready_raises_structured_exception_without_timeout(self) -> None:
        class FakeSession(AnkiSession):
            def collection_ready_status(self) -> tuple[bool, str]:
                return False, "ConnectionError: refused"

            def _anki_processes(self) -> list[dict[str, Any]]:
                return [{"pid": 1234, "image": "anki", "visibleWindow": False}]

            def _all_anki_processes_invisible(self, processes: list[dict[str, Any]]) -> bool:
                return True

            def _kill_anki_processes(self) -> dict[str, Any]:
                return {
                    "accessDenied": True,
                    "remaining": [{"pid": 1234, "image": "anki", "visibleWindow": False}],
                    "results": [{"pid": 1234, "stdout": "ERRO: Acesso negado", "stderr": ""}],
                }

            def _launch_anki_desktop(self) -> Any:
                raise AssertionError("Anki must not be relaunched after access denied")

        session = FakeSession(
            {
                "anki_wait_timeout_sec": 90,
                "anki_launch_attempts": 1,
                "anki_poll_interval_sec": 2,
                "anki_launch_grace_sec": 90,
            }
        )
        started = time.monotonic()
        with self.assertRaises(AnkiRepairBlockedError) as ctx:
            session.ensure_ready()

        self.assertLess(time.monotonic() - started, 1.0)
        self.assertEqual(ctx.exception.payload["code"], "anki_repair_access_denied")

    def test_ensure_connect_enabled_heals_meta_json_version_cap(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            meta_dir = base / "addons21" / "2055492159"
            meta_dir.mkdir(parents=True)
            meta_path = meta_dir / "meta.json"
            meta_path.write_text(
                json.dumps({"name": "AnkiConnect", "disabled": True, "max_point_version": 45}),
                encoding="utf-8",
            )

            _session(anki_base_path=str(base)).ensure_connect_enabled()

            healed = json.loads(meta_path.read_text(encoding="utf-8"))
            self.assertFalse(healed["disabled"])
            self.assertEqual(healed["max_point_version"], 2147483647)


class AnkiSessionInternalsSourceTests(unittest.TestCase):
    def test_shell_execute_uses_shellexecutew_open_verb(self) -> None:
        shell_fn = _anki_session_function_source("_shell_execute_anki_desktop")

        self.assertIn("ShellExecuteW", shell_fn)
        self.assertIn("subprocess.list2cmdline(args)", shell_fn)
        self.assertIn('"open"', shell_fn)

    def test_popen_fallback_hides_window_with_startupinfo(self) -> None:
        fn = _anki_session_function_source("_launch_anki_desktop_with_popen")

        self.assertIn("subprocess.Popen", fn)
        self.assertIn("STARTF_USESHOWWINDOW", fn)
        self.assertIn("wShowWindow = 1", fn)
        self.assertIn("env = self._anki_launch_env(anki_path.parent)", fn)
        self.assertIn("env=env", fn)

    def test_process_detection_includes_pythonw_launcher(self) -> None:
        fn = _anki_session_function_source("_anki_processes")

        self.assertIn("python,", fn)
        self.assertIn("pythonw", fn)
        self.assertIn("MainWindowTitle", fn)
        self.assertIn("$ankiRoots", fn)
        self.assertIn("isAnkiPath", fn)

    def test_taskkill_cascade_falls_back_to_stop_process(self) -> None:
        helper_fn = _anki_session_function_source("_taskkill_access_denied")
        kill_fn = _anki_session_function_source("_kill_anki_processes")
        stop_fn = _anki_session_function_source("_stop_anki_processes_with_powershell")

        self.assertIn("denied_markers", helper_fn)
        self.assertIn("item.get('stdout'", helper_fn)
        self.assertIn("item.get('stderr'", helper_fn)
        self.assertIn("denied = self._taskkill_access_denied(results)", kill_fn)
        self.assertIn("self._stop_anki_processes_with_powershell(remaining_pids)", kill_fn)
        self.assertIn("Stop-Process -Force", stop_fn)
        self.assertIn('"stopProcess": stop_process_result', kill_fn)
        self.assertIn("blocked = denied and bool(remaining)", kill_fn)
        self.assertIn('"accessDenied": blocked', kill_fn)
        self.assertIn('"detail": "access_denied" if blocked else', kill_fn)

    def test_access_denied_repair_message_mentions_existing_artifacts(self) -> None:
        source = _anki_session_source()

        self.assertIn("Os arquivos deste job ja foram gerados", source)
        self.assertIn("Feche o Anki pelo Gerenciador de Tarefas", source)
        self.assertIn("retente o job", source)

    def test_ankiconnect_healer_targets_official_addon_and_max_version(self) -> None:
        fn = _anki_session_function_source("ensure_connect_enabled")

        self.assertIn('folder != "2055492159"', fn)
        self.assertIn('"ankiconnect" not in name', fn)
        self.assertIn('meta["max_point_version"] = MAX_SUPPORTED_POINT_VERSION', fn)
        self.assertIn('meta["disabled"] = False', fn)


class BridgeServerTests(unittest.TestCase):
    def test_config_uses_windows_shortcut_anki_launcher(self) -> None:
        config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
        executable = config["anki_executable"]

        self.assertTrue(executable.endswith(r"Local\Programs\Anki\anki.exe"))
        self.assertNotIn(r"AnkiProgramFiles\.venv\Scripts\anki.exe", executable)

    def test_autostart_uses_console_python_hidden_by_vbs(self) -> None:
        source = _install_autostart_source()

        self.assertIn("def _bridge_python_executable", source)
        self.assertIn('python.name.lower() == "pythonw.exe"', source)
        self.assertIn('python.with_name("python.exe")', source)
        self.assertNotIn("def _hidden_python_executable", source)

    def _bridge_with_jobs(self, tmp: str) -> "server.BridgeApp":
        return server.BridgeApp(config={
            "automatic_anki_path": ".",
            "jobs_root": str(Path(tmp) / "jobs"),
            "queue_file": str(Path(tmp) / "queue.json"),
        })

    def test_envio_routes_create_list_and_continue_an_envio_through_the_store(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            bridge = self._bridge_with_jobs(tmp)
            bridge.store.ensure_runtime()
            client = bridge.app.test_client()

            created = client.post("/jobs", json={"lang": "en", "entries": [{"phraseId": 1, "line": "a"}]})
            job_id = created.get_json()["jobId"]

            self.assertEqual(created.status_code, 201)
            self.assertEqual(created.get_json()["status"], "queued")
            listed = client.get("/jobs").get_json()["jobs"]
            self.assertEqual([(j["jobId"], j["status"], j["state"]["stage"]) for j in listed], [(job_id, "queued", "queued")])
            self.assertEqual(client.get(f"/jobs/{job_id}").get_json()["job"]["deckName"], "teste")

            bridge.store.claim_next()
            bridge.store.update(job_id, status="failed", stage="failed", lastError="x")
            retried = client.post(f"/jobs/{job_id}/retry")

            self.assertEqual(retried.get_json(), {"jobId": job_id, "status": "queued"})
            self.assertEqual(client.get("/jobs").get_json()["jobs"][0]["state"]["lastError"], None)

    def test_envio_routes_refuse_bad_requests_and_unknown_envios(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            client = self._bridge_with_jobs(tmp).app.test_client()

            self.assertEqual(client.post("/jobs", json={"lang": "en", "entries": []}).get_json()["error"], "entries_required")
            self.assertEqual(client.post("/jobs", json={"lang": "fr", "entries": [{"phraseId": 1}]}).get_json()["error"], "invalid_lang")
            self.assertEqual(client.post("/jobs/nao-existe/retry").status_code, 404)
            self.assertEqual(client.get("/jobs/nao-existe").status_code, 404)
            self.assertEqual(client.get("/jobs/nao-existe/debug-bundle").status_code, 404)

    def test_the_bridge_hands_the_queue_to_the_envio_worker(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            bridge = self._bridge_with_jobs(tmp)

            self.assertIs(bridge.job_worker.store, bridge.store)
            self.assertIs(bridge.job_worker.runner.anki, bridge.anki)
            self.assertIs(bridge.job_worker.runner.engine.modules, bridge.modules)

    def _bridge_for_decks(self, tmp: str) -> "server.BridgeApp":
        return server.BridgeApp(config={"automatic_anki_path": ".", "anki_base_path": tmp})

    def test_anki_decks_lists_the_decks_anki_has_sorted_and_without_default(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            bridge = self._bridge_for_decks(tmp)
            names = ["Default", "russian", "Inglês::Mineradas", "CIMV", "  ", "English Mining"]
            with mock.patch.object(bridge.anki, "collection_ready_status", return_value=(True, "collection ready")), \
                    mock.patch.object(bridge.anki, "invoke", return_value=names) as invoke:
                response = bridge.app.test_client().get("/anki/decks")

        invoke.assert_called_once_with("deckNames")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), {"decks": ["CIMV", "English Mining", "Inglês::Mineradas", "russian"]})

    def test_anki_decks_reads_the_local_collection_when_anki_is_down(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            bridge = self._bridge_for_decks(tmp)
            con = sqlite3.connect(":memory:")
            con.row_factory = sqlite3.Row
            con.execute("create table decks (id integer, name text)")
            con.executemany(
                "insert into decks values (?, ?)",
                [(1, "Default"), (2, "Inglês\x1fMineradas"), (3, "RUSSIAN")],
            )
            with mock.patch.object(bridge.anki, "collection_ready_status", return_value=(False, "connection refused")), \
                    mock.patch.object(bridge, "_open_local_anki_collection", return_value=con):
                response = bridge.app.test_client().get("/anki/decks")

        self.assertEqual(response.status_code, 200)
        # Os níveis do arquivo local (\x1f) voltam a ser `::`.
        self.assertEqual(response.get_json(), {"decks": ["Inglês::Mineradas", "RUSSIAN"]})

    def test_anki_decks_falls_back_to_local_when_live_names_fail_after_ready(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            bridge = self._bridge_for_decks(tmp)
            con = sqlite3.connect(":memory:")
            con.row_factory = sqlite3.Row
            con.execute("create table decks (id integer, name text)")
            con.execute("insert into decks values (1, 'Local')")
            with mock.patch.object(bridge.anki, "collection_ready_status", return_value=(True, "collection ready")), \
                    mock.patch.object(bridge.anki, "invoke", side_effect=RuntimeError("AnkiConnect timeout")) as invoke, \
                    mock.patch.object(bridge, "_open_local_anki_collection", return_value=con):
                response = bridge.app.test_client().get("/anki/decks")

        invoke.assert_called_once_with("deckNames")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), {"decks": ["Local"]})

    def test_local_deck_from_list_has_stats_and_vocabulary(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            profile = Path(tmp) / "Perfil"
            profile.mkdir()
            with sqlite3.connect(profile / "collection.anki2") as con:
                con.execute("create table decks (id integer, name text)")
                con.executemany("insert into decks values (?, ?)", [
                    (1, "Default"), (2, "Inglês\x1fMineradas"), (3, "Inglês\x1fMineradas Extra"),
                ])
                con.execute("create table fields (ntid integer, ord integer, name text)")
                con.executemany("insert into fields values (?, ?, ?)", [(9, 0, "Frente"), (9, 1, "Verso")])
                con.execute("create table notes (id integer, mid integer, flds text)")
                con.execute("insert into notes values (42, 9, ?)", ("mango\x1fa fruit",))
                con.execute("create table cards (nid integer, did integer, type integer, ivl integer, mod integer)")
                con.execute("insert into cards values (42, 2, 2, 30, 0)")

            bridge = self._bridge_for_decks(tmp)
            with mock.patch.object(bridge.anki, "collection_ready_status", return_value=(False, "offline")), \
                    mock.patch.object(bridge.anki, "invoke", side_effect=RuntimeError("offline")), \
                    mock.patch.object(bridge, "_deck_stats_config", return_value={"anki": {"fields": {"front": "Frente", "back": "Verso"}}}):
                client = bridge.app.test_client()
                names = client.get("/anki/decks")
                deck_name = "Inglês::Mineradas"
                stats = client.get("/anki/stats/decks", query_string={"deck": deck_name, "lang": "en"})
                vocabulary = client.get("/anki/vocabulary", query_string={"deck": deck_name, "lang": "en"})

        self.assertEqual(names.status_code, 200)
        self.assertIn(deck_name, names.get_json()["decks"])
        self.assertEqual(stats.status_code, 200)
        self.assertEqual(stats.get_json()["decks"][0]["cards"], 1)
        self.assertEqual(vocabulary.status_code, 200)
        self.assertEqual(vocabulary.get_json()["totalCards"], 1)
        self.assertIn("mango", [row["word"] for row in vocabulary.get_json()["words"]])

    def test_anki_decks_answers_503_when_neither_anki_nor_the_local_collection_can_be_read(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            bridge = self._bridge_for_decks(tmp)
            with mock.patch.object(bridge.anki, "collection_ready_status", return_value=(False, "connection refused")):
                response = bridge.app.test_client().get("/anki/decks")

        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.get_json()["error"], "anki_decks_unavailable")

    def test_health_exposes_loaded_module_fingerprint(self) -> None:
        health_fn = _function_source("health")

        self.assertIn('"automaticAnkiPath": str(self.automatic_anki_path)', health_fn)
        self.assertIn('"runtime": self._runtime_payload()', health_fn)
        self.assertIn('"moduleFingerprint": self.module_fingerprint', health_fn)

    def test_health_exposes_runtime_identity_for_loaded_bridge_code(self) -> None:
        runtime_fn = _function_source("_runtime_payload")

        self.assertIn('"pid": os.getpid()', runtime_fn)
        self.assertIn('"startedAt": self.started_at', runtime_fn)
        self.assertIn('"serverFile": self.server_fingerprint', runtime_fn)
        self.assertIn('"ankiRepairBlockedHandlerLoaded": self._anki_repair_blocked_handler_loaded()', runtime_fn)

    def test_server_fingerprint_tracks_current_server_file(self) -> None:
        source = _source()

        self.assertIn("SERVER_PATH = Path(__file__).resolve()", source)
        self.assertIn("self.server_fingerprint = _file_fingerprint(SERVER_PATH)", source)
        self.assertIn('"sha256_12"', source)

    def test_module_fingerprint_checks_image_normalization_guard(self) -> None:
        fingerprint_fn = _function_source("_build_module_fingerprint")

        self.assertIn('"image_judge.py"', fingerprint_fn)
        self.assertIn('"google_images.py"', fingerprint_fn)
        self.assertIn('"image_utils.py"', fingerprint_fn)
        self.assertIn('"normalize_image_bytes"', fingerprint_fn)
        self.assertIn('"download_candidate"', fingerprint_fn)
        self.assertIn('"_is_invalid_image_format_error"', fingerprint_fn)

    def test_access_denied_repair_route_answers_503_with_the_payload(self) -> None:
        payload = {
            "ok": False,
            "error": "repair_access_denied",
            "code": "anki_repair_access_denied",
            "detail": "Feche o Anki pelo Gerenciador de Tarefas",
            "pids": [1234],
        }
        with tempfile.TemporaryDirectory() as tmp:
            bridge = self._bridge_with_jobs(tmp)
            with mock.patch.object(bridge.anki, "repair", side_effect=AnkiRepairBlockedError(payload)) as repair:
                response = bridge.app.test_client().post("/anki/repair")

        repair.assert_called_once_with()
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.get_json(), payload)

    def test_anki_routes_delegate_to_the_session_seam(self) -> None:
        source = _source()

        self.assertIn("self.anki = AnkiSession(self.config)", source)
        self.assertIn("jsonify(self.anki.status())", source)
        self.assertIn("self.anki.repair()", source)
        self.assertIn("self.anki.ensure_ready()", source)
        self.assertIn("self.anki.ensure_connect_enabled()", source)

    def test_construction_has_no_side_effects(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            meta_dir = base / "addons21" / "2055492159"
            meta_dir.mkdir(parents=True)
            meta_path = meta_dir / "meta.json"
            original_meta = {"name": "AnkiConnect", "disabled": True, "max_point_version": 45}
            meta_path.write_text(json.dumps(original_meta), encoding="utf-8")

            bridge = server.BridgeApp(
                config={
                    "automatic_anki_path": ".",
                    "anki_base_path": str(base),
                }
            )

            self.assertFalse(bridge.worker.is_alive())
            self.assertEqual(bridge.modules, {})
            # ensure_connect_enabled (que reescreve meta.json) só roda em start(),
            # nunca na construção.
            self.assertEqual(
                json.loads(meta_path.read_text(encoding="utf-8")),
                original_meta,
            )


if __name__ == "__main__":
    unittest.main()
