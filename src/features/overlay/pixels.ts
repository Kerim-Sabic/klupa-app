import type { Pixels } from './teams';

/** Shirt colour needs very little detail: the frame is read at this width. */
export const SAMPLE_WIDTH = 192;

export type ReadPixels = (video: HTMLVideoElement) => Pixels | null;

/**
 * A reader that copies the frame a video shows into a small canvas kept in memory and hands
 * back its pixels. The canvas is never attached to the page, turned into a file or sent
 * anywhere: the pixels are averaged into one colour per player and then overwritten by the
 * next frame. Null where a 2D canvas is not available.
 */
export function createPixelReader(): ReadPixels {
  let canvas: HTMLCanvasElement | null = null;
  let context: CanvasRenderingContext2D | null = null;
  return (video) => {
    const { videoWidth, videoHeight } = video;
    if (!(videoWidth > 0 && videoHeight > 0)) return null;
    canvas ??= document.createElement('canvas');
    const width = Math.min(SAMPLE_WIDTH, videoWidth);
    const height = Math.max(1, Math.round((width * videoHeight) / videoWidth));
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    context ??= canvas.getContext('2d', { willReadFrequently: true });
    if (context === null) return null;
    context.drawImage(video, 0, 0, width, height);
    const image = context.getImageData(0, 0, width, height);
    return { data: image.data, width, height };
  };
}
