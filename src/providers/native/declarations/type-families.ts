import type {
  ProviderExportDeclaration,
  ProviderMemberDeclaration,
  ProviderSignatureDeclaration,
  ProviderTypeParameterDeclaration,
} from "@tsonic/tsts";
import {
  normalizeProviderSignatureTypeParameterScope,
  renameProviderParameterTypeParameters,
  renameProviderTypeExpressionTypeParameters,
  renameProviderTypeParameter,
} from "./signatures.js";

export function normalizeProviderTypeFamilyParameters(
  exports: readonly ProviderExportDeclaration[],
): readonly ProviderExportDeclaration[] {
  const contractsByFamily = canonicalTypeParameterContractsByFamily(exports);
  return exports.map((declaration) => {
    const family = declaration.sourceTypeFamily;
    if (family === undefined) {
      return declaration;
    }
    const contract = contractsByFamily.get(family.exportName);
    if (contract === undefined) {
      return declaration;
    }
    const canonicalNames = contract.canonicalNames.slice(
      0,
      family.typeArgumentCount,
    );
    const typeParameters = declaration.typeParameters ?? [];
    if (canonicalNames.length !== typeParameters.length) {
      return declaration;
    }
    const renames = new Map(typeParameters.map((parameter, index) => [parameter.name, canonicalNames[index]!]));
    return renameProviderExportTypeParameters(
      declaration,
      typeParameters,
      canonicalNames,
      renames,
      contract.minimumArity,
    );
  });
}

function canonicalTypeParameterContractsByFamily(
  exports: readonly ProviderExportDeclaration[],
): ReadonlyMap<string, {
  readonly canonicalNames: readonly string[];
  readonly minimumArity: number;
}> {
  const variantsByFamily = new Map<string, ProviderExportDeclaration[]>();
  for (const declaration of exports) {
    const family = declaration.sourceTypeFamily;
    if (family === undefined) {
      continue;
    }
    const variants = variantsByFamily.get(family.exportName) ?? [];
    variants.push(declaration);
    variantsByFamily.set(family.exportName, variants);
  }
  return new Map([...variantsByFamily].map(([familyName, variants]) => {
    const widestVariant = [...variants].sort((left, right) =>
      (right.typeParameters?.length ?? 0) - (left.typeParameters?.length ?? 0)
      || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))[0];
    return [familyName, {
      canonicalNames: (widestVariant?.typeParameters ?? []).map(
        (parameter) => parameter.name,
      ),
      minimumArity: Math.min(...variants.map((variant) =>
        variant.sourceTypeFamily!.typeArgumentCount)),
    }];
  }));
}

function renameProviderExportTypeParameters(
  declaration: ProviderExportDeclaration,
  typeParameters: readonly ProviderTypeParameterDeclaration[],
  canonicalNames: readonly string[],
  renames: ReadonlyMap<string, string>,
  minimumArity: number,
): ProviderExportDeclaration {
  return {
    ...declaration,
    typeParameters: typeParameters.map((parameter, index) => {
      const renamed = renameProviderTypeParameter(parameter, renames);
      if (index < minimumArity) {
        return { ...renamed, name: canonicalNames[index]! };
      }
      const { constraints: _constraints, defaultType: _defaultType, ...common } =
        renamed;
      return { ...common, name: canonicalNames[index]! };
    }),
    ...(declaration.type === undefined
      ? {}
      : { type: renameProviderTypeExpressionTypeParameters(declaration.type, renames) }),
    ...(declaration.heritage === undefined
      ? {}
      : {
          heritage: declaration.heritage.map((heritage) => ({
            ...heritage,
            type: renameProviderTypeExpressionTypeParameters(heritage.type, renames),
          })),
        }),
    ...(declaration.signatures === undefined
      ? {}
      : { signatures: declaration.signatures.map((signature) => renameProviderSignatureParentTypeParameters(signature, renames, canonicalNames)) }),
    ...(declaration.members === undefined
      ? {}
      : { members: declaration.members.map((member) => renameProviderMemberParentTypeParameters(member, renames, canonicalNames)) }),
  };
}

function renameProviderMemberParentTypeParameters(
  member: ProviderMemberDeclaration,
  renames: ReadonlyMap<string, string>,
  parentTypeParameterNames: readonly string[],
): ProviderMemberDeclaration {
  return {
    ...member,
    ...(member.type === undefined
      ? {}
      : { type: renameProviderTypeExpressionTypeParameters(member.type, renames) }),
    ...(member.signatures === undefined
      ? {}
      : { signatures: member.signatures.map((signature) => renameProviderSignatureParentTypeParameters(signature, renames, parentTypeParameterNames)) }),
  };
}

function renameProviderSignatureParentTypeParameters(
  signature: ProviderSignatureDeclaration,
  renames: ReadonlyMap<string, string>,
  parentTypeParameterNames: readonly string[],
): ProviderSignatureDeclaration {
  const scopedRenames = new Map(renames);
  for (const typeParameter of signature.typeParameters ?? []) {
    scopedRenames.delete(typeParameter.name);
  }
  const renamed: ProviderSignatureDeclaration = {
    ...signature,
    ...(signature.typeParameters === undefined
      ? {}
      : { typeParameters: signature.typeParameters.map((parameter) => renameProviderTypeParameter(parameter, scopedRenames)) }),
    parameters: signature.parameters.map((parameter) => renameProviderParameterTypeParameters(parameter, scopedRenames)),
    ...(signature.returnType === undefined
      ? {}
      : { returnType: renameProviderTypeExpressionTypeParameters(signature.returnType, scopedRenames) }),
  };
  return normalizeProviderSignatureTypeParameterScope(renamed, parentTypeParameterNames);
}
