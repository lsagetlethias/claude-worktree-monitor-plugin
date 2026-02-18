// ANSI 256-color helpers for status line rendering

const ESC = "\x1b[";
const RESET = `${ESC}0m`;

/** Apply 256-color foreground */
export function fg256(code: number, text: string): string {
  return `${ESC}38;5;${code}m${text}${RESET}`;
}

/** Apply dim style */
export function dim(text: string): string {
  return `${ESC}2m${text}${RESET}`;
}

// Pastel palette (256-color codes)
export const pastelGreen = 114;
export const pastelCyan = 117;
export const pastelYellow = 228;
export const pastelPurple = 183;

/** Colorize text with a named pastel color */
export function colorize(color: number, text: string): string {
  return fg256(color, text);
}
