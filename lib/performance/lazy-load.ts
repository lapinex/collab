import { lazy, ComponentType } from 'react';

// Lazy load components for code splitting
export const lazyLoad = <T extends ComponentType<unknown>>(
  importFunc: () => Promise<{ default: T }>
): ComponentType<React.ComponentProps<T>> => {
  return lazy(importFunc) as ComponentType<React.ComponentProps<T>>;
};

// Preload component
export const preloadComponent = (
  importFunc: () => Promise<{ default: ComponentType<unknown> }>
): void => {
  importFunc();
};
