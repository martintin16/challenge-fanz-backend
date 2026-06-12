import "dotenv/config";
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import chatRouter from "./routes/chat.js";

const app = express();
const PORT = process.env.PORT ?? 3001;

app.use(
  cors({
    origin: process.env.FRONTEND_URL ?? "http://localhost:3000",
    methods: ["GET", "POST"],
  }),
);

app.use(express.json());
app.set("trust proxy", 1);

const chatLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 30, // 30 requests por IP en esa ventana
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Demasiadas consultas. Esperá unos minutos e intentá de nuevo.",
  },
});

app.use("/api/chat", chatLimiter, chatRouter);

app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`🚀 Fanzly backend corriendo en http://localhost:${PORT}`);
});
