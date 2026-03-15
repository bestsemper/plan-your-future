#!/usr/bin/env python3
import json

# Find courses with count patterns
with open('data/uva_course_details.json') as f:
    courses = json.load(f)
    courses_with_counts = {}
    for course in courses:
        req = course.get('enrollment_requirements', '')
        if 'of the following' in req.lower():
            code = course.get('course_code')
            courses_with_counts[code] = req[:200]

print(f"Found {len(courses_with_counts)} courses with 'of the following' pattern")
print("\nSample courses with count requirements:")
for i, (code, req) in enumerate(list(courses_with_counts.items())[:5]):
    print(f"\n{code}:\n  {req}...")

# Now check the output
print("\n\n" + "="*80)
print("Checking generated prerequisite trees for these courses:")
print("="*80)
with open('data/uva_prerequisites.json') as f:
    data = json.load(f)
    trees = data['prerequisite_trees']
    
    for code in list(courses_with_counts.keys())[:3]:
        if code in trees:
            print(f"\n{code}:")
            print(json.dumps(trees[code], indent=2))
        else:
            print(f"\n{code}: NOT FOUND IN PREREQUISITE TREES")

# Search for any count nodes in the entire tree
print("\n\n" + "="*80)
print("Searching for COUNT nodes in all prerequisite trees...")
print("="*80)

def find_count_nodes(node, path=""):
    results = []
    if isinstance(node, dict):
        if node.get('type') == 'count':
            results.append((path, node))
        if 'children' in node:
            for i, child in enumerate(node['children']):
                results.extend(find_count_nodes(child, f"{path}[{i}]"))
    return results

count_found = 0
for course_code, tree in trees.items():
    count_nodes = find_count_nodes(tree)
    if count_nodes:
        count_found += 1
        if count_found <= 3:  # Show first 3 examples
            print(f"\n{course_code}:")
            print(json.dumps(tree, indent=2))

print(f"\n\nTotal courses with COUNT nodes: {count_found}")
