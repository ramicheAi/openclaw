// Remotion CLI configuration. Applies to `remotion studio` and `remotion render`.
// Docs: https://www.remotion.dev/docs/config
import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
// H.264 MP4 is the default codec; kept explicit for clarity.
Config.setCodec("h264");
// Higher quality JPEG frames -> crisper output (1-100).
Config.setJpegQuality(90);
