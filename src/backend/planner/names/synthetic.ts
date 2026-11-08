import type { CsharpSyntheticNames } from "../planning-data.js";
export function createCsharpSyntheticNames(reservedNames: readonly string[]): CsharpSyntheticNames {
  const used = new Set(reservedNames);
  return Object.freeze({
    temporaryName(preferred: string): string {
      let name = preferred;
      while (used.has(name)) name = `_${name}`;
      used.add(name);
      return name;
    },
  });
}
