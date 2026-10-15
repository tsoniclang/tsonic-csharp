import type { AstReader, Node } from "@tsonic/tsts";
import type { SourceFileSemantics } from "@tsonic/target-api/source";
import type { CsharpSourceMemberKey } from "../../../../target-model/types/model.js";
import {
  csharpPropertySourceMemberKey,
  csharpSourceMemberKeysEqual,
  csharpWellKnownSymbolSourceMemberKey,
} from "../../../../target-model/types/source-member-keys.js";

export function resolveObjectShapeSourceMemberKey(
  declarations: readonly Node[],
  fallbackName: string,
  ast: AstReader,
  semantics: SourceFileSemantics,
): CsharpSourceMemberKey | undefined {
  if (declarations.length === 0) {
    return csharpPropertySourceMemberKey(fallbackName);
  }
  const keys = declarations.map((declaration) => {
    const name = ast.name(declaration);
    if (name === undefined) {
      return undefined;
    }
    if (ast.is.IsComputedPropertyName(name)) {
      const selected = semantics.operations.wellKnownSymbol(name);
      return selected === undefined
        ? undefined
        : csharpWellKnownSymbolSourceMemberKey(selected.kind);
    }
    return csharpPropertySourceMemberKey(fallbackName);
  });
  if (keys.some((key) => key === undefined)) {
    return undefined;
  }
  const resolvedKeys = keys as readonly CsharpSourceMemberKey[];
  const first = resolvedKeys[0]!;
  return resolvedKeys.every((key) => csharpSourceMemberKeysEqual(first, key))
    ? first
    : undefined;
}
