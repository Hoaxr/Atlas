export default function Logo({ className = "w-8 h-8", isWatermark = false }) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        {/* Globe base gradient — light source from top-left */}
        <radialGradient id="globeFill" cx="35%" cy="30%" r="65%">
          <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.25" />
          <stop offset="60%" stopColor="#06b6d4" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#0891b2" stopOpacity="0.35" />
        </radialGradient>
        {/* Highlight/shine gradient */}
        <radialGradient id="globeShine" cx="30%" cy="25%" r="50%">
          <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
        </radialGradient>
        {/* Rim shadow for 3D depth */}
        <radialGradient id="globeRim" cx="50%" cy="50%" r="50%">
          <stop offset="85%" stopColor="transparent" />
          <stop offset="95%" stopColor="#06b6d4" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.6" />
        </radialGradient>
        {/* Clipping path for inner globe overlays */}
        <clipPath id="globeClip">
          <circle cx="32" cy="32" r="26" />
        </clipPath>
      </defs>

      {/* Globe base layers grouped to control watermark opacity separately */}
      <g 
        opacity={isWatermark ? 0.3 : 1} 
        style={{ transition: 'opacity 0.5s ease-in-out' }}
        className={isWatermark ? "group-hover/logo:!opacity-50" : ""}
      >
        {/* Globe sphere */}
        <circle cx="32" cy="32" r="26" fill="url(#globeFill)" stroke="#22d3ee" strokeWidth="2" />
        {/* Shine highlight */}
        <circle cx="32" cy="32" r="26" fill="url(#globeShine)" />
        {/* Rim depth */}
        <circle cx="32" cy="32" r="26" fill="url(#globeRim)" />

        {/* Rotating globe layer — continents, meridians, parallels all turn together */}
        <g>
          <animateTransform
            attributeName="transform"
            type="rotate"
            from="0 32 32"
            to="360 32 32"
            dur="25s"
            repeatCount="indefinite"
          />

          {/* Vertical meridian */}
          <ellipse cx="32" cy="32" rx="8" ry="26" stroke="#22d3ee" strokeWidth="1.2" strokeOpacity="0.5" fill="none" />
          {/* Second vertical meridian */}
          <ellipse cx="32" cy="32" rx="18" ry="26" stroke="#22d3ee" strokeWidth="0.8" strokeOpacity="0.3" fill="none" />
          {/* Horizontal parallel */}
          <ellipse cx="32" cy="32" rx="26" ry="8" stroke="#22d3ee" strokeWidth="1.2" strokeOpacity="0.5" fill="none" />
          {/* Second horizontal parallel */}
          <ellipse cx="32" cy="32" rx="26" ry="18" stroke="#22d3ee" strokeWidth="0.8" strokeOpacity="0.3" fill="none" />

          {/* Continent blobs — organic shapes for landmasses */}
          {/* North America */}
          <path d="M22 18 Q26 14 30 18 Q32 22 28 24 Q24 26 22 24 Q20 22 22 18Z" fill="#22d3ee" fillOpacity="0.6" />
          {/* Europe */}
          <path d="M36 20 Q40 18 42 22 Q41 26 38 26 Q35 24 36 20Z" fill="#22d3ee" fillOpacity="0.55" />
          {/* South America */}
          <path d="M26 30 Q30 30 30 34 Q28 40 26 44 Q24 40 24 34 Q24 30 26 30Z" fill="#22d3ee" fillOpacity="0.5" />
          {/* Africa */}
          <path d="M36 30 Q40 30 40 36 Q38 42 36 44 Q33 40 34 34 Q34 30 36 30Z" fill="#22d3ee" fillOpacity="0.55" />
          {/* Australia */}
          <path d="M40 44 Q44 44 44 48 Q42 50 39 48 Q38 46 40 44Z" fill="#22d3ee" fillOpacity="0.5" />
          {/* Asia */}
          <path d="M40 18 Q44 20 43 26 Q42 28 38 28 Q36 26 38 22 Q38 18 40 18Z" fill="#22d3ee" fillOpacity="0.4" />

          {/* Play triangle in center */}
          <polygon
            points="29,26 29,38 39,32"
            fill="#22d3ee"
            strokeWidth="0"
          />
        </g>

        {/* Orbital ring */}
        <ellipse
          cx="32"
          cy="32"
          rx="32"
          ry="9"
          stroke="#22d3ee"
          strokeWidth="1"
          fill="none"
          strokeOpacity="0.2"
          transform="rotate(-15 32 32)"
          strokeDasharray="2.5 3"
        />
      </g>

      {/* Animated bright lines flowing along the meridians & parallels themselves */}
      <g clipPath="url(#globeClip)" className={isWatermark ? "opacity-100" : "opacity-80"}>
        <g>
          {/* Synchronized rotation with the main globe */}
          <animateTransform
            attributeName="transform"
            type="rotate"
            from="0 32 32"
            to="360 32 32"
            dur="25s"
            repeatCount="indefinite"
          />

          {/* Meridian 1 (inner ellipse) pulse */}
          <ellipse cx="32" cy="32" rx="8" ry="26" stroke="#ffffff" strokeWidth="1" strokeOpacity="0.45" fill="none" strokeDasharray="8 24">
            <animate attributeName="stroke-dashoffset" values="64;0" dur="6.5s" repeatCount="indefinite" />
          </ellipse>
          {/* Meridian 2 (outer ellipse) pulse */}
          <ellipse cx="32" cy="32" rx="18" ry="26" stroke="#22d3ee" strokeWidth="0.8" strokeOpacity="0.4" fill="none" strokeDasharray="12 36">
            <animate attributeName="stroke-dashoffset" values="0;96" dur="8.5s" repeatCount="indefinite" />
          </ellipse>
          {/* Parallel 1 (horizontal inner ellipse) pulse */}
          <ellipse cx="32" cy="32" rx="26" ry="8" stroke="#ffffff" strokeWidth="1" strokeOpacity="0.45" fill="none" strokeDasharray="10 30">
            <animate attributeName="stroke-dashoffset" values="80;0" dur="7s" repeatCount="indefinite" />
          </ellipse>
          {/* Parallel 2 (horizontal outer ellipse) pulse */}
          <ellipse cx="32" cy="32" rx="26" ry="18" stroke="#22d3ee" strokeWidth="0.8" strokeOpacity="0.4" fill="none" strokeDasharray="16 48">
            <animate attributeName="stroke-dashoffset" values="0;128" dur="10s" repeatCount="indefinite" />
          </ellipse>

          {/* Glowing junction nodes at grid intersections */}
          <circle cx="32" cy="6" r="1.4" fill="#ffffff">
            <animate attributeName="opacity" values="0.4;1;0.4" dur="2s" repeatCount="indefinite" />
          </circle>
          <circle cx="32" cy="58" r="1.4" fill="#ffffff">
            <animate attributeName="opacity" values="0.4;1;0.4" dur="2s" repeatCount="indefinite" />
          </circle>
          <circle cx="6" cy="32" r="1.2" fill="#22d3ee">
            <animate attributeName="opacity" values="0.5;1;0.5" dur="2.4s" repeatCount="indefinite" />
          </circle>
          <circle cx="58" cy="32" r="1.2" fill="#22d3ee">
            <animate attributeName="opacity" values="0.5;1;0.5" dur="2.4s" repeatCount="indefinite" />
          </circle>
          <circle cx="24" cy="24" r="1.3" fill="#ffffff">
            <animate attributeName="opacity" values="0.4;1;0.4" dur="1.8s" repeatCount="indefinite" />
          </circle>
          <circle cx="40" cy="40" r="1.3" fill="#22d3ee">
            <animate attributeName="opacity" values="0.4;1;0.4" dur="2.2s" repeatCount="indefinite" />
          </circle>
        </g>
      </g>
    </svg>
  );
}
