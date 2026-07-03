export interface ViewerContentResponse {
  data: string;
  title: string;
}

export interface ViewerListItem {
  id: string;
  title: string;
}

export const MOCK_VIEWER_LIST: ViewerListItem[] = [
  { id: '1', title: '部門別 予実対比 2025 Q3' },
  { id: '2', title: '未達要因分析コメント' },
  { id: '3', title: '本レポートの仕様書' },
];

export const MOCK_VIEWER_CONTENT = `<div style="display:flex;flex-direction:column;gap:1.5rem;padding-top:1.5rem">
    <div>
      <div style="display:flex;align-items:center;gap:0.25rem;margin:0 0 0.5rem 0">
        <h1 style="font-size:1.125rem;font-weight:600;color:#666;margin:0">解説</h1>
        <button onclick="" style="display:inline-flex;align-items:center;justify-content:center;width:1.75rem;height:1.75rem;border-radius:0.375rem;background:#fff;cursor:pointer;padding:0;color:#adadad" title="ダウンロード">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="#adadad" aria-hidden="true" preserveAspectRatio="xMidYMid meet">
            <path d="M10 13L6 9L7.0625 7.9375L9.25 10.125V3H10.75V10.125L12.9375 7.9375L14 9L10 13ZM5.49417 16C5.08139 16 4.72917 15.8531 4.4375 15.5594C4.14583 15.2656 4 14.9125 4 14.5V13H5.5V14.5H14.5V13H16V14.5C16 14.9125 15.8531 15.2656 15.5592 15.5594C15.2653 15.8531 14.9119 16 14.4992 16H5.49417Z" fill="#adadad" key="0"></path>
          </svg>
        </button>
      </div>
      <p style="font-size:0.875rem;line-height:1.7;color:#111827;margin:0">営業2部の未達要因として、大口案件の検収遅れが影響しています。予算乖離率は-15%です。これに対し、経費削減および承認プロセスの見直しを提案します。</p>
    </div>
    <div>
      <div style="display:flex;align-items:center;gap:0.25rem;margin:0 0 0.5rem 0">
        <h1 style="font-size:1.125rem;font-weight:600;color:#666;margin:0">グラフ</h1>
        <button onclick="" style="display:inline-flex;align-items:center;justify-content:center;width:1.75rem;height:1.75rem;border-radius:0.375rem;background:#fff;cursor:pointer;padding:0;color:#adadad" title="ダウンロード">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="#adadad" aria-hidden="true" preserveAspectRatio="xMidYMid meet">
              <path d="M10 13L6 9L7.0625 7.9375L9.25 10.125V3H10.75V10.125L12.9375 7.9375L14 9L10 13ZM5.49417 16C5.08139 16 4.72917 15.8531 4.4375 15.5594C4.14583 15.2656 4 14.9125 4 14.5V13H5.5V14.5H14.5V13H16V14.5C16 14.9125 15.8531 15.2656 15.5592 15.5594C15.2653 15.8531 14.9119 16 14.4992 16H5.49417Z" fill="#adadad" key="0"></path>
            </svg>
        </button>
      </div>
      <div style="width:100%;overflow-x:auto">
        <img
          src="/dummy-graph.jpg"
          alt="Graph"
          class="max-w-none md:w-full"
          width="352"
          height="202"
          />
      </div>
    </div>
    <div>
      <div style="display:flex;align-items:center;gap:0.25rem;margin:0 0 0.5rem 0">
        <h1 style="font-size:1.125rem;font-weight:600;color:#666;margin:0">表データ</h1>
        <button onclick="" style="display:inline-flex;align-items:center;justify-content:center;width:1.75rem;height:1.75rem;border-radius:0.375rem;background:#fff;cursor:pointer;padding:0;color:#adadad" title="ダウンロード">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="#adadad" aria-hidden="true" preserveAspectRatio="xMidYMid meet">
              <path d="M10 13L6 9L7.0625 7.9375L9.25 10.125V3H10.75V10.125L12.9375 7.9375L14 9L10 13ZM5.49417 16C5.08139 16 4.72917 15.8531 4.4375 15.5594C4.14583 15.2656 4 14.9125 4 14.5V13H5.5V14.5H14.5V13H16V14.5C16 14.9125 15.8531 15.2656 15.5592 15.5594C15.2653 15.8531 14.9119 16 14.4992 16H5.49417Z" fill="#adadad" key="0"></path>
            </svg>
        </button>
      </div>
      <div style="width:100%;overflow-x:auto">
        <img
            src="/dummy-data.png"
            alt="Graph"
            class="max-w-none md:w-full"
            width="432"
            height="180"
            />
      </div>
    </div>
    <div>
      <div style="display:flex;align-items:center;gap:0.25rem;margin:0 0 0.5rem 0;height:25px">
        <span style="font-size:1.125rem;font-weight:600;color:#666;">生成仕様</span>
      </div>
      <p  class="text-body" style="font-size:0.875rem;line-height:1.7;color:#1A1A1A;margin:0">本レポートは2024年XX月XX日時点の●●ファイルをもとに作成されています。</p>
    </div>
</div>
`;
