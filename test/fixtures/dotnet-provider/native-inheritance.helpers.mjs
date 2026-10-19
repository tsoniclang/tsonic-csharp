import assert from "node:assert/strict";
import { createDotnetReflectionTypeDataProvider } from "../../helpers/dotnet-reflection-provider.mjs";

let objectDeclaration;

export function nativeBindingResult(binding) {
  if (binding === undefined) return Object.freeze({ kind: "missing" });
  assert.equal(["class", "struct", "interface", "trait", "enum", "delegate", "function", "opaque"].includes(binding.kind), true,
    "native binding fixture is target binding data, not a nested lookup result");
  return Object.freeze({ kind: "resolved", binding });
}

export function resolvedNativeBinding(result) {
  assert.equal(result?.kind, "resolved", "native lookup has one complete resolved binding");
  return result.binding;
}

export function nativeObjectFixtureDeclaration() {
  if (objectDeclaration !== undefined) return objectDeclaration;
  const provider = createDotnetReflectionTypeDataProvider();
  const module = provider.getModule("@tsonic/dotnet/System.js", {
    requestedMetadataNames: ["System.Object"],
    materialization: { kind: "complete" },
  });
  assert.equal("code" in module, false, "actual native System.Object acquisition");
  objectDeclaration = [...module.exports, ...(module.targetOnlyTypes ?? [])]
    .find(declaration => declaration.kind === "type" && declaration.metadataName === "System.Object");
  assert.equal(objectDeclaration !== undefined, true, "actual native System.Object declaration");
  assert.equal(Array.isArray(objectDeclaration.inheritableMembers), true, "complete native System.Object member inventory");
  return objectDeclaration;
}

export function nativeTypeFixture(declaration) {
  const physicalClass = declaration.typeKind === "class" &&
    (declaration.targetType === undefined || declaration.targetType.kind === "named");
  if (!physicalClass) {
    return { ...declaration, inheritance: [], inheritableMembers: [] };
  }
  const root = nativeObjectFixtureDeclaration();
  const ownType = {
    kind: "named",
    targetId: declaration.targetId,
    metadataName: declaration.metadataName,
    isByRefLike: declaration.isByRefLike,
    constraintRequiresReferenceType: declaration.constraintRequiresReferenceType,
    allowsRefLikeTypeArguments: declaration.allowsRefLikeTypeArguments,
    ...((declaration.typeParameters?.length ?? 0) === 0 ? {} : {
      typeArguments: declaration.typeParameters.map(parameter => ({
        kind: "type-parameter", identity: parameter.identity, name: parameter.name,
      })),
    }),
  };
  const inheritance = [{ targetId: declaration.targetId, type: ownType }];
  if (declaration.baseType?.kind === "named") {
    const { sourceShape, ...type } = declaration.baseType;
    inheritance.push({ targetId: type.targetId, type });
  }
  inheritance.push(...root.inheritance);
  const members = new Map();
  for (const member of declaration.members ?? []) {
    if (!["method", "property", "field", "event"].includes(member.kind)) continue;
    const signatures = member.kind === "method" ? member.signatures ?? [] : [{
      parameters: member.parameters ?? [],
    }];
    for (const signature of signatures) {
      const genericParameterIds = (signature.typeParameters ?? []).map(parameter => parameter.identity);
      const value = {
        targetName: member.targetName,
        kind: member.kind,
        static: member.static === true,
        accessibility: "public",
        genericArity: genericParameterIds.length,
        genericParameterIds,
        dispatchSlots: fixtureDispatchSlots(member, signature, genericParameterIds),
        parameters: (signature.parameters ?? []).map(parameter => ({
          type: parameter.type,
          passingMode: parameter.passingMode ?? "by-value",
        })),
      };
      members.set(JSON.stringify([value.targetName, value.kind, value.static, value.genericArity, value.parameters]), value);
    }
  }
  return { ...declaration, inheritance, inheritableMembers: [...members.values()] };
}

function fixtureDispatchSlots(member, signature, genericParameterIds) {
  const parameters = (signature.parameters ?? []).map(parameter => ({
    type: parameter.type, passingMode: parameter.passingMode ?? "by-value",
  }));
  const slot = (kind, id, slotParameters, returnType, returnPassing = "by-value") => ({
    kind, id, baseDefinitionId: id, virtual: false, abstract: false, final: false,
    accessibility: "public", genericParameterIds, parameters: slotParameters,
    returnType, returnPassing,
  });
  if (member.kind === "method") {
    assert.equal(typeof signature.id, "string", "authored fixture physical method identity");
    return [slot("method", signature.id, parameters,
      signature.targetReturnType ?? signature.returnType, signature.returnPassing ?? "by-value")];
  }
  if (member.kind === "property") {
    const result = [];
    if (member.readable !== false) result.push(slot("get", `${member.targetId}:fixture-get`, parameters,
      member.type, member.returnPassing ?? "by-value"));
    if (member.writable === true) result.push(slot("set", `${member.targetId}:fixture-set`,
      [...parameters, { type: member.type, passingMode: "by-value" }], { kind: "void" }));
    return result;
  }
  if (member.kind === "event") {
    return ["add", "remove"].map(kind => slot(kind, `${member.targetId}:fixture-${kind}`,
      [{ type: member.type, passingMode: "by-value" }], { kind: "void" }));
  }
  return [];
}
