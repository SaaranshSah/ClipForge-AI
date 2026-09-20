// Prisma singleton with graceful offline/mock fallback.
// In production (Netlify) `prisma generate` runs and @prisma/client resolves to .prisma/client.
// Offline or before `DATABASE_URL` is set, we fall back to a mock that returns empty results and
// throws with a clear message on writes — allowing `next build` and empty-state UI to work.

class MockModel {
  async findUnique() { return null; }
  async findFirst() { return null; }
  async findMany() { return []; }
  async create() { throw new Error("DB not configured — set DATABASE_URL and run: npx prisma migrate dev"); }
  async createMany() { return { count: 0 }; }
  async update() { throw new Error("DB not configured"); }
  async upsert() { throw new Error("DB not configured"); }
  async delete() { throw new Error("DB not configured"); }
  async count() { return 0; }
}
class MockPrismaClient {
  user = new MockModel();
  profile = new MockModel();
  video = new MockModel();
  clip = new MockModel();
  processingJob = new MockModel();
  nicheSettings = new MockModel();
  integration = new MockModel();
  $connect = async () => {};
  $disconnect = async () => {};
  constructor(_opts?: any) {}
}

let PrismaClient: any;
let isMock = false;

try {
  PrismaClient = require("@prisma/client").PrismaClient;
  if (!PrismaClient) throw new Error("PrismaClient missing");
  // Test instantiation — real client throws if not generated
  try {
    // eslint-disable-next-line no-new
    new PrismaClient();
  } catch (e: any) {
    if (e?.message?.includes("did not initialize")) throw e;
    // other instantiation errors are okay (e.g., missing DATABASE_URL at build time is ignored)
  }
} catch {
  PrismaClient = MockPrismaClient;
  isMock = true;
}

const globalForPrisma = globalThis as unknown as {
  prisma: InstanceType<typeof PrismaClient> | undefined;
};

function createPrisma(): InstanceType<typeof PrismaClient> {
  if (isMock) return new MockPrismaClient() as any;
  try {
    return new PrismaClient({
      log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    });
  } catch {
    return new MockPrismaClient() as any;
  }
}

export const prisma: InstanceType<typeof PrismaClient> = globalForPrisma.prisma ?? createPrisma();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export default prisma;
