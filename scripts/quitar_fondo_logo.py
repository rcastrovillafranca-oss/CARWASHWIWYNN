"""
Quita el fondo blanco de un logo y lo deja transparente + recortado + optimizado.

Uso:
    python scripts/quitar_fondo_logo.py assets/mi-logo-nuevo.jpg assets/mi-logo-nuevo.png

Funciona bien con logos que tienen fondo blanco/casi blanco sólido: elimina
solo el blanco conectado al borde de la imagen (flood fill), así no borra
blancos que son parte del propio diseño (como el interior de letras).
"""

import sys

from PIL import Image
import numpy as np

MAX_DIM = 600


def strip_white_bg(src_path, dst_path, threshold=230):
    img = Image.open(src_path).convert("RGB")
    arr = np.array(img).astype(np.int16)
    h, w, _ = arr.shape

    r, g, b = arr[..., 0], arr[..., 1], arr[..., 2]
    white_mask = (r > threshold) & (g > threshold) & (b > threshold)

    seed = np.zeros((h, w), dtype=bool)
    seed[0, :] = white_mask[0, :]
    seed[-1, :] = white_mask[-1, :]
    seed[:, 0] = white_mask[:, 0]
    seed[:, -1] = white_mask[:, -1]

    changed = True
    while changed:
        new = seed.copy()
        new[1:, :] |= seed[:-1, :]
        new[:-1, :] |= seed[1:, :]
        new[:, 1:] |= seed[:, :-1]
        new[:, :-1] |= seed[:, 1:]
        new &= white_mask
        changed = not np.array_equal(new, seed)
        seed = new

    alpha = np.where(seed, 0, 255).astype(np.uint8)
    rgba = np.dstack([np.array(img), alpha])
    out = Image.fromarray(rgba, mode="RGBA")

    bbox = out.getbbox()
    if bbox:
        out = out.crop(bbox)

    scale = MAX_DIM / max(out.size)
    if scale < 1:
        out = out.resize((round(out.width * scale), round(out.height * scale)), Image.LANCZOS)

    out.save(dst_path, optimize=True)
    print(f"{dst_path} -> {out.size}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Uso: python scripts/quitar_fondo_logo.py <entrada> <salida.png>")
        sys.exit(1)
    strip_white_bg(sys.argv[1], sys.argv[2])
