/** A carved hidden-immunity idol for Double Roster Points. On the roster it
 * also remains the drag handle for moving the play. Above the beat-tab
 * threshold it's the Tocantins bone-skull disc with a gold ×2 seal; at small
 * sizes it steps down to the plain engraved ×2 so the multiplier always reads.
 * Replaces the earlier tropical national-park patch. */
export function DoubleBadge({
  size = 22,
  title = 'Double Roster Points this episode',
}: {
  size?: number
  title?: string
}) {
  const compact = size < 20

  return (
    <span
      role="img"
      aria-label={title}
      title={title}
      className="inline-flex shrink-0 select-none items-center justify-center drop-shadow-[0_1px_1px_rgb(28_25_23_/_0.25)]"
      style={{ height: size, width: size }}
    >
      <svg
        viewBox="0 0 48 48"
        aria-hidden="true"
        data-mark="double-idol"
        data-detail={compact ? 'compact' : 'scene'}
        className="block h-full w-full overflow-visible"
      >
        {compact ? (
          <g data-part="compact-mark">
            {/* Wood body */}
            <circle cx="24" cy="24" r="23.2" fill="#3a2818" stroke="#160d06" strokeWidth="2" />
            {/* Terracotta channel + solid carved ring */}
            <circle cx="24" cy="24" r="19.6" fill="none" stroke="#c45432" strokeWidth="1.8" />
            <circle cx="24" cy="24" r="17.4" fill="none" stroke="#ece0c4" strokeWidth="3.4" />
            {/* Forest accent ring */}
            <circle cx="24" cy="24" r="12.6" fill="none" stroke="#1e3a2f" strokeWidth="1.6" />
            {/* Bone plug + engraved multiplier */}
            <circle cx="24" cy="24.2" r="11.8" fill="#ece0c4" stroke="#a87d2f" strokeWidth="1" />
            <text
              x="24"
              y="29.8"
              textAnchor="middle"
              fill="#2a1d12"
              fontFamily="Rajdhani, system-ui, sans-serif"
              fontSize="17.5"
              fontWeight="700"
              letterSpacing="-0.9"
            >
              ×2
            </text>
          </g>
        ) : (
          <g data-part="idol-scene">
            {/* Wood body with warm-gold bevel */}
            <circle cx="24" cy="24" r="23.2" fill="#3a2818" stroke="#160d06" strokeWidth="1.8" />
            <circle cx="24" cy="24" r="22" fill="none" stroke="#b98a4a" strokeWidth="1.3" opacity="0.85" />
            {/* Terracotta channel */}
            <circle cx="24" cy="24" r="19.8" fill="none" stroke="#c45432" strokeWidth="1.5" />
            {/* Carved tooth ring — shadow copy for relief, then bone */}
            <circle
              cx="24.5"
              cy="24.6"
              r="17.6"
              fill="none"
              stroke="#160d06"
              strokeWidth="3.6"
              strokeDasharray="4 3.1"
              opacity="0.55"
            />
            <circle
              cx="24"
              cy="24"
              r="17.6"
              fill="none"
              stroke="#ece0c4"
              strokeWidth="3.1"
              strokeDasharray="4 3.1"
            />
            {/* Forest accent ring with jade highlight */}
            <circle cx="24" cy="24" r="12.6" fill="none" stroke="#1e3a2f" strokeWidth="2.1" />
            <circle cx="24" cy="24" r="12.6" fill="none" stroke="#2e6b52" strokeWidth="0.7" opacity="0.7" />
            {/* Bone disc */}
            <circle cx="24" cy="23.4" r="11.4" fill="#ece0c4" stroke="#a87d2f" strokeWidth="0.9" />
            {/* Skull glyph (from the Tocantins idol concept) */}
            <g data-part="skull" fill="#231a10">
              <circle cx="20.6" cy="22.2" r="3.1" />
              <circle cx="27.4" cy="22.2" r="3.1" />
              <path d="M24 25 l2.3 4.1 h-4.6 z" />
            </g>
            <g fill="#3a2818">
              <rect x="21" y="30" width="0.9" height="2.6" />
              <rect x="23.55" y="30" width="0.9" height="2.6" />
              <rect x="26.1" y="30" width="0.9" height="2.6" />
            </g>
            {/* Gold ×2 seal */}
            <g data-part="multiplier-seal">
              <circle cx="34.4" cy="34.6" r="8.9" fill="#d4913a" stroke="#160d06" strokeWidth="1.2" />
              <circle cx="34.4" cy="34.6" r="8.9" fill="none" stroke="#1e3a2f" strokeWidth="0.9" opacity="0.55" />
              <text
                x="34.4"
                y="38.6"
                textAnchor="middle"
                fill="#2a1d12"
                fontFamily="Rajdhani, system-ui, sans-serif"
                fontSize="11.4"
                fontWeight="700"
                letterSpacing="-0.7"
              >
                ×2
              </text>
            </g>
          </g>
        )}
      </svg>
    </span>
  )
}
