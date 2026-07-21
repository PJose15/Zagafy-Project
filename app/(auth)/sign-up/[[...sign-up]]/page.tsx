import { SignUp } from '@clerk/nextjs';
import { isAuthEnabled } from '@/lib/auth';
import { AuthUnavailable } from '../../_components/auth-unavailable';

export default function SignUpPage() {
  if (!isAuthEnabled()) return <AuthUnavailable />;
  return <SignUp signInUrl="/sign-in" forceRedirectUrl="/" />;
}
