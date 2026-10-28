import axios, { type AxiosResponse } from 'axios';

/** Зберігає файл з відповіді сервера (ім'я — із заголовка Content-Disposition). */
export async function saveResponse(request: Promise<AxiosResponse<Blob>>, fallbackName: string): Promise<void> {
  const response = await request;
  const disposition = String(response.headers['content-disposition'] ?? '');
  const match = disposition.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
  const filename = match ? decodeURIComponent(match[1]) : fallbackName;
  const url = URL.createObjectURL(response.data);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Blob.text() відсутній у старіших Safari (до 14) — тоді читаємо через FileReader. */
function readText(blob: Blob): Promise<string> {
  if (typeof blob.text === 'function') {
    return blob.text();
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

/** Для запитів з responseType=blob тіло помилки теж приходить як Blob — дістаємо з нього повідомлення. */
export async function blobErrorMessage(error: unknown, fallback: string): Promise<string> {
  if (axios.isAxiosError(error) && error.response?.data instanceof Blob) {
    try {
      const body = JSON.parse(await readText(error.response.data)) as { detail?: string };
      return body.detail ?? fallback;
    } catch {
      return fallback;
    }
  }
  return fallback;
}
