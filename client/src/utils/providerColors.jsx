/**
 * Shared config for subtitle provider display colors and labels.
 * Used across SubSearchModal, MovieDetails, and ShowDetails.
 */
export const PROVIDER_STYLES = {
  OpenSubtitles: { label: 'OpenSubtitles', color: 'text-cyan-400', border: 'border-cyan-500/30', bg: 'bg-cyan-500/10' },
  SubDL:         { label: 'SubDL',         color: 'text-amber-400', border: 'border-amber-500/30', bg: 'bg-amber-500/10' },
  SubSource:     { label: 'SubSource',     color: 'text-purple-400', border: 'border-purple-500/30', bg: 'bg-purple-500/10' },
};

/**
 * Renders a styled provider name span.
 * Falls back to plain text for unknown providers.
 */
export function ProviderLabel({ provider, className = '' }) {
  const style = PROVIDER_STYLES[provider];
  if (!style) return <span className={className}>{provider}</span>;
  return <span className={`${style.color} ${className}`}>{style.label}</span>;
}
