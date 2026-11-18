// Lines of `str` no wider than `max` by `measure`, broken at spaces; "\n" starts a new paragraph. A word wider than
// `max` stays whole on its own line. Pure, so the wrap is tested without a canvas (tests/ui3d.test.ts); the 3D texts
// (ui3d/text.ts) and the help line's height (place-beside.ts helpEnd) break their lines here.
export function wrapLines(str: string, max: number, measure: (s: string) => number): string[] {
  const lines: string[] = [];
  for (const para of str.split('\n')) {
    let line = '';
    for (const word of para.split(' ')) {
      const next = line ? `${line} ${word}` : word;
      if (line && measure(next) > max) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    lines.push(line);
  }
  return lines;
}
