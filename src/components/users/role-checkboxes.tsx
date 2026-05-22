import { ROLES, type Role } from "./types";

/**
 * Inline checkbox group for picking roles. Used by the Add and Invite
 * dialogs; deliberately kept as plain checkboxes (not Switches) since
 * multi-select roles read more naturally as a checkbox list.
 */
export function RoleCheckboxes({
  value,
  onChange,
}: {
  value: Role[];
  onChange: (roles: Role[]) => void;
}) {
  return (
    <div className="flex gap-4 mt-2">
      {ROLES.map(r => (
        <label key={r} className="flex items-center gap-2 text-sm capitalize">
          <input
            type="checkbox"
            checked={value.includes(r)}
            onChange={e => onChange(e.target.checked ? [...value, r] : value.filter(x => x !== r))}
          />
          {r}
        </label>
      ))}
    </div>
  );
}