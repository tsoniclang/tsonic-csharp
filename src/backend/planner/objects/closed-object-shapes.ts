import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpPlanningContext } from "../context.js";
import type {
  CsharpObjectShapeFact,
  CsharpObjectShapeProjection,
  TargetTypeRef,
} from "../../../target-model/types/index.js";
import {
  csharpObjectShapeProjectionMethodName,
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
} from "../../target-ast/roslyn/index.js";
import {
  objectShapeStorageMemberName,
} from "./object-shape-storage.js";
import {
  csharpTypeFromTargetTypeRef,
} from "../types/target-types.js";

const stringTargetType = csharpStringTargetType();
const boolTargetType = csharpSourcePrimitiveTargetType("bool");
const stringType = { kind: "PredefinedType", name: "string" } as const;

export function renderObjectShapeProjectionMethods(
  input: CsharpPlanningContext,
  fact: CsharpObjectShapeFact,
  projections: readonly CsharpObjectShapeProjection[],
  diagnostics: TargetDiagnostic[],
): readonly CsharpMethodDeclaration[] {
  return projections.flatMap((projection) => {
    const result = renderObjectShapeProjectionMethod(input, fact, projection);
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

function renderObjectShapeProjectionMethod(
  input: CsharpPlanningContext,
  fact: CsharpObjectShapeFact,
  projection: CsharpObjectShapeProjection,
): ProjectionMethodResult {
  const returnType = csharpTypeFromTargetTypeRef(projection.resultType);
  if (returnType === undefined) {
    return rejected(
      `Closed object '${projection.kind}' projection has no renderable selected result type.`,
    );
  }
  const expression = renderProjectionExpression(input, fact, projection);
  if (expression.kind === "rejected") {
    return expression;
  }
  const assignment = projection.kind === "assign"
    ? renderAssignStatements(input, fact, projection)
    : undefined;
  if (assignment?.kind === "rejected") {
    return assignment;
  }
  const assignmentSourceType = projection.kind === "assign"
    ? csharpTypeFromTargetTypeRef(projection.sourceShape.targetType)
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
      name: csharpObjectShapeProjectionMethodName(projection),
      modifiers: ["public"],
      returnType,
      parameters: projection.kind === "has-own"
        ? [{ name: "key", type: stringType }]
        : projection.kind === "assign"
        ? [{ name: "source", type: assignmentSourceType! }]
        : [],
      body: {
        kind: "Block",
        statements: projection.kind === "assign"
          ? [
              ...(assignment?.kind === "resolved" ? assignment.statements : []),
              {
                kind: "ReturnStatement" as const,
                expression: { kind: "IdentifierName" as const, name: "this" },
              },
            ]
          : [{ kind: "ReturnStatement", expression: expression.expression }],
      },
    },
  };
}

function renderProjectionExpression(
  input: CsharpPlanningContext,
  fact: CsharpObjectShapeFact,
  projection: CsharpObjectShapeProjection,
):
  | { readonly kind: "resolved"; readonly expression: CsharpExpression }
  | { readonly kind: "rejected"; readonly reason: string } {
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
      for (const member of members) {
        const converted = convertClosedShapeValue(
          input,
          member.type,
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
      return jsArrayExpression(projection.resultType, elementType, values);
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
      for (const member of members) {
        const converted = convertClosedShapeValue(
          input,
          member.type,
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
      return jsArrayExpression(projection.resultType, elementType, entries);
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
        member.readonly === true ||
        member.accessor?.setter === false
      )) {
        return rejected("Object.assign requires exact writable data properties on the target carrier.");
      }
      return {
        kind: "resolved",
        expression: { kind: "IdentifierName", name: "this" },
      };
    }
  }
}

function renderAssignStatements(
  input: CsharpPlanningContext,
  fact: CsharpObjectShapeFact,
  projection: Extract<CsharpObjectShapeProjection, { readonly kind: "assign" }>,
):
  | { readonly kind: "resolved"; readonly statements: readonly CsharpStatement[] }
  | { readonly kind: "rejected"; readonly reason: string } {
  const pairs = csharpObjectShapeAssignmentMembers(fact, projection);
  if (pairs === undefined) {
    return rejected(
      "Object.assign does not carry one exact source-to-target field relation.",
    );
  }
  const statements: CsharpStatement[] = [];
  for (const pair of pairs) {
    const source: CsharpExpression = {
      kind: "SimpleMemberAccessExpression",
      receiver: { kind: "IdentifierName", name: "source" },
      name: objectShapeStorageMemberName(projection.sourceShape, pair.source),
    };
    const converted = convertClosedShapeValue(
      input,
      pair.source.type,
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
  collectionTargetType: TargetTypeRef,
  elementTargetType: TargetTypeRef,
  elements: readonly CsharpExpression[],
):
  | { readonly kind: "resolved"; readonly expression: CsharpExpression }
  | { readonly kind: "rejected"; readonly reason: string } {
  const collectionType = csharpTypeFromTargetTypeRef(collectionTargetType);
  const elementType = csharpTypeFromTargetTypeRef(elementTargetType);
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
    kind: "IdentifierName",
    name: objectShapeStorageMemberName(fact, member),
  };
}

function convertClosedShapeValue(
  input: CsharpPlanningContext,
  sourceType: TargetTypeRef,
  targetType: TargetTypeRef,
  expression: CsharpExpression,
):
  | { readonly kind: "resolved"; readonly expression: CsharpExpression }
  | { readonly kind: "rejected"; readonly reason: string } {
  return applyClosedShapeConversion(
    input.program.conversions.select(
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
  selection: CsharpConversionSelection,
  targetType: TargetTypeRef,
  expression: CsharpExpression,
):
  | { readonly kind: "resolved"; readonly expression: CsharpExpression }
  | { readonly kind: "rejected"; readonly reason: string } {
  switch (selection.kind) {
    case "identity":
      return { kind: "resolved", expression };
    case "implicit":
      if (selection.proof !== "runtime-union-arm") {
        return { kind: "resolved", expression };
      }
      {
        const declaringType = csharpTypeFromTargetTypeRef(targetType);
        if (declaringType === undefined) {
          return rejected("Runtime-union result carrier is not renderable.");
        }
        const arm = applyClosedShapeConversion(
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
      const declaringType = csharpTypeFromTargetTypeRef(csharpTsValueTargetType());
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
