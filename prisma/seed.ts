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
  await prisma.user.deleteMany()
  await prisma.badge.deleteMany()

  // 1. Badges
  const badge1 = await prisma.badge.create({
    data: { name: 'Early Adopter', description: 'Joined during the beta phase.' }
  })
  const badge2 = await prisma.badge.create({
    data: { name: 'Active Participant', description: 'Consistently helpful in the forum.' }
  })

  // 2. User
  const mockUser = await prisma.user.create({
    data: {
      computingId: 'wahoo99',
      displayName: 'Mock User',
      major: 'Computer Science (BA)',
    }
  })

  await prisma.userBadge.createMany({
    data: [
      { userId: mockUser.id, badgeId: badge1.id },
      { userId: mockUser.id, badgeId: badge2.id },
    ]
  })

  // 3. Goal Profile
  await prisma.goalProfile.create({
    data: {
      userId: mockUser.id,
      studyAbroad: true,
      earlyGraduation: false,
    }
  })

  // 4. Completed Courses (Mock)
  await prisma.completedCourse.createMany({
    data: [
      { userId: mockUser.id, courseCode: 'CS 1110', sourceType: 'UVA', title: 'Intro to Programming' },
      { userId: mockUser.id, courseCode: 'APMA 1110', sourceType: 'AP', title: 'Single Variable Calc' }
    ]
  })

  // 5. Plan & Semesters
  const plan = await prisma.plan.create({
    data: {
      userId: mockUser.id,
      title: 'My 4-Year CS Plan',
      isPublished: true,
      semesters: {
        create: [
          {
            termName: 'Fall', termOrder: 1, year: 2022,
            courses: { create: [{ courseCode: 'CS 1110', creditsMin: 3, creditsMax: 3 }, { courseCode: 'ENWR 1510', creditsMin: 3, creditsMax: 3 }] }
          },
          {
            termName: 'Spring', termOrder: 2, year: 2023,
            courses: { create: [{ courseCode: 'CS 2100', creditsMin: 4, creditsMax: 4 }, { courseCode: 'APMA 1090', creditsMin: 4, creditsMax: 4 }] }
          }
        ]
      }
    }
  })

  // 6. Forum Post
  await prisma.forumPost.create({
    data: {
      title: 'Is this BSCS schedule too heavy for 3rd year Fall?',
      body: 'I am taking CS 2150 and CS 3102 at the same time. Thoughts?',
      authorId: mockUser.id,
      attachedPlanId: plan.id,
      viewCount: 45,
      answers: {
        create: [
          {
            body: 'It is very tough. Make sure you dedicate a lot of time to 2150.',
            authorId: mockUser.id
          }
        ]
      }
    }
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
