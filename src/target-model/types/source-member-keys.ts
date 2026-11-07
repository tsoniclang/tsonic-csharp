import type { CsharpSourceMemberKey, CsharpWellKnownSymbolKind as ResolvedWellKnownSymbolKind } from "./model.js";

export function csharpPropertySourceMemberKey(
  name: string,
): CsharpSourceMemberKey {
  return Object.freeze({ kind: "property", name });
}

export function csharpWellKnownSymbolSourceMemberKey(
  symbol: ResolvedWellKnownSymbolKind,
): CsharpSourceMemberKey {
  return Object.freeze({ kind: "well-known-symbol", symbol });
}

export function csharpSourceMemberKeysEqual(
  left: CsharpSourceMemberKey,
  right: CsharpSourceMemberKey,
): boolean {
  return left.kind === right.kind &&
    (left.kind === "property"
      ? right.kind === "property" && left.name === right.name
      : right.kind === "well-known-symbol" && left.symbol === right.symbol);
}

export function csharpSourceMemberKeyParts(
  key: CsharpSourceMemberKey,
): readonly string[] {
  return key.kind === "property"
    ? [key.kind, key.name]
    : [key.kind, key.symbol];
}

export function csharpSourceMemberDisplayName(
  key: CsharpSourceMemberKey,
): string {
  if (key.kind === "property") {
    return key.name;
  }
  switch (key.symbol) {
    case "async-dispose": return "@@asyncDispose";
    case "async-iterator": return "@@asyncIterator";
    case "dispose": return "@@dispose";
    case "has-instance": return "@@hasInstance";
    case "is-concat-spreadable": return "@@isConcatSpreadable";
    case "iterator": return "@@iterator";
    case "match": return "@@match";
    case "match-all": return "@@matchAll";
    case "replace": return "@@replace";
    case "search": return "@@search";
    case "species": return "@@species";
    case "split": return "@@split";
    case "to-primitive": return "@@toPrimitive";
    case "to-string-tag": return "@@toStringTag";
    case "unscopables": return "@@unscopables";
  }
}

export function csharpWellKnownSymbolTargetMemberName(
  symbol: ResolvedWellKnownSymbolKind,
): string | undefined {
  switch (symbol) {
    case "dispose": return "Dispose";
    case "async-dispose": return "DisposeAsync";
    case "match": return "match";
    case "match-all": return "matchAll";
    case "replace": return "replace";
    case "search": return "search";
    case "split": return "split";
    case "async-iterator":
    case "has-instance":
    case "is-concat-spreadable":
    case "iterator":
    case "species":
    case "to-primitive":
    case "to-string-tag":
    case "unscopables":
      return undefined;
  }
}

const wellKnownSymbolKinds: ReadonlySet<string> = new Set<ResolvedWellKnownSymbolKind>([
  "async-dispose", "async-iterator", "dispose", "has-instance", "is-concat-spreadable", "iterator", "match", "match-all",
  "replace", "search", "species", "split", "to-primitive", "to-string-tag", "unscopables",
]);

/** A Host well-known symbol name ("Symbol.asyncIterator" or "asyncIterator") as the C# member-key kind ("async-iterator"). */
export function csharpWellKnownSymbolKind(symbol: string): ResolvedWellKnownSymbolKind {
  const kind = symbol.replace(/^Symbol\./u, "").replace(/[A-Z]/gu, letter => `-${letter.toLowerCase()}`);
  if (!wellKnownSymbolKinds.has(kind)) throw new TypeError(`Unknown well-known symbol '${symbol}' in a Host selection.`);
  return kind as ResolvedWellKnownSymbolKind;
}
