import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../db.js";
import { auth, uid } from "../middleware/auth.js";
import { HttpError } from "../errors.js";

export const authRouter = Router();
const credentials = z.object({
  email: z.email().trim().toLowerCase(),
  password: z.string().min(8).max(72),
});
const registerSchema = credentials.extend({ name: z.string().trim().min(2).max(100) });
const publicUser = (u: { id: string; name: string; email: string }) => ({ id: u.id, name: u.name, email: u.email });
function tokenFor(id: string) {
  return jwt.sign({}, process.env.JWT_SECRET!, { subject: id, expiresIn: "8h" });
}

authRouter.post("/register", async (req, res) => {
  const input = registerSchema.parse(req.body);
  const passwordHash = await bcrypt.hash(input.password, 12);
  const user = await prisma.user.create({ data: { name: input.name, email: input.email, passwordHash } });
  res.status(201).json({ user: publicUser(user), token: tokenFor(user.id) });
});

authRouter.post("/login", async (req, res) => {
  const input = credentials.parse(req.body);
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) {
    throw new HttpError(401, "Invalid credentials");
  }
  res.json({ user: publicUser(user), token: tokenFor(user.id) });
});

authRouter.get("/me", auth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: uid(req) },
    select: { id: true, name: true, email: true },
  });
  if (!user) throw new HttpError(401, "User not found");
  res.json({ user });
});
