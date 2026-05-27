"use client";

// Shared grouped-checkbox grid for picking a member's features. Used in
// both the invite flow (compose initial set) and the edit-member dialog
// (revise an existing membership). The component is uncontrolled in the
// sense that it doesn't sanitize on its own — the parent decides when to
// run `sanitizeFeatures`, typically on submit.
//
// Cascading rules:
//   - toggling a feature ON also enables anything it `requires`
//   - toggling a feature OFF also disables anything that requires it
//
// The dependency map is rebuilt from FEATURE_GROUPS on mount; that catalog
// is the single source of truth for which features depend on which.

import { useMemo } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { FEATURE_GROUPS } from "@/lib/roles";

export function applyFeatureToggle(
  current: readonly string[],
  featureId: string,
  checked: boolean,
): string[] {
  const next = new Set(current);
  if (checked) {
    next.add(featureId);
    for (const group of FEATURE_GROUPS) {
      const f = group.features.find((x) => x.id === featureId);
      if (f?.requires) for (const r of f.requires) next.add(r);
    }
  } else {
    next.delete(featureId);
    for (const group of FEATURE_GROUPS) {
      for (const f of group.features) {
        if (f.requires?.includes(featureId)) next.delete(f.id);
      }
    }
  }
  return [...next];
}

type Props = {
  value: readonly string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
};

export function PermissionCheckboxes({ value, onChange, disabled }: Props) {
  // Set-version of `value` is rebuilt on every render — `value` is a fresh
  // array each time the parent updates state, so a memo keyed on it would
  // just be churn.
  const picked = useMemo(() => new Set(value), [value]);

  return (
    <div className="space-y-4">
      {FEATURE_GROUPS.map((group) => (
        <fieldset key={group.id} className="space-y-2">
          <legend className="text-foreground text-sm font-medium">{group.label}</legend>
          <div className="space-y-1.5">
            {group.features.map((f) => {
              const checked = picked.has(f.id);
              return (
                <label
                  key={f.id}
                  className="flex cursor-pointer items-start gap-2 text-sm select-none"
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(v) => onChange(applyFeatureToggle(value, f.id, Boolean(v)))}
                    disabled={disabled}
                    className="mt-0.5"
                  />
                  <span>{f.label}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}
    </div>
  );
}
