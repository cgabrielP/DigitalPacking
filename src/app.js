import express from "express";
import authRoutes from "./modules/auth/auth.routes.js";
import ordersRoutes from "./modules/orders/orders.routes.js"
import adminRoutes from "./modules/admin/admin.routes.js";
import deliveryRoutes from "./modules/delivery/delivery.routes.js"
import logRoutes from "./modules/log/log.routes.js"
import subscriptionRoutes from "./modules/subscription/subscription.routes.js";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
const app = express();

app.use(helmet());

const allowedOrigins = [
  "http://localhost:5173",
  "https://digital-packing-frt.vercel.app"

];

app.use(cors({
  origin: (origin, callback) => {

    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS bloqueado para: ${origin}`));
    }
  },
  credentials: true,
}));
app.use(express.json());

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "Demasiados intentos, intentá de nuevo en 15 minutos" },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use("/auth", authLimiter, authRoutes);
app.use("/orders", ordersRoutes);
app.use("/admin", adminRoutes)
app.use("/delivery", deliveryRoutes);
app.use("/api/log", logRoutes);
app.use("/api/subscription", subscriptionRoutes);


export default app;
