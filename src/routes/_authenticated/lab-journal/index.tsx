import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useAuth, profileDisplayName } from "@/hooks/use-auth";
import { EntryForm } from "@/components/lab-journal/entry-form";
import { EntriesList } from "@/components/lab-journal/entries-list";
import {
  useLabJournal,
  type LabJournalEntry,
} from "@/components/lab-journal/use-lab-journal";

export const Route = createFileRoute("/_authenticated/lab-journal/")({
  component: LabJournalPage,
});

function LabJournalPage() {
  const { profile, user } = useAuth();
  const defaultName =
    profileDisplayName(profile, user?.email) || user?.email || "Unknown";
  const { query, createMut, updateMut, deleteMut } = useLabJournal();
  const [editing, setEditing] = useState<LabJournalEntry | null>(null);
  const rows = query.data ?? [];

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl">
      <div className="mb-6">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
          Personal
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-1">Lab Journal</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Your private notebook. Free-write observations, ideas, and decisions —
          export any entry to PDF.
        </p>
      </div>

      <div className="space-y-6">
        <EntryForm
          defaultUserName={defaultName}
          userId={user?.id ?? null}
          editing={editing}
          saving={createMut.isPending || updateMut.isPending}
          deleting={deleteMut.isPending}
          onSubmit={async (payload) => {
            if (editing) {
              await updateMut.mutateAsync({
                id: editing.id,
                entry_at: payload.entry_at,
                title: payload.title,
                body: payload.body,
                tags: payload.tags,
              });
              setEditing(null);
            } else {
              await createMut.mutateAsync(payload);
            }
          }}
          onDelete={
            editing
              ? () =>
                  deleteMut.mutate(editing.id, {
                    onSuccess: () => setEditing(null),
                  })
              : undefined
          }
          onCancelEdit={() => setEditing(null)}
        />

        <EntriesList
          rows={rows}
          loading={query.isLoading}
          defaultAuthor={defaultName}
          onEdit={(r) => {
            setEditing(r);
            if (typeof window !== "undefined")
              window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        />
      </div>
    </div>
  );
}