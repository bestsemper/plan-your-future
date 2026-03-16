import json
import re
from collections import defaultdict
from pathlib import Path
from typing import Dict, List, Optional, Any, Tuple
from dataclasses import dataclass, asdict
import sys

# Regex pattern for course codes (e.g., CS 1110, AIRS 100, RUSS 116, etc.)
COURSE_CODE_PATTERN = r'\b([A-Z]{2,6})\s*(\d{3,4}[A-Z]?)\b'
COURSE_NUMBER_ONLY_PATTERN = r'\b(\d{4})\b'
INVALID_SUBJECT_CODES = {
    'OF', 'THE', 'AND', 'OR', 'TO', 'IN', 'ON', 'AT', 'BY', 'AN', 'A', 'AS', 'IS', 'IF', 'BE', 'DO'
}
RESTRICTION_TAIL_PATTERN = re.compile(
    r"(?:can't\s+enroll\s+if|cannot\s+enroll\s+if|may\s+not\s+enroll\s+if|credit\s+not\s+granted|not\s+open\s+to|restricted\s+to)",
    re.IGNORECASE,
)
RECOMMENDATION_TAIL_PATTERN = re.compile(
    r"(?:^|[.;\n\r])\s*(?:"
    r"strongly\s+recommended|"
    r"recommended(?:\s+prerequisites?)?|"
    r"it\s+is\s+recommended"
    r")\s*[:\-]"
    r"|(?:^|[.;\n\r])[^.;\n\r]*\b(?:is|are)\s+(?:strongly\s+)?recommended\b",
    re.IGNORECASE,
)
INSTRUCTOR_PERMISSION_PATTERN = re.compile(
    r"\b(?:or\s+)?instructor\s+permission(?:\s+by\s+audition)?\b[\s\.,;:]*",
    re.IGNORECASE,
)

# Regex patterns for requisite prefixes
PREREQ_PREFIX_PATTERN = r'(?:prerequisites?|prereqs?)(?:\s*[:\-]?)\s*'
REQUISITE_LABEL_PATTERN = re.compile(
    r'(?<!recommended\s)(?P<label>'
    r'prerequisite\s*/\s*corequisite|'
    r'prerequisite\s+or\s+corequisite|'
    r'pre\s*(?:-|/)?\s*or\s+co\s*(?:-|/)?\s*requisites?|'
    r'pre\s*(?:-|/)?\s*co\s*(?:-|/)?\s*requisites?|'
    r'prerequisites?|prereqs?|'
    r'co\s*(?:-|/)?\s*requisites?|coreqs?'
    r')(?=\s*[:\-]|\s+[A-Z(\d]|\s+[a-z])(?:\s*[:\-]?)\s*',
    re.IGNORECASE,
)

# Regex pattern for "N of the following" constraints
COUNT_OF_PATTERN = r'(?:at\s+least\s+)?(\d+)\s+(?:of\s+(?:the\s+)?following|from\s+the\s+following|courses?\s+from)'
MANUAL_EQUIVALENT_GROUPS_PATH = Path('data/manual_equivalent_groups.json')


@dataclass
class CourseNode:
    """Represents a single course in the prerequisite tree"""
    type: str = "course"
    code: str = ""

    def to_dict(self):
        return asdict(self)


@dataclass
class OperatorNode:
    """Represents an AND/OR operator node in the tree"""
    type: str  # "AND" or "OR"
    children: List[Any] = None

    def __post_init__(self):
        if self.children is None:
            self.children = []

    def to_dict(self):
        return {
            "type": self.type,
            "children": [child.to_dict() if hasattr(child, 'to_dict') else child for child in self.children]
        }


@dataclass
class CountNode:
    """Represents an 'N of the following' constraint node in the tree"""
    type: str = "count"
    count: int = 1  # How many courses are required
    children: List[Any] = None

    def __post_init__(self):
        if self.children is None:
            self.children = []

    def to_dict(self):
        return {
            "type": self.type,
            "count": self.count,
            "children": [child.to_dict() if hasattr(child, 'to_dict') else child for child in self.children]
        }


@dataclass
class MajorRequirementNode:
    """Represents a major/minor/concentration requirement."""
    type: str = "major"
    requirement: str = ""

    def to_dict(self):
        return asdict(self)


@dataclass
class ProgramRequirementNode:
    """Represents a program/cohort/standing requirement."""
    type: str = "program"
    requirement: str = ""

    def to_dict(self):
        return asdict(self)


@dataclass
class YearRequirementNode:
    """Represents a year/standing requirement."""
    type: str = "year"
    requirement: str = ""

    def to_dict(self):
        return asdict(self)


@dataclass
class SchoolRequirementNode:
    """Represents a school requirement (e.g., SEAS)."""
    type: str = "school"
    requirement: str = ""

    def to_dict(self):
        return asdict(self)


def normalize_requirement_text(text: str) -> str:
    """Normalize whitespace and trailing punctuation for requirement snippets."""
    normalized = re.sub(r'\s+', ' ', text).strip()
    normalized = re.sub(PREREQ_PREFIX_PATTERN, '', normalized, count=1, flags=re.IGNORECASE)
    return normalized.rstrip(' .;:')


def extract_major_program_requirements(enrollment_requirements: str) -> List[Any]:
    """Extract non-course enrollment constraints as major/program/year/school nodes."""
    text = enrollment_requirements.strip()
    if not text:
        return []

    major_nodes: List[Any] = []
    program_nodes: List[Any] = []
    year_nodes: List[Any] = []
    school_nodes: List[Any] = []
    complex_nodes: List[Any] = []

    clauses = [
        normalize_requirement_text(clause)
        for clause in re.split(r'[\n\r;]+|\.(?:\s+|$)', text)
        if normalize_requirement_text(clause)
    ]

    major_pattern = re.compile(r'\b(major|minor|concentration|distinguished\s+majors?)\b', re.IGNORECASE)
    program_pattern = re.compile(
        r'\b('
        r'program|rotc|admission|cohort|track|certificate|'
        r'jd\s+student|llm\s+student|mba\s+student|phd\s+student|'
        r'graduate\s+student|undergraduate\s+student|engineering\s+undergraduate|'
        r'graduate\s+standing|undergraduate\s+standing|grad\s+standing|undergrad\s+standing'
        r')\b',
        re.IGNORECASE,
    )

    year_standing_pattern = re.compile(
        r'\b(?:'
        r'(?:\d(?:st|nd|rd|th)|first|second|third|fourth)(?:[-\s]year)?'
        r'(?:\s+or\s+(?:\d(?:st|nd|rd|th)|first|second|third|fourth)(?:[-\s]year)?)?\s+standing'
        r')\b',
        re.IGNORECASE,
    )
    year_student_pattern = re.compile(
        r'\b(?:first|second|third|fourth|1st|2nd|3rd|4th)[-\s]year\s+(?:transfer\s+)?students?\b',
        re.IGNORECASE,
    )
    year_token_pattern = re.compile(
        r'\b(?:first|second|third|fourth|1st|2nd|3rd|4th)(?:[-\s]year)?\b',
        re.IGNORECASE,
    )
    year_short_pattern = re.compile(
        r'\b(?:first|second|third|fourth|1st|2nd|3rd|4th)[-\s]year\b',
        re.IGNORECASE,
    )
    multi_year_sequence_pattern = re.compile(
        r'\b('
        r'(?:first|second|third|fourth|1st|2nd|3rd|4th)(?:[-\s]year)?'
        r'(?:\s*,\s*|\s+or\s+)+'
        r'(?:first|second|third|fourth|1st|2nd|3rd|4th)(?:[-\s]year)?'
        r'(?:\s*(?:,\s*|\s+or\s+)\s*(?:first|second|third|fourth|1st|2nd|3rd|4th)(?:[-\s]year)?)*'
        r')(?=\s+(?:transfer\s+)?students?\b|\s+standing\b|\s+year\b|\b)',
        re.IGNORECASE,
    )
    school_pattern = re.compile(
        r'\b(?:'
        r'SEAS|E-?SCHOOL|SCHOOL\s+OF\s+ENGINEERING(?:\s+AND\s+APPLIED\s+SCIENCE)?|(?:UNDERGRADUATE\s+)?ENGINEERING(?:\s+STUDENTS?)?|'
        r'CLAS|A\s*&\s*S|ARTS\s*&\s*SCIENCES|COLLEGE\s+(?:AND\s+GRADUATE\s+SCHOOL\s+OF\s+)?ARTS\s*&\s*SCIENCES|'
        r'SCHOOL\s+OF\s+ARCHITECTURE|ARCH|'
        r'MCINTIRE|SCHOOL\s+OF\s+COMMERCE|COMMERCE\s+SCHOOL|'
        r'DARDEN|DARDEN\s+SCHOOL\s+OF\s+BUSINESS|'
        r'BATTEN|FRANK\s+BATTEN\s+SCHOOL\s+OF\s+LEADERSHIP\s+AND\s+PUBLIC\s+POLICY|'
        r'SCHOOL\s+OF\s+CONTINUING\s*&\s*PROFESSIONAL\s+STUDIES|SCHOOL\s+OF\s+CONTINUING\s+AND\s+PROFESSIONAL\s+STUDIES|SCPS|'
        r'SCHOOL\s+OF\s+DATA\s+SCIENCE|DATA\s+SCIENCE\s+SCHOOL|SDS|'
        r'SCHOOL\s+OF\s+EDUCATION\s+AND\s+HUMAN\s+DEVELOPMENT|EDUCATION\s+AND\s+HUMAN\s+DEVELOPMENT|EHD|'
        r'SCHOOL\s+OF\s+LAW|LAW\s+SCHOOL|'
        r'SCHOOL\s+OF\s+MEDICINE|MEDICAL\s+SCHOOL|'
        r'SCHOOL\s+OF\s+NURSING|NURS'
        r')\b',
        re.IGNORECASE,
    )
    grad_standing_pattern = re.compile(r'\b(?:grad(?:uate)?|undergrad(?:uate)?)\s+standing\b', re.IGNORECASE)
    restricted_prefix_pattern = re.compile(r'\brestricted\s+to\s+([^,.;]+)', re.IGNORECASE)

    def build_graduate_option_node(raw_clause: str) -> Optional[Any]:
        """Parse graduate enrollment option lists into an OR tree.

        Example:
        "Graduate Engineering, Graduate Arts & Sciences, Graduate Education, Provost Graduate or Data Science Graduate"
        """
        normalized_clause = normalize_requirement_text(raw_clause)
        if not normalized_clause:
            return None

        if ',' not in normalized_clause or not re.search(r'\bor\b', normalized_clause, re.IGNORECASE):
            return None

        options = [
            normalize_requirement_text(part)
            for part in re.split(r',|\bor\b', normalized_clause, flags=re.IGNORECASE)
            if normalize_requirement_text(part)
        ]
        if len(options) < 2:
            return None

        # Restrict this heuristic to graduate-option lists so we do not over-interpret other clauses.
        if not all(re.search(r'\bgraduate\b', option, re.IGNORECASE) for option in options):
            return None

        children: List[Any] = []
        for option in options:
            lower_option = option.lower()
            if 'provost' in lower_option:
                children.append(ProgramRequirementNode(requirement='provost graduate'))
                continue

            children.append(SchoolRequirementNode(requirement=canonical_school(option, normalized_clause)))

        # Dedupe children while preserving order.
        deduped_children: List[Any] = []
        seen_child_keys = set()
        for child in children:
            key = (child.type, normalize_requirement_text(child.requirement).lower())
            if key in seen_child_keys:
                continue
            seen_child_keys.add(key)
            deduped_children.append(child)

        if len(deduped_children) < 2:
            return None

        return OperatorNode(type='OR', children=deduped_children)

    def normalize_freeform_requirement(raw: str) -> str:
        text = normalize_requirement_text(raw)
        text = text.replace('\u2013', '-').replace('\u2014', '-')
        text = re.sub(r'\s*[-/]\s*', ' ', text)
        text = re.sub(r'\s+', ' ', text).strip(' ,')
        text = text.lower()
        text = re.sub(r'\bgrad\b', 'graduate', text)
        text = re.sub(r'\bundergrad\b', 'undergraduate', text)
        text = re.sub(r'^restricted\s+to\s+', 'restricted to ', text)
        return text

    def normalize_year_requirement(raw: str) -> str:
        text = normalize_freeform_requirement(raw)
        replacements = {
            'first': '1st',
            'second': '2nd',
            'third': '3rd',
            'fourth': '4th',
        }
        for src, dst in replacements.items():
            text = re.sub(rf'\b{src}\b', dst, text)
        text = re.sub(r'\b(\d(?:st|nd|rd|th))\s*year\b', r'\1 year', text)
        text = re.sub(r'\s+', ' ', text).strip(' ,')
        return text

    def normalize_year_token(raw: str) -> str:
        text = normalize_freeform_requirement(raw)
        if 'year' not in text and 'standing' not in text and 'student' not in text:
            text = f'{text} year'
        return normalize_year_requirement(text)

    def restriction_body(requirement: str) -> str:
        req = normalize_freeform_requirement(requirement)
        if req.startswith('restricted to '):
            return req[len('restricted to '):]
        return req

    def canonical_school(raw: str, context: str = '') -> str:
        upper_raw = raw.upper()
        upper_context = context.upper()

        def infer_level(default: str = '') -> str:
            text = f"{upper_raw} {upper_context}"
            has_undergrad = bool(re.search(r'\bUNDERGRAD(?:UATE)?\b|\bUGRD\b|\b1ST\s*[- ]?YEAR\b|\b2ND\s*[- ]?YEAR\b|\b3RD\s*[- ]?YEAR\b|\b4TH\s*[- ]?YEAR\b', text))
            has_grad = bool(re.search(r'\bGRAD(?:UATE)?\b|\bPHD\b|\bDOCTORAL\b|\bMASTER\b|\bMS\b|\bMA\b|\bMBA\b|\bLLM\b|\bJD\b', text))
            if has_undergrad and not has_grad:
                return 'Undergraduate'
            if has_grad and not has_undergrad:
                return 'Graduate'
            return default

        if 'SEAS' in upper_raw or 'ENGINEERING' in upper_raw or 'E-SCHOOL' in upper_raw:
            return 'School of Engineering and Applied Science'

        if 'CLAS' in upper_raw or ('ARTS' in upper_raw and 'SCIENCES' in upper_raw) or upper_raw == 'A&S':
            level = infer_level('Undergraduate')
            if level == 'Graduate':
                return 'Graduate School of Arts & Sciences'
            return 'College of Arts & Sciences'

        if 'ARCH' in upper_raw or 'ARCHITECTURE' in upper_raw:
            return 'School of Architecture'

        if 'NURS' in upper_raw or 'NURSING' in upper_raw:
            return 'School of Nursing'

        if 'MEDICINE' in upper_raw or 'MEDICAL SCHOOL' in upper_raw:
            return 'School of Medicine'

        if 'LAW' in upper_raw:
            return 'School of Law'

        if 'SCPS' in upper_raw or ('CONTINUING' in upper_raw and 'PROFESSIONAL' in upper_raw):
            return 'School of Continuing and Professional Studies'

        if 'DATA SCIENCE' in upper_raw or upper_raw == 'SDS':
            return 'School of Data Science'

        if ('EDUCATION' in upper_raw and 'HUMAN DEVELOPMENT' in upper_raw) or upper_raw == 'EHD':
            return 'School of Education and Human Development'

        if 'COMMERCE' in upper_raw or 'MCINTIRE' in upper_raw:
            return 'McIntire School of Commerce'

        if 'DARDEN' in upper_raw:
            return 'Darden School of Business'

        if 'BATTEN' in upper_raw:
            return 'Frank Batten School of Leadership and Public Policy'

        return normalize_requirement_text(raw)

    for clause in clauses:
        lower_clause = clause.lower()
        if "can't enroll if" in lower_clause or "cannot enroll if" in lower_clause:
            continue
        if "credit not granted" in lower_clause:
            continue

        graduate_option_node = build_graduate_option_node(clause)
        if graduate_option_node is not None:
            complex_nodes.append(graduate_option_node)
            continue

        clause = re.sub(r'\bor\s+permission\s+of\s+instructor\b.*$', '', clause, flags=re.IGNORECASE)
        clause = re.sub(r'\bor\s+instructor\s+permission\b.*$', '', clause, flags=re.IGNORECASE)
        clause = normalize_requirement_text(clause)
        if not clause:
            continue

        # Preserve semantics for patterns like "SEAS 4th-year or Grad standing"
        # as (SEAS AND 4th-year) OR Grad standing.
        or_parts = [normalize_requirement_text(part) for part in re.split(r'\bOR\b', clause, flags=re.IGNORECASE)]
        if len(or_parts) == 2:
            left_part, right_part = or_parts
            left_years = [YearRequirementNode(requirement=normalize_requirement_text(m.group(0))) for m in year_standing_pattern.finditer(left_part)]
            if not left_years:
                left_years = [YearRequirementNode(requirement=normalize_requirement_text(m.group(0))) for m in year_short_pattern.finditer(left_part)]
            left_schools = [SchoolRequirementNode(requirement=canonical_school(m.group(0), left_part)) for m in school_pattern.finditer(left_part)]
            right_grad_match = grad_standing_pattern.search(right_part)
            if left_years and left_schools and right_grad_match:
                left_children = [*left_schools, *left_years]
                left_node = left_children[0] if len(left_children) == 1 else OperatorNode(type='AND', children=left_children)
                right_node = ProgramRequirementNode(requirement=normalize_requirement_text(right_grad_match.group(0)))
                complex_nodes.append(OperatorNode(type='OR', children=[left_node, right_node]))
                continue

        # Extract school constraints from the full clause first so names that
        # include "and" (e.g., Education and Human Development) are preserved.
        for match in school_pattern.finditer(clause):
            school_nodes.append(SchoolRequirementNode(requirement=canonical_school(match.group(0), clause)))

        # Split on top-level AND to isolate non-course constraints from mixed clauses.
        segments = [normalize_requirement_text(seg) for seg in re.split(r'\bAND\b', clause, flags=re.IGNORECASE)]
        segments = [seg for seg in segments if seg]

        for segment in segments:
            segment_has_course_codes = bool(extract_course_codes(segment))

            # Preserve full restricted-to clauses before school/year stripping.
            restricted_match_original = restricted_prefix_pattern.search(segment)
            if restricted_match_original and not segment_has_course_codes:
                restricted_text = normalize_requirement_text(f"Restricted to {restricted_match_original.group(1)}")
                if restricted_text.lower() != 'restricted to students':
                    program_nodes.append(ProgramRequirementNode(requirement=restricted_text))

            # Extract explicit year/standing constraints into dedicated year nodes.
            occupied_year_spans = []
            for match in multi_year_sequence_pattern.finditer(segment):
                year_children = [
                    YearRequirementNode(requirement=normalize_year_token(year_match.group(0)))
                    for year_match in year_token_pattern.finditer(match.group(1))
                ]
                deduped_children = []
                seen_years = set()
                for child in year_children:
                    key = normalize_requirement_text(child.requirement).lower()
                    if key in seen_years:
                        continue
                    seen_years.add(key)
                    deduped_children.append(child)
                if len(deduped_children) > 1:
                    complex_nodes.append(OperatorNode(type='OR', children=deduped_children))
                    occupied_year_spans.append(match.span())
            for pattern in (year_standing_pattern, year_student_pattern):
                for match in pattern.finditer(segment):
                    start, end = match.span()
                    overlaps_multi_year = any(start >= s and end <= e for s, e in occupied_year_spans)
                    if overlaps_multi_year:
                        continue
                    year_nodes.append(YearRequirementNode(requirement=normalize_requirement_text(match.group(0))))
                    occupied_year_spans.append(match.span())

            # Capture shorthand year phrases like "4th-year" when coupled with school/program text.
            for match in year_short_pattern.finditer(segment):
                start, end = match.span()
                overlaps_longer_match = any(start >= s and end <= e for s, e in occupied_year_spans)
                if overlaps_longer_match:
                    continue
                year_nodes.append(YearRequirementNode(requirement=normalize_requirement_text(match.group(0))))

            # Extract school constraints into dedicated school nodes.
            for match in school_pattern.finditer(segment):
                school_nodes.append(SchoolRequirementNode(requirement=canonical_school(match.group(0), segment)))

            # Treat graduate/undergraduate standing as a program requirement.
            for match in grad_standing_pattern.finditer(segment):
                program_nodes.append(ProgramRequirementNode(requirement=normalize_requirement_text(match.group(0))))

            # Remove year fragments before classifying the remainder as major/program.
            segment_wo_year = year_standing_pattern.sub(' ', segment)
            segment_wo_year = year_student_pattern.sub(' ', segment_wo_year)
            segment_wo_year = year_short_pattern.sub(' ', segment_wo_year)
            segment_wo_year = school_pattern.sub(' ', segment_wo_year)
            segment_wo_year = normalize_requirement_text(segment_wo_year)
            segment_wo_year_has_course_codes = bool(extract_course_codes(segment_wo_year))

            if major_pattern.search(segment_wo_year) and not segment_wo_year_has_course_codes:
                major_nodes.append(MajorRequirementNode(requirement=segment_wo_year))
                continue

            if program_pattern.search(segment_wo_year) and not segment_wo_year_has_course_codes:
                # Keep the full phrase (e.g., "admission to the teacher education program")
                # instead of splitting into low-information tokens like "admission" + "program".
                full_program_requirement = normalize_requirement_text(segment_wo_year)
                if full_program_requirement:
                    program_nodes.append(ProgramRequirementNode(requirement=full_program_requirement))
                continue

            # For mixed segments that include course codes, still pull clear program-only fragments.
            restricted_match = restricted_prefix_pattern.search(segment_wo_year)
            if restricted_match:
                restricted_text = normalize_requirement_text(f"Restricted to {restricted_match.group(1)}")
                if restricted_text.lower() != 'restricted to students':
                    program_nodes.append(ProgramRequirementNode(requirement=restricted_text))

    full_year_requirements = {
        normalize_requirement_text(node.requirement).lower()
        for node in year_nodes
        if 'standing' in node.requirement.lower() or 'student' in node.requirement.lower()
    }
    if full_year_requirements:
        filtered_year_nodes = []
        for node in year_nodes:
            normalized = normalize_requirement_text(node.requirement).lower()
            is_short = 'standing' not in normalized and 'student' not in normalized
            covered_by_full = any(normalized in full for full in full_year_requirements)
            if is_short and covered_by_full:
                continue
            filtered_year_nodes.append(node)
        year_nodes = filtered_year_nodes

    # Canonicalize requirement text for consistent downstream processing.
    for node in major_nodes:
        node.requirement = normalize_freeform_requirement(node.requirement)
    for node in program_nodes:
        node.requirement = normalize_freeform_requirement(node.requirement)
    for node in year_nodes:
        node.requirement = normalize_year_requirement(node.requirement)

    def normalize_requirement_nodes_recursive(node: Any) -> Any:
        if isinstance(node, ProgramRequirementNode):
            node.requirement = normalize_freeform_requirement(node.requirement)
            return node
        if isinstance(node, MajorRequirementNode):
            node.requirement = normalize_freeform_requirement(node.requirement)
            return node
        if isinstance(node, YearRequirementNode):
            node.requirement = normalize_year_requirement(node.requirement)
            return node
        if isinstance(node, OperatorNode):
            node.children = [normalize_requirement_nodes_recursive(child) for child in node.children]
            return node
        if isinstance(node, CountNode):
            node.children = [normalize_requirement_nodes_recursive(child) for child in node.children]
            return node
        return node

    complex_nodes = [normalize_requirement_nodes_recursive(node) for node in complex_nodes]

    # If we captured a multi-year alternative like "2nd or 3rd or 4th year" as an
    # OR node, drop redundant standalone year nodes that are already covered by that OR.
    year_requirements_in_or_nodes = set()
    for node in complex_nodes:
        if not isinstance(node, OperatorNode) or node.type != 'OR':
            continue
        if not node.children or not all(isinstance(child, YearRequirementNode) for child in node.children):
            continue
        for child in node.children:
            year_requirements_in_or_nodes.add(normalize_requirement_text(child.requirement).lower())

    if year_requirements_in_or_nodes:
        year_nodes = [
            node
            for node in year_nodes
            if normalize_requirement_text(node.requirement).lower() not in year_requirements_in_or_nodes
        ]

    # Remove program requirements that are semantically subsumed by a stricter one.
    # Example: "restricted to mse majors" is subsumed by
    # "restricted to 4th year mse majors".
    filtered_program_nodes: List[Any] = []
    for i, node in enumerate(program_nodes):
        node_body = restriction_body(node.requirement)
        is_subsumed = False
        for j, other in enumerate(program_nodes):
            if i == j:
                continue
            other_body = restriction_body(other.requirement)
            if node_body == other_body:
                continue
            if node.requirement.startswith('restricted to ') and other.requirement.startswith('restricted to '):
                if node_body in other_body and len(node_body) < len(other_body):
                    is_subsumed = True
                    break
        if not is_subsumed:
            filtered_program_nodes.append(node)
    program_nodes = filtered_program_nodes

    # Drop low-information placeholders if richer requirements exist.
    generic_program_requirements = {
        'admission',
        'program',
        'track',
        'certificate',
    }
    has_specific_program_requirement = any(
        normalize_requirement_text(node.requirement).lower() not in generic_program_requirements
        for node in program_nodes
    )
    if has_specific_program_requirement:
        program_nodes = [
            node
            for node in program_nodes
            if normalize_requirement_text(node.requirement).lower() not in generic_program_requirements
        ]

    # Remove redundant program restrictions that only restate a school restriction.
    # Example: "restricted to darden students" is redundant when a
    # "Darden School of Business" school node is already present.
    school_requirements = {normalize_requirement_text(n.requirement).lower() for n in school_nodes}
    filtered_program_nodes = []
    for node in program_nodes:
        req = normalize_requirement_text(node.requirement).lower()
        if req == 'restricted to darden students' and 'darden school of business' in school_requirements:
            continue
        filtered_program_nodes.append(node)
    program_nodes = filtered_program_nodes

    deduped: List[Any] = []
    seen = set()
    for node in major_nodes + program_nodes + year_nodes + school_nodes:
        key = (node.type, normalize_requirement_text(node.requirement).lower())
        if key in seen:
            continue
        seen.add(key)
        deduped.append(node)

    for node in complex_nodes:
        serialized = json.dumps(node.to_dict(), sort_keys=True)
        key = ('complex', serialized)
        if key in seen:
            continue
        seen.add(key)
        deduped.append(node)

    return deduped


def classify_requisite_label(label: str) -> str:
    """Classify a requisite label as prerequisite or corequisite semantics."""
    normalized = normalize_requirement_text(label).lower()
    normalized = normalized.replace('-', ' ').replace('/', ' ')
    normalized = re.sub(r'\s+', ' ', normalized).strip()
    if 'coreq' in normalized or 'corequisite' in normalized or 'co requisite' in normalized:
        return 'corequisite'
    return 'prerequisite'


def extract_requirement_snippets(description: str, enrollment_requirements: str) -> List[Tuple[str, str]]:
    """Extract explicit prerequisite/corequisite snippets from description and enrollment text."""

    def extract_labeled_snippets(text: str) -> List[Tuple[str, str]]:
        normalized_text = text.strip()
        if not normalized_text:
            return []

        restriction_match = RESTRICTION_TAIL_PATTERN.search(normalized_text)
        if restriction_match:
            normalized_text = normalized_text[:restriction_match.start()].strip()

        matches = list(REQUISITE_LABEL_PATTERN.finditer(normalized_text))
        if not matches:
            return []

        snippets: List[Tuple[str, str]] = []
        for index, match in enumerate(matches):
            start = match.start()
            end = matches[index + 1].start() if index + 1 < len(matches) else len(normalized_text)
            raw_snippet = normalized_text[start:end]

            # "Instructor permission" is advisory/administrative and should not
            # become a hard prerequisite requirement in this planner.
            raw_snippet = INSTRUCTOR_PERMISSION_PATTERN.sub(' ', raw_snippet)
            raw_snippet = re.sub(r'\s+', ' ', raw_snippet).strip(' .;:,')

            # Exclude recommendation-only tails from requisite snippets.
            recommendation_match = RECOMMENDATION_TAIL_PATTERN.search(raw_snippet)
            if recommendation_match:
                raw_snippet = raw_snippet[:recommendation_match.start()]

            snippet = normalize_requirement_text(raw_snippet)
            if snippet:
                snippets.append((classify_requisite_label(match.group('label')), snippet))
        return snippets

    snippets: List[Tuple[str, str]] = []
    seen = set()

    enrollment_text = enrollment_requirements.strip()
    if enrollment_text:
        labeled_snippets = extract_labeled_snippets(enrollment_text)
        if labeled_snippets:
            for kind, snippet in labeled_snippets:
                key = (kind, snippet.lower())
                if key in seen:
                    continue
                seen.add(key)
                snippets.append((kind, snippet))
        elif extract_course_codes(enrollment_text):
            normalized = normalize_requirement_text(enrollment_text)
            concurrent_language = bool(re.search(
                r'\b(?:coreq|corequisite|co[-\s]?requisite|concurrent(?:ly)?|currently\s+enrolled|must\s+be\s+taken\s+concurrently|or\s+currently\s+enrolled)\b',
                enrollment_text,
                re.IGNORECASE,
            ))
            inferred_kind = 'corequisite' if concurrent_language else 'prerequisite'
            key = (inferred_kind, normalized.lower())
            if key not in seen:
                seen.add(key)
                snippets.append((inferred_kind, normalized))

    description_text = description.strip()
    if description_text:
        for kind, snippet in extract_labeled_snippets(description_text):
            key = (kind, snippet.lower())
            if key in seen:
                continue
            seen.add(key)
            snippets.append((kind, snippet))

    return snippets


def extract_course_codes(text: str) -> List[str]:
    """Extract all course codes from text"""
    matches = re.findall(COURSE_CODE_PATTERN, text.upper())
    return [f"{dept} {num}" for dept, num in matches if dept not in INVALID_SUBJECT_CODES]


def normalize_course_code(code: str) -> str:
    """Normalize course codes to a consistent DEPT 1234 format."""
    return re.sub(r'\s+', ' ', code.upper()).strip()


def normalize_title_key(title: str) -> str:
    """Normalize a title for loose equivalency grouping."""
    normalized = re.sub(r'[^A-Z0-9]+', ' ', title.upper()).strip()
    normalized = re.sub(r'\bI{1,3}V?\b', lambda match: {
        'I': '1',
        'II': '2',
        'III': '3',
        'IV': '4',
        'V': '5',
    }.get(match.group(0), match.group(0)), normalized)
    return re.sub(r'\s+', ' ', normalized).strip()


def build_equivalent_course_map(rows: List[Dict[str, str]]) -> Dict[str, List[str]]:
    """Build a conservative course-equivalency map from catalog metadata."""
    equivalents: Dict[str, set[str]] = defaultdict(set)
    title_groups: Dict[str, List[str]] = defaultdict(list)

    for row in rows:
        course_code = normalize_course_code(row.get('course_code', ''))
        title = row.get('title', '').strip()
        description = row.get('description', '').strip()

        if not course_code:
            continue

        if title:
            title_key = normalize_title_key(title)
            if title_key:
                title_groups[title_key].append(course_code)

        if description and 'CROSS-LIST' in description.upper():
            cross_list_clauses = re.findall(r'cross[-\s]*listed(?:\s+as|\s+with)?\s+([^.;\n]+)', description, re.IGNORECASE)
            for clause in cross_list_clauses:
                for other_code in extract_course_codes(clause):
                    other_code = normalize_course_code(other_code)
                    if other_code and other_code != course_code:
                        equivalents[course_code].add(other_code)
                        equivalents[other_code].add(course_code)

    for group_codes in title_groups.values():
        unique_codes = sorted({normalize_course_code(code) for code in group_codes if code})
        if len(unique_codes) < 2:
            continue
        for code in unique_codes:
            equivalents[code].update(other for other in unique_codes if other != code)

    for group in load_manual_equivalent_groups():
        normalized_group = [normalize_course_code(code) for code in group]
        for code in normalized_group:
            equivalents[code].update(other for other in normalized_group if other != code)

    return {
        code: sorted(other for other in other_codes if other != code)
        for code, other_codes in equivalents.items()
        if other_codes
    }


def load_manual_equivalent_groups() -> List[List[str]]:
    """Load curated equivalent-course groups from data/manual_equivalent_groups.json."""
    if not MANUAL_EQUIVALENT_GROUPS_PATH.exists():
        return []

    try:
        payload = json.loads(MANUAL_EQUIVALENT_GROUPS_PATH.read_text(encoding='utf-8'))
    except (OSError, json.JSONDecodeError):
        return []

    groups = payload.get('groups', []) if isinstance(payload, dict) else []
    normalized_groups: List[List[str]] = []

    for group in groups:
        if not isinstance(group, list):
            continue
        normalized = [normalize_course_code(code) for code in group if isinstance(code, str) and code.strip()]
        unique_codes = sorted(dict.fromkeys(normalized))
        if len(unique_codes) >= 2:
            normalized_groups.append(unique_codes)

    return normalized_groups


def expand_equivalent_courses(node: Optional[Any], equivalent_course_map: Dict[str, List[str]]) -> Optional[Any]:
    """Expand course leaves into OR groups when mapped equivalent courses exist."""
    if node is None:
        return None

    if isinstance(node, CourseNode):
        course_code = normalize_course_code(node.code)
        equivalent_codes = equivalent_course_map.get(course_code, [])
        if not equivalent_codes:
            return node

        return OperatorNode(
            type='OR',
            children=[CourseNode(type='course', code=course_code)] + [
                CourseNode(type='course', code=equivalent_code)
                for equivalent_code in equivalent_codes
            ],
        )

    if isinstance(node, OperatorNode):
        expanded_children = [
            expanded
            for child in node.children
            for expanded in [expand_equivalent_courses(child, equivalent_course_map)]
            if expanded is not None
        ]

        # Flatten nested operators of the same type and dedupe equivalent children.
        flattened_children: List[Any] = []
        seen_child_keys = set()

        def child_key(child: Any) -> str:
            if isinstance(child, CourseNode):
                return f"course:{normalize_course_code(child.code)}"
            if hasattr(child, 'to_dict'):
                return json.dumps(child.to_dict(), sort_keys=True)
            return str(child)

        for child in expanded_children:
            if isinstance(child, OperatorNode) and child.type == node.type:
                nested_children = child.children
            else:
                nested_children = [child]

            for nested_child in nested_children:
                key = child_key(nested_child)
                if key in seen_child_keys:
                    continue
                seen_child_keys.add(key)
                flattened_children.append(nested_child)

        if not flattened_children:
            return None
        if len(flattened_children) == 1:
            return flattened_children[0]

        node.children = flattened_children
        return node

    if isinstance(node, CountNode):
        node.children = [
            expanded
            for child in node.children
            for expanded in [expand_equivalent_courses(child, equivalent_course_map)]
            if expanded is not None
        ]
        return node

    return node


def extract_words_after_prefix(text: str) -> List[str]:
    """Extract all words that appear in prerequisite text after the prefix"""
    match = re.search(PREREQ_PREFIX_PATTERN, text, re.IGNORECASE)
    if not match:
        return []
    
    # Remove course codes and get remaining words
    remaining_text = text[match.end():]
    remaining_text = re.sub(COURSE_CODE_PATTERN, ' ', remaining_text)
    words = re.findall(r'\b[a-zA-Z]+\b', remaining_text.lower())
    
    # Filter out common conjunctions and prepositions (already handled)
    stop_words = {'and', 'or', 'with', 'plus', 'a', 'an', 'the', 'of', 'to', 'in', 'at', 'for', 'by', 'on', 's'}
    filtered_words = [w for w in words if w not in stop_words]
    
    return filtered_words


def tokenize_prerequisite(text: str) -> List[str]:
    """Tokenize the prerequisite text into tokens (course codes, operators, parens, count constraints)"""
    # Check for count pattern first (e.g., "2 of the following")
    count_match = re.search(COUNT_OF_PATTERN, text, re.IGNORECASE)

    # Normalize for consistent matching and parsing.
    text = text.upper()

    # Preserve explicit comma-plus-conjunction patterns before generic comma handling.
    text = re.sub(r'\s*,\s*AND\b', ' AND ', text)
    text = re.sub(r'\s*,\s*OR\b', ' OR ', text)

    # Treat comma-separated course lists as OR options.
    text = re.sub(r'\s*,\s*', ' OR ', text)
    text = re.sub(r'\bAND/OR\b', ' OR ', text)

    # Normalize explicit operators.
    text = re.sub(r'\bAND\b', ' AND ', text)
    text = re.sub(r'\bOR\b', ' OR ', text)
    text = re.sub(r'(?:\bOR\b\s*){2,}', ' OR ', text)
    text = re.sub(r'(?:\bAND\b\s*){2,}', ' AND ', text)
    
    # Tokenize
    tokens: List[str] = []
    pattern = re.compile(
        r'\(|\)|\bAND\b|\bOR\b|\b[A-Z]{2,6}\s*\d{3,4}[A-Z]?\b|\b\d{4}\b',
        re.IGNORECASE,
    )
    last_dept = None

    # If we found a count pattern, add it as a special token
    if count_match:
        tokens.append(f"COUNT:{count_match.group(1)}")
        # Parse text after the count constraint
        text_after = text[count_match.end():]
        for match in pattern.finditer(text_after):
            token = match.group(0).strip().upper()
            if not token:
                continue

            course_match = re.match(r'^([A-Z]{2,6})\s*(\d{3,4}[A-Z]?)$', token)
            if course_match:
                dept, num = course_match.groups()
                if dept not in INVALID_SUBJECT_CODES:
                    tokens.append(f"{dept} {num}")
                    last_dept = dept
                continue

            if re.match(r'^\d{4}$', token):
                if last_dept:
                    tokens.append(f"{last_dept} {token}")
                continue

            if token in ('AND', 'OR', '(', ')'):
                tokens.append(token)
    else:
        for match in pattern.finditer(text):
            token = match.group(0).strip().upper()
            if not token:
                continue

            course_match = re.match(r'^([A-Z]{2,6})\s*(\d{3,4}[A-Z]?)$', token)
            if course_match:
                dept, num = course_match.groups()
                if dept not in INVALID_SUBJECT_CODES:
                    tokens.append(f"{dept} {num}")
                    last_dept = dept
                continue

            if re.match(r'^\d{4}$', token):
                if last_dept:
                    tokens.append(f"{last_dept} {token}")
                continue

            if token in ('AND', 'OR', '(', ')'):
                tokens.append(token)
    
    # Filter out orphan operators - operators that don't connect to courses
    # This removes noise like "OR" from "grade of C- or better"
    cleaned_tokens = []
    for i, token in enumerate(tokens):
        if token in ('AND', 'OR'):
            # Keep operator if it has a valid token before and after it
            has_valid_before = i > 0 and tokens[i-1] not in ('AND', 'OR') and not tokens[i-1].startswith('COUNT:')
            has_valid_after = i < len(tokens) - 1 and tokens[i+1] not in ('AND', 'OR')
            if has_valid_before and has_valid_after:
                cleaned_tokens.append(token)
        else:
            cleaned_tokens.append(token)

    # Some catalog strings drop connectors after cleanup (e.g., grade clauses),
    # leaving adjacent course tokens. Treat adjacent operands as implicit AND.
    with_implicit_ands: List[str] = []

    def is_course_token(token: str) -> bool:
        return bool(re.match(r'^[A-Z]{2,6}\s+\d{3,4}[A-Z]?$', token))

    for token in cleaned_tokens:
        if with_implicit_ands:
            prev = with_implicit_ands[-1]
            prev_is_operand = is_course_token(prev) or prev == ')'
            curr_is_operand = is_course_token(token) or token == '(' or token.startswith('COUNT:')
            if prev_is_operand and curr_is_operand:
                with_implicit_ands.append('AND')

        with_implicit_ands.append(token)

    return with_implicit_ands


def parse_prerequisite_tree(tokens: List[str]) -> Optional[Any]:
    """Parse tokens into a tree structure using recursive descent parser"""
    if not tokens:
        return None
    
    class Parser:
        def __init__(self, tokens):
            self.tokens = tokens
            self.pos = 0
        
        def peek(self) -> Optional[str]:
            if self.pos < len(self.tokens):
                return self.tokens[self.pos]
            return None
        
        def consume(self) -> Optional[str]:
            token = self.peek()
            if token:
                self.pos += 1
            return token
        
        def parse_expression(self) -> Optional[Any]:
            """Parse AND expression (lowest precedence)."""
            left = self.parse_and_expression()
            if not left:
                return None

            children: List[Any] = []
            seen_keys = set()

            def child_key(node: Any):
                if isinstance(node, CourseNode):
                    return ('course', node.code)
                if isinstance(node, MajorRequirementNode):
                    return ('major', node.requirement)
                if isinstance(node, ProgramRequirementNode):
                    return ('program', node.requirement)
                if isinstance(node, YearRequirementNode):
                    return ('year', node.requirement)
                if isinstance(node, SchoolRequirementNode):
                    return ('school', node.requirement)
                if hasattr(node, 'to_dict'):
                    return json.dumps(node.to_dict(), sort_keys=True)
                return str(node)

            def add_and_child(node: Any) -> None:
                if isinstance(node, OperatorNode) and node.type == 'AND':
                    for nested in node.children:
                        key = child_key(nested)
                        if key in seen_keys:
                            continue
                        seen_keys.add(key)
                        children.append(nested)
                else:
                    key = child_key(node)
                    if key in seen_keys:
                        return
                    seen_keys.add(key)
                    children.append(node)

            add_and_child(left)

            while self.peek() == 'AND':
                self.consume()  # consume 'AND'
                right = self.parse_and_expression()
                if right:
                    add_and_child(right)

            if len(children) == 1:
                return children[0]
            return OperatorNode(type='AND', children=children)
        
        def parse_and_expression(self) -> Optional[Any]:
            """Parse OR expression (higher precedence)."""
            left = self.parse_or_expression()
            if not left:
                return None

            children: List[Any] = []
            seen_keys = set()

            def child_key(node: Any):
                if isinstance(node, CourseNode):
                    return ('course', node.code)
                if isinstance(node, MajorRequirementNode):
                    return ('major', node.requirement)
                if isinstance(node, ProgramRequirementNode):
                    return ('program', node.requirement)
                if isinstance(node, YearRequirementNode):
                    return ('year', node.requirement)
                if isinstance(node, SchoolRequirementNode):
                    return ('school', node.requirement)
                if hasattr(node, 'to_dict'):
                    return json.dumps(node.to_dict(), sort_keys=True)
                return str(node)

            def add_or_child(node: Any) -> None:
                if isinstance(node, OperatorNode) and node.type == 'OR':
                    for nested in node.children:
                        key = child_key(nested)
                        if key in seen_keys:
                            continue
                        seen_keys.add(key)
                        children.append(nested)
                else:
                    key = child_key(node)
                    if key in seen_keys:
                        return
                    seen_keys.add(key)
                    children.append(node)

            add_or_child(left)

            while self.peek() == 'OR':
                self.consume()  # consume 'OR'
                right = self.parse_or_expression()
                if right:
                    add_or_child(right)

            if len(children) == 1:
                return children[0]
            return OperatorNode(type='OR', children=children)

        def parse_or_expression(self) -> Optional[Any]:
            """Parse primary expression."""
            left = self.parse_primary()

            return left
        
        def parse_primary(self) -> Optional[Any]:
            """Parse primary expression (course, count constraint, or parenthesized expression)"""
            token = self.peek()
            
            # Handle COUNT token
            if token and token.startswith('COUNT:'):
                count_str = token.split(':')[1]
                count = int(count_str)
                self.consume()
                
                # Collect courses until we hit end or a low-precedence operator outside parens
                children = []
                paren_depth = 0
                
                while self.peek():
                    next_token = self.peek()
                    
                    # Track parentheses depth
                    if next_token == '(':
                        paren_depth += 1
                    elif next_token == ')':
                        paren_depth -= 1
                    
                    # Stop if we hit AND at top level (outside parens)
                    if next_token == 'AND' and paren_depth == 0:
                        break
                    
                    # Parse one expression and add to children
                    if paren_depth == 0:
                        # Parse at OR level to collect alternatives until AND
                        child = self.parse_and_expression()
                    else:
                        child = self.parse_primary()
                    
                    if child:
                        children.append(child)
                    else:
                        break
                
                if children:
                    return CountNode(type='count', count=count, children=children)
                return None
            
            if token == '(':
                self.consume()  # consume '('
                expr = self.parse_expression()
                if self.peek() == ')':
                    self.consume()  # consume ')'
                return expr
            
            # Check if it's a course code
            if token and re.match(COURSE_CODE_PATTERN, token):
                self.consume()
                return CourseNode(type='course', code=token)
            
            return None
    
    parser = Parser(tokens)
    tree = parser.parse_expression()
    return tree


def prune_self_reference(node: Optional[Any], owner_course_code: str) -> Optional[Any]:
    """Remove self-referential course nodes and collapse single-child operators."""
    if node is None:
        return None

    owner = owner_course_code.upper().strip()

    if isinstance(node, CourseNode):
        return None if node.code.upper() == owner else node

    if isinstance(node, OperatorNode):
        pruned_children = []
        for child in node.children:
            pruned = prune_self_reference(child, owner_course_code)
            if pruned is not None:
                pruned_children.append(pruned)

        if not pruned_children:
            return None
        if len(pruned_children) == 1:
            return pruned_children[0]

        node.children = pruned_children
        return node

    if isinstance(node, CountNode):
        pruned_children = []
        for child in node.children:
            pruned = prune_self_reference(child, owner_course_code)
            if pruned is not None:
                pruned_children.append(pruned)

        if not pruned_children:
            return None

        node.children = pruned_children
        return node

    return node


def collect_course_codes(node: Optional[Any]) -> set[str]:
    """Collect all course leaf codes from a requirement tree."""
    if node is None:
        return set()

    if isinstance(node, CourseNode):
        return {normalize_course_code(node.code)}

    if isinstance(node, OperatorNode) or isinstance(node, CountNode):
        collected: set[str] = set()
        for child in node.children:
            collected.update(collect_course_codes(child))
        return collected

    return set()


def remove_course_codes(node: Optional[Any], blocked_codes: set[str]) -> Optional[Any]:
    """Remove specified course leaves from a requirement tree and prune empties."""
    if node is None:
        return None

    if isinstance(node, CourseNode):
        return None if normalize_course_code(node.code) in blocked_codes else node

    if isinstance(node, OperatorNode):
        pruned_children: List[Any] = []
        for child in node.children:
            pruned = remove_course_codes(child, blocked_codes)
            if pruned is not None:
                pruned_children.append(pruned)

        if not pruned_children:
            return None
        if len(pruned_children) == 1:
            return pruned_children[0]

        node.children = pruned_children
        return node

    if isinstance(node, CountNode):
        pruned_children: List[Any] = []
        for child in node.children:
            pruned = remove_course_codes(child, blocked_codes)
            if pruned is not None:
                pruned_children.append(pruned)

        if not pruned_children:
            return None

        node.children = pruned_children
        node.count = min(node.count, len(pruned_children))
        if node.count <= 0:
            return None
        return node

    return node


def build_course_requirement_tree(
    course_code: str,
    snippets: List[str],
    equivalent_course_map: Dict[str, List[str]],
) -> Optional[Any]:
    """Build a course-only requirement tree from a list of labeled snippets."""

    def node_key(node: Any) -> str:
        if isinstance(node, CourseNode):
            return f"course:{node.code.upper()}"
        if hasattr(node, 'to_dict'):
            return json.dumps(node.to_dict(), sort_keys=True)
        return str(node)

    combined_children: List[Any] = []
    seen_children = set()

    for requirement_text in snippets:
        courses = extract_course_codes(requirement_text)
        if not courses:
            continue

        tokens = tokenize_prerequisite(requirement_text)
        course_tree = parse_prerequisite_tree(tokens)
        course_tree = expand_equivalent_courses(course_tree, equivalent_course_map)
        course_tree = prune_self_reference(course_tree, course_code)

        if course_tree is None:
            continue

        if isinstance(course_tree, OperatorNode) and course_tree.type == 'AND':
            nodes_to_add = course_tree.children
        else:
            nodes_to_add = [course_tree]

        for node in nodes_to_add:
            key = node_key(node)
            if key in seen_children:
                continue
            seen_children.add(key)
            combined_children.append(node)

    if not combined_children:
        return None
    if len(combined_children) == 1:
        return combined_children[0]
    return OperatorNode(type='AND', children=combined_children)


def build_other_requirement_tree(texts: List[str]) -> Optional[Any]:
    """Build a non-course enrollment-restriction tree from relevant snippets."""

    def node_key(node: Any) -> str:
        if isinstance(node, MajorRequirementNode):
            return f"major:{normalize_requirement_text(node.requirement).lower()}"
        if isinstance(node, ProgramRequirementNode):
            return f"program:{normalize_requirement_text(node.requirement).lower()}"
        if isinstance(node, YearRequirementNode):
            return f"year:{normalize_requirement_text(node.requirement).lower()}"
        if isinstance(node, SchoolRequirementNode):
            return f"school:{normalize_requirement_text(node.requirement).lower()}"
        if hasattr(node, 'to_dict'):
            return json.dumps(node.to_dict(), sort_keys=True)
        return str(node)

    combined_children: List[Any] = []
    seen_children = set()

    for text in texts:
        for node in extract_major_program_requirements(text):
            key = node_key(node)
            if key in seen_children:
                continue
            seen_children.add(key)
            combined_children.append(node)

    year_or_sets = []
    for index, node in enumerate(combined_children):
        if not isinstance(node, OperatorNode) or node.type != 'OR':
            continue
        if not node.children or not all(isinstance(child, YearRequirementNode) for child in node.children):
            continue
        normalized_years = {
            normalize_requirement_text(child.requirement).lower()
            for child in node.children
        }
        year_or_sets.append((index, normalized_years))

    if year_or_sets:
        covered_standalone_years = set().union(*(years for _, years in year_or_sets))
        subsumed_or_indexes = set()
        for index, years in year_or_sets:
            for other_index, other_years in year_or_sets:
                if index == other_index:
                    continue
                if years < other_years:
                    subsumed_or_indexes.add(index)
                    break

        filtered_children = []
        for index, node in enumerate(combined_children):
            if isinstance(node, YearRequirementNode):
                normalized = normalize_requirement_text(node.requirement).lower()
                if normalized in covered_standalone_years:
                    continue
            if index in subsumed_or_indexes:
                continue
            filtered_children.append(node)
        combined_children = filtered_children

    if not combined_children:
        return None
    if len(combined_children) == 1:
        return combined_children[0]
    return OperatorNode(type='AND', children=combined_children)


def process_course_requirements(
    course_code: str,
    description: str,
    enrollment_requirements: str,
    equivalent_course_map: Dict[str, List[str]],
) -> Tuple[Optional[Any], Optional[Any], Optional[Any]]:
    """Process a single course and return separate prerequisite, corequisite, and other-requirement trees."""

    categorized_snippets = extract_requirement_snippets(description, enrollment_requirements)
    prerequisite_snippets = [snippet for kind, snippet in categorized_snippets if kind == 'prerequisite']
    corequisite_snippets = [snippet for kind, snippet in categorized_snippets if kind == 'corequisite']
    all_requirement_texts = []
    if enrollment_requirements.strip():
        all_requirement_texts.append(enrollment_requirements)
    all_requirement_texts.extend(snippet for _, snippet in categorized_snippets)

    prerequisite_tree = build_course_requirement_tree(
        course_code,
        prerequisite_snippets,
        equivalent_course_map,
    )
    corequisite_tree = build_course_requirement_tree(course_code, corequisite_snippets, equivalent_course_map)

    # Prevent impossible duplication: a specific course should not be both
    # prerequisite and corequisite for the same catalog course.
    if prerequisite_tree is not None and corequisite_tree is not None:
        overlapping_codes = collect_course_codes(prerequisite_tree).intersection(collect_course_codes(corequisite_tree))
        if overlapping_codes:
            prerequisite_tree = remove_course_codes(prerequisite_tree, overlapping_codes)

    other_requirement_tree = build_other_requirement_tree(all_requirement_texts)
    return prerequisite_tree, corequisite_tree, other_requirement_tree


def process_course_row(
    row: Dict[str, str],
    equivalent_course_map: Dict[str, List[str]],
) -> Tuple[str, Optional[Any], Optional[Any], bool, bool]:
    """Worker function to process a single course row"""
    course_code = row.get('course_code', '').strip()
    description = row.get('description', '').strip()
    enrollment_requirements = row.get('enrollment_requirements', '').strip()
    
    if not course_code:
        return '', None, None, None, False, False, False
    
    prerequisite_tree, corequisite_tree, other_requirement_tree = process_course_requirements(
        course_code,
        description,
        enrollment_requirements,
        equivalent_course_map,
    )
    has_prereq = prerequisite_tree is not None
    has_coreq = corequisite_tree is not None
    has_other = other_requirement_tree is not None
    
    return (
        course_code,
        prerequisite_tree.to_dict() if prerequisite_tree and hasattr(prerequisite_tree, 'to_dict') else prerequisite_tree,
        corequisite_tree.to_dict() if corequisite_tree and hasattr(corequisite_tree, 'to_dict') else corequisite_tree,
        other_requirement_tree.to_dict() if other_requirement_tree and hasattr(other_requirement_tree, 'to_dict') else other_requirement_tree,
        has_prereq,
        has_coreq,
        has_other,
    )


def main():
    """Main function to process all courses"""
    # Read JSON file into memory
    json_file = "data/uva_course_details.json"
    rows = []
    
    try:
        with open(json_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
            # Convert JSON structure to rows format
            # Assuming the JSON has courses as objects with course_code, description, enrollment_requirements
            if isinstance(data, dict) and 'courses' in data:
                # If it's a dict with 'courses' key
                rows = [
                    {
                        'course_code': course.get('code', ''),
                        'description': course.get('description', ''),
                        'enrollment_requirements': course.get('enrollment_requirements', '')
                    }
                    for course in data.get('courses', [])
                ]
            elif isinstance(data, list):
                # If it's directly a list of courses
                rows = [
                    {
                        'course_code': course.get('code', course.get('course_code', '')),
                        'description': course.get('description', ''),
                        'enrollment_requirements': course.get('enrollment_requirements', course.get('requirements', ''))
                    }
                    for course in data
                ]
            else:
                # Fallback: treat as a dict of courses keyed by course code
                rows = [
                    {
                        'course_code': code,
                        'description': course.get('description', ''),
                        'enrollment_requirements': course.get('enrollment_requirements', course.get('requirements', ''))
                    }
                    for code, course in data.items()
                    if isinstance(course, dict)
                ]
    except FileNotFoundError:
        print(f"Error: {json_file} not found")
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(f"Error parsing JSON: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"Error reading JSON file: {e}")
        sys.exit(1)
    
    if not rows:
        print("Error: No course data found in JSON file")
        sys.exit(1)
    
    equivalent_course_map = build_equivalent_course_map(rows)

    courses_with_prereqs = {}
    courses_with_coreqs = {}
    courses_with_other_requirements = {}
    courses_without_prereqs = []
    courses_without_coreqs = []
    courses_without_other_requirements = []
    
    error_count = 0

    for row in rows:
        try:
            course_code, prereq_tree, coreq_tree, other_tree, has_prereq, has_coreq, has_other = process_course_row(row, equivalent_course_map)

            if not course_code:
                continue

            if prereq_tree and has_prereq:
                courses_with_prereqs[course_code] = prereq_tree
            else:
                courses_without_prereqs.append(course_code)

            if coreq_tree and has_coreq:
                courses_with_coreqs[course_code] = coreq_tree
            else:
                courses_without_coreqs.append(course_code)

            if other_tree and has_other:
                courses_with_other_requirements[course_code] = other_tree
            else:
                courses_without_other_requirements.append(course_code)

        except Exception:
            error_count += 1
            continue
    
    # Save results to JSON
    output_data = {
        "metadata": {
            "total_courses": len(courses_with_prereqs) + len(courses_without_prereqs),
            "courses_with_prerequisites": len(courses_with_prereqs),
            "courses_without_prerequisites": len(courses_without_prereqs),
            "courses_with_corequisites": len(courses_with_coreqs),
            "courses_without_corequisites": len(courses_without_coreqs),
            "courses_with_other_requirements": len(courses_with_other_requirements),
            "courses_without_other_requirements": len(courses_without_other_requirements),
        },
        "prerequisite_trees": courses_with_prereqs,
        "corequisite_trees": courses_with_coreqs,
        "other_requirement_trees": courses_with_other_requirements,
        "courses_without_prerequisites": courses_without_prereqs,
        "courses_without_corequisites": courses_without_coreqs,
        "courses_without_other_requirements": courses_without_other_requirements,
    }
    
    output_file = "data/uva_prerequisites.json"
    try:
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(output_data, f, indent=2, ensure_ascii=False)
    except Exception as e:
        print(f"Error saving to JSON: {e}")
        sys.exit(1)

    print(
        f"Done: {output_data['metadata']['total_courses']} courses | "
        f"with prereqs: {output_data['metadata']['courses_with_prerequisites']} | "
        f"without prereqs: {output_data['metadata']['courses_without_prerequisites']} | "
        f"errors: {error_count} | output: {output_file}"
    )


if __name__ == "__main__":
    main()
