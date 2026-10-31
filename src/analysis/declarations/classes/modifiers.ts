import type { AstReader, Node } from "@tsonic/tsts";
import type { TargetSourceProgram } from "@tsonic/target-api/source";
import { HasSourceKind, HasSyntacticModifier, KindPrivateIdentifier, ModifierFlagsStatic, ModifierFlagsAsync, sourceParameterIsProperty, sourceClassFieldIsTypeOnly } from "@tsonic/target-api/source";
import type { CsharpProjectCallableAdapters, CsharpProjectCallableDispatch } from "../../../target-model/records/callables/callable-adapters.js";
import type { CsharpCaptureStorage } from "../../../target-model/records/callables/capture-storage.js";
import type { CsharpMemberVisibility, CsharpMemberModifier, CsharpCallableModifier, CsharpDispatchModifier, CsharpMemberModifierSelection } from "../../../target-model/records/program/declaration-modifiers.js";
import { createCsharpDeclarationModifierRecords } from "../../program/records/program/declaration-modifiers.js";
import { requireCsharpRecord, type CsharpRequiredRecord } from "../../program/records/objects/required-records.js";
import type { CsharpGeneratorRecords } from "../../../target-model/records/callables/generators.js";
import type { CsharpClassFactoryIndex } from "../../../target-model/records/objects/class-factories.js";
import { csharpModuleCallableInitializer } from "../../../target-model/syntax/module-callables.js";

export function analyzeCsharpDeclarationModifiers(input: {
  readonly ast: AstReader;
  readonly navigation: Pick<TargetSourceProgram["navigation"], "moduleExports">;
  readonly nodes: readonly Node[];
  readonly dispatch: CsharpProjectCallableAdapters["callableDispatch"];
  readonly helperAccess: CsharpCaptureStorage["helperAccess"];
  readonly required: CsharpRequiredRecord[];
  readonly generators: CsharpGeneratorRecords;
  readonly factories: CsharpClassFactoryIndex["classFactory"];
}) {
  const values = new Map<Node, CsharpMemberModifierSelection>();
  for (const node of input.nodes) {
    const moduleCallable = csharpModuleCallableInitializer(input.ast, node);
    if (moduleCallable !== undefined) {
      const file = input.ast.getSourceFile(node);
      const exported = file !== undefined && input.navigation.moduleExports(file).some(selected => selected.declaration === node);
      const member: readonly CsharpMemberModifier[] = Object.freeze([exported ? "public" : "internal", "static"]);
      values.set(node, Object.freeze({ member, implementation: member, abstract: false, erased: false,
        method: Object.freeze([]), property: undefined }));
      requireCsharpRecord(input.required, { family: "memberModifiers", subject: node,
        construct: "module callable", producer: "analyzeCsharpDeclarationModifiers" });
      continue;
    }
    const kind = input.ast.kindName(node);
    if (kind !== "KindMethodDeclaration" && kind !== "KindConstructor" && kind !== "KindPropertyDeclaration" &&
      kind !== "KindGetAccessor" && kind !== "KindSetAccessor" && !sourceParameterIsProperty(input.ast, node)) continue;
    const name = input.ast.name(node);
    const access = HasSourceKind(input.ast, name, KindPrivateIdentifier) || input.ast.hasModifierKind(node, "private") ? "private"
      : input.ast.hasModifierKind(node, "protected") ? "protected" : "public";
    const visibility: readonly CsharpMemberVisibility[] = input.helperAccess.get(node)
      ? access === "private" ? ["internal"] : access === "protected" ? ["protected", "internal"] : [access]
      : [access];
    const isStatic = HasSyntacticModifier(input.ast, node, ModifierFlagsStatic);
    const owner = input.ast.parent(node);
    const emittedStatic = isStatic && (owner === undefined || input.factories.get(owner) === undefined);
    const member: readonly CsharpMemberModifier[] = Object.freeze(emittedStatic ? [...visibility, "static" as const] : [...visibility]);
    const dispatch = input.dispatch.get(node);
    const abstract = input.ast.hasModifierKind(node, "abstract");
    let method: readonly CsharpCallableModifier[] | undefined;
    if (kind === "KindMethodDeclaration" && (isStatic || dispatch?.kind === "method"))
      method = Object.freeze([...(isStatic ? [] : dispatchModifiers(dispatch!, abstract)),
        ...(input.generators.generator.get(node) === undefined && HasSyntacticModifier(input.ast, node, ModifierFlagsAsync) ? ["async" as const] : [])]);
    const property = dispatch?.kind === "property" ? Object.freeze(dispatchModifiers(dispatch, abstract)) : undefined;
    const implementation = Object.freeze(member.map(modifier => modifier === "public" ? "private" as const : modifier));
    values.set(node, Object.freeze({ member, implementation, method, property, abstract, erased: sourceClassFieldIsTypeOnly(input.ast, node) }));
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
