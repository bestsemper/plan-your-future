#!/usr/bin/env python3
import json
import re
from collections import Counter, defaultdict
from pathlib import Path

COURSE_CODE_PATTERN = re.compile(r'\b([A-Z]{2,6})\s*(\d{4}[A-Z]?)\b')
RESTRICTION_PATTERN = re.compile(
    r'\b(?:may\s+not\s+enroll\s+if|cannot\s+enroll\s+if|can\'t\s+enroll\s+if|credit\s+not\s+granted(?:\s+for)?|not\s+open\s+to|restricted\s+to)\b',
    re.IGNORECASE,
)
NOT_RESTRICTION_PATTERN = re.compile(
    r'\b(?:may\s+not\s+enroll\s+if|cannot\s+enroll\s+if|can\'t\s+enroll\s+if|credit\s+not\s+granted(?:\s+for)?|not\s+open\s+to)\b',
    re.IGNORECASE,
)
PATTERNS = {
    'corequisite_language': re.compile(
        r'\b(?:coreq(?:s)?|corequisite(?:s)?|co[-\s]?requisite(?:s)?|concurrent(?:ly)?|currently\s+enrolled|must\s+be\s+taken\s+concurrently|or\s+currently\s+enrolled)\b',
        re.IGNORECASE,
    ),
    'restriction_language': RESTRICTION_PATTERN,
    'permission_language': re.compile(
        r'\b(?:instructor(?:\'s)?\s+(?:permission|consent)|permission\s+of\s+(?:the\s+)?(?:instructor|chair|department\s+chair|program\s+director|director|committee)|department\s+permission|faculty\s+permission|consent\s+of|approval\s+of|permission\s+by\s+audition)\b',
        re.IGNORECASE,
    ),
    'count_language': re.compile(
        r'\b(?:one|two|three|four|five|six|\d+)\s+of\s+(?:the\s+)?following\b|\bat\s+least\s+\d+\s+(?:of\s+)?(?:the\s+)?following\b|\bany\s+(?:one|two|three|four|five|six|\d+)\b',
        re.IGNORECASE,
    ),
    'equivalent_language': re.compile(r'\b(?:or\s+equivalent|equivalent\b|place[-\s]?out\s+test|test\s+score)\b', re.IGNORECASE),
    'general_education_language': re.compile(r'\b(?:general\s+education|gen\s*ed|core\s+curriculum|area\s+requirement|disciplines\s+plus|foundations\s+requirement)\b', re.IGNORECASE),
    'year_standing_language': re.compile(r'\b(?:first|second|third|fourth|fifth|1st|2nd|3rd|4th|5th|junior|senior|graduate)\s+(?:year|standing|student|students)\b', re.IGNORECASE),
    'credit_language': re.compile(r'\b\d+(?:\.\d+)?\s+(?:credit|credits|unit|units|hours?)\b', re.IGNORECASE),
    'mixed_and_or_language': re.compile(r'\band\b.*\bor\b|\bor\b.*\band\b', re.IGNORECASE),
    'cross_list_language': re.compile(r'\b[A-Z]{2,6}\/[A-Z]{2,6}\s*\d{4}[A-Z]?\b'),
    'topic_language': re.compile(r'\btopic\b\s*#?\d*', re.IGNORECASE),
    'grade_language': re.compile(r'\bgrade\s+of\s+[A-F][+-]?\s+or\s+better\b', re.IGNORECASE),
    'level_language': re.compile(r'\b\d{4}\s*[- ]level\b', re.IGNORECASE),
    'semicolon_multi_clause': re.compile(r';'),
}

COURSE_DETAILS_PATH = Path('data/uva_course_details.json')
PARSED_PATH = Path('data/uva_prerequisites.json')
SAMPLE_LIMIT = 8

def normalize_code(value: str) -> str:
    return re.sub(r'\s+', ' ', value.upper()).strip()

def extract_course_codes(text: str) -> list[str]:
    return [f"{subject} {number}" for subject, number in COURSE_CODE_PATTERN.findall(text.upper())]

def walk_tree(node, stats: dict):
    if not node:
        return

    node_type = node.get('type')
    if node_type == 'course':
        code = node.get('code')
        if code:
            stats['course_codes'].add(code)
        if node.get('level'):
            stats['has_level_course'] = True
        return

    if node_type in {'AND', 'OR'}:
        stats['operators'][node_type] += 1
        for child in node.get('children', []):
            walk_tree(child, stats)
        return

    if node_type == 'count':
        stats['count_nodes'] += 1
        for child in node.get('children', []):
            walk_tree(child, stats)
        return

    stats['other_node_types'][node_type] += 1
    requirement = node.get('requirement')
    if requirement:
        stats['other_requirements'].append(requirement)
    for child in node.get('children', []):
        walk_tree(child, stats)

def tree_stats(node) -> dict:
    stats = {
        'course_codes': set(),
        'operators': Counter(),
        'count_nodes': 0,
        'other_node_types': Counter(),
        'other_requirements': [],
        'has_level_course': False,
    }
    walk_tree(node, stats)
    return stats

def add_sample(bucket: dict[str, list[dict]], key: str, sample: dict):
    if len(bucket[key]) < SAMPLE_LIMIT:
        bucket[key].append(sample)

def sample_record(course: dict, requirement: str, detail: str | None = None) -> dict:
    result = {
        'code': course.get('course_code', ''),
        'title': (course.get('title') or '')[:90],
        'requirement': re.sub(r'\s+', ' ', requirement).strip()[:220],
    }
    if detail:
        result['detail'] = detail
    return result

def print_samples(title: str, items: list[dict]):
    print(f"\n{title} ({len(items)} shown)")
    for index, item in enumerate(items, start=1):
        print(f"  {index}. {item['code']} | {item['title']}")
        print(f"     Requirement: {item['requirement']}")
        if item.get('detail'):
            print(f"     Detail: {item['detail']}")

def main():
    with COURSE_DETAILS_PATH.open('r', encoding='utf-8') as handle:
        courses = json.load(handle)

    with PARSED_PATH.open('r', encoding='utf-8') as handle:
        parsed = json.load(handle)

    prereq_trees = parsed.get('prerequisite_trees', {})
    coreq_trees = parsed.get('corequisite_trees', {})
    other_trees = parsed.get('other_requirement_trees', {})

    pattern_counts = Counter()
    suspicious_counts = Counter()
    suspicious_samples = defaultdict(list)
    cooccurrence_counts = Counter()

    courses_with_requirements = 0
    courses_with_course_codes = 0
    courses_with_no_parsed_output = 0

    for course in courses:
        requirement = (course.get('enrollment_requirements') or '').strip()
        if not requirement:
            continue

        courses_with_requirements += 1
        normalized_requirement = re.sub(r'\s+', ' ', requirement).strip()
        code = normalize_code(course.get('course_code', ''))
        raw_course_codes = set(extract_course_codes(normalized_requirement))
        external_raw_course_codes = {course_code for course_code in raw_course_codes if course_code != code}
        if external_raw_course_codes:
            courses_with_course_codes += 1

        prereq_tree = prereq_trees.get(code)
        coreq_tree = coreq_trees.get(code)
        other_tree = other_trees.get(code)

        prereq_stats = tree_stats(prereq_tree) if prereq_tree else tree_stats(None)
        coreq_stats = tree_stats(coreq_tree) if coreq_tree else tree_stats(None)
        other_stats = tree_stats(other_tree) if other_tree else tree_stats(None)
        matched_patterns = []
        for pattern_name, pattern in PATTERNS.items():
            if pattern.search(normalized_requirement):
                pattern_counts[pattern_name] += 1
                matched_patterns.append(pattern_name)

        for left in range(len(matched_patterns)):
            for right in range(left + 1, len(matched_patterns)):
                cooccurrence_counts[(matched_patterns[left], matched_patterns[right])] += 1

        has_any_tree = bool(prereq_tree or coreq_tree or other_tree)
        if external_raw_course_codes and not has_any_tree:
            suspicious_counts['course_codes_but_no_parsed_output'] += 1
            courses_with_no_parsed_output += 1
            add_sample(
                suspicious_samples,
                'course_codes_but_no_parsed_output',
                sample_record(course, normalized_requirement, 'External course codes appear in raw text, but no parsed prerequisite/corequisite/other tree exists.'),
            )

        if 'restriction_language' in matched_patterns and not other_tree:
            suspicious_counts['restriction_without_other_tree'] += 1
            add_sample(
                suspicious_samples,
                'restriction_without_other_tree',
                sample_record(course, normalized_requirement, 'Restriction language detected, but no other_requirement_tree exists.'),
            )

        if 'restriction_language' in matched_patterns and prereq_tree:
            restriction_match = NOT_RESTRICTION_PATTERN.search(normalized_requirement)
            restriction_text = normalized_requirement[restriction_match.start():] if restriction_match else ''
            restriction_course_codes = set(extract_course_codes(restriction_text))
            overlap = sorted(restriction_course_codes.intersection(prereq_stats['course_codes']))
            if overlap:
                suspicious_counts['restriction_leaked_into_prereqs'] += 1
                add_sample(
                    suspicious_samples,
                    'restriction_leaked_into_prereqs',
                    sample_record(course, normalized_requirement, f'Restriction-specific course codes also appear in prerequisite tree: {", ".join(overlap)}'),
                )

        if 'corequisite_language' in matched_patterns and 'restriction_language' not in matched_patterns and external_raw_course_codes and not coreq_tree:
            suspicious_counts['corequisite_language_without_coreq_tree'] += 1
            add_sample(
                suspicious_samples,
                'corequisite_language_without_coreq_tree',
                sample_record(course, normalized_requirement, 'Corequisite/concurrent language detected, but no corequisite tree exists.'),
            )

        has_choice_operator = bool(prereq_stats['operators'].get('OR') or coreq_stats['operators'].get('OR') or other_stats['operators'].get('OR'))
        if 'count_language' in matched_patterns and prereq_stats['count_nodes'] == 0 and coreq_stats['count_nodes'] == 0 and not has_choice_operator:
            suspicious_counts['count_language_without_count_node'] += 1
            add_sample(
                suspicious_samples,
                'count_language_without_count_node',
                sample_record(course, normalized_requirement, 'Count-style language detected, but no count node or equivalent OR-choice structure was produced.'),
            )

        if 'permission_language' in matched_patterns and not other_tree:
            suspicious_counts['permission_language_without_other_tree'] += 1
            add_sample(
                suspicious_samples,
                'permission_language_without_other_tree',
                sample_record(course, normalized_requirement, 'Permission/consent language detected, but no other requirement tree exists.'),
            )

        if 'general_education_language' in matched_patterns and not other_tree:
            suspicious_counts['general_education_without_other_tree'] += 1
            add_sample(
                suspicious_samples,
                'general_education_without_other_tree',
                sample_record(course, normalized_requirement, 'General education language detected, but no other requirement tree exists.'),
            )

        if 'year_standing_language' in matched_patterns and not other_tree:
            suspicious_counts['year_language_without_other_tree'] += 1
            add_sample(
                suspicious_samples,
                'year_language_without_other_tree',
                sample_record(course, normalized_requirement, 'Year/standing language detected, but no other requirement tree exists.'),
            )

        if 'credit_language' in matched_patterns and not other_tree:
            suspicious_counts['credit_language_without_other_tree'] += 1
            add_sample(
                suspicious_samples,
                'credit_language_without_other_tree',
                sample_record(course, normalized_requirement, 'Credit-hour language detected, but no other requirement tree exists.'),
            )

        has_any_operator = bool(prereq_stats['operators'] or coreq_stats['operators'] or other_stats['operators'])
        has_split_semantics = sum(1 for tree in (prereq_tree, coreq_tree, other_tree) if tree) > 1
        if 'mixed_and_or_language' in matched_patterns and not has_any_operator and not has_split_semantics:
            suspicious_counts['mixed_logic_without_operator_tree'] += 1
            add_sample(
                suspicious_samples,
                'mixed_logic_without_operator_tree',
                sample_record(course, normalized_requirement, 'Mixed AND/OR language detected, but parsed trees have no operator nodes or split-tree representation.'),
            )

        if 'level_language' in matched_patterns and not (prereq_stats['has_level_course'] or coreq_stats['has_level_course'] or other_stats['has_level_course']):
            suspicious_counts['level_language_without_level_node'] += 1
            add_sample(
                suspicious_samples,
                'level_language_without_level_node',
                sample_record(course, normalized_requirement, 'Level-based course language detected, but no level course node was produced.'),
            )

    print('\n' + '=' * 100)
    print('DETAILED COURSE REQUIREMENTS AUDIT')
    print('=' * 100)
    print(f'Courses in catalog: {len(courses)}')
    print(f'Courses with non-empty enrollment requirements: {courses_with_requirements}')
    print(f'Courses with explicit course codes in raw requirements: {courses_with_course_codes}')
    print(f'Courses with raw course codes but no parsed output: {courses_with_no_parsed_output}')

    print('\n' + '=' * 100)
    print('RAW EDGE-CASE PATTERN COUNTS')
    print('=' * 100)
    for pattern_name, count in pattern_counts.most_common():
        print(f'{pattern_name:.<45} {count:>6}')

    print('\n' + '=' * 100)
    print('SUSPICIOUS MISMATCH COUNTS')
    print('=' * 100)
    if suspicious_counts:
        for pattern_name, count in suspicious_counts.most_common():
            print(f'{pattern_name:.<45} {count:>6}')
    else:
        print('No suspicious mismatches detected by the current audit rules.')

    if cooccurrence_counts:
        print('\n' + '=' * 100)
        print('TOP PATTERN CO-OCCURRENCES')
        print('=' * 100)
        for (left, right), count in cooccurrence_counts.most_common(15):
            print(f'{left} + {right:.<54} {count:>6}')

    if suspicious_samples:
        print('\n' + '=' * 100)
        print('SAMPLE SUSPICIOUS COURSES')
        print('=' * 100)
        for key, items in sorted(suspicious_samples.items()):
            print_samples(key, items)

if __name__ == '__main__':
    main()