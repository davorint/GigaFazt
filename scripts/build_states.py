"""Dissolve municipio polygons into 3 simplified state outlines.
Usage: python -I build_states.py <rawDir> <outFile>"""
import json, sys
from shapely.geometry import shape, mapping
from shapely.ops import unary_union

raw, out = sys.argv[1], sys.argv[2]
STATES = [("cdmx.json", "CDMX", "Ciudad de México"), ("mex.json", "MEX", "Estado de México"), ("mor.json", "MOR", "Morelos")]

def rnd(c):
    if isinstance(c[0], (int, float)):
        return [round(c[0], 4), round(c[1], 4)]
    return [rnd(x) for x in c]

features = []
for fname, code, name in STATES:
    with open(f"{raw}/{fname}", encoding="utf-8") as fh:
        data = json.load(fh)
    geom = unary_union([shape(f["geometry"]).buffer(0) for f in data["features"]])
    # ~0.004° ≈ 400 m tolerance: state-level outline, not survey-grade.
    geom = geom.simplify(0.004, preserve_topology=True)
    if geom.geom_type == "MultiPolygon":  # drop tiny slivers/islands
        geom = type(geom)([p for p in geom.geoms if p.area > 1e-4])
    g = mapping(geom)
    features.append({"type": "Feature", "properties": {"state": code, "name": name},
                     "geometry": {"type": g["type"], "coordinates": rnd(json.loads(json.dumps(g["coordinates"])))}})

fc = {"type": "FeatureCollection", "features": features}
with open(out, "w", encoding="utf-8") as fh:
    json.dump(fc, fh, ensure_ascii=False, separators=(",", ":"))
for f in features:
    print(f["properties"]["state"], f["geometry"]["type"])
