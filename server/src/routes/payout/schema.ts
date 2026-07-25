/**
 * No body or query input is accepted (invariant 13 — the endpoint derives
 * its own target week server-side; a week parameter would let anyone
 * reaching this endpoint replay an arbitrary week, README §3.4). This file
 * exists for shape-consistency with other routes and to document that
 * absence is deliberate, not an oversight.
 */
export {};
