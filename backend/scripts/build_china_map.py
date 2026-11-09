"""把 TopoJSON 世界地图里的中国轮廓，压成前端能直接用的 SVG 路径。

    uv run python scripts/build_china_map.py <topojson 文件> [输出路径]

生成 frontend/src/assets/china.js：
    CHINA_PATHS   —— 若干条 "M...Z" 路径（主陆 + 岛）
    CHINA_VIEWBOX —— viewBox
    project(lon, lat) -> [x, y]   —— 和路径同一套投影，城市点用它定位
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_OUT = ROOT.parent / "frontend" / "src" / "assets" / "china.js"

WIDTH = 1000
LAT0 = 35.0          # 标准纬线，减少东西向拉伸
MIN_STEP = 0.22      # 简化：相邻点最小间距（度）
MIN_RING_AREA = 0.08  # 丢掉太小的碎岛（平方度）


def decode_quanta(topology: dict) -> list[list[tuple[float, float]]]:
    scale = topology["transform"]["scale"]
    translate = topology["transform"]["translate"]
    arcs = []
    for arc in topology["arcs"]:
        x = y = 0
        points = []
        for dx, dy in arc:
            x += dx
            y += dy
            points.append((x * scale[0] + translate[0], y * scale[1] + translate[1]))
        arcs.append(points)
    return arcs


def ring_points(arc_indexes: list[int], arcs) -> list[tuple[float, float]]:
    out: list[tuple[float, float]] = []
    for index in arc_indexes:
        if index >= 0:
            segment = arcs[index]
        else:
            segment = list(reversed(arcs[~index]))
        if out and segment and out[-1] == segment[0]:
            segment = segment[1:]
        out.extend(segment)
    return out


def simplify(points: list[tuple[float, float]]) -> list[tuple[float, float]]:
    if len(points) <= 3:
        return points
    kept = [points[0]]
    for point in points[1:-1]:
        px, py = kept[-1]
        if math.hypot(point[0] - px, point[1] - py) >= MIN_STEP:
            kept.append(point)
    kept.append(points[-1])
    return kept


def area(points: list[tuple[float, float]]) -> float:
    total = 0.0
    for i in range(len(points) - 1):
        x1, y1 = points[i]
        x2, y2 = points[i + 1]
        total += x1 * y2 - x2 * y1
    return abs(total) / 2


def main() -> int:
    src = Path(sys.argv[1])
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else DEFAULT_OUT

    raw = src.read_text(encoding="utf-8")
    start = raw.find("{")
    topology = json.loads(raw[start:])
    arcs = decode_quanta(topology)

    features = topology["objects"]["countries"]["geometries"]
    china = next(f for f in features if f.get("properties", {}).get("name") == "China")
    taiwan = next((f for f in features if f.get("properties", {}).get("name") == "Taiwan"), None)

    polygons: list[list[list[tuple[float, float]]]] = []
    for feature in [china] + ([taiwan] if taiwan else []):
        # world-atlas 把几何直接放在 feature 上；标准 GeoJSON 才套一层 geometry
        geom = feature.get("geometry") or feature
        if geom["type"] == "Polygon":
            rings = [geom["arcs"]]
        else:
            rings = geom["arcs"]
        for ring_group in rings:
            polygons.append([ring_points(arc, arcs) for arc in ring_group])

    # 投影：等距圆柱 + 标准纬线余弦压缩
    lons = [p[0] for poly in polygons for ring in poly for p in ring]
    lats = [p[1] for poly in polygons for ring in poly for p in ring]
    min_lon, max_lon = min(lons), max(lons)
    min_lat, max_lat = min(lats), max(lats)

    k = math.cos(math.radians(LAT0))
    span_x = (max_lon - min_lon) * k
    span_y = max_lat - min_lat
    scale = WIDTH / span_x
    height = round(span_y * scale)

    def project(lon: float, lat: float) -> tuple[float, float]:
        return ((lon - min_lon) * k * scale, (max_lat - lat) * scale)

    paths = []
    for poly in polygons:
        for ring in poly:
            simplified = simplify(ring)
            if len(simplified) < 4 or area(simplified) < MIN_RING_AREA:
                continue
            coords = [project(lon, lat) for lon, lat in simplified]
            d = "M" + " ".join("%.1f,%.1f" % (x, y) for x, y in coords) + "Z"
            paths.append(d)

    body = [
        "// 由 scripts/build_china_map.py 生成，别手改。",
        "// 数据源：world-atlas countries-110m（TopoJSON），投影：等距圆柱 + 35°N 余弦压缩。",
        "",
        "export const CHINA_VIEWBOX = '0 0 %d %d'" % (WIDTH, height),
        "export const CHINA_BOUNDS = { minLon: %.4f, maxLon: %.4f, minLat: %.4f, maxLat: %.4f }"
        % (min_lon, max_lon, min_lat, max_lat),
        "",
        "const K = %.10f" % k,
        "const SCALE = %.10f" % scale,
        "",
        "export function project(lon, lat) {",
        "  return [(lon - CHINA_BOUNDS.minLon) * K * SCALE, (CHINA_BOUNDS.maxLat - lat) * SCALE]",
        "}",
        "",
        "export const CHINA_PATHS = [",
    ]
    body += ["  %s," % json.dumps(path, ensure_ascii=False) for path in paths]
    body += ["]", ""]

    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text("\n".join(body), encoding="utf-8")
    print("rings:", len(paths), "->", out, out.stat().st_size // 1024, "KB")
    print("viewBox:", WIDTH, height)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
