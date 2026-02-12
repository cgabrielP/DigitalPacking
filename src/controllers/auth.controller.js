export const redirectToML = (req, res) => {
  const url = `https://auth.mercadolibre.com.ar/authorization?response_type=code&client_id=${process.env.ML_CLIENT_ID}&redirect_uri=${process.env.ML_REDIRECT_URI}`;

  res.redirect(url);
};

export const handleCallback = async (req, res) => {
  const { code } = req.query;

  if (!code) {
    return res.status(400).json({ error: "No authorization code received" });
  }

  // Por ahora solo mostramos el code
  res.json({
    message: "Authorization code recibido correctamente",
    code
  });
};
