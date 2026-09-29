import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpCallableParameterAdapter, CsharpCallableValueAdapter } from "../../../../analysis/callables/adapters.js";
import type { CsharpSourceCallableContract } from "../../../../policy/types/callables/source-callable-contract.js";
import { getCsharpIndexableLengthMemberName, getCsharpJsArrayElementTargetType } from "../../../../target-model/types/collections.js";
import type { CsharpExpression, CsharpParameter, CsharpStatement } from "../../../target-ast/roslyn/index.js";
import type { CsharpPlanningContext } from "../../context.js";
import { applyCsharpConversionSelection } from "../../expressions/conversions.js";
import { csharpTypeFromTargetTypeRef } from "../../types/target-types.js";
import { qualifiedCsharpType } from "../../types/index.js";

export function planCsharpCallableArguments(
  declaration: Node, source: CsharpSourceCallableContract, parameters: readonly CsharpParameter[],
  implementationParameters: readonly CsharpParameter[], adapters: readonly CsharpCallableParameterAdapter[],
  sourceFile: SourceFile, input: CsharpPlanningContext, diagnostics: TargetDiagnostic[],
): { readonly statements: readonly CsharpStatement[]; readonly arguments: readonly CsharpExpression[] } | undefined {
  if (source.parameters.length !== parameters.length || adapters.length !== implementationParameters.length) return undefined;
  const statements: CsharpStatement[] = [];
  const arguments_: CsharpExpression[] = [];
  const name = (preferred: string) => input.program.names.temporaryName(preferred);
  const sourceValue = (index: number): CsharpExpression | undefined => parameters[index] === undefined ? undefined : identifier(parameters[index]!.name);
  const length = (index: number): CsharpExpression | undefined => {
    const parameter = source.parameters[index];
    const member = parameter === undefined ? undefined : getCsharpIndexableLengthMemberName(parameter.targetParameter.type);
    const value = sourceValue(index);
    return member === undefined || value === undefined ? undefined : { kind: "SimpleMemberAccessExpression", receiver: value, name: member };
  };
  const convert = (expression: CsharpExpression, adapter: CsharpCallableValueAdapter) => applyCsharpConversionSelection(
    declaration, sourceFile, input, diagnostics, adapter.source, adapter.target, adapter.conversion, expression);
  for (const [index, adapter] of adapters.entries()) {
    if (adapter.kind === "omitted") {
      const value = implementationParameters[adapter.parameterIndex]?.defaultValue;
      if (value === undefined) return undefined;
      arguments_.push(value);
      continue;
    }
    if (adapter.kind === "rest") {
      const targetType = csharpTypeFromTargetTypeRef(adapter.target, input.scope.typeParameterNames);
      const jsElement = getCsharpJsArrayElementTargetType(adapter.target);
      const element = adapter.target.kind === "array" ? adapter.target.element : jsElement;
      const elementType = element === undefined ? undefined : csharpTypeFromTargetTypeRef(element, input.scope.typeParameterNames);
      if (targetType === undefined || elementType === undefined) return undefined;
      if (adapter.segments.length === 0) {
        arguments_.push({ kind: "CastExpression", type: targetType, expression: { kind: "CollectionExpression", elements: [] } });
        continue;
      }
      const fixed = adapter.segments.filter(segment => segment.kind === "value");
      const sequences = adapter.segments.filter(segment => segment.kind === "sequence");
      if (sequences.length > 1 || fixed.length + sequences.length !== adapter.segments.length) return undefined;
      const sequence = sequences[0];
      const sourceLength = sequence === undefined ? undefined : length(sequence.parameterIndex);
      if (sequence !== undefined && sourceLength === undefined) return undefined;
      const count = identifier(name(`__tsonic_rest_count${index}`));
      const tailLength: CsharpExpression = sequence === undefined ? literal(0) : sequence.offset === 0 ? sourceLength! : {
        kind: "ConditionalExpression", condition: binary(sourceLength!, "GreaterThanToken", literal(sequence.offset)),
        whenTrue: binary(sourceLength!, "MinusToken", literal(sequence.offset)), whenFalse: literal(0),
      };
      statements.push({ kind: "LocalDeclarationStatement", name: count.name, type: { kind: "PredefinedType", name: "int" },
        initializer: fixed.length === 0 ? tailLength : { kind: "CheckedExpression", expression: binary(literal(fixed.length), "PlusToken", tailLength) } });
      const buffer = identifier(name(`__tsonic_rest${index}`));
      statements.push({ kind: "LocalDeclarationStatement", name: buffer.name, type: targetType,
        initializer: jsElement === undefined
          ? { kind: "ArrayCreationExpression", elementType, size: count, elements: [] }
          : { kind: "ObjectCreationExpression", type: targetType, arguments: [], assignments: [{ kind: "AssignmentExpression", name: "Capacity", expression: count }] } });
      const append = (position: CsharpExpression, value: CsharpExpression): CsharpStatement => ({ kind: "ExpressionStatement", expression: jsElement === undefined
        ? { kind: "AssignmentExpression", left: elementAt(buffer, position), operatorToken: { kind: "EqualsToken" }, right: value }
        : { kind: "InvocationExpression", callee: { kind: "SimpleMemberAccessExpression", receiver: buffer, name: "Add" },
          arguments: [{ kind: "Argument", expression: value }] } });
      for (const [position, segment] of fixed.entries()) {
        const operand = sourceValue(segment.parameterIndex);
        const value = operand === undefined ? undefined : convert(operand, segment.adapter);
        if (value === undefined) return undefined;
        statements.push(append(literal(position), value));
      }
      if (sequence !== undefined) {
        const cursor = identifier(name(`__tsonic_rest_index${index}`));
        const operand = sourceValue(sequence.parameterIndex);
        const readIndex = sequence.offset === 0 ? cursor : binary(cursor, "PlusToken", literal(sequence.offset));
        const value = operand === undefined ? undefined : convert(elementAt(operand, readIndex), sequence.adapter);
        if (value === undefined) return undefined;
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
    if (operand === undefined) return undefined;
    if (adapter.kind === "value") {
      const value = convert(operand, adapter.adapter);
      if (value === undefined) return undefined;
      arguments_.push(value);
      continue;
    }
    const sourceLength = length(adapter.parameterIndex);
    const converted = convert(elementAt(operand, literal(adapter.offset)), adapter.adapter);
    const missing = implementationParameters[index]?.defaultValue;
    if (sourceLength === undefined || converted === undefined || adapter.optional && missing === undefined) return undefined;
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
