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
            normalize_text(c.get("title", "")).upper(),
        ),
    )


def serialize_course(course: dict) -> dict:
    return {
        "course_code": course.get("course_code", ""),
        "title": course.get("title", ""),
        "description": course.get("description", ""),
        "enrollment_requirements": course.get("enrollment_requirements", ""),
        "grading_basis": format_grading_basis(course.get("grading_basis", "")),
        "credits": format_credits(course.get("credits", "")),
        "components": format_components(course.get("components", "")),
        "requirement_designation": course.get("requirement_designation", ""),
        "course_attributes": course.get("course_attributes", []),
        "career": course.get("career", ""),
        "terms": format_open_terms(course.get("open_terms", [])),
    }


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
                result[course_key(item)] = serialize_course(item)
        return result
    except Exception:
        return {}


def normalize_text(value: object) -> str:
    """Normalize known SIS text artifacts while preserving content."""
    text = str(value or "")
    text = text.replace("\u00a0", " ").replace("\xa0", " ")
    text = text.replace("\ufffd", "")
    text = text.replace("\u00c2 ", " ")
    return text.strip()


def format_credit_number(value: object) -> str:
    text = normalize_text(value)
    if not text:
        return ""

    try:
        number = float(text)
    except (TypeError, ValueError):
        return text

    if number.is_integer():
        return str(int(number))
    return str(number).rstrip("0").rstrip(".")


def format_credits(raw_credits: object) -> str:
    if isinstance(raw_credits, str):
        return normalize_text(raw_credits)

    if isinstance(raw_credits, dict):
        minimum = format_credit_number(raw_credits.get("units_minimum", ""))
        maximum = format_credit_number(raw_credits.get("units_maximum", ""))

        if minimum and maximum:
            return minimum if minimum == maximum else f"{minimum}-{maximum}"
        return minimum or maximum

    return format_credit_number(raw_credits)


def format_grading_basis(raw_grading_basis: object) -> str:
    if isinstance(raw_grading_basis, dict):
        return normalize_text(raw_grading_basis.get("descr", "") or raw_grading_basis.get("code", ""))

    return normalize_text(raw_grading_basis)


def format_components(raw_components: object) -> str:
    if isinstance(raw_components, str):
        return normalize_text(raw_components)

    if not isinstance(raw_components, list):
        return ""

    descriptions: list[str] = []
    seen: set[str] = set()
    for component in raw_components:
        if isinstance(component, dict):
            description = normalize_text(component.get("descr", ""))
            optional_flag = normalize_text(component.get("optional", "")).upper()
            if description and optional_flag == "N":
                description = f"{description} - Required"
            elif description and optional_flag == "Y":
                description = f"{description} - Optional"
        else:
            description = normalize_text(component)

        if description and description not in seen:
            seen.add(description)
            descriptions.append(description)

    return ", ".join(descriptions)


def format_open_terms(raw_open_terms: object) -> str:
    if isinstance(raw_open_terms, str):
        return normalize_text(raw_open_terms)

    if not isinstance(raw_open_terms, list):
        return ""

    term_codes: list[str] = []
    seen: set[str] = set()
    for term in raw_open_terms:
        if isinstance(term, dict):
            code = normalize_text(term.get("strm", ""))
        else:
            code = normalize_text(term)

        if code and code not in seen:
            seen.add(code)
            term_codes.append(code)

    return ", ".join(term_codes)


def get_nested_value(payload: dict, path: list[str], default: object = "") -> object:
    """Get a nested value from a dict using an exact key path."""
    current: object = payload
    for key in path:
        if not isinstance(current, dict) or key not in current:
            return default
        current = current[key]
    return current


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


def get_sections_for_course_with_career(course_id: str, term: str, x_acad_career: str = "") -> list[dict]:
    """Get sections for a course with specific term and career filter"""
    params = {
        "institution": "UVA01",
        "campus": "",
        "location": "",
        "course_id": course_id,
        "x_acad_career": x_acad_career,
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


def extract_term_data(offerings: object) -> object:
    """Extract raw open_terms payload from catalog offerings."""
    if not isinstance(offerings, list) or not offerings:
        return []

    first_offering = offerings[0] if isinstance(offerings[0], dict) else {}
    return first_offering.get("open_terms", []) if isinstance(first_offering, dict) else []


def extract_term_candidates(open_terms: object) -> list[str]:
    """Choose term codes from raw catalog open_terms payload for section lookup."""
    if not isinstance(open_terms, list):
        return []

    default_terms = [term for term in open_terms if isinstance(term, dict) and term.get("default_term") and term.get("strm")]
    if default_terms:
        return [str(term["strm"]) for term in default_terms]

    return [str(term["strm"]) for term in open_terms if isinstance(term, dict) and term.get("strm")]


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
    return normalize_text(get_nested_value(
        class_details_data,
        ["section_info", "catalog_descr", "crse_catalog_description"],
        "",
    ))


def extract_enrollment_requirements(class_details_data: dict) -> str:
    """Extract enrollment requirements from class details"""
    return normalize_text(get_nested_value(
        class_details_data,
        ["section_info", "enrollment_information", "enroll_requirements"],
        "",
    ))


def get_catalog_details(course_id: str, subject: str, catalog_nbr: str) -> dict:
    """Fetch raw course details from the catalog API endpoint."""
    params = {
        "institution": "UVA01",
        "course_id": course_id,
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
            open_terms = extract_term_data(course_details.get("offerings", []))
            return {
                "title": normalize_text(course_details.get("course_title", "")),
                "description": normalize_text(course_details.get("descrlong", "")),
                "grading_basis": format_grading_basis({
                    "code": course_details.get("grading_basis", ""),
                    "descr": normalize_text(course_details.get("grading_basis_descr", "")),
                }),
                "credits": format_credits({
                    "units_minimum": course_details.get("units_minimum", ""),
                    "units_maximum": course_details.get("units_maximum", ""),
                }),
                "components": format_components(course_details.get("components", [])),
                "requirement_designation": course_details.get("rqmnt_designtn", ""),
                "course_attributes": course_details.get("attributes", []),
                "open_terms": open_terms,
            }
    except Exception as e:
        import sys
        print(f"ERROR in get_catalog_details for {subject}/{catalog_nbr}: {e}", file=sys.stderr, flush=True)
    return {
        "title": "",
        "description": "",
        "grading_basis": "",
        "credits": "",
        "components": "",
        "requirement_designation": "",
        "course_attributes": [],
        "open_terms": [],
    }


def process_course(subject: str, course: dict) -> dict | None:
    """Process a single course and extract details"""
    try:
        course_id = course.get("crse_id")
        course_code = course.get("subject", subject)
        catalog_nbr = course.get("catalog_nbr", "")
        
        if not course_id:
            return None
        
        full_course_code = f"{course_code} {catalog_nbr}"

        catalog_details = get_catalog_details(course_id, subject, catalog_nbr)
        title = normalize_text(catalog_details.get("title") or course.get("descr", ""))
        description = normalize_text(catalog_details.get("description") or course.get("descr", ""))
        grading_basis = catalog_details.get("grading_basis", "")
        credits = catalog_details.get("credits", "")
        components = catalog_details.get("components", "")
        requirement_designation = catalog_details.get("requirement_designation", "")
        course_attributes = catalog_details.get("course_attributes", [])
        open_terms = catalog_details.get("open_terms", [])
        acad_career = normalize_text(course.get("acad_career", ""))

        selected_term = None
        selected_class_nbr = None
        enrollment_reqs = ""
        sections: list[dict] = []
        career_filters = []
        if acad_career:
            career_filters.append(acad_career)
        career_filters.append("")

        for term_code in extract_term_candidates(open_terms):
            found = False
            for career in career_filters:
                current_sections = get_sections_for_course_with_career(course_id, term_code, career)
                if current_sections:
                    sections = current_sections
                    selected_term = term_code
                    found = True
                    break
            if found:
                break
        
        if selected_term and sections:
            first_section = sections[0]
            selected_class_nbr = first_section.get("class_nbr")
            
            if selected_class_nbr:
                class_details_data = get_class_details(str(selected_class_nbr), selected_term)
                enrollment_reqs = extract_enrollment_requirements(class_details_data) if class_details_data else ""
                if class_details_data and not description:
                    description = extract_description(class_details_data)
        
        result = {
            "course_code": full_course_code,
            "title": title,
            "description": description,
            "enrollment_requirements": enrollment_reqs,
            "grading_basis": grading_basis,
            "credits": credits,
            "components": components,
            "requirement_designation": requirement_designation,
            "course_attributes": course_attributes,
            "career": acad_career,
            "open_terms": open_terms,
        }
        return serialize_course(result)

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
        # Courses are already serialized in process_course, don't serialize again
        with open(filename, 'w', encoding='utf-8') as f:
            json.dump(courses, f, indent=2, ensure_ascii=False)

        if not quiet:
            print(f"Output: {filename}")
    except Exception as e:
        print(f"Error saving to JSON: {e}")


if __name__ == "__main__":
    main()