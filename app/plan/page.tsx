import { PrismaClient } from '@prisma/client';
import PlanView from './PlanView';
import { getAllPossibleCoursesFromCSV } from '../actions';

const prisma = new PrismaClient();

export default async function PlanBuilder() {
  // Mock auth for now
  let user = await prisma.user.findFirst({ where: { computingId: 'wahoo99' } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        computingId: 'wahoo99',
        displayName: 'wahoo99',
        major: 'Computer Science (BA)'
      }
    });
  }

  const plans = await prisma.plan.findMany({
    where: { userId: user.id },
    include: {
      semesters: {
        include: { courses: true },
        orderBy: { termOrder: 'asc' }
      }
    },
    orderBy: { createdAt: 'desc' }
  });

  const allCourses = await getAllPossibleCoursesFromCSV();

  return <PlanView userId={user.id} plans={plans} allCourses={allCourses} />;
}
