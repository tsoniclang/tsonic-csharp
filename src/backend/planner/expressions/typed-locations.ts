import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import type { CsharpTypedLocationStorage } from "../../../target-model/records/typed-location-storage.js";
import type { CsharpArgument, CsharpExpression, CsharpLambdaParameter, CsharpTypeNode } from "../../target-ast/syntax/index.js";
import type { CsharpPlanningContext } from "../context.js";
import type { ExpressionPlanner } from "./expression-planner-types.js";
import type { CsharpPlannedAddress, CsharpPlannedValue } from "./planned-values.js";
import { allocateSyntheticParameter, createDestructuringPlannerState, getCsharpTypedLocationIdentityName, type DestructuringPlannerState } from "../bindings/index.js";
import { failCsharpPlannerInvariant } from "../diagnostics.js";
import { csharpTypeFromTargetTypeRef } from "../types/target-types.js";
import { planCsharpNativeMemoryCall } from "./native-memory.js";
import { planCsharpIndexedLocation } from "./indexed-locations.js";
import { csharpPlannedValue } from "./planned-values.js";
import { buildCsharpPlannedValue, projectCsharpPlannedValue, projectCsharpPlannedMember, planCsharpExpressionCompletion } from "./planned-value-composition.js";
import { readCsharpNativeExpressionCarrier } from "./native-uses.js";
import { captureCsharpPlannedLocation } from "./planned-locations.js";
import { translateCsharpPropertyAccess } from "./target-members/selected-property.js";

export function planCsharpTypedLocationOperation(node: Node, sourceFile: SourceFile, input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[], planExpression: ExpressionPlanner, state?: DestructuringPlannerState): CsharpPlannedValue | undefined {
  const selected = input.program.records.typedLocationEmission.get(node)
    ?? failCsharpPlannerInvariant("An admitted typed-location operation requires its sealed native emission contract.", node);
  const operation = selected.selection;
  const locationType = nativeType(operation.locationType, input, node);
  switch (operation.kind) {
    case "location-hash": {
      const pointer = planExpression(operation.locationExpression, sourceFile, input, diagnostics);
      return pointer === undefined ? undefined : projectCsharpPlannedValue(node, sourceFile, input, diagnostics, pointer,
        value => invokeMember(locationType, "Hash", [value]));
    }
    case "location-bind": case "location-view": case "location-project": {
      const arguments_ = operation.arguments.map(argument => planExpression(argument.expression, sourceFile, input, diagnostics));
      const types = operation.typeArguments.map(carrier => nativeType(carrier, input, node));
      return buildCsharpPlannedValue(node, sourceFile, input, diagnostics, arguments_, values => invokeMember(locationType, operation.method, values, types));
    }
    case "location-address": {
      const emission = requiredStorage(operation.storage, input);
      if (emission.address.kind === "managed") return planCsharpTypedLocationStorage(operation.storage, sourceFile, input, diagnostics,
        planExpression, state ?? createDestructuringPlannerState(sourceFile, input.program.source.ast));
      const value = planExpression(operation.storage.expression, sourceFile, { ...input, storageExpression: operation.storage.expression }, diagnostics);
      if (value === undefined || value.completion.kind === "never") return value;
      const address = requiredAddress(value, operation.storage.expression);
      const selectedAddress = emission.address;
      return projectCsharpPlannedValue(node, sourceFile, input, diagnostics, value, () => {
        if (selectedAddress.kind === "native-array") {
          if (address.kind !== "element" || address.arguments.length !== 1)
            failCsharpPlannerInvariant("An admitted native array location requires its exact receiver and index operands.", node);
          return invokeMember(address.receiver.expression, "LocationAt", address.arguments);
        }
        if (address.kind !== "member") failCsharpPlannerInvariant("An admitted native backing location requires its exact receiver operand.", node);
        return selectedAddress.kind === "native-field" ? member(address.receiver.expression, selectedAddress.name) : address.receiver.expression;
      });
    }
    case "location-allocate": {
      const initial = planExpression(operation.initialExpression, sourceFile, input, diagnostics);
      const backing = input.program.records.nativeBacking.get(node);
      return initial === undefined ? undefined : projectCsharpPlannedValue(node, sourceFile, input, diagnostics, initial,
        value => backing === undefined ? invokeMember(locationType, "Allocate", [value])
          : planCsharpNativeMemoryCall(input.scope.typeParameterNames, "Allocate", value, backing, input.program.records));
    }
    case "location-load": {
      const location = planExpression(operation.location.expression, sourceFile, input, diagnostics);
      return location === undefined ? undefined : projectCsharpPlannedValue(node, sourceFile, input, diagnostics, location,
        value => operation.location.kind === "runtime-location" ? invokeMember(value, "Load", []) : value);
    }
    case "location-store": {
      const location = planExpression(operation.location.expression, sourceFile, operation.location.kind === "runtime-location" ? input
        : { ...input, storageExpression: operation.location.expression }, diagnostics);
      const value = planExpression(operation.valueExpression, sourceFile, input, diagnostics);
      if (location === undefined || value === undefined) return undefined;
      if (operation.location.kind === "native-ref-return" && (value.prelude.length !== 0 || value.completion.kind !== "value")) {
        const address = selected.storeAddress
          ?? failCsharpPlannerInvariant("An admitted ref-return store requires its sealed writable managed address.", node);
        const captured = captureCsharpPlannedLocation(node, sourceFile, input, diagnostics, location, address, selected.suspends);
        if (captured === undefined || captured.completion.kind !== "value") return captured;
        const prelude = [...captured.prelude, ...value.prelude];
        if (value.completion.kind === "never") return { prelude, completion: value.completion };
        if (value.completion.kind !== "value") failCsharpPlannerInvariant("An admitted native store requires its exact value completion.", node);
        return planCsharpExpressionCompletion(node, sourceFile, input, diagnostics,
          assignment(captured.completion.expression, value.completion.expression), readCsharpNativeExpressionCarrier(input, node), prelude);
      }
      return buildCsharpPlannedValue(node, sourceFile, input, diagnostics, [location, value], values => operation.location.kind === "runtime-location"
        ? invokeMember(values[0]!, "Store", [values[1]!]) : assignment(values[0]!, values[1]!));
    }
    case "location-equal": return buildCsharpPlannedValue(node, sourceFile, input, diagnostics, [
      planExpression(operation.leftExpression, sourceFile, input, diagnostics), planExpression(operation.rightExpression, sourceFile, input, diagnostics),
    ], values => invokeMember(locationType, "Same", values));
  }
}

export function planCsharpProjectedFieldWrite(node: Node, planned: CsharpPlannedValue, sourceFile: SourceFile,
  input: CsharpPlanningContext, diagnostics: TargetDiagnostic[], planExpression: ExpressionPlanner, state?: DestructuringPlannerState): CsharpPlannedValue | undefined {
  const selection = input.program.records.sourceMember.get(node)?.projectedWrite;
  if (selection === undefined) return planned;
  if (selection.kind === "rejected") failCsharpPlannerInvariant("An admitted projected field write cannot have a rejected source location.", node);
  if (state === undefined) failCsharpPlannerInvariant("An admitted bound value-field write requires its exact owner identity scope.", node);
  const location = planCsharpTypedLocationStorage(selection.storage, sourceFile, input, diagnostics, planExpression, state);
  return location === undefined ? undefined : projectCsharpPlannedMember(node, sourceFile, input, diagnostics, location, "Value");
}

function planCsharpTypedLocationStorage(storage: CsharpTypedLocationStorage, sourceFile: SourceFile, input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[], planExpression: ExpressionPlanner, state: DestructuringPlannerState): CsharpPlannedValue | undefined {
  const selected = requiredStorage(storage, input);
  const type = nativeType(selected.carrier, input, storage.expression);
  if (storage.kind === "value-property-storage") return planValuePropertyLocation(storage, sourceFile, input, diagnostics, planExpression, state);
  if (storage.kind === "reference-indexed-storage") return buildCsharpPlannedValue(storage.expression, sourceFile, input, diagnostics, [
    planExpression(storage.receiver, sourceFile, input, diagnostics), planExpression(storage.index, sourceFile, input, diagnostics),
  ], values => planCsharpIndexedLocation(storage, values[0]!, values[1]!), selected.carrier);
  const planned = planExpression(storage.expression, sourceFile, { ...input, storageExpression: storage.expression }, diagnostics);
  if (planned === undefined || planned.completion.kind === "never") return planned;
  return projectCsharpPlannedValue(storage.expression, sourceFile, input, diagnostics, planned, value => {
    switch (storage.kind) {
      case "direct-storage": return planDirectLocation(storage, type, planned, value, input, state);
      case "reference-property-storage": return planReferencePropertyLocation(requiredMember(planned, storage.expression), type,
        storage.memberIdentity, state, renderBound(storage, input));
      case "reference-element-storage": {
        const address = requiredAddress(planned, storage.expression);
        if (address.kind !== "element" || address.arguments.length !== 1)
          failCsharpPlannerInvariant("An admitted managed array location requires its exact receiver and single index.", storage.expression);
        return invokeMember(type, "CreateArrayElement", [address.receiver.expression, address.arguments[0]!]);
      }
    }
  }, selected.carrier);
}

function planReferencePropertyLocation(address: Extract<CsharpPlannedAddress, { readonly kind: "member" }>, location: CsharpTypeNode,
  identity: string, state: DestructuringPlannerState, bound?: { readonly name: string; readonly type: CsharpTypeNode }): CsharpExpression {
  const receiverName = allocateSyntheticParameter(state);
  const valueName = allocateSyntheticParameter(state);
  const receiver = identifier(receiverName);
  const access = member(receiver, address.name);
  return bound === undefined ? invokeMember(location, "CreateMember", [address.receiver.expression, literal(identity),
    lambda([receiverName], access), lambda([receiverName, valueName], assignment(access, identifier(valueName)))])
    : invokeMember(bound.type, "FromReference", [address.receiver.expression, literal(identity), lambda([receiverName], member(receiver, bound.name)),
      lambda([receiverName, valueName], assignment(access, identifier(valueName)))]);
}

function planValuePropertyLocation(storage: Extract<CsharpTypedLocationStorage, { readonly kind: "value-property-storage" }>,
  sourceFile: SourceFile, input: CsharpPlanningContext, diagnostics: TargetDiagnostic[], planExpression: ExpressionPlanner,
  state: DestructuringPlannerState): CsharpPlannedValue | undefined {
  const owner = planCsharpTypedLocationStorage(storage.receiverStorage, sourceFile, input, diagnostics, planExpression, state);
  if (owner === undefined) return undefined;
  const receiverName = allocateSyntheticParameter(state);
  const valueName = allocateSyntheticParameter(state);
  const receiver = identifier(receiverName);
  const accessPlan = translateCsharpPropertyAccess(storage.expression, sourceFile, { ...input, storageExpression: storage.expression }, diagnostics,
    expression => expression === storage.receiverStorage.expression ? { ...csharpPlannedValue(storage.receiverStorage.valueType, receiver), address: { kind: "root" } } : undefined);
  if (accessPlan === undefined || accessPlan.completion.kind !== "value" || accessPlan.prelude.length !== 0)
    failCsharpPlannerInvariant("An admitted value-field accessor requires its exact sealed native owner and member operands.", storage.expression);
  const address = requiredMember(accessPlan, storage.expression);
  const access = member(address.receiver.expression, address.name);
  const bound = renderBound(storage, input);
  const type = nativeType(storage.valueType, input, storage.expression);
  return projectCsharpPlannedValue(storage.expression, sourceFile, input, diagnostics, owner, value => bound === undefined
    ? invokeMember(value, "ProjectMember", [literal(storage.memberIdentity), lambda([receiverName], access),
      updatingLambda(receiverName, valueName, assignment(access, identifier(valueName)))], [type])
    : invokeMember(bound.type, "FromValueLocation", [value, literal(storage.memberIdentity), lambda([receiverName], member(receiver, bound.name)),
      updatingLambda(receiverName, valueName, assignment(access, identifier(valueName)))]), requiredStorage(storage, input).carrier);
}

function planDirectLocation(storage: Extract<CsharpTypedLocationStorage, { readonly kind: "direct-storage" }>, type: CsharpTypeNode,
  planned: CsharpPlannedValue, expression: CsharpExpression, input: CsharpPlanningContext, state: DestructuringPlannerState): CsharpExpression {
  const valueName = allocateSyntheticParameter(state);
  switch (storage.identity.kind) {
    case "local-storage": {
      const captured = input.program.records.capturedBinding.get(storage.identity.declaration);
      if (captured !== undefined) return planReferencePropertyLocation(requiredMember(planned, storage.expression), type, captured.fieldName, state);
      const identity = getCsharpTypedLocationIdentityName(storage.identity.declaration, state)
        ?? failCsharpPlannerInvariant("An admitted local location requires its canonical native storage identity.", storage.expression);
      return invokeMember(type, "CreateLocal", [identifier(identity), lambda([], expression), lambda([valueName], assignment(expression, identifier(valueName)))]);
    }
    case "static-storage": return invokeMember(type, "CreateStatic", [literal(storage.identity.identity), lambda([], expression),
      lambda([valueName], assignment(expression, identifier(valueName)))]);
    case "instance-member-storage": return planReferencePropertyLocation(requiredMember(planned, storage.expression), type, storage.identity.memberIdentity, state);
  }
}

function requiredStorage(storage: CsharpTypedLocationStorage, input: CsharpPlanningContext) {
  return input.program.records.typedStorageEmission.get(storage)
    ?? failCsharpPlannerInvariant("An admitted typed location requires its exact native storage emission.", storage.expression);
}

function renderBound(storage: CsharpTypedLocationStorage, input: CsharpPlanningContext) {
  const bound = requiredStorage(storage, input).bound;
  return bound === undefined ? undefined : { name: bound.name, type: nativeType(bound.carrier, input, storage.expression) };
}

function requiredAddress(planned: CsharpPlannedValue, node: Node): CsharpPlannedAddress {
  let address = planned.address;
  while (address?.kind === "parenthesized") address = address.operand.address;
  return address ?? failCsharpPlannerInvariant("An admitted native location requires its exact rendered address operands.", node);
}

function requiredMember(planned: CsharpPlannedValue, node: Node): Extract<CsharpPlannedAddress, { readonly kind: "member" }> {
  const address = requiredAddress(planned, node);
  return address.kind === "member" ? address : failCsharpPlannerInvariant("An admitted native member location requires its explicit receiver and member operands.", node);
}

function nativeType(carrier: TargetTypeRef, input: CsharpPlanningContext, node: Node): CsharpTypeNode {
  return csharpTypeFromTargetTypeRef(carrier, input.scope.typeParameterNames)
    ?? failCsharpPlannerInvariant("An admitted typed location requires its exact rendered native carrier.", node);
}

function invokeMember(receiver: CsharpExpression, name: string, args: readonly CsharpExpression[], types?: readonly CsharpTypeNode[]): CsharpExpression {
  return { kind: "InvocationExpression", callee: { kind: "SimpleMemberAccessExpression", receiver, name,
    ...(types === undefined ? {} : { typeArguments: types }) }, arguments: args.map((expression): CsharpArgument => ({ kind: "Argument", expression })) };
}

function lambda(names: readonly string[], body: CsharpExpression): CsharpExpression {
  return { kind: "LambdaExpression", parameters: names.map(lambdaParameter), body };
}

function updatingLambda(owner: string, value: string, update: CsharpExpression): CsharpExpression {
  return { kind: "LambdaExpression", parameters: [lambdaParameter(owner), lambdaParameter(value)], body: { kind: "Block", statements: [
    { kind: "ExpressionStatement", expression: update }, { kind: "ReturnStatement", expression: identifier(owner) },
  ] } };
}

function lambdaParameter(name: string): CsharpLambdaParameter { return { kind: "Parameter", name }; }
function identifier(name: string): CsharpExpression { return { kind: "IdentifierName", name }; }
function literal(value: string): CsharpExpression { return { kind: "LiteralExpression", value }; }
function member(receiver: CsharpExpression, name: string): CsharpExpression { return { kind: "SimpleMemberAccessExpression", receiver, name }; }
function assignment(left: CsharpExpression, right: CsharpExpression): CsharpExpression {
  return { kind: "AssignmentExpression", left, operatorToken: { kind: "EqualsToken" }, right };
}
