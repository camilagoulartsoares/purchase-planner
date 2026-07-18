import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { AppError } from "../middlewares/errorHandler.js";
import { userRepository } from "../repositories/userRepository.js";

function logLoginStep(message: string, meta?: Record<string, unknown>) {
  console.info(`[auth.login] ${message}`, meta || {});
}

function logLoginError(
  step: string,
  error: unknown,
  meta?: Record<string, unknown>,
) {
  console.error("[auth.login] excecao no fluxo de login", {
    step,
    ...meta,
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
}

export const authService = {
  async register(input: { name: string; email: string; password: string }) {
    const exists = await userRepository.findByEmail(input.email.toLowerCase());
    if (exists) throw new AppError("E-mail ja cadastrado", 409);

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
    const email = input.email.trim().toLowerCase();
    const startedAt = Date.now();
    let currentStep = "inicio do login";

    try {
      logLoginStep("inicio do login", { email });

      currentStep = "consulta ao banco";
      logLoginStep("consulta ao banco - inicio", { email });
      const user = await userRepository.findByEmail(email);
      logLoginStep("consulta ao banco - fim", {
        email,
        userFound: Boolean(user),
      });

      if (!user) {
        throw new AppError("Credenciais invalidas", 401);
      }

      logLoginStep("usuario encontrado", {
        userId: user.id,
        email: user.email,
      });

      currentStep = "comparacao da senha";
      logLoginStep("comparacao da senha - inicio", { userId: user.id });
      const valid = await bcrypt.compare(input.password, user.passwordHash);
      logLoginStep("comparacao da senha - fim", {
        userId: user.id,
        valid,
      });

      if (!valid) {
        throw new AppError("Credenciais invalidas", 401);
      }

      currentStep = "geracao do JWT";
      logLoginStep("geracao do JWT - inicio", { userId: user.id });
      const token = signToken(user.id, user.email);
      logLoginStep("geracao do JWT - fim", { userId: user.id });
      logLoginStep("login concluido", {
        userId: user.id,
        durationMs: Date.now() - startedAt,
      });

      return {
        token,
        user: { id: user.id, name: user.name, email: user.email },
      };
    } catch (error) {
      logLoginError(currentStep, error, {
        email,
        durationMs: Date.now() - startedAt,
      });
      throw error;
    }
  },

  async me(userId: string) {
    const user = await userRepository.findById(userId);
    if (!user) throw new AppError("Usuario nao encontrado", 404);
    return user;
  },
};

function signToken(id: string, email: string) {
  return jwt.sign({ id, email }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn as jwt.SignOptions["expiresIn"],
  });
}
