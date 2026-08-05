import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";

import {
  createDotnetReflectionTypeDataProvider,
  dotnetModuleToProviderDeclarationModel,
  dotnetTypeRefToTargetTypeRef,
} from "../dist/index.js";
import { buildDotnetFixture } from "./helpers/dotnet-fixtures.mjs";
import { getCompleteDotnetModule, repoRoot } from "./dotnet-provider.helpers.mjs";

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
  const module = getCompleteDotnetModule(provider, "@tsonic/dotnet/ProviderDelegateNullabilityFixtures.js", {
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

  const replace = requireMethod(callbackHost, "Replace");
  const replacement = replace.signatures[0].parameters[0];
  assert.equal(replacement.passingMode, "byref-readwrite");
  assertCallbackNullability(replacement.type, true, false);
});

test(".NET provider preserves authored non-null type parameters on open generic delegate declarations", () => {
  const provider = createDotnetReflectionTypeDataProvider({ references: [reference], disablePersistentCache: true });
  const module = getCompleteDotnetModule(provider, "@tsonic/dotnet/ProviderDelegateNullabilityFixtures.js", {
    requestedExports: ["HeaderSelector"],
  });
  assert.equal("exports" in module, true, JSON.stringify(module));

  const declarationModel = dotnetModuleToProviderDeclarationModel(module);
  const selector = declarationModel.exports.find((declaration) => declaration.name === "HeaderSelector");
  assert.ok(selector);
  assert.equal(selector.kind, "type");
  assert.deepEqual(selector.typeParameters?.map((parameter) => parameter.name), ["TContext"]);
  assert.equal(selector.type?.kind, "function");
  assert.deepEqual(selector.type.parameters[1].type, {
    kind: "type-parameter",
    name: "TContext",
  });
});

test(".NET provider distinguishes authored T from T? inside generic delegate use sites", () => {
  const provider = createDotnetReflectionTypeDataProvider({ references: [reference], disablePersistentCache: true });
  const module = getCompleteDotnetModule(provider, "@tsonic/dotnet/ProviderDelegateNullabilityFixtures.js", {
    requestedExports: ["GenericCallbackHost"],
  });
  assert.equal("exports" in module, true, JSON.stringify(module));

  const rawHost = module.exports.find((declaration) =>
    declaration.kind === "type" && declaration.sourceName === "GenericCallbackHost"
  );
  assert.ok(rawHost);
  const rawPlain = requireRawMethod(rawHost, "Plain").signatures[0];
  const rawNullable = requireRawMethod(rawHost, "Nullable").signatures[0];
  assert.deepEqual(rawPlain.typeParameters?.map((parameter) => parameter.name), ["T"]);
  assert.deepEqual(rawNullable.typeParameters?.map((parameter) => parameter.name), ["T"]);
  assertGenericDelegateArgumentNullability(rawPlain.parameters[0].type, false, "named");
  assertGenericDelegateArgumentNullability(rawNullable.parameters[0].type, true, "named");

  const declarationModel = dotnetModuleToProviderDeclarationModel(module);
  const host = declarationModel.exports.find((declaration) => declaration.name === "GenericCallbackHost");
  assert.ok(host);
  const plain = requireMethod(host, "Plain").signatures[0];
  const nullable = requireMethod(host, "Nullable").signatures[0];
  assertSourceGenericDelegateArgumentNullability(plain.parameters[0].type, false);
  assertSourceGenericDelegateArgumentNullability(nullable.parameters[0].type, true);
});

test(".NET provider projects Queryable expression-tree parameters from exact delegate type arguments", () => {
  const provider = createDotnetReflectionTypeDataProvider({ disablePersistentCache: true });
  const module = getCompleteDotnetModule(provider, "@tsonic/dotnet/System.Linq.js", {
    requestedExports: ["Queryable"],
  });
  assert.equal("exports" in module, true, JSON.stringify(module));

  const rawQueryable = module.exports.find((declaration) =>
    declaration.kind === "type" && declaration.sourceName === "Queryable"
  );
  assert.ok(rawQueryable);
  const rawOrderByDescending = requireRawMethod(rawQueryable, "OrderByDescending").signatures.find((signature) =>
    signature.parameters.length === 2
  );
  assert.ok(rawOrderByDescending);
  assertGenericSelectorShape(rawOrderByDescending.parameters[1].type.sourceShape);

  const declarationModel = dotnetModuleToProviderDeclarationModel(module);
  const queryable = declarationModel.exports.find((declaration) => declaration.name === "Queryable");
  assert.ok(queryable);
  const orderByDescending = requireMethod(queryable, "OrderByDescending").signatures.find((signature) =>
    signature.parameters.length === 2
  );
  assert.ok(orderByDescending);
  assertGenericSelectorShape(orderByDescending.parameters[1].type);
});

test(".NET provider separates nullable object inputs from non-null object inputs", () => {
  const provider = createDotnetReflectionTypeDataProvider({ references: [reference], disablePersistentCache: true });
  const module = getCompleteDotnetModule(provider, "@tsonic/dotnet/ProviderDelegateNullabilityFixtures.js", {
    requestedExports: ["ObjectInputHost"],
  });
  assert.equal("exports" in module, true, JSON.stringify(module));
  const rawHost = module.exports.find((declaration) => declaration.sourceName === "ObjectInputHost");
  assert.ok(rawHost);

  const nonNullable = requireRawMethod(rawHost, "NonNullableObject").signatures[0].parameters[0];
  assert.deepEqual(nonNullable.type, { kind: "object" });
  assert.equal(nonNullable.sourceType, undefined);

  const nullable = requireRawMethod(rawHost, "NullableObject").signatures[0].parameters[0];
  assert.deepEqual(nullable.type, {
    kind: "nullable-reference",
    elementType: { kind: "object" },
  });
  assert.deepEqual(nullable.sourceType, { kind: "unknown" });

  const nonNullableRest = requireRawMethod(rawHost, "NonNullableObjects").signatures[0].parameters[0];
  assert.deepEqual(nonNullableRest.type, {
    kind: "array",
    elementType: { kind: "object" },
  });
  assert.deepEqual(nonNullableRest.sourceType, {
    kind: "array",
    elementType: { kind: "unknown" },
  });
  assert.equal(nonNullableRest.rest, true);

  const nullableRest = requireRawMethod(rawHost, "NullableObjects").signatures[0].parameters[0];
  assert.deepEqual(nullableRest.type, {
    kind: "nullable-reference",
    elementType: {
      kind: "array",
      elementType: {
        kind: "nullable-reference",
        elementType: { kind: "object" },
      },
    },
  });
  assert.deepEqual(nullableRest.sourceType, {
    kind: "array",
    elementType: { kind: "unknown" },
  });
  assert.equal(nullableRest.rest, true);

  const declarationModel = dotnetModuleToProviderDeclarationModel(module);
  const host = declarationModel.exports.find((declaration) => declaration.name === "ObjectInputHost");
  assert.ok(host);
  assert.deepEqual(requireMethod(host, "NonNullableObject").signatures[0].parameters[0].type, { kind: "object" });
  assert.deepEqual(requireMethod(host, "NullableObject").signatures[0].parameters[0].type, { kind: "unknown" });
  assert.deepEqual(requireMethod(host, "NonNullableObjects").signatures[0].parameters[0].type, {
    kind: "array",
    elementType: { kind: "unknown" },
  });
  assert.deepEqual(requireMethod(host, "NullableObjects").signatures[0].parameters[0].type, {
    kind: "array",
    elementType: { kind: "unknown" },
  });

  const binding = provider.findTargetBindingByMetadataName(
    "ProviderDelegateNullabilityFixtures.ObjectInputHost",
  );
  assert.ok(binding);
  for (const member of binding.members) {
    assert.equal(member.parameters[0].csharpAcceptsCheckedSourceArgument, true);
  }
  const nullableTarget = binding.members.find((member) => member.sourceName === "NullableObject");
  assert.equal(nullableTarget.parameters[0].type.csharpNullableReference, true);
  const nonNullableTarget = binding.members.find((member) => member.sourceName === "NonNullableObject");
  assert.equal(nonNullableTarget.parameters[0].type.csharpNullableReference, undefined);
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
  assert.equal(type.kind, "function");
  const parameters = type.parameters;
  assert.equal(parameters.length, 2);
  assert.equal(allowsUndefined(parameters[0].type), firstAllowsUndefined);
  assert.equal(allowsUndefined(parameters[1].type), secondAllowsUndefined);
}

function assertSourceGenericDelegateArgumentNullability(type, expectedNullable) {
  assert.equal(type.kind, "function");
  assert.equal(type.parameters.length, 1);
  const sourceArgumentType = type.parameters[0].type;
  assert.equal(allowsUndefined(sourceArgumentType), expectedNullable);
  const authoredType = sourceArgumentType.kind === "union"
    ? sourceArgumentType.types.find((candidate) => candidate.kind !== "undefined")
    : sourceArgumentType;
  assert.deepEqual(authoredType, { kind: "type-parameter", name: "T" });
}

function assertGenericDelegateArgumentNullability(type, expectedNullable, expectedKind) {
  assert.equal(type.kind, expectedKind);
  assert.equal(type.sourceShape?.kind, "function");
  const argumentType = type.typeArguments[0];
  if (expectedKind === "named") {
    assert.equal(argumentType.kind === "nullable-reference", expectedNullable);
  }
  const sourceArgumentType = type.sourceShape.parameters[0].sourceType ??
    type.sourceShape.parameters[0].type;
  assert.equal(allowsUndefined(sourceArgumentType), expectedNullable);
  const authoredType = argumentType.kind === "nullable-reference" ? argumentType.elementType : argumentType;
  assert.deepEqual(authoredType, { kind: "type-parameter", name: "T" });
}

function assertGenericSelectorShape(type) {
  assert.equal(type.kind, "function");
  assert.deepEqual(type.parameters[0].type, {
    kind: "type-parameter",
    name: "TSource",
  });
  assert.deepEqual(type.returnType, {
    kind: "type-parameter",
    name: "TKey",
  });
  assert.equal(type.parameters[0].sourceType, undefined);
}

function allowsUndefined(type) {
  return type.kind === "undefined" ||
    (type.kind === "union" && type.types.some((candidate) => candidate.kind === "undefined"));
}
