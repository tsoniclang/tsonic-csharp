// The object-shape registry (BF16 canonical shapes) over Host object facts. A shape is found by its .NET carrier;
// the carrier of a node comes from the one representation (facts.values -> representSourceType). Project class,
// interface and struct shapes come from facts.objects.members of the declaration's own reference.
import type { Node } from "@tsonic/tsts";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import { sourceTypeDescriptorStructure, type SourceObjectMember, type SourceTypeDescriptor,
  type SourceTypeOutcome } from "@tsonic/target-api/source";
import { sourceValueType } from "../../program/source-facts.js";
import type { CsharpObjectShapeFact, CsharpObjectShapeMemberFact, CsharpSourceMemberKey, CsharpTargetNamedTypeRef,
  CsharpRuntimeUnionTargetTypeRef, TargetTypeRef } from "../../../target-model/types/model.js";
import type { CsharpObjectLiteralTargetShapeResolution, CsharpProjectConstructibleTypeProjection } from "../../../target-model/records/objects/object-shapes.js";
import { targetTypeRefEquals, targetTypeRefKey } from "../../../target-model/types/equality.js";
import { csharpObjectShapesEqual } from "../../../target-model/types/object-shape-equality.js";
import { csharpObjectShapeContractKey } from "../../../target-model/types/object-shape-identity.js";
import { csharpSourceMemberKeysEqual } from "../../../target-model/types/source-member-keys.js";
import { getCsharpNullableElementTargetType } from "../../../target-model/types/carriers/nullable.js";
import { isCsharpJsValueTargetType } from "../../../target-model/types/carriers/runtime-carriers.js";
import { instantiateCsharpObjectShape } from "../../../policy/types/objects/instantiation.js";
import { classifyCsharpSourceProfileDeclaration } from "../../../policy/identities/source-types.js";
import { csharpSourceTypeParameter } from "../../../source/extension/type-parameters.js";
import { retainCsharpGenericCallableValue } from "../../callables/generics/generic-values.js";
import { authoredTypeDescriptor, csharpRepresentationContext, isCsharpRepresented, representObjectMembers, representSourceType,
  representValue } from "../../../representation/index.js";
import { readCsharpSourceStruct } from "../../../source/extension/markers.js";
import type { CsharpSourceStruct } from "../../../target-model/records/program/source-markers.js";
import { objectShapeMemberTargetName } from "../../../policy/identities/source-member-names.js";
import { mergeCsharpObjectShapeSubjects } from "./construction.js";
import { csharpProjectDeclarationDescriptor } from "./declaration-descriptors.js";
import { resolveCsharpCopiedObjectShape, retainCsharpMethodValueContracts } from "./method-values.js";
import { createCsharpNativeShapeProjections } from "./native-projections.js";
import { resolveCsharpProviderObjectLiteralShape } from "./provider-construction.js";
import type { CsharpObjectShapePolicyHost, CsharpRecursiveObjectShapePolicy } from "./model.js";

export function createCsharpObjectShapePolicy(host: CsharpObjectShapePolicyHost): CsharpRecursiveObjectShapePolicy {
  const environment = host.typeParameterConstraints;
  const nodeShapes = new WeakMap<Node, CsharpObjectShapeFact>();
  const targetShapes = new Map<string, CsharpObjectShapeFact>();
  const genericShapes = new Map<string, CsharpObjectShapeFact>();
  const declarationShapes = new Map<Node, CsharpObjectShapeFact | undefined>();
  const methodValues = () => ({ storage: host.sourceStorage, facts: host.representation().facts, ast: host.ast });

  const { resolveNativeParameter, resolveNativeReturn } = createCsharpNativeShapeProjections(host, methodValues, {
    resolveTarget, rememberTargetShape,
    representNode: node => {
      const selected = representValue(node, csharpRepresentationContext(host.representation(), node, "storage"));
      return isCsharpRepresented(selected) ? selected : undefined;
    },
  });

  function representedCarrier(descriptor: SourceTypeDescriptor, occurrence: Node): TargetTypeRef | undefined {
    const selected = representSourceType(descriptor, csharpRepresentationContext(host.representation(), occurrence, "storage"));
    return isCsharpRepresented(selected) ? selected : undefined;
  }

  function resolveTarget(type: TargetTypeRef | undefined): CsharpObjectShapeFact | undefined {
    if (type === undefined) return undefined;
    const nullableElement = getCsharpNullableElementTargetType(type);
    if (nullableElement !== undefined) return resolveTarget(nullableElement);
    const direct = targetShapes.get(targetTypeRefKey(type));
    if (direct !== undefined) return direct;
    if (type.kind !== "target-named") return undefined;
    const definition = host.projectTypeCatalog.definitionForTarget(type);
    if (definition !== undefined && definition.kind !== "enum") {
      const template = resolveDeclarationShape(definition.declaration);
      if (template === undefined) return undefined;
      if (targetTypeRefEquals(template.targetType, type)) return template;
      const selected = instantiateCsharpObjectShape(template, type);
      return selected === undefined ? undefined : rememberTargetShape(selected);
    }
    const template = genericShapes.get(type.id);
    if (template !== undefined) {
      const selected = instantiateCsharpObjectShape(template, type);
      if (selected !== undefined) return rememberTargetShape(selected);
    }
    const union = type as Partial<CsharpRuntimeUnionTargetTypeRef>;
    const shapes = union.csharpRuntimeUnionObjectShapes;
    if (union.csharpRuntimeUnionArms === undefined || shapes === undefined) return undefined;
    const present = shapes.filter((shape): shape is CsharpObjectShapeFact => shape !== undefined);
    return present.length === 1 ? present[0] : undefined;
  }

  /** The open shape of a project class / interface / struct: Host members of the declaration's own reference. */
  function resolveDeclarationShape(declaration: Node): CsharpObjectShapeFact | undefined {
    if (declarationShapes.has(declaration)) return declarationShapes.get(declaration);
    declarationShapes.set(declaration, undefined);
    const services = host.representation();
    const definition = host.projectTypeCatalog.definitionForDeclaration(declaration);
    if (definition === undefined) return undefined;
    const struct = definition.kind === "struct" ? readCsharpSourceStruct(services.sourceFacts, declaration) : undefined;
    if (struct !== undefined) {
      const shape = resolveStructShape(declaration, struct);
      declarationShapes.set(declaration, shape);
      return shape;
    }
    const binders = [...definition.outerTypeParameters, ...definition.typeParameters];
    const members = services.facts.objects.members(csharpProjectDeclarationDescriptor(definition));
    if (!Array.isArray(members)) return undefined;
    const facts = representObjectMembers((members as readonly SourceObjectMember[]).filter(member => !member.static),
      csharpRepresentationContext(services, declaration, "storage"));
    if (!Array.isArray(facts)) return undefined;
    const arguments_ = binders.map(binder => csharpSourceTypeParameter(binder, host.ast));
    if (arguments_.some(argument => argument === undefined)) return undefined;
    const outer = definition.outerTypeParameters.length;
    const targetType = host.projectTypeCatalog.targetTypeForDeclaration(declaration, [
      ...arguments_.slice(0, outer) as TargetTypeRef[], ...definition.outerTypeProjections,
      ...arguments_.slice(outer) as TargetTypeRef[], ...definition.typeProjections,
    ]);
    if (targetType === undefined) return undefined;
    const shape = rememberTargetShape(Object.freeze({ targetType, members: facts as readonly CsharpObjectShapeMemberFact[],
      ...(definition.kind === "class" ? { constructible: !definition.abstract } : {}) }));
    declarationShapes.set(declaration, shape);
    return shape;
  }

  /**
   * A struct declared by the struct marker: one property per marker field, typed by the field's authored type node
   * (Host descriptor), in marker order; member origins from the Host member correspondence of the declaration.
   */
  function resolveStructShape(declaration: Node, struct: CsharpSourceStruct): CsharpObjectShapeFact | undefined {
    const services = host.representation();
    const targetType = host.projectTypeCatalog.targetTypeForDeclaration(declaration, []);
    if (targetType === undefined) return undefined;
    const outcome = services.facts.values.type(declaration);
    const correspondence = outcome.kind === "refused" ? undefined : outcome.memberCorrespondence;
    const members: CsharpObjectShapeMemberFact[] = [];
    for (const field of struct.fields) {
      let property: Node | undefined = host.ast.parent(field.sourceType);
      while (property !== undefined && !host.ast.is.IsPropertyAssignment(property) && property !== declaration) property = host.ast.parent(property);
      if (property === declaration) property = undefined;
      const type = representSourceType(authoredTypeDescriptor(field.sourceType, csharpRepresentationContext(services, field.sourceType, "storage")),
        csharpRepresentationContext(services, field.sourceType, "storage"));
      if (!isCsharpRepresented(type)) return undefined;
      const pair = property === undefined ? undefined : correspondence?.find(entry => entry.property === property);
      members.push(Object.freeze({
        sourceKey: Object.freeze({ kind: "property" as const, name: field.sourceName }),
        sourceName: field.sourceName,
        targetName: objectShapeMemberTargetName(field.sourceName),
        memberKind: "property" as const,
        type,
        ...(field.readonly ? { readonly: true } : {}),
        ...(property !== undefined && services.memoryBindings.hasBoundField([property]) ? { bound: true as const } : {}),
        ...(pair === undefined ? {} : { origins: Object.freeze([pair.origin]) }),
        ...(property === undefined ? {} : { sourceDeclarations: Object.freeze([property]) }),
        sourceSubjects: Object.freeze([field.sourceType, ...(property === undefined ? [] : [property])]),
      }));
    }
    return rememberTargetShape(Object.freeze({ targetType, members: Object.freeze(members), constructible: true }));
  }

  /**
   * The published Host outcome of a node C# analyzes. Host refusals were forwarded unchanged before C# analysis (R5), so
   * a refused outcome is read through the shared invariant reader (analysis/program/source-facts.ts), which fails as a
   * Host producer defect; it never becomes a C# rejection (K-2670, I4).
   */
  function publishedOutcome(node: Node): Exclude<SourceTypeOutcome, { readonly kind: "refused" }> {
    const facts = host.representation().facts;
    const outcome = facts.values.type(node);
    if (outcome.kind !== "refused") return outcome;
    sourceValueType(facts, node);
    return failTargetAnalysisInvariant("tsonic-csharp", "The shared Source reader admitted a refused value.", node);
  }

  /**
   * The one present arm of a descriptor: `optional` lifted, and a sum whose arms are one value arm plus absence arms
   * reduced to that arm (the same rule native construction applies to its constructions). undefined: several value
   * arms, so no single shape.
   */
  function presentArm(descriptor: SourceTypeDescriptor): SourceTypeDescriptor | undefined {
    const visited = new Set<SourceTypeDescriptor>();
    let selected = descriptor;
    while (!visited.has(selected)) {
      visited.add(selected);
      if (selected.kind === "optional") { selected = selected.value; continue; }
      const structure = sourceTypeDescriptorStructure(selected);
      if (structure.kind !== "union") return selected;
      const present = structure.types.filter(arm => {
        const armStructure = sourceTypeDescriptorStructure(arm);
        return armStructure.kind !== "intrinsic" || armStructure.intrinsic !== "absence";
      });
      if (present.length !== 1) return undefined;
      selected = present[0]!;
    }
    return failTargetAnalysisInvariant("tsonic-csharp", "A Host type descriptor contains itself as its only present arm.");
  }

  /**
   * The object-initializer shape of a CLR provider type at one occurrence (provider-construction.ts: the type-level
   * shape of provider-shapes.ts plus the occurrence's own literal checks), the refusal that stops it, or undefined when
   * `arm` is not a provider type declaring object-initializer construction (the applicability test native
   * construction uses too).
   */
  function resolveProviderShape(occurrence: Node, arm: SourceTypeDescriptor, carrier: TargetTypeRef) {
    return resolveCsharpProviderObjectLiteralShape(host.representation(), occurrence, arm,
      getCsharpNullableElementTargetType(carrier) ?? carrier);
  }

  function resolveNode(node: Node | undefined): CsharpObjectShapeFact | undefined {
    if (node === undefined) return undefined;
    const remembered = nodeShapes.get(node);
    if (remembered !== undefined) return remembered;
    const outcome = host.representation().facts.values.type(node);
    if (outcome.kind === "refused") return undefined;
    // An object literal's shape is its Host construction (the selected arm's object, C-2479), not its destination.
    const construction = outcome.construction ?? outcome.type;
    const carrier = representedCarrier(construction, node);
    if (carrier === undefined) return undefined;
    // A CLR provider type with object-initializer construction has no registered Source shape: its shape is built from
    // its provider member relations at this occurrence (R-C5-2). A refused provider shape gives no shape here; the
    // object-literal resolution reports the refusal's reason.
    const arm = presentArm(construction);
    const provider = arm === undefined ? undefined : resolveProviderShape(node, arm, carrier);
    if (provider !== undefined) return "kind" in provider ? undefined : remember(node, provider);
    return resolveTarget(carrier);
  }

  /**
   * The .NET carrier of the shape published at a node: the represented present arm of its Host construction (else its
   * type), published at this very occurrence (R-C5-1). Native construction requires a retained declaration or read to
   * carry the construction's own carrier, and proves a literal's member correspondence only against the represented
   * published shape (BF16: one canonical registered carrier per shape). undefined: the outcome is published at another
   * occurrence, or it has several value arms.
   */
  function publishedShapeTarget(node: Node): TargetTypeRef | undefined {
    const outcome = publishedOutcome(node);
    if (outcome.provenance.occurrence !== node) return undefined;
    const arm = presentArm(outcome.construction ?? outcome.type);
    return arm === undefined ? undefined : representedCarrier(arm, node);
  }

  function remember(node: Node, shape: CsharpObjectShapeFact): CsharpObjectShapeFact {
    shape = rememberTargetShape(shape);
    nodeShapes.set(node, shape);
    return shape;
  }

  function rememberTargetShape(shape: CsharpObjectShapeFact): CsharpObjectShapeFact {
    if (shape.members.some(member => member.sourceDeclarations?.some(declaration => {
      const parent = host.ast.parent(declaration);
      const owner = parent !== undefined && host.ast.is.IsTypeLiteralNode(parent) ? host.ast.parent(parent) : parent;
      return owner !== undefined && classifyCsharpSourceProfileDeclaration(owner, host.ast) !== undefined;
    }) === true)) {
      failTargetAnalysisInvariant("tsonic-csharp", "A physical object-shape member cannot be owned by a native-mapped source-profile declaration.");
    }
    if (isCsharpJsValueTargetType(shape.targetType) || shape.targetType.kind === "type-parameter") return shape;
    if (shape.declarationTemplate !== undefined) {
      shape = { ...shape, declarationTemplate: rememberTargetShape(shape.declarationTemplate) };
    }
    shape = retainCsharpMethodValueContracts(shape, rememberTargetShape, environment, methodValues());
    const key = targetTypeRefKey(shape.targetType);
    const existing = targetShapes.get(key);
    if (existing !== undefined && !csharpObjectShapesEqual(existing, shape)) {
      const existingContract = csharpObjectShapeContractKey(existing);
      const incomingContract = csharpObjectShapeContractKey(shape);
      let offset = 0;
      while (offset < existingContract.length && offset < incomingContract.length &&
        existingContract[offset] === incomingContract[offset]) offset += 1;
      const start = Math.max(0, offset - 64);
      const end = offset + 96;
      failTargetAnalysisInvariant("tsonic-csharp",
        `C# object-shape target '${key}' resolved to contradictory structural contracts. ` +
        `Canonical contract offset ${offset}; existing length ${existingContract.length}, ` +
        `excerpt ${JSON.stringify(existingContract.slice(start, end))}; ` +
        `incoming length ${incomingContract.length}, excerpt ${JSON.stringify(incomingContract.slice(start, end))}.`);
    }
    const canonical = existing === undefined ? shape : mergeCsharpObjectShapeSubjects(existing, shape);
    targetShapes.set(key, canonical);
    if (canonical.targetType.kind === "target-named" && (canonical.targetType.typeArguments?.length ?? 0) > 0 &&
      canonical.targetType.typeArguments!.every(argument => argument.kind === "type-parameter")) {
      const existingTemplate = genericShapes.get(canonical.targetType.id);
      if (existingTemplate?.targetType.kind === "target-named") {
        const instantiated = instantiateCsharpObjectShape(existingTemplate, canonical.targetType);
        if (instantiated === undefined || !csharpObjectShapesEqual(instantiated, canonical)) {
          failTargetAnalysisInvariant("tsonic-csharp", "C# structural generic template resolved to contradictory contracts.");
        }
      } else genericShapes.set(canonical.targetType.id, canonical);
    }
    return shape;
  }

  function resolveTypeMember(type: SourceTypeDescriptor | undefined, occurrence: Node,
    sourceKey: CsharpSourceMemberKey): CsharpObjectShapeMemberFact | undefined {
    if (type === undefined) return undefined;
    const shape = resolveTarget(representedCarrier(type, occurrence));
    const members = shape?.members.filter(member => csharpSourceMemberKeysEqual(member.sourceKey, sourceKey)) ?? [];
    return members.length === 1 ? members[0] : undefined;
  }

  function resolveObjectLiteralTargetShape(expectedShape: CsharpObjectShapeFact | undefined,
    objectLiteral: Node): CsharpObjectLiteralTargetShapeResolution {
    const outcome = publishedOutcome(objectLiteral);
    const construction = outcome.construction ?? outcome.type;
    const carrier = representedCarrier(construction, objectLiteral);
    if (carrier === undefined) return { kind: "rejected", subject: objectLiteral,
      reason: "The object literal's Host construction type has no .NET shape." };
    // A CLR provider type constructed by an object initializer: the shape over its provider member relations, or the
    // precise reason it cannot be built (a CSHARP_ refusal, or the forwarded Host refusal of the member inventory).
    // It is checked for every literal before the registry is read: the literal checks (index entries, primitive
    // initializers) belong to this literal, not to the carrier an earlier literal registered.
    const arm = presentArm(construction);
    const provider = arm === undefined ? undefined : resolveProviderShape(objectLiteral, arm, carrier);
    if (provider !== undefined && "kind" in provider) return { kind: "rejected", subject: provider.site, reason: provider.message };
    if (expectedShape !== undefined && targetTypeRefEquals(getCsharpNullableElementTargetType(carrier) ?? carrier, expectedShape.targetType)) {
      return { kind: "resolved", shape: remember(objectLiteral, expectedShape) };
    }
    const known = provider ?? resolveTarget(carrier);
    return known === undefined ? { kind: "not-applicable" } : { kind: "resolved", shape: remember(objectLiteral, known) };
  }

  function resolveProjectConstructibleSelectedType(targetType: TargetTypeRef, descriptor: SourceTypeDescriptor,
    contextNode: Node): CsharpProjectConstructibleTypeProjection {
    const declarationKind = targetType.kind === "target-named"
      ? (targetType as CsharpTargetNamedTypeRef).csharpSourceDeclarationKind : undefined;
    if (declarationKind === undefined) return { kind: "unchanged" };
    const selected = representedCarrier(descriptor, contextNode);
    if (selected === undefined || !targetTypeRefEquals(selected, targetType)) return { kind: "rejected",
      reason: "The Host-selected source type does not agree with its selected C# project type argument." };
    if (declarationKind === "struct" || declarationKind === "enum") return { kind: "unchanged" };
    const shape = resolveTarget(targetType);
    return shape === undefined ? { kind: "rejected", reason: "The selected C# project type has no Host object member facts." }
      : { kind: "resolved", shape };
  }

  return Object.freeze({
    retainShape: (shape: CsharpObjectShapeFact, _occurrence: Node | undefined) => rememberTargetShape(shape),
    retainConstructionSource: (node: Node, shape: CsharpObjectShapeFact) => remember(node, shape),
    resolveNativeParameter,
    resolveNativeReturn,
    resolveCallableValue: (signature: TargetTypeRef, typeParameters: NonNullable<CsharpObjectShapeMemberFact["typeParameters"]>) =>
      retainCsharpGenericCallableValue(signature, typeParameters, rememberTargetShape, environment),
    resolveCopyShape: (shape: CsharpObjectShapeFact, source?: CsharpObjectShapeFact) =>
      resolveCsharpCopiedObjectShape(shape, host.ast, environment, resolveNode, rememberTargetShape, methodValues(), source),
    resolveNode,
    publishedShapeTarget,
    resolveTarget,
    resolveTypeMember,
    resolveObjectLiteralTargetShape,
    resolveProjectConstructibleSelectedType,
    knownShapes: () => Object.freeze([...targetShapes.values()]),
  });
}
