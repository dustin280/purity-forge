/**
 * Text safety for every jsPDF document in the app.
 *
 * jsPDF's built-in fonts (Helvetica, Times, Courier) are WinAnsi/CP1252 only.
 * Anything outside that set renders as mojibake in a real PDF viewer --
 * browsers hide it by silently substituting a font, so it survives visual
 * review of an in-app preview and only shows up on paper.
 *
 * That is not hypothetical here: the compound "TB500 (Thymosin β4 fragment)"
 * carries a beta straight out of the database onto a bench sheet, and prep
 * instructions are full of "→". Only 2 of 17 generators guarded against it,
 * each with its own partial fix.
 *
 * So the guard lives at the jsPDF boundary instead of at call sites: wrap a
 * document with `wrapPdf()` and every `doc.text(...)` is sanitised
 * automatically, including the text jspdf-autotable draws (it renders cells
 * through the same `doc.text`). A generator cannot forget to call it, and it
 * covers strings that arrive from the database rather than from source.
 */
// Type-only: this module must NOT pull jspdf into the bundle, so the
// generators that import it lazily (timesheets, receipts, chat export) keep
// their code-splitting.
import type jsPDF from "jspdf";

/**
 * Characters that WinAnsi can't encode, mapped to a readable ASCII form.
 * The micro sign is the subtle one: U+00B5 MICRO SIGN is in WinAnsi and
 * renders fine, while U+03BC GREEK SMALL LETTER MU is not -- they look
 * identical in an editor, so a volume in "μL" would print as garbage while
 * the same string in "µL" prints correctly. Normalise mu onto the micro sign
 * rather than degrading it to "u".
 */
const REPLACEMENTS: Record<string, string> = {
  // Arrows — pervasive in dilution instructions.
  "→": "->", "←": "<-", "↔": "<->", "⇒": "=>", "⇐": "<=",
  // Greek. Mu maps onto the WinAnsi micro sign; the rest spell out.
  "μ": "µ",
  "α": "alpha", "β": "beta", "γ": "gamma", "δ": "delta",
  "ε": "epsilon", "λ": "lambda", "π": "pi", "σ": "sigma",
  "τ": "tau", "φ": "phi", "ω": "omega",
  "Α": "Alpha", "Β": "Beta", "Γ": "Gamma", "Δ": "Delta",
  "Λ": "Lambda", "Σ": "Sigma", "Ω": "Ohm",
  // Maths and comparison.
  "≥": ">=", "≤": "<=", "≠": "!=", "≈": "~", "∞": "inf",
  "∑": "sum", "√": "sqrt", "′": "'", "″": "\"",
  // Marks that turn up in status columns.
  "✓": "[x]", "✔": "[x]", "✗": "[ ]", "✘": "[ ]",
  "⚠": "!", "•": "-", "●": "-", "■": "-", "★": "*", "☆": "*",
  // Spaces that aren't spaces.
  " ": " ", " ": " ", " ": " ", "​": "",
};

/** WinAnsi covers Latin-1 plus these code points in the 0x80–0x9F range. */
const WINANSI_EXTRA = new Set([
  0x20AC, 0x201A, 0x0192, 0x201E, 0x2026, 0x2020, 0x2021, 0x02C6, 0x2030, 0x0160,
  0x2039, 0x0152, 0x017D, 0x2018, 0x2019, 0x201C, 0x201D, 0x2022, 0x2013, 0x2014,
  0x02DC, 0x2122, 0x0161, 0x203A, 0x0153, 0x017E, 0x0178,
]);

function encodable(cp: number): boolean {
  return cp <= 0xFF || WINANSI_EXTRA.has(cp);
}

/** Makes one string safe for a built-in jsPDF font. */
export function sanitizePdfText(input: string): string {
  let out = "";
  for (const ch of input) {
    const mapped = REPLACEMENTS[ch];
    if (mapped !== undefined) { out += mapped; continue; }
    if (encodable(ch.codePointAt(0)!)) { out += ch; continue; }
    // Unmapped and unencodable: strip accents (é -> e) before giving up, so
    // a name survives readably rather than losing whole characters.
    const stripped = ch.normalize("NFD").replace(/[̀-ͯ]/g, "");
    out += [...stripped].every((c) => encodable(c.codePointAt(0)!)) ? stripped : "?";
  }
  return out;
}

/** Applies sanitizePdfText through whatever shape jsPDF's text() was given. */
function sanitizeArg(text: unknown): unknown {
  if (typeof text === "string") return sanitizePdfText(text);
  if (Array.isArray(text)) return text.map((t) => (typeof t === "string" ? sanitizePdfText(t) : t));
  return text;
}

/**
 * Wraps a jsPDF document so every `text()` call is sanitised, then returns
 * it. Use as `const doc = wrapPdf(new jsPDF(...))` -- the generator keeps
 * ownership of how jsPDF is imported (static or lazy) and simply cannot emit
 * unencodable text afterwards.
 */
export function wrapPdf<T extends jsPDF>(doc: T): T {
  const originalText = doc.text.bind(doc);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (doc as any).text = (text: unknown, ...rest: unknown[]) =>
    (originalText as unknown as (...a: unknown[]) => jsPDF)(sanitizeArg(text), ...rest);
  return doc;
}
