// Zip signature: PK\x03\x04. Uploads occasionally arrive with junk bytes
// prepended (e.g. multipart boundaries); trim to the first signature so the
// stored/served file is a clean zip.
const ZIP_SIG = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

export function trimToZip(data: Buffer): Buffer {
  const idx = data.indexOf(ZIP_SIG);
  if (idx <= 0) return data; // already clean (0) or signature not found (-1)
  return data.subarray(idx);
}
