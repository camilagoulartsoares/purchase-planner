import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { AppError } from "../middlewares/errorHandler.js";
import { userRepository } from "../repositories/userRepository.js";

export const authService = {
  async register(input: { name: string; email: string; password: string }) {
    const exists = await userRepository.findByEmail(input.email.toLowerCase());
    if (exists) throw new AppError("E-mail já cadastrado", 409);

    const passwordHash = await bcrypt.hash(input.password, 10);
    const user = await userRepository.create({
      name: input.name.trim(),
      email: input.email.toLowerCase(),
      passwordHash,
    });

    const token = signToken(user.id, user.email);
    return {
      token,
      user: { id: user.id, name: user.name, email: user.email },
    };
  },

  async login(input: { email: string; password: string }) {
    const user = await userRepository.findByEmail(input.email.trim().toLowerCase());
    if (!user) throw new AppError("Credenciais inválidas", 401);

    const valid = await bcrypt.compare(input.password, user.passwordHash);
    if (!valid) throw new AppError("Credenciais inválidas", 401);

    const token = signToken(user.id, user.email);
    return {
      token,
      user: { id: user.id, name: user.name, email: user.email },
    };
  },

  async me(userId: string) {
    const user = await userRepository.findById(userId);
    if (!user) throw new AppError("Usuário não encontrado", 404);
    return user;
  },
};

function signToken(id: string, email: string) {
  return jwt.sign({ id, email }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn as jwt.SignOptions["expiresIn"],
  });
}
