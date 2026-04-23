import Link from 'next/link';
import StartTutorialButton from './StartTutorialButton';
import FaqAccordion from './FaqAccordion';

export default function HelpPage() {
  return (
    <div className="w-full flex flex-col gap-8">

      <div className="border-b border-panel-border pb-6">
        <h1 className="text-3xl font-bold text-heading mb-1">Help</h1>
        <p className="text-text-secondary text-sm">Learn how to use Hoos&apos; Plan, or reach out if you need something.</p>
      </div>

      <StartTutorialButton />

      <div>
        <p className="text-xs font-semibold text-text-tertiary uppercase tracking-widest mb-3">Frequently Asked Questions</p>
        <FaqAccordion />
      </div>

      <div>
        <p className="text-xs font-semibold text-text-tertiary uppercase tracking-widest mb-3">Still need help?</p>
        <div className="bg-panel-bg border border-panel-border rounded-2xl px-6 py-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 sm:gap-6">
          <div>
            <p className="text-sm font-bold text-heading mb-1">Get in touch</p>
            <p className="text-sm text-text-secondary leading-relaxed max-w-sm">
              Bug report, feature request, or general feedback? Reach out and we&apos;ll get back to you.
            </p>
          </div>
          <Link
            href="mailto:contact@hoosplan.com"
            className="shrink-0 inline-flex items-center gap-1.5 text-sm font-semibold text-heading border border-panel-border-strong rounded-full px-4 py-2 hover:bg-hover-bg transition-colors whitespace-nowrap"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
            contact@hoosplan.com
          </Link>
        </div>
      </div>


    </div>
  );
}
