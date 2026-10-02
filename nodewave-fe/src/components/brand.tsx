export function Brand({ className }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-2 font-extrabold tracking-tight ${className ?? ''}`}
    >
      <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden>
        <rect width="26" height="26" rx="7" fill="var(--color-wave-600)" />
        <path
          d="M4 15c3-6 5-6 7 0s4 6 7 0 3-3 4-2"
          fill="none"
          stroke="#fff"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
      </svg>
      NodeWave
    </span>
  );
}
