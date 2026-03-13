export function slugifyPostTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');

  return slug || 'post';
}

export function getForumPostHref(postNumber: number, title: string): string {
  return `/forum/${postNumber}/${slugifyPostTitle(title)}`;
}
