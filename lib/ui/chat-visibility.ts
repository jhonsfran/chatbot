export type VisibilityType = 'private' | 'public';

type VisibilityUpdateResult = {
  success: boolean;
  message: string;
};

export async function saveChatVisibilityOptimistically({
  previous,
  next,
  setLocal,
  save,
  refreshHistory,
}: {
  previous: VisibilityType;
  next: VisibilityType;
  setLocal: (visibility: VisibilityType) => Promise<unknown>;
  save: () => Promise<VisibilityUpdateResult>;
  refreshHistory: () => Promise<unknown>;
}): Promise<VisibilityUpdateResult> {
  await setLocal(next);
  const result = await save();

  if (!result.success) {
    await setLocal(previous);
  }

  await refreshHistory();
  return result;
}
