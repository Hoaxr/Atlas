/**
 * Spinner — animated loading indicator.
 * @param {'sm'|'md'|'lg'} size — sm=16px, md=32px, lg=48px (default 'md')
 * @param {string} color — tailwind border color class (default 'border-cyan-500')
 * @param {string} className — additional classes
 */
export default function Spinner({ size = 'md', color = 'border-cyan-500', className = '' }) {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-8 w-8',
    lg: 'h-12 w-12',
  };
  return (
    <div
      className={`animate-spin rounded-full border-b-2 ${sizeClasses[size] || sizeClasses.md} ${color} ${className}`}
    />
  );
}
