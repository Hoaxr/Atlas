const ua = typeof navigator !== 'undefined' ? navigator.platform || navigator.userAgent || '' : '';

/** True on Apple platforms, where the command key is the primary modifier. */
export const IS_MAC = /Mac|iPhone|iPad|iPod/.test(ua);

/** Label for the platform's primary modifier key (⌘ on macOS, Ctrl elsewhere). */
export const MOD_KEY = IS_MAC ? '⌘' : 'Ctrl';
