'use client';

import { memo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils';

const UNREAD_RED = 'var(--badge-danger, #ED4245)';
const MENTIONS_PURPLE = 'var(--badge-mention, #9b59b6)';

const spring = { type: 'spring' as const, stiffness: 400, damping: 25 };

interface ServerBadgeProps {
  unread: number;
  mentions: number;
  className?: string;
}

function ServerBadgeComponent({ unread, mentions, className }: ServerBadgeProps) {
  const hasMentions = mentions > 0;
  const count = hasMentions ? mentions : unread;
  const display = count > 99 ? '99+' : String(count);
  const bg = hasMentions ? MENTIONS_PURPLE : UNREAD_RED;
  const visible = count > 0;

  return (
    <AnimatePresence>
      {visible && (
        <motion.span
          key="server-badge"
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.6, opacity: 0 }}
          transition={spring}
          className={cn(
            'absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center',
            'rounded-full text-[10px] font-bold text-white origin-center',
            className
          )}
          style={{ backgroundColor: bg }}
          aria-hidden
        >
          {display}
        </motion.span>
      )}
    </AnimatePresence>
  );
}

export const ServerBadge = memo(ServerBadgeComponent);
