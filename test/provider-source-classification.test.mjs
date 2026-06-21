import { test } from "node:test";
import assert from "node:assert/strict";
import { providerVirtualDeclarationFactKey } from "@tsonic/tsts";
import { isExternalDeclarationReference } from "../dist/backend/planner/expression-source-references.js";
import { isProviderVirtualSourceFile } from "../dist/backend/planner/provider-virtual-source-files.js";

test("provider virtual source files are classified by finalized facts, not file names", () => {
  const sourceFile = { IsDeclarationFile: false, FileName: "tsts-provider://not-a-provider-without-facts" };
  assert.equal(isProviderVirtualSourceFile(fakeInput(), sourceFile), false);
  assert.equal(isProviderVirtualSourceFile(fakeInput({ providerSourceFile: sourceFile }), sourceFile), true);
});

test("external declaration references do not classify node_modules source by path", () => {
  const currentSourceFile = { IsDeclarationFile: false, FileName: "/src/main.ts" };
  const dependencySourceFile = { IsDeclarationFile: false, FileName: "/src/node_modules/pkg/index.ts" };
  const reference = {
    sourceFile: dependencySourceFile,
    declaration: {},
    symbol: { Name: "fromDependency" },
  };

  assert.equal(isExternalDeclarationReference(reference, currentSourceFile, fakeInput()), false);
});

test("external declaration references classify provider virtual files by fact", () => {
  const currentSourceFile = { IsDeclarationFile: false, FileName: "/src/main.ts" };
  const providerSourceFile = { IsDeclarationFile: false, FileName: "/virtual/provider.ts" };
  const reference = {
    sourceFile: providerSourceFile,
    declaration: {},
    symbol: { Name: "ProviderThing" },
  };

  assert.equal(isExternalDeclarationReference(reference, currentSourceFile, fakeInput({ providerSourceFile })), true);
});

function fakeInput(options = {}) {
  return {
    facts: {
      getFact: (subject, key) =>
        subject === options.providerSourceFile && key === providerVirtualDeclarationFactKey
          ? {
              providerId: "test-provider",
              providerVersion: "1.0.0",
              providerModuleId: "test-provider/module",
              moduleSpecifier: "@provider/module",
              virtualFileName: "/virtual/provider.ts",
            }
          : undefined,
    },
  };
}
