import type { CsharpPlanningContext } from "../context.js";
import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type { TargetTypeRef } from "../../../policy/types/index.js";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import { sourceNodesEqual } from "@tsonic/target-api/source";
import { getCsharpTypeForNode, invalidCsharpType } from "../types/index.js";
import { unsupportedNodeDiagnostic } from "../diagnostics.js";
import { csharpTypeFromTargetTypeRef } from "../types/target-types.js";
import {
  csharpRuntimeUndefinedTargetType,
  csharpSourceTypeArgumentNodes,
  csharpVoidTargetType,
  getCsharpNullableElementTargetType,
  getCsharpRuntimeUnionArms,
  getCsharpTaskResultTargetType,
  isCsharpNeverTargetType,
  targetTypeRefKey,
} from "../../../policy/types/index.js";
import {
  csharpConversionIsApplicable,
  selectCsharpCommonImplicitTarget,
  selectCsharpConversion,
} from "../../../policy/conversions/index.js";
import type { CsharpPolicyContext } from "../../../policy/context.js";

export type CsharpReturnTargetContractResult =
  | { readonly kind: "resolved"; readonly type: TargetTypeRef }
  | { readonly kind: "rejected"; readonly reason: string };

export function getExplicitReturnType(
  typeNode: Node | undefined,
  declarationNode: Node,
  context: string,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
): ReturnType<typeof getCsharpTypeForNode> {
  if (typeNode === undefined) {
    const returnTargetType = getInferredDeclarationReturnTargetType(
      declarationNode,
      sourceFile,
      input,
    );
    const inferred = csharpDeclarationReturnType(returnTargetType);
    if (inferred === undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(
        declarationNode,
        `C# ${context} emission requires one exact checked source signature with a closed target return representation.`,
      ));
      return invalidCsharpType(`${context} return type`);
    }
    return inferred;
  }
  const explicitTargetType = input.types.policy.resolveNode(typeNode, sourceFile);
  if (isCsharpNeverTargetType(explicitTargetType)) {
    const neverReturnType = csharpDeclarationReturnType(explicitTargetType);
    if (neverReturnType !== undefined) {
      return neverReturnType;
    }
  }
  return getCsharpTypeForNode(typeNode, sourceFile, input, invalidCsharpType(`${context} return type`), diagnostics);
}

function csharpDeclarationReturnType(
  targetType: TargetTypeRef | undefined,
): ReturnType<typeof getCsharpTypeForNode> | undefined {
  if (isCsharpNeverTargetType(targetType)) {
    return csharpTypeFromTargetTypeRef(csharpVoidTargetType());
  }
  return targetType === undefined
    ? undefined
    : csharpTypeFromTargetTypeRef(targetType);
}

export function getAsyncReturnExpressionExpectedType(
  typeNode: Node | undefined,
  declarationNode: Node,
  context: string,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
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
  input: CsharpPlanningContext,
) {
  if (typeNode !== undefined) {
    return input.types.policy.resolveNode(typeNode, sourceFile);
  }
  return getInferredDeclarationReturnTargetType(
    declarationNode,
    sourceFile,
    input,
  );
}

export function reconcileInferredReturnTargetContract(
  input: Pick<
    CsharpPolicyContext,
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
    CsharpPolicyContext,
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

function getAsyncReturnExpressionSubject(typeNode: Node | undefined, input: CsharpPlanningContext): Node | undefined {
  const typeArguments = csharpSourceTypeArgumentNodes(input.program.source.ast, typeNode);
  return typeArguments[0];
}

function getInferredDeclarationReturnTargetType(
  declarationNode: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
): TargetTypeRef | undefined {
  const semantics = input.program.source.semantics.forFile(sourceFile);
  const declarationType = semantics.types.expressionType(
    declarationNode,
  );
  if (declarationType === undefined) {
    return undefined;
  }
  const signatures = semantics.types.callSignatures(
    declarationType,
  );
  const selected = signatures.filter((signature) => {
    const declaration = semantics.declarations.signatureDeclaration(signature);
    return declaration !== undefined &&
      sourceNodesEqual(input.program.source.ast, declaration, declarationNode);
  });
  if (selected.length !== 1) {
    return undefined;
  }
  const signature = selected[0];
  return signature === undefined
    ? undefined
    : input.types.policy.resolveType(
        semantics.types.returnType(signature),
        sourceFile,
      );
}
