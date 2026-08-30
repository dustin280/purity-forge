/**
 * Diagnostic: reports what is ACTUALLY inside an OpenLab result file, so
 * parsers can be written against real structure instead of guessed element
 * names. That distinction is not academic here -- the ACAML peak parser was
 * originally written from Agilent's documented conventions and returned zero
 * rows on every real file, because the compound name does not live where the
 * documentation implied.
 *
 * Reads any file in a `.rslt` folder, zipped or not:
 *   - `.rx` / `.pmx` / `.amx` are zip archives; `entry` picks the member,
 *     defaulting to `Base/InjectionACAML` for a `.rx`.
 *   - `sequence.acaml` / `sequence.mfx` are plain XML.
 *
 * GET /api/cron/inspect-rx
 *   ?fileId=<drive id>              a specific file
 *   ?folderId=<drive id>&ext=rx     first file of that extension in a folder
 *   &entry=Base/AuditTrail          which zip member to read
 *   &list=1                         just list the zip members
 *   &element=Peak&index=0           one element's full outer XML
 *   &find=<text>&window=4000        a window around a substring
 *   &tag=Height                     every occurrence of a leaf element
 *   &raw=1                          the first 6 KB verbatim
 *
 * Read-only: it downloads, unzips and describes. It writes nothing.
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

function attributeNames(xml: string): string[] {
  const set = new Set<string>();
  for (const m of xml.matchAll(/\s([A-Za-z_][\w.\-]*)="/g)) set.add(m[1]);
  return [...set].sort();
}

/**
 * Full outer XML of the nth occurrence of an element, children included.
 *
 * The tag boundary is a lookahead rather than a backslash escape on purpose:
 * inside a template literal `\s` collapses to a literal "s" and `\b` to
 * BACKSPACE, so an earlier version of this asking for "Peak" silently
 * matched "<Peaks>" instead. A lookahead needs no escaping.
 *
 * It excludes digits and "_" as well as letters, so that asking for "Method"
 * cannot match the `<Method_ID>` cross-reference that sits in the same file.
 */
function elementAt(xml: string, name: string, index: number): string | null {
  const open = new RegExp(`<${name}(?![A-Za-z0-9_])`, "g");
  let m: RegExpExecArray | null;
  let seen = 0;
  while ((m = open.exec(xml))) {
    if (seen++ !== index) continue;
    const start = m.index;
    const tagEnd = xml.indexOf(">", start);
    if (tagEnd > -1 && xml[tagEnd - 1] === "/") return xml.slice(start, tagEnd + 1);
    const scan = new RegExp(`<${name}(?![A-Za-z0-9_])|</${name}>`, "g");
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
    return xml.slice(start, Math.min(start + 6000, xml.length));
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
          const ext = url.searchParams.get("ext") ?? "rx";
          let fileName: string | null = null;
          if (!fileId && folderId) {
            const files = await driveListByExt(folderId, ext);
            if (!files.length) {
              return Response.json({ ok: false, error: `no .${ext} files in that folder` }, { status: 404 });
            }
            fileId = files[0].id;
            fileName = files[0].name;
          }
          if (!fileId) {
            return Response.json({ ok: false, error: "pass fileId, or folderId (+ext)" }, { status: 400 });
          }

          const bytes = await driveDownload(fileId);
          let xml: string;
          let zipEntries: string[] | undefined;
          let entryRead: string | null = null;

          // Zip archives start with "PK". Anything else is read as plain text.
          const isZip = bytes.byteLength > 1
            && new Uint8Array(bytes)[0] === 0x50 && new Uint8Array(bytes)[1] === 0x4b;
          if (isZip) {
            const zip = await JSZip.loadAsync(bytes);
            zipEntries = Object.keys(zip.files);
            if (url.searchParams.get("list") === "1") {
              return Response.json({ ok: true, fileId, fileName, zipEntries });
            }
            const wanted = url.searchParams.get("entry")
              ?? (zipEntries.includes("Base/InjectionACAML") ? "Base/InjectionACAML" : zipEntries[0]);
            const entry = zip.file(wanted);
            if (!entry) {
              return Response.json({ ok: false, error: `no such entry: ${wanted}`, zipEntries }, { status: 404 });
            }
            entryRead = wanted;
            xml = await entry.async("text");
          } else {
            xml = new TextDecoder("utf-8").decode(bytes);
          }

          const tag = url.searchParams.get("tag");
          const tagHits = tag
            ? [...xml.matchAll(new RegExp(`<${tag}(?![A-Za-z0-9_])[^>]*>[^<]*</${tag}>|<${tag}(?![A-Za-z0-9_])[^>]*/>`, "g"))]
                .slice(0, 40).map((m) => m[0])
            : undefined;

          return Response.json({
            ok: true,
            fileId,
            fileName,
            isZip,
            zipEntries,
            entryRead,
            xmlLength: xml.length,
            processingState: xml.match(/<TransformationChainState>([^<]*)<\/TransformationChainState>/)?.[1] ?? null,
            elements: elementHistogram(xml).slice(0, 80),
            attributes: attributeNames(xml),
            // Anything that might name or reference a method.
            methodCandidates: elementHistogram(xml)
              .filter((e) => /method|acq|process|instrument|template/i.test(e.tag)),
            tagHits,
            element: (() => {
              const name = url.searchParams.get("element");
              if (!name) return undefined;
              return elementAt(xml, name, Number(url.searchParams.get("index") ?? "0") || 0);
            })(),
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
