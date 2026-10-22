import type { NextFunction, Request, Response } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";
import { HttpError } from "../errors.js";
import { prisma } from "../db.js";

export type AuthRequest = Request & { userId?: string };

export function auth(req: Request, res: Response, next: NextFunction) {
  const token = /^Bearer (.+)$/i.exec(req.header("authorization") ?? "")?.[1];
  if (!token) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload;
    if (typeof payload.sub !== "string") throw new Error("Invalid subject");
    (req as AuthRequest).userId = payload.sub;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function uid(req: Request): string {
  const id = (req as AuthRequest).userId;
  if (!id) throw new HttpError(401, "Authentication required");
  return id;
}

export async function staffAccess(userId: string, restaurantId: string) {
  const member = await prisma.restaurantMember.findUnique({
    where: { userId_restaurantId: { userId, restaurantId } },
  });
  if (!member) throw new HttpError(403, "Not a member of this restaurant");
  return member;
}
