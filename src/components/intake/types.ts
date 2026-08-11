/**
 * Shared types for the intake queue UI. Co-located so the route and the
 * verify dialog agree on the staged-sample shape without circular imports.
 */
export type IntakeSample = {
  id: string;
  batch_id: string;
  client: string;
  client_id: string | null;
  project: string | null;
  compound: string | null;
  compound_id: string | null;
  lot: string | null;
  parameters: string[];
  notes: string | null;
  coc_id: string | null;
  receipt_date: string;
  created_at: string;
  container_size: string | null;
  concentration: string | null;
  temperature_c: number | null;
};