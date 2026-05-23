import { useState, useEffect } from "react";
import { listCocDrafts, subscribeCocDrafts, type CocDraft } from "@/lib/coc-drafts";

export function useCocDrafts() {
  const [drafts, setDrafts] = useState<CocDraft[]>(() => listCocDrafts());

  useEffect(() => {
    setDrafts(listCocDrafts());
    return subscribeCocDrafts(() => setDrafts(listCocDrafts()));
  }, []);

  return drafts;
}
