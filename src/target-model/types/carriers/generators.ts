import type { CsharpGeneratorProtocol, CsharpIteratorResultProtocol, CsharpTargetNamedTypeRef, TargetTypeRef } from "../model.js";
import { csharpQualifiedTypeRenderShape } from "../render-shapes.js";
import { csharpTargetNamedType } from "../factories.js";

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
  return csharpTargetNamedType("Tsonic.CSharp.Runtime.IteratorResult`2", [protocol.yieldType, protocol.returnType], csharpQualifiedTypeRenderShape(
      "Tsonic.CSharp.Runtime",
      "IteratorResult",
    ), { allowsRefLikeTypeArguments: [false, false],
      iteratorResultProtocol: protocol,
      flowRefinementRepresentation: "identity",
    });
}

export function csharpAsyncEnumerableTargetType(
  elementType: TargetTypeRef,
): CsharpTargetNamedTypeRef {
  return csharpTargetNamedType("System.Collections.Generic.IAsyncEnumerable`1", [elementType], csharpQualifiedTypeRenderShape(
      "System.Collections.Generic",
      "IAsyncEnumerable",
    ), { allowsRefLikeTypeArguments: [true], enumerableElementType: elementType });
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

function generatorTargetType(
  kind: CsharpGeneratorProtocol["kind"],
  name: "Generator" | "AsyncGenerator",
  protocol: Omit<CsharpGeneratorProtocol, "kind">,
): CsharpTargetNamedTypeRef {
  const closedProtocol = Object.freeze({ kind, ...protocol });
  return csharpTargetNamedType(`Tsonic.CSharp.Runtime.${name}\`3`, [protocol.yieldType, protocol.returnType, protocol.nextType], csharpQualifiedTypeRenderShape("Tsonic.CSharp.Runtime", name), { allowsRefLikeTypeArguments: [false, false, false],
      enumerableElementType: protocol.yieldType,
      generatorProtocol: closedProtocol,
    });
}
