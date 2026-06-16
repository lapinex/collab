'use client';

import { memo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils';

const MENTIONS_PURPLE = 'var(--badge-mention, #9b59b6)';

interface ChannelBadgeProps {
  unread: number;
  mentions: number;
  isSelected: boolean;
  channelName: string;
  className?: string;
  inline?: boolean;
}

const spring = { type: 'spring' as const, stiffness: 400, damping: 25 };

function ChannelBadgeComponent({
  unread,
  mentions,
  isSelected: _isSelected,
  channelName: _channelName,
  className,
  inline = false,
}: ChannelBadgeProps) {
  const hasMentions = mentions > 0;
  const count = hasMentions ? mentions : unread;
  const display = count > 99 ? '99+' : String(count);
  const visible = count > 0;
  const bg = hasMentions ? MENTIONS_PURPLE : 'var(--badge-unread, #4f545c)';

  const content = (
    <AnimatePresence>
      {visible && (
        <motion.span
          key="channel-badge"
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.6, opacity: 0 }}
          transition={spring}
          className={cn(
            'flex items-center justify-center rounded-full text-[10px] font-bold text-white origin-center',
            inline ? 'ml-1 min-w-[16px] h-4 px-1' : 'min-w-[18px] h-[18px] px-1',
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

  return content;
}

export const ChannelBadge = memo(ChannelBadgeComponent);

/** Resolve channel row style: mentions > 0 → purple name + purple badge; unread > 0 → white/bold + gray badge; else default */
export function channelRowBadgeClass(
  unread: number,
  mentions: number,
  isSelected: boolean
): { nameClass: string; showBadge: boolean } {
  if (isSelected) return { nameClass: '', showBadge: false };
  if (mentions > 0) return { nameClass: 'text-[#9b59b6] font-semibold', showBadge: true };
  if (unread > 0) return { nameClass: 'text-text-primary font-semibold', showBadge: true };
  return { nameClass: '', showBadge: false };
}
