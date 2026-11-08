# Map geo data

`public/geo/states.json` (≈16 KB) holds simplified outlines of the three service states:
CDMX, Estado de México and Morelos.

**Source:** CONABIO 2023 municipal boundaries (derived from the INEGI Marco Geoestadístico),
from https://github.com/PhantomInsights/mexico-geojson (MIT license), folder `2023/states/`.

## Regenerate

1. Download into an empty folder, e.g. `geo-raw/`:
   - `Ciudad de México.json` → `geo-raw/cdmx.json`
   - `México.json` → `geo-raw/mex.json`
   - `Morelos.json` → `geo-raw/mor.json`
2. `pip install shapely` (2.x)
3. `python -I scripts/build_states.py geo-raw public/geo/states.json`

The script dissolves the municipios of each state into one outline and simplifies it
(~400 m tolerance).

## Alcaldía / municipio limits

`public/geo/municipios.json` (≈28 KB gz) holds the inner alcaldía/municipio boundary lines
(shared edges merged, state outlines cut out, ~150 m simplification). From the same raw files:

`python -I scripts/build_municipios.py geo-raw public/geo/municipios.json`

## Service zone

`public/geo/service-zone.json` (≈4 KB gz): the lit "zona de servicio" on the map and the
/cobertura outlines. All of CDMX + the Estado de México municipios that border CDMX +
Cuernavaca and Tepoztlán. From the same raw files:

`python -I scripts/build_service_zone.py geo-raw public/geo/service-zone.json`

It prints the Edomex municipio list; keep `SERVICE_ZONE` in `lib/coverage.ts` in sync.
