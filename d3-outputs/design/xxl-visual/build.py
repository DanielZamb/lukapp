#!/usr/bin/env python3
"""Build design/xxl-visual/index.html: one self-contained page.

Inlines Geist, the Ionicons used, the brand SVGs and D2's real-phone captures
(downscaled to JPEG) into src/page.html. Run from anywhere:

    python3 design/xxl-visual/build.py

Inputs resolve from the repository root first, then from d3-inputs/ (the
Claude Cloud handoff copy). Pillow is used if present for the captures; it is
not a project dependency.
"""
import base64, io, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))


def first(*paths):
    for p in paths:
        if os.path.exists(p):
            return p
    sys.exit(f"missing input: {paths[0]}")


def inputs(rel):
    return first(os.path.join(ROOT, rel), os.path.join(ROOT, "d3-inputs", rel))


def b64(data):
    return base64.b64encode(data).decode()


def fonts():
    pkg = os.path.join(ROOT, "apps/mobile/node_modules/@expo-google-fonts/geist")
    out = []
    for weight, name in [(400, "400Regular"), (500, "500Medium"), (600, "600SemiBold"), (800, "800ExtraBold")]:
        path = first(os.path.join(pkg, name, f"Geist_{name}.ttf"), os.path.join(HERE, "vendor/geist", f"Geist_{name}.ttf"))
        data = b64(open(path, "rb").read())
        out.append(f"@font-face{{font-family:'Geist';font-weight:{weight};font-style:normal;font-display:block;"
                   f"src:url(data:font/ttf;base64,{data}) format('truetype')}}")
    return "\n".join(out)


def sprite():
    folder = os.path.join(HERE, "vendor/ionicons")
    symbols = []
    for file in sorted(os.listdir(folder)):
        if not file.endswith(".svg"):
            continue
        svg = open(os.path.join(folder, file)).read()
        body = re.sub(r"^.*?<svg[^>]*>|</svg>\s*$", "", svg, flags=re.S)
        symbols.append(f'<symbol id="i-{file[:-4]}" viewBox="0 0 512 512">{body}</symbol>')
    return '<svg width="0" height="0" style="position:absolute" aria-hidden="true">' + "".join(symbols) + "</svg>"


def brand():
    folder = os.path.join(ROOT, "apps/mobile/assets/brand")
    def svg(name):
        text = open(os.path.join(folder, name)).read()
        text = re.sub(r"<title>.*?</title>", "", text)
        return re.sub(r'\s(role|aria-label)="[^"]*"', "", text)
    return {
        "lockup": svg("lukapp-lockup-color.svg"),
        "lockupInv": svg("lukapp-lockup-inverse.svg"),
        "symbol": svg("lukapp-symbol-color.svg").replace('fill="#6d28d9"', 'fill="currentColor"'),
        "wordmark": svg("lukapp-wordmark-inverse.svg").replace('stroke="#ffffff"', 'stroke="currentColor"'),
    }


try:
    from PIL import Image, ImageOps
except ImportError:  # captures are optional; the page labels them missing
    Image = None

CAPTURES = os.path.join("reports", "xxl-2026-10-24", "D2", "captures")
SCREENS = ["home", "history", "post-single-keyboard", "post-batch-closed", "overview-list", "entry-details", "category-look",
           "drafts", "budget", "settings"]
DP = 1080 / 320  # capture px per dp


def jpeg(img, width, quality=72):
    img = img.convert("RGB")
    if img.width != width:
        img = img.resize((width, round(img.height * width / img.width)), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=quality, optimize=True, progressive=True)
    return "data:image/jpeg;base64," + b64(buf.getvalue())


def captures():
    if Image is None:
        return {}, {}
    base = os.path.dirname(inputs(os.path.join(CAPTURES, "home-2.0", "manifest.json")))
    base = os.path.dirname(base)
    caps, chrome = {}, {}
    for screen in SCREENS:
        for scale in ["1.3", "2.0"]:
            folder = os.path.join(base, f"{screen}-{scale}")
            manifest = json.load(open(os.path.join(folder, "manifest.json")))
            view = manifest["scrollViewportPx"]
            frame = Image.open(os.path.join(folder, "00.png"))
            full = Image.open(os.path.join(folder, "full.png"))
            top, height = view["top"], view["height"]
            caps[f"{screen}-{scale}"] = {
                "top": jpeg(frame.crop((0, 0, 1080, top)), 640, 80),
                "full": jpeg(full, 480, 66),
                "bottom": jpeg(frame.crop((0, top + height, 1080, frame.height)), 640, 80),
                "topDp": round(top / DP, 2), "viewDp": round(height / DP, 2),
                "bottomDp": round((frame.height - top - height) / DP, 2),
                "screenHeights": manifest["screenHeights"],
                "reachable": manifest.get("reachableScreenHeights"),
            }
    # Real S21 FE chrome for the proposal frames: status bar, nav bar, keyboard.
    home = Image.open(os.path.join(base, "home-2.0", "00.png"))
    nav_top = 2178
    for mode in ["light", "dark"]:
        status = home.crop((0, 0, 1080, 99))
        nav = home.crop((0, nav_top, 1080, home.height))
        if mode == "dark":
            status, nav = ImageOps.invert(status.convert("RGB")), ImageOps.invert(nav.convert("RGB"))
        chrome[f"status-{mode}"] = jpeg(status, 640, 80)
        chrome[f"nav-{mode}"] = jpeg(nav, 640, 80)
    for scale in ["1.3", "2.0"]:
        folder = os.path.join(base, f"post-single-keyboard-{scale}")
        view = json.load(open(os.path.join(folder, "manifest.json")))["scrollViewportPx"]
        frame = Image.open(os.path.join(folder, "00.png"))
        kb = frame.crop((0, view["top"] + view["height"], 1080, nav_top))
        chrome[f"kb-{scale}-light"] = jpeg(kb, 640, 80)
        chrome[f"kb-{scale}-dark"] = jpeg(ImageOps.invert(kb.convert("RGB")), 640, 80)
        chrome[f"kb-{scale}-dp"] = round(kb.height / DP, 2)
    return caps, chrome


# D3 (the seven core screens), D4 (every other flow) and D5 (the remaining
# sheets and states) share the engine,
# the phone CSS and the assets.
PAGES = [
    ("page.html", os.path.join(HERE, "index.html"), os.path.join(HERE, "xxl-visual.fragment.html"), ["home", "history", "post-single-keyboard", "post-batch-closed", "overview-list", "entry-details", "category-look"]),
    ("flows.html", os.path.join(ROOT, "design", "xxl-flows", "index.html"), os.path.join(ROOT, "design", "xxl-flows", "xxl-flows.fragment.html"), ["drafts", "budget", "settings"]),
    ("states.html", os.path.join(ROOT, "design", "xxl-states", "index.html"), os.path.join(ROOT, "design", "xxl-states", "xxl-states.fragment.html"), ["home", "overview-list", "entry-details"]),
]


def main():
    caps, chrome = captures()
    font_css, icons, brand_svgs = fonts(), sprite(), brand()
    for source, out, fragment, used in PAGES:
        page = open(os.path.join(HERE, "src", source)).read()
        assets = {"brand": brand_svgs, "caps": {k: v for k, v in caps.items() if k.rsplit("-", 1)[0] in used}, "chrome": chrome}
        for name in ["page.css", "app.css", "engine.js", "screens.js", "flows.js", "states.js"]:
            page = page.replace(f"/*@{name}@*/", open(os.path.join(HERE, "src", name)).read())
        page = page.replace("/*@FONTS@*/", font_css)
        page = page.replace("<!--@SPRITE@-->", icons)
        page = page.replace("/*@ASSETS@*/", "window.ASSETS=" + json.dumps(assets) + ";")
        os.makedirs(os.path.dirname(out), exist_ok=True)
        head = '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
        title_end = page.index("</style>") + len("</style>")
        open(out, "w").write(head + page[:title_end] + "\n</head>\n<body>\n" + page[title_end:] + "\n</body>\n</html>\n")
        # The same page without a document skeleton, for publishing hosts that add their own.
        open(fragment, "w").write(page)
        print(f"wrote {os.path.relpath(out, ROOT)} ({os.path.getsize(out) / 1e6:.1f} MB, {len(assets['caps'])} captures)")


if __name__ == "__main__":
    main()
