// The Starcall mark: a rising price line that lands on a star. Same drawing as public/icons/icon.svg, without the tile.
export default function Logo({ size = 28 }) {
  return (
    <svg className="logo" width={size} height={size} viewBox="4 4 58 52" aria-hidden="true">
      <defs>
        <linearGradient id="sc-trail" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#7c4dff" stopOpacity="0" />
          <stop offset="0.45" stopColor="#b14dff" />
          <stop offset="1" stopColor="#22e4ff" />
        </linearGradient>
        <radialGradient id="sc-glow">
          <stop offset="0" stopColor="#22e4ff" stopOpacity="0.7" />
          <stop offset="1" stopColor="#22e4ff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="46" cy="20" r="16" fill="url(#sc-glow)" />
      <path d="M8 52 L20 40 L28 45 L42 27" fill="none" stroke="url(#sc-trail)" strokeWidth="4.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M46 7 C47.3 16.2 49.8 18.7 59 20 C49.8 21.3 47.3 23.8 46 33 C44.7 23.8 42.2 21.3 33 20 C42.2 18.7 44.7 16.2 46 7Z" fill="#fff" />
    </svg>
  );
}
