import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Number fields need one extra behaviour that a bare <input type="number">
 * doesn't give you.
 *
 * Nearly every numeric field here is controlled by a number in state and
 * coerces on change (`Number(e.target.value)`). Clearing the field sends "",
 * `Number("")` is 0, so state stays 0 and React re-renders the very digit
 * the user just deleted. The field becomes impossible to empty: you type
 * the number you want, then have to select the leftover 0 and remove it.
 *
 * So while a number field is focused we render a local string buffer of
 * exactly what was typed -- "" included -- and let the parent's state be
 * whatever it makes of that. On blur the buffer is dropped and the field
 * snaps back to the stored value, which also restores the display when a
 * parent clamps or rejects the input.
 *
 * Focus additionally selects the contents, so typing over a default value
 * replaces it instead of appending to it. It runs a frame late so a click
 * has finished placing its caret first.
 */
const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, value, onChange, onBlur, onFocus, ...props }, ref) => {
    const isControlledNumber = type === "number" && value !== undefined;
    const [buffer, setBuffer] = React.useState<string | null>(null);

    const handleChange = React.useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        if (isControlledNumber) setBuffer(e.target.value);
        onChange?.(e);
      },
      [isControlledNumber, onChange],
    );

    const handleFocus = React.useCallback(
      (e: React.FocusEvent<HTMLInputElement>) => {
        if (type === "number") {
          const el = e.currentTarget;
          requestAnimationFrame(() => {
            // Guard: focus may have moved on, and select() throws on some
            // input types in Safari.
            try { if (document.activeElement === el) el.select(); } catch { /* ignore */ }
          });
        }
        onFocus?.(e);
      },
      [type, onFocus],
    );

    const handleBlur = React.useCallback(
      (e: React.FocusEvent<HTMLInputElement>) => {
        setBuffer(null);
        onBlur?.(e);
      },
      [onBlur],
    );

    return (
      <input
        type={type}
        value={isControlledNumber && buffer !== null ? buffer : value}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        className={cn(
          "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
