/** Can this browser draw WebGL at all? Kept apart from the 3D code so asking costs no download. */
export function hasWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return (canvas.getContext('webgl2') ?? canvas.getContext('webgl')) !== null;
  } catch {
    return false;
  }
}
