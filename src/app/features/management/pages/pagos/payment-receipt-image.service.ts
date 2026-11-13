import { inject, Injectable, InjectionToken } from '@angular/core';
import { Directory, Filesystem } from '@capacitor/filesystem';

export interface ReceiptImageConcept {
  descripcion: string;
  monto_pesos: number;
}

export interface PaymentReceipt {
  consecutivo_recibo: number;
  fecha_pago: string;
  medio_pago: string;
  deportista: string;
  escuela: string;
  nit: string | null;
  conceptos: ReceiptImageConcept[];
  monto_pesos: number;
}

const IMAGE_WIDTH = 1000;
const IMAGE_PADDING = 76;
export const PAYMENT_RECEIPT_FILESYSTEM = new InjectionToken<
  typeof Filesystem
>('PAYMENT_RECEIPT_FILESYSTEM', {
  providedIn: 'root',
  factory: () => Filesystem,
});
const SPANISH_MONTHS = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

@Injectable({ providedIn: 'root' })
export class PaymentReceiptImageService {
  private readonly filesystem = inject(PAYMENT_RECEIPT_FILESYSTEM);
  private readonly currencyFormatter = new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  });

  async createPng(receipt: PaymentReceipt): Promise<string> {
    const canvas = document.createElement('canvas');
    canvas.width = IMAGE_WIDTH;
    canvas.height = 1200;
    let context = canvas.getContext('2d');
    if (!context) {
      throw new Error('No se pudo crear la imagen del recibo.');
    }

    canvas.height = this.drawReceipt(context, receipt);
    context = canvas.getContext('2d');
    if (!context) {
      throw new Error('No se pudo crear la imagen del recibo.');
    }
    this.drawReceipt(context, receipt);

    const dataUrl = canvas.toDataURL('image/png');
    const path = `receipts/recibo-${receipt.consecutivo_recibo}-${Date.now()}.png`;
    try {
      await this.filesystem.writeFile({
        path,
        data: dataUrl.slice(dataUrl.indexOf(',') + 1),
        directory: Directory.Cache,
        recursive: true,
      });
      const { uri } = await this.filesystem.getUri({
        path,
        directory: Directory.Cache,
      });
      return uri;
    } catch (error) {
      await this.filesystem
        .deleteFile({ path, directory: Directory.Cache })
        .catch(() => undefined);
      throw error;
    }
  }

  async deletePng(uri: string): Promise<void> {
    await this.filesystem.deleteFile({ path: uri });
  }

  private drawReceipt(
    context: CanvasRenderingContext2D,
    receipt: PaymentReceipt,
  ): number {
    const width = context.canvas.width;
    const left = IMAGE_PADDING;
    const right = width - IMAGE_PADDING;
    const contentWidth = right - left;
    const lineHeight = 42;
    let y = 112;

    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, context.canvas.height);

    y += this.drawWrappedText(
      context,
      receipt.escuela,
      left,
      y,
      contentWidth,
      'bold 48px Arial, sans-serif',
      '#146b64',
      58,
    );
    y += 14;
    y += this.drawWrappedText(
      context,
      `NIT: ${receipt.nit || 'No registrado'}`,
      left,
      y,
      contentWidth,
      '30px Arial, sans-serif',
      '#344340',
      38,
    );
    y += 34;
    y += this.drawWrappedText(
      context,
      `RECIBO DE PAGO · No. ${String(receipt.consecutivo_recibo).padStart(6, '0')}`,
      left,
      y,
      contentWidth,
      'bold 31px Arial, sans-serif',
      '#263431',
      40,
    );
    y += 28;
    this.drawRule(context, left, right, y, '#146b64', 5);
    y += 48;

    y = this.drawMetadata(context, 'Deportista', receipt.deportista, left, y);
    y = this.drawMetadata(
      context,
      'Fecha',
      this.formatReceiptDate(receipt.fecha_pago),
      left,
      y,
    );
    y = this.drawMetadata(context, 'Medio de pago', receipt.medio_pago, left, y);
    y += 16;

    context.font = 'bold 34px Arial, sans-serif';
    context.fillStyle = '#263431';
    context.fillText('Detalle del pago', left, y);
    y += 58;

    context.font = 'bold 27px Arial, sans-serif';
    context.fillStyle = '#344340';
    context.fillText('Concepto', left + 10, y);
    context.textAlign = 'right';
    context.fillText('Valor', right - 10, y);
    context.textAlign = 'left';
    y += 24;
    this.drawRule(context, left, right, y, '#d7e1df', 2);
    y += 18;

    for (const concept of receipt.conceptos) {
      const descriptionLines = this.wrapText(
        context,
        this.formatReceiptConcept(concept.descripcion),
        contentWidth - 250,
        '27px Arial, sans-serif',
      );
      context.font = '27px Arial, sans-serif';
      context.fillStyle = '#53615e';
      descriptionLines.forEach((line, index) => {
        context.fillText(line, left + 10, y + 32 + index * lineHeight);
      });
      context.fillStyle = '#263431';
      context.textAlign = 'right';
      context.fillText(
        this.currencyFormatter.format(concept.monto_pesos),
        right - 10,
        y + 32,
      );
      context.textAlign = 'left';
      y += Math.max(58, descriptionLines.length * lineHeight) + 8;
      this.drawRule(context, left, right, y, '#e1e8e6', 1);
      y += 16;
    }

    context.font = 'bold 30px Arial, sans-serif';
    context.fillStyle = '#263431';
    context.fillText('Total recibido', left + 10, y + 34);
    context.textAlign = 'right';
    context.fillText(
      this.currencyFormatter.format(receipt.monto_pesos),
      right - 10,
      y + 34,
    );
    context.textAlign = 'left';
    y += 92;

    context.font = '28px Arial, sans-serif';
    context.fillStyle = '#75817e';
    context.textAlign = 'center';
    context.fillText('Gracias por su pago.', width / 2, y);
    context.textAlign = 'left';
    y += 78;

    context.strokeStyle = '#d7e1df';
    context.lineWidth = 2;
    context.strokeRect(22, 22, width - 44, y - 44);
    return y;
  }

  private drawMetadata(
    context: CanvasRenderingContext2D,
    label: string,
    value: string,
    x: number,
    y: number,
  ): number {
    const labelText = `${label}:`;
    const valueFont = '27px Arial, sans-serif';
    context.font = 'bold 27px Arial, sans-serif';
    context.fillStyle = '#263431';
    context.fillText(labelText, x, y);
    const valueX = x + context.measureText(`${labelText} `).width;
    const firstLineWidth = IMAGE_WIDTH - IMAGE_PADDING - valueX;
    const lineHeight = 37;
    const lines = this.wrapText(context, value, firstLineWidth, valueFont);
    context.font = valueFont;
    context.fillStyle = '#53615e';
    context.fillText(lines[0], valueX, y);
    lines.slice(1).forEach((line, index) => {
      context.fillText(line, x, y + (index + 1) * lineHeight);
    });
    return y + Math.max(lines.length * lineHeight, lineHeight) + 18;
  }

  private drawWrappedText(
    context: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    maxWidth: number,
    font: string,
    color: string,
    lineHeight: number,
  ): number {
    context.font = font;
    context.fillStyle = color;
    const lines = this.wrapText(context, text, maxWidth, font);
    lines.forEach((line, index) => {
      context.fillText(line, x, y + index * lineHeight);
    });
    return lines.length * lineHeight;
  }

  private wrapText(
    context: CanvasRenderingContext2D,
    text: string,
    maxWidth: number,
    font: string,
  ): string[] {
    context.font = font;
    const words = text.trim().split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let line = '';

    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && context.measureText(candidate).width > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) {
      lines.push(line);
    }

    return lines.length ? lines : [''];
  }

  private drawRule(
    context: CanvasRenderingContext2D,
    left: number,
    right: number,
    y: number,
    color: string,
    lineWidth: number,
  ): void {
    context.beginPath();
    context.strokeStyle = color;
    context.lineWidth = lineWidth;
    context.moveTo(left, y);
    context.lineTo(right, y);
    context.stroke();
  }

  private formatReceiptDate(date: string): string {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    return match ? `${match[3]}/${match[2]}/${match[1]}` : date;
  }

  private formatReceiptConcept(description: string): string {
    const match = /^Mensualidad (\d{4})-(\d{2})$/.exec(description);
    if (!match) {
      return description;
    }
    const month = Number(match[2]);
    return month >= 1 && month <= 12
      ? `Mensualidad ${SPANISH_MONTHS[month - 1]} ${match[1]}`
      : description;
  }
}
