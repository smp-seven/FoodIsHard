"""FoodIsHard - tiny meal-planner server.

Standard library only. Serves the web app and stores one JSON state document.
Runs as a Home Assistant add-on behind Ingress (HA handles login), or standalone.
"""

import copy
import datetime
import json
import mimetypes
import os
import re
import tempfile
import threading
import time
import urllib.request
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
MAX_IMPORT = 4 * 1024 * 1024
mimetypes.add_type("font/woff2", ".woff2")
mimetypes.add_type("font/woff", ".woff")
mimetypes.add_type("application/manifest+json", ".webmanifest")
# Only Home Assistant's Ingress proxy may talk to us. Set FOODISHARD_ALLOW_ALL=1 when running locally.
INGRESS_PROXY = "172.30.32.2"
ALLOW_ALL = bool(os.environ.get("FOODISHARD_ALLOW_ALL"))

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
            _state = _load_merge(json.load(fh))
    else:
        _state = _defaults()
        _save()
    return _state


def _load_merge(state):
    """Fill in any keys added in newer versions."""
    base = _defaults()
    for key, value in base.items():
        state.setdefault(key, value)
    for key, value in base["settings"].items():
        state["settings"].setdefault(key, value)
    for person in state["settings"].get("people", []):
        person.setdefault("goal", 40)
    return state


KEEP_WEEKS = {"lists": 8, "plans": 52}  # same as KEEP_WEEKS in cloudflare/src/logic.js


def prune(state, today=None):
    """Drop old weeks: shopping lists after 8 weeks, meal plans after a year."""
    today = today or datetime.date.today()
    short = (today - datetime.timedelta(weeks=KEEP_WEEKS["lists"])).isoformat()
    long_ = (today - datetime.timedelta(weeks=KEEP_WEEKS["plans"])).isoformat()
    for key in ("checks", "extras", "shopFor"):
        bag = state.get(key)
        if isinstance(bag, dict):
            for week in [w for w in bag if w < short]:
                del bag[week]
    plans = state.get("plans")
    if isinstance(plans, dict):
        for week in [w for w in plans if w < long_]:
            del plans[week]
    return state


def _save():
    if _state is not None:
        prune(_state)
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=DATA_DIR, prefix=".state-", suffix=".json")
    with os.fdopen(fd, "w", encoding="utf-8") as fh:
        json.dump(_state, fh, ensure_ascii=False, indent=1)
    os.replace(tmp, STATE_FILE)


# --------------------------------------------------------------------------
# Operations - keep in step with applyOp() in static/app.js
# --------------------------------------------------------------------------

# Names JavaScript objects inherit (Object.prototype), refused here too so both versions agree.
UNSAFE_KEYS = {"__proto__", "constructor", "prototype", "hasOwnProperty", "isPrototypeOf", "propertyIsEnumerable",
               "toLocaleString", "toString", "valueOf", "__defineGetter__", "__defineSetter__", "__lookupGetter__", "__lookupSetter__"}


def check_op(op):
    """Same checks as checkOp() in ops.js, so both versions refuse the same changes."""
    def bad():
        raise ValueError("That change doesn't look right")

    def key(k):
        if k is None:
            return
        if not isinstance(k, str) or not k or len(k) > 200 or k in UNSAFE_KEYS:
            bad()
    if not isinstance(op, dict) or not isinstance(op.get("op"), str):
        bad()
    if op.get("week") is not None and not re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(op["week"])):
        bad()
    for k in (op.get("key"), op.get("recipe"), op.get("id")):
        key(k)
    if op.get("keys") is not None:
        if not isinstance(op["keys"], list) or len(op["keys"]) > 500:
            bad()
        for k in op["keys"]:
            key(k)
    if op.get("patch") is not None:
        if not isinstance(op["patch"], dict):
            bad()
        for k in op["patch"]:
            key(k)
    if op["op"] == "day" and not (isinstance(op.get("i"), int) and 0 <= op["i"] < 7):
        bad()
    if op["op"] == "check" and op.get("field") not in ("done", "have", "need"):
        bad()

    def long(v, n):
        return v is not None and len(str(v)) > n
    # a household cooks for up to 10 grown-ups and 10 little ones (guests on a day cover bigger gatherings)
    if op["op"] == "settings" and isinstance(op.get("patch"), dict):
        for k in ("people", "children"):
            v = op["patch"].get(k)
            if v is not None and (not isinstance(v, list) or len(v) > 10):
                bad()
    if op["op"] == "extra_add":
        item = op.get("item")
        if not isinstance(item, dict) or long(item.get("name"), 120) or long(item.get("amount"), 120) or long(item.get("id"), 60):
            bad()
    if op["op"] == "extra_update" and isinstance(op.get("patch"), dict) and long(op["patch"].get("name"), 120):
        bad()
    if op["op"] == "feedback" and op.get("tags") is not None:
        tags = op["tags"]
        if not isinstance(tags, list) or len(tags) > 12 or any(long(t, 40) for t in tags):
            bad()


def apply_op(state, op, user):
    check_op(op)
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

    elif kind == "qty":
        week = state["checks"].setdefault(op["week"], {})
        week.setdefault(op["key"], {})["n"] = max(1, min(99, int(op["n"])))

    elif kind == "extra_update":
        for item in state["extras"].get(op["week"], []):
            if item.get("id") == op["id"]:
                item.update({k: v for k, v in (op.get("patch") or {}).items() if k in ("name", "price", "qty", "shop")})

    elif kind == "clear_checks":
        # keep what's already been bought this week
        week = state["checks"].get(op["week"]) or {}
        state["checks"][op["week"]] = {k: v for k, v in week.items() if isinstance(v, dict) and v.get("bought")}

    elif kind == "trip":
        week = state["checks"].setdefault(op["week"], {})
        for k in op.get("keys") or []:
            item = week.setdefault(k, {})
            if op.get("undo"):
                item.pop("bought", None)
                item["done"] = False
            else:
                item["bought"] = now
                item["done"] = True
            item["by"] = user
            item["at"] = now

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

    elif kind == "shop_pref":
        prefs = state.setdefault("shopPref", {})
        for key in op.get("keys") or [op.get("key")]:
            if not key:
                continue
            if op.get("shop"):
                prefs[key] = op["shop"]
            else:
                prefs.pop(key, None)

    elif kind == "pantry":
        pantry = state.setdefault("pantry", {})
        for key in op.get("keys") or [op.get("key")]:
            if key and op.get("status"):
                pantry[key] = op["status"]
            elif key:
                pantry.pop(key, None)

    elif kind == "feedback":
        fb = state.setdefault("feedback", {}).setdefault(op["recipe"], [])
        fb.append({"rating": op.get("rating"), "tags": op.get("tags") or [], "note": (op.get("note") or "")[:500], "at": now, "by": user})
        del fb[:-20]

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
        self.send_header("Cache-Control", "max-age=604800" if "/fonts/" in str(path) else "no-cache")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _route_path(self):
        return urlparse(self.path).path

    def _allowed(self):
        if ALLOW_ALL or self.client_address[0] == INGRESS_PROXY:
            return True
        self.send_response(HTTPStatus.FORBIDDEN)
        self.send_header("Content-Length", "0")
        self.end_headers()
        return False

    # -- GET --
    def do_GET(self):
        if not self._allowed():
            return
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
        elif "/fonts/" in path:
            target = STATIC_DIR / "fonts" / name
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
        if not self._allowed():
            return
        path = self._route_path()
        # Only the app sends JSON; a page on another site can't without the browser asking first.
        if not (self.headers.get("Content-Type") or "").lower().startswith("application/json"):
            return self._send_json({"error": "Expected JSON"}, HTTPStatus.UNSUPPORTED_MEDIA_TYPE)
        if path.endswith("/api/import"):
            return self._import()
        if not path.endswith("/api/op"):
            return self._send_json({"error": "not found"}, HTTPStatus.NOT_FOUND)
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > MAX_BODY:
            return self._send_json({"error": "bad length"}, HTTPStatus.BAD_REQUEST)
        try:
            op = json.loads(self.rfile.read(length))
        except json.JSONDecodeError:
            return self._send_json({"error": "bad json"}, HTTPStatus.BAD_REQUEST)
        if not isinstance(op, dict):
            return self._send_json({"error": "bad op"}, HTTPStatus.BAD_REQUEST)

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


    def _import(self):
        """Replace everything with a backup downloaded from Settings (same checks as the Worker)."""
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > MAX_IMPORT:
            return self._send_json({"error": "That backup is too big"}, HTTPStatus.BAD_REQUEST)
        try:
            doc = json.loads(self.rfile.read(length))
            state = doc.get("state") if isinstance(doc, dict) and doc.get("foodishard") else doc
            if not isinstance(state, dict) or not isinstance(state.get("settings"), dict) \
                    or not isinstance(state["settings"].get("people"), list):
                raise ValueError("That file isn't a FoodIsHard backup")
            for key in ("plans", "prefs", "checks", "extras", "prices", "swaps", "shopFor", "shopPref", "pantry", "feedback"):
                if key in state and not isinstance(state[key], dict):
                    raise ValueError(f'Backup has a damaged "{key}" section')
        except (json.JSONDecodeError, ValueError, AttributeError) as err:
            return self._send_json({"error": str(err) or "bad backup"}, HTTPStatus.BAD_REQUEST)
        with _lock:
            current = _load()
            state["rev"] = max(int(current.get("rev") or 0), int(state.get("rev") or 0)) + 1
            globals()["_state"] = _load_merge(state)
            _save()
            return self._send_json({"state": _state, "user": _user_from(self.headers)})


# --------------------------------------------------------------------------
# Food inflation: ONS CPI index 01 "Food and non-alcoholic beverages"
# (series D7BU, 2015=100). One small public download, at most weekly.
# --------------------------------------------------------------------------

ONS_URL = os.environ.get(
    "FOODISHARD_ONS_URL",
    "https://www.ons.gov.uk/economy/inflationandpriceindices/timeseries/d7bu/mm23/data",
)
CHECK_EVERY = 7 * 24 * 3600


def parse_ons(doc, base_period):
    """Return (latest_period, latest_value, base_value) from an ONS timeseries JSON."""
    months = [m for m in doc.get("months", []) if str(m.get("value", "")).strip()]
    if not months:
        raise ValueError("no monthly values")
    latest = months[-1]
    base = next((m for m in months if m.get("date", "").upper() == base_period.upper()), None)
    if base is None:
        raise ValueError(f"base period {base_period} not found")
    return latest["date"], float(latest["value"]), float(base["value"])


def refresh_inflation(force=False):
    with _lock:
        state = _load()
        if not state["settings"].get("inflation", True):
            return
        info = state.setdefault("inflation", {})
        if not force and time.time() - info.get("checked", 0) < CHECK_EVERY:
            return
    with open(SEED_DIR / "ingredients.json", encoding="utf-8") as fh:
        base_period = json.load(fh).get("prices_base_period", "2026 OCT")
    result = {"checked": int(time.time()), "base": base_period}
    try:
        req = urllib.request.Request(ONS_URL, headers={"User-Agent": "FoodIsHard/0.3 (home meal planner)"})
        with urllib.request.urlopen(req, timeout=20) as resp:
            doc = json.load(resp)
        period, latest, base = parse_ons(doc, base_period)
        result.update({"latest": period, "factor": round(latest / base, 4), "error": None})
    except Exception as err:  # keep the last good factor
        result["error"] = str(err)[:200]
    with _lock:
        state = _load()
        info = state.setdefault("inflation", {})
        if result.get("error"):
            info.update({"checked": result["checked"], "error": result["error"]})
        else:
            info.update(result)
        state["rev"] = int(state.get("rev", 0)) + 1
        _save()


def inflation_loop():
    while True:
        try:
            refresh_inflation()
        except Exception as err:
            print("inflation check failed:", err, flush=True)
        time.sleep(6 * 3600)


def main():
    with _lock:
        _load()
    if not os.environ.get("FOODISHARD_NO_INFLATION"):
        threading.Thread(target=inflation_loop, daemon=True).start()
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print(f"FoodIsHard listening on :{PORT}, data in {DATA_DIR}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
