export function cleanCvText(raw: string): string {
  return raw
    // normalize line endings
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    // non-breaking space & similar whitespace → regular space
    .replace(/[  -​  　﻿]/g, ' ')
    // remove non-printable control characters (keep \n and \t)
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '')
    // tab → space
    .replace(/\t/g, ' ')
    // multiple spaces → single space (per line)
    .split('\n')
    .map(line => line.replace(/ {2,}/g, ' ').trim())
    // drop lines that are purely noise (< 2 chars after trim)
    .filter(line => line.length >= 2 || line === '')
    .join('\n')
    // collapse 3+ consecutive blank lines → 2
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
