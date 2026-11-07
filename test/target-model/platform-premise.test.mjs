import assert from "node:assert/strict";
import test from "node:test";
import {
  csharpArchitectureWidths, csharpPlatformPremisesEqual, resolveCsharpPlatform,
} from "../../dist/target-model/configuration/platform.js";

// E24 (N5), K-2680: the C# target is the one owner of its native integer premise. The premise is known only when the
// generated project fixes the architecture (RuntimeIdentifier or PlatformTarget); an unread or portable build is
// `missing`. These controls add no 32-bit runtime target.
const generated = Object.freeze({ kind: "generated" });
const knownList = "x64, arm64";

test("the C# target knows the width of x64 and arm64, both 64-bit", () => {
  assert.deepEqual([...csharpArchitectureWidths.entries()], [["x64", 64], ["arm64", 64]]);
});

test("a user-owned project's architecture is unread: missing, whatever properties the configuration carries", () => {
  const project = Object.freeze({ kind: "user-owned", projectFile: "/work/app/App.csproj" });
  for (const properties of [{}, { RuntimeIdentifier: "linux-x64" }, { PlatformTarget: "arm64" }, { RuntimeIdentifier: "linux-arm" }]) {
    const selection = resolveCsharpPlatform(project, properties);
    const reason = "The user-owned project '/work/app/App.csproj' owns its architecture; the C# target does not read it.";
    assert.deepEqual(selection.architecture, { kind: "missing", reason });
    assert.deepEqual(selection.premise, { kind: "missing", reason });
    assert.equal(Object.isFrozen(selection) && Object.isFrozen(selection.premise), true);
  }
});

test("a generated project that fixes no architecture is portable: missing, never a default width", () => {
  const reason = "The generated project fixes no architecture (no RuntimeIdentifier or PlatformTarget); its portable build runs on any architecture.";
  for (const properties of [
    {},
    { PlatformTarget: "AnyCPU", SelfContained: true },
    { platformtarget: "anycpu" },
    { RuntimeIdentifier: "" },
    // RuntimeIdentifiers is the restore set; a build without one RuntimeIdentifier stays portable.
    { RuntimeIdentifiers: "linux-x64;osx-arm64" },
    { RuntimeIdentifiers: "linux-x64;browser-wasm" },
  ]) {
    const selection = resolveCsharpPlatform(generated, properties);
    assert.deepEqual(selection.architecture, { kind: "missing", reason }, JSON.stringify(properties));
    assert.deepEqual(selection.premise, { kind: "missing", reason }, JSON.stringify(properties));
    assert.equal(Object.isFrozen(selection) && Object.isFrozen(selection.premise), true);
  }
});

test("a stated RuntimeIdentifier or PlatformTarget in the width table gives a known premise naming its property", () => {
  for (const [properties, basis] of [
    [{ RuntimeIdentifier: "linux-x64" }, "RuntimeIdentifier=linux-x64"],
    [{ runtimeidentifier: "linux-musl-arm64" }, "runtimeidentifier=linux-musl-arm64"],
    [{ PlatformTarget: "x64" }, "PlatformTarget=x64"],
    [{ PlatformTarget: "ARM64" }, "PlatformTarget=ARM64"],
    [{ RuntimeIdentifier: "win-x64", PlatformTarget: "x64" }, "RuntimeIdentifier=win-x64; PlatformTarget=x64"],
    [{ RuntimeIdentifier: "osx-arm64", RuntimeIdentifiers: "osx-arm64;linux-arm" }, "RuntimeIdentifier=osx-arm64"],
  ]) {
    const selection = resolveCsharpPlatform(generated, properties);
    assert.equal(selection.architecture.kind, "stated", basis);
    assert.deepEqual(selection.premise, { kind: "known", nativeIntegerBits: 64, basis }, basis);
  }
});

test("a stated architecture outside the width table gives a missing premise, never a guessed width", () => {
  for (const [properties, basis] of [
    [{ RuntimeIdentifier: "linux-arm" }, "RuntimeIdentifier=linux-arm"],
    [{ RuntimeIdentifier: "win-x86" }, "RuntimeIdentifier=win-x86"],
    [{ RuntimeIdentifier: "browser-wasm" }, "RuntimeIdentifier=browser-wasm"],
    [{ RuntimeIdentifier: "linux-x64", PlatformTarget: "x86" }, "PlatformTarget=x86"],
    [{ RuntimeIdentifier: "any" }, "RuntimeIdentifier=any"],
  ]) {
    const selection = resolveCsharpPlatform(generated, properties);
    assert.equal(selection.architecture.kind, "stated", basis);
    assert.deepEqual(selection.premise,
      { kind: "missing", reason: `${basis} names no architecture whose width the C# target knows (${knownList}).` }, basis);
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
