'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { focusClass, controlBaseClass, controlHeightClass } from '@/lib/ui/classes';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'destructive' | 'outline' | 'ghost' | 'secondary';
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', ...props }, ref) => {
    return (
      <button
        className={cn(
          'inline-flex items-center justify-center rounded-md font-medium',
          controlBaseClass,
          focusClass,
          'active:scale-[0.98]',
          
          // Variants
          {
            // Default - Green interactive button
            'bg-green-primary text-bg-primary hover:bg-green-hover active:bg-green-active': 
              variant === 'default',
            
            // Destructive - Red danger button
            'bg-danger text-text-primary hover:bg-danger/90 active:bg-danger/80':
              variant === 'destructive',
            
            // Outline - Bordered button
            'border border-border-primary bg-transparent text-text-primary hover:bg-bg-hover hover:border-green-primary active:bg-bg-active':
              variant === 'outline',
            
            // Ghost - Minimal button
            'bg-transparent text-text-secondary hover:bg-bg-hover hover:text-text-primary active:bg-bg-active':
              variant === 'ghost',
              
            // Secondary - Subtle button
            'bg-bg-tertiary text-text-primary hover:bg-bg-hover active:bg-bg-active':
              variant === 'secondary',
          },
          
          // Sizes
          {
            [controlHeightClass]: size === 'default',
            'px-4 py-2 text-sm': size === 'default',
            'h-8 px-3 text-xs': size === 'sm',
            'h-11 px-6 text-base': size === 'lg',
            'h-9 w-9 p-0': size === 'icon',
          },
          
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);

Button.displayName = 'Button';

export { Button };
