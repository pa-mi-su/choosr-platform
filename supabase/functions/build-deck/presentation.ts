const palette = [
  ['#20344A', '#F0B7A4'],
  ['#173F42', '#78D6C6'],
  ['#5D284A', '#FF8FAB'],
  ['#493548', '#F4B860'],
  ['#244B3A', '#70D6A6'],
] as const;

export function colorsFor(index: number) {
  return palette[index % palette.length];
}
