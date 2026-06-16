'use client';

import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { SlotState } from './types';

type SlotProps = {
  name: string;
  state: SlotState;
  children: ReactNode;
  /** Base classes; visibility/collapse applied on top */
  className?: string;
  /** When collapsed: width class (e.g. w-0 or w-12) */
  collapsedClass?: string;
  /** When hidden: applied in addition to invisible */
  hiddenClass?: string;
};

export function Slot({
  name,
  state,
  children,
  className,
  collapsedClass = 'w-0 min-w-0 overflow-hidden',
  hiddenClass = 'invisible pointer-events-none',
}: SlotProps) {
  const isHidden = state === 'hidden';
  const isCollapsed = state === 'collapsed';

  return (
    <div
      data-slot={name}
      role={isHidden ? 'presentation' : undefined}
      aria-hidden={isHidden ? true : undefined}
      className={cn(
        isHidden && 'w-0 min-w-0 max-w-0 overflow-hidden',
        isHidden && hiddenClass,
        isCollapsed && collapsedClass,
        className
      )}
    >
      {children}
    </div>
  );
}
