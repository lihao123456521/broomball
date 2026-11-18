"""Build the standalone browser edition with the Python standard library."""
from html.parser import HTMLParser
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile
import argparse


ROOT = Path(__file__).resolve().parents[1]


class PageAssets(HTMLParser):
    def __init__(self):
        super().__init__()
        self.paths = set()

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "script" and attrs.get("src"):
            self.paths.add(attrs["src"])
        elif tag == "link" and attrs.get("rel") == "stylesheet":
            self.paths.add(attrs["href"])


def package(destination):
    page = PageAssets()
    page.feed((ROOT / "index.html").read_text(encoding="utf-8"))
    files = {ROOT / path for path in page.paths}
    files.update(ROOT / path for path in (
        "index.html", "vendor/THREE-LICENSE.txt", "assets/audio/crowd/README.md",
        "assets/audio/crowd/manifest.json", "assets/voice/VOICE.md", "assets/models/README.md",
    ))
    for pattern in ("assets/models/runtime/*.js", "assets/voice/*.wav", "assets/voice/commentary/*.wav"):
        files.update(ROOT.glob(pattern))
    destination.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(destination, "w", compression=ZIP_DEFLATED, compresslevel=6) as archive:
        for source in sorted(files):
            archive.write(source, source.relative_to(ROOT))
        archive.writestr("开始游戏.txt", """Broomball · 学院冠军赛

请先完整解压，再用电脑上的 Chrome 或 Edge 打开 index.html。模型、解说和观众欢呼均已包含，可离线游玩。
首次体验可选“新手教程”。选择学院、队长和难度后，点击“球队入场”开始三分钟比赛。

W / A / S / D 移动，Shift 冲刺。骑手在接近球时自动升降。
持球时 E 短传，R 直塞，按住 F 蓄力，松开射门。
防守时按住 F 逼抢，对手出球后继续按住 F 追球。队友传球时可提前按 E / R / F 衔接下一步。
空格跳过入场或庆祝，Esc 暂停，可分别调节解说与观众音量。
""")
    print(f"{destination} ({destination.stat().st_size / 1024**2:.1f} MiB)")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", nargs="?", type=Path, default=ROOT / "tests/artifacts/Broomball.zip")
    package(parser.parse_args().output)
