/** Tool buying options, saved in this browser and synced through the database. */
import { createListStore } from "../sync/list-store"
import { decodeToolBuy } from "./model"

export const toolBuysStore = createListStore("gigafazt-compras-herramientas", "toolbuys", decodeToolBuy)
