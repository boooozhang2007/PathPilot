// 应用偏好（DeepSeek 式设置项）：外观 / 语言 / 字体大小 / 个性化 —— AsyncStorage 持久化
import AsyncStorage from '@react-native-async-storage/async-storage';

export type AppearanceMode = 'light' | 'dark' | 'system';
/** 主题风格：极简（默认）/ 拟物（皮革·牛皮纸）/ 新拟物（soft UI） */
export type ThemeStyle = 'minimal' | 'skeuo' | 'neumorph';
export type LanguageMode = 'system' | 'zh' | 'en';
export type FontSizeMode = 'small' | 'default' | 'large' | 'xlarge';
export type AnswerStyle = 'concise' | 'detailed';

export interface AppSettings {
  appearance: AppearanceMode;
  themeStyle: ThemeStyle;
  language: LanguageMode;
  fontSize: FontSizeMode;
  /** 个性化：思考过程展示 / 工具调用展示 / 回答风格 */
  showThinking: boolean;
  showTools: boolean;
  answerStyle: AnswerStyle;
}

export const DEFAULT_SETTINGS: AppSettings = {
  appearance: 'light',
  themeStyle: 'minimal',
  language: 'system',
  fontSize: 'default',
  showThinking: true,
  showTools: true,
  answerStyle: 'concise',
};

export const FONT_SCALE: Record<FontSizeMode, number> = {
  small: 0.85,
  default: 1,
  large: 1.18,
  xlarge: 1.35,
};

const KEY = 'pp_settings';

export async function loadSettings(): Promise<AppSettings> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<AppSettings>) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(s: AppSettings): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(s));
}

/** 语言解析：跟随系统时默认中文（本项目目标用户为国内大学生） */
export function resolveLang(mode: LanguageMode): 'zh' | 'en' {
  if (mode === 'zh' || mode === 'en') return mode;
  return 'zh';
}
