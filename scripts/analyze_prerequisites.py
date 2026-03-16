#!/usr/bin/env python3
import json
import re
from collections import defaultdict

with open('data/uva_course_details.json', 'r') as f:
    courses = json.load(f)

# Collect different types of requirements
edge_cases = defaultdict(list)
patterns = {
    'corequisite': r'corequisite|co-requisite|concurrent',
    'or_equivalent': r'or equivalent|equivalent|or better',
    'or_permission': r'or (?:instructor|faculty|department) permission',
    'major_requirement': r'(?:major|concentration|minor) requirement',
    'department_specific': r'(?:major|concentration|minor) in',
    'or_clause': r'\s+or\s+[A-Z]{2,}',
    'enrollment_restriction': r'must (?:be|have|enroll)',
    'general_education': r'(?:GE|general education|core)',
    'credit_hours': r'\d+\s+(?:credit|unit)',
    'year_requirement': r'(?:first|second|third|fourth|junior|senior|upper|lower)\s+(?:year|level)',
    'consent_required': r'(?:consent|approval|permission) (?:of|from)',
    'multiple_options': r'(?:any of|one of|either)',
    'combined_requirement': r'and.*?(?:or|and)',
}

all_non_empty = 0
for course in courses:
    req = course.get('enrollment_requirements', '').strip()
    if req:
        all_non_empty += 1
    
    if not req:
        continue
    
    for pattern_name, pattern in patterns.items():
        if re.search(pattern, req, re.IGNORECASE):
            edge_cases[pattern_name].append({
                'code': course['course_code'],
                'title': course['title'][:70],
                'requirement': req[:150]
            })

# Print results
print("\n" + "="*100)
print("COURSE REQUIREMENTS EDGE CASE ANALYSIS")
print("="*100)
print(f"\nTotal courses with non-empty requirements: {all_non_empty}")

for pattern_name in sorted(edge_cases.keys()):
    cases = edge_cases[pattern_name]
    print(f"\n{'-'*100}")
    print(f"PATTERN: {pattern_name.upper()} ({len(cases)} courses)")
    print(f"{'-'*100}")
    # Show first 5 examples
    for i, case in enumerate(cases[:5]):
        print(f"\n  {i+1}. {case['code']}")
        print(f"     Title: {case['title']}")
        print(f"     Requirement: {case['requirement']}")
    if len(cases) > 5:
        print(f"\n  ... and {len(cases) - 5} more courses")

print("\n" + "="*100)
print("SUMMARY BY PATTERN COUNT")
print("="*100)
sorted_patterns = sorted(edge_cases.items(), key=lambda x: len(x[1]), reverse=True)
for pattern_name, cases in sorted_patterns:
    print(f"{pattern_name:.<30} {len(cases):>6} courses")