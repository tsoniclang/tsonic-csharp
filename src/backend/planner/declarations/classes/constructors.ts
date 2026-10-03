import type { CsharpPlanningContext } from "../../context.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type {
  CsharpArgument,
  CsharpConstructorDeclaration,
} from "../../../target-ast/roslyn/index.js";
import {
  AsBlock,
  AsCallExpression,
  AsClassStaticBlockDeclaration,
  AsConstructorDeclaration,
  AsExpressionStatement,
  HasSourceKind,
  KindCallExpression,
  KindExpressionStatement,
  KindSuperKeyword,
} from "@tsonic/target-api/source";
import {
  createDestructuringPlannerState,
} from "../../bindings/index.js";
import {
  planCallArgument,
} from "../../expressions/index.js";
import {
  diagnoseTypeScriptOnlyRuntimeShapeModifiers,
} from "../modifiers.js";
import {
  planParametersWithPrelude,
} from "../callables/parameters.js";
import {
  planBlockStatements,
} from "../../statements/index.js";
import {
  planAttributesForSubject,
} from "../attributes.js";
import {
  withCsharpSafetyModifiers,
} from "../../safety/explicit-safety.js";
import { planClassMemberModifiers } from "./modifiers.js";
import { planCsharpConstructorInitializerArgument } from "./initializer-arguments.js";
import type { DestructuringPlannerState } from "../../bindings/index.js";
import { csharpTypeFromTargetTypeRef } from "../../types/target-types.js";
import { planCsharpPreparedConstructor, type CsharpConstructorArgumentPlan } from "./constructor-entry.js";

export function planClassStaticBlockDeclaration(
  node: Node,
  className: string,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
): CsharpConstructorDeclaration {
  const declaration = AsClassStaticBlockDeclaration(input.program.source.ast, node)!;
  const state = createDestructuringPlannerState(node, input.program.source.ast);
  return {
    kind: "ConstructorDeclaration",
    name: className,
    modifiers: ["static"],
    parameters: [],
    body: {
      kind: "Block",
      statements: planBlockStatements(declaration.Body, sourceFile, input, diagnostics, state),
    },
  };
}

export function planConstructorDeclarations(
  node: Node,
  className: string,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
): readonly CsharpConstructorDeclaration[] {
  const declaration = AsConstructorDeclaration(input.program.source.ast, node)!;
  diagnoseTypeScriptOnlyRuntimeShapeModifiers(input.program.source.ast, node, "constructor declaration", diagnostics, ["public", "private", "protected"]);
  const bodyStatements = AsBlock(input.program.source.ast, declaration.Body)?.Statements?.Nodes ?? [];
  const leadingSuperCall = getLeadingSuperCall(bodyStatements, input);
  const state = createDestructuringPlannerState(node, input.program.source.ast);
  const parameters = planParametersWithPrelude(declaration.Parameters?.Nodes ?? [], sourceFile, input, diagnostics, state);
  const baseArgumentPlans = leadingSuperCall === undefined ? []
    : planBaseConstructorArguments(leadingSuperCall, sourceFile, input, diagnostics, state);
  const constructor: CsharpConstructorDeclaration = {
      kind: "ConstructorDeclaration",
      name: className,
      modifiers: withCsharpSafetyModifiers(
        planClassMemberModifiers(node, undefined, input),
        node,
        "constructor",
        input,
      ),
      attributes: planAttributesForSubject(node, sourceFile, input, diagnostics),
      parameters: parameters.parameters,
      body: { kind: "Block", statements: [] },
  };
  if (baseArgumentPlans === undefined) return [constructor];
  if (leadingSuperCall !== undefined && parameters.prelude.length > 0) return planCsharpPreparedConstructor(node, declaration.Body, constructor,
    parameters, baseArgumentPlans, sourceFile, input, diagnostics, state, leadingSuperCall !== undefined);
  const baseArguments: CsharpArgument[] = [];
  for (const argument of baseArgumentPlans) {
    const syntax = planCsharpConstructorInitializerArgument(argument.node, argument.value, parameters.parameters, input, diagnostics, argument.expectedCarrier);
    if (syntax === undefined) return [constructor];
    baseArguments.push(syntax);
  }
  return [{ ...constructor,
    ...(leadingSuperCall === undefined
      ? {}
      : { initializer: { kind: "base", arguments: baseArguments ?? [] } }),
    body: {
      kind: "Block",
      statements: planBlockStatements(declaration.Body, sourceFile, input, diagnostics, state,
        parameters.prelude, leadingSuperCall === undefined ? 0 : 1),
    },
  }];
}

function planBaseConstructorArguments(
  call: NonNullable<ReturnType<typeof AsCallExpression>>,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
): readonly CsharpConstructorArgumentPlan[] | undefined {
  const planned: CsharpConstructorArgumentPlan[] = [];
  const callNode = call.Expression === undefined ? undefined : input.program.source.ast.parent(call.Expression);
  const selection = callNode === undefined ? undefined : input.program.operations.call(callNode);
  for (const [index, argument] of (call.Arguments?.Nodes ?? []).entries()) {
    if (argument === undefined) {
      continue;
    }
    const carrier = selection?.sourceArgumentParameterTypes?.[index];
    const type = carrier === undefined ? undefined : csharpTypeFromTargetTypeRef(carrier, input.scope.typeParameterNames);
    const plannedArgument = planCallArgument(argument, sourceFile, input, diagnostics, type, undefined, carrier, state);
    if (plannedArgument === undefined) {
      return undefined;
    }
    planned.push({ node: argument, value: plannedArgument, expectedCarrier: carrier });
  }
  return planned;
}

function getLeadingSuperCall(statements: readonly (Node | undefined)[], input: CsharpPlanningContext): NonNullable<ReturnType<typeof AsCallExpression>> | undefined {
  const first = statements[0];
  if (!HasSourceKind(input.program.source.ast, first, KindExpressionStatement)) {
    return undefined;
  }
  const expression = AsExpressionStatement(input.program.source.ast, first)!.Expression;
  if (!HasSourceKind(input.program.source.ast, expression, KindCallExpression)) {
    return undefined;
  }
  const call = AsCallExpression(input.program.source.ast, expression)!;
  return HasSourceKind(input.program.source.ast, call.Expression, KindSuperKeyword) ? call : undefined;
}
