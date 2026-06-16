'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Hook that checks if the user has accepted the license agreement.
 * Uses the value pre-fetched server-side — no extra API calls.
 * If not accepted, redirects to /accept-license once.
 */
export function useLicenseGuard(licenseAccepted: boolean): void {
  const router = useRouter();

  useEffect(() => {
    if (!licenseAccepted) {
      router.push('/accept-license');
    }
    // Run only once on mount — licenseAccepted comes from server bootstrap
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
