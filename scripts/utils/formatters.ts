/** Format token count: 1500 → "1.5K", 150000 → "150K" */
export function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) {
    const m = tokens / 1_000_000;
    return m % 1 === 0 ? `${m}M` : `${m.toFixed(1)}M`;
  }
  if (tokens >= 1_000) {
    const k = tokens / 1_000;
    return k % 1 === 0 ? `${k}K` : `${k.toFixed(1)}K`;
  }
  return `${tokens}`;
}

/** Shorten model display name: "Claude Opus 4.6" → "Opus 4.6" */
export function shortenModelName(displayName: string): string {
  const match = displayName.match(/(Opus|Sonnet|Haiku)\s*([\d.]*)/);
  if (match) {
    const family = match[1];
    const version = match[2];
    return version ? `${family} ${version}` : family;
  }
  // Fallback: last word
  const parts = displayName.split(/\s+/);
  return parts[parts.length - 1] ?? displayName;
}
