/** Stock movements and serialized units, saved in this browser and synced through the database. */
import { createListStore } from "../sync/list-store"
import { decodeMove, decodeUnit } from "./model"

export const movesStore = createListStore("gigafazt-movimientos", "stock", decodeMove)
export const unitsStore = createListStore("gigafazt-equipos", "units", decodeUnit)
