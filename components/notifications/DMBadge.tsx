'use client';

import { memo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils';

const spring = { type: 'spring' as const, stiffness: 400, damping: 25 };

interface DMBadgeProps {
  unread: number;
  className?: string;
}

function DMBadgeComponent({ unread, className }: DMBadgeProps) {
  const visible = unread > 0;
  const display = unread > 99 ? '99+' : String(unread);

  return (
    <AnimatePresence>
      {visible && (
        <motion.span
          key="dm-badge"
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.6, opacity: 0 }}
          transition={spring}
          className={cn(
            'absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center',
            'rounded-full text-[10px] font-bold text-white origin-center',
            className
          )}
          style={{ backgroundColor: 'var(--badge-danger, #ED4245)' }}
          aria-hidden
        >
          {display}
        </motion.span>
      )}
    </AnimatePresence>
  );
}

export const DMBadge = memo(DMBadgeComponent);
