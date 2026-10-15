import type { Node } from "@tsonic/tsts";
import type { TargetSourceProgram } from "@tsonic/target-api/source";
import { createSourceErrorStorageDemandQuery, type SourceErrorStorageDemandQueries, type SourceStorageQueries } from "@tsonic/target-api/analysis";
import { csharpSourceProfileDeclarationIdentity } from "../../policy/operations/source-profiles/source-profile-identity.js";
import { csharpSourceErrorNames } from "../../target-model/identities/source-errors.js";

export function createCsharpErrorStorageDemandQuery(source: TargetSourceProgram, storage: SourceStorageQueries): SourceErrorStorageDemandQueries {
  const fields = new Set<Node>();
  const constructors = new Set<Node>();
  const stackCaptures = new Set<Node>();
  for (const file of source.sourceFiles) {
    if (!source.semantics.includes(file)) continue;
    const semantics = source.semantics.forFile(file);
    for (const statement of source.ast.statements(file)) {
      if (statement === undefined || !source.ast.is.IsInterfaceDeclaration(statement)) continue;
      for (const member of source.ast.members(statement)) {
        const identity = csharpSourceProfileDeclarationIdentity(source.ast, semantics, source.sourceFacts, member);
        if (member === undefined || identity === undefined) continue;
        if ((identity.kind === "call" || identity.kind === "construct") &&
          csharpSourceErrorNames.some(name => identity.declaringName === `${name}Constructor`)) constructors.add(member);
        if (identity.kind === "member" && identity.declaringName === "Error" &&
          ["name", "message", "stack"].includes(identity.name ?? "")) fields.add(member);
        if (identity.kind === "member" && identity.declaringName === "ErrorConstructor" &&
          identity.name === "captureStackTrace") stackCaptures.add(member);
      }
    }
  }
  return createSourceErrorStorageDemandQuery(source, { fields: [...fields], constructors: [...constructors],
    stackCaptures: [...stackCaptures], storageMutators: [...stackCaptures].map(signature => ({ signature, sourceParameterIndex: 0 })),
    retention: () => ({ kind: "ordinary" }) }, storage);
}
