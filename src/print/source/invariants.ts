import { failCsharpPlannerInvariant } from "../../backend/invariants.js";

export function failCsharpSyntaxInvariant(node: unknown, category: string): never {
  const kind = typeof node === "object" && node !== null && "kind" in node
    ? String((node as { readonly kind?: unknown }).kind)
    : "<missing-kind>";
  return failCsharpPlannerInvariant(`Unsupported C# ${category} syntax reached printer: ${kind}`);
}
