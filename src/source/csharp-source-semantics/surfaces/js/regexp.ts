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
  isSourceLibraryType,
  recordCsharpTargetOperation,
  targetMethod,
  targetParameter,
  targetProperty,
} from "./source-library.js";

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
  return type !== undefined && isSourceLibraryType(type, context, "RegExp")
    ? csharpJsRegExpTargetType()
    : undefined;
}

export function isCsharpJsRegExpRuntimeCarrier(type: TargetTypeRef | undefined): type is CsharpJsRegExpTargetTypeRef {
  return type?.kind === "target-named" && (type as CsharpJsRegExpTargetTypeRef).csharpJsSurfaceKind === "regexp";
}

export function getRegExpTargetMembers(sourceName: string): readonly TargetMember[] {
  const regExpType = csharpJsRegExpTargetType();
  const stringType = csharpStringTargetType();
  const boolType = csharpSourcePrimitiveTargetType("bool");
  if (sourceName === "constructor") {
    return [{
      id: "Tsonic.CSharp.Js.RegExp..ctor(System.String,System.String)",
      sourceName,
      targetName: "RegExp",
      kind: "constructor",
      parameters: [
        targetParameter("pattern", stringType),
        targetParameter("flags", stringType, { optional: true }),
      ],
      returnType: regExpType,
      declaringType: regExpType,
    }];
  }
  if (sourceName === "test") {
    return [targetMethod("Tsonic.CSharp.Js.RegExp.test", "test", "test", [
      targetParameter("value", stringType),
    ], boolType)];
  }
  return [];
}

export function getRegExpPropertyTargetMember(sourceName: string): TargetMember | undefined {
  const regExpType = csharpJsRegExpTargetType();
  switch (sourceName) {
    case "source":
    case "flags":
      return targetProperty(`Tsonic.CSharp.Js.RegExp.${sourceName}`, sourceName, sourceName, csharpStringTargetType(), {
        declaringType: regExpType,
      });
    case "global":
    case "hasIndices":
    case "ignoreCase":
    case "multiline":
    case "dotAll":
    case "unicode":
    case "unicodeSets":
    case "sticky":
      return targetProperty(`Tsonic.CSharp.Js.RegExp.${sourceName}`, sourceName, sourceName, csharpSourcePrimitiveTargetType("bool"), {
        declaringType: regExpType,
      });
    case "lastIndex":
      return targetProperty(`Tsonic.CSharp.Js.RegExp.${sourceName}`, sourceName, sourceName, csharpSourcePrimitiveTargetType("int32"), {
        declaringType: regExpType,
      });
    default:
      return undefined;
  }
}
