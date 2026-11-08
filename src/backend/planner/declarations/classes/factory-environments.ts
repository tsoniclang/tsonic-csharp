import type { Node } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpClassFactory } from "../../../../target-model/records/objects/class-factories.js";
import type { CsharpCaptureFrame } from "../../../../target-model/records/callables/capture-storage.js";
import type { CsharpConstructorDeclaration, CsharpExpression, CsharpStatement, CsharpTypeNode } from "../../../target-ast/syntax/index.js";
import type { CsharpPlanningContext } from "../../planning-data.js";
import { csharpTypeFromObjectShapeFact } from "../../objects/type-references.js";
import { csharpTypeFromTargetTypeRef } from "../../types/render.js";
import { failCsharpPlannerInvariant } from "../../diagnostics.js";
import type { TargetTypeRef } from "../../../../target-model/types/native-type-data.js";

interface CaptureSlot {
  readonly kind: "frame" | "binding" | "expression";
  readonly name: string;
  readonly type: CsharpTypeNode;
  readonly carrier: TargetTypeRef;
  readonly frame?: CsharpCaptureFrame;
  readonly reference?: Node;
  readonly declaration?: Node;
}

export function captureSlots(factory: CsharpClassFactory, input: CsharpPlanningContext, diagnostics: TargetDiagnostic[]): readonly CaptureSlot[] {
  const slots = input.program.records.classCaptures.get(factory.declaration);
  if (slots === undefined) failCsharpPlannerInvariant("An admitted class factory requires its sealed capture layout.", factory.declaration);
  return slots.map(slot => {
    const type = slot.kind === "frame" ? csharpTypeFromObjectShapeFact(input, slot.frame.shape, diagnostics, factory.declaration)
      : csharpTypeFromTargetTypeRef(slot.carrier, input.scope.typeParameterNames);
    if (type === undefined) failCsharpPlannerInvariant("An admitted class capture lost its renderable physical storage.", factory.declaration);
    return { ...slot, type };
  });
}

export function member(receiver: CsharpExpression, name: string): CsharpExpression {
  return { kind: "SimpleMemberAccessExpression", receiver, name };
}

export function assignment(receiver: CsharpExpression, name: string, expression: CsharpExpression): CsharpStatement {
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
    const owner = shared === undefined ? receiver : frames.get(shared.frame.scope)!;
    const name = shared === undefined ? capture.fieldName : shared.fieldName;
    bindings.set(capture.declaration, { expression: member(owner, name),
      address: { kind: "member", receiver: { expression: owner }, name, static: false } });
  }
  return { ...input, scope: { ...input.scope, capturedBindings: bindings, captureFrames: frames,
    sourceThisBinding: { name: "this", targetType: receiverKind === "instance" ? factory.contract.instance : factory.factoryType },
    classValues: new Map([...input.scope.classValues ?? [], [factory.declaration, receiver]]) } };
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
      assignment({ kind: "IdentifierName", name: "this" }, factory.environmentName, environment),
      ...initializers, ...constructor.body.statements,
    ] } };
}
