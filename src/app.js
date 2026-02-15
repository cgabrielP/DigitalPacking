import express from "express";
import authRoutes from "./modules/auth/auth.routes.js";

const app = express();

app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});
app.use("/auth", authRoutes);


export default app;
