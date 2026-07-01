import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createCompilerSessionFromFiles,
  formatDiagnostics,
  providerVirtualDeclarationFactKey,
} from "@tsonic/tsts";
import { createTsonicCoreSourceExtension } from "@tsonic/source-core";
import { csharpTargetOperationFactKey } from "../dist/source/csharp-facts.js";
import {
  createCsharpJsSurfaceExtension,
  createCsharpNodejsProviderPackageExtension,
  createCsharpSourceSemanticsExtension,
  createCsharpTargetSemanticsExtension,
} from "../dist/index.js";
import {
  createCsharpNodejsProviderPackageBindingProvider,
  createCsharpNodejsProviderPackageOperationsProvider,
} from "../dist/source/csharp-source-semantics/provider-packages/nodejs/index.js";

test("NodeJS provider package exposes completion metadata for assigned modules", () => {
  const bindingProvider = createCsharpNodejsProviderPackageBindingProvider();

  assertModuleExport(bindingProvider, "node:fs", "watchFile", "node:fs.watchFile(System.String,Function)");
  assertModuleExport(bindingProvider, "node:path", "format", "node:path.format(Tsonic.CSharp.Node.ParsedPath)");
  assertClassMember(bindingProvider, "node:buffer", "Buffer", "compare", "node:buffer.Buffer.compare(Tsonic.CSharp.Node.Buffer,Tsonic.CSharp.Node.Buffer)");
  assertClassMember(bindingProvider, "node:buffer", "Buffer", "isBuffer", "node:buffer.Buffer.isBuffer(System.Object)");
  assertModuleExport(bindingProvider, "node:crypto", "createCipheriv", "node:crypto.createCipheriv(System.String,System.Object,System.Object)");
  assertModuleExport(bindingProvider, "node:os", "cpus", "node:os.cpus()");
  assertModuleExport(bindingProvider, "node:process", "memoryUsage", "node:process.memoryUsage()");
  assertModuleExport(bindingProvider, "node:util", "format", "node:util.format(System.Object,System.Object[])");
  assertClassMember(bindingProvider, "node:url", "URLSearchParams", "append", "node:url.URLSearchParams.append(System.String,System.String)");
});

test("NodeJS provider package maps closed operations from selected provider identities", () => {
  const facts = new TestFactStore();
  const provider = createCsharpNodejsProviderPackageOperationsProvider();
  const readFileCall = {};
  const readFileSignature = {};
  const pathParseCall = {};
  const pathParseSignature = {};
  const parsedBaseExpression = {};
  const parsedBaseDeclaration = {};
  const processCwdCall = {};
  const processCwdSignature = {};
  const bufferCompareCall = {};
  const bufferCompareSignature = {};
  const cryptoHmacCall = {};
  const cryptoHmacSignature = {};
  const osHomedirCall = {};
  const osHomedirSignature = {};
  const utilCall = {};
  const utilSignature = {};
  const urlCanParseCall = {};
  const urlCanParseSignature = {};
  facts.set(readFileSignature, providerVirtualDeclarationFactKey, nodejsVirtualDeclaration("node:fs", "readFileSync", "node:fs.readFileSync(System.String,System.String)"));
  facts.set(pathParseSignature, providerVirtualDeclarationFactKey, nodejsVirtualDeclaration("node:path", "parse", "node:path.parse(System.String)"));
  facts.set(parsedBaseDeclaration, providerVirtualDeclarationFactKey, nodejsVirtualMemberDeclaration("node:path", "ParsedPath", "base", "node:path.ParsedPath.base"));
  facts.set(processCwdSignature, providerVirtualDeclarationFactKey, nodejsVirtualDeclaration("process", "cwd", "node:process.cwd()"));
  facts.set(bufferCompareSignature, providerVirtualDeclarationFactKey, nodejsVirtualMemberDeclaration("buffer", "Buffer", "compare", "node:buffer.Buffer.compare", "node:buffer.Buffer.compare(Tsonic.CSharp.Node.Buffer,Tsonic.CSharp.Node.Buffer)"));
  facts.set(cryptoHmacSignature, providerVirtualDeclarationFactKey, nodejsVirtualDeclaration("node:crypto", "createHmac", "node:crypto.createHmac(System.String,Tsonic.CSharp.Node.Buffer)"));
  facts.set(osHomedirSignature, providerVirtualDeclarationFactKey, nodejsVirtualDeclaration("os", "homedir", "node:os.homedir()"));
  facts.set(utilSignature, providerVirtualDeclarationFactKey, nodejsVirtualDeclaration("node:util", "toUSVString", "node:util.toUSVString(System.String)"));
  facts.set(urlCanParseSignature, providerVirtualDeclarationFactKey, nodejsVirtualMemberDeclaration("url", "URL", "canParse", "node:url.URL.canParse", "node:url.URL.canParse(System.String,Tsonic.CSharp.Node.URL)"));

  const readFileResult = provider.mapCheckedCall(nodejsCallRequest(readFileCall, readFileSignature), fakeContext(facts));
  const pathParseResult = provider.mapCheckedCall(nodejsCallRequest(pathParseCall, pathParseSignature), fakeContext(facts));
  const parsedBaseResult = provider.mapCheckedPropertyAccess(nodejsPropertyRequest(parsedBaseExpression, parsedBaseDeclaration), fakeContext(facts));
  const processCwdResult = provider.mapCheckedCall(nodejsCallRequest(processCwdCall, processCwdSignature), fakeContext(facts));
  const bufferCompareResult = provider.mapCheckedCall(nodejsCallRequest(bufferCompareCall, bufferCompareSignature), fakeContext(facts));
  const cryptoHmacResult = provider.mapCheckedCall(nodejsCallRequest(cryptoHmacCall, cryptoHmacSignature), fakeContext(facts));
  const osHomedirResult = provider.mapCheckedCall(nodejsCallRequest(osHomedirCall, osHomedirSignature), fakeContext(facts));
  const utilResult = provider.mapCheckedCall(nodejsCallRequest(utilCall, utilSignature), fakeContext(facts));
  const urlCanParseResult = provider.mapCheckedCall(nodejsCallRequest(urlCanParseCall, urlCanParseSignature), fakeContext(facts));

  assertSelectedMember(readFileResult, "Tsonic.CSharp.Node.fs.readFileSync(System.String,System.String)");
  assertSelectedMember(pathParseResult, "Tsonic.CSharp.Node.path.parse(System.String)");
  assert.equal(parsedBaseResult.kind, "accept");
  assert.equal(parsedBaseResult.value.operation.operationId, "Tsonic.CSharp.Node.ParsedPath.@base");
  assert.equal(facts.get(parsedBaseExpression, csharpTargetOperationFactKey)?.operationId, "Tsonic.CSharp.Node.ParsedPath.@base");
  assertSelectedMember(processCwdResult, "Tsonic.CSharp.Node.process.cwd()");
  assertSelectedMember(bufferCompareResult, "Tsonic.CSharp.Node.Buffer.compare(Tsonic.CSharp.Node.Buffer,Tsonic.CSharp.Node.Buffer)");
  assert.equal(bufferCompareResult.value.selectedSignature.member.static, true);
  assertSelectedMember(cryptoHmacResult, "Tsonic.CSharp.Node.crypto.createHmac(System.String,Tsonic.CSharp.Node.Buffer)");
  assertSelectedMember(osHomedirResult, "Tsonic.CSharp.Node.os.homedir()");
  assertSelectedMember(utilResult, "Tsonic.CSharp.Node.util.toUSVString(System.String)");
  assertSelectedMember(urlCanParseResult, "Tsonic.CSharp.Node.URL.canParse(System.String,Tsonic.CSharp.Node.URL)");
});

test("NodeJS provider package hard-rejects selected unsupported provider identities", () => {
  const facts = new TestFactStore();
  const provider = createCsharpNodejsProviderPackageOperationsProvider();
  const fsWatchFileSignature = {};
  const bufferIsBufferSignature = {};
  const bufferPoolSizeDeclaration = {};
  const cryptoCipherSignature = {};
  const osCpusSignature = {};
  const osConstantsDeclaration = {};
  const processMemorySignature = {};
  const processStdinDeclaration = {};
  const utilFormatSignature = {};
  const urlAppendSignature = {};
  facts.set(fsWatchFileSignature, providerVirtualDeclarationFactKey, nodejsVirtualDeclaration("node:fs", "watchFile", "node:fs.watchFile(System.String,Function)"));
  facts.set(bufferIsBufferSignature, providerVirtualDeclarationFactKey, nodejsVirtualMemberDeclaration("node:buffer", "Buffer", "isBuffer", "node:buffer.Buffer.isBuffer", "node:buffer.Buffer.isBuffer(System.Object)"));
  facts.set(bufferPoolSizeDeclaration, providerVirtualDeclarationFactKey, nodejsVirtualMemberDeclaration("node:buffer", "Buffer", "poolSize", "node:buffer.Buffer.poolSize"));
  facts.set(cryptoCipherSignature, providerVirtualDeclarationFactKey, nodejsVirtualDeclaration("crypto", "createCipheriv", "node:crypto.createCipheriv(System.String,System.Object,System.Object)"));
  facts.set(osCpusSignature, providerVirtualDeclarationFactKey, nodejsVirtualDeclaration("node:os", "cpus", "node:os.cpus()"));
  facts.set(osConstantsDeclaration, providerVirtualDeclarationFactKey, nodejsVirtualDeclaration("os", "constants"));
  facts.set(processMemorySignature, providerVirtualDeclarationFactKey, nodejsVirtualDeclaration("node:process", "memoryUsage", "node:process.memoryUsage()"));
  facts.set(processStdinDeclaration, providerVirtualDeclarationFactKey, nodejsVirtualDeclaration("process", "stdin"));
  facts.set(utilFormatSignature, providerVirtualDeclarationFactKey, nodejsVirtualDeclaration("node:util", "format", "node:util.format(System.Object,System.Object[])"));
  facts.set(urlAppendSignature, providerVirtualDeclarationFactKey, nodejsVirtualMemberDeclaration("node:url", "URLSearchParams", "append", "node:url.URLSearchParams.append", "node:url.URLSearchParams.append(System.String,System.String)"));

  assertUnsupportedCall(provider, facts, fsWatchFileSignature, "unsupported:Tsonic.CSharp.Node.fs.watchFile(System.String,Function)");
  assertUnsupportedCall(provider, facts, bufferIsBufferSignature, "unsupported:Tsonic.CSharp.Node.Buffer.isBuffer(System.Object)");
  assertUnsupportedProperty(provider, facts, bufferPoolSizeDeclaration, "unsupported:Tsonic.CSharp.Node.Buffer.poolSize");
  assertUnsupportedCall(provider, facts, cryptoCipherSignature, "unsupported:Tsonic.CSharp.Node.crypto.createCipheriv(System.String,System.Object,System.Object)");
  assertUnsupportedCall(provider, facts, osCpusSignature, "unsupported:Tsonic.CSharp.Node.os.cpus()");
  assertUnsupportedProperty(provider, facts, osConstantsDeclaration, "unsupported:Tsonic.CSharp.Node.os.constants");
  assertUnsupportedCall(provider, facts, processMemorySignature, "unsupported:Tsonic.CSharp.Node.process.memoryUsage()");
  assertUnsupportedProperty(provider, facts, processStdinDeclaration, "unsupported:Tsonic.CSharp.Node.process.stdin");
  assertUnsupportedCall(provider, facts, utilFormatSignature, "unsupported:Tsonic.CSharp.Node.util.format(System.Object,System.Object[])");
  assertUnsupportedCall(provider, facts, urlAppendSignature, "unsupported:Tsonic.CSharp.Node.URLSearchParams.append(System.String,System.String)");
});

test("NodeJS provider package requires selected signatures before target member selection", () => {
  const call = {};
  const selectedDeclaration = {};
  const facts = new TestFactStore();
  const provider = createCsharpNodejsProviderPackageOperationsProvider();
  facts.set(selectedDeclaration, providerVirtualDeclarationFactKey, nodejsVirtualMemberDeclaration(
    "node:buffer",
    "Buffer",
    "compare",
    "node:buffer.Buffer.compare",
  ));

  const result = provider.mapCheckedCall(nodejsCallRequestWithoutSignature(call, selectedDeclaration), fakeContext(facts));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_NODEJS_CALL_REQUIRES_SELECTED_SIGNATURE");
  assert.equal(result.diagnostic.evidence?.[0]?.details?.requiredFacts[1], "selected NodeJS provider signature identity");
  assert.equal(facts.get(call, csharpTargetOperationFactKey), undefined);
});

test("selected NodeJS Buffer source type-checks compare provider declarations", () => {
  const session = createCsharpSession(`
    import { Buffer } from "buffer";

    export function compareBuffers(text: string): number {
      const left = Buffer.from(text, "utf8");
      const right = Buffer.from("expected", "utf8");
      return Buffer.compare(left, right);
    }
  `, { selectedSurfaces: [{ id: "js" }], selectedPackages: [{ id: "nodejs" }] });
  const sourceFile = session.getSourceFile("/src/index.ts");
  assert.equal(formatDiagnostics(session.ensureChecked(sourceFile)), "");
});

function assertModuleExport(bindingProvider, moduleSpecifier, exportName, signatureId) {
  const resolution = bindingProvider.resolveModule(moduleSpecifier, {});
  assert.equal(resolution.kind, "virtual");
  const model = bindingProvider.getDeclarationModel(resolution);
  const declaration = model.exports.find((entry) => entry.name === exportName);
  assert.equal(declaration?.signatures?.[0]?.id, signatureId);
  const identity = bindingProvider.getTargetIdentity({
    moduleSpecifier,
    exportName,
    signatureId,
  });
  assert.ok(identity?.id);
}

function assertClassMember(bindingProvider, moduleSpecifier, exportName, memberName, signatureId) {
  const resolution = bindingProvider.resolveModule(moduleSpecifier, {});
  assert.equal(resolution.kind, "virtual");
  const model = bindingProvider.getDeclarationModel(resolution);
  const declaration = model.exports.find((entry) => entry.name === exportName);
  const member = declaration?.members?.find((entry) => entry.name === memberName);
  assert.equal(member?.signatures?.[0]?.id, signatureId);
  const identity = bindingProvider.getTargetIdentity({
    moduleSpecifier,
    exportName,
    memberName,
    signatureId,
  });
  assert.ok(identity?.id);
}

function assertSelectedMember(result, memberId) {
  assert.equal(result.kind, "accept");
  assert.equal(result.value.selectedSignature.member.id, memberId);
}

function assertUnsupportedCall(provider, facts, selectedSignature, targetIdentityId) {
  const result = provider.mapCheckedCall(nodejsCallRequest({}, selectedSignature), fakeContext(facts));
  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_NODEJS_PROVIDER_PACKAGE_OPERATION_UNSUPPORTED");
  assert.equal(result.diagnostic.evidence?.[0]?.details?.targetIdentityId, targetIdentityId);
}

function assertUnsupportedProperty(provider, facts, selectedDeclaration, targetIdentityId) {
  const result = provider.mapCheckedPropertyAccess(nodejsPropertyRequest({}, selectedDeclaration), fakeContext(facts));
  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_NODEJS_PROVIDER_PACKAGE_OPERATION_UNSUPPORTED");
  assert.equal(result.diagnostic.evidence?.[0]?.details?.targetIdentityId, targetIdentityId);
}

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
    selectedPackages: options.selectedPackages ?? [],
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
            : []
        ),
        ...context.selectedPackages.flatMap((providerPackage) =>
          providerPackage.id === "nodejs"
            ? [createCsharpNodejsProviderPackageExtension({ ...context, package: providerPackage, targetPack: fakeTargetPack })]
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

function nodejsCallRequest(call, sourceSelectedSignature) {
  return {
    target: "csharp",
    call,
    callee: {},
    arguments: [],
    sourceSelectedSignature,
  };
}

function nodejsCallRequestWithoutSignature(call, sourceSelectedDeclaration) {
  return {
    target: "csharp",
    call,
    callee: {},
    arguments: [],
    sourceSelectedDeclaration,
  };
}

function nodejsPropertyRequest(expression, sourceSelectedSymbol) {
  return {
    target: "csharp",
    expression,
    receiver: {},
    receiverType: {},
    propertyName: "selectedByProviderIdentity",
    sourceSelectedSymbol,
  };
}

function nodejsVirtualDeclaration(moduleSpecifier, exportName, signatureId) {
  return {
    providerId: "tsonic.csharp.provider-package.nodejs",
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
