# Tg-bot File Upload Assistant
[查看中文版说明 (Chinese README)](README.md)

If you find this useful, please give it a ⭐ Star!

## ✨ Key Features

*   **Automatic Uploads**: Send files directly to the bot to upload them.
*   **Multi-Format Support**: Handles images, videos, audio, SVGs, and various document types.
*   **Centralized Configuration**: All settings are managed via a single `CONFIG` environment variable (JSON format) in Cloudflare Workers.
*   **Simple Deployment**: Easy to deploy using Cloudflare Workers.



## 🔧 Prerequisites

*   **Telegram Bot Token**: Obtained by creating a bot алкоголь [@BotFather](https://t.me/BotFather).
*   **Image Host/Storage Upload API**:
    *   `IMG_BED_URL`: The API endpoint URL for your image host.
    *   `AUTH_CODE` (Optional): Authentication credential if your image host API requires it.
*   **Cloudflare Account**: For deploying the Worker.

## 🛠️ Deployment and Configuration Guide

1.  **Get Bot Token**:
    *   Chat with [@BotFather](https://t.me/BotFather) and send `/newbot`.
    *   Follow the prompts and note down the **HTTP API token**.

2.  **Prepare Image Host Information**:
    *   `IMG_BED_URL`: Your image host's upload API URL (e.g., `https://your.domain/upload`).
    *   `AUTH_CODE` (Optional): The authentication code for your image host's API.

3.  **Fork This Project**:
    *   Fork this repository on GitHub.

4.  **Deploy to Cloudflare Worker**:
    *   Log in to Cloudflare -> Workers & Pages -> Create application -> Connect to Git -> Select your forked repository.
    *   For "Build and deployments" settings: If your `worker.js` is in the root, usually no specific build command is needed. Deployment can be done via the Cloudflare dashboard or `npx wrangler deploy` if using Wrangler CLI.
    *   After successful deployment, note down the Worker's **access URL** (e.g., `https://your-worker.your-subdomain.workers.dev`).

5.  **Configure the `CONFIG` Environment Variable (Crucial Step)**:
    *   In your Cloudflare Worker dashboard: Your Worker -> Settings -> Variables -> Add variable.
    *   **Variable name**: `CONFIG`
    *   **Value (JSON format)**:
        ```json
        {
          "BOT_TOKEN": "paste_your_bot_token_here",
          "IMG_BED_URL": "paste_your_image_host_upload_url_here",
          "AUTH_CODE": "paste_auth_code_if_needed_or_empty_string_or_remove_this_line",
          "ADMIN_CHAT_ID": "optional_admin_telegram_chat_id_for_error_notifications"
        }
        ```
    *   Make sure to **check "Encrypt"** to protect sensitive information, then save.

6.  **Set Telegram Webhook**:
    *   Replace `<YOUR_BOT_TOKEN>` and `<YOUR_WORKER_URL>` in the link below:
        ```text
        https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook?url=<YOUR_WORKER_URL>
        ```
        Example:
        ```text
        https://api.telegram.org/bot123456:ABC-DEF1234/setWebhook?url=https://my-tg-uploader.zxsos.workers.dev
        ```
    *   Visit this link in your browser. If you see `{"ok":true,"result":true,"description":"Webhook was set"}`, it's successful.

## 💬 How to Use

1.  Find your bot in Telegram and start a conversation.
2.  Send `/start` (usually only needed the first time).
3.  Send `/help` to see usage instructions.
4.  Send an image, video, audio, SVG, or other document directly to the bot.
5.  The bot will automatically upload it and reply with the file link.

## 🤖 Set Bot Commands (Optional)

Enhance user experience via [@BotFather](https://t.me/BotFather):

1.  Send `/setcommands` to BotFather.
2.  Choose your bot.
3.  Send the following text (you can customize the descriptions):
    ```text
    start - 🚀 Activate the bot
    help - ❓ Get help
    ```
4.  Once done, users will see these preset commands when they type `/` in the chat.
