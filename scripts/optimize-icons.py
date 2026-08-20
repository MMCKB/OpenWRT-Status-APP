from pathlib import Path
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets" / "images" / "icon.png"
TARGETS = [
    ROOT / "assets" / "images" / "icon.png",
    ROOT / "assets" / "images" / "splash-icon.png",
    ROOT / "assets" / "images" / "favicon.png",
    ROOT / "assets" / "images" / "android-icon-foreground.png",
]


def main() -> None:
    with Image.open(SOURCE) as original:
        image = original.convert("RGBA")
        image.thumbnail((512, 512), Image.Resampling.LANCZOS)
        for target in TARGETS:
            image.save(target, format="PNG", optimize=True, compress_level=9)
            print(f"optimized {target.name}: {target.stat().st_size} bytes")


if __name__ == "__main__":
    main()
