'use client';
// Markdown 渲染（AI 回复）：按设计令牌定制样式，默认不渲染原始 HTML（安全）
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ReactNode } from 'react';

const components = {
  p: (props: { children?: ReactNode }) => <p className="my-1.5 leading-6 first:mt-0 last:mb-0">{props.children}</p>,
  strong: (props: { children?: ReactNode }) => <strong className="font-bold text-ink">{props.children}</strong>,
  em: (props: { children?: ReactNode }) => <em>{props.children}</em>,
  del: (props: { children?: ReactNode }) => <del className="text-slate-2">{props.children}</del>,
  h1: (props: { children?: ReactNode }) => <h3 className="mb-1.5 mt-3 text-base font-bold first:mt-0">{props.children}</h3>,
  h2: (props: { children?: ReactNode }) => <h4 className="mb-1.5 mt-3 text-sm font-bold first:mt-0">{props.children}</h4>,
  h3: (props: { children?: ReactNode }) => <h5 className="mb-1 mt-2.5 text-sm font-bold first:mt-0">{props.children}</h5>,
  h4: (props: { children?: ReactNode }) => <h6 className="mb-1 mt-2 text-sm font-semibold first:mt-0">{props.children}</h6>,
  ul: (props: { children?: ReactNode }) => <ul className="my-1.5 list-disc space-y-1 pl-5">{props.children}</ul>,
  ol: (props: { children?: ReactNode }) => <ol className="my-1.5 list-decimal space-y-1 pl-5">{props.children}</ol>,
  li: (props: { children?: ReactNode }) => <li className="leading-6 marker:text-slate-2">{props.children}</li>,
  blockquote: (props: { children?: ReactNode }) => (
    <blockquote className="my-2 border-l-2 border-accent/50 bg-paper-2/60 py-1 pl-3 text-slate-1">{props.children}</blockquote>
  ),
  a: (props: { href?: string; children?: ReactNode }) => (
    <a className="text-accent underline underline-offset-2" href={props.href} target="_blank" rel="noreferrer">
      {props.children}
    </a>
  ),
  code: (props: { className?: string; children?: ReactNode }) => {
    const isBlock = /language-/.test(props.className ?? '');
    if (isBlock) {
      return <code className="block overflow-x-auto rounded-lg bg-ink px-3 py-2 text-[11px] leading-5 text-white">{props.children}</code>;
    }
    return <code className="rounded bg-paper-2 px-1 py-0.5 font-mono text-[12px] text-ink">{props.children}</code>;
  },
  pre: (props: { children?: ReactNode }) => <pre className="my-2">{props.children}</pre>,
  hr: () => <hr className="my-3 border-line" />,
  table: (props: { children?: ReactNode }) => (
    <div className="my-2 overflow-x-auto rounded-lg border border-line">
      <table className="w-full text-left text-xs">{props.children}</table>
    </div>
  ),
  thead: (props: { children?: ReactNode }) => <thead className="bg-paper-2 text-slate-1">{props.children}</thead>,
  th: (props: { children?: ReactNode }) => <th className="border-b border-line px-3 py-1.5 font-semibold">{props.children}</th>,
  td: (props: { children?: ReactNode }) => <td className="border-b border-line/60 px-3 py-1.5 align-top">{props.children}</td>,
};

export function Markdown({ text }: { text: string }) {
  return (
    <div className="text-sm text-ink">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components as never}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
