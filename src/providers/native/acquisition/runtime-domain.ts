import type { ExtensionDiagnostic } from "@tsonic/tsts";
import type { CsharpProviderRuntimePreparation } from "../../model/relation-resolver.js";
import type { CsharpAcquiredRuntimeNativeDeclaration, CsharpAcquiredRuntimeProviderNativeDomain,
  CsharpRuntimeProviderNativeDomain, CsharpRuntimeProviderNativeDomainResolution } from "../../model/runtime-policy.js";
import type { DotnetModuleModel, DotnetTypeDeclaration } from "../model/types.js";
import type { DotnetProviderDiagnostic, DotnetTypeDataProvider } from "../model/provider.js";
import { completeDotnetProviderContext } from "../model/provider.js";
import { dotnetExtensionDiagnostic, dotnetProviderDiagnosticToExtensionDiagnostic, isDotnetProviderDiagnostic } from "../model/diagnostics.js";
import { createDotnetModuleSpecifier, type DotnetModuleSpecifierPolicy } from "../projection/module-specifier.js";
import { canonicalProviderValue } from "../../../target-model/metadata/canonical-value.js";
import type { CsharpRuntimeProjectSource } from "../../../target-model/project/runtime.js";
import { csharpRuntimeNativeDeclarationReferences } from "./runtime-references.js";
import { createCsharpMetadataBudget } from "../../../target-model/metadata/immutable.js";

export function createCsharpRuntimeNativeDomainQuery(input: {
  readonly providerId: string;
  readonly moduleSpecifierPolicy: DotnetModuleSpecifierPolicy;
  readonly getModule: DotnetTypeDataProvider["getModule"];
  readonly validateReferences: () => ExtensionDiagnostic | undefined;
  readonly acquireDeclaration: (original: DotnetTypeDeclaration) => CsharpAcquiredRuntimeNativeDeclaration | DotnetProviderDiagnostic;
  readonly acquireReference: (identity: string) => CsharpAcquiredRuntimeNativeDeclaration | DotnetProviderDiagnostic;
}) {
  const completed = new WeakMap<CsharpRuntimeProviderNativeDomain, {
    readonly input: string; readonly selection: CsharpRuntimeProviderNativeDomainResolution;
  }>();
  return (domain: CsharpRuntimeProviderNativeDomain, preparation: CsharpProviderRuntimePreparation,
    references: readonly string[]): CsharpRuntimeProviderNativeDomainResolution => {
    const referenceFailure = input.validateReferences();
    if (referenceFailure !== undefined) return Object.freeze({ kind: "rejected", diagnostic: referenceFailure });
    const previous = completed.get(domain);
    const identity = canonicalProviderValue(domain);
    if (previous !== undefined) return previous.input === identity ? previous.selection : rejected("DOTNET_RUNTIME_DOMAIN_INPUT_MUTATED",
      "A runtime Native domain changed after its selected-image acquisition.");
    const selected = produce(domain, preparation, references);
    completed.set(domain, { input: identity, selection: selected });
    return selected;
  };

  function rejected(code: string, message: string): CsharpRuntimeProviderNativeDomainResolution {
    return Object.freeze({ kind: "rejected", diagnostic: dotnetExtensionDiagnostic(input.providerId,
      code, 9200000, message) });
  }

  function produce(domain: CsharpRuntimeProviderNativeDomain, preparation: CsharpProviderRuntimePreparation,
    references: readonly string[]): CsharpRuntimeProviderNativeDomainResolution {
    if (domain.namespaces.length === 0 || new Set(domain.namespaces).size !== domain.namespaces.length ||
      domain.namespaces.some(namespace => namespace.length === 0)) return rejected("DOTNET_RUNTIME_DOMAIN_INVALID",
        "A runtime Native domain requires its complete nonempty unique namespace inventory.");
    const active = new Set<CsharpRuntimeProjectSource>();
    const visited = new Set<CsharpRuntimeProjectSource>();
    const sourceMatches = (source: CsharpRuntimeProjectSource): boolean => {
      if (visited.has(source)) return true;
      if (active.has(source)) return false;
      active.add(source);
      const matches = preparation.sources.filter(candidate => candidate.projectPath === source.projectPath &&
        candidate.propertiesPath === source.propertiesPath && canonicalProviderValue(candidate.dependencies) ===
          canonicalProviderValue(Object.fromEntries(Object.entries(source.dependencies ?? {}).map(([name, dependency]) => [name, dependency.projectPath]))));
      if (matches.length !== 1 || Object.values(source.dependencies ?? {}).some(dependency => !sourceMatches(dependency))) return false;
      active.delete(source);
      visited.add(source);
      return true;
    };
    if (!sourceMatches(domain.source)) return rejected("DOTNET_RUNTIME_DOMAIN_SOURCE_MISMATCH",
      "The runtime Native domain does not match the identical prepared source project, properties and dependency graph.");
    let selection: CsharpAcquiredRuntimeProviderNativeDomain["selection"];
    if (preparation.project.kind === "user-owned") selection = Object.freeze({ kind: "user-owned", projectFile: preparation.project.projectFile });
    else {
      const projects = preparation.projects.filter(project => project.sourceProject === domain.source.projectPath &&
        project.sourceProperties === domain.source.propertiesPath);
      if (projects.length !== 1) return rejected("DOTNET_RUNTIME_DOMAIN_PROJECT_MISSING",
        "The runtime Native domain requires exactly its actual prepared project instance.");
      selection = Object.freeze({ kind: "generated", project: projects[0]! });
    }
    if (references.length === 0) return rejected("DOTNET_RUNTIME_DOMAIN_REFERENCE_MISSING",
      "A runtime Native domain requires its actual selected reference image.");
    const modules: DotnetModuleModel[] = [];
    const declarations = new Map<string, CsharpAcquiredRuntimeNativeDeclaration>();
    const budget = createCsharpMetadataBudget();
    for (const namespace of domain.namespaces) {
      const module = input.getModule(createDotnetModuleSpecifier(namespace, input.moduleSpecifierPolicy),
        completeDotnetProviderContext({ broadImport: true }));
      if (isDotnetProviderDiagnostic(module)) return Object.freeze({ kind: "rejected",
        diagnostic: dotnetProviderDiagnosticToExtensionDiagnostic(input.providerId, module) });
      const originals = [...module.exports.filter((original): original is DotnetTypeDeclaration => original.kind === "type"),
        ...module.targetOnlyTypes ?? []];
      if (!originals.some(original => original.namespaceName === namespace)) return rejected("DOTNET_RUNTIME_DOMAIN_NAMESPACE_MISSING",
        `The selected runtime image did not publish the complete requested Native namespace '${namespace}'.`);
      const ids = new Set(originals.map(original => original.targetId));
      if ((module.unsupportedExports ?? []).some(original => original.kind === "unsupported-type-export"
        ? !ids.has(original.targetId) : original.targetIds.some(identity => !ids.has(identity)))) {
        return rejected("DOTNET_RUNTIME_DOMAIN_INVENTORY_INCOMPLETE",
          `The selected runtime namespace '${namespace}' did not retain every original Native declaration.`);
      }
      for (const original of originals) {
        budget.reserve(1);
        const acquired = input.acquireDeclaration(original);
        if ("code" in acquired) return Object.freeze({ kind: "rejected",
          diagnostic: dotnetProviderDiagnosticToExtensionDiagnostic(input.providerId, acquired) });
        declarations.set(original.targetId, acquired);
      }
      modules.push(module);
    }
    const pending = [...declarations.values()];
    for (let index = 0; index < pending.length; index += 1) {
      for (const identity of csharpRuntimeNativeDeclarationReferences(pending[index]!)) {
        if (declarations.has(identity)) continue;
        budget.reserve(1);
        const acquired = input.acquireReference(identity);
        if ("code" in acquired) return Object.freeze({ kind: "rejected",
          diagnostic: dotnetProviderDiagnosticToExtensionDiagnostic(input.providerId, acquired) });
        declarations.set(identity, acquired);
        pending.push(acquired);
      }
    }
    return Object.freeze({ kind: "resolved", domain: Object.freeze({ input: domain, selection,
      references: Object.freeze([...references]), modules: Object.freeze(modules), declarations: Object.freeze([...declarations.values()]) }) });
  }
}
