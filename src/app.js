import express from "express";
import authRoutes from "./routes/auth.routes.js";

const app = express();

app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});
app.post("/webhooks/mercadolibre", (req, res) => {
  console.log("Notificación recibida:", req.body);
  res.sendStatus(200);
});


app.use("/auth", authRoutes);

export default app;
