import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';
import bcrypt from 'bcrypt';
import { v4 as uuid } from 'uuid';

const prisma = new PrismaClient({
  datasources: {
    db: { url: `${process.env.VENDOR_SEEDER_DB}` },
  },
})

function generateClientId(): string {
  return `client_${uuid().replace(/-/g, '').slice(0, 12)}`;
}

function generateSecretId(): string {
  return crypto.randomBytes(32).toString('hex');
}

async function main() {
  const passwordHash = await bcrypt.hash('Admin@123', 10)
  const clientId = await generateClientId();
  const secretId = await generateSecretId();

  const vendor = await prisma.vendors.upsert({
    where: {
      email: `admin@${process.env.CLIENT_ENV}.com`,
    },
    update: {},
    create: {
      name: 'Super Admin',

      email: `admin@${process.env.CLIENT_ENV}.com`,
      password: passwordHash,

      clientId: clientId,
      secretId: secretId,

      tag: 'admin',

      // percentage: 5,

      isActive: true,
    },
  })

  console.log('Admin vendor created:', vendor)
}

main()
  .catch((e) => {
    console.error("error-----------", e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })