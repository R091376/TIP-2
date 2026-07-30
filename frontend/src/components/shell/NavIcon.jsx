/** Lightweight inline SVG icons for the app sidebar. */
export default function NavIcon({ name, className = '' }) {
  const common = {
    className,
    width: 20,
    height: 20,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.75,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
  }

  switch (name) {
    case 'dashboard':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
      )
    case 'charts':
      return (
        <svg {...common}>
          <path d="M4 19V5" />
          <path d="M4 19h16" />
          <path d="M8 15v-4" />
          <path d="M12 15V9" />
          <path d="M16 15v-6" />
        </svg>
      )
    case 'watchlist':
      return (
        <svg {...common}>
          <rect x="4" y="5" width="16" height="14" rx="2" />
          <path d="M8 9h8M8 13h5" />
        </svg>
      )
    case 'orders':
      return (
        <svg {...common}>
          <path d="M9 5h10v14H5V9l4-4z" />
          <path d="M9 5v4H5" />
          <path d="M9 13h6M9 17h4" />
        </svg>
      )
    case 'positions':
      return (
        <svg {...common}>
          <path d="M4 18V6" />
          <path d="M4 18h16" />
          <path d="M8 14l3-4 3 2 4-6" />
        </svg>
      )
    case 'alerts':
      return (
        <svg {...common}>
          <path d="M12 4a5 5 0 0 1 5 5v3l1.5 2.5H5.5L7 12V9a5 5 0 0 1 5-5z" />
          <path d="M10 18a2 2 0 0 0 4 0" />
        </svg>
      )
    case 'admin':
      return (
        <svg {...common}>
          <circle cx="12" cy="8" r="3.5" />
          <path d="M5 19c1.5-3 4-4.5 7-4.5S17.5 16 19 19" />
        </svg>
      )
    default:
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" />
        </svg>
      )
  }
}
