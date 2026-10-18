import type { Node, SourceFile } from "@tsonic/tsts";
import { sourceClassFieldIsTypeOnly } from "@tsonic/target-api/source";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpExpression, CsharpStatement } from "../../../target-ast/syntax/index.js";
import type { CsharpPlanningContext } from "../../context.js";
import { csharpTypeFromTargetTypeRef } from "../../types/target-types.js";
import { planExpression } from "../../expressions/index.js";
import { planIdentifierName } from "../../names/source-identifiers.js";
import { failCsharpPlannerInvariant } from "../../diagnostics.js";
import { createDestructuringPlannerState } from "../../bindings/binding-state.js";
import { planClassStaticBlockDeclaration } from "./constructors.js";
import { consumeCsharpPlannedValue } from "../../statements/statement-output.js";
import type { CsharpPlannedValue } from "../../expressions/planned-values.js";
import { getCsharpNullableElementTargetType, isCsharpValueTypeTargetType } from "../../../../target-model/types/index.js";

export interface CsharpClassInitializationRegion {
  readonly relocates: boolean;
  readonly inline: ReadonlyMap<Node, CsharpExpression>;
  readonly statements: readonly CsharpStatement[];
}

export interface CsharpClassInitializationEntry {
  readonly node: Node;
  readonly name?: string;
  readonly value?: CsharpPlannedValue;
  readonly defaultValue?: CsharpExpression;
  readonly statements?: readonly CsharpStatement[];
}

export function planClassInitializationRegion(
  declaration: Node, sourceFile: SourceFile, className: string, isStatic: boolean,
  input: CsharpPlanningContext, diagnostics: TargetDiagnostic[], factory = false,
): CsharpClassInitializationRegion {
  const ast = input.program.source.ast;
  const fields = new Map<Node, CsharpPlannedValue>();
  const defaults = new Map<Node, CsharpExpression>();
  const blocks = new Map<Node, readonly CsharpStatement[]>();
  const state = createDestructuringPlannerState(declaration, ast);
  let relocates = factory || !isStatic && input.program.records.requiresClassConstructor.get(declaration);
  const region = input.program.records.classInitializationRegion.get(declaration, isStatic);
  for (const node of region) {
    if (sourceClassFieldIsTypeOnly(ast, node) || input.program.records.nativeUse.order(node) === undefined ||
      input.program.records.compileTimeMetadata.get(node) || input.program.records.nativeUnreachable.get(node) ||
      input.program.records.nativeParticipation.get(node) === "erased") continue;
    if (ast.is.IsClassStaticBlockDeclaration(node)) {
      blocks.set(node, planClassStaticBlockDeclaration(node, className, sourceFile, input, diagnostics).body.statements);
      relocates = true;
      continue;
    }
    const property = ast.as.AsPropertyDeclaration(node)!;
    if (property.Initializer === undefined) continue;
    if (input.program.records.sourceField.get([node, property.name, property.Type, property.Initializer]) !== undefined) continue;
    const target = input.program.records.storageType.get(node);
    const type = target === undefined ? undefined : csharpTypeFromTargetTypeRef(target, input.scope.typeParameterNames);
    if (type === undefined) failCsharpPlannerInvariant("An admitted class initializer lost its exact native storage type.", node);
    const value = planExpression(property.Initializer, sourceFile, input, diagnostics, state);
    if (value === undefined) continue;
    fields.set(node, value);
    if (value.completion.kind === "value" && target !== undefined && type !== undefined &&
      !isCsharpValueTypeTargetType(target) && getCsharpNullableElementTargetType(target) === undefined) {
      defaults.set(node, { kind: "DefaultExpression", type, nullForgiving: true });
    }
    relocates ||= value.prelude.length !== 0 || value.completion.kind !== "value";
  }
  const entries: CsharpClassInitializationEntry[] = [];
  for (const node of region) {
    const block = blocks.get(node);
    if (block !== undefined) entries.push({ node, statements: block });
    const value = fields.get(node);
    if (value === undefined) continue;
    const property = ast.as.AsPropertyDeclaration(node)!;
    const name = planIdentifierName(property.name, "Field", input, diagnostics, "Class field");
    const defaultValue = defaults.get(node);
    entries.push({ node, name, value, ...(defaultValue === undefined ? {} : { defaultValue }) });
  }
  return completeCsharpClassInitializationRegion(entries, relocates, isStatic && !factory ? className : "this");
}

export function completeCsharpClassInitializationRegion(
  entries: readonly CsharpClassInitializationEntry[], relocates: boolean, receiver: string,
): CsharpClassInitializationRegion {
  const inline = new Map<Node, CsharpExpression>();
  const statements: CsharpStatement[] = [];
  for (const entry of entries) {
    if (entry.statements !== undefined) statements.push(...entry.statements);
    const value = entry.value;
    if (value === undefined) continue;
    if (!relocates && value.completion.kind === "value") {
      inline.set(entry.node, value.completion.expression);
      continue;
    }
    if (entry.defaultValue !== undefined) inline.set(entry.node, entry.defaultValue);
    if (entry.name === undefined) failCsharpPlannerInvariant("An ordered class value requires its exact field name.", entry.node);
    const name = entry.name;
    statements.push(...consumeCsharpPlannedValue(value, expression => [{ kind: "ExpressionStatement", expression: {
      kind: "AssignmentExpression", left: { kind: "SimpleMemberAccessExpression",
        receiver: { kind: "IdentifierName", name: receiver }, name },
      operatorToken: { kind: "EqualsToken" }, right: expression,
    } }]));
    if (value.completion.kind === "never") break;
  }
  return { relocates, inline, statements };
}
