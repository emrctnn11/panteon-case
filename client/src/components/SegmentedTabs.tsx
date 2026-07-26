export interface SegmentedTab<T extends string> {
  id: T;
  label: string;
}

export interface SegmentedTabsProps<T extends string> {
  tabs: readonly SegmentedTab<T>[];
  value: T;
  onChange: (id: T) => void;
  /** Accessible group label for the tablist. */
  ariaLabel: string;
}

/**
 * Generic segmented control (This week / Last week here). Presentational and
 * controlled — the parent owns the selected value, so this holds no state and
 * can drive anything (CLAUDE.md React conventions). Typed on the tab id so the
 * caller's `onChange` stays exhaustive.
 */
export function SegmentedTabs<T extends string>({
  tabs,
  value,
  onChange,
  ariaLabel,
}: SegmentedTabsProps<T>) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="inline-flex gap-1 rounded-xl border border-slate-800 bg-slate-900/70 p-1"
    >
      {tabs.map((tab) => {
        const isActive = tab.id === value;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.id)}
            className={[
              'rounded-lg px-4 py-1.5 text-sm font-medium transition-colors',
              isActive
                ? 'bg-indigo-500/90 text-white shadow'
                : 'text-slate-400 hover:text-slate-200',
            ].join(' ')}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
