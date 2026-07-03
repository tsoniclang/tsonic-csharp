import type {
  ExtensionFactSubject,
  ExtensionObservationContext,
} from "@tsonic/tsts";
import {
  csharpRegularExpressionLiteralFactKey,
} from "../../../../csharp-facts.js";
import {
  csharpProviderDiagnostic,
} from "../../../diagnostics.js";
import {
  asNodeSubject,
  csharpTargetMemberOperation,
  recordCsharpTargetOperation,
} from "../source-library.js";
import {
  csharpJsRegExpTargetType,
} from "./target-type.js";
import {
  validateCsharpJsRegExpPatternAndFlags,
} from "./validation.js";

export function recordCsharpJsRegExpLiteralFact(
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
  const validation = validateCsharpJsRegExpPatternAndFlags(literal.pattern, literal.flags);
  if (validation.kind !== "valid") {
    context.diagnostics.append({
      ...csharpProviderDiagnostic(
        context.extensionId,
        validation.kind === "unsupported" ? "CSHARP_JS_REGEXP_UNSUPPORTED" : "CSHARP_JS_REGEXP_SYNTAX_INVALID",
        validation.kind === "unsupported" ? 9100180 : 9100181,
        `C# JS RegExp supports only the proven ECMAScript-compatible subset. ${validation.message}`,
        [
          { message: "RegExp literal pattern and flags are statically known." },
          { message: `pattern=${JSON.stringify(literal.pattern)} flags=${JSON.stringify(literal.flags)}` },
        ],
      ),
      nodeOrSpan: node,
      identity: `csharp-js-regexp-literal:${ast.pos(node)}:${ast.end(node)}`,
    });
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
