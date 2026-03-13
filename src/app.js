import express from "express";
import authRoutes from "./modules/auth/auth.routes.js";
import ordersRoutes from "./modules/orders/orders.routes.js"
import adminRoutes from "./modules/admin/admin.routes.js";
import deliveryRoutes from "./modules/delivery/delivery.routes.js"
import cors from "cors";
const app = express();


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

app.use("/auth", authRoutes);
app.use("/orders", ordersRoutes);
app.use("/admin", adminRoutes)
app.use("/delivery", deliveryRoutes);


export default app;
