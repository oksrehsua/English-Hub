# English Hub

英語学習を多角的にサポートするためのツール・ハブです。

## 収録ツール

### 1. [TRIPLE ECHO](triple-echo/index.html)
CSV形式の問題集を読み込んで、徹底的な反復練習を行うためのツールです。
- **学習モード**: 通常モード、再生モード（聞き流し）、ディクテーション・モード。
- **スピード訓練**: 0.1倍から1.0倍まで段階的に速度を上げるトレーニング。
- **復習機能**: 間違えた問題を記録し、集中して再挑戦。
- **中断・再開機能**: クイズの進捗をいつでも保存し、次回アクセス時にTOP画面からシームレスに再開可能。

### 2. [English Reader](english-reader/index.html)
CSVに記載された長文や例文を、自分のペースでリスニングするためのリーダーです。
- **一括再生**: 登録された文章を順番に連続再生。
- **音声選択**: 複数の声から好みのもの、またはランダムに選択可能。
- **スピード調整**: 0.25倍〜1.0倍の速度調整。

### 3. [Word Drill](word-drill/index.html)
英単語の反復練習を行うためのドリルツールです。
- **単元絞り込み**: 特定の単元やカテゴリに絞って集中的に単語を学習可能。
- **出題数設定**: 全問から指定した数だけをランダムに出題。
- **復習機能**: 間違えた単語だけをピックアップして再挑戦。

### 4. [Verb Drill](verb-drill/index.html)
動詞の活用（現在形、現在分詞、過去形、過去分詞）をセットでタイピング練習するツールです。
- **4活用同時入力**: 1つの動詞に対して4つの活用形をすべて答えることで、正確な活用を記憶。
- **自動判定**: 入力ごとにリアルタイムで正誤を判定。

## ディレクトリ構成
```text
/ (Root)
 |- index.html          # ポータル（ハブ）画面
 |- triple-echo/        # TRIPLE ECHO 本体
 |- english-reader/     # English Reader 本体
 |- word-drill/         # Word Drill 本体
 |_ verb-drill/         # Verb Drill 本体
```

## CSVファイルの形式 (TRIPLE ECHO)
以下のヘッダーを持つCSVを読み込めます。
`"item_id","unit_category","difficulty_level","format_type","question_text","correct_answer","explanation","full_sentence","tags"`

## 使い方
1. リポジトリルートの `index.html` をブラウザで開く。
2. 使いたいツール（TRIPLE ECHO または English Reader）を選択。
3. CSVファイルを読み込んで学習を開始。
