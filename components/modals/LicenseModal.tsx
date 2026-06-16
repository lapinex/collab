'use client';

import { Button } from '@/components/ui/button';

type LicenseModalProps = {
  onAccept: () => void;
  onReject?: () => void;
  isLoading?: boolean;
  isRequired?: boolean;
};

export function LicenseModal({
  onAccept,
  onReject,
  isLoading = false,
  isRequired = false,
}: LicenseModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg bg-bg-secondary shadow-2xl border border-border-primary">
        <div className="border-b border-border-primary px-6 py-4">
          <h2 className="text-xl font-semibold text-text-primary">License Agreement</h2>
          <p className="mt-1 text-sm text-text-secondary">
            {isRequired ? 'You must accept the license to continue.' : 'Please review the license.'}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 text-sm text-text-primary">
          <div className="space-y-4">
            <p>
              By continuing you agree to the terms of use.
            </p>
          </div>
        </div>

        <div className="border-t border-border-primary px-6 py-4 flex items-center justify-end gap-3">
          {!isRequired && onReject ? (
            <Button variant="outline" onClick={onReject} disabled={isLoading}>
              Reject
            </Button>
          ) : null}
          <Button onClick={onAccept} disabled={isLoading}>
            {isLoading ? 'Accepting...' : 'Accept License'}
          </Button>
        </div>
      </div>
    </div>
  );
}
