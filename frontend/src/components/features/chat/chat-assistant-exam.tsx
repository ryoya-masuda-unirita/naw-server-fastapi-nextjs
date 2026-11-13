import { useEffect, useRef, useState } from 'react';
import { SvgIcon } from '@/components/shared/icons/svg-icon';
import { CircularLoading } from '@/components/shared/circular-loading';
import { ChatError } from './chat-error';
import { ChatMessageFooter } from './chat-message-footer';

/** コピー済み表示を戻すまでの時間（移植元と同じ 2 秒） */
const COPIED_RESET_MS = 2000;

/** 試験用の表示なので、フッターのボタンは何もしない */
const noop = () => undefined;

/** 見本のメッセージの下に付ける、操作のないフッター */
function SampleFooter() {
  return (
    <ChatMessageFooter
      onCopy={noop}
      onThumbsUp={noop}
      onThumbsDown={noop}
      onRegenerate={noop}
      onDelete={noop}
    />
  );
}

const CODE_SAMPLE = `class MyClass {
  public static myValue: string;
  constructor(init: string) {
    this.myValue = init;
  }
}

import fs = require("fs");
module MyModule {
  export interface MyInterface extends Other {
    myProperty: any;
  }
}

declare magic:Number: number;
myArray.forEach(() => { }); // fat arrow syntax`;

/**
 * 移植元 `<app-chat-assistant-exam>`。アシスタントの回答の見た目の見本（本文・見出し・ローディング・エラー・参考資料・コード・リスト・引用）を並べる。
 * 文言は移植元が日本語をハードコードしているので、そのまま移す。
 */
export function ChatAssistantExam() {
  const [isCodeCopied, setIsCodeCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const handleCodeCopy = () => {
    setIsCodeCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setIsCodeCopied(false), COPIED_RESET_MS);
  };

  return (
    <div className="chat-page-messages-wrapper">
      {/* パターン1: デフォルト */}
      <article className="chat-message chat-message--assistant">
        <div className="chat-message-bubble">
          <p>
            本文が入ります。本文が入ります。本文が入ります。本文が入ります。本文が入ります。本文が入ります。
            <br />
            本文が入ります。本文が入ります。本文が入ります。本文が入ります。本文が入ります。本文が入ります。
            <a href="#">文中のテキストリンク</a>本文が入ります。
            <br />
            <br />
            この下にあるのは罫線です。
          </p>
          <hr className="my-6 border-border-weak" />
          <h1>見出し h1</h1>
          <h2>見出し h2</h2>
          <h3>見出し h3</h3>
          <h4>見出し h4</h4>
          <h5>見出し h5</h5>
          <h6>見出し h6</h6>
        </div>
        <SampleFooter />
      </article>

      {/* パターン2: ローディング */}
      <p className="text-label-small text-text-weak">ローディング</p>
      <article className="chat-message chat-message--assistant">
        <div className="chat-message-bubble">
          <CircularLoading />
        </div>
      </article>

      {/* パターン3: 回答エラー */}
      <p className="text-label-small text-text-weak">回答エラー</p>
      <article className="chat-message chat-message--assistant">
        <p className="chat-error-badge">回答エラー</p>
        <div className="chat-message-bubble">
          <ChatError
            title="エラーが発生しました"
            message="サポートテキストが入ります。サポートテキストが入ります。サポートテキストが入ります。"
          />
        </div>
        <SampleFooter />
      </article>

      {/* パターン4: 参考資料付き */}
      <p className="text-label-small text-text-weak">参考資料付き</p>
      <article className="chat-message chat-message--assistant">
        <div className="chat-message-bubble">
          <p>
            承知いたしました。売上DBの実績値と予算案データを結合し、第3四半期の
            <a href="#">予実対比分析</a>を行いました。
            <br />
            …
          </p>
          <div className="chat-ref-section">
            <p className="chat-ref-title">参考資料</p>
            <ul>
              <li>
                <a href="#">資料のリンク</a>
              </li>
              <li>
                <a href="#">資料のリンク</a>
              </li>
            </ul>
          </div>
        </div>
        <SampleFooter />
      </article>

      {/* パターン5: コード表示 */}
      <p className="text-label-small text-text-weak">コード表示</p>
      <article className="chat-message chat-message--assistant">
        <div className="chat-message-bubble">
          <div className="chat-code-line">短いコードはこれ</div>
          <p>長いコード表示</p>
          <div className="chat-code-block">
            <div className="chat-code-header">
              <button
                type="button"
                data-code-copy-btn
                className={`chat-code-copy-btn${isCodeCopied ? ' is-copied' : ''}`}
                onClick={handleCodeCopy}
              >
                <span data-icon-default>コードをコピー</span>
                <span data-icon-copied>コピーしました</span>
                <span data-icon-default>
                  <SvgIcon name="copy" className="w-3.5 h-3.5" />
                </span>
                <span data-icon-copied>
                  <SvgIcon name="check" className="w-3.5 h-3.5" />
                </span>
              </button>
            </div>
            <div className="chat-code-body">
              <pre>
                <code>{CODE_SAMPLE}</code>
              </pre>
            </div>
          </div>
        </div>
        <SampleFooter />
      </article>

      {/* パターン6: その他テキストスタイル */}
      <p className="text-label-small text-text-weak">その他テキストスタイル</p>
      <article className="chat-message chat-message--assistant">
        <div className="chat-message-bubble">
          <p>箇条書き</p>
          <ul>
            <li>テキストリスト</li>
            <li>テキストリスト</li>
            <li>テキストリスト</li>
            <li>テキストリスト</li>
            <li>
              テキストリスト
              <ul>
                <li>テキストリスト</li>
                <ul>
                  <li>テキストリスト</li>
                </ul>
              </ul>
            </li>
          </ul>

          <p>数字つきリスト</p>
          <ol>
            <li>テキストリスト</li>
            <li>テキストリスト</li>
            <li>テキストリスト</li>
            <li>テキストリスト</li>
            <li>
              テキストリスト
              <ol>
                <li>テキストリスト</li>
                <ol>
                  <li>テキストリスト</li>
                </ol>
              </ol>
            </li>
          </ol>

          <blockquote>
            <p>引用のテキスト引用のテキスト</p>
            <p>引用のテキスト引用のテキスト</p>
          </blockquote>
          <br />
          <blockquote>
            <p>引用のテキスト引用のテキスト</p>
            <blockquote>
              <p>入れ子入れ子入れ子</p>
            </blockquote>
          </blockquote>
        </div>
        <SampleFooter />
      </article>
    </div>
  );
}
