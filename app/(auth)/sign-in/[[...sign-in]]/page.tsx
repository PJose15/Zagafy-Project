import { SignIn } from '@clerk/nextjs';
import { isAuthEnabled } from '@/lib/auth';
import { AuthUnavailable } from '../../_components/auth-unavailable';

export default function SignInPage() {
  if (!isAuthEnabled()) return <AuthUnavailable />;
  return <SignIn signUpUrl="/sign-up" forceRedirectUrl="/" />;
}
