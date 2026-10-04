import AsyncStorage from '@react-native-async-storage/async-storage';

// In-memory cache for 0ms synchronous access
const memoryCourseCache = new Map<string, any>();
const memoryCoursesListCache: { list: any[] | null; timestamp: number } = {
  list: null,
  timestamp: 0,
};

// Title + Board + Level -> Best Course ID with topics
const activeCourseIdBySubject = new Map<string, string>();
// Map from empty/duplicate course IDs to the active canonical course ID
const courseAliasMap = new Map<string, string>();

const COURSE_CACHE_PREFIX = '@mentora_course_';
const COURSES_LIST_CACHE_KEY = '@mentora_courses_list';

export function registerCourseAlias(aliasId: string, targetId: string) {
  if (aliasId && targetId && aliasId !== targetId) {
    courseAliasMap.set(aliasId, targetId);
  }
}

export function resolveCourseId(id: string): string {
  if (!id) return id;
  return courseAliasMap.get(id) || id;
}

function makeSubjectKey(title?: string, board?: string, level?: string): string {
  const t = (title || '').trim().toLowerCase();
  const b = (board || '').trim().toLowerCase();
  const l = (level || '').trim().toLowerCase();
  return `${t}__${b}__${l}`;
}

/**
 * Synchronously retrieves a course from in-memory cache (0ms).
 */
export function getCachedCourseSync(id: string): any | null {
  if (!id) return null;
  return memoryCourseCache.get(id) || null;
}

/**
 * Asynchronously retrieves a course from in-memory cache or AsyncStorage.
 */
export async function getCachedCourse(id: string): Promise<any | null> {
  if (!id) return null;
  const inMem = memoryCourseCache.get(id);
  if (inMem) return inMem;

  try {
    const raw = await AsyncStorage.getItem(`${COURSE_CACHE_PREFIX}${id}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        memoryCourseCache.set(id, parsed);
        if (parsed.title && parsed.topics && parsed.topics.length > 0) {
          activeCourseIdBySubject.set(
            makeSubjectKey(parsed.title, parsed.board, parsed.level),
            id
          );
        }
        return parsed;
      }
    }
  } catch (err) {
    console.warn('Error reading course cache for id', id, err);
  }
  return null;
}

/**
 * Persists course data to both in-memory cache and AsyncStorage.
 */
export async function setCachedCourse(id: string, data: any): Promise<void> {
  if (!id || !data) return;

  // Preserve existing topics if incoming data has none (protect against blank updates)
  const existing = memoryCourseCache.get(id);
  if (existing?.topics?.length > 0 && (!data.topics || data.topics.length === 0)) {
    data = { ...existing, ...data, topics: existing.topics };
  }

  memoryCourseCache.set(id, data);

  if (data.title && data.topics && data.topics.length > 0) {
    activeCourseIdBySubject.set(
      makeSubjectKey(data.title, data.board, data.level),
      id
    );
  }

  try {
    await AsyncStorage.setItem(`${COURSE_CACHE_PREFIX}${id}`, JSON.stringify(data));
  } catch (err) {
    console.warn('Error saving course cache for id', id, err);
  }
}

/**
 * Pre-warms basic course metadata (title, board, level, icon, color) so the header
 * and visuals render instantly on tap even before topics revalidation finishes.
 */
export function warmCourseMetadata(summary: {
  id: string;
  title: string;
  board?: string;
  level?: string;
  icon?: string;
  color?: string;
  image_url?: string | null;
  topics?: any[];
}): void {
  if (!summary?.id) return;
  const existing = memoryCourseCache.get(summary.id);
  if (!existing) {
    memoryCourseCache.set(summary.id, {
      ...summary,
      topics: summary.topics || [],
      isPartial: true,
    });
  } else if (summary.topics && summary.topics.length > (existing.topics?.length || 0)) {
    memoryCourseCache.set(summary.id, {
      ...existing,
      ...summary,
    });
  }
}

/**
 * Returns the primary course ID for a given title/board/level if known.
 */
export function getActiveCourseIdForSubject(title?: string, board?: string, level?: string): string | null {
  const key = makeSubjectKey(title, board, level);
  return activeCourseIdBySubject.get(key) || null;
}

/**
 * Registers an active course ID with topics for a given title/board/level.
 */
export function registerActiveCourse(title: string, board: string | undefined, level: string | undefined, id: string): void {
  const key = makeSubjectKey(title, board, level);
  activeCourseIdBySubject.set(key, id);
}

/**
 * Synchronously retrieves cached courses list for explore dashboard.
 */
export function getCachedCoursesListSync(): any[] | null {
  return memoryCoursesListCache.list;
}

/**
 * Asynchronously retrieves cached courses list from memory or AsyncStorage.
 */
export async function getCachedCoursesList(): Promise<any[] | null> {
  if (memoryCoursesListCache.list && memoryCoursesListCache.list.length > 0) {
    return memoryCoursesListCache.list;
  }
  try {
    const raw = await AsyncStorage.getItem(COURSES_LIST_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        memoryCoursesListCache.list = parsed;
        memoryCoursesListCache.timestamp = Date.now();
        // Warm individual courses in memory
        parsed.forEach((c) => warmCourseMetadata(c));
        return parsed;
      }
    }
  } catch (err) {
    console.warn('Error reading courses list cache:', err);
  }
  return null;
}

/**
 * Saves courses list to memory and AsyncStorage.
 */
export async function setCachedCoursesList(list: any[]): Promise<void> {
  if (!Array.isArray(list)) return;
  memoryCoursesListCache.list = list;
  memoryCoursesListCache.timestamp = Date.now();

  list.forEach((c) => warmCourseMetadata(c));

  try {
    await AsyncStorage.setItem(COURSES_LIST_CACHE_KEY, JSON.stringify(list));
  } catch (err) {
    console.warn('Error saving courses list cache:', err);
  }
}
