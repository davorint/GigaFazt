/** Kits and new projects, saved in this browser and synced through the database. */
import { createListStore } from "../sync/list-store"
import { decodeProject } from "./model"

export const projectsStore = createListStore("gigafazt-proyectos", "proyectos", decodeProject)
