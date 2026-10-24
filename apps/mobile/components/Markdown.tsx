// App 端 Markdown 渲染（AI 回复）：react-native-markdown-display，样式对齐设计令牌
import MarkdownDisplay from 'react-native-markdown-display';
import { C } from './ui';

const styles = {
  body: { color: C.ink, fontSize: 13, lineHeight: 20 },
  strong: { color: C.ink, fontWeight: '800' },
  em: { fontStyle: 'italic' },
  heading1: { color: C.ink, fontSize: 16, fontWeight: '800', marginTop: 8, marginBottom: 4 },
  heading2: { color: C.ink, fontSize: 15, fontWeight: '800', marginTop: 8, marginBottom: 4 },
  heading3: { color: C.ink, fontSize: 14, fontWeight: '700', marginTop: 6, marginBottom: 3 },
  heading4: { color: C.ink, fontSize: 13, fontWeight: '700' },
  bullet_list: { marginTop: 4, marginBottom: 4 },
  ordered_list: { marginTop: 4, marginBottom: 4 },
  list_item: { marginVertical: 2 },
  bullet_list_icon: { color: C.accent, fontSize: 12 },
  ordered_list_icon: { color: C.accent },
  paragraph: { marginTop: 0, marginBottom: 0 },
  link: { color: C.accent, textDecorationLine: 'underline' },
  code_inline: { backgroundColor: '#EDE8DB', color: C.ink, fontSize: 12, fontFamily: undefined, paddingHorizontal: 4, borderRadius: 4 },
  codeblock: { backgroundColor: C.ink, color: '#fff', fontSize: 11, borderRadius: 8, padding: 10 },
  fence: { backgroundColor: C.ink, color: '#fff', borderRadius: 8 },
  blockquote: { backgroundColor: '#F5F2EA', borderLeftColor: C.accent, borderLeftWidth: 3, paddingHorizontal: 10, paddingVertical: 4, marginVertical: 6 },
  hr: { backgroundColor: C.line, marginVertical: 10 },
  table: { borderWidth: 1, borderColor: C.line, borderRadius: 8 },
  th: { color: C.slate, fontWeight: '700', padding: 6, borderColor: C.line },
  td: { padding: 6, borderColor: C.line },
} as const;

export function Markdown({ text }: { text: string }) {
  return <MarkdownDisplay style={styles as never}>{text}</MarkdownDisplay>;
}
