/**
 * Centralized TanStack Query keys. Single source of truth so that
 * invalidation in mutations and reads in components stay in lockstep.
 *
 * Shape rules:
 *   qk.<domain>.all                 -> root, prefix-invalidates the whole domain
 *   qk.<domain>.list(filters?)      -> collection (optionally filtered)
 *   qk.<domain>.detail(id)          -> single record
 *   qk.<domain>.<sub>(parentId)     -> sub-resource of a parent
 *
 * `as const` keeps every key tuple literally typed so `invalidateQueries`
 * can prefix-match correctly.
 */

export const qk = {
  users: {
    all: ["users"] as const,
    list: () => ["users"] as const,
  },

  dashboard: {
    all: ["dashboard"] as const,
  },

  samples: {
    all: ["samples"] as const,
    list: () => ["samples"] as const,
    detail: (batchId: string) => ["sample", batchId] as const,
  },

  intake: {
    all: ["intake_queue"] as const,
    list: () => ["intake_queue"] as const,
  },

  testParameters: {
    all: ["test_parameters"] as const,
    list: () => ["test_parameters"] as const,
  },

  standardPreps: {
    all: ["standard-preparations"] as const,
    list: (filters?: unknown) =>
      filters === undefined
        ? (["standard-preparations"] as const)
        : (["standard-preparations", filters] as const),
    detail: (id: string) => ["standard-preparation", id] as const,
    batch: (groupId: string) => ["prep-batch", groupId] as const,
    suggestions: () => ["standard-suggestions"] as const,
  },

  materialReceipts: {
    all: ["material-receipts"] as const,
    list: (filters?: unknown) =>
      filters === undefined
        ? (["material-receipts"] as const)
        : (["material-receipts", filters] as const),
    detail: (id: string) => ["material-receipt", id] as const,
    preps: (receiptId: string) => ["receipt-preps", receiptId] as const,
    suggestions: () => ["material-suggestions"] as const,
    search: (q: string) => ["receipt-link-search", q] as const,
  },

  backpressure: {
    all: ["daily-backpressure"] as const,
    list: () => ["daily-backpressure"] as const,
  },

  parameterScouting: {
    all: ["parameter-scouting"] as const,
    list: () => ["parameter-scouting"] as const,
  },

  compounds: {
    all: ["compounds"] as const,
    list: () => ["compounds"] as const,
  },

  auditLog: {
    all: ["audit_log"] as const,
    list: (from: string, to: string, table: string) =>
      ["audit_log", from, to, table] as const,
    profiles: (actorIds: string) => ["audit_log_profiles", actorIds] as const,
  },

  accessLogs: {
    all: ["access_logs"] as const,
    list: (from: string, to: string) => ["access_logs", from, to] as const,
  },

  issues: {
    all: ["issue-reports"] as const,
    list: () => ["issue-reports"] as const,
  },

  cocFields: {
    all: ["coc_fields"] as const,
    list: () => ["coc_fields"] as const,
  },

  cocRecords: {
    all: ["coc_records"] as const,
    list: () => ["coc_records"] as const,
    detail: (id: string | null | undefined) => ["coc_record", id] as const,
    view: (id: string | null | undefined) =>
      ["coc_record_view", id] as const,
    attachments: (cocId: string | null | undefined) =>
      ["coc_attachments", cocId] as const,
    attachmentsAll: ["coc_attachments"] as const,
  },

  integrations: {
    exportConfig: () => ["export_config"] as const,
    sftpConfig: () => ["sftp_config"] as const,
  },
} as const;