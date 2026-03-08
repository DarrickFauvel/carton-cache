import { PrismaClient } from '@prisma/client'
import { PrismaLibSQL } from '@prisma/adapter-libsql'
import { createClient } from '@libsql/client'

function createPrisma() {
  const url = process.env.DATABASE_URL ?? ''
  if (url.startsWith('libsql://') || url.startsWith('https://')) {
    const libsql = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN })
    const adapter = new PrismaLibSQL(libsql)
    return new PrismaClient({ adapter })
  }
  return new PrismaClient()
}

const globalForPrisma = globalThis as unknown as { __prisma: PrismaClient }
const prisma = globalForPrisma.__prisma ?? createPrisma()
if (process.env.NODE_ENV !== 'production') globalForPrisma.__prisma = prisma
export default prisma
