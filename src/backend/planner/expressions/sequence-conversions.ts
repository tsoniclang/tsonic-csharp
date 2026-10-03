import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { TargetTypeRef } from "../../../target-model/types/index.js";
import { csharpTupleElementMemberName, getCsharpReadOnlyIndexableCollectionElementTargetType } from "../../../target-model/types/index.js";
import { isCsharpValueTypeTargetType } from "../../../target-model/types/identity.js";
import { selectCsharpCollectionElementRead } from "../../../target-model/types/collection-reads.js";
import type { CsharpExpression, CsharpStatement, CsharpTypeNode } from "../../target-ast/roslyn/index.js";
import type { CsharpPlanningContext } from "../context.js";
import { unsupportedNodeDiagnostic } from "../diagnostics.js";
import { applyCsharpConversionSelection } from "./conversions.js";
import type { ExpressionPlanner } from "./expression-planner-types.js";
import { planCsharpBorrowedSequenceConsumption } from "./array-literals/borrowed-sequences.js";
import { targetTypeRefEquals } from "../../../target-model/types/equality.js";
import { planCsharpCollectionIndexedIteration } from "./collection-reads.js";
import { planCsharpArraySpreadInput, type CsharpArraySpreadInput } from "./array-literals/spread-source.js";
import type { CsharpPlannedArraySpreadInput } from "./array-literals/spread-source.js";
import { csharpPlannedValue, type CsharpPlannedValue } from "./planned-values.js";
import { composeCsharpPlannedValues } from "./planned-value-composition.js";
import { planCsharpPlannedDiscard } from "../statements/statement-output.js";
import { qualifiedCsharpType } from "../types/index.js";


export function planCsharpSequenceValue(
  node: Node,
  planned: CsharpPlannedArraySpreadInput,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  elementType: CsharpTypeNode,
  elementTarget: TargetTypeRef,
): CsharpPlannedValue | undefined {
  if (planned.completion.kind === "never") return planned;
  if (planned.completion.kind !== "value") return reject(node, diagnostics, "Native sequence construction requires a selected value completion.");
  const source = planned.source;
  if (!targetTypeRefEquals(source.carrier, planned.completion.carrier)) {
    return reject(node, diagnostics, "Native sequence construction must retain its finalized source carrier.");
  }
  if (source.carrier.kind !== "tuple" && source.lengthMember === undefined) {
    return reject(node, diagnostics, "Native sequence construction requires its finalized native length.");
  }
  if (source.carrier.kind === "tuple" && source.elements.length === 0) {
    return csharpPlannedValue({ kind: "array", element: elementTarget }, {
      kind: "InvocationExpression", callee: { kind: "SimpleMemberAccessExpression",
        receiver: qualifiedCsharpType("System", "Array"), name: "Empty", typeArguments: [elementType] },
      arguments: [],
    }, planCsharpPlannedDiscard(planned));
  }
  const name = input.names.temporaryName("__tsonic_sequence_source");
  const destinationName = input.names.temporaryName("__tsonic_sequence_result");
  const receiver = identifier(name);
  const destination = identifier(destinationName);
  const consumed = planCsharpSequenceSnapshotStatements(node, { ...source, expression: receiver }, destination,
    sourceFile, input, diagnostics, elementType, elementTarget);
  if (consumed === undefined) return undefined;
  const resultCarrier: TargetTypeRef = { kind: "array", element: elementTarget };
  return csharpPlannedValue(resultCarrier, destination, [...planned.prelude,
    { kind: "LocalDeclarationStatement", name, type: source.type, initializer: planned.completion.expression },
    { kind: "LocalDeclarationStatement", name: destinationName, type: { kind: "ArrayType", elementType } }, ...consumed,
  ]);
}

export function planCsharpSequenceSnapshotStatements(
  node: Node,
  source: CsharpArraySpreadInput,
  destination: CsharpExpression,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  elementType: CsharpTypeNode,
  elementTarget: TargetTypeRef,
): readonly CsharpStatement[] | undefined {
  const length = planCsharpSequenceLength(source, source.expression);
  if (length === undefined) return reject(node, diagnostics, "Native sequence snapshot requires its exact native length.");
  const allocation: CsharpStatement = { kind: "ExpressionStatement", expression: { kind: "AssignmentExpression",
    operatorToken: { kind: "EqualsToken" }, left: destination,
    right: { kind: "ArrayCreationExpression", elementType, elements: [], size: length } } };
  if (source.carrier.kind === "tuple" && source.elements.length === 0) return [allocation];
  if (source.carrier.kind === "array" && source.elements[0]?.conversion.kind === "identity") {
    return [allocation, { kind: "ExpressionStatement", expression: invoke({ kind: "QualifiedName",
      left: { kind: "IdentifierName", name: "System" }, name: "Array" }, "Copy", [source.expression, destination, length]) }];
  }
  const position = input.names.temporaryName("__tsonic_sequence_position");
  const consumed = planCsharpSequenceAppendStatements(node, source, source.expression, sourceFile, input, diagnostics,
    elementTarget, value => ({ kind: "ExpressionStatement", expression: {
      kind: "AssignmentExpression", operatorToken: { kind: "EqualsToken" },
      left: { kind: "ElementAccessExpression", receiver: destination,
        arguments: [{ kind: "PostfixUnaryExpression", operand: identifier(position), operatorToken: { kind: "PlusPlusToken" } }] }, right: value,
    } }));
  return consumed === undefined ? undefined : [allocation,
    { kind: "LocalDeclarationStatement", name: position, type: { kind: "PredefinedType", name: "int" }, initializer: { kind: "LiteralExpression", value: 0 } },
    ...consumed];
}


export function planCsharpJsArraySpreadAppend(
  node: Node,
  operand: Node,
  destination: CsharpPlannedValue,
  collectionType: CsharpTypeNode,
  elementTarget: TargetTypeRef,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planner: { readonly planExpression: ExpressionPlanner },
): CsharpPlannedValue | undefined {
  if (destination.completion.kind === "never") return destination;
  if (destination.completion.kind !== "value") return reject(node, diagnostics, "Sequence append requires a native destination value.");
  const resultCarrier = destination.completion.carrier;
  const borrowed = input.program.operations.borrowedSequence(operand);
  if (borrowed !== undefined) {
    const name = input.names.temporaryName("__tsonic_sequence_destination");
    const receiver = identifier(name);
    const consumed = planCsharpBorrowedSequenceConsumption(node, borrowed, sourceFile, input, diagnostics, elementTarget,
      expression => planner.planExpression(expression, sourceFile, input, diagnostics), source => {
        const statements = planCsharpSequenceAppendStatements(node, source, source.expression, sourceFile, input, diagnostics,
          elementTarget, value => ({ kind: "ExpressionStatement", expression: invoke(receiver, "Add", [value]) }));
        if (statements === undefined) return undefined;
        const length = planCsharpSequenceLength(source, source.expression);
        return [...(length === undefined ? [] : [{ kind: "ExpressionStatement" as const,
          expression: invoke(receiver, "EnsureCapacity", [{ kind: "CheckedExpression", expression: {
            kind: "BinaryExpression", operatorToken: { kind: "PlusToken" },
            left: { kind: "SimpleMemberAccessExpression", receiver, name: "Count" }, right: length,
          } }]) }]), ...statements];
      }, () => []);
    return consumed === undefined ? undefined : csharpPlannedValue(resultCarrier, receiver, [...destination.prelude,
      { kind: "LocalDeclarationStatement", name, type: collectionType, initializer: destination.completion.expression },
      ...consumed.prelude]);
  }
  const planned = planCsharpArraySpreadInput(node, operand, sourceFile, input, diagnostics, elementTarget, planner.planExpression);
  if (planned === undefined) return undefined;
  const source = planned.source;
  const read = selectCsharpCollectionElementRead(source.carrier);
  if (read?.kind === "invalid") return reject(node, diagnostics, read.reason);
  if (source.carrier.kind !== "tuple" && !isCsharpValueTypeTargetType(source.carrier) &&
    read?.kind !== "method" && source.elements.every(element => element.conversion.kind === "identity")) {
    return composeCsharpPlannedValues(node, sourceFile, input, diagnostics, [destination, planned], values =>
      csharpPlannedValue(resultCarrier, invoke(values[0]!, "AppendSequence", [values[1]!])));
  }
  const destinationLocal = input.names.temporaryName("__tsonic_sequence_destination");
  const sourceLocal = input.names.temporaryName("__tsonic_sequence_source");
  const destinationName = identifier(destinationLocal);
  const sourceName = identifier(sourceLocal);
  const statements: CsharpStatement[] = [];
  const length = planCsharpSequenceLength(source, sourceName);
  if (length !== undefined) statements.push({ kind: "ExpressionStatement", expression: invoke(destinationName, "EnsureCapacity", [{
    kind: "CheckedExpression", expression: { kind: "BinaryExpression", operatorToken: { kind: "PlusToken" },
      left: { kind: "SimpleMemberAccessExpression", receiver: destinationName, name: "Count" }, right: length },
  }]) });
  const spread = planCsharpSequenceAppendStatements(node, { ...source, expression: sourceName }, sourceName, sourceFile, input, diagnostics, elementTarget,
    value => ({ kind: "ExpressionStatement", expression: invoke(destinationName, "Add", [value]) }));
  if (spread === undefined) return undefined;
  statements.push(...spread);
  return composeCsharpPlannedValues(node, sourceFile, input, diagnostics, [destination, planned], values =>
    csharpPlannedValue(resultCarrier, destinationName, [
      { kind: "LocalDeclarationStatement", name: destinationLocal, type: collectionType, initializer: values[0]! },
      { kind: "LocalDeclarationStatement", name: sourceLocal, type: source.type, initializer: values[1]! }, ...statements,
    ]));
}

export function planCsharpSequenceAppendStatements(
  node: Node,
  source: CsharpArraySpreadInput,
  receiver: CsharpExpression,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  elementTarget: TargetTypeRef,
  append: (value: CsharpExpression) => CsharpStatement,
): readonly CsharpStatement[] | undefined {
  const convert = (value: CsharpExpression, index: number): CsharpExpression | undefined => {
    const element = source.elements[index];
    return element === undefined ? undefined : applyCsharpConversionSelection(node, sourceFile, input, diagnostics,
      element.carrier, elementTarget, element.conversion, value);
  };
  if (source.carrier.kind === "tuple") {
    const values = source.elements.map((_, index) => convert({ kind: "SimpleMemberAccessExpression",
      receiver, name: csharpTupleElementMemberName(index) }, index));
    return values.some(value => value === undefined) ? undefined : values.map(value => append(value!));
  }
  if (getCsharpReadOnlyIndexableCollectionElementTargetType(source.carrier) !== undefined && source.lengthMember !== undefined) {
    const indexName = input.names.temporaryName("__tsonic_sequence_index");
    const loop = planCsharpCollectionIndexedIteration(source.carrier, receiver, indexName, read => {
      const value = convert(read, 0);
      return value === undefined ? undefined : [append(value)];
    }, input.scope.typeParameterNames);
    return loop === undefined ? reject(node, diagnostics, "Native sequence read lost its finalized indexed member contract.") : [loop];
  }
  const value = convert(identifier("value"), 0);
  return value === undefined ? undefined : [{ kind: "ForEachStatement", itemType: source.elements[0]!.type,
    itemName: "value", collection: receiver, body: { kind: "Block", statements: [append(value)] } }];
}

export function planCsharpSequenceLength(source: Omit<CsharpArraySpreadInput, "expression">, receiver: CsharpExpression): CsharpExpression | undefined {
  return source.carrier.kind === "tuple" ? { kind: "LiteralExpression", value: source.carrier.elements.length }
    : source.lengthMember === undefined ? undefined : { kind: "SimpleMemberAccessExpression", receiver, name: source.lengthMember };
}


function identifier(name: string): CsharpExpression { return { kind: "IdentifierName", name }; }

function invoke(receiver: CsharpExpression, name: string, arguments_: readonly CsharpExpression[]): CsharpExpression {
  return { kind: "InvocationExpression", callee: { kind: "SimpleMemberAccessExpression", receiver, name },
    arguments: arguments_.map(expression => ({ kind: "Argument", expression })) };
}

function reject(node: Node, diagnostics: TargetDiagnostic[], message: string): undefined {
  diagnostics.push(unsupportedNodeDiagnostic(node, message));
  return undefined;
}
