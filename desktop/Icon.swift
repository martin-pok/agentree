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
    // Large dark tile with generous native icon padding.
    let tile = NSBezierPath(roundedRect: NSRect(x: 70, y: 70, width: 884, height: 884), xRadius: 210, yRadius: 210)
    paper.setFill(); tile.fill()
    // The macOS drawing coordinate system grows upward.
    let stem = NSBezierPath()
    stem.lineWidth = 27; stem.lineCapStyle = .round
    stem.move(to: NSPoint(x: 512, y: 711))
    stem.line(to: NSPoint(x: 512, y: 804))
    white.setStroke(); stem.stroke()
    NSBezierPath(ovalIn: NSRect(x: 488, y: 783, width: 48, height: 48)).fill()
    let face = NSBezierPath(roundedRect: NSRect(x: 275, y: 250, width: 474, height: 474), xRadius: 145, yRadius: 145)
    face.fill()
    paper.setFill()
    NSBezierPath(roundedRect: NSRect(x: 389, y: 410, width: 60, height: 137), xRadius: 30, yRadius: 30).fill()
    NSBezierPath(roundedRect: NSRect(x: 575, y: 410, width: 60, height: 137), xRadius: 30, yRadius: 30).fill()
    NSGraphicsContext.current?.flushGraphics()
    NSGraphicsContext.restoreGraphicsState()
    let name = "icon_\(points)x\(points)\(scale == 2 ? "@2x" : "").png"
    try bitmap.representation(using: .png, properties: [:])!.write(to: destination.appendingPathComponent(name))
}
