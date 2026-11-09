"""FoodIsHard - tiny meal-planner server.

Standard library only. Serves the web app and stores one JSON state document.
Runs as a Home Assistant add-on behind Ingress (HA handles login), or standalone.
"""

import copy
import json
import mimetypes
import os
import tempfile
import threading
import time
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs

APP_DIR = Path(__file__).resolve().parent
STATIC_DIR = APP_DIR / "static"
SEED_DIR = APP_DIR / "data"
DATA_DIR = Path(os.environ.get("FOODISHARD_DATA", "/data"))
STATE_FILE = DATA_DIR / "state.json"
PORT = int(os.environ.get("PORT", "8099"))
MAX_BODY = 512 * 1024

_lock = threading.Lock()
_state = None  # loaded lazily


# --------------------------------------------------------------------------
# State storage
# --------------------------------------------------------------------------

def _defaults():
    with open(SEED_DIR / "defaults.json", encoding="utf-8") as fh:
        doc = json.load(fh)
    doc["rev"] = 0
    return doc


def _load():
    global _state
    if _state is not None:
        return _state
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if STATE_FILE.exists():
        with open(STATE_FILE, encoding="utf-8") as fh:
            _state = json.load(fh)
        # fill in any keys added in newer versions
        base = _defaults()
        for key, value in base.items():
            _state.setdefault(key, value)
        for key, value in base["settings"].items():
            _state["settings"].setdefault(key, value)
    else:
        _state = _defaults()
        _save()
    return _state


def _save():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=DATA_DIR, prefix=".state-", suffix=".json")
    with os.fdopen(fd, "w", encoding="utf-8") as fh:
        json.dump(_state, fh, ensure_ascii=False, indent=1)
    os.replace(tmp, STATE_FILE)


# --------------------------------------------------------------------------
# Operations - keep in step with applyOp() in static/app.js
# --------------------------------------------------------------------------

def apply_op(state, op, user):
    kind = op.get("op")
    now = int(time.time())

    if kind == "settings":
        patch = op.get("patch") or {}
        for key, value in patch.items():
            state["settings"][key] = value

    elif kind == "plan":
        state["plans"][op["week"]] = op["plan"]

    elif kind == "day":
        plan = state["plans"].setdefault(op["week"], {"days": [None] * 7})
        days = plan.setdefault("days", [None] * 7)
        while len(days) < 7:
            days.append(None)
        days[int(op["i"])] = op["day"]

    elif kind == "pref":
        pref = state["prefs"].setdefault(op["recipe"], {})
        pref.update(op.get("patch") or {})

    elif kind == "check":
        week = state["checks"].setdefault(op["week"], {})
        item = week.setdefault(op["key"], {})
        item[op["field"]] = bool(op["value"])
        item["by"] = user
        item["at"] = now

    elif kind == "clear_checks":
        state["checks"][op["week"]] = {}

    elif kind == "extra_add":
        items = state["extras"].setdefault(op["week"], [])
        item = dict(op["item"])
        item["by"] = user
        items.append(item)

    elif kind == "extra_remove":
        items = state["extras"].get(op["week"], [])
        state["extras"][op["week"]] = [i for i in items if i.get("id") != op["id"]]

    elif kind == "price":
        prices = state.setdefault("prices", {})
        if op.get("price") is None:
            prices.pop(op["key"], None)
        else:
            prices[op["key"]] = {"p": float(op["price"]), "shop": op.get("shop") or "aldi", "at": now, "by": user}

    elif kind == "swap":
        swaps = state.setdefault("swaps", {})
        if op.get("alt") is None:
            swaps.pop(op["key"], None)
        else:
            swaps[op["key"]] = str(op["alt"])

    elif kind == "shop_for":
        week = state.setdefault("shopFor", {}).setdefault(op["week"], {})
        if op.get("shop"):
            week[op["key"]] = op["shop"]
        else:
            week.pop(op["key"], None)

    else:
        raise ValueError(f"unknown op {kind!r}")

    state["rev"] = int(state.get("rev", 0)) + 1
    return state


# --------------------------------------------------------------------------
# HTTP
# --------------------------------------------------------------------------

def _user_from(headers):
    # Home Assistant Ingress passes the logged-in user in these headers.
    return (
        headers.get("X-Remote-User-Display-Name")
        or headers.get("X-Remote-User-Name")
        or ""
    )


class Handler(BaseHTTPRequestHandler):
    server_version = "FoodIsHard/1"

    def log_message(self, fmt, *args):  # quieter logs
        if os.environ.get("FOODISHARD_DEBUG"):
            super().log_message(fmt, *args)

    # -- helpers --
    def _send_json(self, obj, status=HTTPStatus.OK):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_file(self, path):
        ctype = mimetypes.guess_type(str(path))[0] or "application/octet-stream"
        if ctype.startswith("text/") or ctype in ("application/javascript", "application/json"):
            ctype += "; charset=utf-8"
        data = path.read_bytes()
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", ctype)
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _route_path(self):
        return urlparse(self.path).path

    # -- GET --
    def do_GET(self):
        url = urlparse(self.path)
        path = url.path

        if path.endswith("/api/state"):
            with _lock:
                state = _load()
                since = parse_qs(url.query).get("rev", [None])[0]
                if since is not None and str(state.get("rev")) == since:
                    return self._send_json({"unchanged": True, "rev": state.get("rev")})
                return self._send_json({"state": state, "user": _user_from(self.headers)})

        if path.endswith("/api/health"):
            return self._send_json({"ok": True})

        # static files - Ingress serves us under a prefix, so match by tail.
        name = path.rsplit("/", 1)[-1] or "index.html"
        if "/data/" in path and name.endswith(".json"):
            target = SEED_DIR / name
        else:
            target = STATIC_DIR / name
        try:
            target = target.resolve()
            if target.is_file() and (STATIC_DIR in target.parents or SEED_DIR in target.parents):
                return self._send_file(target)
        except OSError:
            pass
        # unknown paths fall back to the app shell
        return self._send_file(STATIC_DIR / "index.html")

    # -- POST --
    def do_POST(self):
        path = self._route_path()
        if not path.endswith("/api/op"):
            return self._send_json({"error": "not found"}, HTTPStatus.NOT_FOUND)
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > MAX_BODY:
            return self._send_json({"error": "bad length"}, HTTPStatus.BAD_REQUEST)
        try:
            op = json.loads(self.rfile.read(length))
        except json.JSONDecodeError:
            return self._send_json({"error": "bad json"}, HTTPStatus.BAD_REQUEST)

        user = _user_from(self.headers) or op.get("by") or ""
        with _lock:
            state = _load()
            backup = copy.deepcopy(state)
            try:
                apply_op(state, op, user)
                _save()
            except (KeyError, ValueError, TypeError, IndexError) as err:
                globals()["_state"] = backup
                return self._send_json({"error": str(err)}, HTTPStatus.BAD_REQUEST)
            return self._send_json({"state": state, "user": user})


def main():
    with _lock:
        _load()
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print(f"FoodIsHard listening on :{PORT}, data in {DATA_DIR}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
