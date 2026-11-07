# Opens index.html in headless Chrome, checks for script errors, takes screenshots.
import sys, pathlib
from playwright.sync_api import sync_playwright
root = pathlib.Path(__file__).resolve().parent.parent
url = (root / "index.html").as_uri()
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
    errs = []
    for name, w, scheme in [("desktop", 1280, "light"), ("phone", 400, "dark")]:
        pg = b.new_page(viewport={"width": w, "height": 900}, color_scheme=scheme)
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.on("console", lambda m: m.type == "error" and errs.append(m.text))
        pg.goto(url); pg.wait_for_timeout(1500)
        print(name, "sections:", pg.locator("section.phase").count(), "| overflow:", pg.evaluate("document.documentElement.scrollWidth > innerWidth"))
        pg.screenshot(path=f"/tmp/abb-bb_{name}.png", full_page=True)
        if len(sys.argv) > 1:
            pg.set_input_files("#fileIn", sys.argv[1]); pg.wait_for_timeout(1500)
            print(" upload:", pg.locator("#source").inner_text(), "| err:", pg.locator("#err").inner_text() if pg.locator("#err").is_visible() else "none")
            pg.screenshot(path=f"/tmp/abb-bb_{name}_upload.png", full_page=True)
    print("errors:", [e for e in errs if "fonts.g" not in e] or "none")
    b.close()
