// App 端 Markdown 渲染（AI 回复）：react-native-markdown-display，样式随主题/字号实时计算
import MarkdownDisplay from 'react-native-markdown-display';
import { useMemo } from 'react';
import { C, SF, useSettings } from './ui';

export function Markdown({ text }: { text: string }) {
  const { fs } = useSettings();
  // 每次渲染重建（消费 useSettings）：主题切换 / 字号调整后样式即时生效
  const styles = useMemo(
    () => ({
      body: { color: C.ink, fontSize: fs(13), lineHeight: fs(21) },
      strong: { color: C.ink, fontWeight: '800' },
      em: { fontStyle: 'italic' },
      heading1: { color: C.ink, fontSize: fs(16), fontWeight: '800', marginTop: 8, marginBottom: 4 },
      heading2: { color: C.ink, fontSize: fs(15), fontWeight: '800', marginTop: 8, marginBottom: 4 },
      heading3: { color: C.ink, fontSize: fs(14), fontWeight: '700', marginTop: 6, marginBottom: 3 },
      heading4: { color: C.ink, fontSize: fs(13), fontWeight: '700' },
      bullet_list: { marginTop: 4, marginBottom: 4 },
      ordered_list: { marginTop: 4, marginBottom: 4 },
      list_item: { marginVertical: 2 },
      bullet_list_icon: { color: C.accent, fontSize: fs(12) },
      ordered_list_icon: { color: C.accent },
      paragraph: { marginTop: 0, marginBottom: 0 },
      link: { color: C.accent, textDecorationLine: 'underline' },
      code_inline: { ...SF.chip, backgroundColor: C.group, color: C.ink, fontSize: fs(12), fontFamily: undefined, paddingHorizontal: 4, borderRadius: 4 },
      codeblock: { ...SF.inset, color: C.ink, fontSize: fs(11), padding: 10 },
      fence: { ...SF.inset, color: C.ink },
      blockquote: { backgroundColor: C.group, borderLeftColor: C.accent, borderLeftWidth: 3, paddingHorizontal: 10, paddingVertical: 4, marginVertical: 6 },
      hr: { backgroundColor: C.line, marginVertical: 10 },
      table: { borderWidth: 1, borderColor: C.line, borderRadius: 8 },
      th: { color: C.slate, fontWeight: '700', padding: 6, borderColor: C.line },
      td: { padding: 6, borderColor: C.line },
    }),
    [fs]
  );
  return <MarkdownDisplay style={styles as never}>{text}</MarkdownDisplay>;
}
