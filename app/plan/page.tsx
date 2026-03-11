import { PrismaClient } from '@prisma/client';
import PlanView from './PlanView';
import { getAllPossibleCoursesFromCSV, getCurrentUser } from '../actions';
import { redirect } from 'next/navigation';

const prisma = new PrismaClient();

export default async function PlanBuilder() {
  const user = await getCurrentUser();
  
  if (!user) {
    redirect('/login');
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
