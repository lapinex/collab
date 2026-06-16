/**
 * Shared UI class patterns — single source of truth for focus, controls, surfaces.
 * Use with cn() so new components stay consistent without copy-paste.
 */

/** Focus ring + glow (keyboard focus). Use on buttons, inputs, triggers. */
export const focusClass =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-primary focus-visible:shadow-focus';

/** Focus with ring offset (e.g. tabs on colored background). */
export const focusClassRingOffset =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg-secondary focus-visible:shadow-focus';

/** Focus for inputs: border + ring + shadow (no outline). */
export const inputFocusClass =
  'focus-visible:outline-none focus-visible:border-green-primary focus-visible:ring-2 focus-visible:ring-green-primary/40 focus-visible:shadow-focus';

/** Base for interactive controls: transition + disabled. */
export const controlBaseClass =
  'transition-all duration-150 ease-in-out disabled:pointer-events-none disabled:opacity-50';

/** Disabled state for form fields (cursor + opacity + bg). */
export const controlDisabledClass =
  'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-bg-tertiary';

/** Standard control height (touch-friendly). */
export const controlHeightClass = 'h-[var(--layout-input-min-height)]';

/** Input/select base: bg, border, text, placeholder. */
export const inputBaseClass =
  'flex w-full rounded-md px-3 py-2 text-sm bg-bg-primary border border-border-primary text-text-primary placeholder:text-text-muted';

/** Full input style (base + focus + hover + disabled). */
export const inputClass = [
  inputBaseClass,
  controlHeightClass,
  inputFocusClass,
  'hover:border-border-secondary',
  controlDisabledClass,
].join(' ');

/** Surface: panel/card (bg, border, radius). */
export const surfaceClass =
  'bg-bg-tertiary border border-border-primary rounded-lg';

/** Surface with elevation shadow. */
export const surfaceElev1Class = `${surfaceClass} shadow-elev-1`;
export const surfaceElev2Class = `${surfaceClass} shadow-elev-2`;
export const surfaceElev3Class = `${surfaceClass} shadow-elev-3`;

/** Overlay backdrop (modal/popover). */
export const overlayBackdropClass =
  'absolute inset-0 bg-[color:var(--overlay-backdrop)] backdrop-blur-sm';

/** Interactive list item (hover + focus for keyboard). */
export const listItemInteractiveClass =
  'hover:bg-bg-hover focus-visible:bg-bg-hover focus-visible:ring-2 focus-visible:ring-green-primary/40 focus-visible:shadow-focus';

/** Icon button hit area (min 44px). */
export const iconButtonClass =
  'p-2 rounded-md transition-colors text-text-secondary hover:text-green-primary hover:bg-bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-primary';

/** Input-style trigger (select, combobox): same look as input, flex justify-between. */
export const inputLikeTriggerClass = [
  'flex w-full items-center justify-between rounded-md px-3 py-2 text-sm',
  'bg-bg-primary border border-border-primary text-text-primary',
  controlHeightClass,
  'transition-all duration-150 ease-in-out',
  inputFocusClass,
  'hover:border-border-secondary',
  controlDisabledClass,
].join(' ');

/** Textarea base (no fixed height). */
export const textareaClass = [
  inputBaseClass,
  'min-h-[80px] resize-none',
  inputFocusClass,
  'hover:border-border-secondary',
  controlDisabledClass,
].join(' ');

/** Modal dialog panel. */
export const modalPanelClass =
  'relative z-10 w-full max-w-md bg-bg-secondary border border-border-primary rounded-lg shadow-elev-3';
