/** Contracts, saved in this browser and synced through the database (the signed copies stay on the server). */
import { createListStore } from "../sync/list-store"
import { decodeContract } from "./model"

export const contractsStore = createListStore("gigafazt-contratos", "contratos", decodeContract)
