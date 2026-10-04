import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpArgument, CsharpConstructorDeclaration, CsharpExpression, CsharpParameter, CsharpStatement, CsharpTypeNode } from "../../../target-ast/roslyn/index.js";
import type { CsharpPlanningContext } from "../../context.js";
import type { DestructuringPlannerState } from "../../bindings/binding-state.js";
import type { CsharpEntryBinding } from "../../bindings/binding-patterns.js";
import type { PlannedParameterList } from "../callables/parameters.js";
import type { CsharpPlannedArgument } from "../../expressions/planned-values.js";
import { allocateDestructuringTemp, csharpCaptureFrameName } from "../../bindings/binding-state.js";
import { planCsharpCaptureFrame } from "../../bindings/capture-storage.js";
import { csharpTypeFromObjectShapeFact } from "../../objects/planning.js";
import { csharpTypeFromTargetTypeRef } from "../../types/target-types.js";
import { csharpTypeFromTargetTypeRefWithObjectShapeDeclarations } from "../../types/target-type-object-shapes.js";
import { planBlockStatements } from "../../statements/planning.js";
import { planCsharpGeneratedMethodCall } from "../generated-methods.js";
import { unsupportedNodeDiagnostic } from "../../diagnostics.js";
import { planThisExpression } from "../../expressions/expression-this.js";
import type { TargetTypeRef } from "../../../../target-model/types/model.js";
import { planCsharpParameterPropertyAssignments } from "./parameter-properties.js";

export interface CsharpConstructorArgumentPlan {
  readonly node: Node;
  readonly value: CsharpPlannedArgument;
  readonly expectedCarrier?: TargetTypeRef;
}

export function planCsharpPreparedConstructor(
  node: Node, bodyNode: Node | undefined, declaration: CsharpConstructorDeclaration,
  parameters: PlannedParameterList, arguments_: readonly CsharpConstructorArgumentPlan[],
  sourceFile: SourceFile, input: CsharpPlanningContext, diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState, hasBaseCall: boolean,
  initializers: readonly CsharpStatement[],
): readonly CsharpConstructorDeclaration[] {
  if (bodyNode === undefined) return [];
  const frame = input.program.captureStorage.frame(bodyNode);
  const bindings: CsharpEntryBinding[] = [...parameters.entryBindings];
  const receivers = new Map<Node, CsharpExpression>();
  if (frame !== undefined) {
    const frameType = csharpTypeFromObjectShapeFact(input, frame.shape, diagnostics, node);
    if (frameType === undefined) return [];
    bindings.push({ name: csharpCaptureFrameName(bodyNode, state), type: frameType });
    for (const receiver of frame.receivers) {
      const type = csharpTypeFromTargetTypeRef(receiver.type, input.scope.typeParameterNames);
      if (type === undefined) {
        diagnostics.push(unsupportedNodeDiagnostic(node, "Constructor entry requires the exact captured receiver storage type."));
        return [];
      }
      receivers.set(receiver.owner, { kind: "DefaultExpression", type, nullForgiving: true });
    }
  }
  const statements: CsharpStatement[] = [
    ...planCsharpCaptureFrame(bodyNode, input, diagnostics, state, new Map(), receivers),
    ...parameters.prelude,
  ];
  const baseBindings: CsharpEntryBinding[] = [];
  let terminated = false;
  for (const selected of arguments_) {
    const argument = selected.value;
    const type = csharpTypeFromTargetTypeRefWithObjectShapeDeclarations(input, selected.expectedCarrier ?? argument.completion.carrier, diagnostics, selected.node);
    if (type === undefined || argument.passing !== undefined || argument.completion.kind === "void") {
      diagnostics.push(unsupportedNodeDiagnostic(node,
        "Prepared constructor arguments require exact native value storage; managed references cannot be stored in a value packet."));
      return [];
    }
    const binding = { name: allocateDestructuringTemp(state), type };
    baseBindings.push(binding);
    if (terminated) continue;
    statements.push(...argument.prelude);
    if (argument.completion.kind === "never") { terminated = true; continue; }
    statements.push({ kind: "LocalDeclarationStatement", ...binding, initializer: argument.completion.expression });
  }
  const packetBindings = [...bindings, ...baseBindings];
  const packetType: CsharpTypeNode = packetBindings.length <= 1
    ? { kind: "QualifiedName", left: { kind: "AliasQualifiedName", alias: "global", name: { kind: "IdentifierName", name: "System" } },
      name: "ValueTuple", ...(packetBindings.length === 0 ? {} : { typeArguments: [packetBindings[0]!.type] }) }
    : { kind: "TupleType", elements: packetBindings.map(binding => binding.type) };
  const values: readonly CsharpExpression[] = packetBindings.map(binding => ({ kind: "IdentifierName", name: binding.name }));
  if (!terminated) statements.push({ kind: "ReturnStatement", expression: values.length <= 1
    ? { kind: "ObjectCreationExpression", type: packetType, arguments: values.map(expression => ({ kind: "Argument", expression })) }
    : { kind: "TupleExpression", elements: values } });
  const factory = input.program.classFactories.get(input.program.source.ast.parent(node)!);
  const environmentType = factory === undefined ? undefined : csharpTypeFromTargetTypeRef(factory.factoryType, input.scope.typeParameterNames);
  if (factory !== undefined && environmentType === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "Constructor preparation requires its exact native class environment."));
    return [];
  }
  const helperParameters: readonly CsharpParameter[] = [
    ...(factory === undefined || environmentType === undefined ? [] : [{ name: factory.environmentName, type: environmentType }]),
    ...parameters.parameters.map(parameter => ({ name: parameter.name, type: parameter.type, passing: parameter.passing })),
  ];
  const prepare = planCsharpGeneratedMethodCall(node, "constructor_entry", packetType, helperParameters,
    { kind: "Block", statements }, helperParameters.map(parameter => ({ kind: "Argument", passing: parameter.passing,
      expression: { kind: "IdentifierName", name: parameter.name } })), input, diagnostics);
  if (prepare === undefined) return [];
  const packetName = allocateDestructuringTemp(state);
  const packet: CsharpExpression = { kind: "IdentifierName", name: packetName };
  const field = (index: number): CsharpExpression => ({ kind: "SimpleMemberAccessExpression", receiver: packet, name: `Item${index + 1}` });
  const restored: CsharpStatement[] = bindings.map((binding, index) => ({ kind: "LocalDeclarationStatement", ...binding, initializer: field(index) }));
  const frames = new Map(input.scope.captureFrames);
  if (frame !== undefined) {
    const receiver: CsharpExpression = { kind: "IdentifierName", name: csharpCaptureFrameName(bodyNode, state) };
    frames.set(bodyNode, receiver);
    for (const captured of frame.receivers) {
      const reference = captured.references[0]!;
      const file = input.program.source.ast.getSourceFile(reference);
      const expression = file === undefined ? undefined : planThisExpression(reference, file, input, diagnostics);
      if (expression === undefined) return [];
      restored.push({ kind: "ExpressionStatement", expression: {
      kind: "AssignmentExpression", left: { kind: "SimpleMemberAccessExpression", receiver, name: captured.fieldName },
      operatorToken: { kind: "EqualsToken" }, right: expression,
    } });
    }
  }
  const baseArguments: readonly CsharpArgument[] = baseBindings.map((_, index) => ({ kind: "Argument", expression: field(bindings.length + index) }));
  restored.push(...initializers, ...planCsharpParameterPropertyAssignments(node, input, diagnostics, state));
  const prepared: CsharpConstructorDeclaration = {
    kind: "ConstructorDeclaration", name: declaration.name,
    modifiers: ["private", ...declaration.modifiers.filter(modifier => modifier !== "public" && modifier !== "protected" && modifier !== "private")],
    parameters: [{ name: packetName, type: packetType }],
    ...(hasBaseCall ? { initializer: { kind: "base" as const, arguments: baseArguments } } : {}),
    body: { kind: "Block", statements: planBlockStatements(bodyNode, sourceFile,
      { ...input, scope: { ...input.scope, captureFrames: frames } }, diagnostics, state, restored, hasBaseCall ? 1 : 0) },
  };
  return [{ ...declaration, initializer: { kind: "this", arguments: [{ kind: "Argument", expression: prepare }] },
    body: { kind: "Block", statements: [] } }, prepared];
}
