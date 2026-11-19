/** Appointments, saved in this browser and synced through the database. */
import { createListStore } from "../sync/list-store"
import { decodeAppointment } from "./model"

export const agendaStore = createListStore("gigafazt-agenda", "agenda", decodeAppointment)
