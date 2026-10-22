import "dotenv/config";
import express from "express";
import cors from "cors";
import { prisma } from "./db.js";

const app = express();
const PORT = Number(process.env.PORT || 3001);

app.use(cors({
  origin: "http://localhost:3000"
}));

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "restaurant-reservation-api"
  });
});

app.get("/api/health/db", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;

    res.json({
      status: "ok",
      database: "connected",
    });
  } catch {
    res.status(503).json({
      status: "error",
      database: "disconnected",
    });
  }
});

app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
});