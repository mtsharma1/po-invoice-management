export async function safeData(loader, fallback) {
  try {
    return { data: await loader(), error: null };
  } catch (error) {
    return { data: fallback, error };
  }
}
