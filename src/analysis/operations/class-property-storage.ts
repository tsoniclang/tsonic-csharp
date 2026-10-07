import type { Node } from "@tsonic/tsts";
import { sourceObjectMemberDeclarations, sourceParameterIsProperty } from "@tsonic/target-api/source";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import type { CsharpSourceEvidenceIndex } from "../source-evidence/index.js";
import { isCsharpValueTypeTargetType } from "../../target-model/types/identity.js";
import { getCsharpNullableElementTargetType } from "../../target-model/types/nullable.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";

export interface CsharpClassPropertyStorage {
  readonly kind: "field" | "property";
  readonly readonly: boolean;
}

export function classifyCsharpClassPropertyStorage(
  policy: CsharpPolicyContext,
  evidence: CsharpSourceEvidenceIndex,
): (declaration: Node) => CsharpClassPropertyStorage | undefined {
  const selections = new WeakMap<Node, CsharpClassPropertyStorage>();
  for (const sourceFile of policy.sourceFiles) visit(sourceFile);
  return declaration => selections.get(declaration);

  function visit(node: Node): void {
    if (evidence.isCompileTimeMetadata(node)) return;
    if (policy.ast.is.IsClassDeclaration(node) || policy.ast.is.IsClassExpression(node)) {
      const shape = policy.objectShapes.resolveNode(node, policy.ast.getSourceFile(node));
      const properties = new Set((shape?.implements?.length ?? 0) > 0 ? shape!.members
        .filter(member => member.memberKind === "property").flatMap(member => member.sourceSubjects ?? []) : []);
      for (const member of sourceObjectMemberDeclarations(policy.ast, node)) {
        if (member === undefined || !policy.ast.is.IsPropertyDeclaration(member) &&
          !sourceParameterIsProperty(policy.ast, member)) continue;
        const declaration = policy.ast.as.AsPropertyDeclaration(member) ?? policy.ast.as.AsParameterDeclaration(member)!;
        const field = evidence.sourceField([member, declaration.name, declaration.Type, declaration.Initializer]);
        const dispatch = policy.navigation.memberDispatch(member);
        const contracts = policy.navigation.memberContracts(member);
        const interfaceProperty = contracts.kind === "resolved" && contracts.contracts.some(contract =>
          policy.ast.is.IsPropertySignatureDeclaration(contract));
        const kind = field !== undefined ? "field"
          : policy.ast.hasModifierKind(member, "abstract") ||
            interfaceProperty || properties.has(member) || dispatch?.overridesBase === true ||
            dispatch?.hasDerivedOverride === true ? "property" : "field";
        const sourceReadonly = policy.ast.hasModifierKind(member, "readonly");
        const type = kind === "field" && sourceReadonly && field === undefined
          ? policy.types.resolveStorage(member, policy.ast.getSourceFile(member)) : undefined;
        selections.set(member, Object.freeze({ kind, readonly: sourceReadonly &&
          (kind === "property" || field !== undefined || type !== undefined && readonlyFieldPreservesStorage(type)) }));
      }
    }
    policy.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  }
}

function readonlyFieldPreservesStorage(type: TargetTypeRef): boolean {
  const selected = getCsharpNullableElementTargetType(type) ?? type;
  return selected.kind !== "type-parameter" && (selected.kind === "source-primitive" || !isCsharpValueTypeTargetType(selected));
}
