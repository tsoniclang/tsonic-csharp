import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type {
  TargetDiagnostic,
} from "@tsonic/target-api";
import {
  selectCsharpFlowReadConversion,
} from "../../policy/conversions/index.js";
import type {
  TargetTypeRef,
} from "../../policy/types/index.js";
import {
  targetTypeRefEquals,
} from "../../policy/types/index.js";
import type {
  CsharpTranslationContext,
} from "../../translate/context/index.js";
import {
  applyCsharpConversionSelection,
} from "../../translate/expressions/conversions.js";
import type {
  CsharpExpression,
} from "../roslyn/syntax.js";
import {
  unsupportedNodeDiagnostic,
} from "./diagnostics.js";

export function planFlowReadUseSiteProjection(
  node: Node,
  baseExpression: CsharpExpression,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
  selectedType: TargetTypeRef | undefined = input.types.resolveNode(node, sourceFile),
): CsharpExpression | undefined {
  const storageType = input.types.resolveStorage(node, sourceFile);
  if (
    storageType === undefined ||
    selectedType === undefined ||
    targetTypeRefEquals(storageType, selectedType)
  ) {
    return baseExpression;
  }
  const sourceRefinement = input.source.semantics
    .selectValueTypeRefinement(node);
  if (sourceRefinement.kind === "not-project-reference") {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      "A target storage-read projection requires an exact project source declaration.",
    ));
    return undefined;
  }
  if (sourceRefinement.kind === "unresolved") {
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
  return applyCsharpConversionSelection(
    node,
    sourceFile,
    input,
    diagnostics,
    storageType,
    selectedType,
    selectCsharpFlowReadConversion(input, storageType, selectedType),
    baseExpression,
  );
}
