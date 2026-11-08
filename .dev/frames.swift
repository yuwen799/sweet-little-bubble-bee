// 把视频拆成 PNG 帧（Mac 自带，不用装 ffmpeg）。用法：
//   swiftc -O .dev/frames.swift -o /tmp/frames && /tmp/frames 视频.mp4 输出文件夹 每秒几帧
import AVFoundation
import AppKit
let args = CommandLine.arguments
let url = URL(fileURLWithPath: args[1]); let outDir = args[2]; let fps = Double(args[3])!
let asset = AVURLAsset(url: url)
let gen = AVAssetImageGenerator(asset: asset)
gen.requestedTimeToleranceBefore = .zero; gen.requestedTimeToleranceAfter = .zero
let dur = CMTimeGetSeconds(asset.duration)
let track = asset.tracks(withMediaType: .video).first!
print("duration", dur, "nominalFps", track.nominalFrameRate, "size", track.naturalSize)
var i = 0; var t = 0.0
while t < dur - 0.001 {
  let cg = try! gen.copyCGImage(at: CMTime(seconds: t, preferredTimescale: 600), actualTime: nil)
  let rep = NSBitmapImageRep(cgImage: cg)
  try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: String(format: "%@/f%03d.png", outDir, i)))
  i += 1; t += 1.0 / fps
}
print("frames", i)
