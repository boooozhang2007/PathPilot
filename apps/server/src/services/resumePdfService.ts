// 简历 PDF 导出（PRD 4.9 P1）：服务端 pdfkit 生成，内置 Noto Sans SC 中文字体
import PDFDocument from 'pdfkit';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { ResumePdfInput } from '@pathpilot/shared';

type PdfDoc = InstanceType<typeof PDFDocument>;

const FONT_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'assets', 'fonts', 'NotoSansSC-Regular.otf');

const INK = '#111827';
const BODY = '#374151';
const MUTED = '#6b7280';
const ACCENT = '#2563eb';
const LINE = '#e5e7eb';

function sectionTitle(doc: PdfDoc, title: string): void {
  doc.moveDown(0.4);
  doc.fontSize(13).fillColor(INK).text(title);
  const y = doc.y + 3;
  doc
    .moveTo(doc.page.margins.left, y)
    .lineTo(doc.page.width - doc.page.margins.right, y)
    .lineWidth(1)
    .strokeColor(LINE)
    .stroke();
  doc.moveDown(0.5);
}

export async function buildResumePdf(input: ResumePdfInput): Promise<Buffer> {
  return await new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 56, bottom: 56, left: 56, right: 56 },
      info: { Title: `${input.targetRole} · 简历` },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.registerFont('cjk', FONT_PATH);
    doc.font('cjk');

    // 页眉：姓名 + 目标岗位
    doc.fontSize(22).fillColor(INK).text(input.nickname?.trim() || '个人简历', { align: 'left' });
    doc.moveDown(0.2);
    doc.fontSize(12).fillColor(ACCENT).text(`目标岗位：${input.targetRole}`, { align: 'left' });

    // 个人简介
    if (input.summary.trim()) {
      sectionTitle(doc, '个人简介');
      doc.fontSize(10.5).fillColor(BODY).text(input.summary.trim(), { lineGap: 4 });
    }

    // 各板块
    for (const s of input.sections) {
      const items = s.items.map((i) => i.trim()).filter(Boolean);
      if (!items.length) continue;
      sectionTitle(doc, s.heading);
      for (const item of items) {
        doc.fontSize(10.5).fillColor(BODY).text(`•  ${item}`, { lineGap: 3, indent: 14 });
      }
    }

    // 备注
    const notes = input.notes.map((n) => n.trim()).filter(Boolean);
    if (notes.length) {
      sectionTitle(doc, '备注');
      for (const n of notes) {
        doc.fontSize(9.5).fillColor(MUTED).text(`·  ${n}`, { lineGap: 2, indent: 14 });
      }
    }

    doc.end();
  });
}
