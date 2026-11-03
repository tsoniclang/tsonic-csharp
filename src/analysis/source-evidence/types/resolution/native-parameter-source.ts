import type { AstReader, Node } from "@tsonic/tsts";
import type { TargetTypeRef } from "../../../../target-model/types/model.js";
import type { CsharpTypeResolutionState } from "./model.js";
import type { CsharpTypeResolutionScope } from "./scope.js";

export type CsharpNativeParameterSource = {
  readonly parameter: Node;
} & (
  | { readonly kind: "not-parameter" }
  | { readonly kind: "parameter"; readonly owner: Node | undefined }
);

export function formCsharpNativeParameterSource(
  ast: AstReader,
  parameter: Node,
): CsharpNativeParameterSource {
  return ast.is.IsParameterDeclaration(parameter)
    ? Object.freeze({ kind: "parameter", parameter, owner: ast.parent(parameter) })
    : Object.freeze({ kind: "not-parameter", parameter });
}

export function resolveFormedCsharpNativeParameterCarrier(
  scope: Pick<CsharpTypeResolutionScope, "host">,
  source: CsharpNativeParameterSource,
  type: TargetTypeRef | undefined,
  state: CsharpTypeResolutionState,
): TargetTypeRef | undefined {
  if (type === undefined || source.kind === "not-parameter") return type;
  if (source.owner === undefined) return undefined;
  const selected = scope.host.objectShapes.resolveNativeParameter(source.owner, source.parameter, type);
  if (selected.kind === "resolved") return selected.type;
  state.rejectNativeResolution?.(selected);
  return undefined;
}
