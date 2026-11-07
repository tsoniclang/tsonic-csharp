import type { Node } from "@tsonic/tsts";
import type { SourceTypeDescriptor } from "@tsonic/target-api/source";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type {
  CsharpProjectForwardingConstructor,
  CsharpProjectTypeHeritage,
  CsharpProjectTypeIssue,
} from "../../../target-model/records/types/project-types.js";
import { projectDefinitionTargetType } from "../../../policy/types/project/declaration-carriers.js";
import { type CsharpProjectTypeCatalog, type CsharpProjectTypePolicy } from "../../../target-model/records/types/project-types.js";
import { createCsharpProjectTypePolicy, selectCsharpProjectTypeHeritage, type CsharpProjectTypePolicyHost } from "../type-policy.js";
import { csharpForwardingConstructorSignatureKey, selectCsharpProjectConstructorSignature, selectCsharpProjectForwardingConstructor, type CsharpProjectConstructorPolicyHost } from "./constructors.js";
import { type CsharpProjectConstructorPolicy } from "../../../target-model/records/types/project-types.js";

export function analyzeCsharpProjectTypePolicy(
  host: CsharpProjectTypePolicyHost,
  catalog: CsharpProjectTypeCatalog,
): CsharpProjectTypePolicy {
  const issues: CsharpProjectTypeIssue[] = [...catalog.issues];
  const heritageById = new Map<string, CsharpProjectTypeHeritage>();
  for (const definition of catalog.definitions) {
    const selected = selectCsharpProjectTypeHeritage(host, catalog, definition);
    if (selected.kind === "resolved") {
      heritageById.set(definition.id, selected.heritage);
    } else {
      issues.push(selected.issue);
    }
  }
  const constructorHost: CsharpProjectConstructorPolicyHost = {
    ast: host.ast,
    facts: host.facts,
    providers: host.providers,
    sourceFacts: host.sourceFacts,
    types: host.types,
    targetTypeForDefinition: projectDefinitionTargetType,
  };
  const constructorIssues: CsharpProjectTypeIssue[] = [];
  const definitionsById = new Map(
    catalog.definitions.map(definition => [definition.id, definition]),
  );
  const constructorsByDeclaration = new WeakMap<
    Node,
    readonly CsharpProjectForwardingConstructor[]
  >();
  const constructorsBySignature = new WeakMap<
    Node,
    ReadonlyMap<Node, CsharpProjectForwardingConstructor>
  >();
  for (const definition of catalog.definitions) {
    if (definition.kind !== "class") continue;
    const heritage = heritageById.get(definition.id);
    if (heritage?.baseType === undefined) {
      constructorsByDeclaration.set(definition.declaration, Object.freeze([]));
      constructorsBySignature.set(definition.declaration, new Map());
      continue;
    }
    const source = host.facts.objects.construction(definition.declaration);
    if ("code" in source) return failTargetAnalysisInvariant("tsonic-csharp",
      "Class construction is a Host refusal at a node C# analyzed; Host refusals are forwarded before C# analysis.", definition.declaration);
    if (!source.implicit) {
      constructorsByDeclaration.set(definition.declaration, Object.freeze([]));
      constructorsBySignature.set(definition.declaration, new Map());
      continue;
    }
    const constructors: CsharpProjectForwardingConstructor[] = [];
    let excludedConstructor = false;
    // Keyed by the inherited construct signature declaration (selections.call(use).signature); a declaration-less
    // implicit default constructor is keyed by the class declaration.
    const signatures = new Map<Node, CsharpProjectForwardingConstructor>();
    const constructorsByTargetSignature = new Map<
      string,
      CsharpProjectForwardingConstructor
    >();
    for (const sourceSignature of source.signatures) {
      const selected = selectCsharpProjectForwardingConstructor(
        constructorHost,
        definition,
        heritage.baseType,
        sourceSignature,
        definitionsById,
        heritageById,
      );
      if (selected.kind === "unresolved") {
        constructorIssues.push(selected.issue);
        continue;
      }
      if (selected.kind === "excluded") {
        excludedConstructor = true;
        continue;
      }
      const key = csharpForwardingConstructorSignatureKey(
        selected.constructor.targetMember.parameters,
      );
      const existing = constructorsByTargetSignature.get(key);
      if (existing !== undefined) {
        if (existing.baseMemberId !== selected.constructor.baseMemberId) {
          constructorIssues.push({
            node: sourceSignature.declaration ?? definition.declaration,
            code: "CSHARP_PROJECT_CONSTRUCTOR_TARGET_CONFLICT",
            message: "Two inherited source constructors collapse to one C# signature but require different base constructors.",
          });
          continue;
        }
        signatures.set(sourceSignature.declaration ?? definition.declaration, existing);
        continue;
      }
      constructors.push(selected.constructor);
      constructorsByTargetSignature.set(key, selected.constructor);
      signatures.set(sourceSignature.declaration ?? definition.declaration, selected.constructor);
    }
    if (excludedConstructor && constructors.length === 0) {
      constructorIssues.push({ node: definition.declaration, code: "CSHARP_PROJECT_CONSTRUCTOR_TARGET_UNRESOLVED",
        message: "Implicit constructor forwarding requires an accessible nonobsolete native base constructor." });
    }
    constructorsByDeclaration.set(
      definition.declaration,
      Object.freeze(constructors),
    );
    constructorsBySignature.set(definition.declaration, signatures);
  }
  const constructors: CsharpProjectConstructorPolicy = Object.freeze({
    issues: Object.freeze(constructorIssues),
    implicitConstructorsForDeclaration(declaration: Node) {
      return constructorsByDeclaration.get(declaration);
    },
    implicitConstructorForSignature(
      declaration: Node,
      signature: Node,
      parameters: readonly SourceTypeDescriptor[],
    ) {
      return selectCsharpProjectConstructorSignature(
        constructorHost,
        declaration,
        signature,
        parameters,
        constructorsBySignature.get(declaration)?.get(signature),
        constructorsByDeclaration.get(declaration),
      );
    },
  });
  return createCsharpProjectTypePolicy(
    host.ast,
    catalog,
    heritageById,
    constructors,
    Object.freeze([...issues, ...constructorIssues]),
  );
}
