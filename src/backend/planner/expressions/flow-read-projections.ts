import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import {
  selectCsharpFlowReadConversion,
} from "../../../policy/conversions/index.js";
import type {
  TargetTypeRef,
} from "../../../policy/types/index.js";
import {
  type CsharpTargetNamedTypeRef,
  combineCsharpTargetUnionMembers,
  targetTypeRefEquals,
} from "../../../policy/types/index.js";
import type {
  CsharpPlanningContext,
} from "../context.js";
import {
  applyCsharpConversionSelection,
} from "./conversions.js";
import type {
  CsharpExpression,
} from "../../target-ast/roslyn/index.js";
import {
  unsupportedNodeDiagnostic,
} from "../diagnostics.js";

export function planFlowReadUseSiteProjection(
  node: Node,
  baseExpression: CsharpExpression,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  options: {
    readonly storageType?: TargetTypeRef;
    readonly selectedType?: TargetTypeRef;
  } = {},
): CsharpExpression | undefined {
  const storageType = options.storageType ??
    input.types.policy.resolveReadStorage(node, sourceFile);
  const selectedType = options.selectedType ??
    input.types.policy.resolveNode(node, sourceFile);
  if (storageType === undefined) {
    return baseExpression;
  }
  const sourceRefinement = input.program.source.semantics
    .selectValueTypeRefinement(node);
  if (sourceRefinement.kind === "not-project-reference") {
    if (
      selectedType === undefined ||
      targetTypeRefEquals(storageType, selectedType)
    ) {
      return baseExpression;
    }
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      "A target storage-read projection requires an exact project source declaration.",
    ));
    return undefined;
  }
  if (sourceRefinement.kind === "unresolved") {
    if (
      selectedType === undefined ||
      targetTypeRefEquals(storageType, selectedType)
    ) {
      return baseExpression;
    }
    const missing = sourceRefinement.missing === "declared-type"
      ? "declared type"
      : "selected type";
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      `A target storage-read projection requires the exact source ${missing}.`,
    ));
    return undefined;
  }
  if (sourceRefinement.refinement.kind === "exact") {
    return baseExpression;
  }
  if (sourceRefinement.refinement.kind === "ambiguous") {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      "The checked source value refinement is ambiguous, so C# cannot select one storage-read projection.",
    ));
    return undefined;
  }
  if (
    storageType.kind === "target-named" &&
    (storageType as CsharpTargetNamedTypeRef)
        .csharpFlowRefinementRepresentation === "identity"
  ) {
    return baseExpression;
  }
  const refinedMembers = sourceRefinement.refinement.kind === "members"
    ? sourceRefinement.refinement.types.map((member) =>
        input.types.policy.resolveType(member, sourceFile)
      )
    : undefined;
  const selectedValueType = input.types.policy.resolveSelectedValue(
    node,
    sourceRefinement.selectedType,
    sourceFile,
  );
  const refinedSelectedType = selectedValueType !== undefined &&
      !targetTypeRefEquals(storageType, selectedValueType)
    ? selectedValueType
    : refinedMembers === undefined
      ? input.types.policy.resolveType(sourceRefinement.selectedType, sourceFile)
      : refinedMembers.some((member) => member === undefined)
        ? undefined
        : combineCsharpTargetUnionMembers(
            refinedMembers as readonly TargetTypeRef[],
          );
  if (refinedSelectedType === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      "The exact checked source value refinement has no closed C# representation.",
    ));
    return undefined;
  }
  if (targetTypeRefEquals(storageType, refinedSelectedType)) {
    return baseExpression;
  }
  return applyCsharpConversionSelection(
    node,
    sourceFile,
    input,
    diagnostics,
    storageType,
    refinedSelectedType,
    selectCsharpFlowReadConversion(input.policy, storageType, refinedSelectedType),
    baseExpression,
  );
}
