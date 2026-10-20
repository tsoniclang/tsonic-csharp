import { createHash } from "node:crypto";
import { sourceFileIdentity } from "@tsonic/target-api/source";

import type { CsharpProjectTypeCatalogHost } from "../../policy/types/project/project-types.js";
import type { CsharpProjectTypeDefinition, CsharpProjectTypeIssue } from "../../target-model/records/project-types.js";

export function analyzeCsharpProjectNames(
  host: CsharpProjectTypeCatalogHost,
  definitions: readonly CsharpProjectTypeDefinition[],
  issues: CsharpProjectTypeIssue[],
  replaceDefinition: (definition: CsharpProjectTypeDefinition) => void,
): void {
  const occupiedNames = new Set(definitions.filter(definition => !definition.local).map(definition => definition.sourceName));
  const allocate = (preferred: string): string => {
    let name = preferred;
    for (let suffix = 2; occupiedNames.has(name); suffix += 1) name = `${preferred}_${suffix}`;
    occupiedNames.add(name);
    return name;
  };
  const filesByName = new Map<string, Set<CsharpProjectTypeDefinition["sourceFile"]>>();
  for (const definition of definitions) {
    if (definition.local) continue;
    const files = filesByName.get(definition.sourceName) ?? new Set<CsharpProjectTypeDefinition["sourceFile"]>();
    files.add(definition.sourceFile);
    filesByName.set(definition.sourceName, files);
  }
  const moduleScopes = new Map<CsharpProjectTypeDefinition["sourceFile"], string>();
  const colliding = definitions.filter(definition => !definition.local &&
    (filesByName.get(definition.sourceName)?.size ?? 0) > 1).sort((left, right) => left.id.localeCompare(right.id));
  for (const definition of colliding) {
    let scopeName = moduleScopes.get(definition.sourceFile);
    if (scopeName === undefined) {
      const identity = sourceFileIdentity(host.ast, definition.sourceFile);
      if (identity === undefined) {
        issues.push({ node: definition.declaration, code: "CSHARP_PROJECT_TYPE_SCOPE_NOT_PROVEN",
          message: `Project type '${definition.sourceName}' requires an exact source module identity to preserve its authored name.` });
        continue;
      }
      scopeName = allocate(`__TsonicModule_${createHash("sha256").update(identity).digest("hex")}`);
      moduleScopes.set(definition.sourceFile, scopeName);
    }
    replaceDefinition(Object.freeze({ ...definition, scopeName }));
  }
  for (const definition of definitions.filter(definition => definition.local).sort((left, right) => left.id.localeCompare(right.id))) {
    const scopeName = allocate(`${definition.sourceName}Scope`);
    const selected = Object.freeze({ ...definition, scopeName, factoryName: allocate(`${scopeName}Factory`),
      factoryIdentityName: allocate(`I${scopeName}Instance`) });
    replaceDefinition(selected);
  }
}
