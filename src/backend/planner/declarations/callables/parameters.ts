import type { CsharpPlanningContext } from "../../context.js";
import { AsParameterDeclaration, sourceParameterIsProperty } from "@tsonic/target-api/source";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpExpression, CsharpParameter, CsharpStatement, CsharpTypeNode } from "../../../target-ast/syntax/index.js";
import type { CsharpDelegateSignatureShape, TargetTypeRef } from "../../../../target-model/types/model.js";
import type { CsharpSourceCallableParameterContract } from "../../../../target-model/records/source-callable-contract.js";
import {
  allocateSyntheticParameter, createDestructuringPlannerState, declareCsharpLocalBindingName,
  planParameterBindingPrelude, type DestructuringPlannerState,
} from "../../bindings/index.js";
import { planAttributesForSubject } from "../attributes.js";
import { csharpTypeFromTargetTypeRefWithObjectShapeDeclarations } from "../../types/target-type-object-shapes.js";
import { csharpTupleExpression } from "../../types/csharp-tuples.js";
import { failCsharpPlannerInvariant, unsupportedNodeDiagnostic } from "../../diagnostics.js";
import { planExpression } from "../../expressions/index.js";
import { applyCsharpConversionSelection, readCsharpConversionClassification } from "../../expressions/conversions.js";
import { diagnoseTypeScriptOnlyRuntimeShapeModifiers } from "../modifiers.js";
import { planCsharpRuntimeParameterDefault } from "./defaults.js";
import { consumeCsharpPlannedValue } from "../../statements/statement-output.js";
import { planCsharpParameterStorageDeclaration } from "../../bindings/typed-location-identities.js";
import type { CsharpEntryBinding } from "../../bindings/binding-patterns.js";
import { planCsharpParameterCapture } from "../../bindings/capture-storage.js";
import { targetTypeRefEquals } from "../../../../target-model/types/equality.js";
import { getCsharpLambdaSignature } from "../../../../target-model/types/carriers/delegates.js";

export interface PlannedParameterList {
  readonly parameters: readonly CsharpParameter[];
  readonly prelude: readonly CsharpStatement[];
  readonly entryBindings: readonly CsharpEntryBinding[];
}

export function planParameters(
  declaration: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
): readonly CsharpParameter[] {
  return planParametersWithPrelude(declaration, sourceFile, input, diagnostics).parameters;
}

export function planParametersWithPrelude(
  declaration: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState = createDestructuringPlannerState(),
  admittedSignature?: CsharpDelegateSignatureShape,
): PlannedParameterList {
  const contract = input.program.records.callableTarget.entry(declaration);
  if (contract === undefined) return failCsharpPlannerInvariant(
    "An emitted callable requires its exact sealed physical entry contract.", declaration);
  const body = input.scope.nativeCallableBody;
  const signature = body?.declaration === declaration ? getCsharpLambdaSignature(body.carrier) : admittedSignature;
  if (body?.declaration === declaration && signature === undefined) return failCsharpPlannerInvariant(
    "A native callable body requires its exact sealed physical signature.", declaration);
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
  const render = (carrier: TargetTypeRef, subject: Node): CsharpTypeNode =>
    csharpTypeFromTargetTypeRefWithObjectShapeDeclarations(input, carrier, diagnostics, subject) ??
      failCsharpPlannerInvariant("An admitted physical parameter requires its native type syntax.", subject);
  const incoming = (index: number): TargetTypeRef => {
    const type = signature === undefined ? contract.parameters[index]?.targetParameter.type : signature.parameters[index];
    return type ?? failCsharpPlannerInvariant("A physical entry slot requires its admitted native parameter carrier.", declaration);
  };
  const physicalParameter = (entry: CsharpSourceCallableParameterContract, index: number, name: string): CsharpParameter => {
    const mode = signature === undefined ? entry.targetParameter.passingMode : signature.parameterPassingModes[index];
    if (mode === undefined) return failCsharpPlannerInvariant("A physical entry slot requires its native passing mode.", entry.sourceParameter);
    return { name, type: render(incoming(index), entry.sourceParameter),
      attributes: planAttributesForSubject(entry.sourceParameter, sourceFile, input, diagnostics),
      ...(mode === "by-value" ? {} : { passing: mode === "byref-readwrite" ? "ref" as const
        : mode === "byref-readonly" ? "in" as const : "out" as const }),
      ...(entry.targetParameter.paramsArray === true ? { isParams: true } : {}) };
  };
  const groups = new Map<Node, number[]>();
  for (const [index, entry] of contract.parameters.entries()) {
    const group = groups.get(entry.sourceParameter);
    if (group === undefined) groups.set(entry.sourceParameter, [index]); else group.push(index);
  }
  const signatureOnly = input.program.records.nativeParticipation.get(declaration) === "signature";
  let hasDefaultParameter = false;
  for (const [node, indexes] of groups) {
    const parameter = AsParameterDeclaration(input.program.source.ast, node);
    const first = contract.parameters[indexes[0]!]!;
    if (parameter?.name === undefined) return failCsharpPlannerInvariant("A physical entry retains its original checked parameter binding.", node);
    diagnoseTypeScriptOnlyRuntimeShapeModifiers(input.program.source.ast, node, "parameter declaration", diagnostics,
      sourceParameterIsProperty(input.program.source.ast, node) ? ["public", "private", "protected", "readonly"] : []);
    const bindingPattern = input.program.source.ast.is.IsObjectBindingPattern(parameter.name) ||
      input.program.source.ast.is.IsArrayBindingPattern(parameter.name);
    if (!bindingPattern && !input.program.source.ast.is.IsIdentifier(parameter.name)) return failCsharpPlannerInvariant(
      "An admitted physical parameter requires its checked binding form.", node);
    const sourceName = bindingPattern ? allocateSyntheticParameter(state)
      : declareCsharpLocalBindingName(parameter.name, input, diagnostics, state, "Parameter name", "arg");
    const tuple = first.sourceProjection[0]?.kind === "tuple-element";
    if (tuple) {
      const elements: CsharpExpression[] = [];
      for (const index of indexes) {
        const entry = contract.parameters[index]!;
        const projection = entry.sourceProjection[0];
        if (entry.sourceProjection.length !== 1 || projection?.kind !== "tuple-element" || projection.index !== elements.length) {
          return failCsharpPlannerInvariant("A fixed tuple entry requires every admitted component in its original order.", node);
        }
        const name = entry.targetParameter.name;
        if (name === undefined) return failCsharpPlannerInvariant("A tuple entry component requires its selected native name.", node);
        state.usedNames.add(name);
        const native = physicalParameter(entry, index, name);
        const defaultValue = planParameterDefaultValue(undefined, entry.targetParameter.optional === true,
          sourceFile, input, diagnostics, native.type, state);
        parameters.push({ ...native, ...(defaultValue === undefined ? {} : { defaultValue }) });
        elements.push({ kind: "IdentifierName", name });
      }
      if (signatureOnly) continue;
      const valueType = input.program.records.requiredStorageType.get(node);
      if (valueType?.kind !== "tuple" || valueType.elements.length !== elements.length) return failCsharpPlannerInvariant(
        "A fixed tuple parameter requires its complete sealed native entry tuple.", node);
      const type = render(valueType, node);
      let initializer: CsharpExpression = csharpTupleExpression(elements, type);
      if (!indexes.every((index, component) => targetTypeRefEquals(incoming(index), valueType.elements[component]!))) {
        const nativeType = input.program.records.lambdaParameterType.get(node);
        if (nativeType?.kind !== "tuple" || nativeType.elements.length !== elements.length ||
          !indexes.every((index, component) => targetTypeRefEquals(incoming(index), nativeType.elements[component]!))) return failCsharpPlannerInvariant(
          "An adapted tuple entry requires its exact sealed incoming parameter tuple.", node);
        const selection = readCsharpConversionClassification(node, input, diagnostics, nativeType, valueType, "implicit");
        if (selection === undefined) continue;
        const converted = applyCsharpConversionSelection(node, sourceFile, input, diagnostics, nativeType, valueType,
          selection, csharpTupleExpression(elements, render(nativeType, node)));
        if (converted === undefined) continue;
        initializer = converted;
      }
      prelude.push({ kind: "LocalDeclarationStatement", name: sourceName, type, initializer });
      completeSourceStorage(node, parameter.name, sourceName, valueType);
      continue;
    }
    if (indexes.length !== 1) return failCsharpPlannerInvariant("An ordinary parameter requires one exact physical entry slot.", node);
    const index = indexes[0]!;
    const nativeType = incoming(index);
    if (signatureOnly) {
      const native = physicalParameter(first, index, sourceName);
      const defaultValue = planParameterDefaultValue(parameter.Initializer, first.targetParameter.optional === true,
        sourceFile, input, diagnostics, native.type, state);
      parameters.push({ ...native, ...(defaultValue === undefined ? {} : { defaultValue }) });
      continue;
    }
    if (input.program.records.runtimeDefault.get(node) !== undefined) {
      const incomingName = allocateSyntheticParameter(state);
      const selected = planCsharpRuntimeParameterDefault(node, incomingName, sourceFile, input, diagnostics, state, nativeType);
      if (selected === undefined) continue;
      parameters.push({ ...physicalParameter(first, index, selected.passthrough ? sourceName : incomingName),
        ...(selected.defaultValue === undefined ? {} : { defaultValue: selected.defaultValue }) });
      if (!selected.passthrough) prelude.push(...consumeCsharpPlannedValue(selected.value, initializer => [
        { kind: "LocalDeclarationStatement", name: sourceName, type: selected.valueType, initializer }]));
      if (bindingPattern) prelude.push(...planParameterBindingPrelude(parameter.name, sourceName, sourceFile, input, diagnostics, state, retainBinding));
      else completeIdentifierEntry(node, sourceName, selected.valueType);
      hasDefaultParameter ||= selected.defaultValue !== undefined;
      continue;
    }
    const native = physicalParameter(first, index, sourceName);
    const defaultValue = planParameterDefaultValue(parameter.Initializer, first.targetParameter.optional === true,
      sourceFile, input, diagnostics, native.type, state);
    if (defaultValue !== undefined) hasDefaultParameter = true;
    else if (hasDefaultParameter && first.targetParameter.paramsArray !== true) diagnostics.push(unsupportedNodeDiagnostic(
      node, "Required parameters cannot follow C# optional parameters."));
    const valueType = input.program.records.requiredStorageType.get(node);
    if (valueType === undefined) return failCsharpPlannerInvariant(
      "An emitted parameter requires its sealed source storage representation.", node);
    const sameStorage = targetTypeRefEquals(nativeType, valueType);
    const incomingName = sameStorage ? sourceName : allocateSyntheticParameter(state);
    parameters.push({ ...native, name: incomingName, ...(defaultValue === undefined ? {} : { defaultValue }) });
    if (!sameStorage) {
      const selection = readCsharpConversionClassification(node, input, diagnostics, nativeType, valueType, "implicit");
      if (selection === undefined) continue;
      const initializer = applyCsharpConversionSelection(node, sourceFile, input, diagnostics, nativeType, valueType, selection,
        { kind: "IdentifierName", name: incomingName });
      if (initializer === undefined) continue;
      prelude.push({ kind: "LocalDeclarationStatement", name: sourceName, type: render(valueType, node), initializer });
    }
    if (bindingPattern) prelude.push(...planParameterBindingPrelude(parameter.name, sourceName, sourceFile, input, diagnostics, state, retainBinding));
    else completeIdentifierEntry(node, sourceName, render(valueType, node));
  }
  if (signature !== undefined) {
    if (signature.parameters.length < contract.parameters.length || signature.parameterPassingModes.length !== signature.parameters.length) {
      return failCsharpPlannerInvariant("The selected callable entry requires its complete admitted native signature.", declaration);
    }
    for (let index = contract.parameters.length; index < signature.parameters.length; index += 1) {
      if (signature.parameterPassingModes[index] !== "by-value") return failCsharpPlannerInvariant(
        "An omitted callable input requires its admitted native by-value slot.", declaration);
      parameters.push({ name: allocateSyntheticParameter(state), type: render(signature.parameters[index]!, declaration) });
    }
  }
  return { parameters, prelude, entryBindings };

  function completeSourceStorage(node: Node, binding: Node, sourceName: string, nativeType: TargetTypeRef): void {
    const valueType = input.program.records.requiredStorageType.get(node);
    if (valueType === undefined || !targetTypeRefEquals(nativeType, valueType)) return failCsharpPlannerInvariant(
      "A fixed tuple entry requires its admitted source storage representation.", node);
    if (input.program.source.ast.is.IsIdentifier(binding)) completeIdentifierEntry(node, sourceName, render(valueType, node));
    else prelude.push(...planParameterBindingPrelude(binding, sourceName, sourceFile, input, diagnostics, state, retainBinding));
  }
}

function planParameterDefaultValue(
  initializer: Node | undefined,
  optional: boolean,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  expectedType: CsharpTypeNode,
  state: DestructuringPlannerState,
): CsharpExpression | undefined {
  if (initializer === undefined && optional && expectedType.kind !== "InvalidType") {
    return expectedType.kind === "NullableType" ? { kind: "LiteralExpression", value: null }
      : { kind: "DefaultExpression", type: expectedType, nullForgiving: true };
  }
  if (initializer === undefined) return undefined;
  const defaultValue = planExpression(initializer, sourceFile, input, diagnostics, state);
  if (defaultValue === undefined) return undefined;
  const expression = defaultValue.completion.kind === "value" ? defaultValue.completion.expression : undefined;
  if (defaultValue.prelude.length === 0 && (expression?.kind === "LiteralExpression" || expression?.kind === "CharacterLiteralExpression" ||
    expression?.kind === "IntegerLiteralExpression" || expression?.kind === "NumericLiteralExpression")) return expression;
  diagnostics.push(unsupportedNodeDiagnostic(initializer, "C# parameter defaults require compile-time literal values."));
  return undefined;
}
