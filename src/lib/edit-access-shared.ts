/** Cookie that unlocks write access across all three apps. */
export const EDIT_ACCESS_COOKIE = "apm_edit";

/** localStorage mirror for fast client UI (cookie is authoritative for APIs). */
export const EDIT_ACCESS_STORAGE_KEY = "apm.servicetools.edit.v1";

/**
 * SHA-256 of `-Liya2021-|APM-Servicetools`.
 * Password itself is not stored in source.
 */
export const EDIT_ACCESS_TOKEN =
  "0ceb0a0bfbaf548555bb7e333715b33e984e6cf59ba2d1a6ff9d17baf52e578f";
