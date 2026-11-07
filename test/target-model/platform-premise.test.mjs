import assert from "node:assert/strict";
import test from "node:test";
import {
  csharpPlatformPremisesEqual, csharpSupportedArchitectures, resolveCsharpPlatform,
} from "../../dist/target-model/configuration/platform.js";

// E24 (N5): the C# target is the one owner of its native integer premise. These controls cover the premise the C#
// build states; they add no 32-bit runtime target.
const generated = Object.freeze({ kind: "generated" });

test("the C# target supports x64 and arm64, both 64-bit", () => {
  assert.deepEqual([...csharpSupportedArchitectures.entries()], [["x64", 64], ["arm64", 64]]);
});

test("a build that states no architecture records the RID as missing and takes the supported 64-bit default", () => {
  for (const [project, properties] of [
    [generated, {}],
    [generated, { PlatformTarget: "AnyCPU", SelfContained: true }],
    [Object.freeze({ kind: "user-owned", projectFile: "/work/app/App.csproj" }), { RuntimeIdentifier: "linux-arm" }],
  ]) {
    const selection = resolveCsharpPlatform(project, properties);
    assert.equal(selection.runtimeIdentifier.kind, "missing");
    assert.equal(selection.premise.kind === "known" && selection.premise.nativeIntegerBits, 64);
    assert.match(selection.premise.basis, /Every architecture the C# target supports \(x64, arm64\) has this width\./u);
    assert.equal(Object.isFrozen(selection) && Object.isFrozen(selection.premise), true);
  }
});

test("a stated supported architecture gives a known premise naming its property", () => {
  for (const [properties, basis] of [
    [{ RuntimeIdentifier: "linux-x64" }, "RuntimeIdentifier=linux-x64"],
    [{ runtimeidentifier: "linux-musl-arm64" }, "runtimeidentifier=linux-musl-arm64"],
    [{ RuntimeIdentifiers: "linux-x64; osx-arm64" }, "RuntimeIdentifiers=linux-x64; RuntimeIdentifiers=osx-arm64"],
    [{ RuntimeIdentifier: "win-x64", PlatformTarget: "x64" }, "RuntimeIdentifier=win-x64; PlatformTarget=x64"],
  ]) {
    const selection = resolveCsharpPlatform(generated, properties);
    assert.equal(selection.runtimeIdentifier.kind, "stated", basis);
    assert.deepEqual(selection.premise, { kind: "known", nativeIntegerBits: 64, basis }, basis);
  }
});

test("a stated architecture outside the supported set gives a missing premise, never a guessed width", () => {
  for (const [properties, basis] of [
    [{ RuntimeIdentifier: "linux-arm" }, "RuntimeIdentifier=linux-arm"],
    [{ RuntimeIdentifier: "win-x86" }, "RuntimeIdentifier=win-x86"],
    [{ RuntimeIdentifiers: "linux-x64;browser-wasm" }, "RuntimeIdentifiers=browser-wasm"],
    [{ RuntimeIdentifier: "linux-x64", PlatformTarget: "x86" }, "PlatformTarget=x86"],
    [{ RuntimeIdentifier: "any" }, "RuntimeIdentifier=any"],
  ]) {
    const selection = resolveCsharpPlatform(generated, properties);
    assert.equal(selection.runtimeIdentifier.kind, "stated", basis);
    assert.equal(selection.premise.kind, "missing", basis);
    assert.equal(selection.premise.reason,
      `${basis} names no architecture the C# target supports (x64, arm64).`, basis);
  }
});

test("premise equality is structural over every state", () => {
  const known = { kind: "known", nativeIntegerBits: 64, basis: "a" };
  assert.equal(csharpPlatformPremisesEqual(known, { ...known }), true);
  assert.equal(csharpPlatformPremisesEqual(known, { ...known, nativeIntegerBits: 32 }), false);
  assert.equal(csharpPlatformPremisesEqual(known, { kind: "missing", reason: "a" }), false);
  const missing = { kind: "missing", reason: "none" };
  assert.equal(csharpPlatformPremisesEqual(missing, { ...missing }), true);
  assert.equal(csharpPlatformPremisesEqual(missing, { kind: "missing", reason: "other" }), false);
  const conflicting = { kind: "conflicting", premises: [{ nativeIntegerBits: 64, basis: "a" }, { nativeIntegerBits: 32, basis: "b" }] };
  assert.equal(csharpPlatformPremisesEqual(conflicting, structuredClone(conflicting)), true);
  assert.equal(csharpPlatformPremisesEqual(conflicting, { ...conflicting, premises: conflicting.premises.slice(0, 1) }), false);
});
