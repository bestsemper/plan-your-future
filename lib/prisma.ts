import { PrismaClient } from '@prisma/client'

const prismaClientSingleton = () => {
  return new PrismaClient({
    log: [
      { level: 'warn', emit: 'stdout' },
      { level: 'error', emit: 'stdout' },
    ],
  })
}

declare const globalThis: {
  prismaGlobal: ReturnType<typeof prismaClientSingleton>;
} & typeof global;

const prisma = globalThis.prismaGlobal ?? prismaClientSingleton()

// Add connection event handlers to detect and recover from disconnections
if (process.env.NODE_ENV !== 'production') {
  prisma.$on('error', (e) => {
    console.error('Prisma error event:', e)
  })

  prisma.$on('warn', (e) => {
    console.warn('Prisma warn event:', e)
  })

  globalThis.prismaGlobal = prisma
}

export default prisma
