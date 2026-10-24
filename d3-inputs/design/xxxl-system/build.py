from pathlib import Path
import base64
import sys

ROOT = Path(__file__).resolve().parents[2]
FOLDER = Path(__file__).resolve().parent
name = sys.argv[1] if len(sys.argv) > 1 else "prototype"
html = (FOLDER / f"{name}.template.html").read_text()
GEIST = "apps/mobile/node_modules/@expo-google-fonts/geist"
for key, file, mime in [
    ("__GEIST_REGULAR__", f"{GEIST}/400Regular/Geist_400Regular.ttf", "font/ttf"),
    ("__GEIST_MEDIUM__", f"{GEIST}/500Medium/Geist_500Medium.ttf", "font/ttf"),
    ("__GEIST_SEMIBOLD__", f"{GEIST}/600SemiBold/Geist_600SemiBold.ttf", "font/ttf"),
    ("__LOGO__", "apps/mobile/assets/brand/lockup-color.png", "image/png"),
]:
    if key in html:
        html = html.replace(key, "data:" + mime + ";base64," + base64.b64encode((ROOT / file).read_bytes()).decode())
(FOLDER / f"{name}.html").write_text(html)
print(f"Built {name}.html")
