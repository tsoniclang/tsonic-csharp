import type { AstReader, Node } from "@tsonic/tsts";
import { HasSourceKind, HasSyntacticModifier, KindPrivateIdentifier, ModifierFlagsStatic, ModifierFlagsAsync } from "@tsonic/target-api/source";
import type { CsharpProjectCallableAdapters, CsharpProjectCallableDispatch } from "../../../target-model/records/callable-adapters.js";
import type { CsharpCaptureStorage } from "../../../target-model/records/capture-storage.js";
import type { CsharpMemberVisibility, CsharpMemberModifier, CsharpCallableModifier, CsharpDispatchModifier, CsharpMemberModifierSelection } from "../../../target-model/records/declaration-modifiers.js";
import { createCsharpDeclarationModifierRecords } from "../../program/records/declaration-modifiers.js";
import { requireCsharpRecord, type CsharpRequiredRecord } from "../../program/records/required-records.js";

export function analyzeCsharpDeclarationModifiers(input: {
  readonly ast: AstReader;
  readonly nodes: readonly Node[];
  readonly dispatch: CsharpProjectCallableAdapters["callableDispatch"];
  readonly helperAccess: CsharpCaptureStorage["helperAccess"];
  readonly required: CsharpRequiredRecord[];
}) {
  const values = new Map<Node, CsharpMemberModifierSelection>();
  for (const node of input.nodes) {
    const kind = input.ast.kindName(node);
    if (kind !== "KindMethodDeclaration" && kind !== "KindConstructor" && kind !== "KindPropertyDeclaration" &&
      kind !== "KindGetAccessor" && kind !== "KindSetAccessor") continue;
    const name = input.ast.name(node);
    const access = HasSourceKind(input.ast, name, KindPrivateIdentifier) || input.ast.hasModifierKind(node, "private") ? "private"
      : input.ast.hasModifierKind(node, "protected") ? "protected" : "public";
    const visibility: readonly CsharpMemberVisibility[] = input.helperAccess.get(node)
      ? access === "private" ? ["internal"] : access === "protected" ? ["protected", "internal"] : [access]
      : [access];
    const isStatic = HasSyntacticModifier(input.ast, node, ModifierFlagsStatic);
    const member: readonly CsharpMemberModifier[] = Object.freeze(isStatic ? [...visibility, "static" as const] : [...visibility]);
    const dispatch = input.dispatch.get(node);
    const abstract = input.ast.hasModifierKind(node, "abstract");
    let method: readonly CsharpCallableModifier[] | undefined;
    if (kind === "KindMethodDeclaration" && (isStatic || dispatch?.kind === "method"))
      method = Object.freeze([...(isStatic ? [] : dispatchModifiers(dispatch!, abstract)),
        ...(HasSyntacticModifier(input.ast, node, ModifierFlagsAsync) ? ["async" as const] : [])]);
    const property = dispatch?.kind === "property" ? Object.freeze(dispatchModifiers(dispatch, abstract)) : undefined;
    values.set(node, Object.freeze({ member, method, property }));
    requireCsharpRecord(input.required, { family: "memberModifiers", subject: node, construct: kind, producer: "analyzeCsharpDeclarationModifiers" });
  }
  return createCsharpDeclarationModifierRecords(values);
}

function dispatchModifiers(dispatch: CsharpProjectCallableDispatch, abstract: boolean): CsharpDispatchModifier[] {
  const modifiers: CsharpDispatchModifier[] = [];
  if (dispatch.overridesBase) modifiers.push("override");
  else if (dispatch.hasDerivedOverride && !abstract) modifiers.push("virtual");
  if (abstract) modifiers.push("abstract");
  return modifiers;
}
