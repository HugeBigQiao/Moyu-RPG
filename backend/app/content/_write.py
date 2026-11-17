"""内容写回。

职责：
    把一个内容文件原子地写回 data/content/*.json，写成功后触发全量重载。
为什么需要：
    档案页要能增删改，但设定只有 JSON 这一份真相；直接覆盖写会留下半截文件，
    所以用「同目录临时文件 + os.replace」保证磁盘上要么是旧内容、要么是新内容。
上下游：
    上游：app/content/edit（已经校验过的整份数据）；下游：data/content/*.json、_store.reload_all。
"""


from __future__ import annotations

import json
import os
import tempfile
import threading

from . import _store

# 同一时刻只允许一次写盘：两次并发写同一文件会互相盖掉对方的结果
_LOCK = threading.RLock()


def save(name: str, data: dict) -> None:
    """把 data 写回 <name>.json，并重载内存里的内容。"""
    save_many({name: data})


def save_many(documents: dict[str, dict]) -> None:
    """一次写多个内容文件，全部落盘后只重载一次。

    参数：
        documents：文件名（不含 .json）→ 完整文件内容。
    为什么需要：
        建任务时可能同时要写 missions 与 scenarios；分两次写会重载两遍，
        中间那一瞬间内存里的任务还会引用一个不存在的剧本。
    输出：
        无；任何一份写失败都抛异常，已写的文件保持新内容（原子替换不会写出半截）。
    """
    with _LOCK:
        for name, data in documents.items():
            _write_one(name, data)
        _store.reload_all()


def _write_one(name: str, data: dict) -> None:
    path = _store.CONTENT_DIR / (name + ".json")
    # 用和现有文件一致的格式：2 空格缩进、中文不转义、结尾换行，这样 git diff 只显示真正改动的行
    text = json.dumps(data, ensure_ascii=False, indent=2) + "\n"

    fd, tmp = tempfile.mkstemp(
        dir=str(_store.CONTENT_DIR), prefix="." + name + "-", suffix=".tmp"
    )
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as handle:
            handle.write(text)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(tmp, path)
    except BaseException:
        # 写到一半失败：把临时文件清掉，别在 content 目录里留垃圾
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise
