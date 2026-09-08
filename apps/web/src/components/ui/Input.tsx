interface InputProps {
  label?: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  rows?: number;
  className?: string;
}

export function Input({
  label,
  placeholder,
  value,
  onChange,
  multiline = false,
  rows = 4,
  className = "",
}: InputProps) {
  const baseClasses =
    "w-full rounded-md border border-subtle bg-surface-inset px-3 py-2 text-[13px] font-body text-fg-primary placeholder:text-fg-muted/70 transition-colors focus:border-accent/60 focus:outline-none focus:ring-1 focus:ring-accent/40";

  return (
    <label className={`flex flex-col gap-1.5 ${className}`}>
      {label && (
        <span className="text-[12px] font-caption font-medium text-fg-secondary">
          {label}
        </span>
      )}
      {multiline ? (
        <textarea
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={rows}
          className={baseClasses + " resize-y"}
        />
      ) : (
        <input
          type="text"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={baseClasses}
        />
      )}
    </label>
  );
}
