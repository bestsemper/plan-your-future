import AttachedPlanModalProvider from './AttachedPlanModalProvider';

export default function ForumLayout({ children }: { children: React.ReactNode }) {
  return <AttachedPlanModalProvider>{children}</AttachedPlanModalProvider>;
}
