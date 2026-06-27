/**
 * CollectionBadge — colored pill chip for movie collection tags.
 */
export default function CollectionBadge({ name, color = '#06b6d4', onRemove, size = 'sm' }) {
  const pad = size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-3 py-1 text-xs';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-semibold border ${pad}`}
      style={{
        backgroundColor: `${color}20`,
        borderColor: `${color}40`,
        color: color,
      }}
    >
      {name}
      {onRemove && (
        <button
          onClick={onRemove}
          className="ml-0.5 opacity-70 hover:opacity-100 transition-opacity leading-none"
          aria-label={`Remove ${name}`}
        >
          ×
        </button>
      )}
    </span>
  );
}
