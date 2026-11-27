/**
 * IPv4 CIDR subnetting table (/interno/guias/ipv4, owner 2026-11-27): for each prefix, the subnet mask, the usable
 * hosts, the block size (how far apart subnets start, in the octet where the mask ends) and the total addresses.
 * Computed, not typed in, so the table can't hold a typo.
 *
 * Usable hosts: total − 2 (network and broadcast), except /31 (2: point-to-point links, RFC 3021) and /32 (1 host).
 */
export type CidrRow = {
  prefix: number
  mask: string
  /** Total addresses in the subnet (2^(32 − prefix)). */
  total: number
  usable: number
  /** Subnets start every `block` in octet `octet` (1–4), e.g. /26 → 64 in the 4th. */
  block: number
  octet: 1 | 2 | 3 | 4
}

const dotted = (n: number) => [24, 16, 8, 0].map((s) => (n >>> s) & 255).join(".")

export function cidrRow(prefix: number): CidrRow {
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) throw new RangeError("prefix 0–32")
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0
  const total = 2 ** (32 - prefix)
  const usable = prefix === 32 ? 1 : prefix === 31 ? 2 : total - 2
  // The octet where the mask ends (a /24 ends at the 3rd: its subnets go 1 apart in the 3rd octet).
  const octet = (prefix === 0 ? 1 : Math.ceil(prefix / 8)) as 1 | 2 | 3 | 4
  const block = 2 ** (octet * 8 - prefix)
  return { prefix, mask: dotted(mask), total, usable, block, octet }
}

/** The prefixes in the guide: /8 to /32. */
export const CIDR_PREFIXES = Array.from({ length: 25 }, (_, i) => i + 8)
export const cidrTable = (): CidrRow[] => CIDR_PREFIXES.map(cidrRow)
