import { Config } from '@remotion/cli/config';

// 出片质量与覆盖策略（其余参数在命令行传入，例如 --browser-executable 复用系统 Chrome）
Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);
