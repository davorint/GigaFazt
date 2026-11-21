/**
 * Priority classes per client on AsterNOS-VPP (owner, 2026-11-20). Each HQoS user has 8 traffic classes; strict classes
 * go first (7 > … > 0) and DWRR classes share what's left (AsterNOS QoS guide / queue scheduling). With a real-time
 * class, a game or a call doesn't wait behind the client's own download.
 *
 * Delay model: a packet that joins the back of a full queue waits for the bytes ahead of it to leave at the client's
 * rate. The queue size per class isn't documented by AsterNOS, so it's an input (packets × 1500 B), marked as such.
 * Classification uses DSCP marks (qos map dscp_to_tc); traffic from the internet often arrives unmarked.
 */

/** DSCP values sent to the real-time class: EF (voice), CS5, CS4 and AF41 (interactive video / gaming). */
export const REALTIME_DSCP = [46, 40, 32, 34]
/** The real-time class (strict, highest). */
export const REALTIME_TC = 7

const MTU = 1500

/** Milliseconds a packet waits behind `queuePackets` full-size packets at `mbps`. */
export function queueDelayMs(queuePackets: number, mbps: number): number {
  if (mbps <= 0) return Infinity
  return (queuePackets * MTU * 8) / (mbps * 1e6) * 1000
}

/** With a strict real-time class: at most the packet already being sent. */
export function priorityDelayMs(mbps: number): number {
  return queueDelayMs(1, mbps)
}
