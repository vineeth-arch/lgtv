// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "VTVCore",
    platforms: [.macOS(.v13), .iOS(.v17)],
    products: [
        .library(name: "VTVCore", targets: ["VTVCore"]),
        .executable(name: "vtvctl", targets: ["vtvctl"]),
        .executable(name: "vtvcore-selfcheck", targets: ["vtvcore-selfcheck"]),
    ],
    targets: [
        .target(name: "VTVCore"),
        .executableTarget(name: "vtvctl", dependencies: ["VTVCore"]),
        .executableTarget(name: "vtvcore-selfcheck", dependencies: ["VTVCore"]),
    ]
)
