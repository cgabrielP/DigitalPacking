import axios from "axios";

export const redirectToML = (req, res) => {
  const url = `https://auth.mercadolibre.com.ar/authorization?response_type=code&client_id=${process.env.ML_CLIENT_ID}&redirect_uri=${process.env.ML_REDIRECT_URI}`;

  res.redirect(url);
};

export const handleCallback = async (req, res) => {
  const { code } = req.query;

  if (!code) {
    return res.status(400).json({ error: "No authorization code received" });
  }

  try {
    const response = await axios.post(
      "https://api.mercadolibre.com/oauth/token",
      {
        grant_type: "authorization_code",
        client_id: process.env.ML_CLIENT_ID,
        client_secret: process.env.ML_CLIENT_SECRET,
        code,
        redirect_uri: process.env.ML_REDIRECT_URI
      },
      {
        headers: {
          "Content-Type": "application/json"
        }
      }
    );

    const { access_token, refresh_token, user_id, expires_in } = response.data;

    res.json({
      message: "Cuenta conectada correctamente ✅",
      access_token,
      refresh_token,
      user_id,
      expires_in
    });

  } catch (error) {
    console.error(error.response?.data || error.message);
    res.status(500).json({ error: "Error obteniendo access token" });
  }
};
