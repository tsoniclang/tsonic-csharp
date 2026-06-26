import {
  acceptObservation,
  deferObservation,
  runtimeCarrierFactKey,
} from "@tsonic/tsts";
import type {
  ExtensionFactSubject,
  ExtensionObservation,
  ExtensionObservationContext,
  RuntimeCarrierFactRequest,
  RuntimeCarrierFactResult,
  SourceFile,
  TargetMember,
  TargetTypeRef,
  Type,
} from "@tsonic/tsts";
import {
  getNodeField,
  visitAstReaderNodes,
} from "../../ast-utils.js";
import {
  createRuntimeCarrierLifecycleObservationContext,
} from "../../runtime-carriers.js";
import {
  getSymbolForDeclarationLookup,
} from "../../symbol-utils.js";
import {
  csharpRegularExpressionLiteralFactKey,
} from "../../../csharp-facts.js";
import {
  type CsharpTargetNamedTypeRef,
  asNodeSubject,
  asType,
  csharpQualifiedTypeRenderShape,
  csharpTargetMemberOperation,
  csharpSourcePrimitiveTargetType,
  csharpStringTargetType,
  csharpTargetNamedType,
  recordCsharpTargetOperation,
  targetParameter,
} from "./source-library.js";
import type {
  JsSurfaceTargetMemberMetadata,
} from "./target-member-metadata.js";
import {
  jsSurfaceSingleTargetMemberForSourceName,
  jsSurfaceTargetMemberMetadataIndex,
  jsSurfaceTargetMembersForSourceName,
} from "./target-member-metadata.js";
import {
  isSourceStandardLibraryRegExpType,
} from "../../source-type-classification.js";

const csharpJsRegExpTypeId = "Tsonic.CSharp.Js.RegExp";

type CsharpJsRegExpTargetTypeRef = CsharpTargetNamedTypeRef & {
  readonly csharpJsSurfaceKind: "regexp";
};

export function csharpJsRegExpTargetType(): CsharpJsRegExpTargetTypeRef {
  return {
    ...csharpTargetNamedType(csharpJsRegExpTypeId, undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "RegExp")),
    csharpJsSurfaceKind: "regexp",
  } satisfies CsharpJsRegExpTargetTypeRef;
}

export function mapCsharpJsRegExpRuntimeCarrier(
  request: RuntimeCarrierFactRequest,
  context: ExtensionObservationContext<"type.resolveRuntimeCarrier">,
): ExtensionObservation<RuntimeCarrierFactResult> {
  recordCsharpJsRegExpLiteralFact(request.sourceTypeReference, context);
  const carrier = getCsharpJsRegExpRuntimeCarrierForSubject(request.sourceTypeReference, context) ??
    getCsharpJsRegExpRuntimeCarrierForType(asType(request.type), context);
  return carrier === undefined
    ? deferObservation
    : acceptObservation<RuntimeCarrierFactResult>({
        carrier,
      }, [{ message: "C# JS surface runtime carrier mapped from checked JavaScript library type." }]);
}

export function recordCsharpJsRegExpRuntimeCarrierFactsBeforeFinalization(
  lifecycleContext: { readonly host: ExtensionObservationContext["host"]; readonly compiler?: ExtensionObservationContext["compiler"] },
): void {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined) {
    return;
  }
  const context = createRuntimeCarrierLifecycleObservationContext(lifecycleContext);
  for (const sourceFile of compiler.getSourceFiles()) {
    if (sourceFile === undefined || sourceFile.IsDeclarationFile === true) {
      continue;
    }
    visitAstReaderNodes(compiler.ast, sourceFile, (node) => {
      if (compiler.ast.is.IsRegularExpressionLiteral(node) !== true) {
        return;
      }
      recordCsharpJsRegExpLiteralFact(node, context);
      if (!isCsharpJsRegExpRuntimeCarrier(lifecycleContext.host.facts.get(node, runtimeCarrierFactKey)?.carrier)) {
        lifecycleContext.host.facts.set(node, runtimeCarrierFactKey, {
          carrier: csharpJsRegExpTargetType(),
        }, [{ message: "C# JS surface RegExp literal runtime carrier recorded from source syntax." }]);
      }
      recordCsharpJsRegExpBindingCarrierFact(node, sourceFile, context);
    });
  }
}

function recordCsharpJsRegExpBindingCarrierFact(
  literal: ExtensionFactSubject,
  sourceFile: SourceFile,
  context: ExtensionObservationContext,
): void {
  const node = asNodeSubject(literal);
  const compiler = context.compiler;
  if (node === undefined || compiler === undefined) {
    return;
  }
  const declaration = compiler.ast.parent(node);
  if (
    declaration === undefined ||
    compiler.ast.kindName(declaration) !== "KindVariableDeclaration" ||
    asNodeSubject(getNodeField(declaration, "Initializer")) !== node
  ) {
    return;
  }
  const name = asNodeSubject(getNodeField(declaration, "name"));
  const fact = { carrier: csharpJsRegExpTargetType() };
  const evidence = [{ message: "C# JS surface RegExp literal runtime carrier propagated to checked variable binding." }];
  if (name !== undefined && context.host.facts.get(name, runtimeCarrierFactKey) === undefined) {
    context.host.facts.set(name, runtimeCarrierFactKey, fact, evidence);
  }
  const symbol = name === undefined
    ? undefined
    : getSymbolForDeclarationLookup(compiler.ast, compiler.checker, name, sourceFile);
  if (symbol !== undefined && context.host.facts.get(symbol, runtimeCarrierFactKey) === undefined) {
    context.host.facts.set(symbol, runtimeCarrierFactKey, fact, evidence);
  }
}

function recordCsharpJsRegExpLiteralFact(
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
): void {
  const node = asNodeSubject(subject);
  const ast = context.compiler?.ast;
  if (node === undefined || ast?.is.IsRegularExpressionLiteral(node) !== true) {
    return;
  }
  const literal = parseRegularExpressionLiteral(ast.text(node));
  if (literal === undefined) {
    return;
  }
  context.facts.set(node, csharpRegularExpressionLiteralFactKey, literal, [{ message: "C# JS surface RegExp literal pattern and flags recorded from source syntax." }]);
  recordCsharpTargetOperation(context, node, csharpTargetMemberOperation("tsonic.csharp.js.regexp.literal.constructor", "constructor", "RegExp", {
    declaringType: csharpJsRegExpTargetType(),
    resultType: csharpJsRegExpTargetType(),
  }), [{ message: "C# JS surface RegExp literal constructor operation recorded from source syntax." }]);
}

function parseRegularExpressionLiteral(text: string): { readonly pattern: string; readonly flags: string } | undefined {
  if (!text.startsWith("/")) {
    return undefined;
  }
  let escaped = false;
  let inCharacterClass = false;
  for (let index = 1; index < text.length; index += 1) {
    const char = text[index]!;
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === "[" && !inCharacterClass) {
      inCharacterClass = true;
      continue;
    }
    if (char === "]" && inCharacterClass) {
      inCharacterClass = false;
      continue;
    }
    if (char === "/" && !inCharacterClass) {
      return {
        pattern: text.slice(1, index),
        flags: text.slice(index + 1),
      };
    }
  }
  return undefined;
}

export function getCsharpJsRegExpRuntimeCarrierForSubject(
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
): TargetTypeRef | undefined {
  const node = asNodeSubject(subject);
  const ast = context.compiler?.ast;
  if (node !== undefined && ast?.is.IsRegularExpressionLiteral(node) === true) {
    return csharpJsRegExpTargetType();
  }
  const direct = context.facts.get(subject, runtimeCarrierFactKey)?.carrier;
  if (isCsharpJsRegExpRuntimeCarrier(direct)) {
    return direct;
  }
  const directType = asType(subject);
  if (directType !== undefined) {
    return getCsharpJsRegExpRuntimeCarrierForType(directType, context);
  }
  const checker = context.compiler?.checker;
  if (node === undefined || ast === undefined || checker === undefined) {
    return undefined;
  }
  const sourceFile = ast.getSourceFile(node);
  const symbol = getSymbolForDeclarationLookup(ast, checker, node, sourceFile);
  const symbolCarrier = context.facts.get(symbol, runtimeCarrierFactKey)?.carrier;
  if (isCsharpJsRegExpRuntimeCarrier(symbolCarrier)) {
    return symbolCarrier;
  }
  const resolvedSymbol = checker.getResolvedSymbol(node, { sourceFile });
  const resolvedCarrier = context.facts.get(resolvedSymbol, runtimeCarrierFactKey)?.carrier;
  if (isCsharpJsRegExpRuntimeCarrier(resolvedCarrier)) {
    return resolvedCarrier;
  }
  return getCsharpJsRegExpRuntimeCarrierForType(checker.getTypeAtLocation(node, { sourceFile }), context);
}

export function getCsharpJsRegExpRuntimeCarrierForType(
  type: Type | undefined,
  context: ExtensionObservationContext,
): TargetTypeRef | undefined {
  return type !== undefined && isSourceStandardLibraryRegExpType(type, context)
    ? csharpJsRegExpTargetType()
    : undefined;
}

export function isCsharpJsRegExpRuntimeCarrier(type: TargetTypeRef | undefined): type is CsharpJsRegExpTargetTypeRef {
  return type?.kind === "target-named" && (type as CsharpJsRegExpTargetTypeRef).csharpJsSurfaceKind === "regexp";
}

export function regExpTargetMembersForSourceName(sourceName: string): readonly TargetMember[] {
  return jsSurfaceTargetMembersForSourceName(regExpTargetMemberIndex, sourceName);
}

export function regExpPropertyTargetMemberForSourceName(sourceName: string): TargetMember | undefined {
  return jsSurfaceSingleTargetMemberForSourceName(regExpPropertyTargetMemberIndex, sourceName);
}

const regExpType = csharpJsRegExpTargetType();
const regExpStringType = csharpStringTargetType();
const regExpBoolType = csharpSourcePrimitiveTargetType("bool");
const regExpTargetMemberMetadata = [
  {
    id: "Tsonic.CSharp.Js.RegExp..ctor(System.String,System.String)",
    sourceName: "constructor",
    targetName: "RegExp",
    kind: "constructor",
    parameters: [
      targetParameter("pattern", regExpStringType),
      targetParameter("flags", regExpStringType, { optional: true }),
    ],
    returnType: regExpType,
    declaringType: regExpType,
  },
  {
    id: "Tsonic.CSharp.Js.RegExp.test",
    sourceName: "test",
    targetName: "test",
    kind: "method",
    parameters: [targetParameter("value", regExpStringType)],
    returnType: regExpBoolType,
  },
] satisfies readonly JsSurfaceTargetMemberMetadata[];
const regExpTargetMemberIndex = jsSurfaceTargetMemberMetadataIndex(regExpTargetMemberMetadata);

const regExpPropertyTargetMemberMetadata = [
  ...["source", "flags"].map((sourceName) => regExpPropertyMetadata(sourceName, regExpStringType)),
  ...[
    "global",
    "hasIndices",
    "ignoreCase",
    "multiline",
    "dotAll",
    "unicode",
    "unicodeSets",
    "sticky",
  ].map((sourceName) => regExpPropertyMetadata(sourceName, regExpBoolType)),
  regExpPropertyMetadata("lastIndex", csharpSourcePrimitiveTargetType("int32")),
] satisfies readonly JsSurfaceTargetMemberMetadata[];
const regExpPropertyTargetMemberIndex = jsSurfaceTargetMemberMetadataIndex(regExpPropertyTargetMemberMetadata);

function regExpPropertyMetadata(sourceName: string, returnType: TargetTypeRef): JsSurfaceTargetMemberMetadata {
  return {
    id: `Tsonic.CSharp.Js.RegExp.${sourceName}`,
    sourceName,
    targetName: sourceName,
    kind: "property",
    returnType,
    declaringType: regExpType,
  };
}
