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
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
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
  csharpTargetOperationFactKey,
} from "../../source/csharp-facts.js";

export function planLocalDeclaration(
  declarationNode: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
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
  const type = inferredLambdaType ??
    explicitType ??
    constAssertionType ??
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
  input: TargetCompileInput,
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
  input: TargetCompileInput,
): Node | undefined {
  if (initializer === undefined) {
    return undefined;
  }
  const assertion = AsAsExpression(initializer) ?? AsTypeAssertion(initializer);
  const assertedTarget = assertion?.Type;
  if (assertedTarget !== undefined) {
    return isConstAssertionType(assertedTarget, input) ? assertion?.Expression : assertedTarget;
  }
  if (HasSourceKind(input.ast, initializer, KindArrowFunction) || HasSourceKind(input.ast, initializer, KindFunctionExpression)) {
    return initializer;
  }
  if (HasSourceKind(input.ast, initializer, KindCallExpression) || HasSourceKind(input.ast, initializer, KindNewExpression)) {
    return initializer;
  }
  return input.facts.getRuntimeCarrierFact(initializer) !== undefined ||
    input.targetFacts.resolveRuntimeCarrierForNode(initializer, { sourceFile }).kind === "resolved" ||
    input.facts.getTargetConversionFact(initializer)?.convertedType !== undefined ||
    input.facts.getFact(initializer, csharpTargetOperationFactKey) !== undefined
    ? initializer
    : undefined;
}

function isConstAssertionType(
  node: Node,
  input: TargetCompileInput,
): boolean {
  const name = input.ast.name(node) ?? getTypeReferenceName(node);
  return name !== undefined && input.ast.text(name) === "const";
}

function getConstAssertionInitializerType(
  initializer: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
): CsharpLocalDeclaration["type"] | undefined {
  const assertion = AsAsExpression(initializer) ?? AsTypeAssertion(initializer);
  if (assertion?.Type === undefined || assertion.Expression === undefined || !isConstAssertionType(assertion.Type, input)) {
    return undefined;
  }
  return getCsharpTypeFromSemanticType(input.analysis.getTypeAtLocation(assertion.Expression, { sourceFile }), sourceFile, input);
}

function getTypeReferenceName(node: Node): Node | undefined {
  const value = Object.getOwnPropertyDescriptor(node, "TypeName")?.value;
  return typeof value === "object" && value !== null ? value as Node : undefined;
}
