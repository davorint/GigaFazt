"""Internal alcaldía/municipio boundary lines for the 3 service states.
Usage: python -I build_municipios.py <rawDir> <outFile>

Shared edges are merged so each boundary is drawn once, and the state outlines
(already in states.json) are cut out so only the inner limits remain."""
import json, sys
from shapely.geometry import shape, mapping
from shapely.ops import unary_union, linemerge

raw, out = sys.argv[1], sys.argv[2]
FILES = ["cdmx.json", "mex.json", "mor.json"]

polys, per_state = [], []
for fname in FILES:
    with open(f"{raw}/{fname}", encoding="utf-8") as fh:
        data = json.load(fh)
    ps = [shape(f["geometry"]).buffer(0) for f in data["features"]]
    polys += ps
    per_state.append(unary_union(ps))

# Every municipio edge once (unary_union nodes and dissolves duplicates).
edges = unary_union([p.boundary for p in polys])
# Drop the state outlines (drawn by the states layer).
outlines = unary_union([s.boundary for s in per_state]).buffer(0.002)
inner = linemerge(edges.difference(outlines))
# ~0.0015° ≈ 150 m: municipal-level lines, not survey-grade.
inner = inner.simplify(0.0015, preserve_topology=False)

def rnd(c):
    if isinstance(c[0], (int, float)):
        return [round(c[0], 4), round(c[1], 4)]
    return [rnd(x) for x in c]

lines = list(inner.geoms) if hasattr(inner, "geoms") else [inner]
lines = [l for l in lines if l.length > 0.003]  # drop slivers left by the cut
g = mapping(unary_union(lines))
fc = {"type": "FeatureCollection", "features": [{"type": "Feature", "properties": {},
      "geometry": {"type": g["type"], "coordinates": rnd(json.loads(json.dumps(g["coordinates"])))}}]}
with open(out, "w", encoding="utf-8") as fh:
    json.dump(fc, fh, separators=(",", ":"))
print(g["type"], len(lines), "lines")
