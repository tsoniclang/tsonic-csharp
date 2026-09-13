import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpLambdaParameter, CsharpStatement } from "../../target-ast/roslyn/index.js";
import type { CsharpPlanningContext } from "../context.js";
import { allocateSyntheticParameter } from "../bindings/index.js";
import type { DestructuringPlannerState } from "../bindings/index.js";
import { csharpTypeFromTargetTypeRef } from "../types/target-types.js";
import { targetTypeRefEquals } from "../../../target-model/types/index.js";
import { unsupportedNodeDiagnostic } from "../diagnostics.js";
import { applyCsharpConversionSelection, readCsharpConversionClassification } from "./conversions.js";

export function planLambdaParameterStorage(
  nodes: readonly (Node | undefined)[],
  parameters: readonly CsharpLambdaParameter[],
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
): { readonly parameters: readonly CsharpLambdaParameter[]; readonly prelude: readonly CsharpStatement[] } | undefined {
  const nativeParameters = [...parameters];
  const prelude: CsharpStatement[] = [];
  for (const [index, node] of nodes.entries()) {
    if (node === undefined) continue;
    const nativeType = input.program.storage.lambdaParameterType(node);
    if (nativeType === undefined) continue;
    const valueType = input.program.storage.requiredType(node);
    const parameter = nativeParameters[index];
    if (valueType === undefined || parameter === undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(node, "C# lambda parameter storage requires its sealed native and source representations."));
      return undefined;
    }
    if (targetTypeRefEquals(nativeType, valueType)) continue;
    const type = csharpTypeFromTargetTypeRef(valueType);
    if (type === undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(node, "The sealed lambda parameter storage type has no C# syntax representation."));
      return undefined;
    }
    const selection = readCsharpConversionClassification(node, input, diagnostics, nativeType, valueType, "implicit");
    if (selection === undefined) return undefined;
    const name = allocateSyntheticParameter(state);
    const initializer = applyCsharpConversionSelection(node, sourceFile, input, diagnostics,
      nativeType, valueType, selection, { kind: "IdentifierName", name });
    if (initializer === undefined) return undefined;
    nativeParameters[index] = { ...parameter, name };
    prelude.push({ kind: "LocalDeclarationStatement", name: parameter.name, type, initializer });
  }
  return { parameters: nativeParameters, prelude };
}
