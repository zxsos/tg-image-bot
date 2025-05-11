# Tg-bot

If you find it useful, please give it a Star!

## ✨ Features

*   **Automatic Upload**: Sending images or videos directly to the bot triggers the upload.
*   **Supports Images and Videos**: Can handle common image and video formats (sent as video files or documents).
*   **Flexible Configuration**: Configure image hosting service URL, Bot Token, and optional authentication information via Cloudflare environment variables and Secrets, no code modification needed.
*   **Simple Deployment**: Based on Cloudflare Workers, the deployment process is relatively simple.
*   **Low Cost**: Utilizes Cloudflare's free tier.
*   **Secure**: Sensitive information (like Bot Token, authentication code) is managed via Secrets for enhanced security.

## 🚀 How It Works

1.  User sends an image or video to this bot in Telegram.
2.  Telegram sends an update containing file information via Webhook to the Cloudflare Worker's URL.
3.  The Cloudflare Worker script is triggered and parses the received update.
4.  The Worker uses the Telegram Bot API to download the file sent by the user.
5.  The Worker uploads the downloaded file to the image hosting service URL configured in the `IMG_BED_URL` environment variable, carrying corresponding authentication parameters if `AUTH_CODE` is configured.
6.  The Worker parses the response from the image hosting service and extracts the public file link.
7.  The Worker uses the Telegram Bot API to send the obtained file link back to the user.

## 🔧 Prerequisites

*   **A Telegram Bot**: Needs to be created via [BotFather](https://t.me/BotFather) to obtain its **Bot Token**.
*   **An Image Hosting/Object Storage Service**:
    *   Requires a public **file upload API URL** (`IMG_BED_URL`).
    *   If the API requires authentication, you need the corresponding **authentication code** (`AUTH_CODE`). Common simple image hosts might authenticate via URL parameters or Headers; this project currently implements authentication via a URL parameter (`authCode`).
*   **A Cloudflare Account**: A free account is sufficient to get started.

## 🛠️ Deployment and Configuration Steps

1.  **Create Telegram Bot**:
    *   Chat with [@BotFather](https://t.me/BotFather) in Telegram.
    *   Send the `/newbot` command and follow the prompts to set your bot's name and username.
    *   **Note down the `HTTP API token` returned by BotFather**. This is your `BOT_TOKEN`.

2.  **Prepare Image Hosting Information**:
    *   Determine your image hosting or object storage service's **upload API URL** (e.g., `https://your.domain/upload`). This will be the value for `IMG_BED_URL`.
    *   If uploading requires an authentication code, **obtain this code**. This will be the value for `AUTH_CODE`. If no authentication is needed, leave this empty.

3.  **Fork This Project**:
    *   Fork this repository.

4.  **Deploy Cloudflare Worker**:
    *   *Method*: Log in to Cloudflare -> Workers & Pages -> Create application -> Import repository (select the forked repo) -> Enter `npx wrangler deploy` as the deploy command -> Save and deploy.
    *   After successful deployment, Wrangler (or the Cloudflare dashboard) will provide your Worker's access URL, e.g., `https://your-worker-name.your-subdomain.workers.dev`. **Note down this URL**.

5.  **Configure Environment Variables (Crucial Step)**:
    You can set these via the Cloudflare Worker dashboard. **It is recommended to use Secrets for sensitive information**.

    *   **Set `BOT_TOKEN`**:
        *   *Dashboard Method*: Log in to Cloudflare -> Workers & Pages -> Your Worker -> Settings -> Variables -> Add variable -> Enter `BOT_TOKEN` for "Variable name" -> Paste your Token for "Value" -> **Click "Encrypt"** -> Save.

    *   **Set `AUTH_CODE` (Optional)**:
        *   *Dashboard Method*: Similar to `BOT_TOKEN`, add a variable named `AUTH_CODE`, paste the authentication code, **click "Encrypt"** -> Save.

    *   **Set `IMG_BED_URL`**:
        *   *Dashboard Method*: Log in to Cloudflare -> Workers & Pages -> Your Worker -> Settings -> Variables -> Add variable -> Enter `IMG_BED_URL` for "Variable name" -> Paste your image host upload URL for "Value" -> Save.

6.  **Set Telegram Webhook**:
    *   You need to tell Telegram to send bot updates to your newly deployed Worker URL.
    *   Open your browser, or use a tool like `curl`, and visit the following URL (**be sure to replace `<YOUR_BOT_TOKEN>` and `<YOUR_WORKER_URL>`**):

        ``` url
        https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook?url=<YOUR_WORKER_URL>
        ```

        For example:

        ``` url
        https://api.telegram.org/bot123456:ABC-DEF1234/setWebhook?url=https://my-tg-uploader.myusername.workers.dev
        ```

    *   If the browser displays `{"ok":true,"result":true,"description":"Webhook was set"}` or similar, the setup was successful.

## 💬 How to Use

1.  Search for your bot's username in Telegram and start a chat.
2.  Send the `/start` command to the bot (usually only needed the first time).
3.  Send the `/help` command to see simple usage instructions.
4.  Directly send an **image** or a **video file** to the bot.
5.  Wait a moment, and the bot will reply with the public link of the uploaded file.

## Set Bot Command Menu (Optional)

To make it easier for users to use `/start` and `/help` commands in Telegram (e.g., by clicking the `/` button next to the input field), you can set up a command list via BotFather. This provides command suggestions and improves user experience.

1.  Chat with [@BotFather](https://t.me/BotFather) again in Telegram.
2.  Send the `/setcommands` command.
3.  Follow the prompts and select the bot you just deployed and configured.
4.  **Send the following text directly** (ensure there's a space and a hyphen between the command and its description, and each command is on a new line; you can modify this):

    ``` cmd
    start - Activate the bot
    help - View help information
    ```

5.  After successful setup, when users chat with your bot, they will see these preset command options when they click the `/` button.