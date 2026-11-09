"""KP 随机事件。

职责：
    按阴浊分层掷事件表，给每个行动加不确定性。
为什么需要：
    没有它，跑团就退化成数值对撞；有它，同一剧本每局都不同。
上下游：
    上游：dice；下游：session。
"""


from __future__ import annotations

from .dice import Roller

# 事件表。权重按阴浊分层：low / mid / high
EVENTS = [
    {
        "id": "quiet",
        "name": "无异常",
        "severity": "info",
        "weights": {"low": 46, "mid": 34, "high": 22},
        "texts": [
            "这一带很安静。安静得能听见自己的心跳，和楼上某个房间的日光灯在响。",
            "什么都没有发生。你把这句话记在心里，因为通常下一步就该发生点什么了。",
            "阴气停在一个位置不动，像在等你先动。",
        ],
        "effect": {},
    },
    {
        "id": "cold",
        "name": "环境异变",
        "severity": "warn",
        "weights": {"low": 16, "mid": 18, "high": 16},
        "texts": [
            "气温突然掉了一截，你呼出的气是白的。手机屏幕上的温度显示 26 度。",
            "灯管开始频闪，一秒三次，和你的心跳同步。",
            "所有能反光的东西同时暗了一下，包括你的指甲。",
            "空气里出现一股烧焦的头发味，可这里没有人。",
        ],
        "effect": {"corruption": 1},
    },
    {
        "id": "omen",
        "name": "预兆",
        "severity": "info",
        "weights": {"low": 12, "mid": 14, "high": 14},
        "texts": [
            "你在余光里看见一个不该出现在这里的影子，转头时它已经顺着墙缝缩回去了。",
            "有个声音在你耳边数数，数到十三就停了。",
            "墙皮渗出一小片水渍，形状像一只按在墙上的手。",
        ],
        "effect": {"clue": "有什么东西在数着时间"},
    },
    {
        "id": "clue",
        "name": "旁证",
        "severity": "info",
        "weights": {"low": 10, "mid": 10, "high": 8},
        "texts": [
            "一个扫地的阿姨多看了你一眼，欲言又止。你追出去两步，她只留下一句：「这楼里，镜子别照。」",
            "你在楼道角落发现一张被踩烂的便签，上面写着「十三下」。",
            "手机相册里多了一张你没拍过的照片：一间空教室，黑板上有字。",
        ],
        "effect": {"clue": "旁人也在躲一样东西"},
    },
    {
        "id": "corrupt",
        "name": "阴浊上涌",
        "severity": "warn",
        "weights": {"low": 6, "mid": 12, "high": 20},
        "texts": [
            "你感到一股凉意从脚踝爬上来，像有谁在你身后极慢地呼吸。",
            "视野边缘开始发黑，像老电影的胶片烧边。",
            "你听见很多人在同时小声说话，但房间里只有你一个。",
        ],
        "effect": {"corruption": 3, "san": "1d3"},
    },
    {
        "id": "bystander",
        "name": "不速之客",
        "severity": "warn",
        "weights": {"low": 8, "mid": 8, "high": 8},
        "texts": [
            "一个加班的职员端着保温杯路过，好奇地往这边看了一眼。你希望他只是路过。",
            "保安举着手电上来查楼层，手电光照过来的那一瞬，你看清他身后多了一个影子。",
            "一个外卖员走错了楼层，站在门口问你：「1802 是这儿吗？」这栋楼只有十七层。",
        ],
        "effect": {"corruption": 2, "san": "1d2"},
    },
    {
        "id": "pressure",
        "name": "祟物添力",
        "severity": "error",
        "weights": {"low": 2, "mid": 8, "high": 14},
        "texts": [
            "它变强了。你能感觉到那种变化，像水面上涨了一寸。",
            "它不再躲了，开始主动往你这边挪。",
            "它的轮廓清晰了一分，你甚至看清了「脸」的构成。",
        ],
        "effect": {"enemy_boost": 1},
    },
    {
        "id": "karma",
        "name": "因果回响",
        "severity": "info",
        "weights": {"low": 2, "mid": 6, "high": 8},
        "texts": [
            "你想起上一个案子里那个没救下来的人。他当时也是这个表情。",
            "某种熟悉的感觉浮上来——你确信自己不是第一次见到这面镜子。",
        ],
        "effect": {"san": "1d2"},
    },
]

EVENT_BY_ID = {e["id"]: e for e in EVENTS}

# 场景之间的过场旁白
TRANSITIONS = [
    "你退出来的时候，身后传来一声很轻的「咔」，像是有什么东西重新摆正了。",
    "走出这栋楼，外面的天已经黑了。你才发现自己在这里待了四个小时。",
    "手机上有三个未接来电，都是所里打的。你暂时不想回。",
    "你把手上的符灰搓掉，指尖还是凉的。",
]


def tier(corruption: int) -> str:
    if corruption >= 60:
        return "high"
    if corruption >= 30:
        return "mid"
    return "low"


def trigger_chance(corruption: int) -> float:
    """要不要掷事件。阴浊越高越容易来事。"""
    return min(0.85, 0.35 + corruption / 160.0)


def event(roller: Roller, corruption: int, in_combat: bool = False) -> dict | None:
    """掷一次 KP 事件。返回 None 表示这回合风平浪静。"""
    if not roller.chance(trigger_chance(corruption)):
        return None

    layer = tier(corruption)
    pool = []
    for item in EVENTS:
        if item["id"] == "pressure" and not in_combat:
            continue
        pool.append((item, item["weights"][layer]))

    picked = roller.weighted([(i, w) for i, w in pool], "KP 事件")
    if picked["id"] == "quiet":
        return None

    return {
        "id": picked["id"],
        "name": picked["name"],
        "severity": picked["severity"],
        "text": roller.choice(picked["texts"], "KP 事件描述"),
        "effect": dict(picked["effect"]),
    }


def transition(roller: Roller) -> str:
    return roller.choice(TRANSITIONS, "过场")


def stuck_hint(roller: Roller, clues: list[str]) -> str:
    """卡住时给一句钩子。"""
    base = [
        "你回到最初那间屋子。这次你注意到，地上有一道很浅的拖痕，通向窗边。",
        "你重新看了一遍所有记录。有一个时间对不上——不是死亡时间，是报案时间。",
        "你决定赌一把，把手按在镜面上。它温的，像一个人的皮肤。",
    ]
    if clues:
        return base[len(clues) % len(base)]
    return "你什么都没找到，但你知道，再待下去它会先找到你。"
