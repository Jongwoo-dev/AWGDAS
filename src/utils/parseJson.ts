export function parseJsonResponse<T>(text: string, label: string): T {
  const trimmed = text.trim();

  try {
    return JSON.parse(trimmed) as T;
  } catch {
    // markdown fence 안의 JSON 추출 시도
  }

  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1].trim()) as T;
    } catch {
      // fall through
    }
  }

  throw new Error(
    `Failed to parse ${label} response as JSON. Raw text: ${trimmed.slice(0, 200)}`,
  );
}
