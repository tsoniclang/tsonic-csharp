export function subjectIdentity(subject: unknown): string {
  if (subject !== null && typeof subject === "object") {
    const loc = (subject as { readonly Loc?: { readonly pos?: unknown; readonly end?: unknown } }).Loc;
    if (typeof loc?.pos === "number" && typeof loc.end === "number") {
      return `${loc.pos}:${loc.end}`;
    }
  }
  return "unknown";
}
