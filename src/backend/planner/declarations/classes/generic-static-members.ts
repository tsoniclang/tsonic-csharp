import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpClassDeclaration } from "../../../target-ast/syntax/index.js";
import type { CsharpPlanningContext } from "../../context.js";
import { createCsharpMemberPlanningContext } from "../../context.js";
import { planClassMembers } from "./members.js";
import { planClassInitializationRegion } from "./initializers.js";
import { failCsharpPlannerInvariant } from "../../../invariants.js";

export function planGenericClassStaticMembers(
  node: Node, sourceFile: SourceFile, input: CsharpPlanningContext, diagnostics: TargetDiagnostic[],
): CsharpClassDeclaration | undefined {
  const selected = input.program.records.nativeDeclaration.get(node);
  if (selected?.kind !== "class") failCsharpPlannerInvariant("An admitted native class requires its static-companion selection.", node);
  const companion = selected.staticCompanion;
  if (companion === undefined) return undefined;
  const { members, name } = companion;
  input = createCsharpMemberPlanningContext(input);
  const initialization = planClassInitializationRegion(node, sourceFile, name, true, input, diagnostics);
  return { kind: "ClassDeclaration", name, modifiers: ["public", "static"],
    members: [
      ...planClassMembers(members, name, sourceFile, input, diagnostics, [initialization]),
      ...(initialization.relocates ? [{ kind: "ConstructorDeclaration" as const, name,
        modifiers: ["static" as const], parameters: [], body: { kind: "Block" as const, statements: initialization.statements } }] : []),
      ...input.scope.generatedMethods!.values(),
    ] };
}
