import { useId } from 'react';
import { useTheme } from '../../lib/ThemeContext';
import lockupDark from '../../assets/atlas-lockup.png';
import lockupLight from '../../assets/atlas-lockup-light.png';

/**
 * AtlasSymbol - Standalone vector monogram symbol
 */
export function AtlasSymbol({ 
  className = "w-8 h-8", 
  isWatermark = false,
  ...props 
}) {
  const id = useId().replace(/:/g, '');
  const gradId = `atlasGrad_${id}`;
  const creaseId = `atlasCrease_${id}`;

  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
      {...props}
    >
      <defs>
        <linearGradient id={gradId} x1="20%" y1="5%" x2="80%" y2="95%">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="35%" stopColor="#0ea5e9" />
          <stop offset="70%" stopColor="#0284c7" />
          <stop offset="100%" stopColor="#2563eb" />
        </linearGradient>
        <radialGradient id={creaseId} cx="35%" cy="45%" r="55%">
          <stop offset="0%" stopColor="#040e1e" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#040e1e" stopOpacity="0" />
        </radialGradient>
      </defs>

      <g 
        opacity={isWatermark ? 0.35 : 1} 
        style={{ transition: 'opacity 0.3s ease-in-out' }}
        className={isWatermark ? "group-hover/logo:!opacity-60" : ""}
      >
        {/* Inner fold crease shadow */}
        <path
          d="M 38 60 Q 50 72 58 72 L 64 80 Q 42 82 32 68 Z"
          fill={`url(#${creaseId})`}
        />

        {/* Stylized Geometric "A" Ribbon */}
        <path
          d="
            M 44.5 21
            C 47 14.5 53 14.5 55.5 21
            L 83.5 79
            C 86 84.5 82 88 76.5 88
            C 72.5 88 69.5 85 68 80
            L 61.5 66
            C 59.5 63 55.5 63 48 63
            L 44 63
            C 40 63 40 54 44 54
            L 57.5 54
            C 59.5 54 60.5 52.5 59 50
            L 52.5 40
            C 51.5 38.5 49.5 38.5 48.5 40
            L 29 80
            C 27.5 85 24.5 88 20.5 88
            C 15 88 11 84.5 13.5 79
            Z
          "
          fill={`url(#${gradId})`}
        />
      </g>
    </svg>
  );
}

/**
 * AtlasLogo - Reusable Brand Logo component
 * Supports the full lockup, the vector monogram, and icon-only mode.
 *
 * @param {'full' | 'icon' | 'lockup'} variant - 'full' renders the vector monogram + wordmark text,
 *   'icon' renders just the monogram, 'lockup' renders the branded raster lockup
 *   (theme-aware: white wordmark in dark mode, navy wordmark in light mode)
 * @param {boolean} iconOnly - Convenience shorthand for variant="icon"
 * @param {string} className - Classes applied to container (or SVG/IMG if icon-only/lockup)
 * @param {string} iconClassName - Classes applied specifically to the SVG icon
 * @param {string} textClassName - Custom styling for the ATLAS text wordmark
 * @param {boolean} isWatermark - Render in background watermark style with low opacity
 */
export default function AtlasLogo({
  variant = 'full',
  iconOnly = false,
  showWordmark,
  className = '',
  iconClassName = 'w-8 h-8',
  textClassName = '',
  textSize = 'text-xl',
  isWatermark = false,
  ...props
}) {
  const { theme } = useTheme();
  const isIcon = iconOnly || variant === 'icon' || showWordmark === false;

  if (variant === 'lockup') {
    return (
      <img
        src={theme === 'light' ? lockupLight : lockupDark}
        alt="Atlas"
        draggable={false}
        className={className || 'h-8 w-auto'}
        {...props}
      />
    );
  }

  if (isIcon) {
    return (
      <AtlasSymbol
        className={className || iconClassName}
        isWatermark={isWatermark}
        {...props}
      />
    );
  }

  return (
    <div
      className={`inline-flex items-center gap-3 select-none ${className}`}
      {...props}
    >
      <div className="shrink-0 flex items-center justify-center">
        <AtlasSymbol
          className={iconClassName}
          isWatermark={isWatermark}
        />
      </div>
      <span
        className={`font-display font-extrabold uppercase tracking-[0.2em] text-slate-900 dark:text-white transition-colors leading-none ${textSize} ${textClassName}`}
      >
        Atlas
      </span>
    </div>
  );
}
