/**
 * Mirakl (Ripley) authentication helper.
 *
 * Ripley's Mirakl platform uses a simple API key passed as an
 * `Authorization` header on every request. No token refresh needed.
 *
 * Credentials shape: { apiKey: string, shopId?: string }
 */

export const RIPLEY_BASE_URL = "https://ripley-prod.mirakl.net/";

/**
 * Build standard headers for Mirakl API calls.
 * @param {object} credentials — { apiKey, shopId? }
 * @returns {object} Headers object for axios
 */
export function buildHeaders(credentials) {
  return {
    Authorization: credentials.apiKey,
    Accept: "application/json",
  };
}
