import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { receiverFieldInitializationSource } from "../../../../tsonic/test/fixtures/receiver-field-initialization.mjs";

for (const surface of ["native", "js"]) {
  test(`receiver field initialization retains ordered construction and live callbacks (${surface})`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: receiverFieldInitializationSource });
    assertCsharpCompilationSucceeded(compiled);
    const source = [...compiled.artifacts.values()].join("\n");
    assert.doesNotMatch(source, /double snapshot\s*=\s*this\./);
    assert.match(source, /this\.snapshot\s*=/);
    executeCsharpConstruction(compiled, `receiver-field-initialization-${surface}`, false, false, [], nativeProgram);
  });
}

const nativeProgram = `
if (!Tsonic.Generated.Index.run()) throw new System.Exception("source initialization order");
BootstrapProof.Verify();

static class BootstrapProof
{
    static byte[] ConstructorBody(System.Type owner)
    {
        var body = owner.GetConstructors()[0].GetMethodBody()!.GetILAsByteArray()!;
        if (body.Length != 14 || body[8] != 0x7d || body[13] != 0x2a)
            throw new System.Exception("Unexpected native initialization work");
        var token = System.BitConverter.ToInt32(body, 9);
        var field = owner.Module.ResolveField(token, owner.GenericTypeArguments, null)!;
        if (field.Name != "Value" || field.DeclaringType != owner)
            throw new System.Exception("Wrong native field initialization");
        System.Array.Clear(body, 9, 4);
        return body;
    }

    static void Compare(System.Type plain, System.Type initialized)
    {
        var first = ConstructorBody(plain);
        var second = ConstructorBody(initialized);
        for (var index = 0; index < first.Length; index++)
            if (first[index] != second[index]) throw new System.Exception("Redundant default initialization");
    }

    public static void Verify()
    {
        Compare(typeof(PlainReference), typeof(InitializedReference));
        Compare(typeof(PlainDelegate), typeof(InitializedDelegate));
        Compare(typeof(PlainGeneric<int>), typeof(InitializedGeneric<int>));
    }
}

sealed class PlainReference
{
    public object Value;
    public PlainReference(object value) { Value = value; }
}
sealed class InitializedReference
{
    public object Value = default(object)!;
    public InitializedReference(object value) { Value = value; }
}
sealed class PlainDelegate
{
    public System.Func<int, int> Value;
    public PlainDelegate(System.Func<int, int> value) { Value = value; }
}
sealed class InitializedDelegate
{
    public System.Func<int, int> Value = default(System.Func<int, int>)!;
    public InitializedDelegate(System.Func<int, int> value) { Value = value; }
}
sealed class PlainGeneric<T>
{
    public T Value;
    public PlainGeneric(T value) { Value = value; }
}
sealed class InitializedGeneric<T>
{
    public T Value = default(T)!;
    public InitializedGeneric(T value) { Value = value; }
}
`;
