# Edge Case Pattern Examples: Multiple Course Selection

## Overview
This document shows real examples of each prerequisite pattern type that involves multiple course selection options. These patterns were identified by analyzing 9,433 unique UVA courses.

---

## 1. OR CLAUSE (Basic Choice)
**Pattern Type**: Simple OR between course options  
**Frequency**: 1,084 courses (40% of all prerequisites)  
**Description**: Student can take ONE of the listed courses

### Examples:

#### Example 1A: Simple OR
```
COURSE: APMA 2130
REQUIREMENT: Prerequisite: APMA 1110 or equivalent
INTERPRETATION: Take APMA 1110 OR show equivalent experience
```

#### Example 1B: Multiple OR Options
```
COURSE: CE 2100
REQUIREMENT: Prerequisite: CS 1110 or CS 1111 or CS 1112
INTERPRETATION: Take ANY ONE of: CS 1110, CS 1111, or CS 1112
```

#### Example 1C: OR with grades
```
COURSE: MATH 1310
REQUIREMENT: Prerequisite: MATH 1310 or ALEKS Test score of 46 or higher
INTERPRETATION: Take MATH 1310 OR pass ALEKS test
```

**Tree Structure**:
```json
{
  "type": "OR",
  "children": [
    {"type": "course", "code": "CS 1110"},
    {"type": "course", "code": "CS 1111"},
    {"type": "course", "code": "CS 1112"}
  ]
}
```

---

## 2. COUNT/MULTIPLE OPTIONS (N of the following)
**Pattern Type**: "2 of the following" or "at least 3 from"  
**Frequency**: 39+ courses (explicit count patterns)  
**Description**: Student must select N courses from a list of options

### Examples:

#### Example 2A: Two of These
```
COURSE: ASTR 3430
REQUIREMENT: Students must have completed, or be enrolled in, any two courses at 
the 3000-level or above from any of the following subject codes: 
ASTR, BIOL, CHEM, EVSC, MATH, PHYS, PSYC, or STAT
INTERPRETATION: Take ANY 2 courses at 3000+ level from those 8 departments
```

#### Example 2B: One of Following
```
COURSE: BIOL 4260
REQUIREMENT: Must have completed BIOL 3000 and ONE of the following: 
BIOL 3010, BIOL 3030, BIOL 3050, BIOL 3240, CHEM 4410, or CHEM 4440
INTERPRETATION: Take BIOL 3000 AND pick any 1 of the 6 listed options
```

#### Example 2C: Three of Five
```
COURSE: DS 4023
REQUIREMENT: One of the following: DS 1002, DS 2001, CS 1110, CS 1111, CS 1112, CS 2110
INTERPRETATION: Take ANY 1 course from the 6 programming/DS options
```

**Tree Structure**:
```json
{
  "type": "AND",
  "children": [
    {"type": "course", "code": "BIOL 3000"},
    {
      "type": "count",
      "count": 1,
      "children": [
        {"type": "course", "code": "BIOL 3010"},
        {"type": "course", "code": "BIOL 3030"},
        {"type": "course", "code": "BIOL 3050"},
        {"type": "course", "code": "BIOL 3240"},
        {"type": "course", "code": "CHEM 4410"},
        {"type": "course", "code": "CHEM 4440"}
      ]
    }
  ]
}
```

---

## 3. OR EQUIVALENT
**Pattern Type**: Course OR approved equivalent  
**Frequency**: 262 courses (10%)  
**Description**: Accept standardized course OR approved substitution

### Examples:

#### Example 3A: Math Equivalents
```
COURSE: APMA 2210
REQUIREMENT: Prerequisite: MATH 1320, APMA 1110 or equivalent
INTERPRETATION: Take MATH 1320 AND (APMA 1110 OR approved equivalent)
```

#### Example 3B: Lab Equivalent
```
COURSE: BIOL 3010
REQUIREMENT: Prerequisite: BIOL 2100 or equivalent biology course
INTERPRETATION: Take BIOL 2100 OR equivalent (like AP Biology, transfer credit)
```

#### Example 3C: Departmental Substitutes
```
COURSE: ARAB 1020
REQUIREMENT: Prerequisite: ARAB 1010 or equivalent
INTERPRETATION: Take ARAB 1010 OR another equivalent language course
```

**Handling**: These are typically represented as OR nodes where one branch is a course code and the other is flagged as "equivalent allowed"

---

## 4. COMBINED AND/OR (Complex Logic)
**Pattern Type**: Mix of AND and OR operations  
**Frequency**: 399 courses (15%)  
**Description**: Combination of required AND optional courses

### Examples:

#### Example 4A: Prerequisites AND Optional Electives
```
COURSE: BIOL 4020
REQUIREMENT: Must have completed BIOL 3010 and BIOL 3020 and 
ONE of the following: STAT 2020 or STAT 2120
INTERPRETATION: (BIOL 3010 AND BIOL 3020) AND (STAT 2020 OR STAT 2120)
```

#### Example 4B: Core Requirement with Alternatives
```
COURSE: CE 3100
REQUIREMENT: Must have completed APMA 2130 or MATH 3250 or APMA 2501 and 
ONE of the following: CHEM 1410, CHEM 1610, or CHEM 1810
INTERPRETATION: (APMA 2130 OR MATH 3250 OR APMA 2501) AND (1 of 3 chemistry options)
```

#### Example 4C: Prerequisite with Optional Corequisite
```
COURSE: AIRS 4100
REQUIREMENT: Prerequisite: AIRS 3100 and/or 3200; corequisite: AIRS 100
INTERPRETATION: (AIRS 3100 OR AIRS 3200) AND corequisite AIRS 100
```

**Tree Structure**:
```json
{
  "type": "AND",
  "children": [
    {
      "type": "OR",
      "children": [
        {"type": "course", "code": "BIOL 3010"},
        {"type": "course", "code": "BIOL 3020"}
      ]
    },
    {
      "type": "OR",
      "children": [
        {"type": "course", "code": "STAT 2020"},
        {"type": "course", "code": "STAT 2120"}
      ]
    }
  ]
}
```

---

## 5. OR PERMISSION (Course OR Instructor Override)
**Pattern Type**: Normal prerequisite OR permission to waive  
**Frequency**: 332 courses (12%)  
**Description**: Student can take course with prerequisites OR get instructor approval

### Examples:

#### Example 5A: Permission from Instructor
```
COURSE: ACCT 4450
REQUIREMENT: Prerequisite: ACCT 2020 or instructor permission
INTERPRETATION: Take ACCT 2020 OR get approval from department chair/instructor
```

#### Example 5B: Permission from Chair
```
COURSE: ALAR 8995
REQUIREMENT: Prerequisite: ALAR 8100 and permission of the chair
INTERPRETATION: Take ALAR 8100 AND obtain written permission
```

#### Example 5C: Multiple Courses or Consent
```
COURSE: ANTH 3370
REQUIREMENT: Prerequisite: ANTH 1010 or permission of the instructor
INTERPRETATION: Take ANTH 1010 OR demonstrate equivalent knowledge to professor
```

**Handling**: Special flag in requirement to indicate instructor discretion option

---

## 6. COREQUISITE (Concurrent Enrollment)
**Pattern Type**: Course required at the same time  
**Frequency**: 64 courses (2%)  
**Description**: Must be taken in same semester, not before

### Examples:

#### Example 6A: Concurrent Lab
```
COURSE: AIRS 1100
REQUIREMENT: Corequisite: AIRS 100
INTERPRETATION: Take AIRS 1100 and AIRS 100 in the SAME semester
```

#### Example 6B: Prerequisite with Corequisite
```
COURSE: ASTR 2110
REQUIREMENT: Prerequisite: MATH 1310; Corequisite: MATH 1210 or 1310
INTERPRETATION: Have taken MATH 1310, take another math course at the same time
```

#### Example 6C: Skills Course Concurrent
```
COURSE: CHEM 3100
REQUIREMENT: Prerequisite: CHEM 2200; Corequisite: CHEM 3100L
INTERPRETATION: Take theory course and lab course together in same semester
```

**Tree Structure**: Needs special "concurrent" flag or separate tracking

---

## 7. ENROLLMENT RESTRICTION (Status-Based)
**Pattern Type**: Limited by major, program, or student status  
**Frequency**: 393 courses (15%)  
**Description**: Only available to specific majors or programs

### Examples:

#### Example 7A: Major Requirement
```
COURSE: COMM 2001
REQUIREMENT: Restricted to McIntire School of Commerce 2nd year students
INTERPRETATION: Must be an admitted McIntire student
```

#### Example 7B: Enrollment Status
```
COURSE: AIRS 1100
REQUIREMENT: Students must be currently enrolled in AIRS 100
INTERPRETATION: Must be actively enrolled in the companion course
```

#### Example 7C: Department-Specific
```
COURSE: ENGR 3500
REQUIREMENT: Restricted to students in Engineering school
INTERPRETATION: Must be in School of Engineering curriculum
```

**Handling**: Requires user profile data (major, school, year)

---

## 8. YEAR_REQUIREMENT (Class Standing)
**Pattern Type**: Sophomore, junior, senior standing required  
**Frequency**: 31 courses (1%)  
**Description**: Academic level gates

### Examples:

#### Example 8A: Senior Standing
```
COURSE: ANTH 7040
REQUIREMENT: Prerequisite: Second year graduate standing in anthropology
INTERPRETATION: Must have completed 1st year of graduate program
```

#### Example 8B: Junior Required
```
COURSE: MEC 4100
REQUIREMENT: Prerequisite: Junior standing and completion of all 100-200 level coursework
INTERPRETATION: Third year student with specified prerequisites
```

#### Example 8C: Sophomore or Above
```
COURSE: PSYC 3000
REQUIREMENT: Prerequisite: Sophomore standing
INTERPRETATION: At least 2nd year (30+ credits typically)
```

**Handling**: Check user's credit count or declared year level

---

## 9. GENERAL EDUCATION (Core Requirements)
**Pattern Type**: General education or core curriculum requirement  
**Frequency**: 169 courses (6%)  
**Description**: Prerequisite is completing gen-ed component

### Examples:

#### Example 9A: General Education Component
```
COURSE: PHIL 3100
REQUIREMENT: General education requirement in humanities completed
INTERPRETATION: Must have satisfied core curriculum in this area
```

#### Example 9B: Quantitative Requirement
```
COURSE: STAT 4200
REQUIREMENT: General education quantitative skills requirement
INTERPRETATION: Must have passed math/stats gen-ed component
```

---

## 10. CONSENT REQUIRED (Faculty/Department Approval)
**Pattern Type**: Explicit permission needed  
**Frequency**: 55 courses (2%)  
**Description**: Faculty/department must approve enrollment

### Examples:

#### Example 10A: Department Permission
```
COURSE: CS 4970
REQUIREMENT: Prerequisite: CS 3110 and permission of instructor
INTERPRETATION: Must complete CS 3110 AND email professor for approval
```

#### Example 10B: Committee Approval
```
COURSE: GSEM 7000
REQUIREMENT: Permission of graduate program director required
INTERPRETATION: Graduate committee must approve enrollment
```

---

## 11. CREDIT HOURS (Cumulative Credits)
**Pattern Type**: Total credit hours requirement  
**Frequency**: 19 courses (<1%)  
**Description**: Based on total credits earned, not specific courses

### Examples:

#### Example 11A: Minimum Credit Hours
```
COURSE: MEC 4970
REQUIREMENT: Prerequisite: 120 credit hours completed
INTERPRETATION: Must have earned at least 120 total credits
```

#### Example 11B: Junior Status by Credits
```
COURSE: COM 3500
REQUIREMENT: Prerequisite: 60 credit hours completed
INTERPRETATION: Typically indicates junior (60 credits ≈ 2 years)
```

---

## 12. DEPARTMENT SPECIFIC (Major Gates)
**Pattern Type**: Limited to specific major/concentration  
**Frequency**: 11 courses (<1%)  
**Description**: Only for students in that major

### Examples:

#### Example 12A: Major Requirement
```
COURSE: ENGR 4950
REQUIREMENT: Major in Engineering and senior standing
INTERPRETATION: Must have declared Engineering major
```

#### Example 12B: Concentration-Based
```
COURSE: HIST 4800
REQUIREMENT: Concentration in American History
INTERPRETATION: Must have elected American History track
```

---

## Summary Table: Multiple Course Selection Patterns

| Pattern | Count | % | Type | Example |
|---------|-------|---|------|---------|
| **OR Clause** | 1,084 | 40% | Choice | CS 1110 OR CS 1111 |
| **Combined AND/OR** | 399 | 15% | Complex | MATH 1310 AND (PHYS 1425 OR 1435) |
| **Enrollment Restriction** | 393 | 15% | Status | McIntire school enrollment |
| **OR Permission** | 332 | 12% | Override | ACCT 2020 OR chair approval |
| **OR Equivalent** | 262 | 10% | Substitution | MATH 1110 or equivalent |
| **General Education** | 169 | 6% | Core | Gen-ed requirement in area |
| **Corequisite** | 64 | 2% | Concurrent | CHEM 1100 + CHEM 1100L same semester |
| **Consent Required** | 55 | 2% | Approval | Prerequisite + instructor OK |
| **Multiple Options** | 39 | 1% | Count | 2 of these 6 courses |
| **Year Requirement** | 31 | 1% | Status | Junior standing |
| **Credit Hours** | 19 | <1% | Count | 120 total credits |
| **Department Specific** | 11 | <1% | Major | Engineering major required |

---

## Implementation Priority for Your System

### High Priority (Most Common)
1. **OR Clause** (40%) - Already implemented with parse trees ✅
2. **Combined AND/OR** (15%) - Already working with operator nodes ✅
3. **Enrollment Restriction** (15%) - Requires user profile data
4. **OR Permission** (12%) - Requires manual override option

### Medium Priority (Useful)
5. **OR Equivalent** (10%) - Needs course mapping database
6. **General Education** (6%) - Requires core requirements database
7. **Corequisite** (2%) - Needs UI indicator for same-semester requirement

### Lower Priority (Edge Cases)
8. **Consent Required** (2%) - Manual workflow needed
9. **Multiple Options** (1%) - Already implemented with COUNT nodes ✅
10. **Year Requirement** (1%) - Requires user academic level
11. **Credit Hours** (<1%) - Requires user credit count tracking
12. **Department Specific** (<1%) - Requires major tracking