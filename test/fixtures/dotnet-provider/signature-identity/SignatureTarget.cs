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
