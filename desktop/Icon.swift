import AppKit
// Brand icon: white robot + antenna on dark squircle. No coloured antenna.
let destination = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
try FileManager.default.createDirectory(at: destination, withIntermediateDirectories: true)
let paper = NSColor(srgbRed: 0x11/255.0, green: 0x10/255.0, blue: 0x17/255.0, alpha: 1)
let white = NSColor(srgbRed: 0xFA/255.0, green: 0xFA/255.0, blue: 0xFA/255.0, alpha: 1)
for (points, scale) in [(16,1),(16,2),(32,1),(32,2),(128,1),(128,2),(256,1),(256,2),(512,1),(512,2)] {
    let size = points * scale
    let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
    let context = NSGraphicsContext.current!.cgContext
    context.scaleBy(x: CGFloat(size)/1024, y: CGFloat(size)/1024)
    // Exact geometry from public/brand/agenteeq-mark.svg, mapped from 48px
    // to the padded 884px tile. AppKit uses bottom-up coordinates.
    let factor: CGFloat = 884.0 / 48.0
    func x(_ v: CGFloat) -> CGFloat { 70 + v * factor }
    func y(_ v: CGFloat) -> CGFloat { 70 + (48 - v) * factor }
    let tile = NSBezierPath(roundedRect: NSRect(x: 70, y: 70, width: 884, height: 884),
                            xRadius: 13 * factor, yRadius: 13 * factor)
    paper.setFill(); tile.fill()
    white.setStroke()
    let stem = NSBezierPath()
    stem.lineWidth = 3 * factor
    stem.lineCapStyle = .round
    stem.move(to: NSPoint(x: x(24), y: y(9)))
    stem.line(to: NSPoint(x: x(24), y: y(17)))
    stem.stroke()
    white.setFill()
    NSBezierPath(ovalIn: NSRect(x: x(24 - 2.8), y: y(9 + 2.8),
                               width: 5.6 * factor, height: 5.6 * factor)).fill()
    NSBezierPath(roundedRect: NSRect(x: x(9), y: y(16.5 + 24),
                                   width: 30 * factor, height: 24 * factor),
                 xRadius: 9.5 * factor, yRadius: 9.5 * factor).fill()
    paper.setFill()
    for eyeX: CGFloat in [17, 27] {
        NSBezierPath(roundedRect: NSRect(x: x(eyeX), y: y(24 + 8),
                                       width: 4 * factor, height: 8 * factor),
                     xRadius: 2 * factor, yRadius: 2 * factor).fill()
    }
    NSGraphicsContext.current?.flushGraphics()
    NSGraphicsContext.restoreGraphicsState()
    let name = "icon_\(points)x\(points)\(scale == 2 ? "@2x" : "").png"
    try bitmap.representation(using: .png, properties: [:])!.write(to: destination.appendingPathComponent(name))
}
