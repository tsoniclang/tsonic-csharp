import type { CsharpPlanningContext } from "../../context.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type {
  CsharpArgument,
  CsharpConstructorDeclaration,
  CsharpStatement,
} from "../../../target-ast/syntax/index.js";
import {
  AsCallExpression,
  AsClassStaticBlockDeclaration,
  AsConstructorDeclaration,
} from "@tsonic/target-api/source";
import {
  createDestructuringPlannerState,
} from "../../bindings/index.js";
import {
  planCallArgument,
} from "../../expressions/index.js";
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
import { planCsharpPreparedConstructor, type CsharpConstructorArgumentPlan } from "./constructor-entry.js";
import { planCsharpParameterPropertyAssignments } from "./parameter-properties.js";
import { failCsharpPlannerInvariant } from "../../../invariants.js";

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
  initializers: readonly CsharpStatement[],
): readonly CsharpConstructorDeclaration[] {
  const declaration = AsConstructorDeclaration(input.program.source.ast, node)!;
  const entry = input.program.records.constructorEntry.get(node);
  if (entry === undefined) failCsharpPlannerInvariant("An admitted constructor requires its sealed native entry plan.", node);
  const baseCall = entry.baseCall;
  const leadingSuperCall = baseCall === undefined ? undefined : AsCallExpression(input.program.source.ast, baseCall);
  const state = createDestructuringPlannerState(node, input.program.source.ast);
  const parameters = planParametersWithPrelude(declaration.Parameters?.Nodes ?? [], sourceFile, input, diagnostics, state);
  const constructor: CsharpConstructorDeclaration = {
      kind: "ConstructorDeclaration",
      name: className,
      modifiers: withCsharpSafetyModifiers(
        planClassMemberModifiers(node, undefined, input, { kind: "source", declaration: node, role: "member" }),
        node,
        "constructor",
        input,
      ),
      attributes: planAttributesForSubject(node, sourceFile, input, diagnostics),
      parameters: parameters.parameters,
      body: { kind: "Block", statements: [] },
  };
  if (entry.prepared) {
    const baseArgumentPlans = leadingSuperCall === undefined ? []
      : planBaseConstructorArguments(leadingSuperCall, sourceFile, input, diagnostics, state, false);
    if (baseArgumentPlans === undefined) failCsharpPlannerInvariant("A prepared constructor requires its admitted base argument plans.", node);
    return planCsharpPreparedConstructor(node, declaration.Body, constructor, parameters,
      baseArgumentPlans, sourceFile, input, diagnostics, state, leadingSuperCall !== undefined, initializers);
  }
  const baseArgumentPlans = leadingSuperCall === undefined ? []
    : planBaseConstructorArguments(leadingSuperCall, sourceFile, input, diagnostics, state, true);
  if (baseArgumentPlans === undefined) failCsharpPlannerInvariant("A native constructor requires its admitted base argument plans.", node);
  const baseArguments: CsharpArgument[] = [];
  for (const argument of baseArgumentPlans) {
    const syntax = planCsharpConstructorInitializerArgument(argument.node, argument.value, parameters.parameters, input, diagnostics, argument.expectedCarrier);
    if (syntax === undefined) failCsharpPlannerInvariant("An admitted constructor argument requires its native initializer syntax.", argument.node);
    baseArguments.push(syntax);
  }
  return [{ ...constructor,
    ...(leadingSuperCall === undefined
      ? {}
      : { initializer: { kind: "base", arguments: baseArguments } }),
    body: {
      kind: "Block",
      statements: planBlockStatements(declaration.Body, sourceFile, input, diagnostics, state,
        [...parameters.prelude, ...initializers, ...planCsharpParameterPropertyAssignments(node, input, diagnostics, state)],
        leadingSuperCall === undefined ? 0 : 1),
    },
  }];
}

function planBaseConstructorArguments(
  call: NonNullable<ReturnType<typeof AsCallExpression>>,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  directEntry: boolean,
): readonly CsharpConstructorArgumentPlan[] | undefined {
  const planned: CsharpConstructorArgumentPlan[] = [];
  const callNode = call.Expression === undefined ? undefined : input.program.source.ast.parent(call.Expression);
  const selection = callNode === undefined ? undefined : input.program.records.selectedCall.get(callNode);
  for (const [index, argument] of (call.Arguments?.Nodes ?? []).entries()) {
    if (argument === undefined) {
      failCsharpPlannerInvariant("An admitted base constructor requires a dense source argument list.", callNode);
    }
    const carrier = selection?.sourceArgumentParameterTypes?.[index];
    const selectedArgument = directEntry ? input.program.records.sourceArgument.get(argument) : undefined;
    const plannedArgument = planCallArgument(argument, sourceFile, input, diagnostics, carrier, state,
      selectedArgument?.kind === "resolved" ? selectedArgument.argument.passingMode : undefined);
    if (plannedArgument === undefined) {
      failCsharpPlannerInvariant("An admitted base argument requires its native expression plan.", argument);
    }
    planned.push({ node: argument, value: plannedArgument, expectedCarrier: carrier });
  }
  return planned;
}
