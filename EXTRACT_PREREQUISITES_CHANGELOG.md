# Extract Prerequisites Enhancement Summary

## Changes Made

### 1. **JSON File Parsing**
- Changed script to read from `data/uva_course_details.json` (list of 9,433 courses)
- Previously read from CSV file with explicit structure
- Handles multiple JSON formats (list, dict with 'courses' key, nested dicts)
- Uses correct field names: `course_code`, `description`, `enrollment_requirements`

### 2. **Complex Count Logic Support**
Added new `CountNode` class to represent "N of the following" constraints:
```python
@dataclass
class CountNode:
    type: str = "count"
    count: int = 1  # How many courses are required
    children: List[Any] = None
```

### 3. **Enhanced Pattern Detection**
Improved `COUNT_OF_PATTERN` regex to detect:
- Numeric patterns: "2 of the following", "at least 3 from"
- Word patterns: "ONE of the following", "TWO of these"
- Flexible matching: "of the following", "of these", "from the following", etc.

Regex pattern:
```
(?:(?:at\s+least\s+)?(\d+)|(?:one|two|three|...|ten))\s+
(?:of\s+(?:the\s+)?(?:following|these)|from\s+(?:the\s+)?(?:following|these))
```

### 4. **Tokenization Improvements**
- Converts word numbers ("ONE", "TWO") to digits before tokenization
- Inserts COUNT token at beginning of token stream
- Maintains proper operator precedence with AND/OR logic
- Filters orphan operators that aren't connected to actual requirements

### 5. **Parser Enhancement**
Extended `parse_prerequisite_tree()` with COUNT token handling:
- Recognizes `COUNT:N` tokens
- Collects all courses following count token into children list
- Stops at OR operators at top level (respects operator precedence)
- Supports nested structures: `(COUNT within AND/OR expressions)`

## Results

**Execution Output:**
- ✅ Processed: 9,433 courses
- ✅ Prerequisites found: 1,653 courses
- ✅ Without prerequisites: 7,780 courses
- ✅ Errors: 0

**COUNT Node Examples:**

### Example 1: BIOL 4260 - "ONE of the following"
```json
{
  "type": "OR",
  "children": [
    {
      "type": "count",
      "count": 1,
      "children": [
        {"type": "course", "code": "BIOL 3010"},
        {"type": "course", "code": "BIOL 3030"},
        {"type": "course", "code": "BIOL 3050"},
        {"type": "course", "code": "BIOL 3240"},
        {"type": "course", "code": "CHEM 4410"}
      ]
    },
    {"type": "course", "code": "CHEM 4440"}
  ]
}
```

### Example 2: DS 4023 - Complex with COUNT
```json
{
  "type": "OR",
  "children": [
    {
      "type": "count",
      "count": 1,
      "children": [
        {"type": "course", "code": "DS 1002"},
        {"type": "course", "code": "DS 2001"},
        {"type": "course", "code": "CS 1110"},
        {"type": "course", "code": "CS 1111"},
        {"type": "course", "code": "CS 1112"},
        {"type": "course", "code": "CS 2110"}
      ]
    },
    {"type": "course", "code": "PHYS 1655"}
  ]
}
```

**Statistics:**
- Courses with COUNT nodes: 22
- Courses with traditional AND/OR logic: 1,631
- Courses without any prerequisites: 7,780

## Tree Structure Capabilities

The parser now supports:
1. **Simple prerequisites**: `CS 1110` → `CourseNode`
2. **Boolean logic**: `CS 1110 AND MATH 2310` → `OperatorNode(AND, [CourseNode, CourseNode])`
3. **Complex OR**: `A OR B OR (C AND D)` → Nested operators with proper precedence
4. **Count constraints**: `2 of {A, B, C}` → `CountNode(count=2, children=[A, B, C])`
5. **Mixed logic**: `Prerequisites AND (1 of {A, B, C})` → Deeply nested structure

## Output File

- **Location**: `data/uva_prerequisites.json`
- **Format**: JSON with metadata and prerequisite trees
- **Size**: ~500KB+ (depending on tree complexity)
- **Structure**:
  ```json
  {
    "metadata": {
      "total_courses": 9433,
      "courses_with_prerequisites": 1653,
      "courses_without_prerequisites": 7780
    },
    "prerequisite_trees": {
      "COURSE_CODE": {...tree structure...},
      ...
    },
    "prerequisite_words_by_course": {...},
    "courses_without_prerequisites": [...]
  }
  ```

## Next Steps (Recommendations)

1. **UI Integration**: Modify plan page to handle COUNT nodes in prerequisite checking
2. **Validation**: Add function to evaluate COUNT constraints (e.g., "has 2 of these 5 courses?")
3. **Edge Cases**: Handle "at least" vs "exactly" distinction for count nodes
4. **Complex Numbers**: Add support for higher count numbers (currently handles up to "ten")
5. **Nested Counts**: Test deeply nested count constraints within AND/OR logic
