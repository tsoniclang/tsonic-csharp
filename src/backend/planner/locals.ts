import {
  AsAsExpression,
  AsTypeAssertion,
  AsVariableDeclaration,
} from "./source-ast.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import type { CsharpLocalDeclaration, CsharpStatement } from "../roslyn/syntax.js";
import { getCsharpTypeForNode } from "./csharp-types.js";
import { planExpressionWithExpectedType } from "./expressions.js";
import { planVariableBindingStatements } from "./bindings.js";
import {
  declareCsharpLocalBindingName,
} from "./bindings.js";
import type { DestructuringPlannerState } from "./bindings.js";

export function planLocalDeclaration(
  declarationNode: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
): CsharpLocalDeclaration {
  const variable = AsVariableDeclaration(declarationNode)!;
  const typeSubject = variable.Type ?? getInitializerTypeSubject(variable.Initializer, input) ?? variable.name ?? variable.Initializer;
  const type = getCsharpTypeForNode(typeSubject, sourceFile, input, undefined, diagnostics);
  const name = declareCsharpLocalBindingName(variable.name, sourceFile, input, diagnostics, state, "Local binding name", "LocalDeclarationStatement");
  return {
    kind: "VariableDeclarator",
    name,
    type,
    ...(variable.Initializer !== undefined
      ? { initializer: planExpressionWithExpectedType(variable.Initializer, sourceFile, input, diagnostics, type, variable.Type ?? variable.name, state) }
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
  input: TargetCompileInput,
): Node | undefined {
  if (initializer === undefined) {
    return undefined;
  }
  const assertedTarget = AsAsExpression(initializer)?.Type ?? AsTypeAssertion(initializer)?.Type;
  if (assertedTarget !== undefined) {
    return assertedTarget;
  }
  return input.facts.getRuntimeCarrierFact(initializer) !== undefined ||
    input.facts.getTargetConversionFact(initializer)?.convertedType !== undefined
    ? initializer
    : undefined;
}
