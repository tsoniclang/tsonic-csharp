import type { CsharpTranslationContext } from "../../translate/context/index.js";
import {
  AsAsExpression,
  AsTypeReferenceNode,
  AsTypeAssertion,
  AsVariableDeclaration,
  HasSourceKind,
  KindArrowFunction,
  KindCallExpression,
  KindFunctionExpression,
  KindNewExpression,
  KindTypeReference,
} from "./source-ast.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type {
  TargetDiagnostic,
} from "@tsonic/target-api";
import type { CsharpLocalDeclaration, CsharpStatement } from "../roslyn/syntax.js";
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
  const inferredLambdaType = variable.Initializer !== undefined
    ? getLambdaTargetContext(variable.Initializer, sourceFile, input, explicitType, expectedTargetType)?.type
    : undefined;
  const constAssertionType = variable.Type === undefined && variable.Initializer !== undefined
    ? getConstAssertionInitializerType(variable.Initializer, sourceFile, input)
    : undefined;
  const inferredTargetType = input.types.resolveNode(
    variable.Type ?? variable.Initializer ?? variable.name,
    sourceFile,
  );
  const type = inferredLambdaType ??
    explicitType ??
    constAssertionType ??
    (inferredTargetType === undefined
      ? undefined
      : csharpTypeFromTargetTypeRef(inferredTargetType)) ??
    getCsharpTypeForNode(typeSubject, sourceFile, input, undefined, diagnostics);
  const name = declareCsharpLocalBindingName(variable.name, sourceFile, input, diagnostics, state, "Local binding name", "LocalDeclarationStatement");
  return {
    kind: "VariableDeclarator",
    name,
    type,
    ...(variable.Initializer !== undefined
      ? { initializer: planExpressionWithExpectedType(variable.Initializer, sourceFile, input, diagnostics, type, variable.Type ?? variable.name, state, expectedTargetType) }
      : {}),
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
  const local = planLocalDeclaration(declarationNode, sourceFile, input, diagnostics, state);
  return [{
    kind: "LocalDeclarationStatement",
    name: local.name,
    type: local.type,
    ...(local.initializer === undefined ? {} : { initializer: local.initializer }),
  }];
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
  if (assertedTarget !== undefined && isConstAssertionType(assertedTarget, input)) {
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

function isConstAssertionType(
  node: Node,
  input: CsharpTranslationContext,
): boolean {
  const name = input.ast.name(node) ?? (
    HasSourceKind(input.ast, node, KindTypeReference)
      ? AsTypeReferenceNode(node)?.TypeName
      : undefined
  );
  return name !== undefined && input.ast.text(name) === "const";
}

function getConstAssertionInitializerType(
  initializer: Node,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
): CsharpLocalDeclaration["type"] | undefined {
  const assertion = AsAsExpression(initializer) ?? AsTypeAssertion(initializer);
  if (assertion?.Type === undefined || assertion.Expression === undefined || !isConstAssertionType(assertion.Type, input)) {
    return undefined;
  }
  return getCsharpTypeFromSemanticType(
    input.queries(sourceFile).checker.getTypeAtLocation(assertion.Expression, { sourceFile }),
    sourceFile,
    input,
  );
}
