namespace ProviderSignatureFixtures;

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
