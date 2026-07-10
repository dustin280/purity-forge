/**
 * Server-only helpers for the shared AI knowledge base.
 * Handles chunking, embedding via Lovable AI Gateway, and vector search.
 * Must only be imported from server-function or route handler scope.
 */

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1";
const EMBEDDING_MODEL = "google/gemini-embedding-2";

/** Chunk a long markdown/plain-text document into overlapping windows. */
export function chunkText(
  text: string,
  opts: { targetChars?: number; overlap?: number } = {},
): string[] {
  const targetChars = opts.targetChars ?? 1200;
  const overlap = opts.overlap ?? 150;
  const clean = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (clean.length <= targetChars) return clean ? [clean] : [];

  // Prefer to split on paragraph boundaries; pack paragraphs greedily.
  const paras = clean.split(/\n{2,}/);
  const chunks: string[] = [];
  let buf = "";
  for (const p of paras) {
    if (!buf) {
      buf = p;
    } else if (buf.length + 2 + p.length <= targetChars) {
      buf += "\n\n" + p;
    } else {
      chunks.push(buf);
      // start next chunk with tail overlap from previous
      const tail = buf.length > overlap ? buf.slice(-overlap) : buf;
      buf = (tail + "\n\n" + p).slice(-Math.max(targetChars, p.length + overlap + 2));
      // If a single paragraph is larger than target, hard-split it
      if (buf.length > targetChars * 1.5) {
        for (let i = 0; i < buf.length; i += targetChars - overlap) {
          chunks.push(buf.slice(i, i + targetChars));
        }
        buf = "";
      }
    }
  }
  if (buf) chunks.push(buf);
  return chunks.filter(c => c.trim().length > 0);
}

/** Call the Lovable AI Gateway /embeddings endpoint for a single input. */
export async function embedText(input: string): Promise<number[]> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("Missing LOVABLE_API_KEY");
  const res = await fetch(`${GATEWAY_URL}/embeddings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": key,
    },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Embedding failed (${res.status}): ${body.slice(0, 300)}`);
  }
  const json = (await res.json()) as { data?: Array<{ embedding: number[] }> };
  const vec = json.data?.[0]?.embedding;
  if (!vec) throw new Error("Embedding response missing data[0].embedding");
  return vec;
}

/** Format a pgvector literal string from a numeric array. */
export function toVectorLiteral(vec: number[]): string {
  return `[${vec.join(",")}]`;
}