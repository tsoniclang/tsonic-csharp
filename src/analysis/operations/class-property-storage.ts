import { sealCsharpClassPropertyStorage } from "../program/records/storage/class-property-storage.js";
import { csharpReadonlyFieldPreservesStorage } from "../../policy/ownership/class-properties.js";
import type { CsharpClassPropertyStorage } from "../../target-model/records/storage/class-property-storage.js";
import type { Node } from "@tsonic/tsts";
import { sourceObjectMemberDeclarations, sourceParameterIsProperty } from "@tsonic/target-api/source";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import { isCsharpRefusal } from "../../representation/index.js";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpSourceEvidenceIndex } from "../../target-model/records/program/source-evidence.js";

export function classifyCsharpClassPropertyStorage(
  policy: CsharpPolicyContext,
  evidence: CsharpSourceEvidenceIndex,
): (declaration: Node) => CsharpClassPropertyStorage | undefined {
  const selections = new WeakMap<Node, CsharpClassPropertyStorage>();
  for (const sourceFile of policy.sourceFiles) visit(sourceFile);
  return sealCsharpClassPropertyStorage(selections);

  function visit(node: Node): void {
    if (evidence.compileTimeMetadata.get(node)) return;
    if (policy.ast.is.IsClassDeclaration(node) || policy.ast.is.IsClassExpression(node)) {
      const shape = policy.objectShapes.resolveNode(node);
      const properties = new Set((shape?.implements?.length ?? 0) > 0 ? shape!.members
        .filter(member => member.memberKind === "property").flatMap(member => member.sourceSubjects ?? []) : []);
      for (const member of sourceObjectMemberDeclarations(policy.ast, node)) {
        if (member === undefined || !policy.ast.is.IsPropertyDeclaration(member) &&
          !sourceParameterIsProperty(policy.ast, member)) continue;
        const declaration = policy.ast.as.AsPropertyDeclaration(member) ?? policy.ast.as.AsParameterDeclaration(member)!;
        const field = evidence.sourceField.get([member, declaration.name, declaration.Type, declaration.Initializer]);
        // The member's own dispatch (its implementation in its declaring class) and the contracts it implements (Host object
        // facts). A Host refusal of either is forwarded before C# analysis (facts.refusals()), so it is an invariant here.
        const implementation = policy.facts.objects.implementation(node, member);
        if (implementation !== "unrelated" && "code" in implementation) refusedObjectFact(implementation.code, member);
        const dispatch = implementation === "unrelated" ? undefined : implementation;
        const contracts = policy.facts.objects.contracts(member);
        if (!Array.isArray(contracts)) refusedObjectFact((contracts as { readonly code: string }).code, member);
        const interfaceProperty = (contracts as readonly Node[]).some(contract =>
          policy.ast.is.IsPropertySignatureDeclaration(contract));
        const kind = field !== undefined ? "field"
          : policy.ast.hasModifierKind(member, "abstract") ||
            interfaceProperty || properties.has(member) || dispatch?.overridesBase === true ||
            dispatch?.hasDerivedOverride === true ? "property" : "field";
        const sourceReadonly = policy.ast.hasModifierKind(member, "readonly");
        const storage = kind === "field" && sourceReadonly && field === undefined ? policy.types.storage(member) : undefined;
        const type = storage === undefined || isCsharpRefusal(storage) ? undefined : storage;
        selections.set(member, Object.freeze({ kind, readonly: sourceReadonly &&
          (kind === "property" || field !== undefined || type !== undefined && csharpReadonlyFieldPreservesStorage(type)) }));
      }
    }
    policy.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  }
}

function refusedObjectFact(code: string, site: Node): never {
  return failTargetAnalysisInvariant("tsonic-csharp",
    `A Host object-fact refusal (${code}) reached C# class property storage; Host refusals are forwarded before C# analysis.`, site);
}
