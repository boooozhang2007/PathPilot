/** Serialize path saves and ignore responses made stale by a later edit. */
export function createCareerPathSaveQueue<T>(
  send: (value: string) => Promise<T>,
  onSuccess: (result: T) => void,
  onError: (error: unknown) => void,
) {
  let tail = Promise.resolve();
  let revision = 0;

  function invalidate() { revision += 1; }

  function save(value: string) {
    const submittedRevision = ++revision;
    tail = tail.then(async () => {
      try {
        const result = await send(value);
        if (revision === submittedRevision) onSuccess(result);
      } catch (error) {
        if (revision === submittedRevision) onError(error);
      }
    });
    return tail;
  }

  return { invalidate, save };
}
