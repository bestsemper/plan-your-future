export interface Constraint {
  type: string;
  value?: number;
  courses?: string[];
  raw?: string;
  [key: string]: any;
}

export interface Requirement {
  id: string;
  name: string;
  level: number;
  parent_id: string | null;
  constraint_raw: string;
  constraints: Constraint[];
  children: Requirement[];
}

export interface RequirementsData {
  [programCode: string]: {
    [year: string]: Requirement[];
  };
}
