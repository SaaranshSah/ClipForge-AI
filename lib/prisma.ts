// Prisma singleton with graceful offline/mock fallback.
// In production (Netlify) `prisma generate` runs and @prisma/client resolves to .prisma/client.
// Offline or before `DATABASE_URL` is set, we fall back to an in-memory mock that simulates
// the DB so auth and empty-state UI work without a real Postgres connection.
// This allows `next build` and `next dev` to function offline and lets Firebase users
// immediately see the dashboard (with realistic empty states) before migrations.

type WhereUnique = Record<string, any>;
type CreateArgs = { data: any; select?: any };
type FindArgs = { where?: WhereUnique; select?: any };

// Simple in-memory stores for mock
const mockStore = {
  usersById: new Map<string, any>(),
  usersByEmail: new Map<string, any>(),
  profiles: new Map<string, any>(),
  niche: new Map<string, any>(),
  integrations: new Map<string, any[]>(),
  videos: [] as any[],
  clips: [] as any[],
  jobs: [] as any[],
};

function cuid() {
  return "mock_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

function createMockClient() {
  const user = {
    async findUnique(args: FindArgs) {
      const w = args.where || {};
      let found: any = null;
      if (w.email) found = mockStore.usersByEmail.get(w.email.toLowerCase()) || null;
      else if (w.id) found = mockStore.usersById.get(w.id) || null;
      else if (w.userId) found = mockStore.usersByEmail.get(w.userId) || null;
      if (!found) return null;
      if (args.select) {
        const sel: any = {};
        for (const k of Object.keys(args.select)) if (args.select[k]) sel[k] = found[k];
        return sel;
      }
      return found;
    },
    async findFirst(args: FindArgs) {
      return (await user.findUnique(args)) as any;
    },
    async findMany() {
      return Array.from(mockStore.usersById.values());
    },
    async create(args: CreateArgs) {
      const data = args.data;
      const id = cuid();
      const email = (data.email || "").toLowerCase();
      const newUser: any = {
        id,
        email,
        name: data.name || null,
        password: data.password || `firebase:${id}`,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockStore.usersById.set(id, newUser);
      if (email) mockStore.usersByEmail.set(email, newUser);
      // nested creates — just seed related stores so subsequent reads don't 404
      if (data.profile?.create) {
        mockStore.profiles.set(id, { id: cuid(), userId: id, ...data.profile.create, createdAt: new Date(), updatedAt: new Date() });
      }
      if (data.nicheSettings?.create) {
        mockStore.niche.set(id, { id: cuid(), userId: id, ...data.nicheSettings.create, createdAt: new Date(), updatedAt: new Date() });
      }
      if (data.integrations?.create) {
        const arr = Array.isArray(data.integrations.create) ? data.integrations.create : [data.integrations.create];
        mockStore.integrations.set(id, arr.map((x: any) => ({ id: cuid(), userId: id, ...x, createdAt: new Date(), updatedAt: new Date() })));
      }
      if (args.select) {
        const sel: any = {};
        for (const k of Object.keys(args.select)) if (args.select[k]) sel[k] = newUser[k];
        return sel;
      }
      return newUser;
    },
    async update(args: { where: WhereUnique; data: any; select?: any }) {
      const existing = await user.findUnique({ where: args.where });
      if (!existing) throw new Error("User not found (mock)");
      Object.assign(existing, args.data, { updatedAt: new Date() });
      if (args.data.email) {
        mockStore.usersByEmail.set(args.data.email.toLowerCase(), existing);
      }
      if (args.select) {
        const sel: any = {};
        for (const k of Object.keys(args.select)) if (args.select[k]) sel[k] = existing[k];
        return sel;
      }
      return existing;
    },
    async upsert(args: { where: WhereUnique; update: any; create: any }) {
      const found = await user.findUnique({ where: args.where });
      if (found) return user.update({ where: args.where, data: args.update });
      return user.create({ data: args.create });
    },
    async count() {
      return mockStore.usersById.size;
    },
  };

  const profile = {
    async findUnique(args: FindArgs) {
      const w = args.where || {};
      if (w.userId) return mockStore.profiles.get(w.userId) || null;
      return null;
    },
    async upsert(args: { where: WhereUnique; update: any; create: any }) {
      const uid = args.where.userId;
      const existing = mockStore.profiles.get(uid);
      if (existing) {
        Object.assign(existing, args.update, { updatedAt: new Date() });
        return existing;
      }
      const created = { id: cuid(), userId: uid, ...args.create, createdAt: new Date(), updatedAt: new Date() };
      mockStore.profiles.set(uid, created);
      return created;
    },
    async create(args: CreateArgs) {
      const rec = { id: cuid(), ...args.data, createdAt: new Date(), updatedAt: new Date() };
      if (args.data.userId) mockStore.profiles.set(args.data.userId, rec);
      return rec;
    },
  };

  const nicheSettings = {
    async findUnique(args: FindArgs) {
      if (args.where?.userId) return mockStore.niche.get(args.where.userId) || null;
      return null;
    },
    async upsert(args: { where: WhereUnique; update: any; create: any }) {
      const uid = args.where.userId;
      const existing = mockStore.niche.get(uid);
      if (existing) {
        Object.assign(existing, args.update, { updatedAt: new Date() });
        return existing;
      }
      const created = { id: cuid(), userId: uid, ...args.create, createdAt: new Date(), updatedAt: new Date() };
      mockStore.niche.set(uid, created);
      return created;
    },
  };

  const integration = {
    async findMany(args: { where?: any }) {
      const uid = args.where?.userId;
      if (uid && mockStore.integrations.has(uid)) return mockStore.integrations.get(uid)!;
      // default: return disconnected placeholders so UI doesn't show empty
      if (uid) {
        const defaults = [
          { id: cuid(), userId: uid, provider: "YOUTUBE", status: "DISCONNECTED", externalAccountName: null, connectedAt: null, createdAt: new Date(), updatedAt: new Date() },
          { id: cuid(), userId: uid, provider: "INSTAGRAM", status: "DISCONNECTED", externalAccountName: null, connectedAt: null, createdAt: new Date(), updatedAt: new Date() },
        ];
        mockStore.integrations.set(uid, defaults);
        return defaults;
      }
      return [];
    },
    async create(args: CreateArgs) {
      const rec = { id: cuid(), ...args.data, createdAt: new Date(), updatedAt: new Date() };
      const uid = args.data.userId;
      if (uid) {
        const arr = mockStore.integrations.get(uid) || [];
        arr.push(rec);
        mockStore.integrations.set(uid, arr);
      }
      return rec;
    },
    async findUnique() { return null; },
  };

  const video = {
    async findMany(args: { where?: any }) {
      const uid = args.where?.userId;
      if (!uid) return mockStore.videos;
      let arr = mockStore.videos.filter((v) => v.userId === uid);
      if (args.where?.filename?.contains) {
        const q = args.where.filename.contains.toLowerCase();
        arr = arr.filter((v) => v.filename.toLowerCase().includes(q));
      }
      if (args.where?.status) arr = arr.filter((v) => v.status === args.where.status);
      return arr;
    },
    async findFirst(args: FindArgs) {
      const w = args.where || {};
      return mockStore.videos.find((v) => v.id === w.id && v.userId === w.userId) || null;
    },
    async findUnique(args: FindArgs) { return video.findFirst(args); },
    async create(args: CreateArgs) {
      const rec = {
        id: cuid(),
        status: "PENDING",
        duration: null,
        storageUrl: null,
        storageKey: null,
        mimeType: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        _count: { clips: 0 },
        ...args.data,
      };
      mockStore.videos.push(rec);
      return rec;
    },
    async update(args: { where: WhereUnique; data: any }) {
      const idx = mockStore.videos.findIndex((v) => v.id === args.where.id);
      if (idx === -1) throw new Error("Video not found (mock)");
      Object.assign(mockStore.videos[idx], args.data, { updatedAt: new Date() });
      return mockStore.videos[idx];
    },
    async count(args: { where?: any }) {
      return (await video.findMany(args)).length;
    },
  };

  const clip = {
    async findMany(args: { where?: any }) {
      const uid = args.where?.userId;
      if (!uid) return mockStore.clips;
      let arr = mockStore.clips.filter((c) => c.userId === uid);
      if (args.where?.OR) {
        // simple OR for search — just return arr (mock search is lenient)
      }
      return arr;
    },
    async count(args: { where?: any }) { return (await clip.findMany(args)).length; },
  };

  const processingJob = {
    async findMany(args: { where?: any }) {
      const uid = args.where?.userId;
      if (!uid) return mockStore.jobs;
      return mockStore.jobs.filter((j) => j.userId === uid);
    },
    async create(args: CreateArgs) {
      const rec = { id: cuid(), status: "QUEUED", progress: 0, error: null, createdAt: new Date(), updatedAt: new Date(), ...args.data };
      mockStore.jobs.push(rec);
      return rec;
    },
    async count(args: { where?: any }) { return (await processingJob.findMany(args)).length; },
  };

  // expose _count for video include simulation
  return {
    user,
    profile,
    video: Object.assign(video, { count: video.count }),
    clip: Object.assign(clip, { count: clip.count }),
    processingJob: Object.assign(processingJob, { count: processingJob.count }),
    nicheSettings,
    integration,
    $connect: async () => {},
    $disconnect: async () => {},
  } as any;
}

let PrismaClient: any;
let isMock = false;

try {
  PrismaClient = require("@prisma/client").PrismaClient;
  if (!PrismaClient) throw new Error("PrismaClient missing");
  try {
    // eslint-disable-next-line no-new
    new PrismaClient();
  } catch (e: any) {
    if (e?.message?.includes("did not initialize")) throw e;
  }
} catch {
  PrismaClient = null;
  isMock = true;
}

const globalForPrisma = globalThis as unknown as {
  prisma: any | undefined;
};

function createPrisma(): any {
  if (isMock || !PrismaClient) return createMockClient();
  try {
    return new PrismaClient({
      log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    });
  } catch {
    return createMockClient();
  }
}

export const prisma: any = globalForPrisma.prisma ?? createPrisma();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export default prisma;
