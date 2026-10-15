namespace ProviderConversionFixtures;

public readonly struct Meter
{
    public Meter(double value)
    {
        Value = value;
    }

    public double Value { get; }

    public static explicit operator Meter(double value)
    {
        return new Meter(value);
    }

    public static implicit operator double(Meter value)
    {
        return value.Value;
    }
}

public unsafe readonly struct PointerSourceConversion
{
    public static explicit operator PointerSourceConversion(int* value)
    {
        return new PointerSourceConversion();
    }
}
