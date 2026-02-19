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

/** Shorten git relative time: "2 hours ago" → "2h ago", "3 days ago" → "3d ago" */
export function formatRelativeTime(crFormat: string): string {
  return crFormat
    .replace(/\s+seconds?\s+ago/, "s ago")
    .replace(/\s+minutes?\s+ago/, "m ago")
    .replace(/\s+hours?\s+ago/, "h ago")
    .replace(/\s+days?\s+ago/, "d ago")
    .replace(/\s+weeks?\s+ago/, "w ago")
    .replace(/\s+months?\s+ago/, "mo ago")
    .replace(/\s+years?\s+ago/, "y ago");
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
