// Planner unit fixtures read the same record families the analysis publishes. These builders produce those records
// with the analysis's own producers, so a fixture never hand-writes a decision the analysis owns.
import { analyzeCsharpTypeEmission } from "../../dist/analysis/source-evidence/types/emission.js";
import { admitCsharpDelegateEmission } from "../../dist/analysis/conversions/callable-emission.js";
import { createCsharpDelegateContractProducer } from "../../dist/analysis/program/records/callables/callable-conversions.js";
import { createCsharpSourceProfileInputs } from "../../dist/analysis/program/records/program/source-profile-inputs.js";
import { createCsharpProviderRelationResolver } from "../../dist/providers/native/projection/relation-resolution.js";

// records.typeEmission for any queried carrier, computed by analyzeCsharpTypeEmission over that carrier alone.
// targetShapes: the object-shape facts by targetTypeRefKey that the carrier may reach.
export function csharpTypeEmissionRecord({ targetShapes = {}, languageDialect = "csharp14" } = {}) {
  return Object.freeze({ get(carrier) {
    if (carrier === undefined) return undefined;
    const analysis = analyzeCsharpTypeEmission({ ast: { parent: () => undefined }, nodes: [], languageDialect, extraTypes: [carrier],
      evidence: { targetTypes: [], typeParameterConstraints: { get: () => undefined } },
      values: { valueRead: { get: () => undefined } }, storage: { storageType: { get: () => undefined } },
      shapes: { targetShapes }, admitted: () => false });
    return analysis.records.typeEmission.get(carrier);
  } });
}

// records.delegateContract for exactly the admitted [source, target, selection] conversions.
export function csharpDelegateContractRecord(conversions) {
  const producer = createCsharpDelegateContractProducer();
  for (const [source, target, selection] of conversions) admitCsharpDelegateEmission(producer, source, target, selection);
  producer.seal();
  return producer.records.delegateContract;
}

// The source-profile input facts the analysis computes for a policy call (createCsharpSourceProfileInputs, as in
// analysis/operations/source-profiles/policy-selection.ts). Fixture hosts supply only the type queries their policy reads;
// every other query answers that the fixture has no such evidence.
export function csharpSourceProfileInputs(host, sourceFile, { values = [], operation, selected = [], requirements, source } = {}) {
  if (operation === undefined) throw new TypeError("Source-profile fixtures require the exact operation occurrence, not a checked result Type.");
  const complete = {
    ...host,
    semantics: host.semantics ?? (() => ({ sourceFile,
      operations: { call: node => node === operation ? source : undefined, propertyAccess: () => undefined, elementAccess: () => undefined },
      types: { isNumberLike: () => false, relationship: () => undefined } })),
    ast: host.ast ?? { getSourceFile: node => node === operation ? sourceFile : undefined,
      arguments: node => node === operation ? (source?.sourceArguments ?? []).map(argument => argument.expression) : [],
      is: { IsSpreadElement: () => false } },
    projectTypes: host.projectTypes ?? { directSupertypes: () => [] },
    providers: host.providers ?? createCsharpProviderRelationResolver({ providers: [], providerPolicies: [] }),
    types: { resolveType: () => undefined, resolveNode: () => undefined, resolveSelectedValue: () => undefined,
      resolveSelectedType: () => undefined, resolveSourceCallTypeArguments: () => undefined,
      resolveSourceCallResult: () => undefined, resolveSourceCallParameter: () => undefined,
      resolveSelectedResult: () => undefined, ...host.types },
  };
  return createCsharpSourceProfileInputs(complete, sourceFile, values, operation, selected, requirements, source);
}
