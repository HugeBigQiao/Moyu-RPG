"""代码风格约束的测试。

只做一件事：保证每个模块开头都写了「职责 / 上下游」。
这条规矩是为了让接手的人先知道「这个文件为什么存在」，再读实现。
"""

from __future__ import annotations

from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
APP = ROOT / "app"

HEADER_MARKS = ("职责：", "上下游：")


def modules() -> list[Path]:
    return [p for p in sorted(APP.rglob("*.py")) if "__pycache__" not in p.parts]


def test_has_modules():
    assert len(modules()) >= 20, "扫描到的模块太少，检查路径"


@pytest.mark.parametrize("path", modules(), ids=lambda p: str(p.relative_to(APP)))
def test_module_header(path: Path):
    """每个模块的首段 docstring 必须能看出职责与上下游。"""
    head = path.read_text(encoding="utf-8")[:800]
    missing = [mark for mark in HEADER_MARKS if mark not in head]
    assert not missing, "%s 缺少 %s" % (path.relative_to(APP), "、".join(missing))


def test_content_dir_is_under_data():
    """数据板块的边界：设定在 data/content，代码里不写死设定。"""
    content = ROOT / "data" / "content"
    assert content.is_dir()
    assert len(list(content.glob("*.json"))) >= 10
    assert not (ROOT / "content").exists(), "content 应该已经在 data 下面了"
    assert (ROOT / "data" / "migrations").is_dir(), "migrations 应该已经在 data 下面了"
