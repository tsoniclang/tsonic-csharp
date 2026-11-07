import type { CsharpResolvedResourceManagement, CsharpResourceDisposalOperation } from "../../target-model/records/storage/management.js";
import type { Node } from "@tsonic/tsts";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import { sourceResourceSelection } from "../program/source-facts.js";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import type { TargetTypeRef } from "../../policy/types/index.js";

import type { CsharpOperationSelection } from "../../target-model/records/operations/operator-selection.js";

import { selectCsharpNativeResourceManagement } from "../../policy/operations/resources/management.js";

/**
 * The native disposal registration of a `using` / `await using` declaration, from the published resource selection
 * (facts.selections.resource): one disposal per resource alternative, in Host order. Dynamic (untyped) disposal is a
 * Host refusal and never reaches C#.
 */
export function selectCsharpResourceManagement(
  input: CsharpPolicyContext,
  declaration: Node,
): CsharpOperationSelection<CsharpResolvedResourceManagement> {
  const source = sourceResourceSelection(input.facts, declaration) ?? failTargetAnalysisInvariant("tsonic-csharp",
    "The Host published no resource selection for a using declaration.", declaration);
  const storage = input.types.storage(declaration);
  if (storage.kind === "csharp-refused") return rejected(storage.message, storage.code);
  const alternatives: { readonly targetType: TargetTypeRef; readonly disposal: CsharpResourceDisposalOperation }[] = [];
  for (const alternative of source.alternatives) {
    const targetType = input.types.represent(alternative.type, declaration, "value");
    if (targetType.kind === "csharp-refused") return rejected(targetType.message, targetType.code);
    alternatives.push({ targetType, disposal: resolveDisposalOperation(alternative.kind) });
  }
  return selectCsharpNativeResourceManagement(source, storage, alternatives, input.typeDefinitions);
}

function resolveDisposalOperation(
  sourceKind: "sync" | "async",
): CsharpResourceDisposalOperation {
  return sourceKind === "sync"
    ? { kind: "sync", targetName: "Dispose" }
    : { kind: "async", targetName: "DisposeAsync" };
}

function rejected(
  reason: string,
  code: `CSHARP_${string}`,
): Extract<CsharpOperationSelection<never>, { readonly kind: "rejected" }> {
  return { kind: "rejected", reason, code };
}
