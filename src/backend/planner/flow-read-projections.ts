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
