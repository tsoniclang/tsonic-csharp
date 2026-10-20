import type { CsharpGeneratedHelper, CsharpGeneratedHelperRecords } from "../../../target-model/records/generated-helpers.js";

export function createCsharpGeneratedHelperRecords(helpers: ReadonlySet<CsharpGeneratedHelper>): CsharpGeneratedHelperRecords {
  const required = Object.freeze([...helpers].sort());
  const present = new Set(required);
  return Object.freeze({ generatedHelpers: Object.freeze({ get: () => required }),
    generatedHelper: Object.freeze({ get: (helper: CsharpGeneratedHelper) => present.has(helper) ? true : undefined }) });
}
