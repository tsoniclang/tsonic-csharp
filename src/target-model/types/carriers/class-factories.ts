import type { Node } from "@tsonic/tsts";
import type { TargetTypeRef } from "../native-type-data.js";
import type { CsharpClassFactoryType, CsharpTargetNamedTypeRef } from "../model.js";
import { csharpTargetNamedType } from "../factories.js";

export function csharpClassFactoryTargetType(
  declaration: Node,
  instance: CsharpTargetNamedTypeRef,
  name: string,
  outerTypeParameterCount: number,
  createMethodName: string,
  instanceTestMethodName: string,
): CsharpTargetNamedTypeRef {
  return { ...csharpTargetNamedType(`${instance.id}:factory`, instance.typeArguments?.slice(0, outerTypeParameterCount), { kind: "named", name }, { allowsRefLikeTypeArguments: (instance.typeArguments?.slice(0, outerTypeParameterCount) ?? []).map(() => false),}),
    csharpClassFactory: Object.freeze({ declaration, instance, outerTypeParameterCount, createMethodName, instanceTestMethodName }) };
}

export function getCsharpClassFactory(type: TargetTypeRef | undefined): CsharpClassFactoryType | undefined {
  return type?.kind === "target-named" ? (type as CsharpTargetNamedTypeRef).csharpClassFactory : undefined;
}
