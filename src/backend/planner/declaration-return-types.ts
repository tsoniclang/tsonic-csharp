import type { CsharpTranslationContext } from "../../translate/context/index.js";
import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type { TargetTypeRef } from "../../policy/types/index.js";
import type {
  TargetDiagnostic,
} from "@tsonic/target-api";
import {
  sourceNodesEqual,
} from "@tsonic/target-api";
import { getCsharpTypeForNode, invalidCsharpType } from "./csharp-types.js";
import { unsupportedNodeDiagnostic } from "./diagnostics.js";
import { csharpTypeFromTargetTypeRef } from "./target-types.js";
import {
  csharpRuntimeUndefinedTargetType,
  csharpSourceTypeArgumentNodes,
  getCsharpNullableElementTargetType,
  getCsharpRuntimeUnionArms,
  getCsharpTaskResultTargetType,
  targetTypeRefKey,
} from "../../policy/types/index.js";
import {
  csharpConversionIsApplicable,
  selectCsharpCommonImplicitTarget,
  selectCsharpConversion,
} from "../../policy/conversions/index.js";

export type CsharpReturnTargetContractResult =
  | { readonly kind: "resolved"; readonly type: TargetTypeRef }
  | { readonly kind: "rejected"; readonly reason: string };

export function getExplicitReturnType(
  typeNode: Node | undefined,
  declarationNode: Node,
  context: string,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
): ReturnType<typeof getCsharpTypeForNode> {
  if (typeNode === undefined) {
    const returnTargetType = getInferredDeclarationReturnTargetType(
      declarationNode,
      sourceFile,
      input,
    );
    const inferred = returnTargetType === undefined
      ? undefined
      : csharpTypeFromTargetTypeRef(returnTargetType);
    if (inferred === undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(
        declarationNode,
        `C# ${context} emission requires one exact checked source signature with a closed target return representation.`,
      ));
      return invalidCsharpType(`${context} return type`);
    }
    return inferred;
  }
  return getCsharpTypeForNode(typeNode, sourceFile, input, invalidCsharpType(`${context} return type`), diagnostics);
}

export function getAsyncReturnExpressionExpectedType(
  typeNode: Node | undefined,
  declarationNode: Node,
  context: string,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
): { readonly type: ReturnType<typeof getCsharpTypeForNode>; readonly subject?: Node; readonly targetType: TargetTypeRef } | undefined {
  const returnTargetType = getDeclarationReturnTargetType(typeNode, declarationNode, sourceFile, input);
  const resultTargetType = getCsharpTaskResultTargetType(returnTargetType);
  if (resultTargetType === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(
      typeNode ?? declarationNode,
      `Async C# ${context} emission requires finalized Promise/Task result carrier facts before return expression planning.`,
    ));
    return undefined;
  }
  const type = csharpTypeFromTargetTypeRef(resultTargetType);
  if (type === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(
      typeNode ?? declarationNode,
      `Async C# ${context} emission requires a renderable Promise/Task result carrier before return expression planning.`,
    ));
    return undefined;
  }
  const subject = getAsyncReturnExpressionSubject(typeNode, input);
  return { type, ...(subject === undefined ? {} : { subject }), targetType: resultTargetType };
}

export function getDeclarationReturnTargetType(
  typeNode: Node | undefined,
  declarationNode: Node,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
) {
  if (typeNode !== undefined) {
    return input.types.resolveNode(typeNode, sourceFile);
  }
  return getInferredDeclarationReturnTargetType(
    declarationNode,
    sourceFile,
    input,
  );
}

export function reconcileInferredReturnTargetContract(
  input: Pick<
    CsharpTranslationContext,
    "projectTypes" | "providers" | "target"
  >,
  baseline: TargetTypeRef,
  observed: readonly TargetTypeRef[],
  incomplete: boolean,
): CsharpReturnTargetContractResult {
  if (incomplete) {
    return {
      kind: "rejected",
      reason:
        "An inferred C# public return contract contains a return expression without one closed target representation.",
    };
  }
  if (observed.length === 0) {
    return { kind: "resolved", type: baseline };
  }
  const requiredSources = [
    ...observed,
    ...uncoveredBaselineReturnAlternatives(input, baseline, observed),
  ];
  const selected = selectCsharpCommonImplicitTarget(
    input,
    requiredSources,
    [...observed, baseline],
  );
  if (selected.kind === "rejected") {
    return {
      kind: "rejected",
      reason: `An inferred C# public return contract contains incompatible exact target representations. ${selected.reason}`,
    };
  }
  return { kind: "resolved", type: selected.target };
}

function uncoveredBaselineReturnAlternatives(
  input: Pick<
    CsharpTranslationContext,
    "projectTypes" | "providers" | "target"
  >,
  baseline: TargetTypeRef,
  observed: readonly TargetTypeRef[],
): readonly TargetTypeRef[] {
  const alternatives = new Map<string, TargetTypeRef>();
  collectTargetContractAlternatives(baseline, alternatives);
  return [...alternatives.values()].filter((alternative) =>
    !observed.some((source) =>
      csharpConversionIsApplicable(
        selectCsharpConversion(input, source, alternative, "implicit"),
        "implicit",
      )
    )
  );
}

function collectTargetContractAlternatives(
  type: TargetTypeRef,
  alternatives: Map<string, TargetTypeRef>,
): void {
  const union = getCsharpRuntimeUnionArms(type);
  if (union !== undefined) {
    union.forEach((member) =>
      collectTargetContractAlternatives(member, alternatives)
    );
    return;
  }
  const nullableElement = getCsharpNullableElementTargetType(type);
  if (nullableElement !== undefined) {
    collectTargetContractAlternatives(nullableElement, alternatives);
    const undefinedType = csharpRuntimeUndefinedTargetType();
    alternatives.set(targetTypeRefKey(undefinedType), undefinedType);
    return;
  }
  alternatives.set(targetTypeRefKey(type), type);
}

function getAsyncReturnExpressionSubject(typeNode: Node | undefined, input: CsharpTranslationContext): Node | undefined {
  const typeArguments = csharpSourceTypeArgumentNodes(input.ast, typeNode);
  return typeArguments[0];
}

function getInferredDeclarationReturnTargetType(
  declarationNode: Node,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
): TargetTypeRef | undefined {
  const semantics = input.semantics(sourceFile);
  const declarationType = semantics.getTypeAtLocation(
    declarationNode,
  );
  const signatures = semantics.getCallSignaturesOfType(
    declarationType,
  );
  const selected = signatures.filter((signature) => {
    const declaration = semantics.getSignatureDeclaration(signature);
    return declaration !== undefined &&
      sourceNodesEqual(input.ast, declaration, declarationNode);
  });
  if (selected.length !== 1) {
    return undefined;
  }
  return input.types.resolveType(
    semantics.getReturnTypeOfSignature(selected[0]!),
    sourceFile,
  );
}
