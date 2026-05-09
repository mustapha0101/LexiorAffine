import { PrismaClient } from '@prisma/client';
import { parseDocFromBinary } from './packages/backend/native/index.js';

async function main() {
  const prisma = new PrismaClient();
  const snapshot = await prisma.snapshot.findFirst({
    where: { id: 'ZdQIK8SNPP0il4kwZi9aC' },
    orderBy: { createdAt: 'desc' }
  });
  if (!snapshot) {
    console.log("Snapshot not found!");
    return;
  }
  const result = parseDocFromBinary(Buffer.from(snapshot.blob), 'ZdQIK8SNPP0il4kwZi9aC');
  console.log(result.blocks.map((b: any) => b.flavour));
  console.log(result.blocks.filter((b: any) => b.flavour === 'affine:attachment').map((b: any) => JSON.stringify(b)));
}

main().finally(() => process.exit(0));
