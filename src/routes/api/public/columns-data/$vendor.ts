import { createFileRoute } from "@tanstack/react-router";
import agilentCsv from "@/data/hplc-columns.csv?raw";
import watersCsv from "@/data/waters-columns.csv?raw";
import phenomenexCsv from "@/data/phenomenex-columns.csv?raw";

const CSVS: Record<string, string> = {
  agilent: agilentCsv,
  waters: watersCsv,
  phenomenex: phenomenexCsv,
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

export const Route = createFileRoute("/api/public/columns-data/$vendor")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ params }) => {
        const csv = CSVS[params.vendor.toLowerCase()];
        if (!csv) {
          return new Response(JSON.stringify({ error: "Unknown vendor" }), {
            status: 404,
            headers: { "Content-Type": "application/json", ...CORS },
          });
        }
        return new Response(csv, {
          status: 200,
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Cache-Control": "public, max-age=300",
            ...CORS,
          },
        });
      },
    },
  },
});