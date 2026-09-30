/**
 * WhatChimp template variables (`contact`, `contentMessage`, `contentMessageExt`)
 * must not contain newlines/tabs or more than 4 consecutive spaces.
 */

/** Logical line break inside a single template param (newlines are not allowed). */
export const WHATCHIMP_LINE_SEPARATOR = ' · ';

/**
 * Sanitizes text for WhatChimp / WhatsApp template parameters.
 */
export function sanitizeWhatchimpTemplateParam(text: string): string {
  if (!text) return '';

  let s = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  s = s.replace(/[\n\t]+/g, ' ');
  while (/ {5,}/.test(s)) {
    s = s.replace(/ {5,}/g, '    ');
  }
  return s.trim();
}

/**
 * Joins non-empty lines into one template-safe string (no raw newlines).
 */
export function joinWhatchimpMessageLines(lines: string[]): string {
  return sanitizeWhatchimpTemplateParam(
    lines
      .map((line) => line.trim())
      .filter(Boolean)
      .join(WHATCHIMP_LINE_SEPARATOR),
  );
}

export function truncateTemplateParam(text: string, maxLen: number): string {
  const cleaned = sanitizeWhatchimpTemplateParam(text);
  if (cleaned.length <= maxLen) return cleaned;
  if (maxLen <= 1) return cleaned.slice(0, maxLen);
  return `${cleaned.slice(0, maxLen - 1).trimEnd()}…`;
}
