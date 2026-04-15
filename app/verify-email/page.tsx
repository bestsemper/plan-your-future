import { Icon } from '../components/Icon';

export default function VerifyEmailPage() {
  return (
    <div className="max-w-5xl mx-auto py-10 px-4">
      <div className="max-w-lg mx-auto bg-panel-bg border border-panel-border shadow-sm p-8 rounded-3xl">
        <div className="flex flex-col mb-7 border-b border-panel-border pb-6">
          <div className="flex justify-between items-center mb-2">
            <h1 className="text-3xl font-bold text-heading">Check Your Email</h1>
          </div>
          <p className="text-text-secondary text-sm font-medium">
            We sent a verification link to your <span className="font-semibold text-text-primary">@virginia.edu</span> address.
          </p>
        </div>

        <div className="flex flex-col items-center text-center gap-3 py-2">
          <div className="w-14 h-14 rounded-full bg-uva-blue/10 flex items-center justify-center">
            <Icon name="mail" color="currentColor" width={28} height={28} className="text-uva-blue" />
          </div>
          <p className="text-text-secondary text-sm font-medium mt-1">
            Click the link in that email to verify your account.
          </p>
          <p className="text-text-secondary text-sm">
            The link expires in 15 minutes. If you don&apos;t see it, check your spam folder.
          </p>
          <a href="/login" className="mt-1 text-sm text-uva-blue hover:underline font-medium">
            Back to Sign In
          </a>
        </div>
      </div>
    </div>
  );
}
