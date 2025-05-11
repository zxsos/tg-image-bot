# Tg-bot
[🌐 English README](README_en.md)  
如果觉得有用帮忙点个Star吧

## ✨ 功能特性

* **自动上传**: 直接向机器人发送图片或视频即可触发上传。
* **支持图片和视频**: 可以处理常见的图片格式和视频格式（作为视频文件或文档发送）。
* **配置灵活**: 通过 Cloudflare 环境变量和 Secrets 配置图床地址、Bot Token 和可选的认证信息，无需修改代码。
* **部署简单**: 基于 Cloudflare Workers，部署流程相对简单。
* **低成本**: 利用 Cloudflare 的免费套餐额度。
* **安全**: 敏感信息（如 Bot Token、认证代码）通过 Secrets 管理，更加安全。

## 🚀 工作原理

1. 用户在 Telegram 中向此机器人发送图片或视频。
2. Telegram 将包含文件信息的更新（Update）通过 Webhook 发送到 Cloudflare Worker 的 URL。
3. Cloudflare Worker 脚本被触发，解析收到的更新。
4. Worker 使用 Telegram Bot API 下载用户发送的文件。
5. Worker 将下载的文件上传到在环境变量 `IMG_BED_URL` 中配置的图床地址，（如果配置了 `AUTH_CODE`）会携带相应的认证参数。
6. Worker 解析图床返回的响应，提取公开的文件链接。
7. Worker 使用 Telegram Bot API 将获取到的文件链接发送回给用户。

## 🔧 环境要求

* **一个 Telegram Bot**: 需要通过 [BotFather](https://t.me/BotFather) 创建，并获取其 **Bot Token**。
* **一个图床/对象存储服务**:
  * 需要提供一个公开的 **文件上传接口 URL** (`IMG_BED_URL`)。
  * 如果该接口需要认证，需要获取相应的 **认证代码** (`AUTH_CODE`)。常见的简单图床可能通过 URL 参数或 Header 进行认证，本项目代码目前实现了通过 URL 参数 (`authCode`) 传递认证信息。
* **一个 Cloudflare 账户**: 免费账户即可开始。

## 🛠️ 部署与配置步骤

1. **创建 Telegram Bot**:
    * 在 Telegram 中与 [@BotFather](https://t.me/BotFather) 对话。
    * 发送 `/newbot` 命令，按照提示设置机器人的名称和用户名。
    * **记下 BotFather 返回的 `HTTP API token`**，这就是您的 `BOT_TOKEN`。

2. **准备图床信息**:
    * 确定您的图床或对象存储服务的**上传接口 URL** (例如 `https://your.domain/upload`)。这将是 `IMG_BED_URL` 的值。
    * 如果上传需要认证码，**获取该认证码**。这将是 `AUTH_CODE` 的值。如果不需要认证，则此项为空。

3. **Fork本项目**:
    * Fork本仓库。

4. **部署 CloudFlare Worker**:
    * *方法*： 登录 Cloudflare -> Workers & Pages -> 创建 -> 导入存储库选择刚刚fork的仓库 -> 填入部署命令```npx wrangler deploy``` -> 保存并部署

    * 部署成功后，Wrangler 会输出您的 Worker 的访问 URL，例如 `https://your-worker-name.your-subdomain.workers.dev`。**记下这个 URL**。

5. **配置环境变量 (关键步骤)**:
    您可以通过 Cloudflare Worker仪表板设置。**推荐使用密钥存储敏感信息**。

    * **设置`BOT_TOKEN`**:
        * *网页方法*: 登录 Cloudflare -> Workers & Pages -> 您的 Worker -> Settings -> Variables -> Add variable -> 输入 `BOT_TOKEN` -> 粘贴 Token -> **点击 "Encrypt"** -> Save。

    * **设置`AUTH_CODE`(选填)**:
        * *网页方法*: 类似 BOT_TOKEN，添加名为 `AUTH_CODE` 的变量，粘贴认证码，**点击 "Encrypt"** -> Save。

    * **设置`IMG_BED_URL`**:
        * *网页方法*: 登录 Cloudflare -> Workers & Pages -> 您的 Worker -> Settings -> Variables -> Add variable -> 输入 `IMG_BED_URL` -> 粘贴图床上传 URL -> Save。


6. **设置 Telegram Webhook**:
    * 需要告诉 Telegram 将机器人的更新发送到您刚刚部署的 Worker URL。
    * 打开浏览器，或者使用 `curl` 工具，访问以下链接（**请务必替换 `<YOUR_BOT_TOKEN>` 和 `<YOUR_WORKER_URL>`**）：

        ``` url
        https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook?url=<YOUR_WORKER_URL>
        ```

        例如:

        ``` url
        https://api.telegram.org/bot123456:ABC-DEF1234/setWebhook?url=https://my-tg-uploader.myusername.workers.dev
        ```

    * 如果浏览器显示 `{"ok":true,"result":true,"description":"Webhook was set"}` 或类似信息，则表示设置成功。

## 💬 如何使用

1. 在 Telegram 中搜索您创建的机器人的用户名，并开始对话。
2. 发送 `/start` 命令给机器人（通常只需要第一次）。
3. 发送 `/help` 命令可以查看简单的使用说明。
4. 直接发送一张**图片**或一个**视频文件**给机器人。
5. 等待片刻，机器人会将上传后的公开链接回复给您。

## 设置机器人命令菜单 (可选)

为了让用户在 Telegram 中更方便地使用 `/start` 和 `/help` 命令（例如通过点击输入框旁边的 `/` 按钮），您可以通过 BotFather 设置命令列表。这能提供命令提示，改善用户体验。

1. 在 Telegram 中再次与 [@BotFather](https://t.me/BotFather) 对话。
2. 发送 `/setcommands` 命令。
3. 按照提示，选择您刚刚部署配置好的机器人。
4. **直接发送以下文本**（确保命令和描述之间有空格和连字符，并且每个命令占一行，可以进行修改）：

    ``` cmd
    start - 启用机器人
    help - 查看帮助信息
    ```

5. 设置成功后，用户在与您的机器人对话时，点击 `/` 按钮就能看到这些预设的命令选项了。
