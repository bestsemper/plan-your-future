import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding mock data for Hoos Plan...')

  // SAFETY CHECK: Prevent accidental database wipes
  // This script will NEVER wipe the database without explicit confirmation
  if (process.env.SEED_ALLOW_DELETE_ALL !== 'true') {
    console.error('❌ SAFETY PROTECTION ACTIVE: This seed script will not delete existing data.')
    console.error('⚠️  To clear and reseed the database, set SEED_ALLOW_DELETE_ALL=true')
    console.error('⚠️  Example: SEED_ALLOW_DELETE_ALL=true npm run seed')
    console.error('')
    console.error('💾 Database protection is PERMANENT. The database is safe from accidental wipes.')
    throw new Error('Database deletion requires explicit environment variable confirmation')
  }

  console.log('⚠️  PROCEEDING WITH DATABASE RESET - This will delete all users and badges!')
  
  // Clean up existing - only runs if SEED_ALLOW_DELETE_ALL=true
  await prisma.badge.deleteMany()

  // Badges
  await prisma.badge.createMany({
    data: [
      { name: 'Early Adopter', description: 'Joined during the beta phase.' },
      { name: 'Active Participant', description: 'Consistently helpful in the forum.' },
    ]
  })

  console.log('Seeding complete!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
