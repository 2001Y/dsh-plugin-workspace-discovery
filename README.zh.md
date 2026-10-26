# dsh-plugin-workspace-discovery

[English](README.md) | **简体中文** | [日本語](README.ja.md)

发现本地 Git 仓库，并把它们注册为 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）的工作区——一次全部完成，不必再逐个添加文件夹。

DSH 内置的添加方式只有一条路径：每次手动挑选一个目录。如果一台机器上放着几十个仓库（`~/dev`、`~/Documents` 等），其中大多数永远不会出现在侧边栏里，只因为没人逐个注册过。本插件补上这条缺失的链路，思路与 Hermes Agent 工作区选择器的 `repo_scan_roots` 发现机制相同：

- **扫描**：在可配置的根目录下查找 Git 仓库（`.git` 目录，或 worktree／子模块的 `.git` 文件）。
- **确认**：在侧边栏面板里查看结果——哪些已是工作区、哪些还不是——支持搜索、全选与逐行勾选。
- **注册**：把所选项（或全部未注册项）通过官方 `workspaceRegistry` API 注册。按目录幂等，重复扫描不会产生重复条目。
- 也可以交给智能体：模型工具 `workspace_discover` 与 `workspace_register_discovered` 在对话中提供同样的操作。

除非你主动开启 `autoRegister`，插件不会自动注册任何东西；它从不调用 `git` 子进程，也不直接写工作区文件——只驱动官方注册表，因此卸载插件后所有工作区都原样保留。

## 安装

```sh
dsh plugin --profile web add dsh-plugin-workspace-discovery
```

然后重启 web 配置并刷新页面。从本地检出安装：

```sh
git clone https://github.com/2001Y/dsh-plugin-workspace-discovery
dsh plugin --profile web add ./dsh-plugin-workspace-discovery
```

## 使用

点击侧边栏底部的 **发现项目**（徽标显示未注册仓库的数量）。在面板中：

1. 按需调整**扫描根目录**（每行一个绝对路径）与最大深度，然后**保存**。
2. 点击**扫描**（或重新扫描）查看列表。已注册的仓库带有标记，无法再次勾选。
3. 点击**注册所选**，或**注册全部未注册项**。

## 配置

设置保存在宿主共享文件 `$DSH_HOME/workspace-discovery.config.json` 中，同一 DSH 宿主的所有浏览器共享。面板会编辑此文件；也可以在配置的 patch 行中预置初始值：

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

| 字段 | 默认值 | 说明 |
|---|---|---|
| `roots` | `[~]` | 要遍历的目录。`~` 会展开；相对路径会被忽略。 |
| `maxDepth` | `4` | 在每个根目录下向下查找的深度（0–10）。 |
| `exclude` | `[]` | 在内置排除项（`node_modules`、`.cache`、`.dsh`、`Library` 等）之外额外跳过的目录名。 |
| `autoRegister` | `false` | 启动时把全部未注册仓库注册一次。必须主动开启。 |

扫描从不跟随符号链接，不进入已发现的仓库内部（因此嵌套检出不会被重复报告），并按注册表的规范路径进行分类。

针对 macOS 有两项安全措施。其一：遍历主目录时，不会进入受 TCC 隐私确认保护的文件夹（`Documents`、`Downloads`、`Desktop`、`Pictures`、`Movies`、`Music`、`Library`）——后台进程读取这些文件夹可能会卡在一个无人应答的确认对话框上。如果仓库放在这些文件夹里，请将其显式列为扫描根目录（若 macOS 询问，请允许 DSH 宿主访问）。其二：扫描在子进程中执行，每个根目录有 25 秒超时，因此被卡住或过大的目录树只会让该根目录报错，而不会拖住整个 Harness。

## 模型工具

| 工具 | 作用 |
|---|---|
| `workspace_discover` | 扫描并报告候选（含 `registered` 标记）。只读。可临时指定 `roots` / `max_depth` / `only_unregistered`。 |
| `workspace_register_discovered` | 注册指定的 `paths`，或以 `all_unregistered: true` 注册全部未注册项。 |

## 国际化

面板 UI 内置**英语、简体中文、日语**三套词典（`locale/`），跟随 DSH 当前显示语言，测试保证三套词典键集合一致。工具名与 JSON 契约保持英语，以便调用方稳定匹配。

## 许可证

MIT
