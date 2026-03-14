import asyncio
import json
import re
from pathlib import Path
import aiohttp
from playwright.async_api import TimeoutError as PlaywrightTimeoutError
from playwright.async_api import async_playwright

OUTPUT_DIR = Path(__file__).parent.parent / "data"
OUTPUT_DIR.mkdir(exist_ok=True)

# URLs
CATALOG_URL = "https://sisuva.admin.virginia.edu/psp/ihprd/UVSS/SA/s/WEBLIB_HCX_CM.H_COURSE_CATALOG.FieldFormula.IScript_Main?"
SUBJECT_COURSES_URL = "https://sisuva.admin.virginia.edu/psc/ihprd/UVSS/SA/s/WEBLIB_HCX_CM.H_COURSE_CATALOG.FieldFormula.IScript_SubjectCourses"
BROWSE_SECTIONS_URL = "https://sisuva.admin.virginia.edu/psc/ihprd/UVSS/SA/s/WEBLIB_HCX_CM.H_BROWSE_CLASSES.FieldFormula.IScript_BrowseSections"
CLASS_DETAILS_URL = "https://sisuva.admin.virginia.edu/psc/ihprd/UVSS/SA/s/WEBLIB_HCX_CM.H_CLASS_SEARCH.FieldFormula.IScript_ClassDetails"
CATALOG_COURSE_DETAILS_URL = "https://sisuva.admin.virginia.edu/psc/ihprd/UVSS/SA/s/WEBLIB_HCX_CM.H_COURSE_CATALOG.FieldFormula.IScript_CatalogCourseDetails"

SUBJECT_PATTERN = re.compile(r"\b([A-Z]{2,6})\s*-\s*(.*?)\s+View Courses\b")

HEADERS = {
    "User-Agent": "Mozilla/5.0 (educational research)",
}

# Max simultaneous HTTP requests — raise for more speed, lower to be gentler on the server
CONCURRENCY = 100


# ---------------------------------------------------------------------------
# Playwright helpers (async)
# ---------------------------------------------------------------------------

def extract_subjects(text: str) -> list[tuple[str, str]]:
    subjects: list[tuple[str, str]] = []
    seen: set[tuple[str, str]] = set()

    for code, name in SUBJECT_PATTERN.findall(text):
        item = (code.strip(), name.strip())
        if item not in seen:
            seen.add(item)
            subjects.append(item)

    return subjects


async def get_catalog_text() -> str:
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True)
        page = await browser.new_page()
        try:
            await page.goto(CATALOG_URL, wait_until="domcontentloaded", timeout=60000)
            await page.wait_for_selector("#main_iframe", timeout=60000)

            iframe_element = await page.locator("#main_iframe").element_handle()
            if iframe_element is None:
                raise RuntimeError("catalog iframe was not found")

            frame = await iframe_element.content_frame()
            if frame is None:
                raise RuntimeError("catalog iframe did not load")

            try:
                await frame.wait_for_load_state("networkidle", timeout=60000)
            except PlaywrightTimeoutError:
                pass

            return await frame.locator("body").inner_text(timeout=60000)
        finally:
            await browser.close()


# ---------------------------------------------------------------------------
# Async HTTP helpers
# ---------------------------------------------------------------------------

async def _get_json(session: aiohttp.ClientSession, sem: asyncio.Semaphore, url: str, params: dict) -> dict | list:
    async with sem:
        try:
            async with session.get(url, params=params, timeout=aiohttp.ClientTimeout(total=15)) as resp:
                resp.raise_for_status()
                return await resp.json(content_type=None)
        except Exception:
            return {}


async def get_courses_by_subject_async(session: aiohttp.ClientSession, sem: asyncio.Semaphore, subject: str) -> list[dict]:
    data = await _get_json(session, sem, SUBJECT_COURSES_URL, {"institution": "UVA01", "subject": subject})
    if isinstance(data, dict):
        return data.get("courses", [])
    return []


async def get_sections_async(session: aiohttp.ClientSession, sem: asyncio.Semaphore, course_id: str, term: str) -> list[dict]:
    params = {
        "institution": "UVA01",
        "campus": "",
        "location": "",
        "course_id": course_id,
        "x_acad_career": "",
        "term": term,
        "crse_offer_nbr": "1",
    }
    data = await _get_json(session, sem, BROWSE_SECTIONS_URL, params)
    if isinstance(data, dict):
        return data.get("sections", [])
    return []


async def get_class_details_async(session: aiohttp.ClientSession, sem: asyncio.Semaphore, class_nbr: str, term: str) -> dict:
    params = {"institution": "UVA01", "term": term, "class_nbr": class_nbr}
    data = await _get_json(session, sem, CLASS_DETAILS_URL, params)
    return data if isinstance(data, dict) else {}


# ---------------------------------------------------------------------------
# Data extraction helpers (pure)
# ---------------------------------------------------------------------------

def format_credit_value(units_minimum, units_maximum) -> str:
    if units_minimum in (None, "") and units_maximum in (None, ""):
        return ""

    minimum = str(units_minimum).strip()
    maximum = str(units_maximum).strip()

    if minimum and maximum:
        return minimum if minimum == maximum else f"{minimum}-{maximum}"
    return minimum or maximum


def format_term_label(term: str | None) -> str | None:
    if term is None:
        return None

    cleaned = str(term).strip()
    match = re.fullmatch(r"1(\d{2})(\d)", cleaned)
    if not match:
        return cleaned or None

    year = 2000 + int(match.group(1))
    season_code = match.group(2)
    season = {
        "0": "Winter",
        "2": "Spring",
        "4": "Summer",
        "6": "Summer",
        "8": "Fall",
    }.get(season_code)

    return f"{season} {year}" if season else cleaned


def extract_credits_from_class_details(class_details_data: dict) -> str:
    try:
        units = (
            class_details_data
            .get("section_info", {})
            .get("class_details", {})
            .get("units", "")
        )
        match = re.search(r"\d+(?:\.\d+)?(?:\s*-\s*\d+(?:\.\d+)?)?", str(units))
        return match.group(0).replace(" ", "") if match else ""
    except Exception:
        return ""

def extract_enrollment_requirements(class_details_data: dict) -> str:
    try:
        return (
            class_details_data
            .get("section_info", {})
            .get("enrollment_information", {})
            .get("enroll_requirements", "")
        )
    except Exception:
        return ""


async def get_catalog_details_async(
    session: aiohttp.ClientSession,
    sem: asyncio.Semaphore,
    crse_id: str,
    subject: str,
    catalog_nbr: str,
) -> dict[str, str]:
    params = {
        "institution": "UVA01",
        "course_id": crse_id,
        "use_catalog_print": "Y",
        "effdt": "",
        "crse_offer_nbr": "1",
        "subject": subject,
        "catalog_nbr": catalog_nbr,
    }
    data = await _get_json(session, sem, CATALOG_COURSE_DETAILS_URL, params)
    if isinstance(data, dict):
        course_details = data.get("course_details", {})
        return {
            "description": course_details.get("descrlong", ""),
            "credits": format_credit_value(
                course_details.get("units_minimum"),
                course_details.get("units_maximum"),
            ),
        }
    return {"description": "", "credits": ""}


# ---------------------------------------------------------------------------
# Core async processing
# ---------------------------------------------------------------------------

async def process_course_async(session: aiohttp.ClientSession, sem: asyncio.Semaphore, subject: str, course: dict) -> dict | None:
    crse_id = course.get("crse_id")
    course_code = course.get("subject", subject)
    catalog_nbr = course.get("catalog_nbr", "")

    if not crse_id:
        return None

    full_course_code = f"{course_code} {catalog_nbr}"

    # fetch catalog details + both term sections in parallel
    catalog_details, sections_1268, sections_1262 = await asyncio.gather(
        get_catalog_details_async(session, sem, crse_id, subject, catalog_nbr),
        get_sections_async(session, sem, crse_id, "1268"),
        get_sections_async(session, sem, crse_id, "1262"),
    )

    description = catalog_details.get("description", "")
    credits = catalog_details.get("credits", "")

    if sections_1268:
        best_term, sections = "1268", sections_1268
    elif sections_1262:
        best_term, sections = "1262", sections_1262
    else:
        best_term, sections = None, []

    enrollment_reqs = ""
    class_nbr = None
    if best_term and sections:
        class_nbr = sections[0].get("class_nbr")
        if class_nbr:
            class_details_data = await get_class_details_async(session, sem, str(class_nbr), best_term)
            enrollment_reqs = extract_enrollment_requirements(class_details_data)
            if not credits:
                credits = extract_credits_from_class_details(class_details_data)

    print(f"  ✓ {full_course_code}")
    return {
        "course_code": full_course_code,
        "credits": credits,
        "crse_id": crse_id,
        "class_nbr": class_nbr,
        "term": format_term_label(best_term),
        "description": description,
        "enrollment_requirements": enrollment_reqs,
    }


async def process_subject_async(session: aiohttp.ClientSession, sem: asyncio.Semaphore, subject_code: str, subject_name: str, idx: int, total: int) -> list[dict]:
    print(f"[{idx}/{total}] {subject_code} ({subject_name})...")
    courses = await get_courses_by_subject_async(session, sem, subject_code)

    results = await asyncio.gather(
        *[process_course_async(session, sem, subject_code, c) for c in courses],
        return_exceptions=True,
    )

    return [r for r in results if isinstance(r, dict)]


async def main_async() -> None:
    print("=" * 80)
    print("UVA Course Details Scraper (async)")
    print("=" * 80)

    # Step 1: subjects via Playwright (async, one-time)
    print("\n[Step 1] Fetching subjects via Playwright...")
    catalog_text = await get_catalog_text()
    subjects = extract_subjects(catalog_text)
    print(f"  Found {len(subjects)} subjects\n")

    # Step 2: all subjects + courses concurrently
    print(f"[Step 2] Scraping all courses (concurrency={CONCURRENCY})...")
    sem = asyncio.Semaphore(CONCURRENCY)
    connector = aiohttp.TCPConnector(limit=CONCURRENCY)

    async with aiohttp.ClientSession(headers=HEADERS, connector=connector) as session:
        subject_results = await asyncio.gather(
            *[
                process_subject_async(session, sem, code, name, i, len(subjects))
                for i, (code, name) in enumerate(subjects, 1)
            ],
            return_exceptions=True,
        )

    all_courses: list[dict] = []
    for result in subject_results:
        if isinstance(result, list):
            all_courses.extend(result)

    # Step 3: save
    print("\n" + "=" * 80)
    print("[Step 3] Saving results...")
    save_to_json(all_courses, OUTPUT_DIR / "uva_course_details.json")

    print("\n" + "=" * 80)
    print(f"✅ Successfully processed {len(all_courses)} courses")
    print("=" * 80)


# ---------------------------------------------------------------------------
# Output helpers
# ---------------------------------------------------------------------------

def save_to_json(courses: list[dict], filename: Path) -> None:
    if not courses:
        print("No courses to save")
        return
    try:
        with open(filename, "w", encoding="utf-8") as f:
            json.dump(courses, f, indent=2, ensure_ascii=False)
        print(f"\u2705 Saved {len(courses)} courses to {filename}")
    except Exception as e:
        print(f"\u2717 Error saving to JSON: {e}")


if __name__ == "__main__":
    asyncio.run(main_async())
