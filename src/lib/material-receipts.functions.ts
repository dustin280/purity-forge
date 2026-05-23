/**
 * Barrel for Material Receipts server functions, types, and shared constants.
 * Implementations live under ./material-receipts/*.
 */
export {
  MATERIAL_TYPES,
  QUARANTINE_STATUSES,
  ATTACHMENT_KINDS,
  type MaterialType,
  type QuarantineStatus,
  type AttachmentKind,
  type MaterialReceiptRow,
  type AttachmentRow,
} from "./material-receipts/receipts-shared.server";

export * from "./material-receipts/receipts-crud.functions";
export * from "./material-receipts/receipts-attachments.functions";
export * from "./material-receipts/receipts-suggestions.functions";