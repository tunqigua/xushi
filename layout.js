const segmenter = typeof Intl.Segmenter === 'function'
  ? new Intl.Segmenter('zh', { granularity: 'grapheme' }) : null;
const graphemes = text => segmenter
  ? Array.from(segmenter.segment(text), item => item.segment) : Array.from(text);
const noStart = new Set(Array.from('、。，．！？：；）〕］｝〉》」』】”’…‥ー々・'));
const noEnd = new Set(Array.from('（〔［｛〈《「『【“‘'));
const latin = /^[A-Za-z0-9'’\-]+$/;

export const countChars = text => graphemes(text).length;
export const isBlank = text => /^[\s\u200b]*$/u.test(text);

export function breakLines(text, maxWidth, measure) {
  const lines = [];
  for (const paragraph of text.split('\n')) {
    const units = [];
    for (const char of graphemes(paragraph)) {
      if (latin.test(char) && units.length && latin.test(units.at(-1))) units[units.length - 1] += char;
      else units.push(char);
    }
    const pending = units.flatMap(unit => measure(unit) > maxWidth ? graphemes(unit) : [unit]);
    if (!pending.length) { lines.push(''); continue; }
    while (pending.length) {
      if (!pending.length) break;
      const row = [pending.shift()];
      while (pending.length && measure(row.join('') + pending[0]) <= maxWidth) row.push(pending.shift());
      // Keep a readable character before closing punctuation and after opening punctuation.
      for (let moves = 0; pending.length && row.length > 1 && moves < 3; moves++) {
        const end = graphemes(row.join('').trimEnd()).at(-1);
        const next = graphemes(pending.join('').trimStart())[0];
        if (!noStart.has(next) && !noEnd.has(end)) break;
        pending.unshift(row.pop());
      }
      lines.push(row.join(''));
    }
  }
  return lines;
}

// One 1200px master; longer content grows vertically instead of shrinking glyphs.
export function fit(text, width, measure, fontSize = width * 64 / 1200) {
  const lineHeight = fontSize * 1.72;
  const padding = width * 140 / 1200;
  const lines = breakLines(text, width - padding * 2, value => measure(value, fontSize));
  const height = Math.ceil(Math.max(width, lines.length * lineHeight + padding * 2));
  return { width, height, padding, lines, fontSize, lineHeight,
    textTop: (height - lines.length * lineHeight) / 2 };
}

export function formatDateLabel(date) {
  const [year, month, day] = date.split('-').map(Number);
  return `${year}年${month}月${day}日`;
}

export function monthLabel(date) {
  const [year, month] = date.split('-').map(Number);
  return `${year}年${month}月`;
}
