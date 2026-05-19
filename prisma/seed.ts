import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Test citizens. Civil ID format: 12 digits (Kuwait civil number).
const citizens = [
  { civilId: "287010112345", name: "عبدالله سالم المطيري" },
  { civilId: "290051509876", name: "فهد محمد العنزي" },
  { civilId: "275112207654", name: "ناصر خالد الرشيدي" },
  { civilId: "281030411223", name: "يوسف فالح العازمي" },
  { civilId: "293070855667", name: "مبارك دخيل الشمري" },
  { civilId: "278092133445", name: "سعد عبيد الهاجري" }
];

async function main() {
  for (const c of citizens) {
    await prisma.citizen.upsert({
      where: { civilId: c.civilId },
      update: { name: c.name },
      create: c
    });
  }
  console.log(`Seeded ${citizens.length} citizens.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
