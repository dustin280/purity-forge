import { statusClasses, STATUS_LABEL, type SampleStatus } from "@/lib/lims-utils";
export function StatusPill({ status }: { status: SampleStatus }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${statusClasses(status)}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}
