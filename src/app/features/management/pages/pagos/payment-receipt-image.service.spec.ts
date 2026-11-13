import { Directory, Filesystem } from '@capacitor/filesystem';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  PAYMENT_RECEIPT_FILESYSTEM,
  PaymentReceiptImageService,
} from './payment-receipt-image.service';

describe('PaymentReceiptImageService', () => {
  let canvas: HTMLCanvasElement;
  let service: PaymentReceiptImageService;
  let fillText: ReturnType<typeof vi.fn>;
  let filesystem: {
    deleteFile: ReturnType<typeof vi.fn>;
    getUri: ReturnType<typeof vi.fn>;
    writeFile: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    filesystem = {
      deleteFile: vi.fn(async () => undefined),
      getUri: vi.fn(async () => ({ uri: 'file:///cache/receipt.png' })),
      writeFile: vi.fn(async () => ({ uri: 'file:///cache/receipt.png' })),
    };
    TestBed.configureTestingModule({
      providers: [
        PaymentReceiptImageService,
        {
          provide: PAYMENT_RECEIPT_FILESYSTEM,
          useValue: filesystem as unknown as typeof Filesystem,
        },
      ],
    });
    service = TestBed.inject(PaymentReceiptImageService);

    fillText = vi.fn();
    const context = {
      get canvas() {
        return canvas;
      },
      fillRect: vi.fn(),
      fillText,
      measureText: vi.fn((text: string) => ({ width: text.length * 10 })),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      strokeRect: vi.fn(),
    } as unknown as CanvasRenderingContext2D;
    canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => context),
      toDataURL: vi.fn(() => 'data:image/png;base64,cG5n'),
    } as unknown as HTMLCanvasElement;
    vi.spyOn(document, 'createElement').mockReturnValue(
      canvas as unknown as HTMLElement,
    );
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  it('renders a PNG into cache and returns its file URI', async () => {
    const uri = await service.createPng({
      consecutivo_recibo: 42,
      fecha_pago: '2026-11-12',
      medio_pago: 'Efectivo',
      deportista: 'Lucía Pérez',
      escuela: 'Escuela Deportiva',
      nit: '900123456-7',
      conceptos: [
        { descripcion: 'Mensualidad 2026-11', monto_pesos: 30000 },
      ],
      monto_pesos: 30000,
    });

    expect(uri).toBe('file:///cache/receipt.png');
    expect(canvas.toDataURL).toHaveBeenCalledWith('image/png');
    expect(fillText.mock.calls.some(([text]) => text === '12/11/2026')).toBe(
      true,
    );
    expect(
      fillText.mock.calls.some(
        ([text]) => text === 'Mensualidad Noviembre 2026',
      ),
    ).toBe(true);
    expect(filesystem.writeFile).toHaveBeenCalledWith(
      expect.objectContaining({
        path: expect.stringMatching(/^receipts\/recibo-42-\d+\.png$/),
        data: 'cG5n',
        directory: Directory.Cache,
        recursive: true,
      }),
    );
  });

  it('deletes the temporary PNG by its URI', async () => {
    await service.deletePng('file:///cache/receipt.png');

    expect(filesystem.deleteFile).toHaveBeenCalledWith({
      path: 'file:///cache/receipt.png',
    });
  });
});
