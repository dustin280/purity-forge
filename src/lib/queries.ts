/**
 * Per-domain TanStack Query `queryOptions` factories. Wraps existing
 * server functions so route loaders and components share one definition.
 *
 * Usage:
 *   loader: ({ context }) => context.queryClient.ensureQueryData(samplesListQuery())
 *   const { data } = useQuery(samplesListQuery())
 */
import { queryOptions } from "@tanstack/react-query";

import { qk } from "@/lib/query-keys";
import {
  getDashboard,
  listSamples,
  getSampleDetail,
  listUsers,
  listParameters,
  listCocFields,
  listCocRecords,
  getCocRecord,
  listIntakeQueue,
  listCocAttachments,
  getExportConfig,
  getSftpConfig,
} from "@/lib/lims.functions";
import {
  listStandardPreparations,
  getStandardPreparation,
  getStandardPreparationBatch,
  listStandardSuggestions,
  searchMaterialReceiptsForLink,
  listPrepsForReceipt,
} from "@/lib/standard-preparations.functions";
import {
  listMaterialReceipts,
  getMaterialReceipt,
  listMaterialSuggestions,
} from "@/lib/material-receipts.functions";
import { listBackpressureLogs } from "@/lib/daily-backpressure.functions";
import { listIssueReports } from "@/lib/issue-reports.functions";

// Dashboard
export const dashboardQuery = () =>
  queryOptions({ queryKey: qk.dashboard.all, queryFn: () => getDashboard() });

// Samples
export const samplesListQuery = () =>
  queryOptions({ queryKey: qk.samples.list(), queryFn: () => listSamples() });

export const sampleDetailQuery = (batchId: string) =>
  queryOptions({
    queryKey: qk.samples.detail(batchId),
    queryFn: () => getSampleDetail({ data: { batchId } }),
  });

// Users
export const usersListQuery = () =>
  queryOptions({ queryKey: qk.users.list(), queryFn: () => listUsers() });

// Test parameters
export const testParametersQuery = () =>
  queryOptions({
    queryKey: qk.testParameters.list(),
    queryFn: () => listParameters(),
  });

// Intake queue
export const intakeQueueQuery = () =>
  queryOptions({ queryKey: qk.intake.list(), queryFn: () => listIntakeQueue() });

// COC
export const cocFieldsQuery = () =>
  queryOptions({ queryKey: qk.cocFields.list(), queryFn: () => listCocFields() });

export const cocRecordsQuery = () =>
  queryOptions({ queryKey: qk.cocRecords.list(), queryFn: () => listCocRecords() });

export const cocRecordQuery = (id: string) =>
  queryOptions({
    queryKey: qk.cocRecords.detail(id),
    queryFn: () => getCocRecord({ data: { id } }),
  });

export const cocRecordViewQuery = (id: string) =>
  queryOptions({
    queryKey: qk.cocRecords.view(id),
    queryFn: () => getCocRecord({ data: { id } }),
  });

export const cocAttachmentsQuery = (cocId: string) =>
  queryOptions({
    queryKey: qk.cocRecords.attachments(cocId),
    queryFn: () => listCocAttachments({ data: { coc_id: cocId } }),
  });

// Integrations
export const exportConfigQuery = () =>
  queryOptions({
    queryKey: qk.integrations.exportConfig(),
    queryFn: () => getExportConfig(),
  });

export const sftpConfigQuery = () =>
  queryOptions({
    queryKey: qk.integrations.sftpConfig(),
    queryFn: () => getSftpConfig(),
  });

// Standard preparations
export const standardPrepsListQuery = (filters: unknown) =>
  queryOptions({
    queryKey: qk.standardPreps.list(filters),
    queryFn: () => listStandardPreparations({ data: filters as never }),
  });

export const standardPrepQuery = (id: string) =>
  queryOptions({
    queryKey: qk.standardPreps.detail(id),
    queryFn: () => getStandardPreparation({ data: { id } }),
  });

export const standardPrepBatchQuery = (groupId: string) =>
  queryOptions({
    queryKey: qk.standardPreps.batch(groupId),
    queryFn: () => getStandardPreparationBatch({ data: { group_id: groupId } }),
  });

export const standardSuggestionsQuery = () =>
  queryOptions({
    queryKey: qk.standardPreps.suggestions(),
    queryFn: () => listStandardSuggestions(),
  });

export const receiptLinkSearchQuery = (q: string, enabled: boolean) =>
  queryOptions({
    queryKey: qk.materialReceipts.search(q),
    queryFn: () =>
      searchMaterialReceiptsForLink({
        data: { q: q || null, approved_only: true },
      }),
    enabled,
  });

export const receiptPrepsQuery = (receiptId: string) =>
  queryOptions({
    queryKey: qk.materialReceipts.preps(receiptId),
    queryFn: () => listPrepsForReceipt({ data: { receipt_id: receiptId } }),
  });

// Material receipts
export const materialReceiptsListQuery = (filters: unknown) =>
  queryOptions({
    queryKey: qk.materialReceipts.list(filters),
    queryFn: () => listMaterialReceipts({ data: filters as never }),
  });

export const materialReceiptQuery = (id: string) =>
  queryOptions({
    queryKey: qk.materialReceipts.detail(id),
    queryFn: () => getMaterialReceipt({ data: { id } }),
  });

export const materialSuggestionsQuery = () =>
  queryOptions({
    queryKey: qk.materialReceipts.suggestions(),
    queryFn: () => listMaterialSuggestions(),
  });

// Backpressure
export const backpressureListQuery = () =>
  queryOptions({
    queryKey: qk.backpressure.list(),
    queryFn: () => listBackpressureLogs(),
  });

// Issues
export const issueReportsQuery = () =>
  queryOptions({
    queryKey: qk.issues.list(),
    queryFn: () => listIssueReports(),
  });