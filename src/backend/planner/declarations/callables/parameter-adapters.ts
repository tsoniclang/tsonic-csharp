import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpCallableParameterAdapter, CsharpCallableValueAdapter } from "../../../../target-model/records/callables/callable-adapters.js";
import type { SourceCallableContract } from "../../../../target-model/records/callables/source-callable-contract.js";
import type { CsharpExpression, CsharpParameter, CsharpStatement } from "../../../target-ast/syntax/index.js";
import type { CsharpPlanningContext } from "../../context.js";
import { applyCsharpConversionSelection } from "../../expressions/conversions.js";
import { csharpTypeFromTargetTypeRef } from "../../types/render.js";
import { qualifiedCsharpType } from "../../types/index.js";
import { failCsharpPlannerInvariant } from "../../diagnostics.js";

export function planCsharpCallableArguments(
  declaration: Node, source: Pick<SourceCallableContract, "nativeParameters">, parameters: readonly CsharpParameter[],
  implementationParameters: readonly CsharpParameter[], adapters: readonly CsharpCallableParameterAdapter[],
  sourceFile: SourceFile, input: CsharpPlanningContext, diagnostics: TargetDiagnostic[],
): { readonly statements: readonly CsharpStatement[]; readonly arguments: readonly CsharpExpression[] } {
  function missingPlan(): never { return failCsharpPlannerInvariant("An admitted callable adapter requires its complete native argument adaptation.", declaration); }
  if (source.nativeParameters.length !== parameters.length || adapters.length !== implementationParameters.length) missingPlan();
  const statements: CsharpStatement[] = [];
  const arguments_: CsharpExpression[] = [];
  const name = (preferred: string) => input.names.temporaryName(preferred);
  const sourceValue = (index: number): CsharpExpression => parameters[index] === undefined ? missingPlan() : identifier(parameters[index]!.name);
  const length = (index: number, member: string): CsharpExpression => {
    const value = sourceValue(index);
    return { kind: "SimpleMemberAccessExpression", receiver: value, name: member };
  };
  const convert = (expression: CsharpExpression, adapter: CsharpCallableValueAdapter) => applyCsharpConversionSelection(
    declaration, sourceFile, input, diagnostics, adapter.source, adapter.target, adapter.conversion, expression);
  for (const [index, adapter] of adapters.entries()) {
    if (adapter.kind === "omitted") {
      const value = implementationParameters[adapter.parameterIndex]?.defaultValue;
      if (value === undefined) missingPlan();
      arguments_.push(value);
      continue;
    }
    if (adapter.kind === "rest") {
      const targetType = csharpTypeFromTargetTypeRef(adapter.target, input.scope.typeParameterNames);
      const elementType = csharpTypeFromTargetTypeRef(adapter.element, input.scope.typeParameterNames);
      if (targetType === undefined || elementType === undefined) missingPlan();
      if (adapter.segments.length === 0) {
        arguments_.push({ kind: "CastExpression", type: targetType, expression: { kind: "CollectionExpression", elements: [] } });
        continue;
      }
      const fixed = adapter.segments.filter(segment => segment.kind === "value");
      const sequences = adapter.segments.filter(segment => segment.kind === "sequence");
      if (sequences.length > 1 || fixed.length + sequences.length !== adapter.segments.length) missingPlan();
      const sequence = sequences[0];
      const sourceLength = sequence === undefined ? undefined : length(sequence.parameterIndex, sequence.lengthMember);
      const count = identifier(name(`__tsonic_rest_count${index}`));
      const tailLength: CsharpExpression = sequence === undefined ? literal(0) : sequence.offset === 0 ? sourceLength! : {
        kind: "ConditionalExpression", condition: binary(sourceLength!, "GreaterThanToken", literal(sequence.offset)),
        whenTrue: binary(sourceLength!, "MinusToken", literal(sequence.offset)), whenFalse: literal(0),
      };
      statements.push({ kind: "LocalDeclarationStatement", name: count.name, type: { kind: "PredefinedType", name: "int" },
        initializer: fixed.length === 0 ? tailLength : { kind: "CheckedExpression", expression: binary(literal(fixed.length), "PlusToken", tailLength) } });
      const buffer = identifier(name(`__tsonic_rest${index}`));
      statements.push({ kind: "LocalDeclarationStatement", name: buffer.name, type: targetType,
        initializer: adapter.collection === "array"
          ? { kind: "ArrayCreationExpression", elementType, size: count, elements: [] }
          : { kind: "ObjectCreationExpression", type: targetType, arguments: [], assignments: [{ kind: "AssignmentExpression", name: "Capacity", expression: count }] } });
      const append = (position: CsharpExpression, value: CsharpExpression): CsharpStatement => ({ kind: "ExpressionStatement", expression: adapter.collection === "array"
        ? { kind: "AssignmentExpression", left: elementAt(buffer, position), operatorToken: { kind: "EqualsToken" }, right: value }
        : { kind: "InvocationExpression", callee: { kind: "SimpleMemberAccessExpression", receiver: buffer, name: "Add" },
          arguments: [{ kind: "Argument", expression: value }] } });
      for (const [position, segment] of fixed.entries()) {
        const operand = sourceValue(segment.parameterIndex);
        const value = operand === undefined ? undefined : convert(operand, segment.adapter);
        if (value === undefined) missingPlan();
        statements.push(append(literal(position), value));
      }
      if (sequence !== undefined) {
        const cursor = identifier(name(`__tsonic_rest_index${index}`));
        const operand = sourceValue(sequence.parameterIndex);
        const readIndex = sequence.offset === 0 ? cursor : binary(cursor, "PlusToken", literal(sequence.offset));
        const value = operand === undefined ? undefined : convert(elementAt(operand, readIndex), sequence.adapter);
        if (value === undefined) missingPlan();
        statements.push({ kind: "ForStatement", initializer: { kind: "VariableDeclaration", locals: [{ kind: "VariableDeclarator",
          name: cursor.name, type: { kind: "PredefinedType", name: "int" }, initializer: literal(0) }] },
          condition: binary(cursor, "LessThanToken", fixed.length === 0 ? count : binary(count, "MinusToken", literal(fixed.length))),
          incrementors: [{ kind: "PostfixUnaryExpression", operand: cursor, operatorToken: { kind: "PlusPlusToken" } }],
          body: { kind: "Block", statements: [append(fixed.length === 0 ? cursor : binary(cursor, "PlusToken", literal(fixed.length)), value)] } });
      }
      arguments_.push(buffer);
      continue;
    }
    const operand = sourceValue(adapter.parameterIndex);
    if (adapter.kind === "value") {
      const value = convert(operand, adapter.adapter);
      if (value === undefined) missingPlan();
      arguments_.push(value);
      continue;
    }
    const sourceLength = length(adapter.parameterIndex, adapter.lengthMember);
    const converted = convert(elementAt(operand, literal(adapter.offset)), adapter.adapter);
    const missing = implementationParameters[index]?.defaultValue;
    if (sourceLength === undefined || converted === undefined || adapter.optional && missing === undefined)
      failCsharpPlannerInvariant("An admitted rest-element adapter requires its native value, length and optional default.", declaration);
    const value: CsharpExpression = { kind: "ConditionalExpression",
      condition: binary(sourceLength, "GreaterThanToken", literal(adapter.offset)), whenTrue: converted,
      whenFalse: adapter.optional ? missing! : { kind: "ThrowExpression", expression: { kind: "ObjectCreationExpression",
        type: qualifiedCsharpType("System", "ArgumentException"), arguments: [{ kind: "Argument", expression: literal("A required native argument is absent") }] } } };
    const local = identifier(name(`__tsonic_argument${index}`));
    statements.push({ kind: "LocalDeclarationStatement", name: local.name, type: implementationParameters[index]!.type, initializer: value });
    arguments_.push(local);
  }
  return { statements: Object.freeze(statements), arguments: Object.freeze(arguments_) };
}

function identifier(name: string): Extract<CsharpExpression, { readonly kind: "IdentifierName" }> { return { kind: "IdentifierName", name }; }
function literal(value: string | number): CsharpExpression { return { kind: "LiteralExpression", value }; }
function elementAt(receiver: CsharpExpression, index: CsharpExpression): CsharpExpression {
  return { kind: "ElementAccessExpression", receiver, arguments: [index] };
}
function binary(left: CsharpExpression, operator: "PlusToken" | "MinusToken" | "LessThanToken" | "GreaterThanToken", right: CsharpExpression): CsharpExpression {
  return { kind: "BinaryExpression", left, operatorToken: { kind: operator }, right };
}
