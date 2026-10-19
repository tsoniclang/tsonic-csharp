import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpPlanningContext } from "../context.js";
import { planCsharpEmptyRecordConversion } from "../expressions/empty-record-conversion.js";
import type {
  CsharpObjectShapeFact,
  TargetTypeRef,
} from "../../../target-model/types/index.js";
import {
  csharpObjectShapeAssignmentMembers,
  csharpObjectShapeProjectionMembers,
  csharpSourcePrimitiveTargetType,
  csharpStringTargetType,
  csharpTsValueTargetType,
  getCsharpJsArrayElementTargetType,
  targetTypeRefEquals,
} from "../../../target-model/types/index.js";
import type {
  CsharpConversionSelection,
} from "../../../analysis/conversions/index.js";
import type {
  CsharpExpression,
  CsharpMethodDeclaration,
  CsharpStatement,
} from "../../target-ast/syntax/index.js";
import {
  objectShapeStorageMemberName,
} from "../../../target-model/names/object-members.js";
import {
  csharpTypeFromTargetTypeRef,
} from "../types/target-types.js";
import type { CsharpObjectShapeProjectionDeclaration } from "../../../target-model/records/object-shape-demand.js";
import { csharpGenericConstraintFromTargetTypeParameterConstraint } from "../types/type-parameters.js";
import type { CsharpTypeParameter } from "../../target-ast/syntax/index.js";
import { qualifiedCsharpType } from "../types/csharp-type-primitives.js";
import type { CsharpNamePlan } from "../../../target-model/names/model.js";
import { planCsharpArtifactMemberHiding } from "../declarations/modifiers.js";

const stringTargetType = csharpStringTargetType();
const boolTargetType = csharpSourcePrimitiveTargetType("bool");
const stringType = { kind: "PredefinedType", name: "string" } as const;

export function renderObjectShapeProjectionMethods(
  input: CsharpPlanningContext,
  projections: readonly CsharpObjectShapeProjectionDeclaration[],
  diagnostics: TargetDiagnostic[],
): readonly CsharpMethodDeclaration[] {
  return projections.flatMap((projection) => {
    const result = renderObjectShapeProjectionMethod(input.scope.typeParameterNames, projection, input.program.names);
    if (result.kind === "rejected") {
      diagnostics.push({
        code: "CSHARP_OBJECT_SHAPE_PROJECTION_NOT_CLOSED",
        category: "error",
        source: "tsonic-csharp",
        message: result.reason,
      });
      return [];
    }
    return [result.method];
  });
}

type ProjectionMethodResult =
  | { readonly kind: "resolved"; readonly method: CsharpMethodDeclaration }
  | { readonly kind: "rejected"; readonly reason: string };

export function renderObjectShapeProjectionMethod(
  names: ReadonlyMap<string, string> | undefined,
  declaration: CsharpObjectShapeProjectionDeclaration,
  memberNames: CsharpNamePlan,
): ProjectionMethodResult {
  const fact = declaration.receiver;
  const projection = declaration.selection;
  const typeParameterNames = new Map([...names ?? [], ...declaration.typeParameterNames.map(parameter => [parameter.identity, parameter.name] as const)]);
  const input = { scope: { typeParameterNames } };
  const returnType = csharpTypeFromTargetTypeRef(projection.resultType, input.scope.typeParameterNames);
  if (returnType === undefined) {
    return rejected(
      `Closed object '${projection.kind}' projection has no renderable selected result type.`,
    );
  }
  const receiverType = csharpTypeFromTargetTypeRef(fact.targetType, typeParameterNames);
  if (receiverType === undefined) return rejected("An admitted object projection requires its exact native receiver carrier.");
  const typeParameters: CsharpTypeParameter[] = [];
  for (const parameter of declaration.typeParameters) {
    const selected = parameter.csharpConstraints;
    if (selected?.kind !== "resolved") return rejected("An admitted object projection requires exact native generic constraints.");
    const constraints = selected.constraints.map(constraint => csharpGenericConstraintFromTargetTypeParameterConstraint(
      typeParameterNames, constraint, parameter.csharpDeclaration!, []));
    if (constraints.some(constraint => constraint === undefined)) return rejected("An admitted object projection constraint must be renderable.");
    typeParameters.push({ name: typeParameterNames.get(parameter.identity)!,
      ...(constraints.length === 0 ? {} : { constraints: constraints as NonNullable<typeof constraints[number]>[] }) });
  }
  const expression = renderProjectionExpression(input, declaration);
  if (expression.kind === "rejected") {
    return expression;
  }
  const assignment = projection.kind === "assign"
    ? renderAssignStatements(input, declaration)
    : undefined;
  if (assignment?.kind === "rejected") {
    return assignment;
  }
  const assignmentSourceType = projection.kind === "assign"
    ? csharpTypeFromTargetTypeRef(projection.sourceShape.targetType, input.scope.typeParameterNames)
    : undefined;
  if (projection.kind === "assign" && assignmentSourceType === undefined) {
    return rejected(
      "Closed object assignment source has no renderable selected carrier.",
    );
  }
  return {
    kind: "resolved",
    method: {
      kind: "MethodDeclaration",
      name: declaration.methodName,
      modifiers: [...planCsharpArtifactMemberHiding(memberNames, fact, declaration.methodName), "public", "static"],
      ...(typeParameters.length === 0 ? {} : { typeParameters }),
      returnType,
      parameters: [{ name: "receiver", type: receiverType }, ...(projection.kind === "has-own"
        ? [{ name: "key", type: stringType }]
        : projection.kind === "assign"
        ? [{ name: "source", type: assignmentSourceType! }]
        : [])],
      body: {
        kind: "Block",
        statements: [
          ...(declaration.receiverRequiresNullCheck ? [{
            kind: "IfStatement" as const,
            condition: { kind: "NullPatternExpression" as const,
              expression: { kind: "IdentifierName" as const, name: "receiver" }, negated: false },
            thenBody: { kind: "Block" as const, statements: [{ kind: "ThrowStatement" as const,
              expression: { kind: "ObjectCreationExpression" as const,
                type: qualifiedCsharpType("System", "NullReferenceException"), arguments: [] } }] },
          }] : []),
          ...(projection.kind === "assign"
          ? [
              ...(assignment?.kind === "resolved" ? assignment.statements : []),
              {
                kind: "ReturnStatement" as const,
                expression: { kind: "IdentifierName" as const, name: "receiver" },
              },
            ]
          : [{ kind: "ReturnStatement" as const, expression: expression.expression }]),
        ],
      },
    },
  };
}

function renderProjectionExpression(
  input: Pick<CsharpPlanningContext, "scope">,
  declaration: CsharpObjectShapeProjectionDeclaration,
):
  | { readonly kind: "resolved"; readonly expression: CsharpExpression }
  | { readonly kind: "rejected"; readonly reason: string } {
  const fact = declaration.receiver;
  const projection = declaration.selection;
  const members = projection.kind === "assign"
    ? csharpObjectShapeAssignmentMembers(fact, projection)?.map((pair) => pair.target)
    : csharpObjectShapeProjectionMembers(fact, projection);
  if (members === undefined) {
    return rejected(
      `Closed object '${projection.kind}' projection does not identify every exact own member once.`,
    );
  }
  switch (projection.kind) {
    case "keys": {
      const elementType = getCsharpJsArrayElementTargetType(projection.resultType);
      if (elementType === undefined || !targetTypeRefEquals(elementType, stringTargetType)) {
        return rejected("Object.keys requires an exact JS string-array result carrier.");
      }
      return jsArrayExpression(
        input.scope.typeParameterNames,
        projection.resultType,
        elementType,
        members.map((member): CsharpExpression => ({
          kind: "LiteralExpression",
          value: member.sourceName,
        })),
      );
    }
    case "values": {
      const elementType = getCsharpJsArrayElementTargetType(projection.resultType);
      if (elementType === undefined) {
        return rejected("Object.values requires an exact JS-array result carrier.");
      }
      const values: CsharpExpression[] = [];
      for (const [index, member] of members.entries()) {
        const converted = applyClosedShapeConversion(
          input.scope.typeParameterNames,
          declaration.conversions[index]!.selection,
          elementType,
          memberExpression(fact, member),
        );
        if (converted.kind === "rejected") {
          return rejected(
            `Object.values member '${member.sourceName}' is not closed: ${converted.reason}`,
          );
        }
        values.push(converted.expression);
      }
      return jsArrayExpression(input.scope.typeParameterNames, projection.resultType, elementType, values);
    }
    case "entries": {
      const elementType = getCsharpJsArrayElementTargetType(projection.resultType);
      if (
        elementType?.kind !== "tuple" ||
        elementType.elements.length !== 2 ||
        !targetTypeRefEquals(elementType.elements[0]!, stringTargetType)
      ) {
        return rejected(
          "Object.entries requires an exact JS array of [string, value] tuples.",
        );
      }
      const valueType = elementType.elements[1]!;
      const entries: CsharpExpression[] = [];
      for (const [index, member] of members.entries()) {
        const converted = applyClosedShapeConversion(
          input.scope.typeParameterNames,
          declaration.conversions[index]!.selection,
          valueType,
          memberExpression(fact, member),
        );
        if (converted.kind === "rejected") {
          return rejected(
            `Object.entries member '${member.sourceName}' is not closed: ${converted.reason}`,
          );
        }
        entries.push({
          kind: "TupleExpression",
          elements: [
            { kind: "LiteralExpression", value: member.sourceName },
            converted.expression,
          ],
        });
      }
      return jsArrayExpression(input.scope.typeParameterNames, projection.resultType, elementType, entries);
    }
    case "has-own": {
      if (!targetTypeRefEquals(projection.resultType, boolTargetType)) {
        return rejected("Object.hasOwn requires an exact boolean result carrier.");
      }
      const comparisons = members.map((member): CsharpExpression => ({
        kind: "BinaryExpression",
        left: { kind: "IdentifierName", name: "key" },
        operatorToken: { kind: "EqualsEqualsToken" },
        right: { kind: "LiteralExpression", value: member.sourceName },
      }));
      return {
        kind: "resolved",
        expression: comparisons.reduce<CsharpExpression>(
          (left, right) => ({
            kind: "BinaryExpression",
            left,
            operatorToken: { kind: "BarBarToken" },
            right,
          }),
          { kind: "LiteralExpression", value: false },
        ),
      };
    }
    case "assign": {
      if (!targetTypeRefEquals(projection.resultType, fact.targetType)) {
        return rejected("Object.assign requires its selected result and target carrier to be identical.");
      }
      if (members.some((member) =>
        member.memberKind !== "property" ||
        member.accessor?.setter === false
      )) {
        return rejected("Object.assign requires exact writable data properties on the target carrier.");
      }
      return {
        kind: "resolved",
        expression: { kind: "IdentifierName", name: "receiver" },
      };
    }
  }
}

function renderAssignStatements(
  input: Pick<CsharpPlanningContext, "scope">,
  declaration: CsharpObjectShapeProjectionDeclaration,
):
  | { readonly kind: "resolved"; readonly statements: readonly CsharpStatement[] }
  | { readonly kind: "rejected"; readonly reason: string } {
  const fact = declaration.receiver;
  const projection = declaration.selection;
  if (projection.kind !== "assign") return rejected("Object.assign requires its admitted assignment projection.");
  const pairs = csharpObjectShapeAssignmentMembers(fact, projection);
  if (pairs === undefined) {
    return rejected(
      "Object.assign does not carry one exact source-to-target field relation.",
    );
  }
  const statements: CsharpStatement[] = [];
  for (const [index, pair] of pairs.entries()) {
    const source: CsharpExpression = {
      kind: "SimpleMemberAccessExpression",
      receiver: { kind: "IdentifierName", name: "source" },
      name: objectShapeStorageMemberName(projection.sourceShape, pair.source),
    };
    const converted = applyClosedShapeConversion(
      input.scope.typeParameterNames,
      declaration.conversions[index]!.selection,
      pair.target.type,
      source,
    );
    if (converted.kind === "rejected") {
      return rejected(
        `Object.assign source member '${pair.source.sourceName}' cannot be stored in its exact target member: ${converted.reason}`,
      );
    }
    statements.push({
      kind: "ExpressionStatement",
      expression: {
        kind: "AssignmentExpression",
        left: memberExpression(fact, pair.target),
        operatorToken: { kind: "EqualsToken" },
        right: converted.expression,
      },
    });
  }
  return { kind: "resolved", statements };
}

function jsArrayExpression(
  typeParameterNames: ReadonlyMap<string, string> | undefined,
  collectionTargetType: TargetTypeRef,
  elementTargetType: TargetTypeRef,
  elements: readonly CsharpExpression[],
):
  | { readonly kind: "resolved"; readonly expression: CsharpExpression }
  | { readonly kind: "rejected"; readonly reason: string } {
  const collectionType = csharpTypeFromTargetTypeRef(collectionTargetType, typeParameterNames);
  const elementType = csharpTypeFromTargetTypeRef(elementTargetType, typeParameterNames);
  if (collectionType === undefined || elementType === undefined) {
    return rejected("Closed object projection array types are not renderable in C#.");
  }
  return {
    kind: "resolved",
    expression: {
      kind: "ObjectCreationExpression",
      type: collectionType,
      arguments: [{
        kind: "Argument",
        expression: {
          kind: "ArrayCreationExpression",
          elementType,
          elements,
        },
      }],
    },
  };
}

function memberExpression(
  fact: CsharpObjectShapeFact,
  member: CsharpObjectShapeFact["members"][number],
): CsharpExpression {
  return {
    kind: "SimpleMemberAccessExpression",
    receiver: { kind: "IdentifierName", name: "receiver" },
    name: objectShapeStorageMemberName(fact, member),
  };
}

export function convertClosedShapeValue(
  input: CsharpPlanningContext,
  sourceType: TargetTypeRef,
  targetType: TargetTypeRef,
  expression: CsharpExpression,
):
  | { readonly kind: "resolved"; readonly expression: CsharpExpression }
  | { readonly kind: "rejected"; readonly reason: string } {
  return applyClosedShapeConversion(
    input.scope.typeParameterNames,
    input.program.records.conversion.get(
      sourceType,
      targetType,
      "implicit",
    ) ?? {
      kind: "rejected",
      reason:
        "Closed object-shape planning requires a sealed target conversion classification that analysis did not produce.",
    },
    targetType,
    expression,
  );
}

function applyClosedShapeConversion(
  typeParameterNames: ReadonlyMap<string, string> | undefined,
  selection: CsharpConversionSelection,
  targetType: TargetTypeRef,
  expression: CsharpExpression,
):
  | { readonly kind: "resolved"; readonly expression: CsharpExpression }
  | { readonly kind: "rejected"; readonly reason: string } {
  switch (selection.kind) {
    case "identity":
      return { kind: "resolved", expression };
    case "empty-record": {
      const converted = planCsharpEmptyRecordConversion(typeParameterNames, selection, selection.source, targetType, expression);
      return converted === undefined ? rejected("The empty-record conversion has mismatched carriers.")
        : { kind: "resolved", expression: converted };
    }
    case "implicit":
      if (selection.proof !== "runtime-union-arm") {
        return { kind: "resolved", expression };
      }
      {
        const declaringType = csharpTypeFromTargetTypeRef(targetType, typeParameterNames);
        if (declaringType === undefined) {
          return rejected("Runtime-union result carrier is not renderable.");
        }
        const arm = applyClosedShapeConversion(
          typeParameterNames,
          selection.sourceToArm,
          selection.armType,
          expression,
        );
        return arm.kind === "rejected"
          ? arm
          : {
              kind: "resolved",
              expression: {
                kind: "InvocationExpression",
                callee: {
                  kind: "SimpleMemberAccessExpression",
                  receiver: declaringType,
                  name: `From${selection.armIndex + 1}`,
                },
                arguments: [{ kind: "Argument", expression: arm.expression }],
              },
            };
      }
    case "js-value-box": {
      const declaringType = csharpTypeFromTargetTypeRef(csharpTsValueTargetType(), typeParameterNames);
      return declaringType === undefined
        ? rejected("The TsValue carrier is not renderable.")
        : {
            kind: "resolved",
            expression: {
              kind: "InvocationExpression",
              callee: {
                kind: "SimpleMemberAccessExpression",
                receiver: declaringType,
                name: "from",
              },
              arguments: [{ kind: "Argument", expression }],
            },
          };
    }
    case "ambiguous":
    case "rejected":
      return rejected(selection.reason);
    default:
      return rejected(
        `Selected conversion '${selection.kind}' requires source-expression evidence unavailable to a generated object projection.`,
      );
  }
}

function rejected(reason: string): { readonly kind: "rejected"; readonly reason: string } {
  return { kind: "rejected", reason };
}
