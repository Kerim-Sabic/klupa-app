import { vi } from 'vitest';
import { shippedFiles, shippedText } from './testTracking';

/** Test-only: the shipped tracking files served from disk through a mocked fetch. */
const binaries = new Map<string, Uint8Array>();
function binary(id: string): Uint8Array {
  const cached = binaries.get(id);
  if (cached !== undefined) return cached;
  const bytes = new Uint8Array(shippedFiles(id).bin);
  binaries.set(id, bytes);
  return bytes;
}

function stream(chunks: readonly Uint8Array[], hold = false): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      if (!hold) controller.close();
    },
  });
}

export interface Serve {
  hold?: boolean;
  failFirst?: boolean;
  failPhysical?: boolean;
}

/** The shipped files from disk, by URL, as the server would send them. */
export function serve(options: Serve = {}) {
  let calls = 0;
  let physicalCalls = 0;
  const fetchMock = vi.fn((url: string) => {
    calls += 1;
    if (options.failFirst === true && calls === 1) return Promise.reject(new TypeError('offline'));
    const name = url.split('/').pop() ?? '';
    if (name.endsWith('.physical.json')) {
      physicalCalls += 1;
      if (options.failPhysical === true && physicalCalls === 1) {
        return Promise.resolve(new Response(null, { status: 500 }));
      }
    }
    if (name.endsWith('.json')) return Promise.resolve(new Response(shippedText(name)));
    if (name.endsWith('.bin')) {
      const bytes = binary(name.replace('.bin', ''));
      const half = bytes.length >> 1;
      const chunks =
        options.hold === true ? [bytes.slice(0, half)] : [bytes.slice(0, half), bytes.slice(half)];
      return Promise.resolve(
        new Response(stream(chunks, options.hold), {
          status: 200,
          headers: { 'content-length': String(bytes.length) },
        }),
      );
    }
    return Promise.resolve(new Response(null, { status: 404 }));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** Pretend the browser can, or cannot, draw WebGL. */
export function webgl(available: boolean) {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() =>
    available ? {} : null) as unknown as HTMLCanvasElement['getContext']);
}
