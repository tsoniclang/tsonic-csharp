import type { CsharpPlanningContext } from "../../context.js";
import { AsParameterDeclaration } from "@tsonic/target-api/source";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpExpression, CsharpParameter, CsharpStatement, CsharpTypeNode } from "../../../target-ast/syntax/index.js";
import { allocateSyntheticParameter, createDestructuringPlannerState, declareCsharpLocalBindingName, planParameterBindingPrelude } from "../../bindings/index.js";
import { planAttributesForSubject } from "../attributes.js";
import type { DestructuringPlannerState } from "../../bindings/index.js";
import { csharpTypeFromTargetTypeRefWithObjectShapeDeclarations } from "../../types/target-type-object-shapes.js";
import { failCsharpPlannerInvariant } from "../../diagnostics.js";
import { planExpression } from "../../expressions/index.js";
import { planCsharpRuntimeParameterDefault } from "./defaults.js";
import { consumeCsharpPlannedValue } from "../../statements/statement-output.js";
import { planCsharpParameterStorageDeclaration } from "../../bindings/typed-location-identities.js";
import type { CsharpEntryBinding } from "../../bindings/binding-patterns.js";
import { planCsharpParameterCapture } from "../../bindings/capture-storage.js";
import type { CsharpParameterDefaultEmission } from "../../../../target-model/records/calls/parameter-emission.js";
import { planCsharpTupleParameterEntry } from "../../bindings/tuple-parameter-entry.js";

export interface PlannedParameterList {
  readonly parameters: readonly CsharpParameter[];
  readonly prelude: readonly CsharpStatement[];
  readonly entryBindings: readonly CsharpEntryBinding[];
}

export function planParameters(parameterNodes: readonly Node[], sourceFile: SourceFile, input: CsharpPlanningContext, diagnostics: TargetDiagnostic[]): readonly CsharpParameter[] {
  return planParametersWithPrelude(parameterNodes, sourceFile, input, diagnostics).parameters;
}

export function planParametersWithPrelude(parameterNodes: readonly Node[], sourceFile: SourceFile, input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[], state: DestructuringPlannerState = createDestructuringPlannerState()): PlannedParameterList {
  const parameters: CsharpParameter[] = [];
  const prelude: CsharpStatement[] = [];
  const entryBindings: CsharpEntryBinding[] = [];
  const retainBinding = (binding: CsharpEntryBinding): void => { entryBindings.push(binding); };
  const completeIdentifierEntry = (node: Node, name: string, type: CsharpTypeNode): void => {
    const identity = planCsharpParameterStorageDeclaration(node, input, state, diagnostics);
    if (identity !== undefined) { prelude.push(identity); retainBinding(identity); }
    const capture = planCsharpParameterCapture(node, input, state);
    if (capture !== undefined) prelude.push(capture);
    if (capture === undefined && input.program.records.nativeBacking.get(node) === undefined) retainBinding({ name, type });
  };
  for (const node of parameterNodes) {
    const parameter = AsParameterDeclaration(input.program.source.ast, node);
    const emission = input.program.records.callableParameter.get(node);
    if (parameter?.name === undefined || emission?.kind !== "parameter") failCsharpPlannerInvariant("An admitted callable parameter requires its checked binding and sealed emission record.", node);
    const type = csharpTypeFromTargetTypeRefWithObjectShapeDeclarations(input, emission.carrier, diagnostics, node);
    if (type === undefined) failCsharpPlannerInvariant("An admitted callable parameter requires its native storage type.", node);
    const runtime = input.program.records.runtimeDefault.get(node);
    if (emission.incoming.kind === "tuple") {
      const incoming = emission.incoming.parameters.map(parameter => {
        const type = csharpTypeFromTargetTypeRefWithObjectShapeDeclarations(input, parameter.type, diagnostics, node);
        if (type === undefined) failCsharpPlannerInvariant("An admitted tuple-rest slot requires its native parameter type.", node);
        return { name: allocateSyntheticParameter(state), type,
          attributes: planAttributesForSubject(node, sourceFile, input, diagnostics),
          ...(parameter.optional === true ? { defaultValue: { kind: "DefaultExpression" as const, type, nullForgiving: true } } : {}) };
      });
      parameters.push(...incoming);
      const entry = planCsharpTupleParameterEntry(node, emission, incoming, sourceFile, input, diagnostics, state);
      prelude.push(...entry.prelude);
      entryBindings.push(...entry.entryBindings);
      continue;
    }
    if (emission.binding === "identifier") {
      const sourceName = declareCsharpLocalBindingName(parameter.name, input, state);
      if (runtime !== undefined) {
        const incomingName = allocateSyntheticParameter(state);
        const selected = planCsharpRuntimeParameterDefault(node, incomingName, sourceFile, input, diagnostics, state);
        parameters.push({ name: selected.passthrough ? sourceName : incomingName, type: selected.parameterType,
          attributes: planAttributesForSubject(node, sourceFile, input, diagnostics),
          ...(selected.defaultValue === undefined ? {} : { defaultValue: selected.defaultValue }) });
        if (!selected.passthrough) prelude.push(...consumeCsharpPlannedValue(selected.value, initializer => [
          { kind: "LocalDeclarationStatement", name: sourceName, type: selected.valueType, initializer }]));
        completeIdentifierEntry(node, sourceName, selected.valueType);
        continue;
      }
      const defaultValue = planParameterDefaultValue(emission.default, type, sourceFile, input, diagnostics, state);
      parameters.push({ name: sourceName, type, attributes: planAttributesForSubject(node, sourceFile, input, diagnostics),
        ...(emission.incoming.rest ? { isParams: true } : {}), ...(defaultValue === undefined ? {} : { defaultValue }) });
      completeIdentifierEntry(node, sourceName, type);
      continue;
    }
    const incomingName = allocateSyntheticParameter(state);
    if (runtime !== undefined) {
      const valueName = allocateSyntheticParameter(state);
      const selected = planCsharpRuntimeParameterDefault(node, incomingName, sourceFile, input, diagnostics, state);
      parameters.push({ name: incomingName, type: selected.parameterType, attributes: planAttributesForSubject(node, sourceFile, input, diagnostics),
        ...(selected.defaultValue === undefined ? {} : { defaultValue: selected.defaultValue }) });
      if (!selected.passthrough) prelude.push(...consumeCsharpPlannedValue(selected.value, initializer => [
        { kind: "LocalDeclarationStatement", name: valueName, type: selected.valueType, initializer }]));
      prelude.push(...planParameterBindingPrelude(parameter.name, selected.passthrough ? incomingName : valueName, sourceFile, input, diagnostics, state, retainBinding));
      continue;
    }
    parameters.push({ name: incomingName, type, attributes: planAttributesForSubject(node, sourceFile, input, diagnostics), ...(emission.incoming.rest ? { isParams: true } : {}) });
    prelude.push(...planParameterBindingPrelude(parameter.name, incomingName, sourceFile, input, diagnostics, state, retainBinding));
  }
  return { parameters, prelude, entryBindings };
}

function planParameterDefaultValue(selected: CsharpParameterDefaultEmission, type: CsharpTypeNode, sourceFile: SourceFile,
  input: CsharpPlanningContext, diagnostics: TargetDiagnostic[], state: DestructuringPlannerState): CsharpExpression | undefined {
  switch (selected.kind) {
    case "none": return undefined;
    case "null": return { kind: "LiteralExpression", value: null };
    case "default": return { kind: "DefaultExpression", type, nullForgiving: true };
    case "literal": {
      const value = planExpression(selected.expression, sourceFile, input, diagnostics, state);
      if (value === undefined || value.completion.kind !== "value" || value.prelude.length !== 0)
        failCsharpPlannerInvariant("An admitted constant parameter default requires its exact native literal expression.", selected.expression);
      return value.completion.expression;
    }
  }
}
