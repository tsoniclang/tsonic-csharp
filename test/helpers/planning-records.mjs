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
/** A .NET refusal standing for "no carrier" in fixtures whose host does not represent the queried node. */
export function unrepresentedCsharpCarrier(site) {
  return Object.freeze({ kind: "csharp-refused", code: "CSHARP_TEST_UNREPRESENTED", message: "The fixture does not represent this node.", site });
}

/**
 * Source-profile inputs over published facts (createCsharpSourceProfileInputs). `values` are { expression, type }
 * with published descriptors; `call` is a CsharpSourceProfileCallSource. A host without `types` represents nothing.
 */
export function csharpSourceProfileInputs(host, { values = [], operation, requirements, call } = {}) {
  if (operation === undefined) throw new TypeError("Source-profile fixtures require the exact operation occurrence, not a published result descriptor.");
  const complete = {
    ...host,
    facts: host.facts ?? {
      values: { literal: () => undefined },
      objects: { member: () => undefined },
      selections: { objectLiteralElement: () => undefined, call: () => undefined },
      navigation: { identity: { target: () => undefined } },
    },
    ast: host.ast ?? { getSourceFile: () => undefined, is: { IsSpreadElement: () => false, IsObjectLiteralExpression: () => false,
      IsParenthesizedExpression: () => false, IsIdentifier: () => false, IsNewExpression: () => false }, kindName: () => "" },
    projectTypes: host.projectTypes ?? { directSupertypes: () => [] },
    providers: host.providers ?? createCsharpProviderRelationResolver({ providers: [], providerPolicies: [] }),
    types: { value: unrepresentedCsharpCarrier, represent: (_type, site) => unrepresentedCsharpCarrier(site),
      instantiation: () => undefined, ...host.types },
  };
  return createCsharpSourceProfileInputs(complete, values, operation, requirements, call);
}
