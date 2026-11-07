// Object literals constructed as a CLR provider type (object-initializer construction). The Host publishes the
// literal's construction descriptor (the declared provider type), the provider type's members (facts.objects.members)
// and the literal's member correspondence. The type-level shape is provider-shapes.ts; this module adds the checks that
// belong to one literal: no index entries without an indexer relation, and every primitive initializer reaching its CLR
// member type exactly or by an implicit primitive conversion. No checker Type is read (I2).
import type { AstReader, Node } from "@tsonic/tsts";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import { sourceTypeDescriptorMemberOriginsEqual, sourceTypeDescriptorStructure, type SourceProgramFacts, type SourceRefusal,
  type SourceTypeDescriptor } from "@tsonic/target-api/source";
import { sourcePrimitiveImplicitlyConverts } from "../../../policy/conversions/source-primitives.js";
import { getCsharpNullableElementTargetType } from "../../../target-model/types/carriers/nullable.js";
import { csharpSourcePrimitiveTargetType } from "../../../target-model/types/carriers/scalar-types.js";
import { targetTypeRefEquals } from "../../../target-model/types/equality.js";
import type { CsharpObjectShapeFact, TargetTypeRef } from "../../../target-model/types/model.js";
import { csharpRefusal, csharpRepresentationContext, representSourceType,
  type CsharpRefusal, type CsharpRepresentationServices } from "../../../representation/index.js";
import { csharpProviderConstructionRefusalCode, isCsharpProviderObjectInitializerType,
  representCsharpProviderObjectShape } from "./provider-shapes.js";

/**
 * The CLR shape of an object literal whose Host construction is a provider type with object-initializer construction:
 * the shape, or the refusal that stops it. undefined: the construction is not such a provider type (not applicable).
 */
export function resolveCsharpProviderObjectLiteralShape(
  services: CsharpRepresentationServices,
  objectLiteral: Node,
  construction: SourceTypeDescriptor,
  carrier: TargetTypeRef,
): CsharpObjectShapeFact | CsharpRefusal | SourceRefusal | undefined {
  const declared = construction.kind === "optional" ? construction.value : construction;
  if (declared.kind !== "declared" || !isCsharpProviderObjectInitializerType(services, declared.declaration)) return undefined;
  const { facts, syntax: ast } = services;
  const indexer = csharpProviderObjectLiteralIndexerFailure(declared, objectLiteral, { ast, facts });
  if (indexer !== undefined) return csharpRefusal(csharpProviderConstructionRefusalCode, indexer, objectLiteral);
  const shape = representCsharpProviderObjectShape({
    facts, syntax: ast, sourceFacts: services.sourceFacts, providers: services.providers,
    represent: (type, occurrence) => representSourceType(type, csharpRepresentationContext(services, occurrence, "storage")),
  }, declared, objectLiteral, carrier);
  if ("kind" in shape) return shape;
  const outcome = facts.values.type(objectLiteral);
  const correspondence = outcome.kind === "refused" ? [] : outcome.memberCorrespondence ?? [];
  for (const member of shape.members) {
    // Every provider shape member carries its Host origin (provider-shapes.ts); without it the per-initializer conversion
    // check would be skipped, so a missing origin is an invariant failure (RC2 #4, I4), never a skip.
    const origin = member.origins?.[0];
    if (origin === undefined) return failTargetAnalysisInvariant("tsonic-csharp",
      "A provider object-initializer member has no Host member origin.", objectLiteral);
    const expected = getCsharpNullableElementTargetType(member.type) ?? member.type;
    if (expected.kind !== "source-primitive") continue;
    for (const entry of correspondence) {
      if (!sourceTypeDescriptorMemberOriginsEqual(entry.origin, origin) || !ast.is.IsPropertyAssignment(entry.property)) continue;
      const initializer = ast.as.AsPropertyAssignment(entry.property)?.Initializer;
      const value = initializer === undefined ? undefined : facts.values.type(initializer);
      if (value === undefined || value.kind === "refused") continue;
      const actual = sourceTypeDescriptorStructure(value.construction ?? value.type);
      if (actual.kind !== "primitive") continue;
      const primitive = csharpSourcePrimitiveTargetType(actual.primitive);
      if (!targetTypeRefEquals(primitive, expected) && !sourcePrimitiveImplicitlyConverts(expected, primitive)) {
        return csharpRefusal(csharpProviderConstructionRefusalCode,
          `The initializer of '${member.sourceName}' has no implicit .NET conversion to CLR member '${member.targetName}'.`, entry.property);
      }
    }
  }
  return shape;
}

/**
 * Index entries of an object literal typed as an indexed provider type need a selected CLR indexer relation, which
 * object-initializer construction does not supply. Named members and empty spreads are not index entries.
 */
export function csharpProviderObjectLiteralIndexerFailure(
  descriptor: SourceTypeDescriptor,
  occurrence: Node,
  host: { readonly ast: AstReader; readonly facts: SourceProgramFacts },
): string | undefined {
  const { ast, facts } = host;
  const structure = sourceTypeDescriptorStructure(descriptor.kind === "optional" ? descriptor.value : descriptor);
  if (structure.kind !== "shape" || structure.indexes.length === 0 || !ast.is.IsObjectLiteralExpression(occurrence)) return undefined;
  const outcome = facts.values.type(occurrence);
  const correspondence = outcome.kind === "refused" ? [] : outcome.memberCorrespondence ?? [];
  const named = new Set(correspondence.filter(entry => structure.members.some(member =>
    sourceTypeDescriptorMemberOriginsEqual(member.origin, entry.origin))).map(entry => entry.property));
  const noIndexEntries = ast.properties(occurrence).every(property => {
    if (property === undefined) return false;
    if (named.has(property)) return true;
    if (!ast.is.IsSpreadAssignment(property)) return false;
    const expression = ast.as.AsSpreadAssignment(property)?.Expression;
    const spread = expression === undefined ? undefined : facts.values.type(expression);
    if (spread === undefined || spread.kind === "refused") return false;
    let selected = sourceTypeDescriptorStructure(spread.construction ?? spread.type);
    while (selected.kind === "optional") selected = sourceTypeDescriptorStructure(selected.value);
    return selected.kind === "shape" && selected.members.length === 0 && selected.indexes.length === 0 &&
      selected.calls.length === 0 && selected.constructs.length === 0;
  });
  return noIndexEntries ? undefined : "Object-literal index entries require an exact selected C# provider indexer relation.";
}
