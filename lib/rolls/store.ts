/** Fiber rolls, saved in this browser and synced through the database. */
import { createListStore } from "../sync/list-store"
import { decodeRoll } from "./model"

export const rollsStore = createListStore("gigafazt-bobinas", "rolls", decodeRoll)
