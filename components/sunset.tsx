/**
 * The sunset print: hard-edged diagonal bands in the app's palette, used by the sign-in
 * page, the Spotify step and the Home card so they share one definition.
 */
export function SunsetBands({ variant, className = "" }: { variant: "full" | "strip" | "edge"; className?: string }) {
  return <div className={`sunset sunset-${variant} ${className}`} aria-hidden="true" />;
}
