# Pre-commit 本地检查

Atlas 使用 Husky 触发 `lint-staged`，再调用 Python `pre-commit` 作为第二道本地门禁。

## 一次性安装

```bash
python3 -m pip install --user pre-commit
pre-commit install-hooks
```

Atlas 已经通过 Husky 的 `core.hooksPath=.husky` 接管 Git hook 入口，因此不需要运行
`pre-commit install`。提交时 `.husky/pre-commit` 会先执行 `lint-staged`，再调用
`pre-commit`。Husky 脚本会自动把 `python3 -m site --user-base` 下的 `bin` 目录加入
`PATH`。

如果终端提示找不到 `pre-commit`，把 Python 用户脚本目录加入 `PATH`。macOS 常见路径如下：

```bash
export PATH="$HOME/Library/Python/3.9/bin:$PATH"
```

## 手动运行

```bash
pre-commit run --all-files
```

## 提交时会检查什么

- 行尾空格、文件结尾、YAML/JSON/TOML 语法
- 合并冲突标记、大小写冲突、大文件、私钥和 AWS 凭据
- `detect-secrets` 敏感信息扫描
- `npm run lint -- --quiet`
- 修改依赖文件时运行 `npm audit --audit-level=high`

`npm run typecheck --workspace=server` 当前仍有既有类型债，暂不作为提交阻断项。等后续类型债治理完成后，再把它加入 pre-commit 或 CI required checks。

## 失败时怎么办

先阅读错误输出并修复对应问题。某些 hook 会自动修改文件，修改后需要重新 `git add` 再提交。
