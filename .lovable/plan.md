Generate a formatted PDF version of `docs/partner-webhook.md` and deliver it as a downloadable artifact.

What I will do
- Read the existing markdown guide `docs/partner-webhook.md`.
- Convert it into a clean, printable PDF with:
  - a cover title ("Syxlab Partner Order Webhook Integration Guide"),
  - section headings,
  - the endpoint, auth, idempotency, and request-schema tables rendered as proper tables,
  - code examples in a monospaced style,
  - page numbers and a generated date.
- Save the PDF to `/mnt/documents/partner-webhook-guide.pdf` so it appears in the project downloads.
- Inspect the rendered pages by converting the PDF to images and verify tables and code are not clipped or overlapping.
- Emit a `<presentation-artifact>` tag so you can download it immediately.

Tools & approach
- Python + `reportlab`/`pypdf`/`pdfplumber` for PDF generation and QA, or `pandoc`/`weasyprint` if available gives a better markdown-to-PDF fidelity.
- QA follows the PDF processing skill: convert each page to an image and review before delivery.

Deliverable
- `/mnt/documents/partner-webhook-guide.pdf`