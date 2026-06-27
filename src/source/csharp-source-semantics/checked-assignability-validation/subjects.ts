import type {
  Node,
} from "@tsonic/tsts";

export function asNode(value: unknown): Node | undefined {
  return value !== undefined && value !== null && typeof value === "object" ? value as Node : undefined;
}

export function subjectIdentity(subject: unknown): string {
  if (subject !== null && typeof subject === "object" && "id" in subject) {
    return String((subject as { readonly id?: unknown }).id ?? "unknown");
  }
  return "unknown";
}
