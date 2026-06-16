'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { inputLikeTriggerClass, listItemInteractiveClass } from '@/lib/ui/classes';

interface SelectContextValue {
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  valueToLabel: Map<string, string>;
  values: string[];
  registerValue: (value: string, label: string) => void;
  closeMenuRef: React.MutableRefObject<(() => void) | null>;
  allChildren: React.ReactNode;
}

const SelectContext = React.createContext<SelectContextValue | null>(null);

interface SelectProps {
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  children: React.ReactNode;
}

export function Select({ value, onValueChange, disabled, children }: SelectProps) {
  const [valueToLabel] = React.useState(() => new Map<string, string>());
  const [values, setValues] = React.useState<string[]>([]);
  const closeMenuRef = React.useRef<(() => void) | null>(null);
  
  const registerValue = React.useCallback((val: string, label: string) => {
    valueToLabel.set(val, label);
    setValues((prev) => (prev.includes(val) ? prev : [...prev, val]));
  }, [valueToLabel]);

  // Filter out SelectContent from original render - it will be rendered only in the dropdown
  const filteredChildren = React.useMemo(() => {
    return React.Children.map(children, (child) => {
      if (React.isValidElement(child) && child.type === SelectContent) {
        return null; // Don't render SelectContent in the original place
      }
      return child;
    });
  }, [children]);

  return (
    <SelectContext.Provider value={{ value, onValueChange, disabled, valueToLabel, values, registerValue, closeMenuRef, allChildren: children }}>
      <div className="relative">{filteredChildren}</div>
    </SelectContext.Provider>
  );
}

interface SelectTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
}

export function SelectTrigger({ children, className, ...props }: SelectTriggerProps) {
  const context = React.useContext(SelectContext);
  const [isOpen, setIsOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);
  const menuId = React.useId();
  const [activeIndex, setActiveIndex] = React.useState(0);

  // Register closeMenu function in context
  React.useEffect(() => {
    if (context) {
      context.closeMenuRef.current = () => setIsOpen(false);
    }
  }, [context, isOpen]);

  // Close menu when clicking outside
  React.useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Reset active index when opening
  React.useEffect(() => {
    if (!isOpen) return;
    const idx = Math.max(0, (context?.values ?? []).findIndex((v) => v === context?.value));
    setActiveIndex(idx >= 0 ? idx : 0);
  }, [isOpen, context?.value, context?.values]);

  React.useEffect(() => {
    if (!isOpen) return;
    // Focus the listbox so arrow keys work immediately
    setTimeout(() => {
      menuRef.current?.focus();
    }, 0);
  }, [isOpen]);

  return (
    <>
      <button
        type="button"
        className={cn(inputLikeTriggerClass, className)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={menuId}
        onClick={() => !context?.disabled && setIsOpen(!isOpen)}
        disabled={context?.disabled}
        onKeyDown={(e) => {
          if (context?.disabled) return;
          if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setIsOpen(true);
          }
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            setIsOpen(true);
          }
          if (e.key === 'Escape') {
            setIsOpen(false);
          }
        }}
        {...props}
      >
        {children}
        <svg
          className="h-4 w-4 opacity-50"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>
      {/* Always render SelectContent to register values, but hide when closed */}
      <div
        ref={menuRef}
        className={cn(
          'absolute z-dropdown mt-1 w-full rounded-md border border-border-primary bg-bg-secondary shadow-elev-2',
          !isOpen && 'hidden'
        )}
        id={menuId}
        role="listbox"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          const values = context?.values ?? [];
          if (e.key === 'Escape') {
            e.preventDefault();
            setIsOpen(false);
            return;
          }
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveIndex((i) => Math.min(i + 1, Math.max(values.length - 1, 0)));
          }
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveIndex((i) => Math.max(i - 1, 0));
          }
          if (e.key === 'Home') {
            e.preventDefault();
            setActiveIndex(0);
          }
          if (e.key === 'End') {
            e.preventDefault();
            setActiveIndex(Math.max(values.length - 1, 0));
          }
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            const v = values[activeIndex];
            if (v != null) {
              context?.onValueChange(v);
              setIsOpen(false);
            }
          }
        }}
      >
        <div className="p-1">
          {React.Children.map(context?.allChildren, (child) => {
            if (React.isValidElement(child) && child.type === SelectContent) {
              return child.props.children;
            }
            return null;
          })}
        </div>
      </div>
    </>
  );
}

export function SelectValue({ children }: { children?: React.ReactNode }) {
  const context = React.useContext(SelectContext);
  
  // If children provided, use them
  if (children) {
    return <span>{children}</span>;
  }
  
  // Otherwise, find the label for the current value
  if (context?.value) {
    const label = context.valueToLabel.get(context.value);
    if (label) {
      return <span>{label}</span>;
    }
  }
  
  return <span>{context?.value || 'Select...'}</span>;
}

interface SelectContentProps {
  children: React.ReactNode;
}

export function SelectContent({ children }: SelectContentProps) {
  return <>{children}</>;
}

interface SelectItemProps {
  value: string;
  children: React.ReactNode;
}

export function SelectItem({ value, children }: SelectItemProps) {
  const context = React.useContext(SelectContext);
  const isSelected = context?.value === value;

  // Extract text from children synchronously
  const extractText = React.useMemo(() => {
    if (typeof children === 'string') return children;
    if (typeof children === 'number') return String(children);
    if (React.isValidElement(children) && children.props.children) {
      const extract = (node: React.ReactNode): string => {
        if (typeof node === 'string') return node;
        if (typeof node === 'number') return String(node);
        if (React.isValidElement(node) && node.props.children) {
          return extract(node.props.children);
        }
        if (Array.isArray(node)) {
          return node.map(extract).join('');
        }
        return '';
      };
      return extract(children.props.children);
    }
    if (Array.isArray(children)) {
      return children.map(child => {
        if (typeof child === 'string') return child;
        if (typeof child === 'number') return String(child);
        return '';
      }).join('');
    }
    return '';
  }, [children]);

  React.useEffect(() => {
    if (context && extractText) {
      context.registerValue(value, extractText);
    }
  }, [context, value, extractText]);

  return (
    <div
      className={cn(
        'relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none',
        listItemInteractiveClass,
        isSelected && 'bg-bg-hover text-green-primary'
      )}
      role="option"
      aria-selected={isSelected}
      tabIndex={0}
      onClick={() => {
        context?.onValueChange(value);
        context?.closeMenuRef.current?.();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          context?.onValueChange(value);
          context?.closeMenuRef.current?.();
        }
        if (e.key === 'Escape') {
          context?.closeMenuRef.current?.();
        }
      }}
    >
      {children}
    </div>
  );
}
