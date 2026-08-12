using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;

namespace ChromatogramConverter;

public static class EmfConverter
{
    private static readonly byte[] PngSignature = { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A };

    public enum ImageKind { Unknown, Png, Emf }

    // Excel's default clipboard paste embeds pictures as Windows EMF
    // (vector metafile), not PNG — the ".bin" extension inside the xlsx's
    // zip is Excel's own generic name for "picture format it doesn't have
    // a dedicated extension mapping for". Detect by signature rather than
    // trusting the entry name.
    public static ImageKind Detect(byte[] bytes)
    {
        if (bytes.Length >= 8 && bytes.AsSpan(0, 8).SequenceEqual(PngSignature))
            return ImageKind.Png;
        // EMF: the first record is always EMR_HEADER (iType == 1, a 4-byte
        // little-endian int at offset 0), and every valid EMF file carries
        // the fixed ASCII signature " EMF" at byte offset 40.
        if (bytes.Length >= 44 &&
            bytes[0] == 0x01 && bytes[1] == 0x00 && bytes[2] == 0x00 && bytes[3] == 0x00 &&
            bytes[40] == (byte)' ' && bytes[41] == (byte)'E' && bytes[42] == (byte)'M' && bytes[43] == (byte)'F')
            return ImageKind.Emf;
        return ImageKind.Unknown;
    }

    // Rasterizes an EMF to PNG using GDI+ (System.Drawing.Imaging.Metafile)
    // — the same renderer Windows itself uses to draw the picture inside
    // Excel, so no external tools (ImageMagick, LibreOffice, etc.) and no
    // Office install are needed; this is part of the .NET runtime on
    // Windows.
    public static byte[] EmfToPng(byte[] emfBytes, int targetWidthPx)
    {
        using var input = new MemoryStream(emfBytes);
        using var metafile = new Metafile(input);

        int sourceWidth = Math.Max(1, metafile.Width);
        int sourceHeight = Math.Max(1, metafile.Height);
        int width = targetWidthPx;
        int height = Math.Max(1, (int)Math.Round(width * (sourceHeight / (double)sourceWidth)));

        using var bitmap = new Bitmap(width, height, PixelFormat.Format32bppArgb);
        bitmap.SetResolution(150, 150);
        using (var g = Graphics.FromImage(bitmap))
        {
            g.Clear(Color.White); // EMF canvases are typically transparent — force a white background
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.InterpolationMode = InterpolationMode.HighQualityBicubic;
            g.DrawImage(metafile, new Rectangle(0, 0, width, height));
        }

        using var output = new MemoryStream();
        bitmap.Save(output, ImageFormat.Png);
        return output.ToArray();
    }
}
