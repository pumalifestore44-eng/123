// Accent-insensitive literal matching with offsets into the original UTF-16 text.
function foldWithOffsets(value) {
  let folded = '', offset = 0;
  const starts = [], ends = [];
  for (const char of String(value)) {
    const end = offset + char.length;
    const part = char.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/đ/g, 'd');
    if (!part && ends.length) ends[ends.length - 1] = end;
    for (let i = 0; i < part.length; i++) { starts.push(offset); ends.push(end); }
    folded += part;
    offset = end;
  }
  return { folded, starts, ends };
}
export function findMessageRanges(text, query) {
  const needle = foldWithOffsets(String(query).trim()).folded;
  if (!needle) return [];
  const { folded, starts, ends } = foldWithOffsets(text);
  const ranges = [];
  let index = 0;
  while ((index = folded.indexOf(needle, index)) !== -1) {
    ranges.push([starts[index], ends[index + needle.length - 1]]);
    index += needle.length;
  }
  return ranges;
}
