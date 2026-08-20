import type {
  CsharpGeneratorProtocol,
  CsharpIteratorResultProtocol,
  CsharpTargetNamedTypeRef,
  TargetTypeRef,
} from "../../../target-model/types/model.js";
import {
  csharpQualifiedTypeRenderShape,
} from "../render-shapes.js";
import {
  csharpTargetNamedType,
} from "../../../target-model/types/factories.js";
import {
  csharpObjectTargetType,
  csharpUnitTargetType,
} from "../model/scalar-types.js";
import {
  isCsharpVoidTargetType,
} from "../model/identity.js";

export function csharpGeneratorTargetType(
  protocol: Omit<CsharpGeneratorProtocol, "kind">,
): CsharpTargetNamedTypeRef {
  return generatorTargetType("sync", "Generator", protocol);
}

export function csharpAsyncGeneratorTargetType(
  protocol: Omit<CsharpGeneratorProtocol, "kind">,
): CsharpTargetNamedTypeRef {
  return generatorTargetType("async", "AsyncGenerator", protocol);
}

export function csharpIteratorResultTargetType(
  protocol: CsharpIteratorResultProtocol,
): CsharpTargetNamedTypeRef {
  return csharpTargetNamedType(
    "Tsonic.CSharp.Runtime.IteratorResult`2",
    [protocol.yieldType, protocol.returnType],
    csharpQualifiedTypeRenderShape(
      "Tsonic.CSharp.Runtime",
      "IteratorResult",
    ),
    {
      iteratorResultProtocol: protocol,
      flowRefinementRepresentation: "identity",
    },
  );
}

export function csharpAsyncEnumerableTargetType(
  elementType: TargetTypeRef,
): CsharpTargetNamedTypeRef {
  return csharpTargetNamedType(
    "System.Collections.Generic.IAsyncEnumerable`1",
    [elementType],
    csharpQualifiedTypeRenderShape(
      "System.Collections.Generic",
      "IAsyncEnumerable",
    ),
    { enumerableElementType: elementType },
  );
}

export function getCsharpGeneratorProtocol(
  type: TargetTypeRef | undefined,
): CsharpGeneratorProtocol | undefined {
  return type?.kind === "target-named"
    ? (type as CsharpTargetNamedTypeRef).csharpGeneratorProtocol
    : undefined;
}

export function getCsharpIteratorResultProtocol(
  type: TargetTypeRef | undefined,
): CsharpIteratorResultProtocol | undefined {
  return type?.kind === "target-named"
    ? (type as CsharpTargetNamedTypeRef).csharpIteratorResultProtocol
    : undefined;
}

export function closeCsharpGeneratorProtocolType(
  type: TargetTypeRef,
): TargetTypeRef {
  if (type.kind === "opaque" && type.id === "unknown") {
    return csharpObjectTargetType();
  }
  return isCsharpVoidTargetType(type)
    ? csharpUnitTargetType()
    : type;
}

function generatorTargetType(
  kind: CsharpGeneratorProtocol["kind"],
  name: "Generator" | "AsyncGenerator",
  protocol: Omit<CsharpGeneratorProtocol, "kind">,
): CsharpTargetNamedTypeRef {
  const closedProtocol = Object.freeze({ kind, ...protocol });
  return csharpTargetNamedType(
    `Tsonic.CSharp.Runtime.${name}\`3`,
    [protocol.yieldType, protocol.returnType, protocol.nextType],
    csharpQualifiedTypeRenderShape("Tsonic.CSharp.Runtime", name),
    {
      enumerableElementType: protocol.yieldType,
      generatorProtocol: closedProtocol,
    },
  );
}
