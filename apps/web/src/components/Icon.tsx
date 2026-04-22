const modules = import.meta.glob("../assets/icons/*.svg", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const icons: Record<string, string> = {};
for (const [path, raw] of Object.entries(modules)) {
  const m = path.match(/\/([^/]+)\.svg$/);
  if (m && m[1]) icons[m[1]] = raw;
}

export type IconName = string;

export function Icon({
  name,
  size = 16,
  className,
  title,
}: {
  name: IconName;
  size?: number;
  className?: string;
  title?: string;
}) {
  const raw = icons[name];
  if (!raw) {
    if (typeof console !== "undefined") console.warn(`[Icon] missing icon: ${name}`);
    return null;
  }
  const withAttrs = raw.replace(
    /<svg([^>]*)>/,
    `<svg$1 width="${size}" height="${size}" role="img" aria-label="${title ?? name}">`,
  );
  return (
    <span
      className={className}
      style={{ display: "inline-flex", flexShrink: 0, lineHeight: 0 }}
      dangerouslySetInnerHTML={{ __html: withAttrs }}
    />
  );
}
