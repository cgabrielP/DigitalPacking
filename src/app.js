import express from "express";
import authRoutes from "./modules/auth/auth.routes.js";
import ordersRoutes from "./modules/orders/orders.routes.js"
import cors from "cors";
const app = express();


const allowedOrigins = [
  "http://localhost:5173",       
  
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

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});
app.use("/auth", authRoutes);
app.use("/orders", ordersRoutes);


export default app;
