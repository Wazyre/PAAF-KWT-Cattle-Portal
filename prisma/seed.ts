import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Test citizens. Civil ID format: 12 digits (Kuwait civil number).
const citizens = [
  { civilId: "287010112345", name: "عبدالله سالم أحمد" },
  { civilId: "290051509876", name: "فهد محمد مبارك" },
  { civilId: "275112207654", name: "ناصر خالد سعد" },
  { civilId: "281030411223", name: "يوسف فالح خالد" },
  { civilId: "293070855667", name: "مبارك دخيل عبيد" },
  { civilId: "278092133445", name: "سعد عبيد ناصر" }
];

// Test supervisors.
const supervisors = [
  { civilId: "289050133211", name: "علي أحمد حسن" },
  { civilId: "276030244567", name: "محمد حسن عبدالله" },
  { civilId: "284090355432", name: "خالد عبدالله سعد" },
  { civilId: "291060466789", name: "عبدالرحمن سعد محمد" }
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

  for (const s of supervisors) {
    await prisma.supervisor.upsert({
      where: { civilId: s.civilId },
      update: { name: s.name },
      create: s
    });
  }
  console.log(`Seeded ${supervisors.length} supervisors.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
