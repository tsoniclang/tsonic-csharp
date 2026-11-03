import type { AstReader, ExtensionFactSubject, ReadonlySourceFactResolver } from "@tsonic/tsts";
import { selectTsonicRawLocationFacts } from "@tsonic/source-core/facts";

export function readCsharpRawLocation(ast: AstReader, facts: ReadonlySourceFactResolver | undefined, subject: ExtensionFactSubject): ReturnType<typeof selectTsonicRawLocationFacts> {
  return facts === undefined ? undefined : selectTsonicRawLocationFacts(ast, facts, subject);
}
