#!/usr/bin/env python3
import csv
import json
import re
from collections import defaultdict
from pathlib import Path
from typing import Any, Dict, List, Optional

def parse_audit_requirements(csv_path: str):
    """Parse CSV and generate requirements.json with structured constraints"""
    
    programs = defaultdict(lambda: defaultdict(lambda: defaultdict(lambda: {
        'id': None, 'name': None, 'level': None, 'parent_id': None,
        'constraint_raw': [], 'constraints': []
    })))
    
    with open(csv_path, 'r') as f:
        reader = csv.DictReader(f)
        for row in reader:
            program_code = row['Program Code']
            audit_year = row['Audit Start Entry Year']
            req_id = row['Requirement ID']
            constraint_text = row['Constraint'].strip() if row['Constraint'] else ''
            
            # Get or create requirement
            req = programs[program_code][audit_year][req_id]
            
            # Set static fields (should be same across all rows for same ID)
            if req['id'] is None:
                req['id'] = req_id
                req['name'] = row['Requirement Name']
                req['level'] = int(row['Subrequirement Level'])
                req['parent_id'] = row['Parent Requirement ID'] or None
            
            # Accumulate constraints
            if constraint_text:
                req['constraint_raw'].append(constraint_text)
                parsed = parse_constraints(constraint_text)
                req['constraints'].extend(parsed)
    
    # Convert to list format and deduplicate constraints
    deduped_programs = {}
    for program_code, audits in programs.items():
        deduped_programs[program_code] = {}
        for audit_year, req_dict in audits.items():
            reqs_list = []
            for req_id, req_data in req_dict.items():
                # Deduplicate constraints by type and value
                unique_constraints = []
                seen = set()
                for c in req_data['constraints']:
                    constraint_key = json.dumps(c, sort_keys=True)
                    if constraint_key not in seen:
                        unique_constraints.append(c)
                        seen.add(constraint_key)
                
                reqs_list.append({
                    'id': req_data['id'],
                    'name': req_data['name'],
                    'level': req_data['level'],
                    'parent_id': req_data['parent_id'],
                    'constraint_raw': ' | '.join(req_data['constraint_raw']),
                    'constraints': unique_constraints,
                })
            deduped_programs[program_code][audit_year] = reqs_list
    
    # Build trees
    output = {}
    for program_code, audits in deduped_programs.items():
        output[program_code] = {}
        for audit_year, reqs in audits.items():
            output[program_code][audit_year] = build_tree(reqs)
    
    # Save single file
    output_path = Path('data/requirements.json')
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    with open(output_path, 'w') as f:
        json.dump(output, f, indent=2)
    
    # Stats
    num_programs = len(output)
    num_requirements = sum(
        len(reqs) 
        for audits in output.values() 
        for reqs in audits.values()
    )
    
    print(f"✓ Generated data/requirements.json")
    print(f"  • {num_programs} programs")
    print(f"  • ~{num_requirements} total requirements")

def parse_constraints(constraint_text: str) -> List[Dict[str, Any]]:
    """Convert constraint string to structured rules"""
    
    if not constraint_text:
        return []
    
    constraints = []
    
    # Min units
    if match := re.search(r'At least (\d+(?:\.\d+)?)\s*units? in total', constraint_text):
        constraints.append({
            'type': 'min_units',
            'value': float(match.group(1))
        })
    
    # Max units
    if match := re.search(r'Take at most (\d+(?:\.\d+)?)\s*units', constraint_text):
        constraints.append({
            'type': 'max_units',
            'value': float(match.group(1))
        })
    
    # Exact units
    if match := re.search(r'Take exactly (\d+(?:\.\d+)?)\s*units', constraint_text):
        constraints.append({
            'type': 'exact_units',
            'value': float(match.group(1))
        })
    
    # Min courses
    if match := re.search(r'Take at least (\d+)\s*courses?', constraint_text):
        constraints.append({
            'type': 'min_courses',
            'value': int(match.group(1))
        })
    
    # Max courses
    if match := re.search(r'Take at most (\d+)\s*courses?', constraint_text):
        constraints.append({
            'type': 'max_courses',
            'value': int(match.group(1))
        })
    
    # Exactly N courses
    if match := re.search(r'Repeat ([A-Z0-9\s]+) at least (\d+) times', constraint_text):
        course = match.group(1).strip()
        times = int(match.group(2))
        constraints.append({
            'type': 'repeat_course',
            'course': course,
            'times': times
        })
    
    # Course set
    if 'Course within this set of courses:' in constraint_text:
        match = re.search(
            r'Course within this set of courses:\s*([A-Z0-9\s,]+?)(?:\n|\Z)',
            constraint_text,
            re.MULTILINE
        )
        if match:
            courses_str = match.group(1).strip()
            courses = [c.strip() for c in courses_str.split(',') if c.strip()]
            if courses:
                constraints.append({
                    'type': 'course_set',
                    'courses': courses
                })
    
    # Course range
    if 'Course within one of these ranges:' in constraint_text:
        matches = re.findall(r'([A-Z]+)\s+(\d+)-([A-Z]+)\s+(\d+)', constraint_text)
        if matches:
            for match in matches:
                constraints.append({
                    'type': 'course_range',
                    'start_prefix': match[0],
                    'start_num': int(match[1]),
                    'end_prefix': match[2],
                    'end_num': int(match[3])
                })
    
    # GPA requirement
    if match := re.search(r'Greater than or equal to ([\d.]+)\s*gpa', constraint_text):
        constraints.append({
            'type': 'min_gpa',
            'value': float(match.group(1))
        })
    
    # No Credit/No Credit
    if 'Credit/No Credit may not count' in constraint_text:
        constraints.append({
            'type': 'no_cr_nc'
        })
    
    # If any constraints were found, return them
    if constraints:
        return constraints
    
    # Otherwise store raw text for manual review
    return [{'type': 'text', 'raw': constraint_text}]

def build_tree(requirements: list) -> list:
    """Build parent-child hierarchy from flat list"""
    by_id = {
        r['id']: {
            'id': r['id'],
            'name': r['name'],
            'level': r['level'],
            'parent_id': r['parent_id'],
            'constraint_raw': r['constraint_raw'],
            'constraints': r['constraints'],
            'children': []
        }
        for r in requirements
    }
    
    roots = []
    
    for req in requirements:
        if req['parent_id'] and req['parent_id'] in by_id:
            by_id[req['parent_id']]['children'].append(by_id[req['id']])
        elif not req['parent_id']:
            roots.append(by_id[req['id']])
    
    return roots

if __name__ == '__main__':
    parse_audit_requirements('data/audit_requirements.csv')
