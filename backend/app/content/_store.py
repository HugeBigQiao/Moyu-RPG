"""内容加载器。

职责：
    按 mtime 读缓存 data/content/*.json，提供 reload_all 与错误收集。
为什么需要：
    设定必须可改而不重启；集中加载也让「坏 JSON」有一个明确的报错点。
上下游：
    上游：data/content/*.json；下游：app/content/* 各加载器、/api/admin/reload。
"""


from __future__ import annotations

import json
import threading
from pathlib import Path

CONTENT_DIR = Path(__file__).resolve().parents[2] / "data" / "content"

_lock = threading.Lock()
_cache: dict[str, tuple[float, dict]] = {}
_listeners: list = []
_errors: dict[str, str] = {}


class ContentError(RuntimeError):
    pass


def path_of(name: str) -> Path:
    return CONTENT_DIR / (name + ".json")


def load(name: str, force: bool = False) -> dict:
    """读一个内容文件；文件没变就返回缓存。"""
    path = path_of(name)
    if not path.is_file():
        raise ContentError("缺少内容文件：%s" % path)

    mtime = path.stat().st_mtime
    with _lock:
        cached = _cache.get(name)
        if cached and cached[0] == mtime and not force:
            return cached[1]

        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            raise ContentError("%s 不是合法 JSON：%s" % (path.name, exc)) from exc

        _cache[name] = (mtime, data)
        _errors.pop(name, None)
        return data


def register(module_name: str, apply) -> None:
    """内容模块把自己的 apply 挂上来，reload 时一起刷新。"""
    _listeners.append((module_name, apply))


def reload_all() -> dict:
    """强制重读全部内容。返回每个模块的状态。"""
    report = {}
    with _lock:
        _cache.clear()

    for module_name, apply in _listeners:
        try:
            apply(force=True)
            report[module_name] = "ok"
        except Exception as exc:  # noqa: BLE001  一个文件坏了不该拖垮别的
            _errors[module_name] = str(exc)
            report[module_name] = "error: %s" % exc
    return report


def status() -> dict:
    return {
        "dir": str(CONTENT_DIR),
        "files": sorted(p.name for p in CONTENT_DIR.glob("*.json")),
        "errors": dict(_errors),
    }
