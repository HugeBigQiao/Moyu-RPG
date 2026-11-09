"""世界底座：国家、教派、机构、人物、行业、城市分级。

设计原则：
  · 城市有等级（特级 → 四级），等级决定人口/资源，也决定「这个城市能捞出多复杂的人物」；
  · 行业是平等的，地产不特殊 —— 只是它规模大，占的坑多；
  · 教派、机构、人物都是可检索的数据，不是散文。

所有 id 都是稳定的英文短名，方便事件/任务/人物互相引用。
"""

from __future__ import annotations

# ---------------------------------------------------------------- 国家

NATIONS = [
    {
        "id": "xia",
        "name": "夏",
        "era": "当代",
        "gov": "中央集权的现代国家，地方道门与官府共治",
        "blurb": "玄门不为国教，但国事必问玄门。夏的制度是「外儒内道」："
                 "明面上是部委、法院、公安，暗线是授箓、备案、评级。"
                 "修行者在法律上是公民，在册籍上是资源。",
        "stance": "克制而务实：祟物要处置，但不能惊动民生。",
    },
    {
        "id": "beiling",
        "name": "北岭",
        "era": "当代",
        "gov": "军人执政的联邦，崇拜体修与兵家",
        "blurb": "北岭没有玄真司，只有「镇边营」。他们不超度，只剿灭，"
                 "所以他们的祟物越剿越多，边防线也越修越长。",
        "stance": "以力证道，认为夏的「超度」是软弱。",
    },
    {
        "id": "donghai",
        "name": "东海",
        "era": "当代",
        "gov": "群岛商业联邦，城邦联盟",
        "blurb": "东海不产符，只倒卖符。全世界的阴器、禁符、野神名录都在这里过一手。"
                 "玄真司的违禁物九成是从东海进来的。",
        "stance": "只认买卖，不问因果。",
    },
]

# ---------------------------------------------------------------- 教派

SECTS = [
    {
        "id": "zhengyi",
        "name": "正一",
        "tradition": "符箓授箓",
        "doctrine": "箓职即权柄。符不是画出来的，是「授」下来的。",
        "resource": "符力",
        "blurb": "与朝廷合作最久的一派，玄真司半数以上的持令人出自正一。"
                 "他们最讲规矩，也最擅长用规矩办事。",
        "relations": {"quanzhen": "看不起", "maoshan": "客气", "lvshan": "嫌弃", "baiyun": "敌对"},
    },
    {
        "id": "quanzhen",
        "name": "全真",
        "tradition": "内丹清修",
        "doctrine": "不求外物，只炼一身。祟物是心病，心病须心药。",
        "resource": "灵力",
        "blurb": "不出山门，不接案。可一旦出手，往往是「一个人走进去，一个人走出来」的场面。",
        "relations": {"zhengyi": "疏远", "qingcheng": "同源", "baiyun": "不理"},
    },
    {
        "id": "maoshan",
        "name": "茅山",
        "tradition": "符咒驱邪",
        "doctrine": "有鬼就抓，有邪就镇，不讲究好看。",
        "resource": "符力 / 气血",
        "blurb": "民间口碑最好的一派，也是最脏手的一派。他们的法器上有真的血。",
        "relations": {"zhengyi": "合作", "lvshan": "互认", "baiyun": "死仇"},
    },
    {
        "id": "lvshan",
        "name": "闾山",
        "tradition": "法教 / 出马",
        "doctrine": "神不上身，人不成事。",
        "resource": "灵力 / 香火",
        "blurb": "半教半俗，办丧事、看风水、请野神。官方说他们「不登大雅」，"
                 "可乡下出事，第一个到的总是他们。",
        "relations": {"zhengyi": "被嫌弃", "maoshan": "互认"},
    },
    {
        "id": "qingcheng",
        "name": "青城",
        "tradition": "剑修丹道",
        "doctrine": "一剑破万法。剑不利，是心不利。",
        "resource": "剑意",
        "blurb": "人最少的一派，也是最贵的一派。请青城出手，按剑算钱。",
        "relations": {"quanzhen": "同源", "beiling": "来往"},
    },
    {
        "id": "baiyun",
        "name": "白云教",
        "tradition": "野神崇拜（新兴）",
        "doctrine": "神是人抬起来的。抬得够高，神就真的在。",
        "resource": "香火",
        "blurb": "二十年里起来的教派，信众百万，被礼制院列为「待勘」。"
                 "它确实能「造神」，而造出来的东西不听话。",
        "relations": {"zhengyi": "敌对", "maoshan": "死仇", "lvshan": "暧昧"},
    },
]

# ---------------------------------------------------------------- 国家机构

AGENCIES = [
    {
        "id": "xuanzhen",
        "name": "玄真司",
        "mandate": "祟物处置",
        "authority": "接案、评估、处置、归档",
        "blurb": "玩家的单位。有编制、有考核、有绩效。它的立场不是正义，是「了结」——"
                 "把一桩因果处理干净，比把一只祟物打死更重要。",
        "relation": "与天监司互相看不顺眼，与靖安司是长期搭子。",
    },
    {
        "id": "tianjian",
        "name": "天监司",
        "mandate": "观测、评级、研究",
        "authority": "阴浊监测网、祟物分级、资质认证",
        "blurb": "把祟物变成数据的一群人。他们给每个案子定级、给每只祟物建档，"
                 "然后把这些数字卖给需要的人。",
        "relation": "掌握评级权，玄真司的奖金高低看他们脸色。",
    },
    {
        "id": "jingan",
        "name": "靖安司",
        "mandate": "治安与刑事，涉祟部分",
        "authority": "现场封锁、证人保护、枪支许可",
        "blurb": "警察里的特殊部门。他们不信鬼神，但会给你开现场通行证，"
                 "条件是你别在报告里写「祟」字。",
        "relation": "务实合作，互不追问。",
    },
    {
        "id": "lizhi",
        "name": "礼制院",
        "mandate": "教派登记与授箓核准",
        "authority": "箓职备案、教派许可、法器管制",
        "blurb": "最像官僚的一个机构，却握着最要紧的东西：谁有资格请神。"
                 "他们批得慢，慢得有道理——每一张箓都是一个可以请下来的东西。",
        "relation": "卡着所有人的脖子，包括玄真司。",
    },
]

# ---------------------------------------------------------------- 重要人物

FIGURES = [
    {
        "id": "shen_bai",
        "name": "沈白",
        "title": "玄真司司主",
        "org": "玄真司",
        "element": "金",
        "blurb": "六十七岁，一手把玄真司从「道门联络处」做成实权部门。"
                 "他办案从不带法器，只带一本册子，记着每个案子里死掉的人名。",
        "hook": "他不问你打死了什么，只问你「了结了吗」。",
    },
    {
        "id": "lu_yao",
        "name": "陆瑶",
        "title": "天监司首席评级官",
        "org": "天监司",
        "element": "水",
        "blurb": "三十四岁，把阴浊监测网做成了一张覆盖全国的图。"
                 "她相信所有祟物都能被量化，包括她自己。",
        "hook": "她给你定的级，就是你这趟活儿的价钱。",
    },
    {
        "id": "zhou_zhen",
        "name": "周稹",
        "title": "茅山第七十二代掌门",
        "org": "茅山",
        "element": "火",
        "blurb": "手上有三道旧疤，都是自己划的。他说祖师爷的规矩是「血镇」，"
                 "血不够，符就是纸。",
        "hook": "他肯出手，但从不问你要救谁。",
    },
    {
        "id": "he_qing",
        "name": "何清",
        "title": "白云教教主",
        "org": "白云教",
        "element": "煞",
        "blurb": "四十出头，笑起来像个中学老师。他管自己造出来的东西叫「孩子」，"
                 "并且真心觉得那是慈悲。",
        "hook": "他不认为自己在害人，这是最难办的地方。",
    },
    {
        "id": "fang_qi",
        "name": "方旗",
        "title": "靖安司涉祟组组长",
        "org": "靖安司",
        "element": "土",
        "blurb": "刑警出身，因为一桩案子撞见了不该看的东西，被调进了这个组。"
                 "他在报告里永远写「意外死亡」。",
        "hook": "他能给你十分钟的现场，多一分钟都算违纪。",
    },
    {
        "id": "an_ruo",
        "name": "安若",
        "title": "《南屿晚报》记者",
        "org": "传媒",
        "element": "木",
        "blurb": "她拍到了一张不该拍到的照片，从此开始自己查。"
                 "她不知道玄真司的存在，但她已经在写它了。",
        "hook": "她手里的东西既可能是线索，也可能是引爆点。",
    },
    {
        "id": "gu_wan",
        "name": "顾宛",
        "title": "散修，闾山外门",
        "org": "民间",
        "element": "土",
        "blurb": "在寿材街扎了三十年纸人。她说纸人比人讲信用——"
                 "让替谁就替谁，让什么时候走就什么时候走。",
        "hook": "她不出手，除非你肯坐下来听她讲完一个故事。",
    },
    {
        "id": "cui_heng",
        "name": "崔衡",
        "title": "澧州城投董事长",
        "org": "地产 / 城投",
        "element": "金",
        "blurb": "推过七个村，填过两口井，迁过一座庙。他从不觉得自己在造孽，"
                 "他说他在「让地方变好」。",
        "hook": "他的项目书上，每一页都标着「已验收」。",
    },
]

# ---------------------------------------------------------------- 行业

INDUSTRIES = [
    {"id": "realestate", "name": "地产开发", "scale": 5, "risk": 5,
     "blurb": "迁村、拆迁、填河、改庙。规模最大，所以看起来最多，其实只是坑多。"},
    {"id": "finance", "name": "金融", "scale": 5, "risk": 4,
     "blurb": "钱流得快的地方，欲念也流得快。跳楼是最常见的收尾方式。"},
    {"id": "medical", "name": "医疗", "scale": 4, "risk": 5,
     "blurb": "生死交界处。病房、太平间、心理咨询室，都是祟物的温床。"},
    {"id": "education", "name": "教育", "scale": 4, "risk": 4,
     "blurb": "压力最大、年纪最小。校园里的祟物往往由集体情绪养大。"},
    {"id": "funeral", "name": "殡葬", "scale": 2, "risk": 5,
     "blurb": "规模不大，但没它不行。纸扎、寿材、抬棺、做法事，一条街全包。"},
    {"id": "internet", "name": "互联网", "scale": 4, "risk": 4,
     "blurb": "加班、算法、猝死。机房是新的祠堂，出风口是新的烟道。"},
    {"id": "manufacture", "name": "制造业", "scale": 4, "risk": 3,
     "blurb": "流水线上的手，夜班的灯。工业区的祟物通常很安静，直到停工那天。"},
    {"id": "logistics", "name": "物流运输", "scale": 4, "risk": 3,
     "blurb": "货车司机、夜班网约车、跨省干线。路上死的人，路上还会出现。"},
    {"id": "energy", "name": "能源矿业", "scale": 3, "risk": 5,
     "blurb": "往地下挖。挖到什么，往往不归你说了算。"},
    {"id": "media", "name": "传媒娱乐", "scale": 3, "risk": 2,
     "blurb": "镜头会拍到不该拍的东西，而人们更愿意相信那是特效。"},
    {"id": "construction", "name": "建筑业", "scale": 4, "risk": 4,
     "blurb": "工地永远出事。有些是事故，有些是被埋进去的东西自己动了。"},
    {"id": "agri", "name": "农业", "scale": 3, "risk": 3,
     "blurb": "靠天吃饭，也靠地吃饭。旱了、涝了、虫灾了，老办法就都回来了。"},
    {"id": "religious", "name": "宗教场所", "scale": 2, "risk": 4,
     "blurb": "庙、观、堂、祠。香火是资源，也是食物。"},
    {"id": "government", "name": "政务", "scale": 4, "risk": 2,
     "blurb": "文件、审批、验收。一纸批文能镇住一只祟物，也能放出一只。"},
    {"id": "police", "name": "军警", "scale": 3, "risk": 4,
     "blurb": "唯一合法带枪的普通人。他们最接近真相，也最不被允许说。"},
    {"id": "research", "name": "科研", "scale": 3, "risk": 3,
     "blurb": "把祟物做成课题的人。数据比人命干净，所以他们更喜欢数据。"},
]

# ---------------------------------------------------------------- 城市分级

CITY_TIERS = [
    {"key": "t0", "name": "特级", "pop": "2000 万以上", "max_events": 10,
     "blurb": "首都级。什么事都有，什么人都藏得住。"},
    {"key": "t1", "name": "一级", "pop": "800–2000 万", "max_events": 8,
     "blurb": "大区中心。老城与新城撕成两半，祟物两边都住。"},
    {"key": "t2", "name": "二级", "pop": "300–800 万", "max_events": 6,
     "blurb": "地级市。有产业、有旧账，一套班子管到底。"},
    {"key": "t3", "name": "三级", "pop": "80–300 万", "max_events": 4,
     "blurb": "县城。人情比规矩大，出了事第一反应是「别声张」。"},
    {"key": "t4", "name": "四级", "pop": "20–80 万", "max_events": 2,
     "blurb": "镇与乡。一个风水先生能管半个镇，剩下的靠祠堂。"},
]

TIER_BY_KEY = {t["key"]: t for t in CITY_TIERS}


def tier_rank(key: str) -> int:
    """越小越大。"""
    for i, t in enumerate(CITY_TIERS):
        if t["key"] == key:
            return i
    return len(CITY_TIERS) - 1


# ---------------------------------------------------------------- 城市

CITIES = [
    {
        "id": "linjing",
        "name": "临京",
        "tier": "t0",
        "nation": "xia",
        "pop": 2400,
        "industries": ["government", "finance", "media", "research", "medical"],
        "landmarks": ["天监司总部", "礼制院", "旧城墙遗址", "西站"],
        "blurb": "夏的首都。所有规矩都从这里发出去，所有例外也都在这里被默许。"
                 "在临京，一只祟物能不能被立案，取决于它死在哪一环上。",
        "missions": [],
    },
    {
        "id": "nanyu",
        "name": "南屿",
        "tier": "t1",
        "nation": "xia",
        "pop": 1100,
        "industries": ["realestate", "internet", "education", "medical", "funeral"],
        "landmarks": ["镜湖片区", "老城厢寿材街", "城西高架 K12", "断流水库"],
        "blurb": "南方沿江的省会，老城与新区分得很开。祟物集中在两处：太新的地方（空），"
                 "太旧的地方（等）。玩家的大本营。",
        "missions": ["mirror", "office", "paper", "nightrun", "drought"],
    },
    {
        "id": "lijiang",
        "name": "澧州",
        "tier": "t2",
        "nation": "xia",
        "pop": 520,
        "industries": ["construction", "energy", "logistics", "government"],
        "landmarks": ["城投大厦", "澧河大桥", "老工业区"],
        "blurb": "一座被城投公司推着往前跑的城市。项目书上每页都写着「已验收」。",
        "missions": [],
    },
    {
        "id": "yunjin",
        "name": "云津",
        "tier": "t1",
        "nation": "xia",
        "pop": 900,
        "industries": ["manufacture", "logistics", "finance"],
        "landmarks": ["云津港", "机装厂", "外环立交"],
        "blurb": "工业与港口撑起来的城市，夜里能听见集装箱落地的声音。"
                 "这里的人习惯用「排班」解释一切异常。",
        "missions": [],
    },
    {
        "id": "baishi",
        "name": "白石",
        "tier": "t3",
        "nation": "xia",
        "pop": 140,
        "industries": ["agri", "religious", "funeral"],
        "landmarks": ["白石祠", "老石场", "县中"],
        "blurb": "县城。人情比规矩大。出了事，第一个想法是「别声张」，第二个是「找顾家老太太」。",
        "missions": [],
    },
    {
        "id": "qingxi",
        "name": "青溪",
        "tier": "t3",
        "nation": "xia",
        "pop": 110,
        "industries": ["agri", "energy", "medical"],
        "landmarks": ["青溪水库", "镇卫生院"],
        "blurb": "水库上下游的两个镇，一个富一个穷。穷的那个在水底下。",
        "missions": [],
    },
    {
        "id": "tiedu",
        "name": "铁壁",
        "tier": "t1",
        "nation": "beiling",
        "pop": 760,
        "industries": ["police", "manufacture", "energy"],
        "landmarks": ["镇边营", "北防线", "炼铁城"],
        "blurb": "北岭的军事重镇。这里的祟物不进民宅，只进兵营——"
                 "因为它们是被剿灭的同类堆出来的。",
        "missions": [],
    },
    {
        "id": "chaoyu",
        "name": "潮屿",
        "tier": "t2",
        "nation": "donghai",
        "pop": 480,
        "industries": ["finance", "logistics", "media"],
        "landmarks": ["旧货码头", "符市", "望潮塔"],
        "blurb": "群岛联邦的主岛。全世界来路不明的法器都在「符市」过一手。"
                 "这里没人问因果，只问价钱。",
        "missions": [],
    },
    {
        "id": "heiyan",
        "name": "黑岩",
        "tier": "t4",
        "nation": "xia",
        "pop": 38,
        "industries": ["energy", "agri"],
        "landmarks": ["黑岩矿", "矿工宿舍"],
        "blurb": "矿镇。往地下挖了两百年，挖出来的东西比矿多。",
        "missions": [],
    },
    {
        "id": "banqiao",
        "name": "板桥",
        "tier": "t4",
        "nation": "xia",
        "pop": 26,
        "industries": ["agri", "funeral"],
        "landmarks": ["板桥集", "义庄"],
        "blurb": "一个集、一座义庄、一条过路的省道。出事没人报，"
                 "报了也没人愿意来。",
        "missions": [],
    },
]

CITY_BY_ID = {c["id"]: c for c in CITIES}
INDUSTRY_BY_ID = {i["id"]: i for i in INDUSTRIES}
NATION_BY_ID = {n["id"]: n for n in NATIONS}
SECT_BY_ID = {s["id"]: s for s in SECTS}
AGENCY_BY_ID = {a["id"]: a for a in AGENCIES}
FIGURE_BY_ID = {f["id"]: f for f in FIGURES}


def cities_by_tier(tier: str) -> list[dict]:
    return [c for c in CITIES if c["tier"] == tier]


def max_events(city_id: str) -> int:
    city = CITY_BY_ID.get(city_id)
    if not city:
        return 2
    return int(TIER_BY_KEY[city["tier"]]["max_events"])


def industry_name(industry_id: str) -> str:
    return INDUSTRY_BY_ID.get(industry_id, {}).get("name", industry_id)

# ---------------------------------------------------------------- 地图坐标
# 虚构城市对到真实经纬度上，方便直接画在中国地图上。
CITY_GEO = {
    "linjing": (39.90, 116.40),   # 首都，华北
    "nanyu": (23.13, 113.26),     # 南方沿江省会
    "yunjin": (39.08, 117.20),    # 北方港口
    "tiedu": (45.80, 126.53),     # 北岭边镇
    "lijiang": (30.57, 104.07),   # 西南内陆
    "chaoyu": (26.08, 119.30),    # 东海群岛
    "baishi": (34.26, 108.95),    # 关中县城
    "qingxi": (29.56, 111.70),    # 湘北水库
    "heiyan": (36.62, 101.78),    # 西北矿镇
    "banqiao": (32.06, 118.80),   # 江南乡镇
}


def geo_of(city_id: str) -> tuple[float, float]:
    return CITY_GEO.get(city_id, (35.0, 105.0))


# ---------------------------------------------------------------- 城市势力
# 每座城当前有谁在：机构分部、教派、地方势力。
CITY_FACTIONS = {
    "linjing": [
        {"name": "玄真司总部", "kind": "机构", "note": "编制最全，规矩最多"},
        {"name": "天监司", "kind": "机构", "note": "阴浊监测网的总机房"},
        {"name": "礼制院", "kind": "机构", "note": "卡着所有人的箓职"},
        {"name": "正一祖庭", "kind": "教派", "note": "授箓的正统"},
    ],
    "nanyu": [
        {"name": "玄真司南屿分司", "kind": "机构", "note": "玩家的单位"},
        {"name": "正一南屿道院", "kind": "教派", "note": "与分司合作多年"},
        {"name": "闾山外门", "kind": "教派", "note": "寿材街一带的实际话事人"},
        {"name": "白云教南屿堂", "kind": "教派", "note": "近三年扩得最快"},
    ],
    "yunjin": [
        {"name": "玄真司云津站", "kind": "机构", "note": "只配了四个人"},
        {"name": "青城剑馆", "kind": "教派", "note": "港区边上一座小院"},
        {"name": "港口商会", "kind": "世俗", "note": "什么都运，包括不该运的"},
    ],
    "tiedu": [
        {"name": "北岭镇边营", "kind": "机构", "note": "只剿不度，越剿越多"},
        {"name": "铁壁监军司", "kind": "机构", "note": "军政府的眼睛"},
    ],
    "lijiang": [
        {"name": "玄真司澧州联络处", "kind": "机构", "note": "三个人，一间办公室"},
        {"name": "城投集团", "kind": "世俗", "note": "项目书上每页都写着已验收"},
        {"name": "全真清微观", "kind": "教派", "note": "不问世事，但会开门"},
    ],
    "chaoyu": [
        {"name": "符市商会", "kind": "世俗", "note": "来路不明的东西都在这过一手"},
        {"name": "东海巡检司", "kind": "机构", "note": "收钱放行"},
        {"name": "白云教海坛", "kind": "教派", "note": "在这里有合法身份"},
    ],
    "baishi": [
        {"name": "白石祠", "kind": "教派", "note": "顾家老太太看着"},
        {"name": "县中", "kind": "世俗", "note": "校长最怕出事"},
    ],
    "qingxi": [
        {"name": "青溪水库管理处", "kind": "世俗", "note": "水位表比命重要"},
        {"name": "镇卫生院", "kind": "世俗", "note": "只有一个夜班医生"},
        {"name": "茅山巡坛", "kind": "教派", "note": "每年只在汛期来"},
    ],
    "heiyan": [
        {"name": "黑岩矿务局", "kind": "世俗", "note": "往地下挖了两百年"},
        {"name": "矿工互助会", "kind": "世俗", "note": "名义上是工会"},
    ],
    "banqiao": [
        {"name": "板桥义庄", "kind": "世俗", "note": "没人的时候也点着灯"},
        {"name": "散修老周", "kind": "教派", "note": "一个风水先生管半个镇"},
    ],
}


def factions_of(city_id: str) -> list[dict]:
    return CITY_FACTIONS.get(city_id, [])


# ---------------------------------------------------------------- 世界背景
LORE = [
    {
        "id": "era",
        "title": "时代",
        "body": "当代。有手机、监控、网约车、短视频，也有箓职、香火、阴兵。"
                "祟物不上新闻，只上档案——这是玄真司与媒体之间多年磨合出的默契。",
    },
    {
        "id": "yinzhuo",
        "title": "阴浊",
        "body": "世界的底噪。人心里的郁结会在某处淤积，超过阈值就具象化成祟物。"
                "所以祟物不是外来的怪物，是没被处理掉的东西长出来的。",
    },
    {
        "id": "states",
        "title": "祟物三态",
        "body": "灵体态只有法术与符箓能碰；附身态伤宿主即伤它，物也能伤它；"
                "实体化之后物理有效，五行伤害还要再加五成。普通人不是没用，"
                "关键是把祟物逼到能碰的状态。",
    },
    {
        "id": "wuxing",
        "title": "五行",
        "body": "金克木、木克土、土克水、水克火、火克金。相克伤害 ×1.5，被克 ×0.5。"
                "另有一个变种「煞」：不循生克，也难被克制——怨憎凝出来的东西。",
    },
    {
        "id": "cost",
        "title": "代价",
        "body": "超度记功德，剿灭积阴债，用阴器背业障。功德不是善恶分，"
                "是「你替这世界了结了多少」的记账。",
    },
    {
        "id": "society",
        "title": "社会的态度",
        "body": "官方承认、民间半信半疑、媒体不敢写。玄真司不做好正义，它做了结——"
                "把一桩因果处理干净，比把一只祟物打死更重要。",
    },
]
