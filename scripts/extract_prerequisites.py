import json
import re
import shutil
from typing import Dict, List, Optional, Any, Tuple
from dataclasses import dataclass, asdict
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
import os

# Regex pattern for course codes (e.g., CS 1110, APMA 1090, etc.)
COURSE_CODE_PATTERN = r'\b([A-Z]{2,6})\s*(\d{4})\b'

# Regex pattern for prerequisite prefix
PREREQ_PREFIX_PATTERN = r'(?:prereq|prerequisite)(?:\s*[:\-]?)\s*'

# Regex pattern for "N of the following" constraints
COUNT_OF_PATTERN = r'(?:(?:at\s+least\s+)?(\d+)|(?:one|two|three|four|five|six|seven|eight|nine|ten))\s+(?:of\s+(?:the\s+)?(?:following|these)|from\s+(?:the\s+)?(?:following|these))'


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


def extract_prerequisite_text(description: str, enrollment_requirements: str) -> Optional[str]:
    """Extract prerequisite text from description or enrollment requirements"""
    # Enrollment requirements takes precedence
    text = enrollment_requirements.strip() if enrollment_requirements.strip() else description.strip()
    
    if not text:
        return None
    
    # Look for prerequisite prefix
    match = re.search(PREREQ_PREFIX_PATTERN, text, re.IGNORECASE)
    if match:
        # Return text starting from the prerequisite mention
        return text[match.start():]
    
    # If no explicit prefix, check if the text contains course codes
    # This handles cases where prerequisites are listed without "prereq:" prefix
    if extract_course_codes(text):
        return text
    
    return None


def extract_course_codes(text: str) -> List[str]:
    """Extract all course codes from text"""
    matches = re.findall(COURSE_CODE_PATTERN, text)
    return [f"{code[0]} {code[1]}" for code in matches]


def extract_words_after_prefix(text: str) -> List[str]:
    """Extract all words that appear in prerequisite text after the prefix"""
    match = re.search(PREREQ_PREFIX_PATTERN, text, re.IGNORECASE)
    if not match:
        return []
    
    # Remove course codes and get remaining words
    remaining_text = text[match.end():]
    words = re.findall(r'\b[a-zA-Z]+\b', remaining_text.lower())
    
    # Filter out common conjunctions and prepositions (already handled)
    stop_words = {'and', 'or', 'with', 'plus', 'a', 'an', 'the', 'of', 'to', 'in', 'at', 'for', 'by', 'on'}
    filtered_words = [w for w in words if w not in stop_words]
    
    return filtered_words


def tokenize_prerequisite(text: str) -> List[str]:
    """Tokenize the prerequisite text into tokens (course codes, operators, parens, count constraints)"""
    # Check for count pattern first (e.g., "2 of the following" or "ONE of the following")
    count_match = re.search(COUNT_OF_PATTERN, text, re.IGNORECASE)
    count_token = None
    
    if count_match:
        # Extract the count number or word
        match_text = count_match.group(0)
        # Try to extract digit
        digit_match = re.search(r'\d+', match_text)
        if digit_match:
            count_token = f"COUNT:{digit_match.group(0)}"
        else:
            # Convert word to number
            word_map = {
                'one': '1', 'two': '2', 'three': '3', 'four': '4',
                'five': '5', 'six': '6', 'seven': '7', 'eight': '8',
                'nine': '9', 'ten': '10'
            }
            for word, num in word_map.items():
                if word in match_text.lower():
                    count_token = f"COUNT:{num}"
                    break
    
    # Replace 'and' and 'or' (case-insensitive) with uppercase
    text = re.sub(r'\band\b', 'AND', text, flags=re.IGNORECASE)
    text = re.sub(r'\bor\b', 'OR', text, flags=re.IGNORECASE)
    
    # Tokenize
    tokens = []
    pattern = r'(\(|\)|AND|OR|' + COURSE_CODE_PATTERN + r')'
    
    # Extract text after the count pattern if found
    text_to_tokenize = text
    if count_match:
        text_to_tokenize = text[count_match.end():]
    
    for match in re.finditer(pattern, text_to_tokenize, re.IGNORECASE):
        token = match.group(0).strip()
        if token:
            # Combine course code with number
            if match.group(3):  # If it matched the course pattern
                tokens.append(f"{match.group(2)} {match.group(3)}")
            elif token in ('AND', 'OR', '(', ')'):
                tokens.append(token)
    
    # Add count token at the beginning if found
    if count_token:
        tokens.insert(0, count_token)
    
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
    
    return cleaned_tokens


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
            """Parse OR expression (lowest precedence)"""
            left = self.parse_and_expression()
            
            while self.peek() == 'OR':
                self.consume()  # consume 'OR'
                right = self.parse_and_expression()
                if left and right:
                    left = OperatorNode(type='OR', children=[left, right])
            
            return left
        
        def parse_and_expression(self) -> Optional[Any]:
            """Parse AND expression (higher precedence)"""
            left = self.parse_primary()
            
            while self.peek() == 'AND':
                self.consume()  # consume 'AND'
                right = self.parse_primary()
                if left and right:
                    left = OperatorNode(type='AND', children=[left, right])
            
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
                    
                    # Stop if we hit OR at top level (outside parens)
                    if next_token == 'OR' and paren_depth == 0:
                        break
                    
                    # Parse one expression and add to children
                    if paren_depth == 0:
                        # Parse at AND level to collect all courses until OR
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


def process_course_prerequisite(course_code: str, description: str, enrollment_requirements: str) -> Tuple[Optional[Any], List[str]]:
    """Process a single course and return its prerequisite tree and associated words"""
    # Extract prerequisite text
    prereq_text = extract_prerequisite_text(description, enrollment_requirements)
    
    if not prereq_text:
        return None, []
    
    # Extract words for analysis
    words = extract_words_after_prefix(prereq_text)
    
    # Check if there are any course codes
    courses = extract_course_codes(prereq_text)
    if not courses:
        return None, words
    
    # Tokenize and parse
    tokens = tokenize_prerequisite(prereq_text)
    tree = parse_prerequisite_tree(tokens)
    
    return tree, words


def process_course_row(row: Dict[str, str]) -> Tuple[str, Optional[Any], List[str], bool]:
    """Worker function to process a single course row"""
    course_code = row.get('course_code', '').strip()
    description = row.get('description', '').strip()
    enrollment_requirements = row.get('enrollment_requirements', '').strip()
    
    if not course_code:
        return '', None, [], False
    
    tree, words = process_course_prerequisite(course_code, description, enrollment_requirements)
    has_prereq = tree is not None
    
    return course_code, tree.to_dict() if tree and hasattr(tree, 'to_dict') else tree, words, has_prereq


def render_progress_bar(completed: int, total: int, width: int = 36) -> str:
    """Build a compact text progress bar for terminal display."""
    if total <= 0:
        return "[" + ("-" * width) + "]   0.0% (0/0)"

    ratio = max(0.0, min(1.0, completed / total))
    filled = int(ratio * width)
    bar = "#" * filled + "-" * (width - filled)
    percent = ratio * 100
    return f"[{bar}] {percent:5.1f}% ({completed}/{total})"


def main():
    """Main function to process all courses with concurrent execution"""
    # Read JSON file into memory
    json_file = "data/uva_course_details.json"
    rows = []
    
    try:
        with open(json_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
            # The JSON is a list of courses
            if isinstance(data, list):
                rows = [
                    {
                        'course_code': course.get('course_code', ''),
                        'description': course.get('description', ''),
                        'enrollment_requirements': course.get('enrollment_requirements', '')
                    }
                    for course in data
                ]
            elif isinstance(data, dict) and 'courses' in data:
                # If it's a dict with 'courses' key
                rows = [
                    {
                        'course_code': course.get('code', course.get('course_code', '')),
                        'description': course.get('description', ''),
                        'enrollment_requirements': course.get('enrollment_requirements', '')
                    }
                    for course in data.get('courses', [])
                ]
            elif isinstance(data, dict):
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
    
    # Process courses concurrently
    courses_with_prereqs = {}
    all_words = {}
    courses_without_prereqs = []
    
    max_workers = os.cpu_count() or 4

    error_count = 0
    terminal_width = shutil.get_terminal_size((100, 20)).columns
    progress_bar_width = max(20, min(48, terminal_width - 28))
    
    try:
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = {executor.submit(process_course_row, row): i for i, row in enumerate(rows)}
            completed = 0

            for future in as_completed(futures):
                completed += 1
                progress_line = render_progress_bar(completed, len(rows), progress_bar_width)
                print(f"\r{progress_line}", end="", flush=True)
                
                try:
                    course_code, tree, words, has_prereq = future.result()
                    
                    if not course_code:
                        continue
                    
                    if tree and has_prereq:
                        courses_with_prereqs[course_code] = tree
                        all_words[course_code] = words
                    else:
                        courses_without_prereqs.append(course_code)
                
                except Exception as e:
                    error_count += 1
                    continue
    
    except Exception as e:
        print(f"Error in concurrent execution: {e}")
        sys.exit(1)

    # Move to next line after carriage-return progress updates
    print()
    
    # Save results to JSON
    output_data = {
        "metadata": {
            "total_courses": len(courses_with_prereqs) + len(courses_without_prereqs),
            "courses_with_prerequisites": len(courses_with_prereqs),
            "courses_without_prerequisites": len(courses_without_prereqs),
        },
        "prerequisite_trees": courses_with_prereqs,
        "prerequisite_words_by_course": all_words,
        "courses_without_prerequisites": courses_without_prereqs,
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
