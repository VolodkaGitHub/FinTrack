import { AxiosError, type AxiosResponse } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { blobErrorMessage, saveResponse } from './download';

describe('file downloads', () => {
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  let downloads: string[] = [];

  beforeEach(() => {
    downloads = [];
    click.mockImplementation(function (this: HTMLAnchorElement) {
      downloads.push(this.download);
    });
    URL.createObjectURL = vi.fn(() => 'blob:report');
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => vi.useRealTimers());

  it('uses the file name from Content-Disposition', async () => {
    vi.useFakeTimers();
    const response = {
      data: new Blob(['%PDF']),
      headers: { 'content-disposition': 'attachment; filename="fintrack-report_2025-02.pdf"' },
    } as unknown as AxiosResponse<Blob>;
    await saveResponse(Promise.resolve(response), 'fallback.pdf');
    expect(downloads).toEqual(['fintrack-report_2025-02.pdf']);
    vi.runAllTimers();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:report');
  });

  it('falls back to the default name', async () => {
    await saveResponse(Promise.resolve({ data: new Blob(['a']), headers: {} } as unknown as AxiosResponse<Blob>), 'export.csv');
    expect(downloads).toEqual(['export.csv']);
  });

  it('reads error details from blob responses', async () => {
    const withDetail = new AxiosError('bad', 'ERR_BAD_REQUEST', undefined, null, {
      status: 400,
      data: new Blob([JSON.stringify({ detail: 'Звіт можна сформувати максимум за 5 років' })]),
    } as AxiosResponse);
    await expect(blobErrorMessage(withDetail, 'fallback')).resolves.toBe('Звіт можна сформувати максимум за 5 років');

    const notJson = new AxiosError('bad', 'ERR_BAD_REQUEST', undefined, null, { status: 500, data: new Blob(['<html>']) } as AxiosResponse);
    await expect(blobErrorMessage(notJson, 'fallback')).resolves.toBe('fallback');
    await expect(blobErrorMessage(new Error('x'), 'fallback')).resolves.toBe('fallback');
    const emptyDetail = new AxiosError('bad', 'ERR_BAD_REQUEST', undefined, null, { status: 400, data: new Blob(['{}']) } as AxiosResponse);
    await expect(blobErrorMessage(emptyDetail, 'fallback')).resolves.toBe('fallback');
  });
});
