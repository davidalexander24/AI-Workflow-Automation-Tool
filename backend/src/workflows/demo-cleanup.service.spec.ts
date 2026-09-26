import { PrismaService } from '../prisma/prisma.service';
import { DemoCleanupService } from './demo-cleanup.service';

describe('DemoCleanupService', () => {
  const deleteMany = jest.fn();
  const prisma = { workflow: { deleteMany } } as unknown as PrismaService;
  const saved = process.env.DEMO_WORKFLOW_TTL_HOURS;

  afterEach(() => {
    jest.resetAllMocks();
    if (saved === undefined) delete process.env.DEMO_WORKFLOW_TTL_HOURS;
    else process.env.DEMO_WORKFLOW_TTL_HOURS = saved;
  });

  it('deletes only unlocked workflows older than the TTL', async () => {
    process.env.DEMO_WORKFLOW_TTL_HOURS = '72';
    deleteMany.mockResolvedValue({ count: 2 });
    const now = new Date('2026-09-26T12:00:00Z');

    const removed = await new DemoCleanupService(prisma).sweep(now);

    expect(removed).toBe(2);
    expect(deleteMany).toHaveBeenCalledWith({
      where: {
        locked: false,
        createdAt: { lt: new Date('2026-09-23T12:00:00Z') },
      },
    });
  });

  it.each([undefined, '0', 'not-a-number', '-5'])(
    'does nothing when the TTL is %p',
    async (ttl) => {
      if (ttl === undefined) delete process.env.DEMO_WORKFLOW_TTL_HOURS;
      else process.env.DEMO_WORKFLOW_TTL_HOURS = ttl;

      expect(await new DemoCleanupService(prisma).sweep()).toBe(0);
      expect(deleteMany).not.toHaveBeenCalled();
    },
  );

  it('survives a database outage', async () => {
    process.env.DEMO_WORKFLOW_TTL_HOURS = '24';
    deleteMany.mockRejectedValue(new Error("Can't reach database server"));

    await expect(new DemoCleanupService(prisma).sweep()).resolves.toBe(0);
  });
});
