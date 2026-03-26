import axios from "axios";

const { ML_CLIENT_ID, ML_CLIENT_SECRET } = process.env;

/**
 * Refresh ML access token using the refresh_token grant.
 * @param {object} credentials — { accessToken, refreshToken, ... }
 * @returns {object} Updated credentials object to persist.
 */
export async function refreshMlToken(credentials) {
  const response = await axios.post(
    "https://api.mercadolibre.com/oauth/token",
    new URLSearchParams({
      grant_type:    "refresh_token",
      client_id:     ML_CLIENT_ID,
      client_secret: ML_CLIENT_SECRET,
      refresh_token: credentials.refreshToken,
    })
  );

  return {
    ...credentials,
    accessToken:  response.data.access_token,
    refreshToken: response.data.refresh_token,
    expiresIn:    response.data.expires_in,
  };
}
