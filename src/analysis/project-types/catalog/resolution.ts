import type { Node } from "@tsonic/tsts";
import type { SourceSignatureIdentity } from "@tsonic/target-api/source";
import type { CsharpProjectForwardingConstructor, CsharpProjectTypeHeritage, CsharpProjectTypeIssue, CsharpProjectTypeCatalog, CsharpProjectTypePolicy } from "../../../target-model/records/types/project-types.js";
import { projectDefinitionTargetType } from "../../../policy/types/project/declaration-carriers.js";
import { createCsharpProjectTypePolicy, selectCsharpProjectTypeHeritage, type CsharpProjectTypePolicyHost } from "../type-policy.js";
import { csharpForwardingConstructorSignatureKey, selectCsharpProjectForwardingConstructor, type CsharpProjectConstructorPolicyHost } from "./constructors.js";

export interface CsharpProjectPolicyInput extends CsharpProjectTypePolicyHost {
  profileConstructors(declaration: Node): readonly import("../../../target-model/types/model.js").CsharpTargetMember[];
}

export function analyzeCsharpProjectTypePolicy(host: CsharpProjectPolicyInput, catalog: CsharpProjectTypeCatalog): CsharpProjectTypePolicy {
  const issues: CsharpProjectTypeIssue[] = [...catalog.issues];
  const heritageById = new Map<string, CsharpProjectTypeHeritage>();
  for (const definition of catalog.definitions) {
    const selected = selectCsharpProjectTypeHeritage(host, catalog, definition);
    if (selected.kind === "resolved") heritageById.set(definition.id, selected.heritage);
    else issues.push(selected.issue);
  }
  const constructorHost: CsharpProjectConstructorPolicyHost = {
    ast: host.ast, facts: host.facts, providers: host.providers, types: host.types,
    targetTypeForDefinition: projectDefinitionTargetType, profileConstructors: host.profileConstructors,
  };
  const byDeclaration = new WeakMap<Node, readonly CsharpProjectForwardingConstructor[]>();
  const bySignature = new WeakMap<Node, ReadonlyMap<SourceSignatureIdentity, CsharpProjectForwardingConstructor>>();
  for (const definition of catalog.definitions) {
    if (definition.kind !== "class") continue;
    const source = host.facts.navigation.classConstructors(definition.declaration);
    if (source.kind === "refused") {
      issues.push({ node: source.site, source: source.source, code: source.code, message: source.message });
      continue;
    }
    if (source.value.kind === "unresolved") {
      issues.push({ node: definition.declaration, code: "CSHARP_PROJECT_CONSTRUCTORS_SOURCE_UNRESOLVED", message: source.value.reason });
      continue;
    }
    const baseType = heritageById.get(definition.id)?.baseType;
    if (baseType === undefined || source.value.witness !== "implicit") {
      byDeclaration.set(definition.declaration, Object.freeze([]));
      bySignature.set(definition.declaration, new Map());
      continue;
    }
    const constructors: CsharpProjectForwardingConstructor[] = [];
    const signatures = new Map<SourceSignatureIdentity, CsharpProjectForwardingConstructor>();
    const physical = new Map<string, CsharpProjectForwardingConstructor>();
    let excluded = false;
    for (const signature of source.value.signatures) {
      const selected = selectCsharpProjectForwardingConstructor(constructorHost, definition, baseType, signature);
      if (selected.kind === "unresolved") { issues.push(selected.issue); continue; }
      if (selected.kind === "excluded") { excluded = true; continue; }
      const key = csharpForwardingConstructorSignatureKey(selected.constructor.targetMember.parameters);
      const previous = physical.get(key);
      if (previous !== undefined) {
        if (previous.baseMemberId !== selected.constructor.baseMemberId) {
          issues.push({ node: signature.identity.declaration ?? definition.declaration, code: "CSHARP_PROJECT_CONSTRUCTOR_TARGET_CONFLICT",
            message: "Coincident physical forwarding signatures cannot require different Native base constructors." });
        } else signatures.set(signature.identity, previous);
        continue;
      }
      physical.set(key, selected.constructor);
      constructors.push(selected.constructor);
      signatures.set(signature.identity, selected.constructor);
    }
    if (excluded && constructors.length === 0) issues.push({ node: definition.declaration,
      code: "CSHARP_PROJECT_CONSTRUCTOR_TARGET_UNRESOLVED",
      message: "Implicit constructor forwarding requires an accessible nonobsolete Native base constructor." });
    byDeclaration.set(definition.declaration, Object.freeze(constructors));
    bySignature.set(definition.declaration, signatures);
  }
  return createCsharpProjectTypePolicy(host.ast, catalog, heritageById, Object.freeze({
    issues: Object.freeze(issues),
    implicitConstructorsForDeclaration: (declaration: Node) => byDeclaration.get(declaration),
    implicitConstructorForSignature: (declaration: Node, signature: SourceSignatureIdentity) => bySignature.get(declaration)?.get(signature),
  }), Object.freeze(issues));
}
