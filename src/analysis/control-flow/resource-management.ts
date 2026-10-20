import type { CsharpResolvedResourceManagement, CsharpResourceDisposalOperation } from "../../target-model/records/management.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import type { TargetTypeRef } from "../../policy/types/index.js";

import type { CsharpOperationSelection } from "../../target-model/records/operator-selection.js";

import { selectCsharpNativeResourceManagement } from "../../policy/operations/resources/management.js";

export function selectCsharpResourceManagement(
  input: CsharpPolicyContext,
  declaration: Node,
  sourceFile: SourceFile,
): CsharpOperationSelection<CsharpResolvedResourceManagement> {
  const source = input.semantics(sourceFile)
    .operations.resourceManagement(declaration);
  if (source === undefined) {
    return rejected(
      "TSTS did not retain exact checked resource-management evidence for this declaration.",
    );
  }
  if (source.disposal.kind !== "selected") {
    return rejected(
      "Untyped dynamic resource disposal has no closed C# target operation.",
    );
  }
  const storageType = input.types.resolveStorage(declaration, sourceFile);
  if (storageType === undefined) {
    return rejected(
      "The exact selected resource has no closed C# storage and disposal carrier.",
    );
  }
  const alternatives = source.disposal.alternatives.map((alternative) => {
    const targetType = input.types.resolveType(alternative.sourceType, sourceFile);
    const disposal = resolveDisposalOperation(alternative.kind);
    return targetType === undefined
      ? undefined
      : { targetType, disposal };
  });
  if (alternatives.some((alternative) => alternative === undefined)) {
    return rejected(
      "An exact selected resource alternative has no closed C# disposal operation.",
    );
  }
  return selectCsharpNativeResourceManagement(source, storageType,
    alternatives as readonly { readonly targetType: TargetTypeRef; readonly disposal: CsharpResourceDisposalOperation }[], input.typeDefinitions);
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
): Extract<CsharpOperationSelection<never>, { readonly kind: "rejected" }> {
  return { kind: "rejected", reason };
}
