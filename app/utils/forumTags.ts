/**
 * Forum tag utilities and configuration
 */

import { PROFILE_ADDITIONAL_PROGRAMS, PROFILE_MAJOR_OPTIONS } from '@/app/profile/profileOptions';

// Predefined system tags available for forum posts
export const PREDEFINED_TAGS = [
  'Study Abroad',
  'ROTC',
  'Double Major',
  'Honors',
  'Minor',
  'Early Graduation',
  'Gap Year',
  'Internship',
  'Research',
  'Career Advice',
];

const MINOR_TAGS = PROFILE_ADDITIONAL_PROGRAMS.filter((program) => /minor/i.test(program));

export const FORUM_TAG_OPTIONS = Array.from(
  new Set([
    ...PREDEFINED_TAGS,
    ...PROFILE_MAJOR_OPTIONS,
    ...MINOR_TAGS,
  ])
).sort((left, right) => left.localeCompare(right));

/**
 * Get all available tags for a user
 * Includes their major (if they have one) plus all predefined tags
 * @param userMajor - The user's major (optional)
 * @returns Array of available tags
 */
export function getAvailableTags(userMajor?: string): string[] {
  const allTags = [...FORUM_TAG_OPTIONS];
  
  // Add user's major at the beginning if they have one
  if (userMajor) {
    allTags.unshift(userMajor);
  }
  
  return allTags;
}

/**
 * Filter tags based on search query
 * @param tags - Array of tags to search through
 * @param query - Search query (case-insensitive)
 * @returns Filtered array of tags
 */
export function filterTagsByQuery(tags: string[], query: string): string[] {
  if (!query.trim()) return tags;
  
  const lowerQuery = query.toLowerCase();
  return tags.filter(tag => tag.toLowerCase().includes(lowerQuery));
}

/**
 * Validate that all tags are in the allowed set
 * @param tags - Tags to validate
 * @param userMajor - The user's major
 * @returns Boolean indicating if all tags are valid
 */
export function areTagsValid(tags: string[], userMajor?: string): boolean {
  const allowedTags = getAvailableTags(userMajor);
  return tags.every(tag => allowedTags.includes(tag));
}

/**
 * Remove duplicates from tags array
 * @param tags - Tags array
 * @returns Deduplicated tags array
 */
export function deduplicateTags(tags: string[]): string[] {
  return Array.from(new Set(tags));
}
