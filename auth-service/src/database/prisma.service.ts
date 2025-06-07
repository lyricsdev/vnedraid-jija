import { PrismaClient } from '@prisma/client';

class PrismaService {
  public readonly client: PrismaClient;

  constructor() {
    this.client = new PrismaClient();
  }

  async connect(): Promise<void> {
    await this.client.$connect();
  }

  async disconnect(): Promise<void> {
    await this.client.$disconnect();
  }
}


module.exports = new PrismaClient()