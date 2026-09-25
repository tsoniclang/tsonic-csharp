import type { CsharpPlanningContext } from "../../context.js";
import type {
  CsharpModifier,
  CsharpMethodDeclaration,
  CsharpPropertyDeclaration,
} from "../../../target-ast/roslyn/index.js";
import type { Node, SourceFile } from "@tsonic/tsts";

import {
  HasSourceKind,
  HasSyntacticModifier,
  KindPrivateIdentifier,
  ModifierFlagsStatic,
} from "@tsonic/target-api/source";
import {
  isAsyncNode,
} from "../modifiers.js";

export function planClassMemberModifiers(node: Node, name: Node | undefined, input: CsharpPlanningContext): readonly ("public" | "private" | "static")[] {
  const access = HasSourceKind(input.program.source.ast, name, KindPrivateIdentifier) ? "private" : "public";
  return HasSyntacticModifier(input.program.source.ast, node, ModifierFlagsStatic)
    ? [access, "static"]
    : [access];
}

export function planMethodModifiers(node: Node, name: Node | undefined, _sourceFile: SourceFile, input: CsharpPlanningContext): CsharpMethodDeclaration["modifiers"] {
  const modifiers: CsharpMethodDeclaration["modifiers"][number][] = [...planClassMemberModifiers(node, name, input)];
  addDispatchModifiers(modifiers, input.program.sourceNavigation.memberDispatch(node),
    input.program.source.ast.hasModifierKind(node, "abstract"));
  if (isAsyncNode(input.program.source.ast, node)) {
    modifiers.push("async");
  }
  return modifiers;
}

export function planPropertyModifiers(node: Node, name: Node | undefined, _sourceFile: SourceFile, input: CsharpPlanningContext): CsharpPropertyDeclaration["modifiers"] {
  const modifiers: CsharpPropertyDeclaration["modifiers"][number][] = [...planClassMemberModifiers(node, name, input)];
  addDispatchModifiers(modifiers, input.program.sourceNavigation.memberDispatch(node),
    input.program.source.ast.hasModifierKind(node, "abstract"));
  return modifiers;
}

function addDispatchModifiers(
  modifiers: CsharpModifier[],
  dispatch: ReturnType<CsharpPlanningContext["program"]["sourceNavigation"]["memberDispatch"]>,
  abstract: boolean,
): void {
  if (dispatch?.overridesBase === true) {
    modifiers.push("override");
  } else if (dispatch?.hasDerivedOverride === true && !abstract) {
    modifiers.push("virtual");
  }
  if (abstract) modifiers.push("abstract");
}
