/**
 * Time calculation and formatting utilities for Mentora study materials, subtopics, chapters, and courses.
 */

export function parseTimeStringToMinutes(timeStr?: string | number | null): number {
  if (!timeStr && timeStr !== 0) return 0;
  if (typeof timeStr === 'number') return Math.max(0, Math.round(timeStr));

  const str = String(timeStr).toLowerCase().trim();
  if (!str) return 0;

  let total = 0;

  // Check for hours: e.g. "1.5 hours", "2 hrs", "1h"
  const hourMatch = str.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b/i);
  if (hourMatch) {
    total += parseFloat(hourMatch[1]) * 60;
  }

  // Check for minutes: e.g. "30 mins", "45 minutes", "20m"
  const minMatch = str.match(/(\d+)\s*(?:minutes?|mins?|m)\b/i);
  if (minMatch) {
    total += parseInt(minMatch[1], 10);
  }

  if (total > 0) return Math.round(total);

  // If no unit matched, try pure number parse
  const rawNum = parseInt(str.replace(/[^0-9.]/g, ''), 10);
  return isNaN(rawNum) ? 0 : rawNum;
}

export function formatStudyTime(totalMinutes: number, fallbackTime?: string): string {
  if (!totalMinutes || totalMinutes <= 0) {
    if (fallbackTime) {
      const parsed = parseTimeStringToMinutes(fallbackTime);
      if (parsed > 0) return formatStudyTime(parsed);
      return fallbackTime;
    }
    return '15 mins';
  }

  const rounded = Math.round(totalMinutes);
  const hours = Math.floor(rounded / 60);
  const mins = rounded % 60;

  if (hours > 0) {
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }
  return `${mins} mins`;
}

/**
 * Calculates the total study minutes for a subtopic from all its materials, quizzes, and workspace template.
 */
export function calculateSubtopicMinutes(subtopic: any, materials?: any[]): number {
  if (!subtopic) return 0;

  let mins = 0;

  // 1. If explicit materials array is provided (e.g. from TopicDetailScreen state)
  if (Array.isArray(materials) && materials.length > 0) {
    mins += materials.reduce((acc, m) => acc + (Number(m.estimated_minutes) || 10), 0);
  } else if (Array.isArray(subtopic.subtopic_materials) && subtopic.subtopic_materials.length > 0) {
    // 2. From subtopic_materials relational query
    mins += subtopic.subtopic_materials.reduce((acc: number, m: any) => acc + (Number(m.estimated_minutes) || 10), 0);
  } else if (subtopic.workspace_template) {
    // 3. From workspace_template JSON if materials aren't relational rows
    let tmpl = subtopic.workspace_template;
    if (typeof tmpl === 'string') {
      try { tmpl = JSON.parse(tmpl); } catch (e) { tmpl = {}; }
    }
    if (tmpl) {
      const contentArr = tmpl.content || [];
      if (contentArr.length === 0 && tmpl.placeholders) {
        Object.keys(tmpl.placeholders).forEach(key => {
          const files = tmpl.placeholders[key];
          if (Array.isArray(files)) {
            files.forEach((f: any) => contentArr.push(f));
          }
        });
      }
      contentArr.forEach((f: any) => {
        mins += Number(f.estimated_minutes) || (f.size ? Math.max(5, Math.ceil(f.size / (1024 * 1024 * 2))) : 10);
      });
    }
  }

  // 4. From Quiz / Questions
  const qCount = Array.isArray(subtopic.questions)
    ? subtopic.questions.length
    : (Number(subtopic.questions_count) || (subtopic.has_quiz ? 10 : 0));

  if (qCount > 0) {
    mins += Number(subtopic.estimated_quiz_minutes) || Math.max(10, Math.round(qCount * 2));
  }

  // 5. Compare with baseline estimated_time
  const parsedFallback = parseTimeStringToMinutes(subtopic.estimated_time);
  if (mins === 0) {
    mins = parsedFallback || 15;
  } else if (parsedFallback > mins) {
    // Use the higher estimate if author specified more
    mins = parsedFallback;
  }

  return Math.round(mins);
}

/**
 * Calculates total study minutes for a topic / chapter by summing all its subtopics.
 */
export function calculateTopicMinutes(topic: any): number {
  if (!topic || !Array.isArray(topic.subtopics)) return 0;
  return topic.subtopics.reduce((acc: number, st: any) => acc + calculateSubtopicMinutes(st), 0);
}
