import type { Node } from "@tsonic/tsts";
import type { CsharpDelegateSignatureShape, CsharpTargetNamedTypeRef, TargetTypeRef } from "./model.js";
import { csharpTargetNamedType } from "./factories.js";

export interface CsharpClassFactoryType {
  readonly declaration: Node;
  readonly instance: CsharpTargetNamedTypeRef;
  readonly signature: CsharpDelegateSignatureShape;
  readonly createMethodName: string;
  readonly instanceTestMethodName: string;
}

export function csharpClassFactoryTargetType(
  declaration: Node,
  instance: CsharpTargetNamedTypeRef,
  name: string,
  signature: CsharpDelegateSignatureShape,
  createMethodName: string,
  instanceTestMethodName: string,
): CsharpTargetNamedTypeRef {
  return { ...csharpTargetNamedType(`${instance.id}:factory`, instance.typeArguments, { kind: "named", name }),
    csharpClassFactory: Object.freeze({ declaration, instance, signature, createMethodName, instanceTestMethodName }) };
}

export function getCsharpClassFactory(type: TargetTypeRef | undefined): CsharpClassFactoryType | undefined {
  return type?.kind === "target-named" ? (type as CsharpTargetNamedTypeRef).csharpClassFactory : undefined;
}
