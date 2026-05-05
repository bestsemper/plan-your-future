import base64
import csv
import json
import re
from datetime import datetime, UTC
from pathlib import Path

from playwright.sync_api import sync_playwright

OUTPUT_DIR = Path(__file__).parent.parent / "data"
OUTPUT_DIR.mkdir(exist_ok=True)
AUDIT_REQUIREMENTS_PATH = OUTPUT_DIR / "audit_requirements.csv"

CLASS_SEARCH_MAIN_URL = (
    "https://sisuva.admin.virginia.edu/psc/ihprd/UVSS/SA/s/"
    "WEBLIB_HCX_CM.H_CLASS_SEARCH.FieldFormula.IScript_Main"
)
BOOTSTRAP_PATTERN = re.compile(r"atob\(`([^`]+)`\)")


def normalize_text(value: object) -> str:
    text = str(value or "")
    text = text.replace("\u00a0", " ").replace("\xa0", " ")
    text = text.replace("\ufffd", "")
    return " ".join(text.split()).strip()


def fetch_class_search_bootstrap() -> dict:
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            page.goto(CLASS_SEARCH_MAIN_URL, wait_until="domcontentloaded", timeout=60000)
            html = page.content()
        finally:
            browser.close()

    match = BOOTSTRAP_PATTERN.search(html)
    if not match:
        raise RuntimeError("Could not locate SIS bootstrap payload")

    encoded_payload = match.group(1)
    return json.loads(base64.b64decode(encoded_payload).decode("utf-8"))


def sorted_unique_options(items: list[dict], code_key: str) -> list[dict]:
    by_code: dict[str, dict] = {}
    for item in items:
        code = normalize_text(item.get(code_key))
        name = normalize_text(item.get("descr"))
        institution = normalize_text(item.get("inst_info"))

        if not code or not name:
            continue

        by_code[code] = {
            "code": code,
            "name": name,
            "institution": institution,
        }

    return sorted(by_code.values(), key=lambda entry: (entry["name"].lower(), entry["code"]))


def should_include_major(row: dict[str, str]) -> bool:
    program_code = normalize_text(row.get("Program Code"))
    program_name = normalize_text(row.get("Program Name"))
    is_shared_requirement = normalize_text(row.get("Is Uni Req/Shared Req")).lower() == "true"

    upper_code = program_code.upper()
    upper_name = program_name.upper()

    if not program_code or not program_name:
        return False

    if is_shared_requirement:
        return False

    excluded_fragments = (
        "2MJ",
        "2MN",
        "MINOR",
        "GRADUATION REQUIREMENTS",
        "TOTAL CREDIT",
        "REQUIREMENT",
        "TEST",
        "DRAFT",
    )
    if any(fragment in upper_code for fragment in excluded_fragments):
        return False
    if any(fragment in upper_name for fragment in excluded_fragments):
        return False

    excluded_names = {
        "DISCIPLINES PLUS - BS (ASUS)",
        "NEW COLLEGE CURRICULUM FOR BS (ASUB)",
        "NEW COLLEGE CURRICULUM NON-BS - (ASUG)",
        "NEW COLLEGE CURRICULUM – DISCIPLINES PLUS NON-BS (ASUD)",
        "COLLEGE - TRANSFER GEN ED REQUIREMENTS",
    }
    if upper_name in excluded_names:
        return False

    return True


def build_major_options(school_lookup_by_code: dict[str, dict], school_lookup_by_name: dict[str, dict]) -> list[dict]:
    if not AUDIT_REQUIREMENTS_PATH.exists():
        raise FileNotFoundError(f"Missing audit requirements CSV: {AUDIT_REQUIREMENTS_PATH}")

    programs_by_code: dict[str, dict] = {}
    with open(AUDIT_REQUIREMENTS_PATH, "r", encoding="utf-8", newline="") as file:
        reader = csv.DictReader(file)
        for row in reader:
            program_code = normalize_text(row.get("Program Code"))
            program_name = normalize_text(row.get("Program Name"))
            if not should_include_major(row):
                continue

            programs_by_code[program_code] = {
                "code": program_code,
                "name": program_name,
            }

    names_in_data = {entry["name"] for entry in programs_by_code.values()}
    major_options: list[dict] = []
    for entry in programs_by_code.values():
        display_name = entry["name"]
        if display_name.startswith("Interdisciplinary - "):
            simplified_name = display_name.replace("Interdisciplinary - ", "", 1)
            if simplified_name in names_in_data:
                continue
            display_name = simplified_name

        # Find school association for this major
        school_info = find_school_for_major(entry["code"], entry["name"], school_lookup_by_code, school_lookup_by_name)

        major_options.append(
            {
                "code": entry["code"],
                "name": entry["name"],
                "displayName": display_name,
                "schoolCode": school_info.get("schoolCode"),
                "schoolName": school_info.get("schoolName"),
            }
        )

    return sorted(major_options, key=lambda entry: (entry["displayName"].lower(), entry["code"]))


def build_subject_mappings(search_options: dict) -> tuple[list[dict], dict[str, dict], dict[str, dict]]:
    """
    Build subject mappings and return mappings, code lookup, and name lookup.
    Returns: (mappings, school_lookup_by_code, school_lookup_by_name)
    """
    schools_by_code = {
        option["code"]: option["name"]
        for option in sorted_unique_options(search_options.get("acad_groups", []), "acad_group")
    }
    majors_by_code = {
        option["code"]: option["name"]
        for option in sorted_unique_options(search_options.get("acad_orgs", []), "acad_org")
    }

    # Build lookups: both by code and by department name
    school_lookup_by_code: dict[str, dict] = {}
    school_lookup_by_name: dict[str, dict] = {}
    
    mappings: list[dict] = []
    for subject in search_options.get("subjects", []):
        subject_code = normalize_text(subject.get("subject"))
        subject_label = normalize_text(subject.get("descr"))
        school_codes = sorted({normalize_text(code) for code in subject.get("acad_groups", []) if normalize_text(code)})
        major_codes = sorted({normalize_text(code) for code in subject.get("acad_orgs", []) if normalize_text(code)})

        if not subject_code:
            continue

        # Store school mapping for each department/major by code and name
        for dept_code in major_codes:
            if dept_code and school_codes:
                school_code = school_codes[0]
                school_name = schools_by_code.get(school_code, "")
                dept_name = majors_by_code.get(dept_code, "")
                
                # Map by code
                school_lookup_by_code[dept_code] = {
                    "schoolCode": school_code,
                    "schoolName": school_name,
                }
                
                # Map by department name (for fuzzy matching)
                if dept_name:
                    school_lookup_by_name[dept_name.upper()] = {
                        "schoolCode": school_code,
                        "schoolName": school_name,
                    }

        mappings.append(
            {
                "subject": subject_code,
                "label": subject_label,
                "schoolCodes": school_codes,
                "schoolNames": [schools_by_code[code] for code in school_codes if code in schools_by_code],
                "majorCodes": major_codes,
                "majorNames": [majors_by_code[code] for code in major_codes if code in majors_by_code],
            }
        )

    return sorted(mappings, key=lambda entry: entry["subject"]), school_lookup_by_code, school_lookup_by_name


def find_school_for_major(program_code: str, program_name: str, school_lookup_by_code: dict[str, dict], school_lookup_by_name: dict[str, dict]) -> dict:
    """
    Find the school for a major program using multiple matching strategies.
    Returns dict with schoolCode and schoolName, or empty dict if not found.
    """
    # Check if this is a BA (Bachelor of Arts) program - these typically belong to Arts & Sciences
    is_ba_program = "-BA" in program_code or "(BA)" in program_name
    
    # Strategy 1: Exact code match
    if program_code in school_lookup_by_code:
        school_info = school_lookup_by_code[program_code]
        # For BA programs, check if we found Engineering when Arts & Sciences exists
        if is_ba_program and "Engineering" in school_info.get("schoolName", ""):
            # Try to find Arts & Sciences version
            for alt_code, alt_school in school_lookup_by_code.items():
                if "Arts & Sci" in alt_school.get("schoolName", ""):
                    prefix = program_code.split("-")[0]
                    if prefix in alt_code or alt_code in prefix:
                        return alt_school
        return school_info
    
    # Strategy 2: Code prefix (e.g., "CHEM-BA" -> "CHEM")
    code_prefix = program_code.split("-")[0]
    if code_prefix in school_lookup_by_code:
        school_info = school_lookup_by_code[code_prefix]
        # For BA programs, prefer Arts & Sciences if available
        if is_ba_program and "Engineering" in school_info.get("schoolName", ""):
            for alt_code, alt_school in school_lookup_by_code.items():
                if "Arts & Sci" in alt_school.get("schoolName", ""):
                    return alt_school
        return school_info
    
    # Strategy 3: Try program name matching - check if name starts with a department name
    program_name_upper = program_name.upper()
    matches = []
    for dept_name, school_info in school_lookup_by_name.items():
        if program_name_upper.startswith(dept_name):
            matches.append((dept_name, school_info))
    
    if matches:
        # For BA programs, prefer Arts & Sciences
        if is_ba_program:
            for _, school_info in matches:
                if "Arts & Sci" in school_info.get("schoolName", ""):
                    return school_info
        # Return first match
        return matches[0][1]
    
    # Strategy 4: Check if first significant word of program name is in a department name
    words = [w for w in program_name.split() if len(w) > 2 and w.upper() not in ("AND", "THE", "FOR")]
    if words:
        first_word = words[0].upper()
        matches = []
        for dept_name, school_info in school_lookup_by_name.items():
            if first_word in dept_name or dept_name in first_word:
                matches.append((dept_name, school_info))
        
        if matches:
            # For BA programs, prefer Arts & Sciences
            if is_ba_program:
                for _, school_info in matches:
                    if "Arts & Sci" in school_info.get("schoolName", ""):
                        return school_info
            return matches[0][1]
    
    # Strategy 5: Check code prefix in department names
    matches = []
    for dept_name, school_info in school_lookup_by_name.items():
        if code_prefix.upper() in dept_name or dept_name in code_prefix.upper():
            matches.append((dept_name, school_info))
    
    if matches:
        if is_ba_program:
            for _, school_info in matches:
                if "Arts & Sci" in school_info.get("schoolName", ""):
                    return school_info
        return matches[0][1]
    
    # Strategy 6: For programs with short codes, try finding any code in the program name
    for dept_code in school_lookup_by_code.keys():
        if len(dept_code) > 0 and dept_code.upper() in program_name.upper():
            school_info = school_lookup_by_code[dept_code]
            if is_ba_program and "Engineering" in school_info.get("schoolName", ""):
                # Try to find Arts & Sciences
                for alt_code, alt_school in school_lookup_by_code.items():
                    if "Arts & Sci" in alt_school.get("schoolName", "") and alt_code.upper() in program_name.upper():
                        return alt_school
            return school_info
    
    # No match found
    return {}


def build_additional_programs() -> dict[str, list[dict]]:
    """
    Build additional academic programs and opportunities that aren't in the audit requirements.
    These are organized by category.
    """
    return {
        "certificates": [
            {"code": "CERT-ACCT", "name": "Accounting (Cert)"},
            {"code": "CERT-CFP", "name": "Certified Financial Planning (Cert)"},
            {"code": "CERT-CLOUD", "name": "Cloud Computing (Cert)"},
            {"code": "CERT-CYBER", "name": "Cybersecurity Analysis (Cert)"},
            {"code": "CERT-IT", "name": "Information Technology (Cert)"},
            {"code": "CERT-NCJCC", "name": "National Criminal Justice Command College (Cert)"},
        ],
        "rotc_programs": [
            {"code": "ROTC-AIRFORCE", "name": "Air Force ROTC"},
            {"code": "ROTC-ARMY", "name": "Army ROTC"},
        ],
        "special_programs": [
            {"code": "PROG-APPLIEDMATH", "name": "Applied Mathematics Program"},
            {"code": "PROG-INTERDISCIPLINARY", "name": "Interdisciplinary Major Program"},
        ],
        "honors_and_scholars": [
            {"code": "HONORS-CGAS", "name": "College of Arts & Sciences Awards and Honors"},
            {"code": "SCHOLARS-CGAS", "name": "College of Arts & Sciences Scholars Programs"},
        ],
    }


def load_existing_output(output_path: Path) -> dict:
    if output_path.exists():
        try:
            with open(output_path, encoding="utf-8") as f:
                return json.load(f)
        except (json.JSONDecodeError, OSError):
            pass
    return {}


def main() -> None:
    payload = fetch_class_search_bootstrap()
    search_options = payload.get("search_options", {})

    schools = sorted_unique_options(search_options.get("acad_groups", []), "acad_group")
    departments = sorted_unique_options(search_options.get("acad_orgs", []), "acad_org")

    # Build subjects and get school lookups before building majors
    subjects, school_lookup_by_code, school_lookup_by_name = build_subject_mappings(search_options)

    majors = build_major_options(school_lookup_by_code, school_lookup_by_name)
    careers = sorted_unique_options(search_options.get("careers", []), "acad_career")
    additional_programs = build_additional_programs()

    output_path = OUTPUT_DIR / "uva_academic_options.json"

    # If the API returned empty data for critical arrays, fall back to the previously saved values
    # to avoid wiping out good data from a partial or failed fetch.
    existing = load_existing_output(output_path)
    if not schools and existing.get("schools"):
        print("WARNING: API returned no schools — keeping previously saved schools data")
        schools = existing["schools"]
    if not departments and existing.get("departments"):
        print("WARNING: API returned no departments — keeping previously saved departments data")
        departments = existing["departments"]
    if not subjects and existing.get("subjects"):
        print("WARNING: API returned no subjects — keeping previously saved subjects data")
        subjects = existing["subjects"]
    if not careers and existing.get("careers"):
        print("WARNING: API returned no careers — keeping previously saved careers data")
        careers = existing["careers"]

    output = {
        "metadata": {
            "generated_at": datetime.now(UTC).isoformat(),
            "source_url": CLASS_SEARCH_MAIN_URL,
            "institution": normalize_text(payload.get("institution_descr") or payload.get("institution")),
            "term": normalize_text(payload.get("term")),
            "term_descr": normalize_text(payload.get("term_descr")),
            "career": normalize_text(payload.get("acad_career_descr") or payload.get("acad_career")),
            "school_count": len(schools),
            "major_count": len(majors),
            "department_count": len(departments),
            "subject_count": len(subjects),
            "majors_source": str(AUDIT_REQUIREMENTS_PATH.name),
        },
        "schools": schools,
        "departments": departments,
        "majors": majors,
        "careers": careers,
        "subjects": subjects,
        "additional_programs": additional_programs,
    }

    with open(output_path, "w", encoding="utf-8") as file:
        json.dump(output, file, indent=2, ensure_ascii=False)

    print(
        f"Output: {output_path} | schools={len(schools)} | "
        f"majors={len(majors)} | subjects={len(subjects)}"
    )


if __name__ == "__main__":
    main()