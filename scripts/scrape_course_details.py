import json
import requests
from pathlib import Path
from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright
import re

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


def course_key(course: dict) -> str:
    code = str(course.get("course_code", "")).upper()
    return " ".join(code.split())


def sorted_courses(courses_by_key: dict[str, dict]) -> list[dict]:
    return sorted(
        courses_by_key.values(),
        key=lambda c: (
            " ".join(str(c.get("course_code", "")).split()).upper(),
            str(c.get("crse_id", "")),
        ),
    )


def load_existing_courses(filename: Path) -> dict[str, dict]:
    if not filename.exists():
        return {}

    try:
        with open(filename, 'r', encoding='utf-8') as f:
            data = json.load(f)
        if not isinstance(data, list):
            return {}

        result: dict[str, dict] = {}
        for item in data:
            if isinstance(item, dict) and item.get("course_code"):
                result[course_key(item)] = item
        return result
    except Exception:
        return {}


def normalize_text(value: object) -> str:
    text = str(value or "")
    text = text.replace("\u00a0", " ").replace("\xa0", " ")
    text = text.replace("\ufffd", "")
    text = text.replace("\u00c2 ", " ")
    return text.strip()


def format_credit_value(units_minimum, units_maximum) -> str:
    minimum = str(units_minimum or "").strip()
    maximum = str(units_maximum or "").strip()

    if minimum and maximum:
        return minimum if minimum == maximum else f"{minimum}-{maximum}"
    return minimum or maximum


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
        pass
    return ""


def extract_subjects(text: str) -> list[tuple[str, str]]:
    """Extract all subject codes and names from catalog page"""
    subjects: list[tuple[str, str]] = []
    seen: set[tuple[str, str]] = set()

    for code, name in SUBJECT_PATTERN.findall(text):
        item = (code.strip(), name.strip())
        if item not in seen:
            seen.add(item)
            subjects.append(item)

    return subjects


def get_catalog_text() -> str:
    """Get rendered catalog page text using Playwright"""
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            page.goto(CATALOG_URL, wait_until="domcontentloaded", timeout=60000)
            page.wait_for_selector("#main_iframe", timeout=60000)

            iframe_element = page.locator("#main_iframe").element_handle()
            if iframe_element is None:
                raise RuntimeError("catalog iframe was not found")

            frame = iframe_element.content_frame()
            if frame is None:
                raise RuntimeError("catalog iframe did not load")

            try:
                frame.wait_for_load_state("networkidle", timeout=60000)
            except PlaywrightTimeoutError:
                pass

            return frame.locator("body").inner_text(timeout=60000)
        finally:
            browser.close()


def get_courses_by_subject(subject: str) -> list[dict]:
    """Get all courses for a subject"""
    params = {
        "institution": "UVA01",
        "subject": subject,
    }

    try:
        response = requests.get(SUBJECT_COURSES_URL, params=params, headers=HEADERS, timeout=10)
        response.raise_for_status()
        data = response.json()
        if "courses" in data:
            return data["courses"]
        return []
    except Exception:
        return []


def get_sections_for_course(course_id: str, term: str) -> list[dict]:
    """Get sections for a course with specific term"""
    params = {
        "institution": "UVA01",
        "campus": "",
        "location": "",
        "course_id": course_id,
        "x_acad_career": "",
        "term": term,
        "crse_offer_nbr": "1",
    }

    try:
        response = requests.get(BROWSE_SECTIONS_URL, params=params, headers=HEADERS, timeout=10)
        response.raise_for_status()
        data = response.json()
        
        if "sections" in data:
            return data["sections"]
        return []
    except Exception:
        return []


def get_class_details(class_nbr: str, term: str) -> dict:
    """Get class details including description and enrollment requirements"""
    params = {
        "institution": "UVA01",
        "term": term,
        "class_nbr": class_nbr,
    }

    try:
        response = requests.get(CLASS_DETAILS_URL, params=params, headers=HEADERS, timeout=10)
        response.raise_for_status()
        return response.json()
    except Exception:
        return {}


def extract_description(class_details_data: dict) -> str:
    """Extract course description from class details"""
    try:
        if "section_info" in class_details_data:
            section_info = class_details_data["section_info"]
            if "catalog_descr" in section_info:
                catalog_descr = section_info["catalog_descr"]
                if "crse_catalog_description" in catalog_descr:
                    return normalize_text(catalog_descr["crse_catalog_description"])
    except Exception:
        pass
    return ""


def extract_enrollment_requirements(class_details_data: dict) -> str:
    """Extract enrollment requirements from class details"""
    try:
        if "section_info" in class_details_data:
            section_info = class_details_data["section_info"]
            if "enrollment_information" in section_info:
                enrollment_info = section_info["enrollment_information"]
                if "enroll_requirements" in enrollment_info:
                    return normalize_text(enrollment_info["enroll_requirements"])
    except Exception:
        pass
    return ""


def extract_prerequisites_from_description(description: str) -> str:
    """Fallback: pull prerequisite text from the catalog description itself."""
    if not description:
        return ""

    normalized = " ".join(description.split())
    match = re.search(
        r"((?:Pre-?requisites?|Prereq(?:uisite)?s?|Co-?requisites?)\s*:\s*.*?\.)(?:\s|$)",
        normalized,
        re.IGNORECASE,
    )
    if match:
        return match.group(1).strip()

    return ""


def get_catalog_details(crse_id: str, subject: str, catalog_nbr: str) -> dict:
    """Fetch title, description, and credits from catalog details endpoint"""
    params = {
        "institution": "UVA01",
        "course_id": crse_id,
        "use_catalog_print": "Y",
        "effdt": "",
        "crse_offer_nbr": "1",
        "subject": subject,
        "catalog_nbr": catalog_nbr,
    }

    try:
        response = requests.get(CATALOG_COURSE_DETAILS_URL, params=params, headers=HEADERS, timeout=10)
        response.raise_for_status()
        data = response.json()

        if "course_details" in data:
            course_details = data["course_details"]
            return {
                "title": normalize_text(course_details.get("course_title", "")),
                "description": normalize_text(course_details.get("descrlong", "")),
                "credits": format_credit_value(
                    course_details.get("units_minimum"),
                    course_details.get("units_maximum"),
                ),
            }
    except Exception:
        pass
    return {"title": "", "description": "", "credits": ""}


def process_course(subject: str, course: dict) -> dict | None:
    """Process a single course and extract details"""
    try:
        crse_id = course.get("crse_id")
        course_code = course.get("subject", subject)
        catalog_nbr = course.get("catalog_nbr", "")
        
        if not crse_id:
            return None
        
        full_course_code = f"{course_code} {catalog_nbr}"

        # Get title/description/credits from catalog endpoint.
        catalog_details = get_catalog_details(crse_id, subject, catalog_nbr)
        title = normalize_text(catalog_details.get("title") or course.get("descr", ""))
        description = normalize_text(catalog_details.get("description") or course.get("descr", ""))
        credits = catalog_details.get("credits", "")
        description_prereqs = extract_prerequisites_from_description(description)

        # Try to find sections and enrollment requirements
        best_term = None
        class_nbr = None
        enrollment_reqs = ""
        sections = get_sections_for_course(crse_id, "1268")
        
        if sections and len(sections) > 0:
            best_term = "1268"
        else:
            sections = get_sections_for_course(crse_id, "1262")
            if sections and len(sections) > 0:
                best_term = "1262"
        
        # If we have sections, get enrollment requirements
        if best_term and sections:
            first_section = sections[0]
            class_nbr = first_section.get("class_nbr")
            
            if class_nbr:
                class_details_data = get_class_details(str(class_nbr), best_term)
                enrollment_reqs = extract_enrollment_requirements(class_details_data) if class_details_data else ""
                if class_details_data and not credits:
                    credits = extract_credits_from_class_details(class_details_data)

        if description_prereqs:
            enrollment_reqs = description_prereqs
        elif not enrollment_reqs:
            enrollment_reqs = extract_prerequisites_from_description(description)
        
        result = {
            "course_code": full_course_code,
            "title": title,
            "credits": credits,
            "crse_id": crse_id,
            "class_nbr": class_nbr,
            "term": best_term,
            "description": description,
            "enrollment_requirements": enrollment_reqs,
        }
        return result

    except Exception:
        return None


def subject_from_course_code(course_code: str) -> str:
    return " ".join(str(course_code or "").split()).split(" ")[0].upper()


def keep_subjects_before_start(
    existing_courses: dict[str, dict],
    subjects: list[tuple[str, str]],
    start_index: int,
) -> dict[str, dict]:
    subject_order = {code.upper(): i for i, (code, _name) in enumerate(subjects)}

    kept: dict[str, dict] = {}
    for key, course in existing_courses.items():
        subject_code = subject_from_course_code(course.get("course_code", ""))
        idx = subject_order.get(subject_code)

        # Keep unknown subjects and everything before start subject.
        if idx is None or idx < start_index:
            kept[key] = course

    return kept


def find_resume_index(
    subjects: list[tuple[str, str]],
    existing_courses: dict[str, dict],
) -> int | None:
    """Return the subject index to resume from, or None to start fresh."""
    if not existing_courses:
        return None

    present: set[str] = {
        subject_from_course_code(c.get("course_code", ""))
        for c in existing_courses.values()
    }
    present.discard("")

    last_index = -1
    for i, (code, _) in enumerate(subjects):
        if code.upper() in present:
            last_index = i

    return last_index + 1 if last_index >= 0 else None


def main() -> None:
    """Main function to orchestrate the scraping"""
    try:
        catalog_text = get_catalog_text()
        subjects = extract_subjects(catalog_text)
    except Exception as e:
        print(f"Error getting subjects: {e}")
        return

    output_path = OUTPUT_DIR / "uva_course_details.json"
    existing = load_existing_courses(output_path)
    resume_index = find_resume_index(subjects, existing)

    if resume_index is None:
        subjects_to_run = subjects
        courses_by_key: dict[str, dict] = {}
    elif resume_index >= len(subjects):
        print("All subjects already scraped, nothing to do")
        return
    else:
        subjects_to_run = subjects[resume_index:]
        courses_by_key = keep_subjects_before_start(existing, subjects, resume_index)
        print(f"Resuming from {subjects[resume_index][0]} (subject {resume_index + 1}/{len(subjects)})")

    attempted = 0
    saved_this_run = 0

    for i, (subject_code, subject_name) in enumerate(subjects_to_run, 1):
        print(f"[{i}/{len(subjects_to_run)}] Processing subject: {subject_code} ({subject_name})")

        courses = get_courses_by_subject(subject_code)
        for course in courses:
            attempted += 1
            course_data = process_course(subject_code, course)
            if course_data:
                saved_this_run += 1
                courses_by_key[course_key(course_data)] = course_data

        # Persist partial results after each subject completes.
        save_to_json(sorted_courses(courses_by_key), output_path, quiet=True)

    save_to_json(sorted_courses(courses_by_key), output_path)

    failed = attempted - saved_this_run
    print(
        f"Done: subjects={len(subjects_to_run)} | attempted={attempted} | "
        f"saved_this_run={saved_this_run} | failed={failed} | total_in_json={len(courses_by_key)}"
    )

def save_to_json(courses: list[dict], filename: Path, quiet: bool = False) -> None:
    """Save courses to JSON file"""
    if not courses:
        if not quiet:
            print("No courses to save")
        return
    
    try:
        with open(filename, 'w', encoding='utf-8') as f:
            json.dump(courses, f, indent=2, ensure_ascii=False)

        if not quiet:
            print(f"Output: {filename}")
    except Exception as e:
        print(f"Error saving to JSON: {e}")


if __name__ == "__main__":
    main()