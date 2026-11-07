import type { AstReader, Node } from "@tsonic/tsts";
import type { SourceProgramFacts } from "@tsonic/target-api/source";
import type { CsharpSourceMemberKey } from "../../target-model/types/model.js";
import { csharpPropertySourceMemberKey, csharpSourceMemberKeysEqual, csharpWellKnownSymbolSourceMemberKey } from "../../target-model/types/source-member-keys.js";

export function resolveObjectShapeSourceMemberKey(
  declarations: readonly Node[],
  fallbackName: string,
  ast: AstReader,
  facts: SourceProgramFacts,
): CsharpSourceMemberKey | undefined {
  if (declarations.length === 0) {
    return csharpPropertySourceMemberKey(fallbackName);
  }
  const keys = declarations.map((declaration) => {
    const name = ast.name(declaration);
    if (name === undefined) {
      return undefined;
    }
    if (ast.is.IsComputedPropertyName(name) || ast.is.IsNumericLiteral(name)) {
      // The Host property-name fact (const bindings, enum members, numeric canonical names, well-known symbols);
      // the Host property-name analysis facts.analyses.propertyName (B2, request R-F5-B1).
      const selected = facts.analyses.propertyName(name);
      return selected?.kind === "name" ? csharpPropertySourceMemberKey(selected.name)
        : selected?.kind === "well-known-symbol" ? csharpWellKnownSymbolSourceMemberKey(selected.symbol) : undefined;
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
