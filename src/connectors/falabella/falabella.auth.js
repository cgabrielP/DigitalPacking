import crypto from "crypto";

/**
 * Falabella Seller Center uses HMAC-SHA256 signed requests.
 * Each API call requires: UserID, ApiKey, Action, Timestamp, and Signature.
 *
 * Signature = HMAC-SHA256(apiKey, sortedParamsString)
 * where sortedParamsString is all params (except Signature) sorted alphabetically
 * and concatenated as key=value pairs.
 *
 * @param {object} credentials — { apiKey, userId, apiUrl }
 * @param {string} action — API action (e.g., "GetOrders")
 * @param {object} extraParams — additional query params
 * @returns {string} Full URL with signed query string
 */
export function buildSignedUrl(credentials, action, extraParams = {}) {
  const { apiKey, userId, apiUrl } = credentials;
  // Falabella Seller Center rejects timestamps with milliseconds
  const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

  const params = {
    UserID: userId,
    Version: "1.0",
    Action: action,
    Format: "JSON",
    Timestamp: timestamp,
    ...extraParams,
  };

  // Sort params alphabetically and build the string to sign
  const sortedKeys = Object.keys(params).sort();
  const paramString = sortedKeys.map((k) => `${k}=${params[k]}`).join("&");

  // HMAC-SHA256 signature
  const signature = crypto
    .createHmac("sha256", apiKey)
    .update(paramString)
    .digest("hex");

  return `${apiUrl}?${paramString}&Signature=${signature}`;
}
