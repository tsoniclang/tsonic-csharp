import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { TargetTypeRef, CsharpTargetNamedTypeRef } from "../../../target-model/types/index.js";
import { csharpTupleElementMemberName, getCsharpReadOnlyIndexableCollectionElementTargetType } from "../../../target-model/types/index.js";
import type { CsharpExpression, CsharpParameter, CsharpStatement, CsharpTypeNode } from "../../target-ast/roslyn/index.js";
import type { CsharpPlanningContext } from "../context.js";
import { unsupportedNodeDiagnostic } from "../diagnostics.js";
import { planCsharpGeneratedMethodCall } from "../declarations/generated-methods.js";
import { applyCsharpConversionSelection } from "./conversions.js";
import type { ArrayLiteralPlanner } from "./array-literals/types.js";
import { planCsharpCollectionElementRead } from "./collection-reads.js";
import { planCsharpArraySpreadInput, type CsharpArraySpreadInput } from "./array-literals/spread-source.js";

type SpreadContribution = { readonly kind: "spread"; readonly node: Node; readonly source: CsharpArraySpreadInput };
type Contribution = SpreadContribution | { readonly kind: "value"; readonly expression: CsharpExpression };
type Construction = { readonly type: CsharpTypeNode; readonly builder: NonNullable<CsharpTargetNamedTypeRef["csharpArrayLiteralBuilder"]> };

export function planCsharpDenseSequenceConstruction(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  elementType: CsharpTypeNode,
  elementTarget: TargetTypeRef | undefined,
  planner: ArrayLiteralPlanner,
  construction?: Construction,
): CsharpExpression | undefined {
  if (elementTarget === undefined) return reject(node, diagnostics, "Dense array spread requires its exact destination element carrier.");
  const contributions: Contribution[] = [];
  for (const element of input.program.source.ast.elements(node)) {
    if (element === undefined) return reject(node, diagnostics, "Dense array spread requires every authored contribution.");
    if (input.program.source.ast.is.IsSpreadElement(element)) {
      const operand = input.program.source.ast.as.AsSpreadElement(element)?.Expression;
      const source = operand === undefined ? undefined : planCsharpArraySpreadInput(element, operand,
        sourceFile, input, diagnostics, elementTarget, planner.planExpression);
      if (source === undefined) return undefined;
      if (source.carrier.kind !== "tuple" && source.lengthMember === undefined) {
        return reject(element, diagnostics, "Dense native array construction requires a finalized native sequence length.");
      }
      contributions.push({ kind: "spread", node: element, source });
    } else {
      const expression = planner.planExpressionWithExpectedType(element, sourceFile, input, diagnostics, elementType, undefined, elementTarget);
      if (expression === undefined) return undefined;
      contributions.push({ kind: "value", expression });
    }
  }
  return planSequenceConstruction(node, contributions, sourceFile, input, diagnostics, elementType, elementTarget, construction);
}

export function planCsharpSequenceValue(
  node: Node,
  source: CsharpArraySpreadInput,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  elementType: CsharpTypeNode,
  elementTarget: TargetTypeRef,
): CsharpExpression | undefined {
  if (source.carrier.kind !== "tuple" && source.lengthMember === undefined) {
    return reject(node, diagnostics, "Native sequence construction requires its finalized native length.");
  }
  return planSequenceConstruction(node, [{ kind: "spread", node, source }], sourceFile, input, diagnostics, elementType, elementTarget);
}

function planSequenceConstruction(
  node: Node,
  contributions: readonly Contribution[],
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  elementType: CsharpTypeNode,
  elementTarget: TargetTypeRef,
  construction?: Construction,
): CsharpExpression | undefined {
  const parameters: CsharpParameter[] = contributions.map((contribution, index) => ({ name: `source${index}`,
    type: contribution.kind === "value" ? elementType : contribution.source.type }));
  let length: CsharpExpression = { kind: "LiteralExpression", value: 0 };
  for (const [index, contribution] of contributions.entries()) length = { kind: "BinaryExpression", operatorToken: { kind: "PlusToken" },
    left: length, right: contribution.kind === "value" ? { kind: "LiteralExpression", value: 1 }
      : spreadLength(contribution.source, identifier(parameters[index]!.name))! };
  const returnType: CsharpTypeNode = construction?.type ?? { kind: "ArrayType", elementType };
  const destination = identifier("result");
  const statements: CsharpStatement[] = [
    { kind: "LocalDeclarationStatement", name: "result", type: returnType,
      initializer: construction === undefined ? { kind: "ArrayCreationExpression", elementType, elements: [], size: { kind: "CheckedExpression", expression: length } }
        : { kind: "ObjectCreationExpression", type: returnType, arguments: construction.builder.capacityConstructor
          ? [{ kind: "Argument", expression: { kind: "CheckedExpression", expression: length } }] : [] } },
  ];
  if (construction === undefined) statements.push({ kind: "LocalDeclarationStatement", name: "position",
    type: { kind: "PredefinedType", name: "int" }, initializer: { kind: "LiteralExpression", value: 0 } });
  const append = (value: CsharpExpression): CsharpStatement => construction !== undefined
    ? { kind: "ExpressionStatement", expression: invoke(destination, construction.builder.appendElementMethod, [value]) }
    : ({ kind: "ExpressionStatement", expression: {
    kind: "AssignmentExpression", operatorToken: { kind: "EqualsToken" },
    left: { kind: "ElementAccessExpression", receiver: destination, arguments: [{ kind: "PostfixUnaryExpression",
      operand: identifier("position"), operatorToken: { kind: "PlusPlusToken" } }] }, right: value,
  } });
  for (const [index, contribution] of contributions.entries()) {
    const source = identifier(parameters[index]!.name);
    if (contribution.kind === "value") statements.push(append(source));
    else if (construction === undefined && contribution.source.carrier.kind === "array" && contribution.source.elements[0]?.conversion.kind === "identity") {
      statements.push({ kind: "ExpressionStatement", expression: invoke({ kind: "QualifiedName",
        left: { kind: "IdentifierName", name: "System" }, name: "Array" }, "Copy",
        [source, { kind: "LiteralExpression", value: 0 }, destination, identifier("position"), spreadLength(contribution.source, source)!]) },
      { kind: "ExpressionStatement", expression: { kind: "AssignmentExpression", operatorToken: { kind: "PlusEqualsToken" },
        left: identifier("position"), right: spreadLength(contribution.source, source)! } });
    }
    else {
      const spread = planCsharpSequenceAppendStatements(contribution.node, contribution.source, source, sourceFile, input, diagnostics, elementTarget, append);
      if (spread === undefined) return undefined;
      statements.push(...spread);
    }
  }
  statements.push({ kind: "ReturnStatement", expression: destination });
  return planCsharpGeneratedMethodCall(node, construction === undefined ? "array_spread" : "collection_literal", returnType, parameters, { kind: "Block", statements },
    contributions.map(contribution => ({ kind: "Argument", expression: contribution.kind === "value" ? contribution.expression : contribution.source.expression })),
    input, diagnostics);
}

export function planCsharpJsArraySpreadAppend(
  node: Node,
  operand: Node,
  destination: CsharpExpression,
  collectionType: CsharpTypeNode,
  elementTarget: TargetTypeRef,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planner: ArrayLiteralPlanner,
): CsharpExpression | undefined {
  const source = planCsharpArraySpreadInput(node, operand, sourceFile, input, diagnostics, elementTarget, planner.planExpression);
  if (source === undefined) return undefined;
  if (source.carrier.kind !== "tuple" && source.elements.every(element => element.conversion.kind === "identity")) {
    return invoke(destination, "AppendSequence", [source.expression]);
  }
  const destinationName = identifier("destination");
  const sourceName = identifier("source");
  const statements: CsharpStatement[] = [];
  const length = spreadLength(source, sourceName);
  if (length !== undefined) statements.push({ kind: "ExpressionStatement", expression: invoke(destinationName, "EnsureCapacity", [{
    kind: "CheckedExpression", expression: { kind: "BinaryExpression", operatorToken: { kind: "PlusToken" },
      left: { kind: "SimpleMemberAccessExpression", receiver: destinationName, name: "Count" }, right: length },
  }]) });
  const spread = planCsharpSequenceAppendStatements(node, source, sourceName, sourceFile, input, diagnostics, elementTarget,
    value => ({ kind: "ExpressionStatement", expression: invoke(destinationName, "Add", [value]) }));
  if (spread === undefined) return undefined;
  statements.push(...spread, { kind: "ReturnStatement", expression: destinationName });
  return planCsharpGeneratedMethodCall(node, "array_append", collectionType,
    [{ name: "destination", type: collectionType }, { name: "source", type: source.type }], { kind: "Block", statements },
    [{ kind: "Argument", expression: destination }, { kind: "Argument", expression: source.expression }], input, diagnostics);
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
    const index = identifier("index");
    const read = planCsharpCollectionElementRead(source.carrier, receiver, index, input.scope.typeParameterNames);
    if (read === undefined) return reject(node, diagnostics, "Native sequence read lost its finalized indexed member contract.");
    const value = convert(read, 0);
    return value === undefined ? undefined : [{ kind: "ForStatement",
      initializer: { kind: "VariableDeclaration", locals: [{ kind: "VariableDeclarator", name: "index",
        type: { kind: "PredefinedType", name: "int" }, initializer: { kind: "LiteralExpression", value: 0 } }] },
      condition: { kind: "BinaryExpression", operatorToken: { kind: "LessThanToken" }, left: index, right: spreadLength(source, receiver)! },
      incrementors: [{ kind: "PostfixUnaryExpression", operand: index, operatorToken: { kind: "PlusPlusToken" } }],
      body: { kind: "Block", statements: [append(value)] } }];
  }
  const value = convert(identifier("value"), 0);
  return value === undefined ? undefined : [{ kind: "ForEachStatement", itemType: source.elements[0]!.type,
    itemName: "value", collection: receiver, body: { kind: "Block", statements: [append(value)] } }];
}

function spreadLength(source: CsharpArraySpreadInput, receiver: CsharpExpression): CsharpExpression | undefined {
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
