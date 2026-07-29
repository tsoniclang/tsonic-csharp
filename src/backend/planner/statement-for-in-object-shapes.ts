import type { CsharpTranslationContext } from "../../translate/context/index.js";
import {
  AsForInOrOfStatement,
} from "./source-ast.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type {
  TargetDiagnostic,
} from "@tsonic/target-api";
import type {
  CsharpExpression,
  CsharpStatement,
} from "../roslyn/syntax.js";
import {
  predefined,
  sameCsharpType,
} from "./csharp-types.js";
import {
  unsupportedNodeDiagnostic,
} from "./diagnostics.js";
import {
  allocateForInNames,
} from "./bindings.js";
import type {
  DestructuringPlannerState,
} from "./bindings.js";
import {
  planExpression,
} from "./expressions.js";
import {
  csharpTypeFromTargetTypeRef,
} from "./target-types.js";
import type {
  CsharpResolvedIteration,
} from "../../policy/operations/index.js";
import type {
  NestedStatementPlanner,
} from "./statement-nested-planner.js";
import type {
  PlannedForInBinding,
} from "./statement-for-in-binding.js";
import {
  getForInKeyType,
  planForInKeyBindingStatementFromExpression,
} from "./statement-for-in-binding.js";

export function planObjectShapeForInStatement(
  statementNode: Node,
  statement: NonNullable<ReturnType<typeof AsForInOrOfStatement>>,
  binding: PlannedForInBinding,
  selectedIteration: Extract<
    CsharpResolvedIteration,
    {
      readonly iterationKind: "for-in";
      readonly lowering: { readonly kind: "object-shape-keys" };
    }
  >,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  planNestedStatementBody: NestedStatementPlanner,
): readonly CsharpStatement[] {
  const keyType = getForInKeyType(selectedIteration, statementNode, diagnostics);
  if (keyType === undefined) {
    return [];
  }
  if (binding.currentType !== undefined && !sameCsharpType(binding.currentType, keyType)) {
    diagnostics.push(unsupportedNodeDiagnostic(binding.node, "For-in key binding must have the finalized provider key type."));
    return [];
  }
  if (statement.Expression === undefined) {
    diagnostics.push({
      code: "CSHARP_UNSUPPORTED_FOR_IN_COLLECTION",
      category: "error",
      source: "tsonic-csharp",
      message: "For-in requires a collection expression.",
    });
    return [];
  }
  const objectShape = selectedIteration.lowering.objectShape;
  const collectionType = csharpTypeFromTargetTypeRef(objectShape.targetType);
  if (collectionType === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(statement.Expression, "Object-shape for-in requires a renderable object-shape target type before C# emission."));
    return [];
  }
  const { indexName, collectionName, keysName } = allocateForInNames(state);
  const keyExpression: CsharpExpression = {
    kind: "ElementAccessExpression",
    receiver: { kind: "IdentifierName", name: keysName },
    argument: { kind: "IdentifierName", name: indexName },
  };
  const plannedLoop: CsharpStatement = {
    kind: "ForStatement",
    initializer: {
      kind: "VariableDeclaration",
      locals: [{
        kind: "VariableDeclarator",
        name: indexName,
        type: predefined("int"),
        initializer: { kind: "LiteralExpression", value: 0 },
      }],
    },
    condition: {
      kind: "BinaryExpression",
      left: { kind: "IdentifierName", name: indexName },
      operatorToken: { kind: "LessThanToken" },
      right: {
        kind: "SimpleMemberAccessExpression",
        receiver: { kind: "IdentifierName", name: keysName },
        name: "Length",
      },
    },
    incrementor: {
      kind: "PostfixUnaryExpression",
      operand: { kind: "IdentifierName", name: indexName },
      operatorToken: { kind: "PlusPlusToken" },
    },
    body: {
      kind: "Block",
      statements: [
        planForInKeyBindingStatementFromExpression(binding, keyType, keyExpression),
        ...planNestedStatementBody(statement.Statement, sourceFile, input, diagnostics, state),
      ],
    },
  };
  return [{
    kind: "Block",
    body: {
      kind: "Block",
      statements: [
        {
          kind: "LocalDeclarationStatement",
          name: collectionName,
          type: collectionType,
          initializer: planExpression(statement.Expression, sourceFile, input, diagnostics),
        },
        {
          kind: "LocalDeclarationStatement",
          name: keysName,
          type: { kind: "ArrayType", elementType: keyType },
          initializer: {
            kind: "ArrayCreationExpression",
            elementType: keyType,
            elements: objectShape.members.map((member) => ({ kind: "LiteralExpression", value: member.sourceName }) satisfies CsharpExpression),
          },
        },
        plannedLoop,
      ],
    },
  }];
}
