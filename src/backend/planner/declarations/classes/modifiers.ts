import type { CsharpPlanningContext } from "../../context.js";
import type {
  CsharpModifier,
  CsharpMethodDeclaration,
  CsharpPropertyDeclaration,
} from "../../../target-ast/syntax/index.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import { failCsharpPlannerInvariant } from "../../diagnostics.js";
import type { CsharpNativeMemberIdentity } from "../../../../target-model/names/model.js";
import type { CsharpProjectCallableDispatch } from "../../../../target-model/records/callable-adapters.js";

import {
  HasSourceKind,
  HasSyntacticModifier,
  KindPrivateIdentifier,
  ModifierFlagsStatic,
} from "@tsonic/target-api/source";
import {
  isAsyncNode,
  planCsharpNativeMemberHiding,
} from "../modifiers.js";

export function planClassMemberModifiers(node: Node, name: Node | undefined, input: CsharpPlanningContext,
  subject: CsharpNativeMemberIdentity): readonly ("public" | "private" | "protected" | "internal" | "static" | "new")[] {
  const ast = input.program.source.ast;
  const access = HasSourceKind(ast, name, KindPrivateIdentifier) || ast.hasModifierKind(node, "private") ? "private"
    : ast.hasModifierKind(node, "protected") ? "protected" : "public";
  const visibility: readonly ("public" | "private" | "protected" | "internal")[] = input.program.records.helperAccess.get(node)
    ? access === "private" ? ["internal" as const] : access === "protected" ? ["protected" as const, "internal" as const] : [access]
    : [access];
  const modifiers: ("public" | "private" | "protected" | "internal" | "static" | "new")[] = HasSyntacticModifier(input.program.source.ast, node, ModifierFlagsStatic)
    ? [...visibility, "static"]
    : [...visibility];
  if (name !== undefined) {
    modifiers.push(...planCsharpNativeMemberHiding(input.program.names, subject));
  }
  return modifiers;
}

export function planMethodModifiers(node: Node, name: Node | undefined, input: CsharpPlanningContext,
  subject: CsharpNativeMemberIdentity): CsharpMethodDeclaration["modifiers"] {
  const modifiers: CsharpMethodDeclaration["modifiers"][number][] = [...planClassMemberModifiers(node, name, input, subject)];
  if (!modifiers.includes("static")) {
    const dispatch = input.program.records.callableDispatch.get(node);
    if (dispatch?.kind !== "method") failCsharpPlannerInvariant("An admitted method lost its final native dispatch flags.", node);
    addDispatchModifiers(modifiers, dispatch, input.program.source.ast.hasModifierKind(node, "abstract"));
  }
  if (isAsyncNode(input.program.source.ast, node)) {
    modifiers.push("async");
  }
  return modifiers;
}

export function planPropertyModifiers(node: Node, name: Node | undefined, _sourceFile: SourceFile, input: CsharpPlanningContext): CsharpPropertyDeclaration["modifiers"] {
  const modifiers: CsharpPropertyDeclaration["modifiers"][number][] = [...planClassMemberModifiers(node, name, input,
    { kind: "source", declaration: node, role: "member" })];
  const dispatch = input.program.records.callableDispatch.get(node);
  if (dispatch?.kind !== "property") failCsharpPlannerInvariant("An admitted property lost its final native dispatch flags.", node);
  addDispatchModifiers(modifiers, dispatch,
    input.program.source.ast.hasModifierKind(node, "abstract"));
  return modifiers;
}

function addDispatchModifiers(
  modifiers: CsharpModifier[],
  dispatch: CsharpProjectCallableDispatch,
  abstract: boolean,
): void {
  if (dispatch?.overridesBase === true) {
    modifiers.push("override");
  } else if (dispatch?.hasDerivedOverride === true && !abstract) {
    modifiers.push("virtual");
  }
  if (abstract) modifiers.push("abstract");
}
