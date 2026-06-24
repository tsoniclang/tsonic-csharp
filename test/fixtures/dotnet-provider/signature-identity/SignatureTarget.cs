namespace ProviderSignatureFixtures;

public enum SignatureMode
{
    None = 0,
    Enabled = 2,
}

public sealed class SignatureTarget
{
    public void M(int value)
    {
    }

    public void M(ref int value)
    {
    }

    public void WriteOut(out int value)
    {
        value = 1;
    }

    public void ReadIn(in int value)
    {
    }

    public void Generic()
    {
    }

    public void Generic<T>()
    {
    }

    public void Generic<T, U>()
    {
    }
}

public sealed class ParameterModeTarget
{
    public void OptionalDefaults(
        string required,
        int count = 7,
        SignatureMode mode = SignatureMode.Enabled,
        string? label = null)
    {
    }

    public void ParamsRest(string label, params int[] values)
    {
    }

    public void ByRefModes(ref int current, out bool assigned, in long snapshot)
    {
        assigned = true;
    }
}

public static class MixedExtensionTarget
{
    public static int Transform(string value)
    {
        return value.Length;
    }

    public static int Transform(this string value, int offset)
    {
        return value.Length + offset;
    }
}
