import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { auth, staffAccess, uid } from "../middleware/auth.js";
import { HttpError } from "../errors.js";

export const reservationRouter = Router();
reservationRouter.use(auth);

const idParams = z.object({ restaurantId: z.uuid() });
const bookingSchema = z.object({
  startsAt: z.iso.datetime({ offset: true }), // e.g. 2026-11-05T19:00:00-05:00
  partySize: z.number().int().min(1).max(30),
  notes: z.string().max(500).optional(),
});

reservationRouter.post("/restaurants/:restaurantId/reservations", async (req, res) => {
  const { restaurantId } = idParams.parse(req.params);
  const data = bookingSchema.parse(req.body);
  const customerId = uid(req);
  const startsAt = new Date(data.startsAt);
  if (startsAt.getTime() <= Date.now()) throw new HttpError(400, "Choose a future date");

  // Lock the restaurant row so concurrent requests cannot exceed capacity for the same slot.
  const reservation = await prisma.$transaction(async tx => {
    const restaurant = await tx.restaurant.findUnique({ where: { id: restaurantId } });
    if (!restaurant) throw new HttpError(404, "Restaurant not found");
    await tx.$queryRaw`SELECT id FROM "Restaurant" WHERE id = ${restaurantId} FOR UPDATE`;
    const booked = await tx.reservation.aggregate({
      where: { restaurantId, startsAt, status: { not: "CANCELLED" } },
      _sum: { partySize: true },
    });
    if ((booked._sum.partySize ?? 0) + data.partySize > restaurant.capacity) {
      throw new HttpError(409, "No capacity for this time slot");
    }
    return tx.reservation.create({
      data: {
        restaurantId, customerId, startsAt, partySize: data.partySize,
        notes: data.notes,
        notifications: { create: {
          restaurantId, type: "RESERVATION_CREATED", message: "New reservation pending confirmation",
        } },
      },
    });
  });
  res.status(201).json({ reservation });
});

reservationRouter.get("/reservations/mine", async (req, res) => {
  const reservations = await prisma.reservation.findMany({
    where: { customerId: uid(req) },
    include: { restaurant: { select: { name: true, slug: true } } },
    orderBy: { startsAt: "asc" },
  });
  res.json({ reservations });
});

reservationRouter.get("/restaurants/:restaurantId/reservations", async (req, res) => {
  const { restaurantId } = idParams.parse(req.params);
  await staffAccess(uid(req), restaurantId);
  const reservations = await prisma.reservation.findMany({
    where: { restaurantId },
    include: { customer: { select: { id: true, name: true, email: true } } },
    orderBy: { startsAt: "asc" },
  });
  res.json({ reservations });
});

reservationRouter.patch("/restaurants/:restaurantId/reservations/:reservationId/status", async (req, res) => {
  const { restaurantId, reservationId } = idParams.extend({ reservationId: z.uuid() }).parse(req.params);
  const { status } = z.object({ status: z.enum(["CONFIRMED", "CANCELLED"]) }).parse(req.body);
  await staffAccess(uid(req), restaurantId);
  const reservation = await prisma.$transaction(async tx => {
    const existing = await tx.reservation.findFirst({ where: { id: reservationId, restaurantId } });
    if (!existing) throw new HttpError(404, "Reservation not found");
    if (existing.status === "CANCELLED") throw new HttpError(409, "Cancelled reservations cannot be changed");
    const updated = await tx.reservation.update({ where: { id: existing.id }, data: { status } });
    if (existing.status !== status) {
      await tx.notification.create({ data: {
        restaurantId, reservationId, type: status === "CONFIRMED" ? "RESERVATION_CONFIRMED" : "RESERVATION_CANCELLED",
        message: `Reservation ${status.toLowerCase()}`,
      } });
    }
    return updated;
  });
  res.json({ reservation });
});

reservationRouter.patch("/reservations/:reservationId/cancel", async (req, res) => {
  const { reservationId } = z.object({ reservationId: z.uuid() }).parse(req.params);
  const customerId = uid(req);
  const updated = await prisma.$transaction(async tx => {
    const reservation = await tx.reservation.findFirst({ where: { id: reservationId, customerId } });
    if (!reservation) throw new HttpError(404, "Reservation not found");
    if (reservation.status === "CANCELLED") return reservation;
    const cancelled = await tx.reservation.update({ where: { id: reservation.id }, data: { status: "CANCELLED" } });
    await tx.notification.create({ data: {
      restaurantId: reservation.restaurantId, reservationId,
      type: "RESERVATION_CANCELLED", message: "Reservation cancelled by customer",
    } });
    return cancelled;
  });
  res.json({ reservation: updated });
});
