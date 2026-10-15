namespace ProviderConstructorFixtures;

public sealed class ConstructorTarget
{
    public ConstructorTarget()
    {
    }

    public ConstructorTarget(int value, string label = "default")
    {
        Value = value;
        Label = label;
    }

    public ConstructorTarget(params int[] values)
    {
        Value = values.Length;
    }

    public ConstructorTarget(ref long value)
    {
        Value = (int)value;
    }

    public ConstructorTarget(out short value)
    {
        value = 1;
        Value = value;
    }

    public ConstructorTarget(in bool flag, char marker = 'x')
    {
        Value = flag ? marker : 0;
    }

    internal ConstructorTarget(decimal hidden)
    {
        Value = (int)hidden;
    }

    private ConstructorTarget(double hidden)
    {
        Value = (int)hidden;
    }

    public int Value { get; }

    public string Label { get; } = "";
}

public unsafe sealed class UnsupportedConstructorTarget
{
    public UnsupportedConstructorTarget(int* pointer)
    {
        Value = *pointer;
    }

    public int Value { get; }
}
