import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { auth, uid } from "../middleware/auth.js";

export const restaurantRouter = Router();
const restaurantInput = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  address: z.string().trim().max(250).optional(),
  capacity: z.number().int().positive().max(10000),
  timezone: z.string().default("America/Bogota"),
});

// Public list: no personal user data is exposed.
restaurantRouter.get("/", async (_req, res) => {
  const restaurants = await prisma.restaurant.findMany({
    select: { id: true, name: true, slug: true, address: true, capacity: true, timezone: true },
    orderBy: { createdAt: "desc" },
  });
  res.json({ restaurants });
});

restaurantRouter.get("/mine", auth, async (req, res) => {
  const memberships = await prisma.restaurantMember.findMany({
    where: { userId: uid(req) },
    select: { role: true, restaurant: { select: { id: true, name: true, slug: true, capacity: true } } },
  });
  res.json({ memberships });
});

restaurantRouter.post("/", auth, async (req, res) => {
  const input = restaurantInput.parse(req.body);
  const restaurant = await prisma.restaurant.create({
    data: {
      ...input,
      members: { create: { userId: uid(req), role: "ADMIN" } },
    },
  });
  res.status(201).json({ restaurant });
});
