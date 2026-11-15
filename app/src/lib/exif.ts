const SOI = 0xd8;
const APP1 = 0xe1;
const SOS = 0xda;
const EOI = 0xd9;

/** 从 JPEG 字节流里取出 APP1(Exif) 段，非 JPEG 或无 Exif 返回 null。 */
export function extractExifSegment(bytes: Uint8Array): Uint8Array | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== SOI) return null;
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1];
    if (marker === SOS || marker === EOI) return null;
    const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (length < 2) return null;
    if (marker === APP1) {
      const data = offset + 4;
      const isExif =
        data + 6 <= bytes.length &&
        bytes[data] === 0x45 &&
        bytes[data + 1] === 0x78 &&
        bytes[data + 2] === 0x69 &&
        bytes[data + 3] === 0x66 &&
        bytes[data + 4] === 0 &&
        bytes[data + 5] === 0;
      if (isExif) return bytes.slice(offset, offset + 2 + length);
    }
    offset += 2 + length;
  }
  return null;
}

/** 把 Exif 段里的 Orientation(0x0112) 改成 1，因为画布已经按方向摆正过了。 */
function normalizeOrientation(segment: Uint8Array): Uint8Array {
  const out = segment.slice();
  const tiff = 4 + 6; // FF E1 + 长度 + "Exif\0\0"
  if (tiff + 8 > out.length) return out;
  const little = out[tiff] === 0x49 && out[tiff + 1] === 0x49;
  const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
  if (view.getUint16(tiff + 2, little) !== 0x2a) return out;
  const ifd = tiff + view.getUint32(tiff + 4, little);
  if (ifd + 2 > out.length) return out;
  const count = view.getUint16(ifd, little);
  for (let i = 0; i < count; i++) {
    const entry = ifd + 2 + i * 12;
    if (entry + 12 > out.length) break;
    if (view.getUint16(entry, little) === 0x0112) {
      view.setUint16(entry + 8, 1, little);
      view.setUint16(entry + 10, 0, little);
      break;
    }
  }
  return out;
}

/**
 * 把 Exif 段改写为「与导出像素一致」的版本：
 * 1. Orientation 改成 1（画布已按方向摆正）；
 * 2. ImageWidth/ImageLength 与 ExifImageWidth/Height 改成实际导出尺寸；
 * 3. 断开 IFD1 指针，丢掉原图缩略图——否则访达/资源管理器会显示未编辑的旧缩略图。
 * 段长度不变，只改数值与指针，避免重排偏移。
 */
function rewriteExif(segment: Uint8Array, width: number, height: number): Uint8Array {
  const out = segment.slice();
  const tiff = 10; // FF E1 + 长度 + "Exif\0\0"
  if (tiff + 8 > out.length) return out;
  const little = out[tiff] === 0x49 && out[tiff + 1] === 0x49;
  const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
  if (view.getUint16(tiff + 2, little) !== 0x2a) return out;

  const setEntryValue = (entry: number, value: number) => {
    const type = view.getUint16(entry + 2, little);
    if (type === 3) {
      if (value <= 0xffff) {
        view.setUint16(entry + 8, value, little);
        view.setUint16(entry + 10, 0, little);
      } else {
        // SHORT 放不下时改成 LONG，数值仍内联在 4 字节里
        view.setUint16(entry + 2, 4, little);
        view.setUint32(entry + 8, value, little);
      }
    } else if (type === 4) {
      view.setUint32(entry + 8, value, little);
    }
  };

  const ifd0 = tiff + view.getUint32(tiff + 4, little);
  if (ifd0 + 2 > out.length) return out;
  const count0 = view.getUint16(ifd0, little);
  let exifIfd = 0;
  for (let i = 0; i < count0; i++) {
    const entry = ifd0 + 2 + i * 12;
    if (entry + 12 > out.length) break;
    const tag = view.getUint16(entry, little);
    if (tag === 0x0112) {
      view.setUint16(entry + 8, 1, little);
      view.setUint16(entry + 10, 0, little);
    } else if (tag === 0x0100) {
      setEntryValue(entry, width);
    } else if (tag === 0x0101) {
      setEntryValue(entry, height);
    } else if (tag === 0x8769 && view.getUint16(entry + 2, little) === 4) {
      exifIfd = tiff + view.getUint32(entry + 8, little);
    }
  }

  // IFD0 的 next-IFD 指针指向 IFD1（缩略图），清零即可让缩略图失效
  const next0 = ifd0 + 2 + count0 * 12;
  if (next0 + 4 <= out.length) view.setUint32(next0, 0, little);

  if (exifIfd > tiff && exifIfd + 2 <= out.length) {
    const count1 = view.getUint16(exifIfd, little);
    for (let i = 0; i < count1; i++) {
      const entry = exifIfd + 2 + i * 12;
      if (entry + 12 > out.length) break;
      const tag = view.getUint16(entry, little);
      if (tag === 0xa002) setEntryValue(entry, width);
      else if (tag === 0xa003) setEntryValue(entry, height);
    }
  }
  return out;
}

/** 把 Exif 段插到 JPEG 的 SOI 之后；segment 为空则原样返回。 */
export function withExifSegment(
  jpeg: Uint8Array,
  segment: Uint8Array | null,
  dims?: { width: number; height: number },
): Uint8Array<ArrayBuffer> {
  if (!segment || jpeg.length < 2) return new Uint8Array(jpeg);
  const clean = dims ? rewriteExif(segment, dims.width, dims.height) : normalizeOrientation(segment);
  const out = new Uint8Array(jpeg.length + clean.length);
  out.set(jpeg.subarray(0, 2), 0);
  out.set(clean, 2);
  out.set(jpeg.subarray(2), 2 + clean.length);
  return out;
}

export async function attachExif(
  blob: Blob,
  segment: Uint8Array | null,
  dims?: { width: number; height: number },
): Promise<Blob> {
  if (!segment) return blob;
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return new Blob([withExifSegment(bytes, segment, dims)], { type: blob.type });
}

/** 读取几项最常看的拍摄信息，拼成一行展示文本；解析失败返回空字符串。 */
export function summarizeExif(segment: Uint8Array | null): string {
  if (!segment || segment.length < 18) return '';
  const tiff = 10;
  const little = segment[tiff] === 0x49 && segment[tiff + 1] === 0x49;
  const view = new DataView(segment.buffer, segment.byteOffset, segment.byteLength);
  if (view.getUint16(tiff + 2, little) !== 0x2a) return '';

  type Entry = { type: number; count: number; at: number };
  const readIfd = (offset: number) => {
    const map = new Map<number, Entry>();
    if (offset + 2 > segment.length) return map;
    const count = view.getUint16(offset, little);
    for (let i = 0; i < count; i++) {
      const e = offset + 2 + i * 12;
      if (e + 12 > segment.length) break;
      const tag = view.getUint16(e, little);
      const type = view.getUint16(e + 2, little);
      const n = view.getUint32(e + 4, little);
      const size = type === 3 ? 2 : type === 4 ? 4 : type === 5 ? 8 : 1;
      const inline = n * size <= 4;
      const at = inline ? e + 8 : tiff + view.getUint32(e + 8, little);
      map.set(tag, { type, count: n, at });
    }
    return map;
  };

  const ascii = (entry?: Entry) => {
    if (!entry) return '';
    let s = '';
    for (let i = 0; i < entry.count; i++) {
      const code = segment[entry.at + i];
      if (!code) break;
      s += String.fromCharCode(code);
    }
    return s.trim();
  };
  const rational = (entry?: Entry) => {
    if (!entry || entry.type !== 5 || entry.at + 8 > segment.length) return null;
    const num = view.getUint32(entry.at, little);
    const den = view.getUint32(entry.at + 4, little) || 1;
    return num / den;
  };
  const short = (entry?: Entry) => {
    if (!entry || entry.at + 2 > segment.length) return null;
    return view.getUint16(entry.at, little);
  };

  const ifd0 = readIfd(tiff + view.getUint32(tiff + 4, little));
  const exifPtr = ifd0.get(0x8769);
  const exifIfd = exifPtr ? readIfd(tiff + view.getUint32(exifPtr.at, little)) : new Map<number, Entry>();

  const parts: string[] = [];
  const make = ascii(ifd0.get(0x010f));
  const model = ascii(ifd0.get(0x0110));
  const camera = [make, model].filter(Boolean).join(' ');
  if (camera) parts.push(camera);

  const shotAt = ascii(exifIfd.get(0x9003)) || ascii(ifd0.get(0x0132));
  if (shotAt) parts.push(shotAt.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3'));

  const exposure = rational(exifIfd.get(0x829a));
  if (exposure) parts.push(exposure < 0.5 ? `1/${Math.round(1 / exposure)} 秒` : `${exposure.toFixed(1)} 秒`);

  const fNumber = rational(exifIfd.get(0x829d));
  if (fNumber) parts.push(`f/${fNumber.toFixed(1)}`);

  const iso = short(exifIfd.get(0x8827));
  if (iso) parts.push(`ISO ${iso}`);

  const focal = rational(exifIfd.get(0x920a));
  if (focal) parts.push(`${Math.round(focal)}mm`);

  return parts.join(' · ');
}
