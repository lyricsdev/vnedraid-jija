import { Prisma, PrismaClient } from "@prisma/client"; // 👈 здесь


export const prisma = new PrismaClient({
    log: ["query", "error", "warn"],
});

