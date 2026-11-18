/** Notes, saved in this browser and synced through the database. */
import { createListStore } from "../sync/list-store"
import { decodeNote } from "./model"

export const notesStore = createListStore("gigafazt-notas", "notes", decodeNote)
