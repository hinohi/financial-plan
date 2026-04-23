import type { Plan } from "@/lib/dsl/types";
import { hydratePlan } from "./index";

const SHARE_PREFIX = "v1.";

// 圧縮済み base64url の長さ上限。現状の実データは 5KB 程度だが、
// ブラウザやリンク共有経路の限界に触れにくい範囲で余裕を持たせつつ、
// 壊れた/悪意のある入力で展開処理が暴走しないように上限を置く。
const MAX_ENCODED_CHARS = 500_000;
// 展開後 JSON の上限 (decompression bomb 対策)。
const MAX_DECODED_BYTES = 2_000_000;

async function streamToBytes(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value && value.length > 0) {
      chunks.push(value);
      total += value.length;
    }
  }
  const out = new Uint8Array(total);
  let pos = 0;
  for (const c of chunks) {
    out.set(c, pos);
    pos += c.length;
  }
  return out;
}

async function runTransform(
  input: Uint8Array,
  writable: WritableStream<BufferSource>,
  readable: ReadableStream<Uint8Array>,
): Promise<Uint8Array> {
  const writer = writable.getWriter();
  // DOM の BufferSource 型は ArrayBufferLike 系の Uint8Array を直接受け取れないため明示キャスト。
  const writePromise = writer.write(input as unknown as BufferSource).then(() => writer.close());
  const [, bytes] = await Promise.all([writePromise, streamToBytes(readable)]);
  return bytes;
}

async function compress(bytes: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream("deflate-raw");
  return runTransform(bytes, cs.writable, cs.readable);
}

async function decompress(bytes: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream("deflate-raw");
  return runTransform(bytes, ds.writable, ds.readable);
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) return null;
  let b64 = text.replace(/-/g, "+").replace(/_/g, "/");
  const padding = b64.length % 4;
  if (padding === 2) b64 += "==";
  else if (padding === 3) b64 += "=";
  else if (padding === 1) return null;
  try {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

export async function encodePlanForShare(plan: Plan): Promise<string> {
  const json = JSON.stringify(plan);
  const bytes = new TextEncoder().encode(json);
  const compressed = await compress(bytes);
  return SHARE_PREFIX + toBase64Url(compressed);
}

export type ShareDecodeResult = { ok: true; plan: Plan } | { ok: false; error: string };

export async function decodeSharedPlan(code: string): Promise<ShareDecodeResult> {
  if (!code.startsWith(SHARE_PREFIX)) {
    return { ok: false, error: "共有コードの形式が認識できません" };
  }
  const body = code.slice(SHARE_PREFIX.length);
  if (body.length === 0) return { ok: false, error: "共有コードが空です" };
  if (body.length > MAX_ENCODED_CHARS) {
    return { ok: false, error: "共有コードが大きすぎます" };
  }
  const compressed = fromBase64Url(body);
  if (!compressed) return { ok: false, error: "共有コードの復号に失敗しました" };

  let decompressed: Uint8Array;
  try {
    decompressed = await decompress(compressed);
  } catch {
    return { ok: false, error: "共有コードの展開に失敗しました" };
  }
  if (decompressed.length > MAX_DECODED_BYTES) {
    return { ok: false, error: "展開後のデータが大きすぎます" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(decompressed));
  } catch {
    return { ok: false, error: "共有コードの JSON が不正です" };
  }
  const plan = hydratePlan(parsed);
  if (!plan) return { ok: false, error: "プランのスキーマが未対応です" };
  return { ok: true, plan };
}

export function isShareCode(value: string): boolean {
  return value.startsWith(SHARE_PREFIX);
}
