import type { ProfileDTO } from '@pathpilot/shared';

type ProfilePatch = Partial<ProfileDTO>;

interface ProfileSaveOptions {
  read: () => ProfileDTO | null;
  apply: (profile: ProfileDTO) => void;
  send: (patch: ProfilePatch) => Promise<ProfileDTO>;
  onError?: (error: unknown) => void;
}

/** 顺序提交字段更新；旧请求的响应不能覆盖更新的编辑或其它字段的草稿。 */
export function createProfileSaveQueue({ read, apply, send, onError }: ProfileSaveOptions) {
  let tail = Promise.resolve(true);
  const initial = read();
  let confirmed: ProfileDTO | null = initial ? { ...initial } : null;
  const revisions = new Map<keyof ProfileDTO, number>();
  const failedFields = new Set<keyof ProfileDTO>();

  function save(input: ProfilePatch): Promise<boolean> {
    const base = read();
    const patch = { ...input };
    const fields = Object.keys(patch) as (keyof ProfileDTO)[];
    if (!base || !fields.length) return Promise.resolve(false);
    confirmed ??= { ...base };
    const submitted = { ...base, ...patch };
    const submittedRevisions = new Map<keyof ProfileDTO, number>();
    for (const field of fields) {
      const revision = (revisions.get(field) ?? 0) + 1;
      revisions.set(field, revision);
      submittedRevisions.set(field, revision);
    }
    apply(submitted);

    const pending = tail.then(async () => {
      try {
        const updated = await send(patch);
        confirmed = updated;
        const current = read();
        if (current) {
          const next = { ...current, updatedAt: updated.updatedAt };
          for (const field of fields) {
            if (revisions.get(field) === submittedRevisions.get(field) && Object.is(current[field], submitted[field])) {
              Object.assign(next, { [field]: updated[field] });
            }
          }
          apply(next);
        }
        fields.forEach((field) => failedFields.delete(field));
        return true;
      } catch (error) {
        const current = read();
        if (current) {
          const restored = { ...current };
          for (const field of fields) {
            if (revisions.get(field) === submittedRevisions.get(field) && Object.is(current[field], submitted[field])) {
              Object.assign(restored, { [field]: confirmed![field] });
            }
          }
          apply(restored);
        }
        fields.forEach((field) => failedFields.add(field));
        onError?.(error);
        return false;
      }
    });
    tail = pending;
    return pending;
  }

  async function flush(): Promise<boolean> {
    // 等待期间仍可能有失焦等事件提交最后一项更新。
    let observed: Promise<boolean>;
    do {
      observed = tail;
      await observed;
    } while (observed !== tail);
    return failedFields.size === 0;
  }

  return { save, flush };
}
