"""档案内容的增删改。

职责：
    按类别校验一条内容、写回对应的 JSON，并在删除前检查引用关系。
为什么需要：
    档案页要能就地加城市、改任务、删教派；如果让接口层各写各的，字段与校验口径
    很快就会散掉，所以「内容长什么样」只在这一个文件里定义。
上下游：
    上游：app/api/archive_edit（HTTP 已解析的 payload）、_store（读缓存）；
    下游：_write（原子写回并重载）、scenarios/missions/world 的交叉引用。
"""


from __future__ import annotations

import copy
import re

from . import _store, _write

# ---------------------------------------------------------------- 类别表

# 每个类别落在哪个文件、哪个容器里。cities 还额外写 city_geo / city_factions，
# traits 的容器是「名字 -> 规格」的对象，这两类在下面单独处理。
KINDS: dict[str, dict[str, str]] = {
    "nations": {"file": "world", "key": "nations", "label": "国家"},
    "sects": {"file": "world", "key": "sects", "label": "教派"},
    "agencies": {"file": "world", "key": "agencies", "label": "国家机构"},
    "figures": {"file": "world", "key": "figures", "label": "人物"},
    "industries": {"file": "world", "key": "industries", "label": "行业"},
    "cities": {"file": "world", "key": "cities", "label": "城市"},
    "lore": {"file": "world", "key": "lore", "label": "世界背景"},
    "events": {"file": "events", "key": "events", "label": "事件"},
    "missions": {"file": "missions", "key": "missions", "label": "任务"},
    "equipment": {"file": "equipment", "key": "equipment", "label": "装备"},
    "traits": {"file": "traits", "key": "traits", "label": "人物特性"},
}

# id 统一成「小写字母开头、只含小写字母/数字/下划线」，方便当文件名、URL 与种子
ID_RE = re.compile(r"^[a-z][a-z0-9_]{1,31}$")

SCOPES = ("general", "mission")
ELEMENTS = ("金", "木", "水", "火", "土")
MISSION_KINDS = ("fixed", "random")


class EditError(ValueError):
    """校验失败。消息本身就是给用户看的中文，接口层直接透传。"""


def kinds() -> list[dict]:
    return [{"key": key, "label": meta["label"]} for key, meta in KINDS.items()]


def count(kind: str) -> int:
    return len(items(kind))


def items(kind: str) -> list[dict]:
    """读出某一类的原始条目（traits 会把名字补回 name 字段）。"""
    meta = _meta(kind)
    doc = _store.load(meta["file"])
    if kind == "traits":
        return [{"name": name, **copy.deepcopy(spec)} for name, spec in doc["traits"].items()]
    return copy.deepcopy(doc[meta["key"]])


def find(kind: str, item_id: str) -> dict | None:
    for item in items(kind):
        if _id_of(kind, item) == item_id:
            return item
    return None


def create(kind: str, payload: dict) -> dict:
    """新增一条，返回写进 JSON 的条目。"""
    meta = _meta(kind)
    doc = copy.deepcopy(_store.load(meta["file"]))
    item_id = _new_id(kind, payload, doc)
    item = _build(kind, payload, item_id, doc, None)

    docs = {meta["file"]: doc}
    if kind == "missions":
        item, scenario_doc = _prepare_scenario(item, _store.load("world"))
        if scenario_doc is not None:
            docs["scenarios"] = scenario_doc

    _validate(kind, item, doc)
    _put(kind, doc, item, None)
    _write.save_many(docs)
    return _public(kind, item)


def update(kind: str, item_id: str, payload: dict) -> dict:
    """按 id 改一条，返回改完的条目。id 本身不可改。"""
    meta = _meta(kind)
    doc = copy.deepcopy(_store.load(meta["file"]))
    existing = _find_in_doc(kind, item_id, doc)
    if existing is None:
        raise EditError("没有这条内容：%s" % item_id)

    item = _build(kind, payload, item_id, doc, existing)

    docs = {meta["file"]: doc}
    if kind == "missions":
        item, scenario_doc = _prepare_scenario(item, _store.load("world"))
        if scenario_doc is not None:
            docs["scenarios"] = scenario_doc

    _validate(kind, item, doc)
    _put(kind, doc, item, existing)
    _write.save_many(docs)
    return _public(kind, item)


def remove(kind: str, item_id: str, extra_refs: list[str] | None = None) -> dict:
    """删一条；被别的内容引用时拒绝，并说清是谁在引用。

    参数：
        extra_refs：内容层看不到的引用（比如数据库里的人物），由接口层查好传进来。
    """
    meta = _meta(kind)
    doc = copy.deepcopy(_store.load(meta["file"]))
    existing = _find_in_doc(kind, item_id, doc)
    if existing is None:
        raise EditError("没有这条内容：%s" % item_id)

    refs = _refs(kind, existing, doc) + [r for r in (extra_refs or []) if r]
    if refs:
        raise EditError("不能删「%s」：%s" % (_title(kind, existing), "；".join(refs)))

    docs = {meta["file"]: doc}
    if kind == "traits":
        doc["traits"].pop(item_id, None)
    else:
        doc[meta["key"]] = [x for x in doc[meta["key"]] if _id_of(kind, x) != item_id]
    if kind == "cities":
        doc.get("city_geo", {}).pop(item_id, None)
        doc.get("city_factions", {}).pop(item_id, None)
    if kind == "missions":
        scenario_doc = _drop_stub_scenario(item_id)
        if scenario_doc is not None:
            docs["scenarios"] = scenario_doc

    _write.save_many(docs)
    return existing


# ---------------------------------------------------------------- 元信息与定位

def _meta(kind: str) -> dict[str, str]:
    if kind not in KINDS:
        raise EditError("没有这一类档案：%s" % kind)
    return KINDS[kind]


def _id_of(kind: str, item: dict) -> str:
    return item["name"] if kind == "traits" else item.get("id", "")


def _title(kind: str, item: dict) -> str:
    if kind == "traits":
        return item["name"]
    if kind == "lore":
        return item.get("title") or item.get("id", "")
    return item.get("name") or item.get("id", "")


def _public(kind: str, item: dict) -> dict:
    """内部表示（traits 带一层 spec）转成对外的扁平条目。"""
    if kind == "traits":
        return {"name": item["name"], **item["spec"]}
    return item


def _find_in_doc(kind: str, item_id: str, doc: dict) -> dict | None:
    if kind == "traits":
        spec = doc["traits"].get(item_id)
        return {"name": item_id, **spec} if spec is not None else None
    for item in doc[KINDS[kind]["key"]]:
        if item.get("id") == item_id:
            return item
    return None


def _new_id(kind: str, payload: dict, doc: dict) -> str:
    if kind == "traits":
        name = _req_str(payload, "name", "特性名", 24)
        if name in doc["traits"]:
            raise EditError("已经有同名特性：%s" % name)
        return name
    item_id = _clean_id(payload.get("id"))
    if _find_in_doc(kind, item_id, doc) is not None:
        raise EditError("已经有同 id 的条目：%s" % item_id)
    return item_id


def _put(kind: str, doc: dict, item: dict, existing: dict | None) -> None:
    """把条目写进文档：新增追加，修改原位替换，保持文件里的顺序。"""
    if kind == "traits":
        doc["traits"][item["name"]] = item["spec"]
        return

    if kind == "cities":
        # 坐标与当地势力在 world.json 里是另外两张表，先摘出来再写回
        geo = [item.pop("lat"), item.pop("lon")]
        factions = item.pop("factions")
        doc.setdefault("city_geo", {})[item["id"]] = geo
        doc.setdefault("city_factions", {})[item["id"]] = factions

    bucket = doc[KINDS[kind]["key"]]
    if existing is None:
        bucket.append(item)
        return
    for index, row in enumerate(bucket):
        if row.get("id") == item["id"]:
            bucket[index] = item
            return


# ---------------------------------------------------------------- 字段读取

def _clean_id(raw) -> str:
    if not isinstance(raw, str) or not ID_RE.match(raw.strip()):
        raise EditError("id 只能用小写字母、数字、下划线，字母开头，2–32 位")
    return raw.strip()


def _req_str(payload: dict, key: str, label: str, maxlen: int = 400) -> str:
    value = payload.get(key)
    if not isinstance(value, str):
        raise EditError("「%s」要填文本" % label)
    value = value.strip()
    if not value:
        raise EditError("「%s」不能为空" % label)
    if len(value) > maxlen:
        raise EditError("「%s」太长（最多 %d 字）" % (label, maxlen))
    return value


def _opt_str(payload: dict, key: str, label: str, maxlen: int = 400) -> str:
    value = payload.get(key)
    if value is None:
        return ""
    if not isinstance(value, str):
        raise EditError("「%s」要填文本" % label)
    value = value.strip()
    if len(value) > maxlen:
        raise EditError("「%s」太长（最多 %d 字）" % (label, maxlen))
    return value


def _number(payload: dict, key: str, label: str, low: float, high: float,
            default=None, integer: bool = False):
    raw = payload.get(key)
    if raw is None or raw == "":
        if default is None:
            raise EditError("「%s」不能为空" % label)
        raw = default
    try:
        value = int(raw) if integer else float(raw)
    except (TypeError, ValueError):
        raise EditError("「%s」要填数字" % label) from None
    if value < low or value > high:
        raise EditError("「%s」要在 %s 到 %s 之间" % (label, low, high))
    return value


def _enum(payload: dict, key: str, label: str, allowed) -> str:
    value = _req_str(payload, key, label, 40)
    if value not in allowed:
        raise EditError("「%s」只能是：%s" % (label, "、".join(str(x) for x in allowed)))
    return value


def _str_list(payload: dict, key: str, label: str, max_items: int = 24,
              maxlen: int = 80, required: bool = False) -> list[str]:
    raw = payload.get(key) or []
    if not isinstance(raw, list):
        raise EditError("「%s」要填列表" % label)
    out: list[str] = []
    for value in raw:
        if not isinstance(value, str):
            raise EditError("「%s」里的每一项都要是文本" % label)
        value = value.strip()
        if not value:
            continue
        if len(value) > maxlen:
            raise EditError("「%s」里有一项太长（最多 %d 字）" % (label, maxlen))
        if value not in out:
            out.append(value)
    if required and not out:
        raise EditError("「%s」至少填一项" % label)
    if len(out) > max_items:
        raise EditError("「%s」最多 %d 项" % (label, max_items))
    return out


def _ref_list(payload: dict, key: str, label: str, valid: set[str],
              required: bool = False, max_items: int = 24) -> list[str]:
    out = _str_list(payload, key, label, max_items=max_items, required=required)
    bad = [value for value in out if value not in valid]
    if bad:
        raise EditError("「%s」里有不存在的项：%s" % (label, "、".join(bad)))
    return out


# ---------------------------------------------------------------- 各类型的组装

def _build(kind: str, payload: dict, item_id: str, doc: dict, existing: dict | None) -> dict:
    """把前端 payload 收成一条干净的内容；未知字段一律不落盘。"""
    if kind == "nations":
        return {
            "id": item_id,
            "name": _req_str(payload, "name", "名称", 20),
            "era": _opt_str(payload, "era", "时代", 40),
            "gov": _opt_str(payload, "gov", "体制", 200),
            "blurb": _opt_str(payload, "blurb", "简介", 1200),
            "stance": _opt_str(payload, "stance", "对祟物的态度", 300),
        }

    if kind == "sects":
        return {
            "id": item_id,
            "name": _req_str(payload, "name", "名称", 20),
            "tradition": _opt_str(payload, "tradition", "路数", 40),
            "doctrine": _opt_str(payload, "doctrine", "宗旨", 300),
            "resource": _opt_str(payload, "resource", "资源", 40),
            "blurb": _opt_str(payload, "blurb", "简介", 1200),
            "relations": _relations(payload, doc, item_id),
        }

    if kind == "agencies":
        return {
            "id": item_id,
            "name": _req_str(payload, "name", "名称", 20),
            "mandate": _opt_str(payload, "mandate", "职权", 60),
            "authority": _opt_str(payload, "authority", "具体权限", 300),
            "blurb": _opt_str(payload, "blurb", "简介", 1200),
            "relation": _opt_str(payload, "relation", "与其他机构的关系", 400),
        }

    if kind == "figures":
        return {
            "id": item_id,
            "name": _req_str(payload, "name", "姓名", 20),
            "title": _opt_str(payload, "title", "身份", 60),
            "org": _opt_str(payload, "org", "所属", 40),
            "element": _enum(payload, "element", "本命五行", ELEMENTS),
            "blurb": _opt_str(payload, "blurb", "简介", 1200),
            "hook": _opt_str(payload, "hook", "钩子", 300),
        }

    if kind == "industries":
        return {
            "id": item_id,
            "name": _req_str(payload, "name", "名称", 20),
            "scale": _number(payload, "scale", "规模", 1, 5, default=3, integer=True),
            "risk": _number(payload, "risk", "风险", 1, 5, default=3, integer=True),
            "blurb": _opt_str(payload, "blurb", "说明", 600),
        }

    if kind == "cities":
        tiers = {tier["key"] for tier in doc["tiers"]}
        nations = {nation["id"] for nation in doc["nations"]}
        industries = {industry["id"] for industry in doc["industries"]}
        return {
            "id": item_id,
            "name": _req_str(payload, "name", "城市名", 12),
            "tier": _enum(payload, "tier", "城市等级", tiers),
            "nation": _enum(payload, "nation", "所属国家", nations),
            "pop": _number(payload, "pop", "人口（万）", 1, 5000, default=100, integer=True),
            "industries": _ref_list(payload, "industries", "行业", industries, required=True),
            "landmarks": _str_list(payload, "landmarks", "地标", maxlen=40),
            "blurb": _opt_str(payload, "blurb", "简介", 1200),
            # missions 是早期字段，档案页不管它，改的时候原样留着
            "missions": list((existing or {}).get("missions") or []),
            "lat": _number(payload, "lat", "纬度", -90, 90, default=35.0),
            "lon": _number(payload, "lon", "经度", -180, 180, default=105.0),
            "factions": _factions(payload),
        }

    if kind == "lore":
        return {
            "id": item_id,
            "title": _req_str(payload, "title", "标题", 40),
            "body": _opt_str(payload, "body", "正文", 4000),
        }

    if kind == "events":
        missions = {mission["id"] for mission in _store.load("missions")["missions"]}
        traits = set(_store.load("traits")["traits"])
        industries = {industry["id"] for industry in _store.load("world")["industries"]}
        scope = _enum(payload, "scope", "适用范围", SCOPES)
        return {
            "id": item_id,
            "name": _req_str(payload, "name", "事件名", 30),
            "grade": _number(payload, "grade", "等级", 1, 4, default=3, integer=True),
            "scope": scope,
            "missions": _ref_list(payload, "missions", "限定任务", missions) if scope == "mission" else [],
            "industries": _ref_list(payload, "industries", "行业", industries),
            "text": _opt_str(payload, "text", "背景", 800),
            "hook": _opt_str(payload, "hook", "钩子", 400),
            "traits": _ref_list(payload, "traits", "赋予特性", traits),
            "weight": _number(payload, "weight", "权重", 1, 100, default=10, integer=True),
        }

    if kind == "missions":
        cities = {city["id"] for city in _store.load("world")["cities"]}
        mission_kind = _opt_str(payload, "kind", "任务类型", 20) or "fixed"
        if mission_kind not in MISSION_KINDS:
            raise EditError("「任务类型」只能是：%s" % "、".join(MISSION_KINDS))
        return {
            "id": item_id,
            "name": _req_str(payload, "name", "任务名", 30),
            "tier": _number(payload, "tier", "等级", 1, 4, default=2, integer=True),
            "kind": mission_kind,
            "cities": _ref_list(payload, "cities", "发案城市", cities, required=True),
            "scenario_id": _opt_str(payload, "scenario_id", "剧本", 32),
            "blurb": _opt_str(payload, "blurb", "简介", 800),
        }

    if kind == "equipment":
        return {
            "id": item_id,
            "name": _req_str(payload, "name", "装备名", 20),
            "kind": _opt_str(payload, "kind", "类型", 20) or "法器",
            "grade": _number(payload, "grade", "品级", 1, 4, default=3, integer=True),
            "price": _number(payload, "price", "功德价", 0, 99999, default=0, integer=True),
            "effect": _opt_str(payload, "effect", "效果", 300),
            "desc": _opt_str(payload, "desc", "描述", 800),
        }

    if kind == "traits":
        return {
            "name": item_id,
            "spec": {
                "tier": _number(payload, "tier", "品级", 1, 4, default=3, integer=True),
                "desc": _opt_str(payload, "desc", "描述", 300),
                "effect": _effects(payload),
            },
        }

    raise EditError("没有这一类档案：%s" % kind)


def _relations(payload: dict, doc: dict, self_id: str) -> dict[str, str]:
    raw = payload.get("relations") or {}
    if not isinstance(raw, dict):
        raise EditError("「关系」要是「对象 id → 关系词」的形式")
    targets = (
        {sect["id"] for sect in doc["sects"]}
        | {nation["id"] for nation in doc["nations"]}
        | {agency["id"] for agency in doc["agencies"]}
    )
    out: dict[str, str] = {}
    for key, value in raw.items():
        key = str(key).strip()
        if not key:
            continue
        if key == self_id:
            raise EditError("关系里不能写自己")
        if key not in targets:
            raise EditError("关系对象不存在：%s" % key)
        text = str(value or "").strip()
        if text:
            out[key] = text
    return out


def _effects(payload: dict) -> dict[str, int]:
    raw = payload.get("effect") or {}
    if not isinstance(raw, dict):
        raise EditError("「效果」要是「属性 → 数值」的形式")
    out: dict[str, int] = {}
    for key, value in raw.items():
        key = str(key).strip()
        if not key:
            continue
        try:
            number = int(value)
        except (TypeError, ValueError):
            raise EditError("效果「%s」要填整数" % key) from None
        if number:
            out[key] = number
    return out


def _factions(payload: dict) -> list[dict]:
    raw = payload.get("factions") or []
    if not isinstance(raw, list):
        raise EditError("「当地势力」要是列表")
    out = []
    for row in raw:
        if not isinstance(row, dict):
            raise EditError("「当地势力」里每一条都要是对象")
        name = _req_str(row, "name", "势力名称", 40)
        out.append({
            "name": name,
            "kind": _opt_str(row, "kind", "势力类型", 20) or "其他",
            "note": _opt_str(row, "note", "势力说明", 120),
        })
    return out


# ---------------------------------------------------------------- 交叉校验

def _validate(kind: str, item: dict, doc: dict) -> None:
    """跨字段、跨文件的规则。字段级的检查已经在 _build 里做过了。"""
    if kind == "sects":
        for target in item["relations"]:
            if target == item["id"]:
                raise EditError("关系里不能写自己")

    if kind == "events":
        if item["grade"] <= 2 and item["scope"] != "mission":
            raise EditError("甲、乙级事件必须挂在限定任务上（适用范围选「限定任务」）")
        if item["scope"] == "mission" and not item["missions"]:
            raise EditError("限定任务事件至少要挂一个任务")

    if kind == "missions":
        if not item["cities"]:
            raise EditError("任务至少要有一个发案城市")


def _refs(kind: str, item: dict, doc: dict) -> list[str]:
    """删之前看看谁还在用它；返回人类可读的理由。"""
    item_id = _id_of(kind, item)
    refs: list[str] = []

    if kind == "cities":
        hits = [m["name"] for m in _store.load("missions")["missions"]
                if item_id in m.get("cities", [])]
        if hits:
            refs.append("%d 个任务把它列为发案城市：%s" % (len(hits), "、".join(hits[:3])))

    if kind == "nations":
        hits = [c["name"] for c in doc["cities"] if c.get("nation") == item_id]
        if hits:
            refs.append("%d 座城市属于它：%s" % (len(hits), "、".join(hits[:3])))

    if kind == "industries":
        cities = [c["name"] for c in doc["cities"] if item_id in c.get("industries", [])]
        events = [e["name"] for e in _store.load("events")["events"]
                  if item_id in e.get("industries", [])]
        if cities:
            refs.append("%d 座城市有这个行业：%s" % (len(cities), "、".join(cities[:3])))
        if events:
            refs.append("%d 条事件用这个行业：%s" % (len(events), "、".join(events[:3])))

    if kind == "traits":
        hits = [e["name"] for e in _store.load("events")["events"]
                if item_id in e.get("traits", [])]
        if hits:
            refs.append("%d 条事件会赋予它：%s" % (len(hits), "、".join(hits[:3])))

    if kind == "missions":
        hits = [e["name"] for e in _store.load("events")["events"]
                if item_id in e.get("missions", [])]
        if hits:
            refs.append("%d 条事件挂在它下面：%s" % (len(hits), "、".join(hits[:3])))

    return refs


# ---------------------------------------------------------------- 任务的占位剧本

def _prepare_scenario(item: dict, doc: dict) -> tuple[dict, dict | None]:
    """任务必须有剧本才能开局：没填就顺手生成一个能跑的占位剧本。

    参数：
        item：已经组装好的任务；scenario_id 可能为空。
        doc：world 文档（用来取城市名）。
    为什么需要：
        只让用户填一个已存在的剧本 id，等于「想加任务得先手改 JSON」，把编辑条路堵死了一半。
    输出：
        (补好 scenario_id 的任务, 需要一并写回 scenarios.json 的文档或 None)。
    """
    scenario_doc = None
    if item["scenario_id"]:
        exists = {s["id"] for s in _store.load("scenarios")["scenarios"]}
        if item["scenario_id"] not in exists:
            raise EditError("剧本不存在：%s" % item["scenario_id"])
        return item, None

    scenario_doc = copy.deepcopy(_store.load("scenarios"))
    scenario_id = item["id"]
    if scenario_id not in {s["id"] for s in scenario_doc["scenarios"]}:
        scenario_doc["scenarios"].append(_stub_scenario(item, doc))
    item["scenario_id"] = scenario_id
    return item, scenario_doc


def _stub_scenario(item: dict, doc: dict) -> dict:
    """给新任务生成一个最小可玩剧本：勘查 → 抉择 → 结案。"""
    name = item["name"]
    city = next((c["name"] for c in doc["cities"] if c["id"] in item["cities"]), "现场")
    return {
        "id": item["id"],
        "code": item["id"].upper()[:8],
        "name": name,
        "brief": "创建任务时自动生成的占位剧本，可直接开局；想写得细就改 content/scenarios.json。",
        "place": city,
        "start_corruption": 8,
        "scenes": [
            {
                "id": "s1",
                "kind": "investigate",
                "name": "现场勘查：%s" % name,
                "place": city,
                "text": item.get("blurb") or "案子刚接进来，现场还封着。",
                "options": [
                    {
                        "id": "a", "label": "先看现场留下了什么", "skill": "investigate",
                        "success": "你在现场找到了一处不对劲的地方。",
                        "fail": "现场被人动过，线索断了。",
                        "clue": "%s：现场有异" % name,
                    },
                    {
                        "id": "b", "label": "找附近的人问一问", "skill": "persuade",
                        "success": "有人愿意开口，但只说了半句。",
                        "fail": "没人愿意说。",
                        "clue": "%s：有人知情" % name,
                    },
                ],
            },
            {
                "id": "s2",
                "kind": "choice",
                "name": "抉择：这桩案子怎么收",
                "place": city,
                "text": "线索够了。接下来怎么做，决定这桩因果怎么算。",
                "choices": [
                    {
                        "id": "purify", "label": "按规矩了结，该超度的超度",
                        "text": "你把该办的仪式办完，把该说的话说完。",
                        "merit": 6, "corruption": -4, "karma": "善",
                    },
                    {
                        "id": "burn", "label": "断根，省得夜长梦多",
                        "text": "你处理得很干净，干净到没人再提起。",
                        "merit": -3, "corruption": 3, "karma": "阴债",
                    },
                ],
            },
            {
                "id": "s3",
                "kind": "ending",
                "name": "结案",
                "place": "归卷",
                "text": "案子结了。",
            },
        ],
        "endings": {
            "good": "案子了了。这座城市照常运转，只是少了一桩旧账。",
            "neutral": "案子结了，档案归档。你在报告里写「已处置」。",
            "bad": "案子结了，但根没断。它会在别的地方换个名字再长出来。",
        },
        "auto": True,
    }


def _drop_stub_scenario(mission_id: str) -> dict | None:
    """删任务时把它自动生成的占位剧本一起删掉；手写的剧本不动。"""
    scenarios = _store.load("scenarios")["scenarios"]
    stub = next((s for s in scenarios if s["id"] == mission_id and s.get("auto")), None)
    if stub is None:
        return None
    doc = copy.deepcopy(_store.load("scenarios"))
    doc["scenarios"] = [s for s in doc["scenarios"] if s["id"] != mission_id]
    return doc
