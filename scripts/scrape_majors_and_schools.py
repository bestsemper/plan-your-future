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


def build_major_options() -> list[dict]:
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

        major_options.append(
            {
                "code": entry["code"],
                "name": entry["name"],
                "displayName": display_name,
            }
        )

    return sorted(major_options, key=lambda entry: (entry["displayName"].lower(), entry["code"]))


def build_subject_mappings(search_options: dict) -> list[dict]:
    schools_by_code = {
        option["code"]: option["name"]
        for option in sorted_unique_options(search_options.get("acad_groups", []), "acad_group")
    }
    majors_by_code = {
        option["code"]: option["name"]
        for option in sorted_unique_options(search_options.get("acad_orgs", []), "acad_org")
    }

    mappings: list[dict] = []
    for subject in search_options.get("subjects", []):
        subject_code = normalize_text(subject.get("subject"))
        subject_label = normalize_text(subject.get("descr"))
        school_codes = sorted({normalize_text(code) for code in subject.get("acad_groups", []) if normalize_text(code)})
        major_codes = sorted({normalize_text(code) for code in subject.get("acad_orgs", []) if normalize_text(code)})

        if not subject_code:
            continue

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

    return sorted(mappings, key=lambda entry: entry["subject"])


def main() -> None:
    payload = fetch_class_search_bootstrap()
    search_options = payload.get("search_options", {})

    schools = sorted_unique_options(search_options.get("acad_groups", []), "acad_group")
    departments = sorted_unique_options(search_options.get("acad_orgs", []), "acad_org")
    majors = build_major_options()
    careers = sorted_unique_options(search_options.get("careers", []), "acad_career")
    subjects = build_subject_mappings(search_options)

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
    }

    output_path = OUTPUT_DIR / "uva_academic_options.json"
    with open(output_path, "w", encoding="utf-8") as file:
        json.dump(output, file, indent=2, ensure_ascii=False)

    print(
        f"Output: {output_path} | schools={len(schools)} | "
        f"majors={len(majors)} | subjects={len(subjects)}"
    )


if __name__ == "__main__":
    main()