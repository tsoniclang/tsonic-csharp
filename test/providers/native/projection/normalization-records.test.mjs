import assert from "node:assert/strict";
import test from "node:test";
import { createContractCollector, readContractRecord } from "../../../../dist/providers/native/model/normalization/support.js";
import { validateExportList } from "../../../../dist/providers/native/model/normalization/dotnet-declarations.js";
import { validateDotnetConstraints, validateDotnetSignatureList, validateDotnetTypeRef, validateUnsupportedExports, validateUnsupportedMembers } from "../../../../dist/providers/native/model/normalization/dotnet-signature-types.js";

test("the single Native normalization reader preserves the complete original valid data record", () => {
  const record = Object.freeze({ kind: "function-pointer", args: Object.freeze([{ kind: "source-primitive", name: "int64" }]),
    result: Object.freeze({ kind: "source-primitive", name: "int32" }), abi: Object.freeze(["Cdecl", "SuppressGCTransition"]) });
  const collector = createContractCollector("DOTNET_PROVIDER_MODEL_CONTRACT_INVALID", "Invalid .NET provider model contract.");
  const selected = readContractRecord(record, "$.type", collector);
  assert.equal(selected === record, true, "the reader never projects away an ABI field");
  assert.deepEqual(Object.keys(selected), ["kind", "args", "result", "abi"], "the full expected record domain");
  assert.equal(selected.args === record.args && selected.result === record.result && selected.abi === record.abi, true);
  assert.equal(collector.diagnostic() === undefined, true);
});

test("Native malformed record boundaries use the same collector/path without evaluating accessors", () => {
  let accessorReads = 0;
  const accessor = Object.defineProperty({}, "kind", { enumerable: true, get() { accessorReads += 1; return "named"; } });
  const cases = [
    ["null", null],
    ["undefined", undefined],
    ["scalar", 1],
    ["array", []],
    ["foreign prototype", Object.create({ kind: "named" })],
    ["accessor", accessor],
    ["symbol field", { kind: "named", [Symbol("foreign")]: true }],
  ];
  assert.deepEqual(cases.map(([name]) => name),
    ["null", "undefined", "scalar", "array", "foreign prototype", "accessor", "symbol field"]);
  for (const [name, value] of cases) {
    const collector = createContractCollector("DOTNET_PROVIDER_MODEL_CONTRACT_INVALID", "Invalid .NET provider model contract.");
    assert.equal(readContractRecord(value, "$.exports[0]", collector) === undefined, true, name);
    const diagnostic = collector.diagnostic();
    assert.equal(diagnostic.code, "DOTNET_PROVIDER_MODEL_CONTRACT_INVALID", `${name}: original malformed-metadata owner`);
    assert.equal(diagnostic.evidence.length, 1, `${name}: one boundary failure`);
    assert.equal(diagnostic.evidence[0].path, "$.exports[0]", `${name}: exact original path`);
    assert.equal(diagnostic.evidence[0].failure,
      "Expected a plain provider data record without accessors or symbol keys.", `${name}: exact boundary reason`);
  }
  assert.equal(accessorReads, 0, "validation and bounded diagnostics never execute the malformed getter");
});

test("all raw Native declaration and signature entry kinds use the same malformed-record boundary", () => {
  const entries = [
    ["export", "$.exports[0]", collector => validateExportList([null], "$.exports", collector, { sourceVisible: true })],
    ["type", "$.type", collector => validateDotnetTypeRef(null, "$.type", collector, { allowLiteral: false, allowProviderRef: false })],
    ["signature", "$.signatures[0]", collector => validateDotnetSignatureList([null], "$.signatures", collector, { requireReturnType: true })],
    ["constraint", "$.constraints[0]", collector => validateDotnetConstraints([null], "$.constraints", collector)],
    ["unsupported member", "$.unsupportedMembers[0]", collector => validateUnsupportedMembers([null], "$.unsupportedMembers", collector)],
    ["unsupported export", "$.unsupportedExports[0]", collector => validateUnsupportedExports([null], "$.unsupportedExports", collector)],
  ];
  assert.deepEqual(entries.map(([name]) => name),
    ["export", "type", "signature", "constraint", "unsupported member", "unsupported export"]);
  for (const [name, path, validate] of entries) {
    const collector = createContractCollector("DOTNET_PROVIDER_MODEL_CONTRACT_INVALID", "Invalid .NET provider model contract.");
    validate(collector);
    const diagnostic = collector.diagnostic();
    assert.equal(diagnostic.code, "DOTNET_PROVIDER_MODEL_CONTRACT_INVALID", name);
    assert.equal(diagnostic.evidence.length, 1, `${name}: complete boundary outcome`);
    assert.equal(diagnostic.evidence[0].path, path, name);
    assert.equal(diagnostic.evidence[0].failure,
      "Expected a plain provider data record without accessors or symbol keys.", name);
  }
});
