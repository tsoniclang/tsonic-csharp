import type { CsharpTargetBinaryExecutionDriver } from "./provider-metadata.js";
import { canonicalProviderValue } from "./canonical-value.js";

export function composeCsharpBinaryExecutionDriver(
  ...drivers: readonly (CsharpTargetBinaryExecutionDriver | undefined)[]
): CsharpTargetBinaryExecutionDriver | undefined {
  const byId = new Map<string, CsharpTargetBinaryExecutionDriver>();
  for (const driver of drivers) {
    if (driver === undefined) continue;
    const existing = byId.get(driver.id);
    if (existing === undefined) {
      byId.set(driver.id, driver);
      continue;
    }
    if (canonicalProviderValue(existing) !== canonicalProviderValue(driver)) {
      throw new Error(
        `C# target capabilities supplied contradictory binary execution drivers for identity '${driver.id}'.`,
      );
    }
  }
  if (byId.size > 1) {
    throw new Error(
      `C# target capabilities supplied multiple binary execution drivers: ${[...byId.keys()].sort().join(", ")}.`,
    );
  }
  const driver = byId.values().next().value;
  return driver === undefined ? undefined : Object.freeze(driver);
}
