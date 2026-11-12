# Drives the Live Monitor in headless Chrome at fast speed and screenshots key moments.
import pathlib
from playwright.sync_api import sync_playwright
root = pathlib.Path(__file__).resolve().parent.parent
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
    pg = b.new_page(viewport={"width": 1280, "height": 900}); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto((root / "index.html").as_uri() + "#monitor"); pg.wait_for_timeout(600)
    pg.screenshot(path="/tmp/abb-mon_empty.png")
    pg.set_input_files("#mFile", str(root / "data" / "live_feed_invoices.csv")); pg.wait_for_timeout(400)
    pg.fill("#mUsl", "48"); pg.select_option("#mSpeed", "150"); pg.click("#mStart")
    pg.wait_for_selector("#inc1", timeout=20000); pg.wait_for_timeout(300)
    pg.screenshot(path="/tmp/abb-mon_inc1.png", full_page=True)
    pg.wait_for_selector("#inc2", timeout=40000); pg.wait_for_timeout(300)
    pg.screenshot(path="/tmp/abb-mon_inc2.png", full_page=True)
    pg.wait_for_selector(".status.done", timeout=60000)
    pg.screenshot(path="/tmp/abb-mon_done.png", full_page=True)
    print("status:", pg.inner_text("#mStatus")); print("errors:", errs)
    pg.set_viewport_size({"width": 400, "height": 900}); pg.wait_for_timeout(300)
    print("phone overflow:", pg.evaluate("document.documentElement.scrollWidth > innerWidth"))
    b.close()
