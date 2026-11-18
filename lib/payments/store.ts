/** Payments, saved in this browser and synced through the database. */
import { createListStore } from "../sync/list-store"
import { decodePayment } from "./model"

export const paymentsStore = createListStore("gigafazt-pagos", "payments", decodePayment)
