/**
 * ECIT SVG logo extracted from the HR Analyse internal app.
 * Renders white by default (for dark sidebar backgrounds).
 */
export function EcitLogo({
  className,
  width = 90,
  height = 40,
}: {
  className?: string;
  width?: number;
  height?: number;
}) {
  return (
    <svg
      viewBox="0 0 135 60"
      width={width}
      height={height}
      className={className}
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M0 0h28.5v11.4H12.2v9.4h14.4V32H12.2v10.3h17.1V53.7H0V0z" />
      <path d="M63.3 42.7c-3 7.6-10.6 12.3-19.2 12.3C32.6 55 23 46 23 34.3v-8.7C23 14 32.6 5 44.1 5c8.6 0 16.2 4.7 19.2 12.3l-11.1 4.3c-1.5-4-5-6.5-8.8-6.5-5.4 0-9.3 4.5-9.3 10.6v7.5c0 6.1 3.9 10.6 9.3 10.6 3.8 0 7.3-2.5 8.8-6.5l11.1 4.4z" />
      <path d="M67 0h12.2v53.7H67V0z" />
      <path d="M96.3 11.4h-13V0H121v11.4h-12.5v42.3H96.3V11.4z" />
      <path d="M127 53.7h-8V60h8v-6.3z" />
    </svg>
  );
}
