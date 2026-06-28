import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createCompilerSessionFromFiles,
  formatDiagnostics,
  providerVirtualDeclarationFactKey,
  runtimeCarrierFactKey,
  selectedTargetSignatureFactKey,
  targetOperationFactKey,
} from "@tsonic/tsts";
import { createTsonicCoreSourceExtension } from "@tsonic/source-core";
import { csharpTargetOperationFactKey } from "../dist/source/csharp-facts.js";
import {
  createCsharpJsSurfaceExtension,
  createCsharpNodejsSurfaceExtension,
  createCsharpSourceSemanticsExtension,
  createCsharpTargetSemanticsExtension,
} from "../dist/index.js";
import {
  createCsharpNodejsSurfaceOperationsProvider,
} from "../dist/source/csharp-source-semantics/surface-extensions.js";
import {
  createCsharpNodejsSurfaceBindingProvider,
} from "../dist/source/csharp-source-semantics/surfaces/nodejs/index.js";

test("NodeJS fs Stats Date declarations expose JS Date source type", () => {
  const bindingProvider = createCsharpNodejsSurfaceBindingProvider();
  const resolution = bindingProvider.resolveModule("node:fs", {});
  assert.equal(resolution.kind, "virtual");

  const model = bindingProvider.getDeclarationModel(resolution);
  const stats = model.exports.find((declaration) => declaration.name === "Stats");
  assert.ok(stats);

  const mtime = stats.members.find((member) => member.name === "mtime");
  const mtimeMs = stats.members.find((member) => member.name === "mtimeMs");
  assert.equal(mtime.type.kind, "target-named");
  assert.equal(mtime.type.id, "Tsonic.CSharp.Js.Date");
  assert.equal(mtime.type.sourceShape.kind, "provider-ref");
  assert.equal(mtime.type.sourceShape.exportName, "Date");
  assert.equal(mtimeMs.type.kind, "number");
});

test("NodeJS surface maps Stats Date properties from selected provider member identity", () => {
  const facts = new TestFactStore();
  const provider = createCsharpNodejsSurfaceOperationsProvider();
  const mtimeExpression = {};
  const mtimeMsExpression = {};
  const mtimeDeclaration = {};
  const mtimeMsDeclaration = {};
  facts.set(mtimeDeclaration, providerVirtualDeclarationFactKey, nodejsVirtualMemberDeclaration(
    "node:fs",
    "Stats",
    "mtime",
    "node:fs.Stats.mtime",
  ));
  facts.set(mtimeMsDeclaration, providerVirtualDeclarationFactKey, nodejsVirtualMemberDeclaration(
    "node:fs",
    "Stats",
    "mtimeMs",
    "node:fs.Stats.mtimeMs",
  ));

  const mtimeResult = provider.mapCheckedPropertyAccess(nodejsPropertyRequest(mtimeExpression, mtimeDeclaration), fakeContext(facts));
  const mtimeMsResult = provider.mapCheckedPropertyAccess(nodejsPropertyRequest(mtimeMsExpression, mtimeMsDeclaration), fakeContext(facts));

  assert.equal(mtimeResult.kind, "accept");
  assert.equal(mtimeResult.value.operation.operationId, "Tsonic.CSharp.Node.Stats.mtime");
  assert.equal(mtimeResult.value.operation.resultType.id, "Tsonic.CSharp.Js.Date");
  assert.equal(facts.get(mtimeExpression, csharpTargetOperationFactKey).resultType.id, "Tsonic.CSharp.Js.Date");
  assert.equal(mtimeMsResult.kind, "accept");
  assert.equal(mtimeMsResult.value.operation.operationId, "Tsonic.CSharp.Node.Stats.mtimeMs");
  assert.equal(mtimeMsResult.value.operation.resultType.name, "float64");
});

test("NodeJS surface rejects Stats Date property mapping without selected provider member identity", () => {
  const facts = new TestFactStore();
  const provider = createCsharpNodejsSurfaceOperationsProvider();
  const expression = {};
  const declaration = {};
  facts.set(declaration, providerVirtualDeclarationFactKey, nodejsVirtualMemberDeclaration(
    "node:fs",
    "Stats",
    "mtime",
    "node:fs.Stats.notMtime",
  ));

  const result = provider.mapCheckedPropertyAccess(nodejsPropertyRequest(expression, declaration), fakeContext(facts));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_NODEJS_PROPERTY_NOT_MAPPED");
  assert.equal(facts.get(expression, csharpTargetOperationFactKey), undefined);
});

test("selected NodeJS Stats Date facts compose with JS Date calls after TSTS checking", () => {
  const session = createCsharpSession(`
    import { statSync } from "node:fs";

    export function mtimeIso(path: string): string {
      const stats = statSync(path);
      return stats.mtime.toISOString() + ":" + stats.mtimeMs;
    }
  `, { selectedSurfaces: [{ id: "js" }, { id: "nodejs" }] });
  const sourceFile = session.getSourceFile("/src/index.ts");
  assert.equal(formatDiagnostics(session.ensureChecked(sourceFile)), "");

  const extensionHost = session.finalizeExtensions();
  const selectedMemberIds = collectFactValues(sourceFile, session, extensionHost, selectedTargetSignatureFactKey)
    .map((fact) => fact.member.id);
  const operationIds = collectFactValues(sourceFile, session, extensionHost, targetOperationFactKey)
    .map((fact) => fact.operationId);

  assert.equal(extensionHost.diagnostics.all().map((diagnostic) => diagnostic.extensionCode).join("\n"), "");
  assert.ok(selectedMemberIds.includes("Tsonic.CSharp.Node.fs.statSync(System.String)"));
  assert.ok(selectedMemberIds.includes("Tsonic.CSharp.Js.Date.toISOString"));
  assert.ok(operationIds.includes("Tsonic.CSharp.Node.Stats.mtime"));
  assert.ok(operationIds.includes("Tsonic.CSharp.Node.Stats.mtimeMs"));
});

test("selected NodeJS Stats Date facts preserve JS Date carrier through nullish coalescing", () => {
  const session = createCsharpSession(`
    import { statSync } from "node:fs";

    export function selectedMtimeIso(path: string, maybeDate: Date | undefined): string {
      const resolved = maybeDate ?? statSync(path).mtime;
      return resolved.toISOString();
    }
  `, { selectedSurfaces: [{ id: "js" }, { id: "nodejs" }] });
  const sourceFile = session.getSourceFile("/src/index.ts");
  assert.equal(formatDiagnostics(session.ensureChecked(sourceFile)), "");

  const extensionHost = session.finalizeExtensions();
  const binary = collectNodesByKind(sourceFile, session.ast, "KindBinaryExpression")[0];
  const resolvedDeclaration = collectNodesByKind(sourceFile, session.ast, "KindVariableDeclaration")
    .find((node) => session.ast.text(Object.getOwnPropertyDescriptor(node, "name")?.value) === "resolved");

  assert.ok(binary);
  assert.ok(resolvedDeclaration);
  assert.equal(extensionHost.diagnostics.all().map((diagnostic) => diagnostic.extensionCode).join("\n"), "");
  assert.equal(extensionHost.facts.get(binary, runtimeCarrierFactKey)?.carrier.id, "Tsonic.CSharp.Js.Date");
  assert.equal(extensionHost.facts.get(binary, targetOperationFactKey)?.resultType.id, "Tsonic.CSharp.Js.Date");
  assert.equal(extensionHost.facts.get(resolvedDeclaration, runtimeCarrierFactKey)?.carrier.id, "Tsonic.CSharp.Js.Date");
});

function fakeContext(facts) {
  return {
    facts,
    factResolver: {
      resolve: (subject, key) => facts.get(subject, key),
    },
  };
}

function createCsharpSession(sourceText, options = {}) {
  const target = { id: "csharp" };
  const context = {
    project: {
      entryPoint: "index.ts",
      targets: [target],
    },
    target,
    selectedSurfaces: options.selectedSurfaces ?? [],
  };
  return createCompilerSessionFromFiles({
    currentDirectory: "/src",
    files: new Map([
      ["/src/index.ts", sourceText],
    ]),
    compilerOptions: {
      module: "esnext",
      moduleResolution: "bundler",
      strictNullChecks: true,
      target: "es2022",
    },
    extensionHostOptions: {
      activeTarget: "csharp",
      extensions: [
        createTsonicCoreSourceExtension(),
        createCsharpSourceSemanticsExtension(context),
        createCsharpTargetSemanticsExtension(context),
        ...context.selectedSurfaces.flatMap((surface) =>
          surface.id === "js"
            ? [createCsharpJsSurfaceExtension({ ...context, surface, targetPack: fakeTargetPack })]
            : surface.id === "nodejs"
              ? [createCsharpNodejsSurfaceExtension({ ...context, surface, targetPack: fakeTargetPack })]
              : []
        ),
      ],
    },
  });
}

const fakeTargetPack = {
  id: "csharp",
  displayName: "C#",
};

function collectFactValues(sourceFile, session, extensionHost, factKey) {
  return collectAllNodes(sourceFile, session.ast)
    .map((node) => extensionHost.facts.get(node, factKey))
    .filter((fact) => fact !== undefined);
}

function collectNodesByKind(sourceFile, ast, kindName) {
  return collectAllNodes(sourceFile, ast).filter((node) => ast.kindName(node) === kindName);
}

function collectAllNodes(node, ast, result = []) {
  if (node === undefined) {
    return result;
  }
  result.push(node);
  for (const child of ast.children(node) ?? []) {
    collectAllNodes(child, ast, result);
  }
  return result;
}

function nodejsPropertyRequest(expression, sourceSelectedSymbol) {
  return {
    target: "csharp",
    expression,
    receiver: {},
    receiverType: {},
    propertyName: "mtime",
    sourceSelectedSymbol,
  };
}

function nodejsVirtualDeclaration(moduleSpecifier, exportName, signatureId) {
  return {
    providerId: "tsonic.csharp.nodejs-surface-provider",
    providerVersion: "0.0.1",
    providerModuleId: moduleSpecifier,
    moduleSpecifier,
    virtualFileName: `tsts-provider://csharp-nodejs/${encodeURIComponent(moduleSpecifier)}.d.ts`,
    exportName,
    ...(signatureId !== undefined ? { signatureId } : {}),
  };
}

function nodejsVirtualMemberDeclaration(moduleSpecifier, exportName, memberName, memberId, signatureId) {
  return {
    ...nodejsVirtualDeclaration(moduleSpecifier, exportName),
    memberName,
    memberId,
    ...(signatureId !== undefined ? { signatureId } : {}),
  };
}

class TestFactStore {
  #facts = new Map();

  get(subject, key) {
    return this.#facts.get(subject)?.get(key);
  }

  set(subject, key, value) {
    let subjectFacts = this.#facts.get(subject);
    if (subjectFacts === undefined) {
      subjectFacts = new Map();
      this.#facts.set(subject, subjectFacts);
    }
    subjectFacts.set(key, value);
  }
}
