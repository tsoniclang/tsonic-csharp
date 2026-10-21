import { failTargetPlannerInvariant } from "@tsonic/target-api/artifacts";

export function failCsharpSyntaxInvariant(node: unknown, category: string): never {
  const kind = typeof node === "object" && node !== null && "kind" in node
    ? String((node as { readonly kind?: unknown }).kind)
    : "<missing-kind>";
  return failTargetPlannerInvariant("tsonic-csharp", `Unsupported C# ${category} syntax reached printer: ${kind}`);
}
