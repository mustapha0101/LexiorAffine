import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

async function main() {
  await db.aiPrompt.updateMany({
    data: {
      modified: false
    }
  });
  console.log("Successfully reset all ai prompts modified flag to false");
  
  await db.$disconnect();
}

main().catch(console.error);
