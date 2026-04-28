type Size = "xs" | "sm" | "md" | "lg" | "xl";

const SIZES: Record<Size, { px: number; text: string }> = {
  xs: { px: 24, text: "text-[10px]" },
  sm: { px: 32, text: "text-xs" },
  md: { px: 40, text: "text-sm" },
  lg: { px: 56, text: "text-base" },
  xl: { px: 96, text: "text-2xl" },
};

export default function Avatar({
  name,
  photoUrl,
  size = "md",
  className = "",
}: {
  name: string;
  photoUrl?: string | null;
  size?: Size;
  className?: string;
}) {
  const dim = SIZES[size];
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");
  return (
    <div
      className={`avatar ${dim.text} ${className}`}
      style={{ width: dim.px, height: dim.px }}
      aria-label={name}
    >
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoUrl} alt={name} />
      ) : (
        <span className="font-medium">{initials || "?"}</span>
      )}
    </div>
  );
}
