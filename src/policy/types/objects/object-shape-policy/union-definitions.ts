import { createHash } from "node:crypto";
import type { SourceFile, Type } from "@tsonic/tsts";
import { sourceNodeIdentity } from "@tsonic/target-api/source";
import type { CsharpObjectShapePolicyHost, CsharpStructuralUnionResolution } from "./model.js";
import type { CsharpTypeResolutionState } from "../../resolution/model.js";
import type { CsharpObjectShapeFact, CsharpObjectShapeMemberFact, TargetTypeRef } from "../../../../target-model/types/model.js";
import { csharpTargetNamedType } from "../../../../target-model/types/factories.js";
import { csharpRuntimeUnionTargetType } from "../../../../target-model/types/runtime-carriers.js";
import { csharpStructuralObjectShapeIdPrefix } from "../../../../target-model/types/object-shape-identity.js";
import { targetTypeRefKey } from "../../../../target-model/types/equality.js";
import { nextState } from "../../resolution/state.js";
import { substituteTargetTypeParameters } from "../../callables/substitution.js";

interface Definition {
  readonly arms: readonly TargetTypeRef[];
  readonly reference: TargetTypeRef;
  status: "building" | "complete" | "rejected";
  result?: TargetTypeRef;
}

export function createCsharpStructuralUnionDefinitions(
  host: CsharpObjectShapePolicyHost,
  define: (type: Type, sourceFile: SourceFile, state: CsharpTypeResolutionState) => CsharpObjectShapeFact | undefined,
) {
  const definitions = new Map<string, Definition>();
  const selected = new WeakMap<Type, Definition>();
  const records = new WeakMap<Type, { readonly owner: Definition; readonly type: TargetTypeRef;
    readonly bindings: ReadonlyMap<string, TargetTypeRef> }>();

  function reference(type: Type): TargetTypeRef | undefined {
    const record = records.get(type);
    if (record !== undefined) return record.owner.status === "rejected" ? undefined : record.type;
    const definition = selected.get(type);
    return definition?.status === "rejected" ? undefined : definition?.result ?? definition?.reference;
  }

  function resolve(type: Type, sourceFile: SourceFile, state: CsharpTypeResolutionState): CsharpStructuralUnionResolution {
    const cached = selected.get(type);
    if (cached !== undefined) return cached.status === "rejected" ? { kind: "rejected" }
      : { kind: "resolved", type: cached.result ?? cached.reference };
    const queries = host.semantics(sourceFile);
    if (!queries.types.isUnion(type)) return { kind: "not-applicable" };
    const application = queries.types.aliasApplication(type);
    if (application === undefined || application.kind !== "direct" ||
      !host.navigation.isProjectDeclaration(application.declaration) ||
      !host.ast.is.IsUnionTypeNode(application.typeNode)) return { kind: "not-applicable" };
    const declarations = host.ast.children(application.typeNode);
    if (declarations.length < 2 || declarations.some(node => !host.ast.is.IsTypeLiteralNode(node))) {
      return { kind: "not-applicable" };
    }
    const members = queries.types.unionOrIntersectionTypes(type);
    if (members.length !== declarations.length) return { kind: "not-applicable" };
    const declarationIndexes = members.map(member => {
      const symbol = queries.declarations.typeSymbol(member);
      const candidates = symbol === undefined ? [] : queries.declarations.symbolDeclarations(symbol);
      return declarations.flatMap((declaration, index) => declaration !== undefined && candidates.includes(declaration) ? [index] : []);
    });
    if (declarationIndexes.some(indexes => indexes.length !== 1) ||
      new Set(declarationIndexes.map(indexes => indexes[0])).size !== members.length) return { kind: "rejected" };
    const arguments_ = application.bindings.map(binding => host.typeResolver.resolveType(binding.argument, sourceFile, nextState(state)));
    const identities = declarations.map(declaration => sourceNodeIdentity(host.ast, declaration));
    if (arguments_.some(argument => argument === undefined) || identities.some(identity => identity === undefined)) return { kind: "rejected" };
    const typeArguments = arguments_ as readonly TargetTypeRef[];
    const parameters = application.bindings.map(binding =>
      host.typeResolver.resolveType(binding.parameter, sourceFile, nextState(state)));
    if (parameters.some(parameter => parameter?.kind !== "type-parameter")) return { kind: "rejected" };
    const bindings = new Map(parameters.map((parameter, index) =>
      [(parameter as Extract<TargetTypeRef, { kind: "type-parameter" }>).name, typeArguments[index]!]));
    const key = JSON.stringify([identities, typeArguments.map(targetTypeRefKey)]);
    let definition = definitions.get(key);
    const existing = definition !== undefined;
    if (definition === undefined) {
      const arms = identities.map(identity => {
        const digest = createHash("sha256").update(identity!).digest("hex");
        return csharpTargetNamedType(`${csharpStructuralObjectShapeIdPrefix}${digest}`,
          typeArguments.length === 0 ? undefined : typeArguments, { kind: "named", name: `__TsonicShape_${digest}` });
      });
      const union = csharpRuntimeUnionTargetType(arms);
      if (union === undefined) return { kind: "rejected" };
      definition = { arms, reference: union, status: "building" };
      definitions.set(key, definition);
    }
    selected.set(type, definition);
    if (definition.status === "rejected") return { kind: "rejected" };
    for (const [index, member] of members.entries()) {
      records.set(member, { owner: definition, type: definition.arms[declarationIndexes[index]![0]!]!, bindings });
    }
    if (existing) return { kind: "resolved", type: definition.result ?? definition.reference };
    const shapes = definition.arms.map((_, index) => {
      const memberIndex = declarationIndexes.findIndex(indexes => indexes[0] === index);
      return define(members[memberIndex]!, sourceFile, nextState(state));
    });
    if (shapes.some(shape => shape === undefined)) {
      definition.status = "rejected";
      return { kind: "rejected" };
    }
    definition.result = csharpRuntimeUnionTargetType(definition.arms, shapes);
    definition.status = definition.result === undefined ? "rejected" : "complete";
    return definition.result === undefined ? { kind: "rejected" } : { kind: "resolved", type: definition.result };
  }

  function substituteMembers(type: Type, members: readonly CsharpObjectShapeMemberFact[]): readonly CsharpObjectShapeMemberFact[] {
    const bindings = records.get(type)?.bindings;
    return bindings === undefined ? members : members.map(member => ({
      ...member, type: substituteTargetTypeParameters(member.type, bindings),
    }));
  }

  return Object.freeze({ reference, resolve, substituteMembers });
}
