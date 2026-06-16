'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

interface ContextMenuItem {
  label: string;
  icon?: React.ReactNode;
  onClick?: () => void;
  variant?: 'default' | 'danger';
  disabled?: boolean;
  separator?: boolean;
  submenu?: ContextMenuItem[];
  submenuContent?: React.ReactNode; // Custom React component for submenu
}

interface ContextMenuProps {
  items: ContextMenuItem[];
  position: { x: number; y: number };
  onClose: () => void;
}

export function ContextMenu({ items, position, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [hoveredItemIndex, setHoveredItemIndex] = useState<number | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  // Adjust position to keep menu in viewport
  const [adjustedPosition, setAdjustedPosition] = useState(position);

  useEffect(() => {
    if (menuRef.current && mounted) {
      const rect = menuRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let x = position.x;
      let y = position.y;

      // Adjust horizontal position
      if (x + rect.width > viewportWidth) {
        x = viewportWidth - rect.width - 10;
      }
      if (x < 0) {
        x = 10;
      }

      // Adjust vertical position
      if (y + rect.height > viewportHeight) {
        y = viewportHeight - rect.height - 10;
      }
      if (y < 0) {
        y = 10;
      }

      setAdjustedPosition({ x, y });
    }
  }, [position, mounted]);

  if (!mounted) return null;

  const menuContent = (
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[200px] bg-bg-secondary border border-border-primary rounded-md shadow-lg py-1"
      style={{
        left: `${adjustedPosition.x}px`,
        top: `${adjustedPosition.y}px`,
      }}
    >
      {items.map((item, index) => {
        if (item.separator) {
          return <div key={index} className="h-px bg-border-primary my-1" />;
        }

        const hasSubmenu = item.submenu && item.submenu.length > 0;
        const isHovered = hoveredItemIndex === index;

        return (
          <div
            key={index}
            className="relative"
            onMouseEnter={() => hasSubmenu && setHoveredItemIndex(index)}
            onMouseLeave={() => hasSubmenu && setHoveredItemIndex(null)}
          >
            <button
              onClick={() => {
                if (!item.disabled && !hasSubmenu && item.onClick) {
                  item.onClick();
                  onClose();
                }
              }}
              disabled={item.disabled}
              className={cn(
                'w-full px-3 py-2 text-left text-sm flex items-center justify-between gap-2',
                'hover:bg-bg-hover transition-colors',
                item.disabled && 'opacity-50 cursor-not-allowed',
                item.variant === 'danger' && 'text-danger hover:bg-danger/10',
                hasSubmenu && 'cursor-default'
              )}
            >
              <div className="flex items-center gap-2">
                {item.icon && <span className="w-4 h-4">{item.icon}</span>}
                <span>{item.label}</span>
              </div>
              {hasSubmenu && (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-text-muted"
                >
                  <path d="M9 18l6-6-6-6" />
                </svg>
              )}
            </button>
            
            {/* Submenu */}
            {hasSubmenu && isHovered && (
              <div className="absolute left-full top-0 ml-1 min-w-[200px] bg-bg-secondary border border-border-primary rounded-md shadow-lg py-1 z-50">
                {item.submenuContent ? (
                  item.submenuContent
                ) : item.submenu ? (
                  item.submenu.map((subItem, subIndex) => {
                    if (subItem.separator) {
                      return <div key={subIndex} className="h-px bg-border-primary my-1" />;
                    }

                    return (
                      <button
                        key={subIndex}
                        onClick={() => {
                          if (!subItem.disabled && subItem.onClick) {
                            subItem.onClick();
                            onClose();
                          }
                        }}
                        disabled={subItem.disabled}
                        className={cn(
                          'w-full px-3 py-2 text-left text-sm flex items-center gap-2',
                          'hover:bg-bg-hover transition-colors',
                          subItem.disabled && 'opacity-50 cursor-not-allowed',
                          subItem.variant === 'danger' && 'text-danger hover:bg-danger/10'
                        )}
                      >
                        {subItem.icon && <span className="w-4 h-4">{subItem.icon}</span>}
                        <span>{subItem.label}</span>
                      </button>
                    );
                  })
                ) : null}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  return createPortal(menuContent, document.body);
}

// Hook for context menu
export function useContextMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });

  const openMenu = (event: React.MouseEvent) => {
    event.preventDefault();
    setPosition({ x: event.clientX, y: event.clientY });
    setIsOpen(true);
  };

  const closeMenu = () => {
    setIsOpen(false);
  };

  return {
    isOpen,
    position,
    openMenu,
    closeMenu,
  };
}

