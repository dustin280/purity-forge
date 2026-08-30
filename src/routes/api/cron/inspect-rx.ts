/**
 * Diagnostic: reports the ACTUAL structure inside one OpenLab `.rx` injection
 * result, so the ACAML peak parser can be written against real data instead
 * of guessed element names.
 *
 * This exists because acaml.ts's peak-extraction path is explicitly
 * unvalidated -- every `.rx` inspected when it was written carried
 * `NoMethodProvided`, so the element names in it came from Agilent's
 * documented conventions rather than a confirmed file. Guessing a second
 * time (to add peak HEIGHT, which the parser currently drops entirely) would
 * repeat exactly the mistake that produces confident-looking wrong numbers.
 *
 * GET /api/cron/inspect-rx?fileId=<drive id>        one .rx by id
 * GET /api/cron/inspect-rx?folderId=<drive id>      first .rx in that folder
 *   &raw=1        include a slice of the XML itself
 *   &tag=Height   dump every occurrence of one element/attribute name
 *
 * Read-only. Downloads, unzips, and describes -- it writes nothing.
 */
import { createFileRoute } from "@tanstack/react-router";
import JSZip from "jszip";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { driveDownload, driveListByExt } from "@/lib/lab-logs/drive-results.functions";

/** Element names and their frequency, so the real schema is obvious. */
function elementHistogram(xml: string): Array<{ tag: string; count: number }> {
  const counts = new Map<string, number>();
  for (const m of xml.matchAll(/<([A-Za-z_][\w.\-]*)[\s/>]/g)) {
    counts.set(m[1], (counts.get(m[1]) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);
}

/** Attribute names seen anywhere, e.g. val="..." on numeric result elements. */
function attributeNames(xml: string): string[] {
  const set = new Set<string>();
  for (const m of xml.matchAll(/\s([A-Za-z_][\w.\-]*)="/g)) set.add(m[1]);
  return [...set].sort();
}

/**
 * Returns the full outer XML of the nth occurrence of an element, children
 * included, by scanning for the matching close tag rather than assuming the
 * element has no nested content. This is what makes real nesting visible --
 * a regex that stops at the first `<` shows nothing for a container element.
 */
function elementAt(xml: string, name: string, index: number): string | null {
  const open = new RegExp(`<${name}(?=[\s/>])`, "g");
  let m: RegExpExecArray | null;
  let seen = 0;
  while ((m = open.exec(xml))) {
    if (seen++ !== index) continue;
    const start = m.index;
    // Self-closing?
    const tagEnd = xml.indexOf(">", start);
    if (tagEnd > -1 && xml[tagEnd - 1] === "/") return xml.slice(start, tagEnd + 1);
    // Walk nested opens/closes to the matching close.
    const scan = new RegExp(`<${name}(?=[\s/>])|</${name}>`, "g");
    scan.lastIndex = start;
    let depth = 0;
    let t: RegExpExecArray | null;
    while ((t = scan.exec(xml))) {
      if (t[0].startsWith("</")) {
        if (--depth === 0) return xml.slice(start, t.index + t[0].length);
      } else {
        const te = xml.indexOf(">", t.index);
        if (!(te > -1 && xml[te - 1] === "/")) depth++;
      }
    }
    return xml.slice(start, Math.min(start + 4000, xml.length));
  }
  return null;
}

export const Route = createFileRoute("/api/cron/inspect-rx")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const provided = request.headers.get("x-cron-secret") ?? url.searchParams.get("secret");
        const { data: settings } = await supabaseAdmin
          .from("sp_settings").select("cron_secret").eq("id", true).maybeSingle();
        if (!settings?.cron_secret || provided !== settings.cron_secret) {
          return new Response("Unauthorized", { status: 401 });
        }

        try {
          let fileId = url.searchParams.get("fileId");
          const folderId = url.searchParams.get("folderId");
          if (!fileId && folderId) {
            const rx = await driveListByExt(folderId, "rx");
            if (!rx.length) {
              return Response.json({ ok: false, error: "no .rx files in that folder" }, { status: 404 });
            }
            fileId = rx[0].id;
          }
          if (!fileId) {
            return Response.json({ ok: false, error: "pass fileId or folderId" }, { status: 400 });
          }

          const bytes = await driveDownload(fileId);
          const zip = await JSZip.loadAsync(bytes);
          const entries = Object.keys(zip.files);

          const entry = zip.file("Base/InjectionACAML");
          if (!entry) {
            return Response.json({ ok: true, fileId, zipEntries: entries, note: "no Base/InjectionACAML entry" });
          }
          const xml = await entry.async("text");

          const stateMatch = xml.match(/<TransformationChainState>([^<]*)<\/TransformationChainState>/);
          const tag = url.searchParams.get("tag");
          const tagHits = tag
            ? [...xml.matchAll(new RegExp(`<${tag}\\b[^>]*>[^<]*</${tag}>|<${tag}\\b[^>]*/>`, "g"))]
                .slice(0, 40).map((m) => m[0])
            : undefined;

          return Response.json({
            ok: true,
            fileId,
            zipEntries: entries,
            xmlLength: xml.length,
            processingState: stateMatch?.[1] ?? null,
            // The whole point: what elements does this file ACTUALLY contain?
            elements: elementHistogram(xml).slice(0, 80),
            attributes: attributeNames(xml),
            // Anything that looks like it carries a height/amount/area value.
            signalCandidates: elementHistogram(xml)
              .filter((e) => /height|area|amount|response|signal|conc/i.test(e.tag)),
            tagHits,
            // ?element=Peak&index=0 -> that element's full outer XML.
            element: (() => {
              const name = url.searchParams.get("element");
              if (!name) return undefined;
              const idx = Number(url.searchParams.get("index") ?? "0") || 0;
              return elementAt(xml, name, idx);
            })(),
            // ?find=<substring>&window=<chars> -> the XML around it.
            find: (() => {
              const needle = url.searchParams.get("find");
              if (!needle) return undefined;
              const w = Math.min(Number(url.searchParams.get("window") ?? "2500") || 2500, 20000);
              const at = xml.indexOf(needle);
              if (at < 0) return { found: false };
              return { found: true, at, text: xml.slice(Math.max(0, at - 300), at + w) };
            })(),
            rawHead: url.searchParams.get("raw") === "1" ? xml.slice(0, 6000) : undefined,
          });
        } catch (err) {
          return Response.json({ ok: false, error: (err as Error).message }, { status: 500 });
        }
      },
    },
  },
});
