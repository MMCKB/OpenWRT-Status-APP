#!/usr/bin/env python3
"""Generate Android launcher resources from the default-branch brand icon.

The colored variants preserve the original launcher artwork for pre-Android 8
launchers.  The monochrome variant intentionally uses only the source image's
alpha channel, allowing Android 13+ themed icon launchers to apply the system
accent colour without changing application behaviour.
"""

from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
RES = ROOT / "android" / "app" / "src" / "main" / "res"
SOURCE = RES / "drawable-nodpi" / "default_branch_launcher_icon.png"
DENSITIES = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192,
}


def main() -> None:
    source = Image.open(SOURCE).convert("RGBA")
    for directory, size in DENSITIES.items():
        target = RES / directory / "ic_launcher.png"
        target.parent.mkdir(parents=True, exist_ok=True)
        source.resize((size, size), Image.Resampling.LANCZOS).save(target)

    # The source icon is opaque with an off-white background.  Derive a mask
    # from its colour distance to that corner background so Android 13 themed
    # icons retain the router silhouette instead of becoming a blank rounded
    # square.
    pixels = np.asarray(source)
    rgb = pixels[..., :3].astype(np.int16)
    background = rgb[0, 0]
    distance = np.abs(rgb - background).max(axis=2)
    alpha = np.clip((distance - 8) * 255 / 48, 0, 255).astype(np.uint8)
    monochrome = Image.new("RGBA", source.size, (255, 255, 255, 0))
    monochrome.putalpha(Image.fromarray(alpha, mode="L"))
    monochrome.save(RES / "drawable-nodpi" / "ic_launcher_monochrome.png")


if __name__ == "__main__":
    main()
