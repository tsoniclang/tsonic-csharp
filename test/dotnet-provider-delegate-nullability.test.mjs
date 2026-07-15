import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";

import {
  createDotnetReflectionTypeDataProvider,
  dotnetModuleToProviderDeclarationModel,
  dotnetTypeRefToTargetTypeRef,
} from "../dist/index.js";
import { buildDotnetFixture } from "./helpers/dotnet-fixtures.mjs";
import { repoRoot } from "./dotnet-provider.helpers.mjs";

const fixtureDirectory = join(repoRoot, "test/fixtures/dotnet-provider/delegate-nullability");
const reference = buildDotnetFixture({
  project: join(fixtureDirectory, "DelegateNullabilityProviderFixture.csproj"),
  outputDirectory: join(repoRoot, ".temp/dotnet-provider-fixtures/delegate-nullability/bin"),
  intermediateDirectory: join(repoRoot, ".temp/dotnet-provider-fixtures/delegate-nullability/obj/"),
  outputAssemblyName: "DelegateNullabilityProviderFixture.dll",
  projectDirectory: fixtureDirectory,
});

test(".NET provider projects closed delegate nullability from the member use site", () => {
  const provider = createDotnetReflectionTypeDataProvider({ references: [reference], disablePersistentCache: true });
  const module = provider.getModule("@tsonic/dotnet/ProviderDelegateNullabilityFixtures.js", {
    requestedExports: ["CallbackHost"],
  });
  assert.equal("exports" in module, true, JSON.stringify(module));

  const rawCallbackHost = module.exports.find((declaration) =>
    declaration.kind === "type" && declaration.sourceName === "CallbackHost"
  );
  assert.ok(rawCallbackHost);
  const rawRegister = requireRawMethod(rawCallbackHost, "Register");
  assertRawCallbackTargetNullability(rawRegister.signatures[0].parameters[0].type, false, true);
  const rawRegisterNullable = requireRawMethod(rawCallbackHost, "RegisterNullable");
  assertRawCallbackTargetNullability(rawRegisterNullable.signatures[0].parameters[0].type, true, false);

  const declarationModel = dotnetModuleToProviderDeclarationModel(module);
  const callbackHost = declarationModel.exports.find((declaration) =>
    declaration.kind === "class" && declaration.name === "CallbackHost"
  );
  assert.ok(callbackHost);

  const register = requireMethod(callbackHost, "Register");
  assertCallbackNullability(register.signatures[0].parameters[0].type, false, true);

  const registerNullable = requireMethod(callbackHost, "RegisterNullable");
  assertCallbackNullability(registerNullable.signatures[0].parameters[0].type, true, false);

  const callback = callbackHost.members.find((member) => member.kind === "property" && member.name === "Callback");
  assert.ok(callback);
  assertCallbackNullability(callback.type, false, true);

  const create = requireMethod(callbackHost, "Create");
  assertCallbackNullability(create.signatures[0].returnType, false, true);
});

test(".NET provider preserves authored type parameters on open generic delegate declarations", () => {
  const provider = createDotnetReflectionTypeDataProvider({ references: [reference], disablePersistentCache: true });
  const module = provider.getModule("@tsonic/dotnet/ProviderDelegateNullabilityFixtures.js", {
    requestedExports: ["HeaderSelector"],
  });
  assert.equal("exports" in module, true, JSON.stringify(module));

  const declarationModel = dotnetModuleToProviderDeclarationModel(module);
  const selector = declarationModel.exports.find((declaration) => declaration.name === "HeaderSelector");
  assert.ok(selector);
  assert.equal(selector.kind, "class");
  assert.deepEqual(selector.typeParameters?.map((parameter) => parameter.name), ["TContext"]);
  assert.equal(selector.type?.kind, "function");
  assert.equal(selector.type.parameters[1].type.kind, "union");
  assert.deepEqual(selector.type.parameters[1].type.types.map((type) => type.kind), ["type-parameter", "undefined"]);
  assert.equal(selector.type.parameters[1].type.types[0].name, "TContext");
});

function requireMethod(declaration, name) {
  const member = declaration.members.find((candidate) => candidate.kind === "method" && candidate.name === name);
  assert.ok(member);
  return member;
}

function requireRawMethod(declaration, name) {
  const member = declaration.members.find((candidate) => candidate.kind === "method" && candidate.sourceName === name);
  assert.ok(member);
  return member;
}

function assertRawCallbackTargetNullability(type, firstNullable, secondNullable) {
  assert.equal(type.kind, "named");
  assert.equal(type.typeArguments.length, 3);
  assert.equal(type.typeArguments[0].kind === "nullable-reference", firstNullable);
  assert.equal(type.typeArguments[1].kind === "nullable-reference", secondNullable);

  const targetType = dotnetTypeRefToTargetTypeRef(type);
  assert.equal(targetType.typeArguments[0].csharpNullableReference === true, firstNullable);
  assert.equal(targetType.typeArguments[1].csharpNullableReference === true, secondNullable);
  assert.equal(targetType.csharpDelegateSignature.parameters[0].csharpNullableReference === true, firstNullable);
  assert.equal(targetType.csharpDelegateSignature.parameters[1].csharpNullableReference === true, secondNullable);
}

function assertCallbackNullability(type, firstAllowsUndefined, secondAllowsUndefined) {
  assert.equal(type.kind, "target-named");
  assert.equal(type.sourceShape?.kind, "function");
  const parameters = type.sourceShape.parameters;
  assert.equal(parameters.length, 2);
  assert.equal(allowsUndefined(parameters[0].type), firstAllowsUndefined);
  assert.equal(allowsUndefined(parameters[1].type), secondAllowsUndefined);
}

function allowsUndefined(type) {
  return type.kind === "undefined" ||
    (type.kind === "union" && type.types.some((candidate) => candidate.kind === "undefined"));
}
