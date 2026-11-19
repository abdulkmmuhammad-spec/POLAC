let activeLockCount = 0;
let originalOverflow: string | null = null;

/**
 * Reference-counted body scroll lock so nested sheets/modals
 * never prematurely unlock background scrolling while another sheet is still open.
 */
export const acquireScrollLock = (): void => {
  if (typeof document === 'undefined') return;
  if (activeLockCount === 0) {
    originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  activeLockCount += 1;
};

export const releaseScrollLock = (): void => {
  if (typeof document === 'undefined') return;
  if (activeLockCount <= 0) return;
  activeLockCount -= 1;
  if (activeLockCount === 0) {
    document.body.style.overflow = originalOverflow ?? '';
    originalOverflow = null;
  }
};

