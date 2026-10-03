import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpClassFactory } from "../../../../analysis/project-types/class-factories.js";
import type { CsharpCaptureFrame } from "../../../../analysis/callables/capture-storage.js";
import type { CsharpClassDeclaration, CsharpConstructorDeclaration, CsharpExpression, CsharpInterfaceDeclaration, CsharpStatement, CsharpTypeMember, CsharpTypeNode } from "../../../target-ast/roslyn/index.js";
import type { CsharpPlanningContext } from "../../context.js";
import type { DestructuringPlannerState } from "../../bindings/index.js";
import { csharpCaptureFrameExpression, csharpCapturedBindingExpression } from "../../bindings/capture-storage.js";
import { getCsharpLocalBindingName } from "../../bindings/binding-state.js";
import { csharpTypeFromObjectShapeFact } from "../../objects/planning.js";
import { csharpTypeFromTargetTypeRef } from "../../types/target-types.js";
import { planExpression } from "../../expressions/index.js";
import { planClassMembers } from "./members.js";
import { createCsharpTypeParameterPlanningContext } from "../../names/type-parameters.js";
import { planOuterTypeParameters, planTypeParameters } from "../../types/type-parameters.js";
import { unsupportedNodeDiagnostic } from "../../diagnostics.js";
import { planClassInitializationRegion } from "./initializers.js";
import type { TargetTypeRef } from "../../../../target-model/types/model.js";
import { csharpPlannedValue, type CsharpPlannedValue } from "../../expressions/planned-values.js";
import { buildCsharpPlannedValue } from "../../expressions/planned-value-composition.js";

interface CaptureSlot {
  readonly name: string;
  readonly type: CsharpTypeNode;
  readonly carrier: TargetTypeRef;
  readonly frame?: CsharpCaptureFrame;
  readonly reference?: Node;
  readonly declaration?: Node;
}

function captureSlots(factory: CsharpClassFactory, input: CsharpPlanningContext, diagnostics: TargetDiagnostic[]): readonly CaptureSlot[] {
  const slots: CaptureSlot[] = [];
  const frames = new Set<Node>();
  for (const capture of factory.captures) {
    const shared = input.program.captureStorage.binding(capture.declaration);
    if (shared !== undefined) {
      if (frames.has(shared.frame.scope)) continue;
      frames.add(shared.frame.scope);
      const type = csharpTypeFromObjectShapeFact(input, shared.frame.shape, diagnostics, factory.declaration);
      if (type !== undefined) slots.push({ name: input.program.names.temporaryName(`frame${frames.size - 1}`), type, carrier: shared.frame.shape.targetType, frame: shared.frame });
    } else {
      const type = csharpTypeFromTargetTypeRef(input.program.captureStorage.physicalType(capture.declaration, capture.type), input.scope.typeParameterNames);
      if (type === undefined) diagnostics.push(unsupportedNodeDiagnostic(capture.declaration, "A class capture has no renderable native storage."));
      else slots.push({ name: capture.fieldName, type, carrier: input.program.captureStorage.physicalType(capture.declaration, capture.type), reference: capture.reference, declaration: capture.declaration });
    }
  }
  return slots;
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
    const shared = input.program.captureStorage.binding(capture.declaration);
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
    if (slot.declaration !== undefined && input.program.storage.nativeBacking(slot.declaration) !== undefined) {
      const captured = csharpCapturedBindingExpression(slot.declaration, input, state);
      const name = getCsharpLocalBindingName(slot.reference!, input, state);
      const value = captured ?? (name === undefined ? undefined : { kind: "IdentifierName" as const, name });
      return value === undefined ? undefined : csharpPlannedValue(slot.carrier, value);
    }
    return planExpression(slot.reference!, sourceFile, input, diagnostics, state);
  });
  const type = csharpTypeFromTargetTypeRef(factory.factoryType, input.scope.typeParameterNames);
  if (type === undefined || arguments_.some(argument => argument === undefined)) {
    diagnostics.push(unsupportedNodeDiagnostic(factory.declaration, "A class evaluation requires every sealed native capture owner."));
    return undefined;
  }
  return buildCsharpPlannedValue(factory.declaration, sourceFile, input, diagnostics, arguments_, values => ({
    kind: "ObjectCreationExpression", type, arguments: values.map(expression => ({ kind: "Argument", expression })),
  }), factory.factoryType);
}

export function completeLocalClassConstructor(
  constructor: CsharpConstructorDeclaration, factory: CsharpClassFactory,
  input: CsharpPlanningContext, initializers: readonly CsharpStatement[],
): CsharpConstructorDeclaration {
  const environment: CsharpExpression = { kind: "IdentifierName", name: factory.environmentName };
  const type = csharpTypeFromTargetTypeRef(factory.factoryType, input.scope.typeParameterNames)!;
  if (constructor.initializer?.kind === "this") return { ...constructor,
    parameters: [{ name: factory.environmentName, type }, ...constructor.parameters],
    initializer: { kind: "this", arguments: [{ kind: "Argument", expression: environment }, ...constructor.initializer.arguments] } };
  return { ...constructor, parameters: [{ name: factory.environmentName, type }, ...constructor.parameters],
    body: { kind: "Block", statements: [
      ...(factory.retainsEnvironment ? [assignment({ kind: "IdentifierName", name: "this" }, factory.environmentName, environment)] : []),
      ...initializers, ...constructor.body.statements,
    ] } };
}

export function planClassFactoryDeclaration(
  factory: CsharpClassFactory, instanceDeclaration: CsharpClassDeclaration,
  outerInput: CsharpPlanningContext, diagnostics: TargetDiagnostic[],
): CsharpClassDeclaration {
  const input = createCsharpTypeParameterPlanningContext(factory.declaration, outerInput);
  const slots = captureSlots(factory, input, diagnostics);
  const context = classFactoryContext(factory, { kind: "IdentifierName", name: "this" }, input, diagnostics, "factory");
  const staticNodes = input.program.source.ast.members(factory.declaration).filter(node => node !== undefined &&
    input.program.source.ast.hasModifierKind(node, "static") && !input.program.source.ast.is.IsClassStaticBlockDeclaration(node));
  const staticRegion = planClassInitializationRegion(factory.declaration, factory.sourceFile, factory.factoryName, true, context, diagnostics, true);
  const staticMembers = planClassMembers(staticNodes, factory.factoryName, factory.sourceFile, context, diagnostics, [staticRegion]);
  const members: CsharpTypeMember[] = staticMembers.filter(member => member.kind !== "ConstructorDeclaration" && member.kind !== "StaticConstructorDeclaration")
    .map(member => ({ ...member, modifiers: member.modifiers.filter(modifier => modifier !== "static") }));
  const constructors = instanceDeclaration.members.filter((member): member is CsharpConstructorDeclaration =>
    member.kind === "ConstructorDeclaration");
  const entries = constructors.filter(constructor => constructor.initializer?.kind === "this");
  const entry = constructors.length === 1 ? constructors[0] : entries.length === 1 ? entries[0] : undefined;
  if (entry === undefined || entry.parameters[0]?.name !== factory.environmentName) {
    diagnostics.push(unsupportedNodeDiagnostic(factory.declaration,
      "A local class factory requires one exact planned constructor and its environment parameter."));
  }
  const parameters = entry?.parameters.slice(1) ?? [];
  members.push(...slots.map(slot => ({ kind: "FieldDeclaration" as const, name: slot.name,
    type: slot.type, modifiers: ["public" as const, "readonly" as const] })));
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
