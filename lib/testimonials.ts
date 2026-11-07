/**
 * Real testimonials only (BUSINESS.md → Social proof): name, neighborhood,
 * quote, and the client's permission. Empty until the owner provides them; the
 * testimonial slots render nothing while this is empty (SPEC §6, hard rule #1).
 */
export interface Testimonial {
  name: string
  area: string
  quote: string
  permission: true
}

export const testimonials: Testimonial[] = []
