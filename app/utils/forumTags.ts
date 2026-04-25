/**
 * Forum tag utilities and configuration
 */

import { PROFILE_MAJOR_OPTIONS } from '@/app/profile/profileOptions';

export const GENERAL_TAGS = ['General', 'Career'];

export const FORUM_TAG_OPTIONS = Array.from(
  new Set([
    ...GENERAL_TAGS,
    ...PROFILE_MAJOR_OPTIONS,
  ])
).sort((left, right) => {
  // Pin General and Career to the top
  const aIsGeneral = GENERAL_TAGS.includes(left);
  const bIsGeneral = GENERAL_TAGS.includes(right);
  if (aIsGeneral && !bIsGeneral) return -1;
  if (!aIsGeneral && bIsGeneral) return 1;
  return left.localeCompare(right);
});

export function getAvailableTags(): string[] {
  return [...FORUM_TAG_OPTIONS];
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
export function areTagsValid(tags: string[]): boolean {
  const allowedTags = getAvailableTags();
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
