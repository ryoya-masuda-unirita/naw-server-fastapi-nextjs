import { addLocalAdditionalLearning } from '@/components/features/admin/training-data/local-training-api';
import {
  requireUserId,
  viaLocalServer,
} from '@/components/features/admin/training-data/local-server-call';
import { fetchTrainingFolder } from '@/hooks/use-training-data-detail';
import { useAuthStore } from '@/store/auth-store';
import type { AdditionalLearningTarget } from '@/types/training-data.types';

// 移植元 feedback-list/services/feedback-local-learning.service.ts
//
// クラウドの API サーバーはローカルの学習先フォルダの追加学習を断るため、フォルダの接続先（ローカル用サーバー）へ送る。
// 回答精度・満足度の両方から使うため、振り分けをここに 1 つだけ置く。

/**
 * 学習先がローカルのフォルダなら、ローカル用サーバーで追加学習する。
 * フォルダの種類は持たず都度取る（接続先を変えた直後に古い値を使わないため）。
 *
 * @returns ローカルのフォルダだったか（false ならクラウドへ送る）
 */
export async function addIfLocalFolder(
  indexId: string,
  target: AdditionalLearningTarget,
  content: File,
): Promise<boolean> {
  const folder = await fetchTrainingFolder(indexId);
  if (folder.type !== 'LOCAL') return false;

  // ユーザー ID はクラウドの取得を待った後の最新の値を読む
  const userId = useAuthStore.getState().user?.id;
  await viaLocalServer(() =>
    addLocalAdditionalLearning(folder, target, requireUserId(userId), content),
  );
  return true;
}
