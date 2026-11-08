"""Service-zone polygons for the coverage map (owner, 2026-11-07).
Usage: python -I build_service_zone.py <rawDir> <outFile>

Zone = all of CDMX + the Estado de México municipios that border CDMX
(the conurbated ring of the metro area), minus the northeast ones the owner
excluded (2026-11-07), + Cuernavaca and Tepoztlán (Morelos;
Amatlán is a locality of Tepoztlán). One feature per zone part, with its
municipio names, simplified to ~150 m (municipality-level, hard rule #6).
Prints the Edomex municipio list so lib/coverage.ts can be kept in sync."""
import json, sys
from shapely.geometry import shape, mapping
from shapely.ops import unary_union

raw, out = sys.argv[1], sys.argv[2]
MORELOS = {"Cuernavaca", "Tepoztlán"}
# Northeast neighbors of CDMX, not served (owner, 2026-11-07).
EXCLUDE = {"Coacalco de Berriozábal", "Ecatepec de Morelos", "Nezahualcóyotl", "La Paz"}


def load(name):
    with open(f"{raw}/{name}", encoding="utf-8") as fh:
        return [(f["properties"]["NOMGEO"], shape(f["geometry"]).buffer(0)) for f in json.load(fh)["features"]]


cdmx = load("cdmx.json")
mex = load("mex.json")
mor = load("mor.json")

cdmx_shape = unary_union([g for _, g in cdmx])
# "Borders CDMX": shares an edge (not just a corner) with the CDMX outline.
touch = cdmx_shape.buffer(0.0015)
ring = sorted(
    [(n, g) for n, g in mex if n not in EXCLUDE and g.intersection(touch).area > 1e-6],
    key=lambda x: x[0],
)
mor_sel = [(n, g) for n, g in mor if n in MORELOS]
assert len(mor_sel) == len(MORELOS), [n for n, _ in mor_sel]


def rnd(c):
    if isinstance(c[0], (int, float)):
        return [round(c[0], 4), round(c[1], 4)]
    return [rnd(x) for x in c]


def feature(part, state, names, geoms):
    g = unary_union(geoms).simplify(0.0015, preserve_topology=True)
    m = mapping(g)
    return {
        "type": "Feature",
        "properties": {"part": part, "state": state, "municipios": names},
        "geometry": {"type": m["type"], "coordinates": rnd(json.loads(json.dumps(m["coordinates"])))},
    }


fc = {
    "type": "FeatureCollection",
    "features": [
        feature("cdmx", "CDMX", [n for n, _ in cdmx], [g for _, g in cdmx]),
        feature("edomex-metro", "MEX", [n for n, _ in ring], [g for _, g in ring]),
        feature("morelos", "MOR", sorted(MORELOS), [g for _, g in mor_sel]),
    ],
}
with open(out, "w", encoding="utf-8") as fh:
    json.dump(fc, fh, ensure_ascii=False, separators=(",", ":"))
print(len(ring), "Edomex municipios:", ", ".join(n for n, _ in ring))
