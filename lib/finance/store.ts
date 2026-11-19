/** Accounts payable and receivable, each its own list in this browser, synced through the database. */
import { createListStore } from "../sync/list-store"
import { decodePayable } from "./payables"
import { decodeReceivable } from "./receivables"

export const payablesStore = createListStore("gigafazt-cuentas-por-pagar", "porpagar", decodePayable)
export const receivablesStore = createListStore("gigafazt-cuentas-por-cobrar", "porcobrar", decodeReceivable)
