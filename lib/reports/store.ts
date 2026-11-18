/** Client problem reports, saved in this browser and synced through the database. */
import { createListStore } from "../sync/list-store"
import { decodeReport } from "./model"

export const reportsStore = createListStore("gigafazt-reportes", "reports", decodeReport)
