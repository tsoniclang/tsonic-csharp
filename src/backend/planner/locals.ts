import type { CsharpTranslationContext } from "../../translate/context/index.js";
import {
  AsAsExpression,
  AsTypeAssertion,
  AsVariableDeclaration,
  HasSourceKind,
  KindArrowFunction,
  KindCallExpression,
  KindFunctionExpression,
  KindNewExpression,
} from "./source-ast.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type {
  TargetDiagnostic,
} from "@tsonic/target-api";
import type {
  CsharpExpression,
  CsharpLocalDeclaration,
  CsharpStatement,
} from "../roslyn/syntax.js";
import { getCsharpTypeForNode } from "./csharp-types.js";
import {
  getTargetTypeRefForNode,
} from "./runtime-carriers.js";
import {
  getCsharpTypeFromSemanticType,
} from "./csharp-semantic-types.js";
import { planExpressionWithExpectedType } from "./expressions.js";
import { getLambdaTargetContext } from "./expression-lambdas.js";
import { planVariableBindingStatements } from "./bindings.js";
import {
  declareCsharpLocalBindingName,
} from "./bindings.js";
import type { DestructuringPlannerState } from "./bindings.js";
import {
  csharpTypeFromTargetTypeRef,
} from "./target-types.js";
import {
  targetTypeRefEquals,
} from "../../policy/types/index.js";
import {
  unsupportedNodeDiagnostic,
} from "./diagnostics.js";
import {
  planCsharpSourceUndefinedValue,
} from "../../translate/expressions/undefined-values.js";
import {
  planCsharpTypedLocationIdentityDeclaration,
} from "./typed-location-identities.js";

export function planLocalDeclaration(
  declarationNode: Node,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
): CsharpLocalDeclaration {
  const variable = AsVariableDeclaration(declarationNode)!;
  const typeSubject = variable.Type ?? getInitializerTypeSubject(variable.Initializer, sourceFile, input) ?? variable.name ?? variable.Initializer;
  const expectedTargetType = getTargetTypeRefForNode(input, typeSubject, sourceFile) ??
    getTargetTypeRefForNode(input, variable.name, sourceFile);
  const explicitType = variable.Type === undefined
    ? undefined
    : getCsharpTypeForNode(variable.Type, sourceFile, input, undefined, diagnostics);
  const lambdaInitializer = variable.Initializer !== undefined &&
    (
      HasSourceKind(input.ast, variable.Initializer, KindArrowFunction) ||
      HasSourceKind(input.ast, variable.Initializer, KindFunctionExpression)
    );
  const inferredLambdaType = lambdaInitializer
    ? getLambdaTargetContext(
        variable.Initializer!,
        sourceFile,
        input,
        explicitType,
        variable.Type === undefined ? undefined : expectedTargetType,
      )?.type
    : undefined;
  const constAssertionType = variable.Type === undefined && variable.Initializer !== undefined
    ? getConstAssertionInitializerType(variable.Initializer, sourceFile, input)
    : undefined;
  const inferredTargetType = input.types.resolveStorage(
    declarationNode,
    sourceFile,
  );
  const storageType = inferredTargetType === undefined
    ? undefined
    : input.artifacts.resolveStorageType(
        declarationNode,
        inferredTargetType,
      );
  if (storageType?.kind === "rejected") {
    diagnostics.push(unsupportedNodeDiagnostic(
      declarationNode,
      storageType.reason,
    ));
  }
  const requiredStorageType = storageType?.kind === "resolved" &&
      inferredTargetType !== undefined &&
      !targetTypeRefEquals(storageType.type, inferredTargetType)
    ? csharpTypeFromTargetTypeRef(storageType.type)
    : undefined;
  const type = requiredStorageType ??
    inferredLambdaType ??
    explicitType ??
    constAssertionType ??
    (inferredTargetType === undefined
      ? undefined
      : csharpTypeFromTargetTypeRef(inferredTargetType)) ??
    getCsharpTypeForNode(typeSubject, sourceFile, input, undefined, diagnostics);
  const name = declareCsharpLocalBindingName(variable.name, input, diagnostics, state, "Local binding name", "LocalDeclarationStatement");
  let initializer: CsharpExpression | undefined;
  if (variable.Initializer !== undefined) {
    initializer = planExpressionWithExpectedType(
      variable.Initializer,
      sourceFile,
      input,
      diagnostics,
      type,
      variable.Type ?? variable.name,
      state,
      lambdaInitializer && variable.Type === undefined
        ? undefined
        : expectedTargetType,
    );
  } else if (inferredTargetType !== undefined) {
    const undefinedValue = planCsharpSourceUndefinedValue(
      declarationNode,
      inferredTargetType,
      sourceFile,
      input,
      diagnostics,
    );
    initializer = undefinedValue.kind === "resolved"
      ? undefinedValue.expression
      : {
          kind: "DefaultExpression",
          type,
          nullForgiving: true,
        };
  }
  return {
    kind: "VariableDeclarator",
    name,
    type,
    ...(initializer === undefined ? {} : { initializer }),
  };
}

export function planLocalDeclarationStatements(
  declarationNode: Node,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
): readonly CsharpStatement[] {
  const variable = AsVariableDeclaration(declarationNode)!;
  const destructured = planVariableBindingStatements(variable.name, variable.Initializer, sourceFile, input, diagnostics, state);
  if (destructured !== undefined) {
    return destructured;
  }
  const locationIdentity = input.ast.is.IsIdentifier(variable.name)
    ? planCsharpTypedLocationIdentityDeclaration(
        declarationNode,
        input,
        state,
      )
    : undefined;
  const local = planLocalDeclaration(declarationNode, sourceFile, input, diagnostics, state);
  if (
    variable.Initializer !== undefined &&
    local.initializer?.kind === "LambdaExpression" &&
    sourceInitializerReferencesDeclaration(
      variable.Initializer,
      declarationNode,
      input,
    )
  ) {
    return [
      ...(locationIdentity === undefined ? [] : [locationIdentity]),
      {
        kind: "LocalDeclarationStatement",
        name: local.name,
        type: local.type,
        initializer: {
          kind: "DefaultExpression",
          type: local.type,
          nullForgiving: true,
        },
      },
      {
        kind: "ExpressionStatement",
        expression: {
          kind: "AssignmentExpression",
          left: { kind: "IdentifierName", name: local.name },
          operatorToken: { kind: "EqualsToken" },
          right: local.initializer,
        },
      },
    ];
  }
  return [
    ...(locationIdentity === undefined ? [] : [locationIdentity]),
    {
      kind: "LocalDeclarationStatement",
      name: local.name,
      type: local.type,
      ...(local.initializer === undefined ? {} : { initializer: local.initializer }),
    },
  ];
}

function sourceInitializerReferencesDeclaration(
  node: Node,
  declaration: Node,
  input: CsharpTranslationContext,
): boolean {
  if (input.navigation.referenceFor(node)?.declaration === declaration) {
    return true;
  }
  return input.ast.children(node).some((child) =>
    child !== undefined &&
    sourceInitializerReferencesDeclaration(child, declaration, input)
  );
}

function getInitializerTypeSubject(
  initializer: Node | undefined,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
): Node | undefined {
  if (initializer === undefined) {
    return undefined;
  }
  const assertion = AsAsExpression(initializer) ?? AsTypeAssertion(initializer);
  const assertedTarget = assertion?.Type;
  if (assertedTarget !== undefined && input.ast.isConstAssertion(initializer)) {
    return assertion?.Expression;
  }
  if (assertedTarget !== undefined) {
    return assertedTarget;
  }
  if (HasSourceKind(input.ast, initializer, KindArrowFunction) || HasSourceKind(input.ast, initializer, KindFunctionExpression)) {
    return initializer;
  }
  if (HasSourceKind(input.ast, initializer, KindCallExpression) || HasSourceKind(input.ast, initializer, KindNewExpression)) {
    return initializer;
  }
  return getTargetTypeRefForNode(input, initializer, sourceFile) !== undefined
    ? initializer
    : undefined;
}

function getConstAssertionInitializerType(
  initializer: Node,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
): CsharpLocalDeclaration["type"] | undefined {
  const assertion = AsAsExpression(initializer) ?? AsTypeAssertion(initializer);
  if (
    assertion?.Type === undefined ||
    assertion.Expression === undefined ||
    !input.ast.isConstAssertion(initializer)
  ) {
    return undefined;
  }
  return getCsharpTypeFromSemanticType(
    input.semantics(sourceFile).getTypeAtLocation(assertion.Expression),
    sourceFile,
    input,
  );
}
