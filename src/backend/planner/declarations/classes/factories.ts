import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpClassFactory } from "../../../../target-model/records/class-factories.js";
import type { CsharpCaptureFrame } from "../../../../target-model/records/capture-storage.js";
import type {
  CsharpClassDeclaration, CsharpConstructorDeclaration, CsharpExpression, CsharpInterfaceDeclaration, CsharpParameter,
  CsharpStatement, CsharpTypeMember, CsharpTypeNode,
} from "../../../target-ast/syntax/index.js";
import type { CsharpPlanningContext } from "../../context.js";
import type { DestructuringPlannerState } from "../../bindings/index.js";
import { csharpCaptureFrameExpression } from "../../bindings/capture-storage.js";
import { getCsharpLocalBindingName } from "../../bindings/binding-state.js";
import { csharpTypeFromObjectShapeFact } from "../../objects/planning.js";
import { csharpTypeFromTargetTypeRef } from "../../types/render.js";
import { planExpression } from "../../expressions/index.js";
import { planClassMembers } from "./members.js";
import { createCsharpTypeParameterPlanningContext } from "../../names/type-parameters.js";
import { planOuterTypeParameters, planTypeParameters } from "../../types/type-parameters.js";
import { failCsharpPlannerInvariant } from "../../diagnostics.js";
import { planClassInitializationRegion } from "./initializers.js";
import type { TargetTypeRef } from "../../../../target-model/types/model.js";
import { csharpPlannedValue, type CsharpPlannedValue } from "../../expressions/planned-values.js";
import { buildCsharpPlannedValue } from "../../expressions/planned-value-composition.js";
import { planCsharpNativeMemberHiding } from "../modifiers.js";

interface CaptureSlot {
  readonly kind: "frame" | "binding" | "expression";
  readonly name: string;
  readonly type: CsharpTypeNode;
  readonly carrier: TargetTypeRef;
  readonly frame?: CsharpCaptureFrame;
  readonly reference?: Node;
  readonly declaration?: Node;
}

function captureSlots(factory: CsharpClassFactory, input: CsharpPlanningContext, diagnostics: TargetDiagnostic[]): readonly CaptureSlot[] {
  const slots = input.program.records.classCaptures.get(factory.declaration);
  if (slots === undefined) failCsharpPlannerInvariant("An admitted class factory requires its sealed capture layout.", factory.declaration);
  return slots.map(slot => {
    const type = slot.kind === "frame" ? csharpTypeFromObjectShapeFact(input, slot.frame.shape, diagnostics, factory.declaration)
      : csharpTypeFromTargetTypeRef(slot.carrier, input.scope.typeParameterNames);
    if (type === undefined) failCsharpPlannerInvariant("An admitted class capture lost its renderable physical storage.", factory.declaration);
    return { ...slot, type };
  });
}

function member(receiver: CsharpExpression, name: string): CsharpExpression {
  return { kind: "SimpleMemberAccessExpression", receiver, name };
}

function assignment(receiver: CsharpExpression, name: string, expression: CsharpExpression): CsharpStatement {
  return { kind: "ExpressionStatement", expression: { kind: "AssignmentExpression", left: member(receiver, name),
    operatorToken: { kind: "EqualsToken" }, right: expression } };
}

export function classFactoryContext(
  factory: CsharpClassFactory, receiver: CsharpExpression,
  input: CsharpPlanningContext, diagnostics: TargetDiagnostic[],
  receiverKind: "instance" | "factory",
): CsharpPlanningContext {
  const slots = captureSlots(factory, input, diagnostics);
  const bindings = new Map(input.scope.capturedBindings);
  const frames = new Map(input.scope.captureFrames);
  for (const slot of slots) if (slot.frame !== undefined) frames.set(slot.frame.scope, member(receiver, slot.name));
  for (const capture of factory.captures) {
    const shared = input.program.records.capturedBinding.get(capture.declaration);
    const target = shared === undefined ? member(receiver, capture.fieldName)
      : member(frames.get(shared.frame.scope)!, shared.fieldName);
    bindings.set(capture.declaration, target);
  }
  return { ...input, scope: { ...input.scope, capturedBindings: bindings, captureFrames: frames,
    sourceThisBinding: { name: "this", targetType: receiverKind === "instance" ? factory.contract.instance : factory.factoryType },
    classValues: new Map([...input.scope.classValues ?? [], [factory.declaration, receiver]]) } };
}

export function planClassFactoryExpression(
  factory: CsharpClassFactory, sourceFile: SourceFile, input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[], state?: DestructuringPlannerState,
): CsharpPlannedValue | undefined {
  const slots = captureSlots(factory, input, diagnostics);
  const arguments_ = slots.map(slot => {
    if (slot.frame !== undefined) {
      const value = csharpCaptureFrameExpression(slot.frame.scope, input, state);
      return value === undefined ? undefined : csharpPlannedValue(slot.carrier, value);
    }
    if (slot.kind === "binding") {
      const name = getCsharpLocalBindingName(slot.reference!, input, state);
      if (name === undefined) failCsharpPlannerInvariant("An admitted class environment requires its native captured binding name.", slot.declaration);
      return csharpPlannedValue(slot.carrier, { kind: "IdentifierName", name });
    }
    return planExpression(slot.reference!, sourceFile, input, diagnostics, state);
  });
  const type = csharpTypeFromTargetTypeRef(factory.factoryType, input.scope.typeParameterNames);
  if (type === undefined) failCsharpPlannerInvariant("An admitted class factory lost its renderable native environment.", factory.declaration);
  if (arguments_.some(argument => argument === undefined)) failCsharpPlannerInvariant("An admitted class environment requires its complete native argument values.", factory.declaration);
  return buildCsharpPlannedValue(factory.declaration, sourceFile, input, diagnostics, arguments_, values => ({
    kind: "ObjectCreationExpression", type, arguments: values.map(expression => ({ kind: "Argument", expression })),
  }), factory.factoryType);
}

export function completeLocalClassConstructor(
  constructor: CsharpConstructorDeclaration, factory: CsharpClassFactory,
  input: CsharpPlanningContext, initializers: readonly CsharpStatement[], delegating: boolean,
): CsharpConstructorDeclaration {
  const environment: CsharpExpression = { kind: "IdentifierName", name: factory.environmentName };
  const type = csharpTypeFromTargetTypeRef(factory.factoryType, input.scope.typeParameterNames)!;
  if (delegating) {
    const initializer = constructor.initializer;
    if (initializer === undefined) failCsharpPlannerInvariant("A delegating class entry requires its rendered native initializer.", factory.declaration);
    return { ...constructor,
    parameters: [{ name: factory.environmentName, type }, ...constructor.parameters],
    initializer: { kind: "this", arguments: [{ kind: "Argument", expression: environment }, ...initializer.arguments] } };
  }
  return { ...constructor, parameters: [{ name: factory.environmentName, type }, ...constructor.parameters],
    body: { kind: "Block", statements: [
      ...(factory.retainsEnvironment ? [assignment({ kind: "IdentifierName", name: "this" }, factory.environmentName, environment)] : []),
      ...initializers, ...constructor.body.statements,
    ] } };
}

export function planClassFactoryDeclaration(
  factory: CsharpClassFactory, parameters: readonly CsharpParameter[],
  outerInput: CsharpPlanningContext, diagnostics: TargetDiagnostic[],
): CsharpClassDeclaration {
  const input = createCsharpTypeParameterPlanningContext(factory.declaration, outerInput);
  const slots = captureSlots(factory, input, diagnostics);
  const context = classFactoryContext(factory, { kind: "IdentifierName", name: "this" }, input, diagnostics, "factory");
  const selected = input.program.records.nativeClass.get(factory.declaration);
  if (selected === undefined) failCsharpPlannerInvariant("An admitted class factory requires its native member inventory.", factory.declaration);
  const staticNodes = selected.staticMembers;
  const staticRegion = planClassInitializationRegion(factory.declaration, factory.sourceFile, factory.factoryName, true, context, diagnostics, true);
  const staticMembers = planClassMembers(staticNodes, factory.factoryName, factory.sourceFile, context, diagnostics, [staticRegion]);
  const members: CsharpTypeMember[] = [...staticMembers.members];
  members.push(...slots.map(slot => ({ kind: "FieldDeclaration" as const, name: slot.name,
    type: slot.type, modifiers: ["public" as const, "readonly" as const, ...planCsharpNativeMemberHiding(input.program.records.nativeMemberHiding,
      { kind: "value", container: factory.declaration, member: slot.name, role: "member" })] })));
  members.push({ kind: "ConstructorDeclaration", name: factory.factoryName, modifiers: ["public"],
    parameters: slots.map(slot => ({ name: slot.name, type: slot.type })),
    body: { kind: "Block", statements: [
      ...slots.map(slot => assignment({ kind: "IdentifierName", name: "this" }, slot.name, { kind: "IdentifierName", name: slot.name })),
      ...staticRegion.statements,
    ] } });
  const instance = csharpTypeFromTargetTypeRef(factory.contract.instance, input.scope.typeParameterNames)!;
  if (factory.requiresInstanceTest) {
    members.push({ kind: "MethodDeclaration", name: factory.contract.instanceTestMethodName, modifiers: ["public", "static"],
      returnType: { kind: "PredefinedType", name: "bool" }, parameters: [
        { name: "value", type: { kind: "NullableType", inner: { kind: "PredefinedType", name: "object" } } },
        { name: "factory", type: csharpTypeFromTargetTypeRef(factory.factoryType, input.scope.typeParameterNames)! },
      ], body: { kind: "Block", statements: [{ kind: "ReturnStatement", expression: {
        kind: "BinaryExpression", operatorToken: { kind: "AmpersandAmpersandToken" },
        left: { kind: "IsPatternExpression", expression: { kind: "IdentifierName", name: "value" },
          type: factory.identity === undefined ? instance : csharpTypeFromTargetTypeRef(factory.identity.type, input.scope.typeParameterNames)!, designation: "selected" },
        right: { kind: "InvocationExpression", callee: { kind: "SimpleMemberAccessExpression",
          receiver: { kind: "PredefinedType", name: "object" }, name: "ReferenceEquals" }, arguments: [
          { kind: "Argument", expression: member({ kind: "IdentifierName", name: "selected" }, factory.environmentName) },
          { kind: "Argument", expression: { kind: "IdentifierName", name: "factory" } },
        ] },
      } }] } });
  }
  members.push({ kind: "MethodDeclaration", name: factory.contract.createMethodName, modifiers: ["public"], returnType: instance, parameters,
    typeParameters: planTypeParameters(input.program.source.ast.typeParameters(factory.declaration), input, diagnostics, factory.declaration),
    body: { kind: "Block", statements: [{ kind: "ReturnStatement", expression: { kind: "ObjectCreationExpression", type: instance,
      arguments: [{ kind: "Argument", expression: { kind: "IdentifierName", name: "this" } }, ...parameters.map(parameter => ({
        kind: "Argument" as const,
        expression: { kind: "IdentifierName" as const, name: parameter.name },
      }))] } }] } });
  return { kind: "ClassDeclaration", name: factory.factoryName, modifiers: ["public"], members,
    typeParameters: planOuterTypeParameters(factory.declaration, input, diagnostics) };
}

export function planClassFactoryIdentity(
  factory: CsharpClassFactory, outerInput: CsharpPlanningContext, diagnostics: TargetDiagnostic[],
): CsharpInterfaceDeclaration | undefined {
  if (factory.identity === undefined) return undefined;
  const input = createCsharpTypeParameterPlanningContext(factory.declaration, outerInput);
  return { kind: "InterfaceDeclaration", name: factory.identity.name, modifiers: ["public"],
    typeParameters: planOuterTypeParameters(factory.declaration, input, diagnostics),
    members: [{ kind: "PropertyDeclaration", name: factory.environmentName,
      type: csharpTypeFromTargetTypeRef(factory.factoryType, input.scope.typeParameterNames)!, writable: false }],
  };
}
