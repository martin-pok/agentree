import AppKit
// macOS Dock icon: full-body Scout from site/robot-scout.svg, rendered using
// the canonical monochrome palette. It intentionally differs from the small
// head-only mark used in the menu bar and browser toolbar.
// No trident, no purple antenna, no legacy external icon assets.
let destination = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
try FileManager.default.createDirectory(at: destination, withIntermediateDirectories: true)
let paper = NSColor(srgbRed: 0x17/255.0, green: 0x17/255.0, blue: 0x1D/255.0, alpha: 1)
let white = NSColor(srgbRed: 0xFA/255.0, green: 0xFA/255.0, blue: 0xFA/255.0, alpha: 1)
for (points, scale) in [(16,1),(16,2),(32,1),(32,2),(128,1),(128,2),(256,1),(256,2),(512,1),(512,2)] {
    let size = points * scale
    let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size,
                                  bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true,
                                  isPlanar: false, colorSpaceName: .deviceRGB,
                                  bytesPerRow: 0, bitsPerPixel: 0)!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
    let context = NSGraphicsContext.current!.cgContext
    context.scaleBy(x: CGFloat(size) / 1024, y: CGFloat(size) / 1024)
    let factor: CGFloat = 7.2
    func x(_ v: CGFloat) -> CGFloat { 123 + v * factor }
    func y(_ v: CGFloat) -> CGFloat { 1024 - (109 + v * factor) }
    func rounded(_ px: CGFloat, _ py: CGFloat, _ w: CGFloat, _ h: CGFloat, _ radius: CGFloat, _ fill: NSColor) {
        fill.setFill()
        NSBezierPath(roundedRect: NSRect(x: x(px), y: y(py + h), width: w * factor, height: h * factor),
                     xRadius: radius * factor, yRadius: radius * factor).fill()
    }
    func circle(_ cx: CGFloat, _ cy: CGFloat, _ radius: CGFloat, _ fill: NSColor) {
        fill.setFill()
        NSBezierPath(ovalIn: NSRect(x: x(cx - radius), y: y(cy + radius),
                                   width: radius * 2 * factor, height: radius * 2 * factor)).fill()
    }
    func line(_ x1: CGFloat, _ y1: CGFloat, _ x2: CGFloat, _ y2: CGFloat, _ width: CGFloat) {
        white.setStroke()
        let path = NSBezierPath()
        path.lineWidth = width * factor
        path.lineCapStyle = .round
        path.move(to: NSPoint(x: x(x1), y: y(y1)))
        path.line(to: NSPoint(x: x(x2), y: y(y2)))
        path.stroke()
    }
    paper.setFill()
    NSBezierPath(roundedRect: NSRect(x: 70, y: 70, width: 884, height: 884),
                 xRadius: 239.4, yRadius: 239.4).fill()
    // Geometrie je 1:1 s robotem Scout na landing page.
    line(37, 88, 37, 98, 6)
    line(71, 88, 71, 98, 6)
    line(28, 75, 21, 84, 6)
    line(80, 75, 87, 84, 6)
    rounded(33, 69, 42, 24, 11, white)
    circle(54, 80, 3, paper)
    line(54, 23, 54, 13, 5)
    circle(54, 10, 4, white)
    rounded(14, 39, 10, 19, 5, white)
    rounded(84, 39, 10, 19, 5, white)
    rounded(21, 23, 66, 51, 18, white)
    rounded(28, 32, 52, 32, 14, paper)
    rounded(38, 42, 7, 11, 3.5, white)
    rounded(63, 42, 7, 11, 3.5, white)
    NSGraphicsContext.current?.flushGraphics()
    NSGraphicsContext.restoreGraphicsState()
    let name = "icon_\(points)x\(points)\(scale == 2 ? "@2x" : "").png"
    try bitmap.representation(using: .png, properties: [:])!.write(to: destination.appendingPathComponent(name))
}
