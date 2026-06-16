'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { inputClass } from '@/lib/ui/classes';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          inputClass,
          'file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-green-primary',
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);

Input.displayName = 'Input';

export { Input };
