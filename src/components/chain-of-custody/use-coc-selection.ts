import { useState, useCallback } from "react";

export function useCocSelection(recordIds: string[]) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggleOne = useCallback((id: string, checked: boolean) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback((checked: boolean) => {
    setSelected(checked ? new Set(recordIds) : new Set());
  }, [recordIds]);

  return { selected, toggleOne, toggleAll };
}
