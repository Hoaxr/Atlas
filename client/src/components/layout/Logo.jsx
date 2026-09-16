import AtlasLogo, { AtlasSymbol } from '../common/AtlasLogo';

/**
 * Logo - Compatibility wrapper for AtlasLogo defaulting to the icon symbol.
 * Allows existing usages (<Logo className="..." isWatermark={...} />) to seamlessly
 * use the new brand monogram.
 */
export default function Logo({
  className = "w-8 h-8",
  isWatermark = false,
  variant = "icon",
  ...props
}) {
  return (
    <AtlasLogo
      variant={variant}
      className={className}
      iconClassName={className}
      isWatermark={isWatermark}
      {...props}
    />
  );
}

export { AtlasSymbol, AtlasLogo };
