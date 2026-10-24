# Push Astra

输入栏里的「继续」按钮。会话跑到一半停下来，或者回答完了你还想让它接着往下做，点一下这枚按钮，它就替你在当前会话里发一条「继续」。省掉把手指移回键盘、再打两个字、再按回车这一段。

App 只做一件事：一次点击发一条消息。不判断回复有没有卡住，不等待结果，不重发，也不会把消息发到别的会话去。

## 它长什么样

输入栏左侧工具按钮与右侧模型 / 发送控制之间，有一枚只有图标的按钮。图标是你选定的 Lucide **Hand** 手掌，线宽为 2，宿主按 14×14px 显示。悬停提示是「在当前会话发送「继续」，让它接着往下干」。不占文字宽度；输入栏变窄时，宿主会把它收进 `…` 溢出菜单，行为不变。

按钮图标是 App 自带的 `ui/icons/continue.svg`，来自 Lucide 1.55.0，ISC 许可证附在同目录。清单顶层的 `assets/icon.png` 是扩展列表里的 App 身份图：像素风角色背对镜头，一只手推在她后背。两者不是同一张。

## 权限

清单只申请三项，没有网络权限：

- `app/input.status` — 在输入栏显示这枚按钮，并让宿主把点击派给本 App 的工具。
- `app/sessions.manage` — 需要 `scope: "all"` 才能向不属于本 App 的会话写入；当前会话就不是本 App 的会话，所以这一项跑不掉。
- `app/session.start-turn` — `session:send` 必然把内容送进模型，起一轮对话就要这项授权。

三项都在设置窗「安全」页的「应用能力」面板里，一应用一行，默认关闭，需要你自己打开。少任何一项，点击都会被宿主整单拒绝，错误信息会点名缺哪一项；App 不会退回到"看起来成功了"。

## 在 Astra Agent 里启用

1. 在 App Manager 里安装本目录（或打包后的 zip），通过审核后读一下实际安装结果。
2. 打开设置 →「应用能力」，给 `hana-push-astra` 打开上面三项。
3. 在目标 Agent 的启用列表里勾上本 App。按钮只在这个 Agent 名下的会话里出现。
4. 需要刷新界面时，通过 Builder 或 App Manager 显式重载。

## 点下去之后发生什么

宿主把它当普通 UI 动作执行本 App 注册的 `continue_session`，并在工具参数的 `context` 里带上点击所在会话的稳定 `sessionId`（`messageId` 恒为 `null`）。App 拿这个 id 调一次：

```js
await sdk.sessions.send({ sessionId, scope: "all", text: "继续" });
```

然后给 UI 回一行简短的文本结果。

- **会话正在流式输出**：不指定 `deliverAs`，宿主按目标实时状态选路。正在跑回合就作为 steer 插进当前回合；回合已经在收尾、没有 steering checkpoint 时就排到本回合结束后再投。点一次不会把正在回答的那一轮打断重来。
- **会话空闲**：起一个新回合。
- **回包 `accepted: true`** 只表示宿主接纳了这条消息（已进回合或已排队），不代表 Agent 已经读到。要看它有没有继续做事，看后续产出。
- **拿不到 `sessionId`**：直接抛错，不发送。App 不读全局焦点猜当前会话，也不会拿 `sessionPath` 顶替 id —— 把「继续」发进一个你没点的会话，比一个看得见的报错更糟。
- 不自动重试，不自动循环。失败就是失败，要再来一次就再点一下。

`continue_session` 是一个普通工具注册，所以它会进入工具注册表；但模型侧调用要 `app/tools.expose-to-model`，本 App 没申请这项，模型那条路永远是关的。按钮走的 UI 通道（`server/routes/plugins-v2-ui-actions.ts`）只核对该 App 已加载、工具归属、会话真实存在这几道门，不查 expose-to-model，所以少申请它不影响按钮。

## 目录

```
manifest.json          清单：inputStatus 一项、三项权限、顶层身份图
index.js               默认导出 defineApp(...)，注册 continue_session
ui/icons/continue.svg  输入栏按钮图标（Lucide Hand，随包分发）
ui/icons/LICENSE.lucide 按钮图标的 ISC 许可证
assets/icon.png        像素风 App 身份图
test/                  node --test，跑真实的 define 回调
sdk/                   官方 bundler 提供的 App SDK，原样保留，不要手改
```

## 验证

只跑本目录的单元测试，不需要 Hana 运行时、不需要 `npm install`（没有运行时依赖）：

```sh
node --check index.js
node --test
```

测试加载**真实的** `index.js` 默认导出，用最小假的 entry context 走完 `defineApp` 的 SDK 装配，然后：

1. 断言注册的工具名叫 `continue_session`，参数是空对象 schema，描述写清"一次"；
2. 执行工具，断言 `sdk.sessions.send` 恰好被调用一次，收到的是 `{ sessionId: 当前 context 的 id, scope: "all", text: "继续" }`；
3. 去掉 `sessionId` 再执行，断言抛错、零发送，`sessionPath` 没被当成替代品。

宿主行为（权限核对、steer / 排队选路）不在这层测，也不该在这里测——那属于 Hana 自己的契约。

静态包校验与隔离 smoke 需要一份 Hana checkout（下面按仓库根目录写法）：

```sh
node scripts/validate-app.mjs --dir /path/to/hana-push-astra --json
node scripts/validate-app.mjs --dir /path/to/hana-push-astra --smoke --json
```

`--smoke` 在隔离环境里起一个后端进程跑真实装载，不碰正式安装的 Hana。静态校验会实际检查 `ui/icons/continue.svg`。文件缺失会使清单校验失败；包含不安全内容或不是可解码的静态 SVG 会以 `INVALID_INPUT_STATUS_ICON` 失败。

## 卸载

在 App Manager 里停用或卸载即可。撤销那三项授权会立刻让按钮消失并清掉条目；已经发出去的「继续」不会因此从会话历史里消失。
