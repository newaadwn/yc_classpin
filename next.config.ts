import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins: ["127.0.0.1"],
  // 개발 모드 Next 배지는 기본이 왼쪽 아래라 참여자 하단 막대(시각·참여 코드·페이지 버튼)를 가린다.
  devIndicators: { position: "top-right" },
  // 상위 디렉터리에 다른 lockfile 이 있으면 Next 가 트레이싱 루트를 위로 잡아
  // standalone 출력이 중첩된 경로로 떨어진다. 항상 이 폴더를 루트로 고정한다.
  outputFileTracingRoot: path.resolve(import.meta.dirname),
  // Local experiment snapshots, jobs and Python runtimes are never deployment assets.
  outputFileTracingExcludes: {
    "/*": ["./output/**/*", "./tmp/**/*", "./.local/**/*", "./experiments/**/*"],
  },
  experimental: { serverActions: { bodySizeLimit: "40mb" } },
};

export default nextConfig;
