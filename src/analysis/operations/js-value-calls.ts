import type { Node } from "@tsonic/tsts";
import type { SourceApplication, SourceMemberUse } from "@tsonic/target-api/source";

export type CsharpJsValueCallShape =
  | { readonly kind: "direct"; readonly receiver?: undefined }
  | { readonly kind: "property" | "element"; readonly receiver: Node };

export function classifyCsharpJsValueCallShape(
  source: SourceApplication,
  member: SourceMemberUse | undefined,
): CsharpJsValueCallShape {
  if (source.receiver.kind !== "value" || member === undefined) return Object.freeze({ kind: "direct" });
  if (member.occurrence !== source.callee.occurrence || member.receiver.occurrence !== source.receiver.occurrence || !member.callCallee) {
    throw new TypeError("A Native JS member call requires its identical original Source callee and receiver use.");
  }
  return Object.freeze({ kind: member.key.kind === "present" ? "element" : "property",
    receiver: member.receiver.occurrence });
}
