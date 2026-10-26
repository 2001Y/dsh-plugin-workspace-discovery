# dsh-plugin-workspace-discovery

[English](README.md) | [简体中文](README.zh.md) | **日本語**

ローカルのgitリポジトリを検出し、[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）のワークスペースとして一括登録するプラグインです。フォルダを1件ずつ追加する作業から解放されます。

DSH標準のワークスペース追加は「ディレクトリを選ぶ」1経路だけです。1台のマシンに数十のリポジトリ（`~/dev`、`~/Documents` など）があっても、登録しなければサイドバーには永遠に現れません。本プラグインは、Hermes Agent のワークスペース選択が `repo_scan_roots` で行っている発見の仕組みをDSHに持ち込みます。

- **スキャン**：設定したフォルダ配下からgitリポジトリ（`.git` ディレクトリ、またはworktree／サブモジュールの `.git` ファイル）を探します。
- **確認**：サイドバーのパネルで、登録済み／未登録の一覧を検索・全選択・個別チェックで確認できます。
- **登録**：選択分（または未登録の全件）を公式 `workspaceRegistry` APIで登録します。ディレクトリ単位で冪等なので、再スキャンしても二重登録になりません。
- エージェントに任せることもできます。モデル向けツール `workspace_discover` と `workspace_register_discovered` が同じ操作を会話の中から提供します。

`autoRegister` を自分で有効にしない限り自動登録はしません。`git` コマンドの実行も、ワークスペースファイルへの直接書き込みもしません。公式レジストリだけを駆動するので、プラグインを外してもワークスペースはそのまま残ります。

## インストール

```sh
dsh plugin --profile web add dsh-plugin-workspace-discovery
```

その後 web プロファイルを再起動し、ページを再読み込みしてください。ローカルのチェックアウトから入れる場合：

```sh
git clone https://github.com/2001Y/dsh-plugin-workspace-discovery
dsh plugin --profile web add ./dsh-plugin-workspace-discovery
```

## 使い方

サイドバー下部の **プロジェクトを検出** をクリックします（バッジは未登録リポジトリの件数）。パネルでは：

1. 必要に応じて**スキャンするフォルダ**（1行に1つの絶対パス）と最大の深さを調整し、**保存**します。
2. **スキャン**（または再スキャン）して一覧を確認します。登録済みのリポジトリにはバッジが付き、再選択できません。
3. **選択した件数を登録**、または**未登録をすべて登録**を押します。

## 設定

設定はホスト共有ファイル `$DSH_HOME/workspace-discovery.config.json` に保存され、同じDSHホストにアクセスする全ブラウザで共有されます。パネルがこのファイルを編集します。プロファイルの patch 行で初期値を渡すこともできます。

```yaml
- insert:
    - id: workspace-discovery
      name: "dsh-plugin-workspace-discovery"
      config:
        roots: ["~/dev", "~/Documents"]
        maxDepth: 4
        exclude: ["vendor"]
        autoRegister: false
```

| 項目 | 既定値 | 意味 |
|---|---|---|
| `roots` | `[~]` | 走査するディレクトリ。`~` は展開され、相対パスは無視されます。 |
| `maxDepth` | `4` | 各ルートから何階層下まで探すか（0〜10）。 |
| `exclude` | `[]` | 組み込みの除外（`node_modules`、`.cache`、`.dsh`、`Library` 等）に追加するディレクトリ名。 |
| `autoRegister` | `false` | 起動時に未登録リポジトリをすべて1回だけ登録します。オプトイン方式です。 |

スキャンはシンボリックリンクを辿らず、見つけたリポジトリの内部には潜らないため、ネストしたチェックアウトが別々に報告されることはありません。分類はレジストリの正規化パスと突き合わせて行います。

macOS向けの安全策が2つあります。ホームディレクトリを通過するとき、macOSのプライバシー確認（TCC）で守られたフォルダ（`Documents`、`Downloads`、`Desktop`、`Pictures`、`Movies`、`Music`、`Library`）には入らないこと。バックグラウンドプロセスからの読み取りは、誰も答えられない確認ダイアログで止まってしまうことがあるためです。そこにリポジトリがある場合は、スキャンするフォルダとして明示してください（macOSに聞かれたらDSHホストのアクセスを許可してください）。もう1つは、走査自体を子プロセスで実行し、フォルダごとに25秒の上限を設けていることです。止まったり巨大だったりするツリーは、そのフォルダのエラーとして報告され、Harness全体を止めません。

## モデル向けツール

| ツール | 役割 |
|---|---|
| `workspace_discover` | スキャンして候補を `registered` フラグ付きで報告します。読み取り専用。`roots` / `max_depth` / `only_unregistered` で一時的に条件を変えられます。 |
| `workspace_register_discovered` | 指定した `paths` を登録するか、`all_unregistered: true` で未登録の全件を登録します。 |

## 多言語対応

パネルのUIは**英語・簡体字中国語・日本語**の辞書（`locale/`）を内蔵し、DSHの表示言語に追随します。辞書のキー集合が一致することはテストで担保しています。ツール名とJSONの契約は、呼び出し側が安定して照合できるよう英語で固定しています。

## ライセンス

MIT
