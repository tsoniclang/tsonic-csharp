import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { TargetTypeRef } from "../../../../target-model/types/model.js";
import type { CsharpExpression, CsharpStatement, CsharpTypeNode } from "../../../target-ast/roslyn/index.js";
import type { CsharpPlanningContext } from "../../context.js";
import { unsupportedNodeDiagnostic } from "../../diagnostics.js";
import type { ArrayLiteralPlanner } from "./types.js";
import { planCsharpArraySpreadInput, type CsharpPlannedArraySpreadInput } from "./spread-source.js";
import { planCsharpBorrowedDenseSequence } from "./borrowed-dense.js";
import { planCsharpSequenceAppendStatements, planCsharpSequenceLength, planCsharpSequenceValue } from "../sequence-conversions.js";
import { csharpPlannedValue, csharpPlannedExpressionIsStable, type CsharpPlannedValue } from "../planned-values.js";
import { composeCsharpPlannedValues } from "../planned-value-composition.js";
import { csharpTypeFromTargetTypeRef } from "../../types/target-types.js";
import { selectCsharpCollectionElementRead } from "../../../../target-model/types/collection-reads.js";

interface Contribution {
  readonly node: Node;
  readonly value: CsharpPlannedValue;
  readonly spread?: CsharpPlannedArraySpreadInput["source"];
}

export function planCsharpArrayConstruction(
  node: Node, sourceFile: SourceFile, input: CsharpPlanningContext, diagnostics: TargetDiagnostic[],
  elementType: CsharpTypeNode, elementTarget: TargetTypeRef, planner: ArrayLiteralPlanner,
  construction?: { readonly carrier: TargetTypeRef; readonly type: CsharpTypeNode;
    readonly builder: { readonly capacityConstructor: boolean; readonly appendElementMethod: string } },
): CsharpPlannedValue | undefined {
  const elements = input.program.source.ast.elements(node);
  const sole = elements.length === 1 ? elements[0] : undefined;
  const soleOperand = sole === undefined || !input.program.source.ast.is.IsSpreadElement(sole)
    ? undefined : input.program.source.ast.as.AsSpreadElement(sole)?.Expression;
  const soleBorrowed = soleOperand === undefined ? undefined : input.program.operations.borrowedSequence(soleOperand);
  if (construction === undefined && sole !== undefined && soleBorrowed !== undefined) {
    return planCsharpBorrowedDenseSequence(sole, soleBorrowed, sourceFile, input, diagnostics,
      elementType, elementTarget, planner.planExpression);
  }
  const contributions: Contribution[] = [];
  for (const element of elements) {
    if (element === undefined) return undefined;
    if (!input.program.source.ast.is.IsSpreadElement(element)) {
      const value = planner.planExpressionWithExpectedType(element, sourceFile, input, diagnostics, elementType, undefined, elementTarget);
      if (value === undefined) return undefined;
      contributions.push({ node: element, value });
      continue;
    }
    const operand = input.program.source.ast.as.AsSpreadElement(element)?.Expression;
    if (operand === undefined) return undefined;
    const selected = input.program.operations.borrowedSequence(operand);
    const borrowed = selected?.inputs.length === 1 && selected.inputs[0]?.kind === "sequence" &&
      !selected.inputs[0].optional ? undefined : selected;
    const spread = borrowed === undefined ? planCsharpArraySpreadInput(element, operand, sourceFile,
      input, diagnostics, elementTarget, planner.planExpression) : undefined;
    const value = borrowed === undefined ? spread : planCsharpBorrowedDenseSequence(element, borrowed,
      sourceFile, input, diagnostics, elementType, elementTarget, planner.planExpression);
    if (value === undefined) return undefined;
    const source = spread?.source ?? { carrier: { kind: "array" as const, element: elementTarget },
      type: { kind: "ArrayType" as const, elementType }, lengthMember: "Length",
      elements: [{ carrier: elementTarget, type: elementType, conversion: { kind: "identity" as const } }],
    };
    contributions.push({ node: element, value, spread: source });
  }
  const carrier: TargetTypeRef = construction?.carrier ?? { kind: "array", element: elementTarget };
  const type: CsharpTypeNode = construction?.type ?? { kind: "ArrayType", elementType };
  const nativeCollection = construction === undefined && contributions.every(contribution => contribution.spread === undefined ||
    contribution.spread.elements.every(element => element.conversion.kind === "identity") &&
      selectCsharpCollectionElementRead(contribution.spread.carrier)?.kind !== "method" && contribution.spread.carrier.kind !== "tuple");
  if (nativeCollection) {
    const ordered = contributions.map((contribution, index) => {
      if (contribution.spread === undefined || !contributions.slice(index + 1).some(later => later.value.prelude.length !== 0)) return contribution.value;
      return planCsharpSequenceValue(contribution.node, { ...contribution.value, source: contribution.spread }, sourceFile,
        input, diagnostics, elementType, elementTarget);
    });
    return composeCsharpPlannedValues(node, sourceFile, input, diagnostics, ordered, values => csharpPlannedValue(carrier, {
      kind: "CastExpression", type, expression: { kind: "CollectionExpression", elements: values.map((expression, index) =>
        contributions[index]!.spread === undefined ? { kind: "ExpressionElement", expression } : { kind: "SpreadElement", expression }) },
    }));
  }
  const resultName = input.names.temporaryName("__tsonic_collection");
  const receiver: CsharpExpression = { kind: "IdentifierName", name: resultName };
  const prelude: CsharpStatement[] = [];
  const consumed: Contribution[] = [];
  for (const [index, contribution] of contributions.entries()) {
    let value = contribution.value;
    if (contribution.spread !== undefined && contributions.slice(index + 1).some(later =>
      later.value.prelude.length !== 0 || later.value.completion.kind !== "value" || !csharpPlannedExpressionIsStable(later.value.completion.expression))) {
      const snapshot = planCsharpSequenceValue(contribution.node, { ...value, source: contribution.spread },
        sourceFile, input, diagnostics, elementType, elementTarget);
      if (snapshot === undefined) return undefined;
      value = snapshot;
      consumed.push({ node: contribution.node, value, spread: { carrier: { kind: "array", element: elementTarget },
        type: { kind: "ArrayType", elementType }, lengthMember: "Length",
        elements: [{ carrier: elementTarget, type: elementType, conversion: { kind: "identity" } }],
      } });
    } else consumed.push(contribution);
    prelude.push(...value.prelude);
    if (value.completion.kind === "never") return { prelude, completion: value.completion };
    if (value.completion.kind !== "value") return undefined;
    const sourceType = csharpTypeFromTargetTypeRef(value.completion.carrier, input.scope.typeParameterNames);
    if (sourceType === undefined) return undefined;
    const name = input.names.temporaryName("__tsonic_collection_input");
    const captured = csharpPlannedValue(value.completion.carrier, { kind: "IdentifierName", name });
    consumed[consumed.length - 1] = { ...consumed[consumed.length - 1]!, value: captured };
    prelude.push({ kind: "LocalDeclarationStatement", name, type: sourceType, initializer: value.completion.expression });
  }
  let size: CsharpExpression = { kind: "LiteralExpression", value: 0 };
  for (const contribution of consumed) {
    const value = contribution.value.completion;
    if (value.kind !== "value") return undefined;
    const length = contribution.spread === undefined ? { kind: "LiteralExpression" as const, value: 1 }
      : planCsharpSequenceLength(contribution.spread, value.expression);
    if (length === undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(contribution.node, "Native construction requires the finalized source length."));
      return undefined;
    }
    size = { kind: "BinaryExpression", left: size, operatorToken: { kind: "PlusToken" }, right: length };
  }
  prelude.push({ kind: "LocalDeclarationStatement", name: resultName, type, initializer: construction === undefined
    ? { kind: "ArrayCreationExpression", elementType, elements: [], size: { kind: "CheckedExpression", expression: size } }
    : { kind: "ObjectCreationExpression", type, arguments: construction.builder.capacityConstructor
      ? [{ kind: "Argument", expression: { kind: "CheckedExpression", expression: size } }] : [] } });
  const position = input.names.temporaryName("__tsonic_collection_position");
  if (construction === undefined) prelude.push({ kind: "LocalDeclarationStatement", name: position,
    type: { kind: "PredefinedType", name: "int" }, initializer: { kind: "LiteralExpression", value: 0 } });
  const append = (expression: CsharpExpression): CsharpStatement => ({ kind: "ExpressionStatement", expression: construction === undefined
    ? { kind: "AssignmentExpression", left: { kind: "ElementAccessExpression", receiver, arguments: [{
        kind: "PostfixUnaryExpression", operand: { kind: "IdentifierName", name: position }, operatorToken: { kind: "PlusPlusToken" },
      }] }, operatorToken: { kind: "EqualsToken" }, right: expression }
    : { kind: "InvocationExpression", callee: { kind: "SimpleMemberAccessExpression", receiver, name: construction.builder.appendElementMethod },
        arguments: [{ kind: "Argument", expression }] } });
  for (const contribution of consumed) {
    if (contribution.value.completion.kind !== "value") return undefined;
    if (contribution.spread === undefined) prelude.push(append(contribution.value.completion.expression));
    else {
      const statements = planCsharpSequenceAppendStatements(contribution.node,
        { ...contribution.spread, expression: contribution.value.completion.expression }, contribution.value.completion.expression,
        sourceFile, input, diagnostics, elementTarget, append);
      if (statements === undefined) return undefined;
      prelude.push(...statements);
    }
  }
  return csharpPlannedValue(carrier, receiver, prelude);
}
