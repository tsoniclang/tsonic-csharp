import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpLambdaParameter, CsharpStatement, CsharpTypeNode } from "../../target-ast/syntax/index.js";
import type { CsharpPlanningContext } from "../context.js";
import { allocateSyntheticParameter, planParameterBindingPrelude, type DestructuringPlannerState } from "../bindings/index.js";
import { csharpTypeFromTargetTypeRefWithObjectShapeDeclarations } from "../types/target-type-object-shapes.js";
import { applyCsharpConversionSelection } from "./conversions.js";
import { planCsharpRuntimeParameterDefault } from "../declarations/callables/defaults.js";
import { consumeCsharpPlannedValue } from "../statements/statement-output.js";
import { planCsharpParameterStorageDeclaration } from "../bindings/typed-location-identities.js";
import { planCsharpParameterCapture } from "../bindings/capture-storage.js";
import { failCsharpPlannerInvariant } from "../diagnostics.js";
import { planCsharpTupleParameterEntry } from "../bindings/tuple-parameter-entry.js";
import { planCsharpLambdaBodyInputs } from "./lambda-body-inputs.js";

export function planLambdaParameterStorage(nodes: readonly (Node | undefined)[], parameters: readonly CsharpLambdaParameter[], sourceFile: SourceFile,
  input: CsharpPlanningContext, diagnostics: TargetDiagnostic[], state: DestructuringPlannerState):
  { readonly parameters: readonly CsharpLambdaParameter[]; readonly prelude: readonly CsharpStatement[] } | undefined {
  const owner = nodes[0] === undefined ? undefined : input.program.source.ast.parent(nodes[0]);
  const contract = owner === undefined ? undefined : input.program.records.callableDeclaration.get(owner)?.contract;
  return contract?.bodyInputs === undefined
    ? planLambdaParameterEntries(nodes, parameters, sourceFile, input, diagnostics, state)
    : planCsharpLambdaBodyInputs(contract, parameters, sourceFile, input, diagnostics, state,
      (node, parameter) => planLambdaParameterEntries([node], [parameter], sourceFile, input, diagnostics, state));
}

function planLambdaParameterEntries(nodes: readonly (Node | undefined)[], parameters: readonly CsharpLambdaParameter[], sourceFile: SourceFile,
  input: CsharpPlanningContext, diagnostics: TargetDiagnostic[], state: DestructuringPlannerState):
  { readonly parameters: readonly CsharpLambdaParameter[]; readonly prelude: readonly CsharpStatement[] } | undefined {
  const nativeParameters = [...parameters];
  const prelude: CsharpStatement[] = [];
  let nativeIndex = 0;
  for (const node of nodes) {
    if (node === undefined) failCsharpPlannerInvariant("An admitted lambda requires its dense checked parameter list.");
    const emission = input.program.records.callableParameter.get(node);
    if (emission === undefined) failCsharpPlannerInvariant("An admitted lambda requires its native parameter layout.", node);
    if (emission.incoming.kind === "tuple") {
      const incoming = parameters.slice(nativeIndex, nativeIndex + emission.incoming.parameters.length);
      nativeIndex += emission.incoming.parameters.length;
      const typed: { readonly name: string; readonly type: CsharpTypeNode }[] = [];
      for (const parameter of incoming) {
        if (parameter.type === undefined) failCsharpPlannerInvariant("An admitted tuple-rest lambda requires each native slot type.", node);
        typed.push({ name: parameter.name, type: parameter.type });
      }
      const entry = planCsharpTupleParameterEntry(node, emission, typed, sourceFile, input, diagnostics, state);
      prelude.push(...entry.prelude);
      continue;
    }
    const index = nativeIndex++;
    const parameter = parameters[index];
    const selected = input.program.records.lambdaParameterEntry.get(node);
    if (parameter === undefined || selected === undefined) failCsharpPlannerInvariant("An admitted lambda parameter requires its exact native entry plan.", node);
    if (selected.kind === "default") {
      const name = allocateSyntheticParameter(state);
      const value = planCsharpRuntimeParameterDefault(node, name, sourceFile, input, diagnostics, state);
      const incoming = selected.declareIncoming ? { ...parameter, type: value.parameterType } : parameter;
      nativeParameters[index] = value.passthrough ? incoming : { ...incoming, name };
      if (!value.passthrough) prelude.push(...consumeCsharpPlannedValue(value.value, initializer => [
        { kind: "LocalDeclarationStatement", name: parameter.name, type: value.valueType, initializer }]));
    } else if (selected.kind === "conversion") {
      const type = csharpTypeFromTargetTypeRefWithObjectShapeDeclarations(input, selected.target, diagnostics, node);
      if (type === undefined) failCsharpPlannerInvariant("An admitted lambda parameter requires its exact native storage type syntax.", node);
      const name = allocateSyntheticParameter(state);
      const initializer = applyCsharpConversionSelection(node, sourceFile, input, diagnostics, selected.source, selected.target,
        selected.conversion, { kind: "IdentifierName", name }, prelude, "stable");
      if (initializer === undefined) failCsharpPlannerInvariant("An admitted lambda parameter requires its selected native entry conversion.", node);
      nativeParameters[index] = { ...parameter, name };
      prelude.push({ kind: "LocalDeclarationStatement", name: parameter.name, type, initializer });
    }
    const binding = input.program.source.ast.name(node);
    if (binding !== undefined && (input.program.source.ast.is.IsObjectBindingPattern(binding) || input.program.source.ast.is.IsArrayBindingPattern(binding)))
      prelude.push(...planParameterBindingPrelude(binding, parameter.name, sourceFile, input, diagnostics, state));
    else {
      const identity = planCsharpParameterStorageDeclaration(node, input, state, diagnostics);
      if (identity !== undefined) prelude.push(identity);
      const capture = planCsharpParameterCapture(node, input, state);
      if (capture !== undefined) prelude.push(capture);
    }
  }
  return { parameters: nativeParameters, prelude };
}
