// One batch per order: keep existing photos, persist successful additions together.
// Any failed upload is reported without discarding the other successful images.
export function normalizeStoredRealImages(value) {
  if (Array.isArray(value)) return value.filter(url => typeof url === 'string' && url.trim());
  if (typeof value === 'string' && value.trim()) {
    if (value.startsWith('{') && value.endsWith('}'))
      return value.slice(1, -1).split(',').map(url => url.trim().replace(/^"|"$/g, '')).filter(Boolean);
    return [value];
  }
  return [];
}

export async function uploadRealImageBatch(files, {
  uploadFile, readExisting, updateExisting, createNew, onProgress = () => {}
}) {
  const selected = Array.from(files || []);
  const uploaded = [];
  const errors = [];
  let completed = 0;

  for (const file of selected) {
    const filename = String(file?.name || 'Ảnh không tên');
    try {
      if (!file || !String(file.type || '').startsWith('image/'))
        throw new Error('Chỉ hỗ trợ tệp hình ảnh');
      const url = await uploadFile(file);
      if (typeof url !== 'string' || !url.trim())
        throw new Error('Không nhận được URL ảnh');
      uploaded.push(url.trim());
    } catch (error) {
      errors.push({ name: filename, message: error?.message || 'Tải ảnh thất bại' });
    }
    completed++;
    onProgress({ completed, total: selected.length, uploaded: uploaded.length, failed: errors.length });
  }

  // If all fail, do not touch the existing DB row.
  if (!uploaded.length) return { uploaded, errors, total: selected.length, saved: false };

  // Read from Supabase AFTER uploading to avoid replacing an old row snapshot.
  const existing = await readExisting();
  const merged = [...new Set([
    ...normalizeStoredRealImages(existing?.hinhanh), ...uploaded
  ])];
  if (existing?.id) await updateExisting(existing, merged);
  else await createNew(merged);
  return { uploaded, errors, total: selected.length, saved: true, merged };
}
