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
    except Exception as e:
        print(f"      ✗ Error extracting credits: {e}")
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
    except Exception as e:
        print(f"  ✗ Error fetching courses for {subject}: {e}")
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
    except Exception as e:
        print(f"    ✗ Error fetching sections for course {course_id} (term {term}): {e}")
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
    except Exception as e:
        print(f"    ✗ Error fetching class details for {class_nbr}: {e}")
        return {}


def extract_description(class_details_data: dict) -> str:
    """Extract course description from class details"""
    try:
        if "section_info" in class_details_data:
            section_info = class_details_data["section_info"]
            if "catalog_descr" in section_info:
                catalog_descr = section_info["catalog_descr"]
                if "crse_catalog_description" in catalog_descr:
                    return catalog_descr["crse_catalog_description"]
    except Exception as e:
        print(f"      ✗ Error extracting description: {e}")
    return ""


def extract_enrollment_requirements(class_details_data: dict) -> str:
    """Extract enrollment requirements from class details"""
    try:
        if "section_info" in class_details_data:
            section_info = class_details_data["section_info"]
            if "enrollment_information" in section_info:
                enrollment_info = section_info["enrollment_information"]
                if "enroll_requirements" in enrollment_info:
                    return enrollment_info["enroll_requirements"]
    except Exception as e:
        print(f"      ✗ Error extracting enrollment requirements: {e}")
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
                "title": course_details.get("course_title", ""),
                "description": course_details.get("descrlong", ""),
                "credits": format_credit_value(
                    course_details.get("units_minimum"),
                    course_details.get("units_maximum"),
                ),
            }
    except Exception as e:
        print(f"      ✗ Error fetching catalog details: {e}")
    return {"title": "", "description": "", "credits": ""}


def process_course(subject: str, course: dict) -> dict | None:
    """Process a single course and extract details"""
    try:
        crse_id = course.get("crse_id")
        course_code = course.get("subject", subject)
        catalog_nbr = course.get("catalog_nbr", "")
        
        if not crse_id:
            print(f"    ✗ No crse_id found for {course_code} {catalog_nbr}")
            return None
        
        full_course_code = f"{course_code} {catalog_nbr}"
        print(f"    Processing {full_course_code} (id: {crse_id})...")

        # Get title/description/credits from catalog endpoint.
        catalog_details = get_catalog_details(crse_id, subject, catalog_nbr)
        title = catalog_details.get("title") or course.get("descr", "")
        description = catalog_details.get("description") or course.get("descr", "")
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

        print(
            "      ✓ Saved JSON:",
            {
                "course_code": result["course_code"],
                "title": result["title"],
                "credits": result["credits"],
                "term": result["term"],
                "has_description": bool(result["description"]),
                "has_enrollment_requirements": bool(result["enrollment_requirements"]),
            },
        )
        return result

    except Exception as e:
        print(f"    ✗ Error processing course: {e}")
        return None


def main() -> None:
    """Main function to orchestrate the scraping"""
    print("=" * 80)
    print("UVA Course Details Scraper")
    print("=" * 80)
    
    # Step 1: Get all subjects
    print("\n[Step 1] Fetching all subjects...")
    try:
        catalog_text = get_catalog_text()
        subjects = extract_subjects(catalog_text)
        print(f"Found {len(subjects)} subjects")
    except Exception as e:
        print(f"✗ Error getting subjects: {e}")
        return
    
    # Step 2: Process each subject
    all_courses_data = []
    
    for i, (subject_code, subject_name) in enumerate(subjects, 1):
        print(f"\n[{i}/{len(subjects)}] Processing subject: {subject_code} ({subject_name})")
        
        # Get courses for this subject
        courses = get_courses_by_subject(subject_code)
        print(f"  Found {len(courses)} courses")
        
        # Process each course
        for course in courses:
            course_data = process_course(subject_code, course)
            if course_data:
                all_courses_data.append(course_data)
    
    # Step 3: Save to CSV
    print("\n" + "=" * 80)
    print(f"[Step 2] Saving results...")
    save_to_json(all_courses_data, OUTPUT_DIR / "uva_course_details.json")
    
    print("\n" + "=" * 80)
    print(f"✅ Successfully processed {len(all_courses_data)} courses")
    print("=" * 80)

def save_to_json(courses: list[dict], filename: Path) -> None:
    """Save courses to JSON file"""
    if not courses:
        print("No courses to save")
        return
    
    try:
        with open(filename, 'w', encoding='utf-8') as f:
            json.dump(courses, f, indent=2, ensure_ascii=False)
        
        print(f"✅ Saved {len(courses)} courses to {filename}")
    except Exception as e:
        print(f"✗ Error saving to JSON: {e}")


if __name__ == "__main__":
    main()